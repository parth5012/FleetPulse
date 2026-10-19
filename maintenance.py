"""One-Tap Remote Maintenance: Docker garbage collection, journal vacuuming, and bounded service restarts."""

import re
import shutil
import subprocess
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])

ALLOWED_SERVICES = {
    "omniroute.service",
    "dashboard-service.service",
    "hermes-gateway.service",
    "kanban-sync.service",
    "t3.service",
    "element-web.service",
    "pr-agent.service",
}


def is_service_allowed(unit: str) -> bool:
    """Validate that the service unit is on the safe administrative whitelist."""
    norm = unit if unit.endswith(".service") else f"{unit}.service"
    return norm in ALLOWED_SERVICES


def parse_docker_df_output(raw_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Format docker system df output."""
    out = []
    for item in raw_items:
        out.append({
            "type": item.get("Type", "Unknown"),
            "total": item.get("TotalCount", "0"),
            "active": item.get("Active", "0"),
            "size": item.get("Size", "0B"),
            "reclaimable": item.get("Reclaimable", "0B"),
        })
    return out


class ServiceRestartRequest(BaseModel):
    unit: str


class JournalVacuumRequest(BaseModel):
    time: Optional[str] = "3d"
    size: Optional[str] = None


@router.get("/df")
async def get_disk_and_docker_df():
    """Retrieve host disk usage and docker reclaimable storage summary."""
    docker_items = []
    if shutil.which("docker"):
        try:
            proc = subprocess.run(
                ["docker", "system", "df", "--format", "{{json .}}"],
                capture_output=True,
                text=True,
                timeout=8,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                import json
                for line in proc.stdout.strip().splitlines():
                    if line.strip():
                        try:
                            docker_items.append(json.loads(line))
                        except Exception:
                            pass
        except Exception:
            pass

    # Host root partition
    total, used, free = shutil.disk_usage("/")
    used_pct = round((used / total) * 100, 1)

    return {
        "docker": parse_docker_df_output(docker_items),
        "disk_root": {
            "total_bytes": total,
            "used_bytes": used,
            "free_bytes": free,
            "used_percent": used_pct,
        },
    }


@router.post("/docker/prune")
async def trigger_docker_prune():
    """Execute docker system prune -f to reclaim dangling image and stopped container space."""
    if not shutil.which("docker"):
        raise HTTPException(status_code=503, detail="Docker is not available")

    try:
        proc = subprocess.run(
            ["docker", "system", "prune", "-f"],
            capture_output=True,
            text=True,
            timeout=45,
        )
        output = proc.stdout.strip()
        reclaimed_match = re.search(r"Total reclaimed space:\s*([^\n]+)", output)
        reclaimed = reclaimed_match.group(1) if reclaimed_match else "0B"

        return {
            "success": proc.returncode == 0,
            "reclaimed_space": reclaimed,
            "output": output,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prune failed: {str(e)}")


@router.post("/journal/vacuum")
async def trigger_journal_vacuum(req: JournalVacuumRequest):
    """Vacuum old user systemd journal files by time or size."""
    if not shutil.which("journalctl"):
        raise HTTPException(status_code=503, detail="journalctl is not available")

    cmd = ["journalctl", "--user"]
    if req.size:
        cmd.append(f"--vacuum-size={req.size}")
    else:
        cmd.append(f"--vacuum-time={req.time or '3d'}")

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        return {
            "success": proc.returncode == 0,
            "output": proc.stdout.strip() or proc.stderr.strip() or "Vacuum completed",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Journal vacuum failed: {str(e)}")


@router.post("/services/restart")
async def trigger_service_restart(req: ServiceRestartRequest):
    """Restart an allowed core user service."""
    unit = req.unit if req.unit.endswith(".service") else f"{req.unit}.service"
    if not is_service_allowed(unit):
        raise HTTPException(
            status_code=400,
            detail=f"Restarting service '{unit}' is not permitted. Only whitelisted core daemons can be managed.",
        )

    try:
        proc = subprocess.run(
            ["systemctl", "--user", "restart", unit],
            capture_output=True,
            text=True,
            timeout=25,
        )
        if proc.returncode != 0:
            raise HTTPException(status_code=500, detail=proc.stderr.strip() or "Restart failed")

        return {
            "success": True,
            "unit": unit,
            "message": f"Successfully restarted {unit}",
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail=f"Restarting {unit} timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
