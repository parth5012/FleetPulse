"""
Task Manager & Process Monitoring Service (btop / Task Manager style).
Provides real-time listing, sorting (CPU, RAM, PID, Name), filtering,
and process lifecycle management (terminate/kill).
"""

import os
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import psutil
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------
class TaskItem(BaseModel):
    pid: int
    name: str
    username: str = ""
    status: str = "running"
    cpu_percent: float = 0.0
    memory_bytes: int = 0
    memory_percent: float = 0.0
    memory_formatted: str = "0 B"
    num_threads: int = 1
    create_time: float = 0.0
    cmdline: str = ""
    nice: int = 0


class TasksOverview(BaseModel):
    total_processes: int = 0
    running: int = 0
    sleeping: int = 0
    other: int = 0
    total_threads: int = 0
    cpu_total_percent: float = 0.0
    memory_used_percent: float = 0.0


class TasksResponse(BaseModel):
    tasks: List[TaskItem] = Field(default_factory=list)
    overview: TasksOverview
    timestamp: str


class TaskActionRequest(BaseModel):
    action: str = "terminate"  # "terminate" (SIGTERM) or "kill" (SIGKILL)


# ---------------------------------------------------------------------------
# Helper Formatters
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
# Task Service
# ---------------------------------------------------------------------------
class TaskService:
    def __init__(self):
        self._lock = threading.Lock()
        self._last_cpu_times: Dict[int, float] = {}
        self._last_poll_time: float = time.time()
        self._cached_tasks: List[TaskItem] = []
        self._cached_overview = TasksOverview()
        self._running = True

        # Prime initial cpu counters
        self._poll_tasks()

        # Start light background poller to keep CPU deltas continuously hot
        self._thread = threading.Thread(target=self._background_loop, daemon=True)
        self._thread.start()

    def _background_loop(self):
        while self._running:
            time.sleep(1.8)
            try:
                self._poll_tasks()
            except Exception:
                pass

    def _poll_tasks(self):
        now = time.time()
        dt = max(now - self._last_poll_time, 0.001)

        tasks: List[TaskItem] = []
        running_cnt = 0
        sleeping_cnt = 0
        other_cnt = 0
        total_threads = 0
        new_cpu_times: Dict[int, float] = {}

        for p in psutil.process_iter(
            [
                "pid",
                "name",
                "username",
                "status",
                "cpu_times",
                "memory_info",
                "memory_percent",
                "num_threads",
                "create_time",
                "cmdline",
                "nice",
            ]
        ):
            try:
                info = p.info
                pid = info["pid"]

                # CPU calculation
                cpu_times = info.get("cpu_times")
                cpu_total = (cpu_times.user + cpu_times.system) if cpu_times else 0.0
                new_cpu_times[pid] = cpu_total

                if pid in self._last_cpu_times:
                    cpu_delta = max(cpu_total - self._last_cpu_times[pid], 0.0)
                    cpu_percent = round((cpu_delta / dt) * 100, 1)
                else:
                    cpu_percent = 0.0

                # Memory
                mem_info = info.get("memory_info")
                rss = mem_info.rss if mem_info else 0
                mem_percent = round(info.get("memory_percent") or 0.0, 1)

                # Status
                st = str(info.get("status") or "running").lower()
                if st == "running":
                    running_cnt += 1
                elif st in ("sleeping", "idle"):
                    sleeping_cnt += 1
                else:
                    other_cnt += 1

                threads = int(info.get("num_threads") or 1)
                total_threads += threads

                cmd = info.get("cmdline")
                if isinstance(cmd, list):
                    cmdline_str = " ".join(cmd)
                else:
                    cmdline_str = str(cmd or "")

                tasks.append(
                    TaskItem(
                        pid=pid,
                        name=info.get("name") or f"process-{pid}",
                        username=info.get("username") or "",
                        status=st,
                        cpu_percent=cpu_percent,
                        memory_bytes=rss,
                        memory_percent=mem_percent,
                        memory_formatted=format_bytes(rss),
                        num_threads=threads,
                        create_time=float(info.get("create_time") or 0.0),
                        cmdline=cmdline_str,
                        nice=int(info.get("nice") or 0),
                    )
                )
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
            except Exception:
                continue

        with self._lock:
            self._last_cpu_times = new_cpu_times
            self._last_poll_time = now
            self._cached_tasks = tasks

            cpu_overall = 0.0
            mem_overall = 0.0
            try:
                cpu_overall = psutil.cpu_percent(interval=None)
                mem_overall = psutil.virtual_memory().percent
            except Exception:
                pass

            self._cached_overview = TasksOverview(
                total_processes=len(tasks),
                running=running_cnt,
                sleeping=sleeping_cnt,
                other=other_cnt,
                total_threads=total_threads,
                cpu_total_percent=round(cpu_overall, 1),
                memory_used_percent=round(mem_overall, 1),
            )

    def get_tasks(
        self,
        sort_by: str = "cpu",
        order: str = "desc",
        limit: int = 100,
        search: Optional[str] = None,
    ) -> TasksResponse:
        with self._lock:
            tasks_copy = list(self._cached_tasks)
            overview_copy = self._cached_overview

        # Filter by search
        if search:
            q = search.lower().strip()
            tasks_copy = [
                t
                for t in tasks_copy
                if q in t.name.lower()
                or q in str(t.pid)
                or q in t.username.lower()
                or q in t.cmdline.lower()
            ]

        # Sort
        reverse = order.lower() == "desc"
        sort_key = sort_by.lower()

        if sort_key == "cpu":
            tasks_copy.sort(key=lambda t: t.cpu_percent, reverse=reverse)
        elif sort_key in ("memory", "ram", "mem"):
            tasks_copy.sort(key=lambda t: t.memory_bytes, reverse=reverse)
        elif sort_key == "pid":
            tasks_copy.sort(key=lambda t: t.pid, reverse=reverse)
        elif sort_key == "name":
            tasks_copy.sort(key=lambda t: t.name.lower(), reverse=reverse)
        elif sort_key in ("threads", "thread"):
            tasks_copy.sort(key=lambda t: t.num_threads, reverse=reverse)
        else:
            tasks_copy.sort(key=lambda t: t.cpu_percent, reverse=reverse)

        if limit > 0:
            tasks_copy = tasks_copy[:limit]

        return TasksResponse(
            tasks=tasks_copy,
            overview=overview_copy,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    def terminate_process(self, pid: int, force: bool = False) -> Dict[str, Any]:
        try:
            p = psutil.Process(pid)
            proc_name = p.name()
            if force:
                p.kill()
            else:
                p.terminate()
            return {
                "success": True,
                "message": f"Sent {'SIGKILL' if force else 'SIGTERM'} to PID {pid} ({proc_name})",
            }
        except psutil.NoSuchProcess:
            raise HTTPException(status_code=404, detail=f"Process with PID {pid} not found")
        except psutil.AccessDenied:
            raise HTTPException(status_code=403, detail=f"Permission denied to stop PID {pid}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


task_service = TaskService()


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------
@router.get("", response_model=TasksResponse)
def list_tasks(
    sort_by: str = Query("cpu", description="Sort field: cpu, memory, pid, name, threads"),
    order: str = Query("desc", description="Sort order: desc or asc"),
    limit: int = Query(100, ge=1, le=500, description="Max tasks to return"),
    search: Optional[str] = Query(None, description="Search keyword for name, PID, or cmdline"),
):
    return task_service.get_tasks(sort_by=sort_by, order=order, limit=limit, search=search)


@router.post("/{pid}/action")
def process_action(pid: int, req: TaskActionRequest):
    force = req.action.lower() in ("kill", "force", "sigkill")
    return task_service.terminate_process(pid=pid, force=force)
