"""
Curated Apps Service.

A curated registry of "apps" (docker-compose stacks) that can be started,
stopped, and opened from a single page in the dashboard, instead of auto-
starting on boot. Each app points at a compose directory on the host; the
service runs `docker compose` commands there so the whole stack (and its
dependencies) comes up together.
"""

import json
import os
import re
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
APPS_FILE = BASE_DIR / "data" / "curated_apps.json"
TUNNEL_SCRIPT = Path("/home/parth/projects/fleet/services/manage-tunnel.sh")

DEFAULT_APPS: List[Dict[str, Any]] = [
    {
        "name": "postiz",
        "title": "Postiz",
        "description": "Open-source social media scheduling (Postgres + Redis + Temporal).",
        "compose_dir": "/home/parth/Desktop/postiz",
        "container": "postiz",
        "url": "https://debian.tail46d59a.ts.net/",
        "icon": "📨",
    },
]


def _load_apps() -> List[Dict[str, Any]]:
    apps = list(DEFAULT_APPS)
    try:
        if APPS_FILE.exists():
            data = json.loads(APPS_FILE.read_text())
            if isinstance(data, list):
                # merge/override by name
                by_name = {a["name"]: a for a in apps}
                for a in data:
                    by_name[a["name"]] = {**by_name.get(a["name"], {}), **a}
                apps = list(by_name.values())
    except Exception:
        pass
    return apps


def _container_state(container: str) -> str:
    if not container:
        return "unknown"
    try:
        res = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Status}}", container],
            capture_output=True, text=True, timeout=4.0,
        )
        if res.returncode == 0:
            return res.stdout.strip() or "unknown"
    except Exception:
        pass
    return "not-found"


def _systemd_state(unit: str) -> str:
    if not unit:
        return "unknown"
    try:
        res = subprocess.run(
            ["systemctl", "--user", "is-active", unit],
            capture_output=True, text=True, timeout=4.0,
        )
        out = (res.stdout or res.stderr or "").strip()
        return out or "unknown"
    except Exception:
        return "unknown"


class AppItem(BaseModel):
    name: str
    title: str
    description: str = ""
    kind: str = "docker"  # docker | systemd
    container: str = ""
    unit: str = ""
    state: str = "unknown"
    running: bool = False
    url: str = ""
    icon: str = "📦"
    compose_dir: str = ""


class AppsResponse(BaseModel):
    apps: List[AppItem] = Field(default_factory=list)
    timestamp: str


class AppActionRequest(BaseModel):
    action: str = "start"  # start | stop | restart


router = APIRouter(prefix="/api/apps", tags=["apps"])


def _find_app(name: str) -> Dict[str, Any]:
    for a in _load_apps():
        if a["name"] == name:
            return a
    raise HTTPException(status_code=404, detail=f"Unknown app '{name}'")


@router.get("", response_model=AppsResponse)
def list_apps():
    items = []
    for a in _load_apps():
        kind = a.get("kind", "docker")
        if kind == "systemd":
            state = _systemd_state(a.get("unit", ""))
            running = (state == "active")
        elif kind == "container":
            state = _container_state(a.get("container", ""))
            running = (state == "running")
        else:
            state = _container_state(a.get("container", ""))
            running = (state == "running")
        items.append(AppItem(
            name=a["name"],
            title=a.get("title", a["name"]),
            description=a.get("description", ""),
            kind=kind,
            container=a.get("container", ""),
            unit=a.get("unit", ""),
            state=state,
            running=running,
            url=a.get("url", ""),
            icon=a.get("icon", "📦"),
            compose_dir=a.get("compose_dir", ""),
        ))
    return AppsResponse(apps=items, timestamp=datetime.now(timezone.utc).isoformat())


@router.post("/{name}/action")
def app_action(name: str, req: AppActionRequest):
    app = _find_app(name)
    compose_dir = app.get("compose_dir", "")

    action = req.action.lower()
    kind = app.get("kind", "docker")
    if kind == "systemd":
        unit = app.get("unit", "")
        if not unit:
            raise HTTPException(status_code=400, detail="No systemd unit configured")
        if action not in ("start", "stop", "restart"):
            raise HTTPException(status_code=400, detail="Action must be start, stop, or restart")
        # Clear any stale failed state so start/stop work cleanly
        subprocess.run(["systemctl", "--user", "reset-failed", unit], capture_output=True, text=True, timeout=5.0)
        cmd = ["systemctl", "--user", action, unit]
        cwd = None
    elif kind == "container":
        container = app.get("container", "")
        if not container:
            raise HTTPException(status_code=400, detail="No container configured")
        if action not in ("start", "stop", "restart"):
            raise HTTPException(status_code=400, detail="Action must be start, stop, or restart")
        cmd = ["docker", action, container]
        cwd = None
    else:
        if not compose_dir or not os.path.isdir(compose_dir):
            raise HTTPException(status_code=400, detail=f"Compose dir not found: {compose_dir}")
        if action == "start":
            cmd = ["docker", "compose", "up", "-d"]
        elif action == "stop":
            cmd = ["docker", "compose", "stop"]
        elif action == "restart":
            cmd = ["docker", "compose", "restart"]
        else:
            raise HTTPException(status_code=400, detail="Action must be start, stop, or restart")
        cwd = compose_dir

    try:
        res = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True, timeout=300.0,
        )
        # For systemd services, clear failed state after stop so UI shows "inactive" not "failed"
        if kind == "systemd" and action == "stop":
            subprocess.run(["systemctl", "--user", "reset-failed", app.get("unit","")], capture_output=True, text=True, timeout=5.0)
        # trigger nothing else; return output
        if res.returncode != 0:
            err = (res.stderr or res.stdout or "Command failed").strip()
            raise HTTPException(status_code=500, detail=f"Failed to {action} {name}: {err}")

        # Handle Cloudflare tunnel lifecycle for public services
        tunnel_port = app.get("tunnel_port")
        is_public = app.get("public", False)
        tunnel_output = ""
        if is_public and tunnel_port and TUNNEL_SCRIPT.exists():
            tunnel_action = "start" if action == "start" else "stop"
            try:
                tr = subprocess.run(
                    [str(TUNNEL_SCRIPT), name, str(tunnel_port), tunnel_action],
                    capture_output=True, text=True, timeout=60.0,
                )
                tunnel_output = (tr.stdout or "").strip()
                if tr.returncode != 0:
                    tunnel_output += f"\nTunnel warning: {tr.stderr or tr.stdout}"
            except Exception as te:
                tunnel_output = f"Tunnel error: {te}"

        # refresh state in background
        threading.Thread(target=lambda: None, daemon=True).start()
        return {
            "success": True,
            "action": action,
            "app": name,
            "message": f"Successfully {action}ed {name}".replace("stoped","stopped"),
            "output": (res.stdout or "").strip()[-500:] + ("\n" + tunnel_output if tunnel_output else ""),
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail=f"Timed out running {action} on {name}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
