"""Tests for Container & Log Service and API (Dozzel-style dashboard)."""

import sys
from pathlib import Path

project_dir = Path(__file__).parent.parent
if str(project_dir) not in sys.path:
    sys.path.insert(0, str(project_dir))

import pytest
from fastapi.testclient import TestClient

from main import app
from containers import (
    ContainerService,
    ContainerSummary,
    LogResponse,
    get_container_service,
)

client = TestClient(app)


def test_container_service_listing():
    svc = ContainerService()
    containers = svc.list_containers()
    assert isinstance(containers, list)
    # Even in environments without docker, fallback sample containers are provided
    assert len(containers) >= 1
    first = containers[0]
    assert isinstance(first, ContainerSummary)
    assert first.id != ""
    assert first.name != ""
    assert first.image != ""
    assert first.status != ""


def test_container_service_logs():
    svc = ContainerService()
    containers = svc.list_containers()
    target_id = containers[0].name or containers[0].id
    logs = svc.get_logs(target_id, tail=20)
    assert isinstance(logs, LogResponse)
    assert logs.container == target_id
    assert isinstance(logs.lines, list)


def test_container_service_invalid_action():
    svc = ContainerService()
    res = svc.execute_action("nonexistent", "fly_to_moon")
    assert res.get("success") is False
    assert "Invalid action" in res.get("error", "")


def test_api_containers_endpoint():
    response = client.get("/api/containers")
    assert response.status_code == 200
    data = response.json()
    assert "containers" in data
    assert isinstance(data["containers"], list)
    assert len(data["containers"]) >= 1


def test_api_container_logs_endpoint():
    # First get a container name
    c_resp = client.get("/api/containers")
    c_name = c_resp.json()["containers"][0]["name"]
    response = client.get(f"/api/containers/{c_name}/logs?tail=15")
    assert response.status_code == 200
    data = response.json()
    assert data["container"] == c_name
    assert "lines" in data
    assert isinstance(data["lines"], list)


def test_api_container_action_endpoint(monkeypatch):
    svc = get_container_service()
    # Mock execute_action so test is fast and doesn't interrupt real containers
    monkeypatch.setattr(
        svc,
        "execute_action",
        lambda cid, act: {"success": True, "action": act, "container": cid, "message": "ok"},
    )
    response = client.post("/api/containers/test-container/action", json={"action": "restart"})
    assert response.status_code == 200
    assert response.json()["success"] is True
