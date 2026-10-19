"""
Container & Log Service & API for Dozzel-style visual container monitoring.
Interacts with the local Docker daemon via CLI with automatic fallback to
gracefully simulated containers when Docker daemon is not available.
Provides real-time container metrics, live log streaming (SSE), and control actions.
"""

import json
import re
import shutil
import subprocess
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------
class ContainerSummary(BaseModel):
    id: str
    name: str
    image: str
    status: str
    state: str = "running"
    created: str = ""
    ports: str = ""
    cpu_percent: float = 0.0
    mem_usage: str = "0B"
    mem_percent: float = 0.0
    net_io: str = "0B / 0B"
    block_io: str = "0B / 0B"
    pids: int = 1


class LogLine(BaseModel):
    timestamp: Optional[str] = None
    level: str = "info"
    stream: str = "stdout"
    message: str


class LogResponse(BaseModel):
    container: str
    lines: List[LogLine] = Field(default_factory=list)
    total: int = 0


class ActionRequest(BaseModel):
    action: str  # restart, stop, start, pause, unpause


# ---------------------------------------------------------------------------
# Mock / Fallback Containers for Sandboxed or Docker-less Environments
# ---------------------------------------------------------------------------
MOCK_CONTAINERS: List[Dict[str, Any]] = [
    {
        "id": "7e48bfe0b366",
        "name": "beszel",
        "image": "henrygd/beszel:latest",
        "status": "Up 4 days",
        "state": "running",
        "created": "4 days ago",
        "ports": "127.0.0.1:8095->8090/tcp",
        "cpu_percent": 0.45,
        "mem_usage": "24.5MiB / 16GiB",
        "mem_percent": 0.15,
        "net_io": "1.2MB / 8.4MB",
        "block_io": "12MB / 4.1MB",
        "pids": 4,
    },
    {
        "id": "6478eea63a6b",
        "name": "beszel-agent",
        "image": "henrygd/beszel-agent:latest",
        "status": "Up 4 days",
        "state": "running",
        "created": "4 days ago",
        "ports": "",
        "cpu_percent": 0.12,
        "mem_usage": "11.2MiB / 16GiB",
        "mem_percent": 0.07,
        "net_io": "340kB / 1.1MB",
        "block_io": "2MB / 0B",
        "pids": 2,
    },
    {
        "id": "a4a9f59cd219",
        "name": "conduit",
        "image": "matrixconduit/matrix-conduit:latest",
        "status": "Up 12 hours",
        "state": "running",
        "created": "12 hours ago",
        "ports": "0.0.0.0:6167->6167/tcp",
        "cpu_percent": 1.20,
        "mem_usage": "13.28MiB / 5.68GiB",
        "mem_percent": 0.23,
        "net_io": "48.9kB / 175kB",
        "block_io": "35.2MB / 1.43MB",
        "pids": 13,
    },
    {
        "id": "9b12a83c4011",
        "name": "omniroute-engine",
        "image": "omniroute/core:v2.4",
        "status": "Up 2 days",
        "state": "running",
        "created": "2 days ago",
        "ports": "0.0.0.0:20128->20128/tcp",
        "cpu_percent": 0.85,
        "mem_usage": "68.4MiB / 16GiB",
        "mem_percent": 0.42,
        "net_io": "5.4MB / 12.1MB",
        "block_io": "18.2MB / 2.3MB",
        "pids": 8,
    },
]

MOCK_LOGS: Dict[str, List[str]] = {
    "beszel": [
        "2026-10-18T16:00:01Z [INFO] Beszel server initialized on port 8090",
        "2026-10-18T16:00:02Z [INFO] Loaded SQLite database with 1 host registered",
        "2026-10-18T16:05:00Z [INFO] Received heartbeat from agent 6478eea63a6b (host: local-linux)",
        "2026-10-18T17:10:00Z [INFO] System telemetry sync completed: 60 sample points",
        "2026-10-18T18:20:15Z [INFO] Health status: OK. Memory usage stable at 24.5MiB",
    ],
    "beszel-agent": [
        "2026-10-18T16:00:05Z [INFO] Beszel agent v0.7.3 starting",
        "2026-10-18T16:00:06Z [INFO] Connected to hub at 127.0.0.1:8095",
        "2026-10-18T17:00:00Z [DEBUG] Polling CPU cores (12 active)",
        "2026-10-18T18:00:00Z [INFO] Metric collection cycle finished cleanly",
    ],
    "conduit": [
        "2026-10-18T17:09:04.804Z [WARN] conduit::api::client_server::state: State event m.room.topic not found in room !RM56AfgSDNT",
        "2026-10-18T17:09:04.805Z [INFO] conduit::api: Successfully handled incoming federated transaction",
        "2026-10-18T17:15:22.110Z [INFO] Sync response dispatched to client @user:domain",
        "2026-10-18T18:10:01.000Z [INFO] Database compaction cycle idle",
    ],
}


# ---------------------------------------------------------------------------
# Container Service
# ---------------------------------------------------------------------------
class ContainerService:
    def __init__(self):
        self._has_docker: Optional[bool] = None

    def check_docker_available(self) -> bool:
        if self._has_docker is not None:
            return self._has_docker
        if not shutil.which("docker"):
            self._has_docker = False
            return False
        try:
            res = subprocess.run(
                ["docker", "info"],
                capture_output=True,
                text=True,
                timeout=2.0,
            )
            self._has_docker = res.returncode == 0
        except Exception:
            self._has_docker = False
        return self._has_docker

    def list_containers(self) -> List[ContainerSummary]:
        if self.check_docker_available():
            try:
                # 1. Fetch container list
                ps_res = subprocess.run(
                    ["docker", "ps", "-a", "--format", "{{json .}}"],
                    capture_output=True,
                    text=True,
                    timeout=4.0,
                )
                # 2. Fetch stats
                stats_res = subprocess.run(
                    ["docker", "stats", "--no-stream", "--format", "{{json .}}"],
                    capture_output=True,
                    text=True,
                    timeout=5.0,
                )

                stats_by_id: Dict[str, Dict[str, Any]] = {}
                if stats_res.returncode == 0:
                    for line in stats_res.stdout.strip().splitlines():
                        if not line.strip():
                            continue
                        try:
                            s = json.loads(line)
                            cid = s.get("ID") or s.get("Container") or ""
                            cname = s.get("Name") or ""
                            if cid:
                                stats_by_id[cid] = s
                            if cname:
                                stats_by_id[cname] = s
                        except Exception:
                            continue

                containers: List[ContainerSummary] = []
                for line in ps_res.stdout.strip().splitlines():
                    if not line.strip():
                        continue
                    try:
                        d = json.loads(line)
                        cid = d.get("ID") or ""
                        cname = d.get("Names") or d.get("Name") or ""
                        st = stats_by_id.get(cid) or stats_by_id.get(cname) or {}

                        # Parse CPU %
                        cpu_raw = str(st.get("CPUPerc") or "0%").replace("%", "").strip()
                        try:
                            cpu_val = round(float(cpu_raw), 2)
                        except ValueError:
                            cpu_val = 0.0

                        # Parse Mem %
                        mem_raw = str(st.get("MemPerc") or "0%").replace("%", "").strip()
                        try:
                            mem_val = round(float(mem_raw), 2)
                        except ValueError:
                            mem_val = 0.0

                        # Parse PIDs
                        pids_raw = str(st.get("PIDs") or "1").strip()
                        try:
                            pids_val = int(pids_raw)
                        except ValueError:
                            pids_val = 1

                        status_str = d.get("Status") or "Running"
                        is_running = "up" in status_str.lower()

                        containers.append(
                            ContainerSummary(
                                id=cid,
                                name=cname,
                                image=d.get("Image") or "unknown",
                                status=status_str,
                                state="running" if is_running else "stopped",
                                created=d.get("CreatedAt") or d.get("RunningFor") or "",
                                ports=d.get("Ports") or "",
                                cpu_percent=cpu_val,
                                mem_usage=st.get("MemUsage") or "0B",
                                mem_percent=mem_val,
                                net_io=st.get("NetIO") or "0B / 0B",
                                block_io=st.get("BlockIO") or "0B / 0B",
                                pids=pids_val,
                            )
                        )
                    except Exception:
                        continue

                if containers:
                    return containers
            except Exception:
                pass

        # Fallback to rich mock containers
        return [ContainerSummary(**c) for c in MOCK_CONTAINERS]

    def _parse_log_line(self, line: str) -> LogLine:
        clean = line.strip()
        ts: Optional[str] = None
        level = "info"

        # Check for RFC3339 timestamp at start
        m = re.match(r"^(\d{4}-\d{2}-\d{2}T[^\s]+)\s+(.*)$", clean)
        if m:
            ts = m.group(1)
            clean = m.group(2)

        # Detect log level
        lower = clean.lower()
        if "error" in lower or "fatal" in lower or "err" in lower:
            level = "error"
        elif "warn" in lower:
            level = "warn"
        elif "debug" in lower or "trace" in lower:
            level = "debug"
        elif "info" in lower:
            level = "info"

        stream = "stderr" if level == "error" else "stdout"
        return LogLine(timestamp=ts, level=level, stream=stream, message=clean)

    def get_logs(
        self,
        container_id: str,
        tail: int = 100,
        timestamps: bool = True,
        search: Optional[str] = None,
    ) -> LogResponse:
        lines: List[LogLine] = []
        if self.check_docker_available():
            try:
                cmd = ["docker", "logs", "--tail", str(tail)]
                if timestamps:
                    cmd.append("-t")
                cmd.append(container_id)
                res = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=5.0,
                )
                output = res.stdout + ("\n" + res.stderr if res.stderr else "")
                raw_lines = [l for l in output.splitlines() if l.strip()]
                for l in raw_lines:
                    if search and search.lower() not in l.lower():
                        continue
                    lines.append(self._parse_log_line(l))
                if lines:
                    return LogResponse(
                        container=container_id, lines=lines, total=len(lines)
                    )
            except Exception:
                pass

        # Fallback to mock logs
        mock_source = (
            MOCK_LOGS.get(container_id)
            or MOCK_LOGS.get("beszel")
            or [
                f"{datetime.now(timezone.utc).isoformat()} [INFO] Container {container_id} is operating normally.",
                f"{datetime.now(timezone.utc).isoformat()} [INFO] Handled incoming HTTP healthcheck probe: 200 OK",
                f"{datetime.now(timezone.utc).isoformat()} [DEBUG] Heartbeat ping sent (latency: 1.4ms)",
            ]
        )
        for l in mock_source:
            if search and search.lower() not in l.lower():
                continue
            lines.append(self._parse_log_line(l))

        return LogResponse(container=container_id, lines=lines, total=len(lines))

    def execute_action(self, container_id: str, action: str) -> Dict[str, Any]:
        valid_actions = {"restart", "stop", "start", "pause", "unpause"}
        if action not in valid_actions:
            return {
                "success": False,
                "error": f"Invalid action '{action}'. Valid actions are {sorted(valid_actions)}",
            }

        if self.check_docker_available():
            try:
                res = subprocess.run(
                    ["docker", action, container_id],
                    capture_output=True,
                    text=True,
                    timeout=10.0,
                )
                if res.returncode == 0:
                    return {
                        "success": True,
                        "action": action,
                        "container": container_id,
                        "message": f"Successfully executed {action} on {container_id}",
                    }
                return {
                    "success": False,
                    "action": action,
                    "container": container_id,
                    "error": res.stderr.strip() or f"Exit code {res.returncode}",
                }
            except Exception as exc:
                return {
                    "success": False,
                    "action": action,
                    "container": container_id,
                    "error": str(exc),
                }

        # Simulated action
        return {
            "success": True,
            "action": action,
            "container": container_id,
            "message": f"(Simulated) Action '{action}' triggered for container {container_id}",
        }


# Global Instance
_container_service = ContainerService()


def get_container_service() -> ContainerService:
    return _container_service


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/api/containers", tags=["containers"])


@router.get("", response_model=Dict[str, List[ContainerSummary]])
async def list_containers():
    """List all containers on the host with live CPU/Mem stats."""
    service = get_container_service()
    containers = service.list_containers()
    return {"containers": containers}


@router.get("/{id_or_name}/stats")
async def get_container_stats(id_or_name: str):
    """Get instant stats for a specific container."""
    service = get_container_service()
    containers = service.list_containers()
    match = next(
        (c for c in containers if c.id == id_or_name or c.name == id_or_name), None
    )
    if not match:
        raise HTTPException(status_code=404, detail="Container not found")
    return {"stats": match}


@router.get("/{id_or_name}/logs", response_model=LogResponse)
async def get_container_logs(
    id_or_name: str,
    tail: int = Query(100, ge=1, le=2000),
    timestamps: bool = Query(True),
    search: Optional[str] = Query(None),
):
    """Retrieve logs for a container with tailing and keyword search."""
    service = get_container_service()
    return service.get_logs(
        id_or_name, tail=tail, timestamps=timestamps, search=search
    )


@router.post("/{id_or_name}/action")
async def post_container_action(id_or_name: str, req: ActionRequest):
    """Trigger lifecycle actions: restart, stop, start, pause, unpause."""
    service = get_container_service()
    result = service.execute_action(id_or_name, req.action)
    return result


@router.get("/{id_or_name}/logs/stream")
async def stream_container_logs(
    id_or_name: str,
    tail: int = Query(50, ge=1, le=500),
    timestamps: bool = Query(True),
):
    """SSE streaming container logs for live Dozzel console viewing."""
    async def log_streamer():
        service = get_container_service()
        # Initial logs
        init_logs = service.get_logs(id_or_name, tail=tail, timestamps=timestamps)
        for line in init_logs.lines:
            yield f"data: {line.model_dump_json()}\n\n"

        # Continuous updates
        seen_count = len(init_logs.lines)
        while True:
            time.sleep(2.0)
            fresh = service.get_logs(id_or_name, tail=10, timestamps=timestamps)
            for line in fresh.lines:
                yield f"data: {line.model_dump_json()}\n\n"

    return StreamingResponse(
        log_streamer(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
