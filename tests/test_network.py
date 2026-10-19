"""Tests for Network Inspector API (Tailscale mesh & Listening ports)."""

import sys
from pathlib import Path

project_dir = Path(__file__).parent.parent
if str(project_dir) not in sys.path:
    sys.path.insert(0, str(project_dir))

import pytest
from fastapi.testclient import TestClient
from main import app
from network_inspector import parse_ss_output, parse_tailscale_status, parse_tailscale_serve

client = TestClient(app)


def test_parse_ss_output():
    sample_ss = """Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess
tcp   LISTEN 0      2048   127.0.0.1:8000      0.0.0.0:*   users:(("uvicorn",pid=1234,fd=7))
tcp   LISTEN 0      4096   100.87.250.35:8443  0.0.0.0:*   
udp   UNCONN 0      0      0.0.0.0:5353        0.0.0.0:*   
"""
    sockets = parse_ss_output(sample_ss)
    assert len(sockets) == 3

    s1 = sockets[0]
    assert s1["protocol"] == "tcp"
    assert s1["port"] == 8000
    assert s1["process"] == "uvicorn"
    assert s1["pid"] == 1234
    assert s1["exposure"] == "localhost"

    s2 = sockets[1]
    assert s2["protocol"] == "tcp"
    assert s2["port"] == 8443
    assert s2["exposure"] == "tailscale"

    s3 = sockets[2]
    assert s3["protocol"] == "udp"
    assert s3["port"] == 5353
    assert s3["exposure"] == "public"


def test_parse_tailscale_status():
    sample_status = {
        "BackendState": "Running",
        "Self": {
            "HostName": "debian",
            "DNSName": "debian.tail46d59a.ts.net.",
            "TailscaleIPs": ["100.87.250.35"],
            "OS": "linux",
        },
        "Peer": {
            "p1": {
                "HostName": "phone",
                "DNSName": "phone.ts.net.",
                "TailscaleIPs": ["100.127.133.83"],
                "OS": "android",
                "Online": True,
                "CurAddr": "",
                "Relay": "blr",
                "RxBytes": 1024,
                "TxBytes": 2048,
            },
            "p2": {
                "HostName": "desktop",
                "DNSName": "desktop.ts.net.",
                "TailscaleIPs": ["100.80.191.28"],
                "OS": "windows",
                "Online": True,
                "CurAddr": "10.99.183.172:41641",
                "Relay": "blr",
                "RxBytes": 5000,
                "TxBytes": 6000,
            },
        },
    }
    parsed = parse_tailscale_status(sample_status)
    assert parsed["backend_state"] == "Running"
    assert parsed["self_node"]["hostname"] == "debian"
    assert len(parsed["peers"]) == 2
    desktop_peer = next(p for p in parsed["peers"] if p["hostname"] == "desktop")
    phone_peer = next(p for p in parsed["peers"] if p["hostname"] == "phone")
    assert desktop_peer["is_direct"] is True
    assert phone_peer["is_direct"] is False


def test_parse_tailscale_serve():
    sample_serve = {
        "Web": {
            "debian.ts.net:8443": {
                "Handlers": {
                    "/": {"Proxy": "http://127.0.0.1:8000"}
                }
            }
        }
    }
    routes = parse_tailscale_serve(sample_serve)
    assert len(routes) == 1
    assert routes[0]["port"] == 8443
    assert routes[0]["path"] == "/"
    assert routes[0]["proxy_target"] == "http://127.0.0.1:8000"


def test_api_network_tailscale():
    response = client.get("/api/network/tailscale")
    assert response.status_code == 200
    data = response.json()
    assert "backend_state" in data
    assert "peers" in data
    assert "serve_routes" in data


def test_api_network_ports():
    response = client.get("/api/network/ports")
    assert response.status_code == 200
    data = response.json()
    assert "ports" in data
    assert "count" in data
    assert len(data["ports"]) > 0
