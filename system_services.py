"""
System Services & Daemon Monitoring Service.
Monitors systemd user and system services with real-time CPU usage,
RAM consumption, active/sub states, and management actions (restart/start/stop).
"""

import os
import re
import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import psutil
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/services", tags=["services"])


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------
class ServiceItem(BaseModel):
    unit: str
    name: str
    description: str = ""
    scope: str = "user"  # "user" | "system"
    load_state: str = "loaded"
    active_state: str = "active"
    sub_state: str = "running"
    main_pid: int = 0
    memory_bytes: int = 0
    memory_percent: float = 0.0
    memory_formatted: str = "0 B"
    cpu_percent: float = 0.0
    cpu_usage_nsec: int = 0


class ServicesOverview(BaseModel):
    total_services: int = 0
    running_services: int = 0
    failed_services: int = 0
    user_services: int = 0
    system_services: int = 0
    total_memory_bytes: int = 0
    total_memory_formatted: str = "0 B"


class ServicesResponse(BaseModel):
    services: List[ServiceItem] = Field(default_factory=list)
    overview: ServicesOverview
    timestamp: str


class ServiceActionRequest(BaseModel):
    action: str = "restart"  # "restart" | "start" | "stop"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def format_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    elif n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    elif n < 1024 * 1024 * 1024:
        return f"{n / (1024 * 1024):.1f} MB"
    else:
        return f"{n / (1024 * 1024 * 1024):.2f} GB"


# ---------------------------------------------------------------------------
# Systemd Services Collector Service
# ---------------------------------------------------------------------------
class SystemServicesManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._last_cpu_samples: Dict[Tuple[str, str], Tuple[float, int]] = {}
        # (scope, unit) -> (timestamp, cpu_usage_nsec)
        self._cached_services: List[ServiceItem] = []
        self._cached_overview = ServicesOverview()
        self._running = True

        # Initial collection
        self._refresh()

        # Background polling loop
        self._thread = threading.Thread(target=self._background_loop, daemon=True)
        self._thread.start()

    def _background_loop(self):
        while self._running:
            time.sleep(2.5)
            try:
                self._refresh()
            except Exception:
                pass

    def _query_units(self, user: bool) -> List[Dict[str, str]]:
        cmd = ["systemctl"]
        if user:
            cmd.append("--user")
        cmd.extend(["list-units", "--type=service", "--all", "--no-pager", "--plain", "--no-legend"])
        try:
            out = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL)
        except Exception:
            return []

        results = []
        for line in out.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split(None, 4)
            if len(parts) >= 4:
                unit, load, active, sub = parts[0], parts[1], parts[2], parts[3]
                if not unit.endswith(".service"):
                    continue
                desc = parts[4] if len(parts) > 4 else ""
                results.append(
                    {
                        "unit": unit,
                        "name": unit[:-8] if unit.endswith(".service") else unit,
                        "load": load,
                        "active": active,
                        "sub": sub,
                        "desc": desc,
                        "scope": "user" if user else "system",
                    }
                )
        return results

    def _batch_show(self, units: List[str], user: bool) -> Dict[str, Dict[str, str]]:
        if not units:
            return {}
        cmd = ["systemctl"]
        if user:
            cmd.append("--user")
        cmd.extend(["show"] + units + ["-p", "Id,MainPID,MemoryCurrent,CPUUsageNSec,ActiveState,SubState"])

        props_map: Dict[str, Dict[str, str]] = {}
        try:
            out = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL)
            blocks = out.strip().split("\n\n")
            for b in blocks:
                d = dict(line.split("=", 1) for line in b.splitlines() if "=" in line)
                uid = d.get("Id")
                if uid:
                    props_map[uid] = d
        except Exception:
            pass
        return props_map

    def _refresh(self):
        now = time.time()
        total_ram = psutil.virtual_memory().total or 1

        user_units = self._query_units(user=True)
        system_units = self._query_units(user=False)

        # Batch show for user and system units
        user_names = [u["unit"] for u in user_units]
        system_names = [u["unit"] for u in system_units]

        user_props = self._batch_show(user_names, user=True)
        system_props = self._batch_show(system_names, user=False)

        services: List[ServiceItem] = []
        new_cpu_samples: Dict[Tuple[str, str], Tuple[float, int]] = {}

        def process_units(unit_list: List[Dict[str, str]], props_map: Dict[str, Dict[str, str]], scope: str):
            for u in unit_list:
                unit = u["unit"]
                props = props_map.get(unit, {})
                active_state = props.get("ActiveState") or u["active"]
                sub_state = props.get("SubState") or u["sub"]

                main_pid = 0
                try:
                    main_pid = int(props.get("MainPID") or 0)
                except ValueError:
                    main_pid = 0

                # Memory
                mem_bytes = 0
                mem_raw = props.get("MemoryCurrent")
                if mem_raw and mem_raw.isdigit() and mem_raw != "18446744073709551615":
                    mem_bytes = int(mem_raw)
                elif main_pid > 0:
                    try:
                        p = psutil.Process(main_pid)
                        mem_bytes = p.memory_info().rss
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass

                mem_pct = round((mem_bytes / total_ram) * 100, 1)

                # CPU usage in nsec
                cpu_nsec = 0
                cpu_raw = props.get("CPUUsageNSec")
                if cpu_raw and cpu_raw.isdigit() and cpu_raw != "18446744073709551615":
                    cpu_nsec = int(cpu_raw)

                # CPU % calculation via delta
                cpu_pct = 0.0
                sample_key = (scope, unit)
                if cpu_nsec > 0:
                    new_cpu_samples[sample_key] = (now, cpu_nsec)
                    if sample_key in self._last_cpu_samples:
                        prev_time, prev_nsec = self._last_cpu_samples[sample_key]
                        dt = max(now - prev_time, 0.001)
                        if cpu_nsec >= prev_nsec:
                            delta_nsec = cpu_nsec - prev_nsec
                            cpu_pct = round((delta_nsec / (dt * 1e9)) * 100, 1)
                elif main_pid > 0:
                    # Fallback to psutil process CPU if available
                    try:
                        p = psutil.Process(main_pid)
                        cpu_pct = round(p.cpu_percent(interval=None), 1)
                    except Exception:
                        pass

                services.append(
                    ServiceItem(
                        unit=unit,
                        name=u["name"],
                        description=u["desc"],
                        scope=scope,
                        load_state=u["load"],
                        active_state=active_state,
                        sub_state=sub_state,
                        main_pid=main_pid,
                        memory_bytes=mem_bytes,
                        memory_percent=mem_pct,
                        memory_formatted=format_bytes(mem_bytes),
                        cpu_percent=cpu_pct,
                        cpu_usage_nsec=cpu_nsec,
                    )
                )

        process_units(user_units, user_props, "user")
        process_units(system_units, system_props, "system")

        # Compute overview stats
        running_cnt = sum(1 for s in services if s.active_state == "active" or s.sub_state == "running")
        failed_cnt = sum(1 for s in services if s.active_state == "failed")
        user_cnt = sum(1 for s in services if s.scope == "user")
        sys_cnt = sum(1 for s in services if s.scope == "system")
        total_mem = sum(s.memory_bytes for s in services)

        with self._lock:
            self._last_cpu_samples = new_cpu_samples
            self._cached_services = services
            self._cached_overview = ServicesOverview(
                total_services=len(services),
                running_services=running_cnt,
                failed_services=failed_cnt,
                user_services=user_cnt,
                system_services=sys_cnt,
                total_memory_bytes=total_mem,
                total_memory_formatted=format_bytes(total_mem),
            )

    def get_services(
        self,
        scope: str = "all",  # "all" | "user" | "system"
        state: str = "all",  # "all" | "running" | "failed" | "inactive"
        sort_by: str = "cpu",  # "cpu" | "memory" | "ram" | "name" | "status" | "pid"
        order: str = "desc",
        limit: int = 150,
        search: Optional[str] = None,
    ) -> ServicesResponse:
        with self._lock:
            services_copy = list(self._cached_services)
            overview_copy = self._cached_overview

        # Filter by scope
        if scope.lower() in ("user", "system"):
            services_copy = [s for s in services_copy if s.scope == scope.lower()]

        # Filter by state
        st = state.lower()
        if st == "running":
            services_copy = [s for s in services_copy if s.active_state == "active" or s.sub_state == "running"]
        elif st == "failed":
            services_copy = [s for s in services_copy if s.active_state == "failed"]
        elif st == "inactive":
            services_copy = [s for s in services_copy if s.active_state != "active"]

        # Filter by search
        if search:
            q = search.lower().strip()
            services_copy = [
                s
                for s in services_copy
                if q in s.name.lower()
                or q in s.unit.lower()
                or q in s.description.lower()
                or q in str(s.main_pid)
            ]

        # Sort
        reverse = order.lower() == "desc"
        sort_key = sort_by.lower()

        if sort_key == "cpu":
            services_copy.sort(key=lambda s: s.cpu_percent, reverse=reverse)
        elif sort_key in ("memory", "ram", "mem"):
            services_copy.sort(key=lambda s: s.memory_bytes, reverse=reverse)
        elif sort_key == "name":
            services_copy.sort(key=lambda s: s.name.lower(), reverse=reverse)
        elif sort_key == "pid":
            services_copy.sort(key=lambda s: s.main_pid, reverse=reverse)
        elif sort_key == "status":
            services_copy.sort(key=lambda s: (s.active_state, s.sub_state), reverse=reverse)
        else:
            services_copy.sort(key=lambda s: s.cpu_percent, reverse=reverse)

        if limit > 0:
            services_copy = services_copy[:limit]

        return ServicesResponse(
            services=services_copy,
            overview=overview_copy,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    def service_action(self, scope: str, unit: str, action: str) -> Dict[str, Any]:
        if not re.match(r"^[a-zA-Z0-9@_.\-]+$", unit):
            raise HTTPException(status_code=400, detail="Invalid unit name")

        action = action.lower()
        if action not in ("restart", "start", "stop"):
            raise HTTPException(status_code=400, detail="Action must be 'restart', 'start', or 'stop'")

        cmd = ["systemctl"]
        if scope == "user":
            cmd.append("--user")
        cmd.extend([action, unit])

        try:
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            # Trigger refresh in background
            threading.Thread(target=self._refresh, daemon=True).start()
            return {
                "success": True,
                "message": f"Successfully performed '{action}' on {unit} ({scope})",
            }
        except subprocess.CalledProcessError as e:
            err = (e.stderr or e.stdout or "Command failed").strip()
            raise HTTPException(status_code=500, detail=f"Failed to {action} {unit}: {err}")


services_manager = SystemServicesManager()


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------
@router.get("", response_model=ServicesResponse)
def list_services(
    scope: str = Query("all", description="Scope: all, user, system"),
    state: str = Query("all", description="State: all, running, failed, inactive"),
    sort_by: str = Query("cpu", description="Sort field: cpu, memory, name, pid, status"),
    order: str = Query("desc", description="Sort order: desc or asc"),
    limit: int = Query(150, ge=1, le=500, description="Max services to return"),
    search: Optional[str] = Query(None, description="Search keyword for name, unit, description, or PID"),
):
    return services_manager.get_services(
        scope=scope, state=state, sort_by=sort_by, order=order, limit=limit, search=search
    )


@router.post("/{scope}/{unit}/action")
def service_action(scope: str, unit: str, req: ServiceActionRequest):
    return services_manager.service_action(scope=scope, unit=unit, action=req.action)
