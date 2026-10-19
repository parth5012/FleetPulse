"""Tests for System Journal & Kernel Watcher API."""

import sys
from pathlib import Path

project_dir = Path(__file__).parent.parent
if str(project_dir) not in sys.path:
    sys.path.insert(0, str(project_dir))

import pytest
from fastapi.testclient import TestClient
from main import app
from journal_inspector import parse_journal_entry, get_kernel_pressure_stats

client = TestClient(app)


def test_parse_journal_entry():
    raw_entry = {
        "__REALTIME_TIMESTAMP": "1792391349730327",
        "PRIORITY": "3",
        "SYSLOG_IDENTIFIER": "dashboard-service",
        "_PID": "12345",
        "MESSAGE": "Error connecting to service upstream",
    }
    parsed = parse_journal_entry(raw_entry)
    assert parsed["priority_num"] == 3
    assert parsed["priority_label"] == "err"
    assert parsed["unit"] == "dashboard-service"
    assert parsed["pid"] == 12345
    assert parsed["message"] == "Error connecting to service upstream"


def test_kernel_pressure_stats():
    stats = get_kernel_pressure_stats()
    assert "oom_kill_count" in stats
    assert "memory_pressure" in stats
    assert "cpu_pressure" in stats
    assert stats["oom_kill_count"] >= 0


def test_api_journal_logs():
    response = client.get("/api/journal/logs?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert "logs" in data
    assert "total" in data


def test_api_journal_kernel():
    response = client.get("/api/journal/kernel")
    assert response.status_code == 200
    data = response.json()
    assert "oom_kill_count" in data
    assert "memory_pressure" in data
