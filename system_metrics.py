"""
System Metrics Collector & API for Beszel-style visual monitoring.
Collects real-time CPU, Memory, Disk, Network, and Host statistics via psutil.
Maintains a rolling historical ring buffer for time-series charts and sparklines.
"""

import collections
import os
import platform
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import psutil
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------
class CPUMetrics(BaseModel):
    total_percent: float = 0.0
    per_core: List[float] = Field(default_factory=list)
    frequency_mhz: Optional[float] = None
    core_count_logical: int = 1
    core_count_physical: int = 1


class MemoryMetrics(BaseModel):
    total_bytes: int = 0
    available_bytes: int = 0
    used_bytes: int = 0
    used_percent: float = 0.0
    swap_total_bytes: int = 0
    swap_used_bytes: int = 0
    swap_used_percent: float = 0.0


class DiskPartition(BaseModel):
    device: str
    mountpoint: str
    fstype: str
    total_bytes: int = 0
    used_bytes: int = 0
    free_bytes: int = 0
    used_percent: float = 0.0


class DiskMetrics(BaseModel):
    total_bytes: int = 0
    used_bytes: int = 0
    free_bytes: int = 0
    used_percent: float = 0.0
    read_bytes_per_sec: float = 0.0
    write_bytes_per_sec: float = 0.0
    partitions: List[DiskPartition] = Field(default_factory=list)


class NetworkMetrics(BaseModel):
    bytes_sent_per_sec: float = 0.0
    bytes_recv_per_sec: float = 0.0
    packets_sent_per_sec: float = 0.0
    packets_recv_per_sec: float = 0.0


class HostInfo(BaseModel):
    hostname: str = ""
    platform: str = ""
    os_release: str = ""
    kernel: str = ""
    architecture: str = ""
    uptime_seconds: int = 0
    boot_time: str = ""
    process_count: int = 0


class SystemSnapshot(BaseModel):
    timestamp: str
    cpu: CPUMetrics
    memory: MemoryMetrics
    disk: DiskMetrics
    network: NetworkMetrics
    host: HostInfo
    load_avg: List[float] = Field(default_factory=list)


class SystemHistoryPoint(BaseModel):
    timestamp: str
    cpu: float
    memory: float
    disk_read_kb: float
    disk_write_kb: float
    net_rx_kb: float
    net_tx_kb: float


# ---------------------------------------------------------------------------
# Metrics Collector Service
# ---------------------------------------------------------------------------
class SystemMetricsService:
    def __init__(self, history_size: int = 60):
        self.history_size = history_size
        self._lock = threading.Lock()
        self._history: collections.deque = collections.deque(maxlen=history_size)
        self._last_disk_io: Optional[Any] = None
        self._last_net_io: Optional[Any] = None
        self._last_io_time: float = 0.0

        # Prime psutil cpu counters
        try:
            psutil.cpu_percent(interval=None)
            psutil.cpu_percent(interval=None, percpu=True)
            self._last_disk_io = psutil.disk_io_counters()
            self._last_net_io = psutil.net_io_counters()
            self._last_io_time = time.time()
        except Exception:
            pass

    def _get_load_avg(self) -> List[float]:
        try:
            if hasattr(os, "getloadavg"):
                return [round(x, 2) for x in os.getloadavg()]
        except Exception:
            pass
        return [0.0, 0.0, 0.0]

    def _get_host_info(self) -> HostInfo:
        boot_ts = 0.0
        try:
            boot_ts = psutil.boot_time()
        except Exception:
            pass
        now = time.time()
        uptime = int(now - boot_ts) if boot_ts > 0 else 0
        boot_iso = (
            datetime.fromtimestamp(boot_ts, tz=timezone.utc).isoformat()
            if boot_ts > 0
            else ""
        )

        proc_count = 0
        try:
            proc_count = len(psutil.pids())
        except Exception:
            pass

        return HostInfo(
            hostname=platform.node() or "localhost",
            platform=platform.system() or "Linux",
            os_release=platform.release() or "",
            kernel=platform.version() or "",
            architecture=platform.machine() or "x86_64",
            uptime_seconds=uptime,
            boot_time=boot_iso,
            process_count=proc_count,
        )

    def collect_snapshot(self) -> SystemSnapshot:
        now_ts = time.time()
        now_iso = datetime.now(timezone.utc).isoformat()

        # CPU
        cpu_tot = 0.0
        cpu_per = []
        freq_mhz = None
        try:
            cpu_tot = round(float(psutil.cpu_percent(interval=None)), 1)
            cpu_per = [round(float(p), 1) for p in psutil.cpu_percent(interval=None, percpu=True)]
            freq = psutil.cpu_freq()
            if freq and freq.current:
                freq_mhz = round(float(freq.current), 1)
        except Exception:
            pass

        logical_cores = psutil.cpu_count(logical=True) or 1
        physical_cores = psutil.cpu_count(logical=False) or logical_cores

        cpu_metrics = CPUMetrics(
            total_percent=cpu_tot,
            per_core=cpu_per,
            frequency_mhz=freq_mhz,
            core_count_logical=logical_cores,
            core_count_physical=physical_cores,
        )

        # Memory
        mem_metrics = MemoryMetrics()
        try:
            vm = psutil.virtual_memory()
            sm = psutil.swap_memory()
            mem_metrics = MemoryMetrics(
                total_bytes=vm.total,
                available_bytes=vm.available,
                used_bytes=vm.used,
                used_percent=round(float(vm.percent), 1),
                swap_total_bytes=sm.total,
                swap_used_bytes=sm.used,
                swap_used_percent=round(float(sm.percent), 1),
            )
        except Exception:
            pass

        # Disk & Partitions
        disk_metrics = DiskMetrics()
        part_list: List[DiskPartition] = []
        try:
            usage = psutil.disk_usage("/")
            parts = psutil.disk_partitions(all=False)
            for p in parts:
                try:
                    p_use = psutil.disk_usage(p.mountpoint)
                    part_list.append(
                        DiskPartition(
                            device=p.device,
                            mountpoint=p.mountpoint,
                            fstype=p.fstype,
                            total_bytes=p_use.total,
                            used_bytes=p_use.used,
                            free_bytes=p_use.free,
                            used_percent=round(float(p_use.percent), 1),
                        )
                    )
                except (PermissionError, OSError):
                    continue

            # I/O rates
            current_disk_io = psutil.disk_io_counters()
            read_rate = 0.0
            write_rate = 0.0
            dt = now_ts - self._last_io_time
            if self._last_disk_io and current_disk_io and dt > 0.05:
                read_rate = max(0.0, (current_disk_io.read_bytes - self._last_disk_io.read_bytes) / dt)
                write_rate = max(0.0, (current_disk_io.write_bytes - self._last_disk_io.write_bytes) / dt)
            self._last_disk_io = current_disk_io

            disk_metrics = DiskMetrics(
                total_bytes=usage.total,
                used_bytes=usage.used,
                free_bytes=usage.free,
                used_percent=round(float(usage.percent), 1),
                read_bytes_per_sec=round(read_rate, 1),
                write_bytes_per_sec=round(write_rate, 1),
                partitions=part_list,
            )
        except Exception:
            pass

        # Network
        net_metrics = NetworkMetrics()
        try:
            current_net_io = psutil.net_io_counters()
            dt = now_ts - self._last_io_time
            rx_rate, tx_rate = 0.0, 0.0
            rx_pkt, tx_pkt = 0.0, 0.0
            if self._last_net_io and current_net_io and dt > 0.05:
                rx_rate = max(0.0, (current_net_io.bytes_recv - self._last_net_io.bytes_recv) / dt)
                tx_rate = max(0.0, (current_net_io.bytes_sent - self._last_net_io.bytes_sent) / dt)
                rx_pkt = max(0.0, (current_net_io.packets_recv - self._last_net_io.packets_recv) / dt)
                tx_pkt = max(0.0, (current_net_io.packets_sent - self._last_net_io.packets_sent) / dt)
            self._last_net_io = current_net_io

            net_metrics = NetworkMetrics(
                bytes_sent_per_sec=round(tx_rate, 1),
                bytes_recv_per_sec=round(rx_rate, 1),
                packets_sent_per_sec=round(tx_pkt, 1),
                packets_recv_per_sec=round(rx_pkt, 1),
            )
        except Exception:
            pass

        self._last_io_time = now_ts

        host_info = self._get_host_info()
        load_avg = self._get_load_avg()

        snapshot = SystemSnapshot(
            timestamp=now_iso,
            cpu=cpu_metrics,
            memory=mem_metrics,
            disk=disk_metrics,
            network=net_metrics,
            host=host_info,
            load_avg=load_avg,
        )

        with self._lock:
            self._history.append(
                SystemHistoryPoint(
                    timestamp=now_iso,
                    cpu=cpu_metrics.total_percent,
                    memory=mem_metrics.used_percent,
                    disk_read_kb=round(disk_metrics.read_bytes_per_sec / 1024, 1),
                    disk_write_kb=round(disk_metrics.write_bytes_per_sec / 1024, 1),
                    net_rx_kb=round(net_metrics.bytes_recv_per_sec / 1024, 1),
                    net_tx_kb=round(net_metrics.bytes_sent_per_sec / 1024, 1),
                ).model_dump()
            )

        return snapshot

    def get_current_snapshot(self) -> SystemSnapshot:
        return self.collect_snapshot()

    def get_history(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._history)


# Global Service Instance
_system_service = SystemMetricsService()


def get_system_service() -> SystemMetricsService:
    return _system_service


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/metrics", response_model=SystemSnapshot)
async def get_system_metrics():
    """Retrieve instant snapshot of CPU, Memory, Disk, Network, and Host status."""
    service = get_system_service()
    return service.get_current_snapshot()


@router.get("/history")
async def get_system_history():
    """Retrieve rolling time-series data points for Beszel-style interactive charts."""
    service = get_system_service()
    return {"history": service.get_history()}


@router.get("/stream")
async def stream_system_metrics():
    """Server-Sent Events (SSE) live metric stream for high-fps visual dashboards."""
    async def event_generator():
        service = get_system_service()
        while True:
            snap = service.collect_snapshot()
            yield f"data: {snap.model_dump_json()}\n\n"
            time.sleep(1.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
