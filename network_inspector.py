"""Network Inspector: Tailscale Mesh Topology, Serve/Funnel Routes & Open Listening Sockets."""

import json
import re
import shutil
import subprocess
from typing import Any, Dict, List, Optional
from fastapi import APIRouter

router = APIRouter(prefix="/api/network", tags=["network"])


def parse_ss_output(text: str) -> List[Dict[str, Any]]:
    """Parse `ss -tulpn` or `ss -tuln` stdout into structured listening socket objects."""
    lines = text.strip().splitlines()
    sockets = []
    for line in lines:
        parts = line.split()
        if len(parts) >= 5 and parts[0] in ("tcp", "udp"):
            protocol = parts[0]
            state = parts[1]
            local_addr = parts[4]

            ip = ""
            port = 0
            if ":" in local_addr:
                ip, port_str = local_addr.rsplit(":", 1)
                try:
                    port = int(port_str)
                except ValueError:
                    port = 0
            else:
                ip = local_addr

            # Exposure classification
            exposure = "public"
            if ip in ("127.0.0.1", "::1", "[::1]"):
                exposure = "localhost"
            elif ip.startswith("100.") or ip.startswith("fd7a:") or ip.startswith("[fd7a:"):
                exposure = "tailscale"
            elif ip in ("0.0.0.0", "[::]", "*"):
                exposure = "public"

            process = ""
            pid: Optional[int] = None
            # users:(("name",pid=123,fd=4))
            proc_match = re.search(r'users:\(\("([^"]+)",pid=(\d+)', line)
            if proc_match:
                process = proc_match.group(1)
                pid = int(proc_match.group(2))

            sockets.append({
                "protocol": protocol,
                "state": state,
                "local_address": ip,
                "port": port,
                "exposure": exposure,
                "process": process,
                "pid": pid,
            })
    return sockets


def parse_tailscale_status(data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract self and peer node topology from `tailscale status --json`."""
    backend_state = data.get("BackendState", "Unknown")
    self_raw = data.get("Self", {})
    self_node = {
        "hostname": self_raw.get("HostName", "Unknown"),
        "dns_name": self_raw.get("DNSName", "").rstrip("."),
        "tailscale_ips": self_raw.get("TailscaleIPs", []),
        "os": self_raw.get("OS", "linux"),
        "online": self_raw.get("Online", True),
        "rx_bytes": self_raw.get("RxBytes", 0),
        "tx_bytes": self_raw.get("TxBytes", 0),
    }

    peers = []
    for _, peer_raw in (data.get("Peer") or {}).items():
        cur_addr = peer_raw.get("CurAddr", "")
        relay = peer_raw.get("Relay", "")
        is_direct = bool(cur_addr)

        peers.append({
            "hostname": peer_raw.get("HostName", "Unknown"),
            "dns_name": peer_raw.get("DNSName", "").rstrip("."),
            "tailscale_ips": peer_raw.get("TailscaleIPs", []),
            "os": peer_raw.get("OS", "unknown"),
            "online": peer_raw.get("Online", False),
            "cur_addr": cur_addr,
            "relay": relay,
            "is_direct": is_direct,
            "rx_bytes": peer_raw.get("RxBytes", 0),
            "tx_bytes": peer_raw.get("TxBytes", 0),
            "last_seen": peer_raw.get("LastSeen"),
            "last_handshake": peer_raw.get("LastHandshake"),
        })

    # Sort peers: online first, then by hostname
    peers.sort(key=lambda p: (not p["online"], p["hostname"].lower()))

    return {
        "backend_state": backend_state,
        "self_node": self_node,
        "peers": peers,
        "peer_count": len(peers),
    }


def parse_tailscale_serve(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Parse active Serve / Funnel routes from `tailscale serve status --json`."""
    routes = []
    web = data.get("Web") or {}
    for host_port, spec in web.items():
        port = 0
        if ":" in host_port:
            try:
                port = int(host_port.rsplit(":", 1)[1])
            except ValueError:
                port = 0

        handlers = spec.get("Handlers") or {}
        for path, target_obj in handlers.items():
            proxy_target = target_obj.get("Proxy", "")
            routes.append({
                "host": host_port.split(":")[0],
                "port": port,
                "path": path,
                "proxy_target": proxy_target,
            })
    return routes


@router.get("/tailscale")
async def get_tailscale_status():
    """Retrieve full Tailscale mesh topology, peer statuses, and active Serve routes."""
    if not shutil.which("tailscale"):
        return {
            "installed": False,
            "backend_state": "NotInstalled",
            "self_node": {},
            "peers": [],
            "peer_count": 0,
            "serve_routes": [],
        }

    status_data = {}
    try:
        proc = subprocess.run(["tailscale", "status", "--json"], capture_output=True, text=True, timeout=5)
        if proc.returncode == 0 and proc.stdout.strip():
            status_data = json.loads(proc.stdout)
    except Exception:
        pass

    serve_routes = []
    try:
        proc_serve = subprocess.run(["tailscale", "serve", "status", "--json"], capture_output=True, text=True, timeout=5)
        if proc_serve.returncode == 0 and proc_serve.stdout.strip():
            serve_routes = parse_tailscale_serve(json.loads(proc_serve.stdout))
    except Exception:
        pass

    parsed = parse_tailscale_status(status_data)
    parsed["installed"] = True
    parsed["serve_routes"] = serve_routes
    return parsed


@router.get("/ports")
async def get_listening_ports():
    """Retrieve active TCP & UDP listening sockets, bindings, and associated processes."""
    output = ""
    try:
        proc = subprocess.run(["ss", "-tulpn"], capture_output=True, text=True, timeout=5)
        output = proc.stdout
    except Exception:
        pass

    if not output:
        try:
            proc = subprocess.run(["ss", "-tuln"], capture_output=True, text=True, timeout=5)
            output = proc.stdout
        except Exception:
            pass

    sockets = parse_ss_output(output)
    # Sort: TCP first, then by port number
    sockets.sort(key=lambda s: (0 if s["protocol"] == "tcp" else 1, s["port"]))

    return {
        "ports": sockets,
        "count": len(sockets),
    }
