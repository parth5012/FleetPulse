"""End-to-End integration tests for Dashboard Service."""

import sys
from pathlib import Path

project_dir = Path(__file__).parent.parent
if str(project_dir) not in sys.path:
    sys.path.insert(0, str(project_dir))

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_spa_home_route():
    response = client.get("/")
    assert response.status_code == 200
    assert "<!DOCTYPE html>" in response.text or "<html" in response.text


def test_spa_system_route():
    response = client.get("/system")
    assert response.status_code == 200
    assert "<!DOCTYPE html>" in response.text or "<html" in response.text


def test_spa_containers_route():
    response = client.get("/containers")
    assert response.status_code == 200
    assert "<!DOCTYPE html>" in response.text or "<html" in response.text


def test_api_system_metrics_flow():
    response = client.get("/api/system/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "cpu" in data
    assert "memory" in data
    assert "disk" in data
    assert "network" in data
    assert "host" in data
    # Verify values are numbers and within sane bounds
    assert 0.0 <= data["cpu"]["total_percent"] <= 100.0
    assert data["memory"]["total_bytes"] > 0
    assert 0.0 <= data["memory"]["used_percent"] <= 100.0
    assert data["disk"]["total_bytes"] > 0


def test_api_containers_fleet_flow():
    response = client.get("/api/containers")
    assert response.status_code == 200
    containers = response.json().get("containers", [])
    assert len(containers) > 0

    first_target = containers[0]["name"] or containers[0]["id"]
    # Verify container stats
    stats_res = client.get(f"/api/containers/{first_target}/stats")
    assert stats_res.status_code == 200
    assert "stats" in stats_res.json()

    # Verify container logs
    logs_res = client.get(f"/api/containers/{first_target}/logs?tail=20")
    assert logs_res.status_code == 200
    assert "lines" in logs_res.json()
