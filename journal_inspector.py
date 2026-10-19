"""System Journal & Kernel Watcher: Host logs, PSI Pressure Stalls & OOM Watcher."""

import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/journal", tags=["journal"])

PRIORITY_NAMES = {
    0: "emerg",
    1: "alert",
    2: "crit",
    3: "err",
    4: "warning",
    5: "notice",
    6: "info",
    7: "debug",
}


def parse_journal_entry(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a raw JSON log entry from journalctl."""
    # Priority
    p_num = 6
    try:
        p_num = int(raw.get("PRIORITY", 6))
    except (ValueError, TypeError):
        p_num = 6
    p_label = PRIORITY_NAMES.get(p_num, "info")

    # Timestamp from __REALTIME_TIMESTAMP (microseconds)
    ts_iso = ""
    rt_ts = raw.get("__REALTIME_TIMESTAMP")
    if rt_ts:
        try:
            sec = int(rt_ts) / 1_000_000.0
            ts_iso = datetime.fromtimestamp(sec, tz=timezone.utc).isoformat()
        except Exception:
            ts_iso = str(rt_ts)

    # Unit / process identifier
    unit = (
        raw.get("_SYSTEMD_USER_UNIT")
        or raw.get("USER_UNIT")
        or raw.get("SYSLOG_IDENTIFIER")
        or raw.get("_COMM")
        or "system"
    )

    pid = None
    if raw.get("_PID"):
        try:
            pid = int(raw["_PID"])
        except ValueError:
            pass

    message = raw.get("MESSAGE", "")
    if isinstance(message, list):
        message = bytes(message).decode("utf-8", errors="replace")

    return {
        "timestamp": ts_iso,
        "priority_num": p_num,
        "priority_label": p_label,
        "unit": unit,
        "pid": pid,
        "message": str(message),
    }


def get_kernel_pressure_stats() -> Dict[str, Any]:
    """Read kernel OOM kill counters and PSI (Pressure Stall Information) metrics."""
    oom_count = 0
    vmstat_path = Path("/proc/vmstat")
    if vmstat_path.exists():
        try:
            for line in vmstat_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.startswith("oom_kill "):
                    oom_count = int(line.split()[1])
                    break
        except Exception:
            pass

    def parse_psi_file(name: str) -> Dict[str, Dict[str, float]]:
        res: Dict[str, Dict[str, float]] = {}
        p = Path(f"/proc/pressure/{name}")
        if p.exists():
            try:
                for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
                    parts = line.split()
                    if not parts:
                        continue
                    kind = parts[0]
                    vals = {}
                    for item in parts[1:]:
                        if "=" in item:
                            k, v = item.split("=", 1)
                            vals[k] = float(v) if "." in v else float(int(v))
                    res[kind] = vals
            except Exception:
                pass
        return res

    mem_psi = parse_psi_file("memory")
    cpu_psi = parse_psi_file("cpu")
    io_psi = parse_psi_file("io")

    return {
        "oom_kill_count": oom_count,
        "memory_pressure": mem_psi,
        "cpu_pressure": cpu_psi,
        "io_pressure": io_psi,
    }


@router.get("/logs")
async def get_journal_logs(
    scope: str = Query("user", pattern="^(user|system)$"),
    unit: Optional[str] = None,
    priority: Optional[str] = Query(None, pattern="^(emerg|alert|crit|err|warning|notice|info|debug)$"),
    search: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
):
    """Retrieve filtered host logs from systemd journalctl with JSON serialization."""
    if not shutil.which("journalctl"):
        return {"logs": [], "total": 0, "scope": scope}

    cmd = ["journalctl"]
    if scope == "user":
        cmd.append("--user")

    cmd.extend(["-o", "json", "-n", str(limit), "--no-pager"])

    if unit:
        cmd.extend(["-u", unit])
    if priority:
        cmd.extend(["-p", priority])
    if search:
        cmd.extend(["-g", search])

    logs = []
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=8)
        if proc.stdout:
            for line in proc.stdout.strip().splitlines():
                if line.strip():
                    try:
                        raw = json.loads(line)
                        logs.append(parse_journal_entry(raw))
                    except Exception:
                        pass
    except Exception:
        pass

    # Reverse to return newest log entries first for dashboard viewing
    logs.reverse()

    return {
        "logs": logs,
        "total": len(logs),
        "scope": scope,
        "unit": unit,
        "priority": priority,
    }


@router.get("/kernel")
async def get_kernel_status():
    """Retrieve OOM events, kernel health, and Linux PSI pressure stalls."""
    stats = get_kernel_pressure_stats()
    return stats
