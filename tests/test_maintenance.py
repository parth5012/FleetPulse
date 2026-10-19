"""Tests for Remote Maintenance API."""

import sys
from pathlib import Path

project_dir = Path(__file__).parent.parent
if str(project_dir) not in sys.path:
    sys.path.insert(0, str(project_dir))

import pytest
from fastapi.testclient import TestClient
from main import app
from maintenance import is_service_allowed, parse_docker_df_output

client = TestClient(app)


def test_is_service_allowed():
    assert is_service_allowed("omniroute.service") is True
    assert is_service_allowed("dashboard-service.service") is True
    assert is_service_allowed("hermes-gateway.service") is True
    assert is_service_allowed("rm -rf /") is False
    assert is_service_allowed("systemd.service") is False


def test_parse_docker_df_output():
    sample = [
        {"Type": "Images", "TotalCount": "5", "Active": "4", "Size": "190.9MB", "Reclaimable": "8.422MB (4%)"},
        {"Type": "Containers", "TotalCount": "4", "Active": "3", "Size": "68B", "Reclaimable": "68B (100%)"},
    ]
    parsed = parse_docker_df_output(sample)
    assert len(parsed) == 2
    assert parsed[0]["type"] == "Images"
    assert parsed[0]["size"] == "190.9MB"


def test_api_maintenance_df():
    response = client.get("/api/maintenance/df")
    assert response.status_code == 200
    data = response.json()
    assert "docker" in data
    assert "disk_root" in data


def test_api_maintenance_service_restart_blocked():
    response = client.post("/api/maintenance/services/restart", json={"unit": "disallowed-unit.service"})
    assert response.status_code == 400
    assert "not permitted" in response.json().get("detail", "").lower()
