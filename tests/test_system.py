"""Tests for System Metrics Service and API (Beszel-style monitoring)."""

import sys
from pathlib import Path

project_dir = Path(__file__).parent.parent
if str(project_dir) not in sys.path:
    sys.path.insert(0, str(project_dir))

import pytest
from fastapi.testclient import TestClient

from main import app
from system_metrics import (
    SystemMetricsService,
    get_system_service,
    HostInfo,
    SystemSnapshot,
)

client = TestClient(app)


def test_system_service_snapshot():
    svc = SystemMetricsService(history_size=20)
    snap = svc.get_current_snapshot()
    assert isinstance(snap, SystemSnapshot)
    assert snap.cpu.total_percent >= 0.0
    assert snap.memory.total_bytes > 0
    assert snap.memory.used_percent >= 0.0
    assert snap.disk.total_bytes > 0
    assert isinstance(snap.host, HostInfo)
    assert snap.host.hostname != ""
    assert snap.host.platform != ""


def test_system_service_history_accumulation():
    svc = SystemMetricsService(history_size=10)
    # Collect a few snapshots
    for _ in range(5):
        svc.collect_snapshot()
    history = svc.get_history()
    assert len(history) == 5
    assert all("timestamp" in h and "cpu" in h and "memory" in h for h in history)


def test_api_system_metrics_endpoint():
    response = client.get("/api/system/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "cpu" in data
    assert "memory" in data
    assert "disk" in data
    assert "network" in data
    assert "host" in data
    assert "load_avg" in data


def test_api_system_history_endpoint():
    response = client.get("/api/system/history")
    assert response.status_code == 200
    data = response.json()
    assert "history" in data
    assert isinstance(data["history"], list)


def test_api_system_history_with_hours_query():
    response = client.get("/api/system/history?hours=1&limit=60")
    assert response.status_code == 200
    data = response.json()
    assert "history" in data
    assert isinstance(data["history"], list)


def test_system_host_info_enrichment():
    svc = get_system_service()
    snap = svc.get_current_snapshot()
    assert hasattr(snap.host, "cpu_model")
    assert hasattr(snap.host, "distro")
