"""Tests for Task Manager & Process Monitoring API."""

import sys
from pathlib import Path

project_dir = Path(__file__).parent.parent
if str(project_dir) not in sys.path:
    sys.path.insert(0, str(project_dir))

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_api_tasks_default():
    response = client.get("/api/tasks")
    assert response.status_code == 200
    data = response.json()
    assert "tasks" in data
    assert "overview" in data
    assert "timestamp" in data
    assert len(data["tasks"]) > 0

    overview = data["overview"]
    assert overview["total_processes"] > 0
    assert overview["total_threads"] > 0
    assert 0.0 <= overview["cpu_total_percent"] <= 100.0
    assert 0.0 <= overview["memory_used_percent"] <= 100.0


def test_api_tasks_sort_by_cpu():
    response = client.get("/api/tasks?sort_by=cpu&order=desc&limit=10")
    assert response.status_code == 200
    tasks = response.json()["tasks"]
    assert len(tasks) <= 10
    # Verify sorted descending by cpu
    cpus = [t["cpu_percent"] for t in tasks]
    assert cpus == sorted(cpus, reverse=True)


def test_api_tasks_sort_by_ram():
    response = client.get("/api/tasks?sort_by=memory&order=desc&limit=15")
    assert response.status_code == 200
    tasks = response.json()["tasks"]
    assert len(tasks) <= 15
    # Verify sorted descending by memory_bytes
    mems = [t["memory_bytes"] for t in tasks]
    assert mems == sorted(mems, reverse=True)


def test_api_tasks_sort_by_pid():
    response = client.get("/api/tasks?sort_by=pid&order=asc&limit=10")
    assert response.status_code == 200
    tasks = response.json()["tasks"]
    pids = [t["pid"] for t in tasks]
    assert pids == sorted(pids)


def test_api_tasks_search_filter():
    response = client.get("/api/tasks?search=systemd")
    assert response.status_code == 200
    tasks = response.json()["tasks"]
    for t in tasks:
        match = "systemd" in t["name"].lower() or "systemd" in t["cmdline"].lower() or "systemd" in t["username"].lower()
        assert match


def test_api_tasks_dashboard_prefix():
    response = client.get("/dashboard/api/tasks?limit=5")
    assert response.status_code == 200
    assert len(response.json()["tasks"]) > 0
