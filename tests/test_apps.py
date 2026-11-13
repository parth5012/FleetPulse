"""Tests for Curated Apps API."""

import sys
from pathlib import Path

project_dir = Path(__file__).parent.parent
if str(project_dir) not in sys.path:
    sys.path.insert(0, str(project_dir))

import pytest
from fastapi.testclient import TestClient

from main import app
from apps import _load_apps

client = TestClient(app)


def test_list_apps_endpoint():
    response = client.get("/api/apps")
    assert response.status_code == 200
    data = response.json()
    assert "apps" in data
    assert "timestamp" in data
    assert isinstance(data["apps"], list)
    assert len(data["apps"]) > 0

    names = [a["name"] for a in data["apps"]]
    expected_services = [
        "searxng",
        "perplexica",
        "woodpecker",
        "reactive-resume",
        "monica",
        "hoppscotch",
        "excalidraw",
        "pocketbase",
    ]
    for expected in expected_services:
        assert expected in names, f"{expected} missing from curated apps list"


def test_app_action_unknown_app():
    response = client.post("/api/apps/nonexistent-xyz/action", json={"action": "start"})
    assert response.status_code == 404
    assert "Unknown app" in response.json()["detail"]


def test_app_action_invalid_action():
    apps = _load_apps()
    first_name = apps[0]["name"]
    response = client.post(f"/api/apps/{first_name}/action", json={"action": "invalid_action_foo"})
    assert response.status_code == 400
