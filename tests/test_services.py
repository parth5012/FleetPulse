"""Tests for System Services Monitoring API."""

import sys
from pathlib import Path

project_dir = Path(__file__).parent.parent
if str(project_dir) not in sys.path:
    sys.path.insert(0, str(project_dir))

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_api_services_default():
    response = client.get("/api/services")
    assert response.status_code == 200
    data = response.json()
    assert "services" in data
    assert "overview" in data
    assert "timestamp" in data
    assert len(data["services"]) > 0

    overview = data["overview"]
    assert overview["total_services"] > 0
    assert overview["running_services"] > 0
    assert overview["user_services"] > 0
    assert overview["system_services"] > 0


def test_api_services_scope_filter():
    # Test user scope
    res_user = client.get("/api/services?scope=user")
    assert res_user.status_code == 200
    for s in res_user.json()["services"]:
        assert s["scope"] == "user"

    # Test system scope
    res_sys = client.get("/api/services?scope=system")
    assert res_sys.status_code == 200
    for s in res_sys.json()["services"]:
        assert s["scope"] == "system"


def test_api_services_sort_by_ram():
    response = client.get("/api/services?sort_by=memory&order=desc&limit=10")
    assert response.status_code == 200
    services = response.json()["services"]
    assert len(services) <= 10
    mems = [s["memory_bytes"] for s in services]
    assert mems == sorted(mems, reverse=True)


def test_api_services_sort_by_name():
    response = client.get("/api/services?sort_by=name&order=asc&limit=10")
    assert response.status_code == 200
    services = response.json()["services"]
    names = [s["name"].lower() for s in services]
    assert names == sorted(names)


def test_api_services_search():
    response = client.get("/api/services?search=dashboard")
    assert response.status_code == 200
    services = response.json()["services"]
    assert len(services) > 0
    for s in services:
        assert "dashboard" in s["name"].lower() or "dashboard" in s["unit"].lower() or "dashboard" in s["description"].lower()


def test_api_services_dashboard_prefix():
    response = client.get("/dashboard/api/services?limit=5")
    assert response.status_code == 200
    assert len(response.json()["services"]) > 0
