# ⚡ FleetPulse

> **All-in-one host observability, btop-style process management, Beszel hardware telemetry, Tailscale mesh inspection, systemd journal streaming, and AI quota monitor.**

![FleetPulse](public/icon-192.png)

FleetPulse is an ultra-fast, lightweight, standalone observability engine and command deck designed for single-node and fleet infrastructure. It pairs a **FastAPI backend** running directly on the host with an **Obsidian-dark, mobile-first PWA frontend** built in TypeScript and Vite. Zero external SaaS dependencies, zero heavyweight agent daemons.

---

## ✨ Features

### 🖥️ Beszel-Style Hardware Telemetry
- **Vector-Sharp SVG Charts**: 2×2 high-fidelity time-series area charts for **CPU Usage (%)**, **Load Average (1m, 5m, 15m)**, **Memory Usage (GB)**, and **Swap Allocation (GB)**.
- **Host Metadata Ribbon**: Live host status (`● Up`), primary Tailscale/LAN IP, hostname, uptime, kernel/distribution (`Debian 13 trixie`), and CPU hardware model.
- **Dynamic Timeframes**: Toggle seamlessly between **1 hour**, **6 hours**, **24 hours**, and **7 days** with automatic backend downsampling.
- **SQLite WAL Persistence**: 7-day rolling telemetry database with continuous rolling aggregates (average/peak RAM, average/peak load).

### ⚡ btop-Style Interactive Task & Process Manager
- **Process Hierarchy**: Real-time tree/list views of host processes with PID, user, memory, CPU, and full command-line arguments.
- **Interactive Controls**: Instant tree search, sorting by CPU or RAM, and bounded signal controls (`SIGTERM`, `SIGKILL`).
- **Core Gauges**: Donut dials for total CPU, memory, and disk utilization, plus stacked distribution bars for top consumer processes.

### ⚙️ systemd Unit Management
- **Daemon Lifecycle**: Full control over user and system units (active, enabled, failed, stopped).
- **Control Actions**: Start, stop, restart, enable, disable, and reload daemons with live status feedback.
- **Inline Journal**: View recent unit logs directly without SSH.

### 🌐 Tailscale Mesh & Socket Inspector
- **Mesh Topology**: Live peer detection, Tailscale IPs, OS detection, WireGuard direct connections vs DERP relay latency.
- **Ingress Routes**: Status of active Tailscale Serve and Funnel proxy bindings.
- **Open Socket Auditor**: Parses `ss -tulpn` to map open listening ports and classify security exposure (`localhost`, `tailscale`, or `public`).

### 📜 System Journal & Kernel Health Watcher
- **Live Journal Streaming**: Streams user journal logs with filters for priority levels (`emerg`, `alert`, `crit`, `err`, `warning`, `info`, `debug`) and systemd unit.
- **Kernel Watcher**: Real-time tracking of kernel OOM kills via `/proc/vmstat`.
- **Linux PSI Gauges**: Direct telemetry for Linux Pressure Stall Information (`/proc/pressure/memory`, `cpu`, `io`).

### 🐳 Container Fleet Pulse (Dozzel-Style)
- **Container Overview**: Real-time container state, image tags, CPU percentage, memory allocation, and PIDs.
- **Log Streaming**: Live console streaming container output directly in the browser.

### 🔮 Antigravity AI Model Quota Monitor
- **Multi-Account Quotas**: Tracks Gemini and Claude pool headroom across multiple provider accounts.
- **Visual Bucket Gauges**: Radial dials and stacked bars displaying token quotas, rate limits, and reset countdowns.

### 🛠️ Bounded Remote Maintenance
- **Docker Housekeeping**: One-tap `docker system prune -f` with reclaimable space accounting.
- **Journal Vacuuming**: Automatic log vacuuming (`journalctl --vacuum-time=3d`).
- **Safe Daemon Restarts**: Whitelist-restricted restarts for critical daemons.

### 📱 Mobile-First PWA
- **Installable Web App**: Offline-ready Web App Manifest and service worker support.
- **Obsidian Dark Palette**: High-contrast `#09090b` charcoal palette with emerald (`#10b981`) and amethyst (`#a855f7`) accents.
- **Touch Navigation**: Fixed thumb-friendly bottom navigation bar for phones and tablets.

---

## 🚀 Quick Start

### 1. Requirements
- Linux (Debian, Ubuntu, Fedora, Arch, etc.)
- Python 3.11+
- Node.js 18+ & npm

### 2. Clone & Install
```bash
git clone https://github.com/parth5012/FleetPulse.git
cd FleetPulse

# Backend Setup
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Frontend Setup
npm install
npm run build
```

### 3. Run Locally
```bash
# Start backend API (serves static Vite bundle on port 8000)
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## 🔧 Systemd Service Installation (Auto-Start)

To run FleetPulse continuously as a user daemon on your machine:

```bash
mkdir -p ~/.config/systemd/user
cat << 'EOF' > ~/.config/systemd/user/fleetpulse.service
[Unit]
Description=FleetPulse - Host Observability, Tasks & Telemetry
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/parth/projects/dashboard-service
ExecStart=/home/parth/projects/dashboard-service/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now fleetpulse.service
```

---

## 🔒 Tailscale Serve / Remote HTTPS Access

Expose FleetPulse securely over your private WireGuard mesh with TLS certificates handled automatically by Tailscale:

```bash
# Expose on port 8443 with Tailscale HTTPS
tailscale serve --bg --https=8443 127.0.0.1:8000

# Access securely from any phone, laptop, or tablet in your tailnet:
# https://<your-node>.tailnet-name.ts.net:8443
```

---

## 🧪 Testing & Verification

```bash
# Run Python backend test suite (FastAPI, SQLite, psutil)
pytest -v

# Run Frontend unit tests (Vitest)
npm run test

# Typecheck and production bundle build
npm run build
```

---

## 📄 License

MIT © [Parth](https://github.com/parth5012)
