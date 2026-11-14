/**
 * Beszel-Style High-Fidelity System Telemetry & Mesh Dashboard.
 * 2x2 time-series area charts, host metadata ribbon, sub-tabs (Core, Disk, Network & Mesh, Containers),
 * timeframe controls (1h, 6h, 24h, 7d), plus absorbed Tailscale mesh topology, serve routes,
 * and open listening sockets inspection.
 */

import {
  fetchSystemMetrics,
  fetchSystemHistory,
  fetchContainers,
  fetchSystemStats,
  fetchTailscaleStatus,
  fetchListeningPorts,
} from '../lib/api';
import { formatBytes, formatUptime, esc } from '../lib/format';
import { renderBeszelChart, renderBarGauge } from '../lib/charts';
import type {
  SystemSnapshot,
  SystemHistoryPoint,
  ContainerSummary,
  SystemStatsResponse,
  TailscaleStatusResponse,
  PortsResponse,
  SocketPort,
  TailscalePeer,
} from '../lib/api';

let pollTimer: number | null = null;

export async function renderSystem(container: HTMLElement): Promise<void> {
  // Support deep-linking to subtabs, e.g. #/system?tab=network
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const tabParam = urlParams.get('tab');
  let activeTab: 'core' | 'network' | 'disk' | 'containers' =
    tabParam === 'network' || tabParam === 'disk' || tabParam === 'containers' ? tabParam : 'core';

  let currentTimeframeHours = 1;
  let isPaused = false;

  let currentSnapshot: SystemSnapshot | null = null;
  let currentHistory: SystemHistoryPoint[] = [];

  container.innerHTML = `
    <!-- Host Header & Summary Ribbon -->
    <div class="beszel-host-header" id="beszelHostHeader">
      <div class="beszel-host-title-row">
        <div class="beszel-host-left">
          <div class="beszel-host-name" id="bHostTitle">local-host</div>
          <span class="beszel-status-up"><span class="status-dot status-green"></span> Up</span>
        </div>

        <div class="beszel-header-controls">
          <div class="beszel-time-dropdown-wrap">
            <select id="beszelTimeSelect" class="beszel-select" aria-label="Timeframe">
              <option value="1" selected>Last 1 hour</option>
              <option value="6">Last 6 hours</option>
              <option value="24">Last 24 hours</option>
              <option value="168">Last 7 days</option>
            </select>
          </div>
          <button id="refreshBeszelBtn" class="beszel-icon-btn" title="Refresh telemetry" aria-label="Refresh telemetry">↻</button>
        </div>
      </div>

      <div class="beszel-meta-chips" id="bMetaChips">
        <div class="chip-item"><code id="bIp">-</code></div>
        <div class="chip-item"><strong id="bHostname">-</strong></div>
        <div class="chip-item"><span id="bUptime">-</span></div>
        <div class="chip-item"><span id="bDistro">-</span></div>
        <div class="chip-item"><span id="bCpuModel">-</span></div>
        <div class="chip-item"><strong id="bRamTotal">-</strong></div>
      </div>
    </div>

    <!-- Beszel Sub-Navigation Tabs -->
    <div class="beszel-subnav" id="beszelSubnav">
      <button class="beszel-tab ${activeTab === 'core' ? 'active' : ''}" data-tab="core">Core Vitals</button>
      <button class="beszel-tab ${activeTab === 'disk' ? 'active' : ''}" data-tab="disk">Disks & Partitions</button>
      <button class="beszel-tab ${activeTab === 'network' ? 'active' : ''}" data-tab="network">Network & Tailscale</button>
      <button class="beszel-tab ${activeTab === 'containers' ? 'active' : ''}" data-tab="containers">Container Telemetry</button>
    </div>

    <!-- Active Tab Container -->
    <div id="beszelTabContent">
      <div class="loading-state" style="padding:40px;"><div class="spin">⚡</div></div>
    </div>

    <!-- SQLite Persistent Telemetry & Rolling Aggregates Section -->
    <div class="sqlite-stats-card" id="sqliteStatsCard" style="margin-top:28px;">
      <div class="sqlite-stats-header">
        <div>
          <div class="sqlite-title">
            <span>Persistent telemetry & rolling averages</span>
            <span class="badge badge-info" id="sqliteSampleBadge">Active engine</span>
          </div>
          <div class="muted" style="font-size:0.8rem;margin-top:2px;">
            Historical metrics database: rolling averages, peak loads, and RAM consumption across timeframes
          </div>
        </div>
        <span class="freq-tag" id="statRetentionTag">Stored in SQLite WAL</span>
      </div>

      <div class="sqlite-metrics-row">
        <!-- Avg RAM -->
        <div class="sqlite-metric-tile">
          <div class="sqlite-tile-head">
            <span class="indicator-dot dot-mem"></span>
            <span>Average RAM Usage</span>
          </div>
          <div class="sqlite-tile-val" id="statAvgRam">0.0%</div>
          <div class="sqlite-tile-sub" id="statRamRange">Min: 0% · Peak: 0%</div>
          <div class="bar-outer" style="height:4px;margin-top:6px;">
            <div class="bar-inner" id="statRamBar" style="width:0%;background:#a855f7;"></div>
          </div>
        </div>

        <!-- Avg Load -->
        <div class="sqlite-metric-tile">
          <div class="sqlite-tile-head">
            <span class="indicator-dot dot-cpu"></span>
            <span>Average System Load</span>
          </div>
          <div class="sqlite-tile-val" id="statAvgLoad">0.00</div>
          <div class="sqlite-tile-sub" id="statLoadRange">5m: 0.00 · 15m: 0.00 · Peak 1m: 0.00</div>
          <div class="bar-outer" style="height:4px;margin-top:6px;">
            <div class="bar-inner" id="statLoadBar" style="width:0%;background:#10b981;"></div>
          </div>
        </div>

        <!-- Avg CPU -->
        <div class="sqlite-metric-tile">
          <div class="sqlite-tile-head">
            <span class="indicator-dot dot-cpu"></span>
            <span>Average CPU Utilization</span>
          </div>
          <div class="sqlite-tile-val" id="statAvgCpu">0.0%</div>
          <div class="sqlite-tile-sub" id="statCpuPeak">Peak: 0.0%</div>
          <div class="bar-outer" style="height:4px;margin-top:6px;">
            <div class="bar-inner" id="statCpuBar" style="width:0%;background:#10b981;"></div>
          </div>
        </div>

        <!-- Sample Count -->
        <div class="sqlite-metric-tile">
          <div class="sqlite-tile-head">
            <span class="indicator-dot dot-disk"></span>
            <span>Sampled Data Points</span>
          </div>
          <div class="sqlite-tile-val" id="statSampleCount">0</div>
          <div class="sqlite-tile-sub" id="statDbSub">7-day automatic retention</div>
          <div class="bar-outer" style="height:4px;margin-top:6px;">
            <div class="bar-inner" style="width:100%;background:#06b6d4;"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  function updateHostBar(snap: SystemSnapshot): void {
    const titleEl = container.querySelector('#bHostTitle') as HTMLElement;
    const ipEl = container.querySelector('#bIp') as HTMLElement;
    const hostEl = container.querySelector('#bHostname') as HTMLElement;
    const upEl = container.querySelector('#bUptime') as HTMLElement;
    const distroEl = container.querySelector('#bDistro') as HTMLElement;
    const cpuEl = container.querySelector('#bCpuModel') as HTMLElement;
    const ramEl = container.querySelector('#bRamTotal') as HTMLElement;

    if (titleEl) titleEl.textContent = snap.host.hostname || 'local-host';
    if (ipEl) ipEl.textContent = snap.host.ip_address || '172.18.0.1';
    if (hostEl) hostEl.textContent = snap.host.hostname || 'debian';
    if (upEl) upEl.textContent = formatUptime(snap.host.uptime_seconds);
    if (distroEl) distroEl.textContent = snap.host.distro || `${snap.host.platform} ${snap.host.os_release}`;
    if (cpuEl) cpuEl.textContent = snap.host.cpu_model || `${snap.cpu.core_count_logical} Cores`;
    if (ramEl) ramEl.textContent = formatBytes(snap.memory.total_bytes);
  }

  function renderActiveTab(): void {
    const content = container.querySelector('#beszelTabContent') as HTMLElement;
    if (!content) return;

    if (activeTab === 'core') {
      renderCoreTab(content);
    } else if (activeTab === 'network') {
      renderNetworkTab(content);
    } else if (activeTab === 'disk') {
      renderDiskTab(content);
    } else if (activeTab === 'containers') {
      renderContainersTab(content);
    }
  }

  function renderCoreTab(target: HTMLElement): void {
    const hist = currentHistory || [];
    const timestamps = hist.map((h) => h.timestamp);

    // 1. CPU Usage
    const cpuValues = hist.map((h) => h.cpu);
    const cpuChartHtml = renderBeszelChart(
      [
        {
          name: 'CPU Usage',
          color: '#10b981',
          values: cpuValues,
          gradient: true,
        },
      ],
      {
        title: 'CPU Usage',
        subtitle: 'Average across all logical cores',
        unit: '%',
        timestamps,
      }
    );

    // 2. Load Average
    const load1Values = hist.map((h) => h.load_1m || 0);
    const load5Values = hist.map((h) => h.load_5m || 0);
    const load15Values = hist.map((h) => h.load_15m || 0);

    const loadChartHtml = renderBeszelChart(
      [
        { name: '1m Load', color: '#10b981', values: load1Values },
        { name: '5m Load', color: '#3b82f6', values: load5Values },
        { name: '15m Load', color: '#a855f7', values: load15Values },
      ],
      {
        title: 'System Load Average',
        subtitle: 'POSIX load running and uninterruptible tasks',
        unit: '',
        legend: true,
        timestamps,
      }
    );

    // 3. Memory Usage (in GB)
    const memGbValues = hist.map((h) => {
      const bytes = h.memory_used_bytes || (h.memory / 100) * (currentSnapshot?.memory.total_bytes || 6000000000);
      return Math.round((bytes / 1024 ** 3) * 100) / 100;
    });

    const memChartHtml = renderBeszelChart(
      [
        {
          name: 'Used RAM',
          color: '#10b981',
          values: memGbValues,
          gradient: true,
        },
      ],
      {
        title: 'Memory Usage',
        subtitle: 'Precise utilization at the recorded time',
        unit: 'GB',
        timestamps,
      }
    );

    // 4. Swap Usage (in GB)
    const swapGbValues = hist.map((h) => {
      const pct = h.swap || h.swap_used_percent || 0;
      const totalSwap = currentSnapshot?.memory.swap_total_bytes || 0;
      const bytes = (pct / 100) * totalSwap;
      return Math.round((bytes / 1024 ** 3) * 100) / 100;
    });

    const swapChartHtml = renderBeszelChart(
      [
        {
          name: 'Swap Used',
          color: '#06b6d4',
          values: swapGbValues,
          gradient: true,
        },
      ],
      {
        title: 'Swap Usage',
        subtitle: 'Swap space used by the system',
        unit: 'GB',
        timestamps,
      }
    );

    target.innerHTML = `
      <div class="beszel-charts-grid">
        ${cpuChartHtml}
        ${loadChartHtml}
        ${memChartHtml}
        ${swapChartHtml}
      </div>

      <!-- CPU Per-Core Distribution Expander -->
      ${
        currentSnapshot
          ? `
        <div class="beszel-chart-card" style="margin-top:16px;">
          <div class="beszel-chart-header">
            <div>
              <h3 class="beszel-chart-title">CPU Per-Core Distribution</h3>
              <div class="beszel-chart-subtitle">Utilization across ${currentSnapshot.cpu.core_count_logical} logical cores</div>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px; margin-top:12px;">
            ${(currentSnapshot.cpu.per_core || [])
              .map(
                (pct: number, idx: number) => `
              <div style="padding:10px; background:var(--gb-surface-2); border:1px solid var(--gb-border); border-radius:var(--gb-radius-sm);">
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--gb-muted); margin-bottom:4px;">
                  <span>Core ${idx}</span>
                  <strong style="color:var(--gb-text);">${pct.toFixed(1)}%</strong>
                </div>
                <div class="bar-outer" style="height:6px;">
                  <div class="bar-inner ${pct > 85 ? 'bar-low' : pct > 70 ? 'bar-med' : 'bar-ok'}" style="width:${pct}%;"></div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }
    `;
  }

  function renderNetworkTab(target: HTMLElement): void {
    const hist = currentHistory || [];
    const timestamps = hist.map((h) => h.timestamp);

    const rxValues = hist.map((h) => h.net_rx_kb || 0);
    const txValues = hist.map((h) => h.net_tx_kb || 0);

    const netChartHtml = renderBeszelChart(
      [
        { name: 'Download (Rx)', color: '#3b82f6', values: rxValues },
        { name: 'Upload (Tx)', color: '#f97316', values: txValues },
      ],
      {
        title: 'Network Traffic',
        subtitle: 'Real-time bandwidth throughput rate',
        unit: 'KB/s',
        legend: true,
        timestamps,
      }
    );

    const netSnap = currentSnapshot?.network;
    const curRx = netSnap ? netSnap.bytes_recv_per_sec / 1024 : 0;
    const curTx = netSnap ? netSnap.bytes_sent_per_sec / 1024 : 0;

    target.innerHTML = `
      <div class="beszel-charts-grid">
        ${netChartHtml}

        <div class="beszel-chart-card">
          <div class="beszel-chart-header">
            <div>
              <h3 class="beszel-chart-title">Current Interface Rates</h3>
              <div class="beszel-chart-subtitle">Real-time socket and packet metrics</div>
            </div>
          </div>

          <div style="padding:10px 0; display:flex; flex-direction:column; gap:12px;">
            <div class="net-rates-box" style="margin-top:0;">
              <div class="net-rate-item net-rx">
                <span class="arrow-icon">⬇</span>
                <div>
                  <div class="rate-val">${curRx > 1024 ? `${(curRx / 1024).toFixed(2)} MB/s` : `${curRx.toFixed(1)} kB/s`}</div>
                  <div class="rate-label">Incoming Download</div>
                </div>
              </div>
              <div class="net-rate-item net-tx">
                <span class="arrow-icon">⬆</span>
                <div>
                  <div class="rate-val">${curTx > 1024 ? `${(curTx / 1024).toFixed(2)} MB/s` : `${curTx.toFixed(1)} kB/s`}</div>
                  <div class="rate-label">Outgoing Upload</div>
                </div>
              </div>
            </div>

            <div class="service-meta-list" style="margin-top:8px;">
              <div><span>Packets In:</span> <strong>${Math.round(netSnap?.packets_recv_per_sec || 0)} pkt/s</strong></div>
              <div><span>Packets Out:</span> <strong>${Math.round(netSnap?.packets_sent_per_sec || 0)} pkt/s</strong></div>
              <div><span>Mesh State:</span> <strong style="color:var(--gb-ok);">Tailscale Active</strong></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Absorbed Tailscale Mesh Topology -->
      <div class="network-mesh-section" style="margin-top:24px;">
        <div class="section-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span>🔒 Tailscale Mesh Topology</span>
          <span class="badge badge-info" id="meshPeerCountBadge">Querying mesh...</span>
        </div>
        <div class="mesh-cards-grid" id="meshCardsGrid">
          <div class="loading-state" style="padding:24px;"><div class="spin">⚡</div></div>
        </div>
      </div>

      <!-- Absorbed Tailscale Serve & Funnel Routes -->
      <div class="serve-routes-section" style="margin-top:24px;">
        <div class="section-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span>🔀 Active Tailscale Serve & HTTPS Ingress Routes</span>
          <span class="badge badge-info" id="serveCountBadge">0 Routes</span>
        </div>
        <div class="serve-routes-table-wrap" style="overflow-x:auto;">
          <table class="data-table" id="serveTable">
            <thead>
              <tr>
                <th>Ingress Port</th>
                <th>Host / Domain</th>
                <th>Path</th>
                <th>Local Proxy Target</th>
                <th>TLS Mode</th>
              </tr>
            </thead>
            <tbody id="serveTableBody">
              <tr><td colspan="5" class="muted" style="text-align:center;padding:16px;">Loading serve routes...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Absorbed Listening Ports & Open Sockets -->
      <div class="sockets-section" style="margin-top:24px;">
        <div class="sockets-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
          <div>
            <div class="section-title">
              <span>🔌 Open Listening Sockets (ss -tulpn)</span>
              <span class="badge badge-info" id="portsCountBadge">0 Sockets</span>
            </div>
            <div class="muted" style="font-size:0.8rem;margin-top:2px;">
              Audited network sockets bound to localhost, Tailscale, or public interfaces
            </div>
          </div>
          <div class="sockets-controls" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <div class="timeframe-buttons" id="socketExposureFilters">
              <button class="btn btn-sm btn-primary" data-filter="all">All</button>
              <button class="btn btn-sm" data-filter="tailscale">Tailscale</button>
              <button class="btn btn-sm" data-filter="public">Public</button>
              <button class="btn btn-sm" data-filter="localhost">Localhost</button>
            </div>
            <input type="text" id="socketSearchInput" class="input-sm" placeholder="Filter port or process..." style="min-width:160px;" />
          </div>
        </div>

        <div class="sockets-table-wrap" style="overflow-x:auto;">
          <table class="data-table" id="socketsTable">
            <thead>
              <tr>
                <th>Protocol</th>
                <th>Port</th>
                <th>Exposure</th>
                <th>Local Address</th>
                <th>Process</th>
                <th>PID</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody id="socketsTableBody">
              <tr><td colspan="7" class="muted" style="text-align:center;padding:16px;">Auditing open sockets...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    loadMeshAndSockets(target);
  }

  function getOsIcon(os: string): string {
    const o = os.toLowerCase();
    if (o.includes('linux') || o.includes('debian') || o.includes('ubuntu')) return '🐧';
    if (o.includes('windows')) return '🪟';
    if (o.includes('darwin') || o.includes('macos') || o.includes('ios')) return '🍎';
    if (o.includes('android')) return '🤖';
    return '💻';
  }

  async function loadMeshAndSockets(parent: HTMLElement): Promise<void> {
    const grid = parent.querySelector('#meshCardsGrid') as HTMLElement;
    const peerBadge = parent.querySelector('#meshPeerCountBadge') as HTMLElement;
    const serveBadge = parent.querySelector('#serveCountBadge') as HTMLElement;
    const serveTbody = parent.querySelector('#serveTableBody') as HTMLElement;
    const socketsTbody = parent.querySelector('#socketsTableBody') as HTMLElement;
    const socketsBadge = parent.querySelector('#portsCountBadge') as HTMLElement;
    const searchInput = parent.querySelector('#socketSearchInput') as HTMLInputElement;
    const filterBtns = parent.querySelectorAll('#socketExposureFilters button') as NodeListOf<HTMLButtonElement>;

    let cachedPorts: SocketPort[] = [];
    let currentExposure = 'all';
    let searchQuery = '';

    // Load Tailscale mesh
    try {
      const data: TailscaleStatusResponse = await fetchTailscaleStatus();
      if (!data.installed || data.backend_state !== 'Running') {
        if (grid) {
          grid.innerHTML = `
            <div class="empty-state" style="padding:20px;grid-column:1/-1;">
              <p>⚠️ Tailscale daemon is not running or not logged in (${esc(data.backend_state)}).</p>
            </div>
          `;
        }
      } else {
        if (peerBadge) peerBadge.textContent = `${data.peer_count} Peers Connected`;
        const self = data.self_node;
        const selfHtml = `
          <div class="mesh-node-card self-card">
            <div class="node-head">
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="status-dot status-green"></span>
                <strong>${esc(self.hostname)} (This Box)</strong>
              </div>
              <span class="badge badge-info">HOST NODE</span>
            </div>
            <div class="node-ip"><code>${esc(self.tailscale_ips[0] || '-')}</code></div>
            <div class="node-meta">
              <div><span class="lbl">DNS:</span> <code>${esc(self.dns_name)}</code></div>
              <div><span class="lbl">OS:</span> ${getOsIcon(self.os)} ${esc(self.os)}</div>
            </div>
          </div>
        `;

        const peersHtml = data.peers.map((p: TailscalePeer) => {
          const isOnline = p.online;
          const connBadge = p.is_direct
            ? '<span class="badge badge-success">DIRECT WireGuard</span>'
            : `<span class="badge badge-warn">RELAY (${esc(p.relay || 'DERP')})</span>`;

          return `
            <div class="mesh-node-card ${isOnline ? '' : 'node-offline'}">
              <div class="node-head">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="status-dot ${isOnline ? 'status-green' : 'status-gray'}"></span>
                  <strong>${esc(p.hostname)}</strong>
                </div>
                ${connBadge}
              </div>
              <div class="node-ip"><code>${esc(p.tailscale_ips[0] || '-')}</code></div>
              <div class="node-meta">
                <div><span class="lbl">DNS:</span> <code>${esc(p.dns_name)}</code></div>
                <div><span class="lbl">OS:</span> ${getOsIcon(p.os)} ${esc(p.os)}</div>
                ${p.cur_addr ? `<div><span class="lbl">Endpoint:</span> <code>${esc(p.cur_addr)}</code></div>` : ''}
                ${(p.rx_bytes || p.tx_bytes) ? `<div><span class="lbl">Traffic:</span> ↓ ${formatBytes(p.rx_bytes || 0)} · ↑ ${formatBytes(p.tx_bytes || 0)}</div>` : ''}
              </div>
            </div>
          `;
        }).join('');

        if (grid) grid.innerHTML = selfHtml + peersHtml;

        if (serveBadge) serveBadge.textContent = `${data.serve_routes.length} Ingress Routes`;
        if (serveTbody) {
          if (data.serve_routes.length === 0) {
            serveTbody.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;padding:16px;">No Tailscale Serve or Funnel ingress routes configured.</td></tr>`;
          } else {
            serveTbody.innerHTML = data.serve_routes.map((r) => `
              <tr>
                <td><strong>:${r.port}</strong></td>
                <td><code>${esc(r.host)}</code></td>
                <td><code>${esc(r.path)}</code></td>
                <td><span class="c-pill" style="color:var(--gb-ok);">${esc(r.proxy_target)}</span></td>
                <td><span class="badge badge-info">TLS Terminated</span></td>
              </tr>
            `).join('');
          }
        }
      }
    } catch {
      if (grid) grid.innerHTML = `<div class="empty-state" style="padding:20px;grid-column:1/-1;"><p>Error querying Tailscale status</p></div>`;
    }

    // Load Listening Ports
    function renderSocketsTable(): void {
      if (!socketsTbody) return;
      const filtered = cachedPorts.filter((p) => {
        if (currentExposure !== 'all' && p.exposure !== currentExposure) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            String(p.port).includes(q) ||
            (p.process || '').toLowerCase().includes(q) ||
            p.local_address.toLowerCase().includes(q)
          );
        }
        return true;
      });

      if (socketsBadge) socketsBadge.textContent = `${filtered.length} Sockets`;

      if (filtered.length === 0) {
        socketsTbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:16px;">No listening sockets match filter.</td></tr>`;
        return;
      }

      socketsTbody.innerHTML = filtered.map((s) => {
        let expClass = 'badge-info';
        let expText = 'Localhost';
        if (s.exposure === 'tailscale') {
          expClass = 'badge-success';
          expText = 'Tailscale Mesh';
        } else if (s.exposure === 'public') {
          expClass = 'badge-warn';
          expText = 'Public (0.0.0.0)';
        }

        return `
          <tr>
            <td><span class="badge-scope scope-user" style="font-weight:700;">${esc(s.protocol.toUpperCase())}</span></td>
            <td><strong style="font-size:1.05rem;">${s.port}</strong></td>
            <td><span class="badge ${expClass}">${expText}</span></td>
            <td><code>${esc(s.local_address)}</code></td>
            <td><strong style="color:var(--gb-ok);">${esc(s.process || 'system / root')}</strong></td>
            <td><code>${s.pid ? s.pid : '-'}</code></td>
            <td><span class="status-dot status-green"></span> ${esc(s.state || 'LISTEN')}</td>
          </tr>
        `;
      }).join('');
    }

    try {
      const pData: PortsResponse = await fetchListeningPorts();
      cachedPorts = pData.ports || [];
      renderSocketsTable();
    } catch {
      if (socketsTbody) socketsTbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:16px;">Failed to audit sockets.</td></tr>`;
    }

    // Wire socket search
    searchInput?.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value;
      renderSocketsTable();
    });

    // Wire exposure filters
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterBtns.forEach((b) => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
        currentExposure = btn.dataset.filter || 'all';
        renderSocketsTable();
      });
    });
  }

  function renderDiskTab(target: HTMLElement): void {
    const hist = currentHistory || [];
    const timestamps = hist.map((h) => h.timestamp);

    const readValues = hist.map((h) => Math.round(((h.disk_read_kb || 0) / 1024) * 100) / 100);
    const writeValues = hist.map((h) => Math.round(((h.disk_write_kb || 0) / 1024) * 100) / 100);

    const ioChartHtml = renderBeszelChart(
      [
        { name: 'Read', color: '#3b82f6', values: readValues },
        { name: 'Write', color: '#10b981', values: writeValues },
      ],
      {
        title: 'Disk Throughput (I/O)',
        subtitle: 'Read & write bandwidth over time',
        unit: 'MB/s',
        legend: true,
        timestamps,
      }
    );

    const parts = currentSnapshot?.disk.partitions || [];

    target.innerHTML = `
      <div class="beszel-charts-grid" style="grid-template-columns: 1fr;">
        ${ioChartHtml}

        <div class="beszel-chart-card">
          <div class="beszel-chart-header">
            <div>
              <h3 class="beszel-chart-title">Disk Partitions & Mounts</h3>
              <div class="beszel-chart-subtitle">Storage occupancy per block device</div>
            </div>
          </div>

          <div style="padding:14px 0; display:flex; flex-direction:column; gap:16px;">
            ${parts
              .map(
                (p) => `
              <div>
                <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px;">
                  <span><code>${esc(p.mountpoint)}</code> (${esc(p.fstype)})</span>
                  <strong>${formatBytes(p.used_bytes)} / ${formatBytes(p.total_bytes)} (${p.used_percent}%)</strong>
                </div>
                <div class="bar-outer" style="height:7px;">
                  <div class="bar-inner ${p.used_percent > 85 ? 'bar-low' : p.used_percent > 70 ? 'bar-med' : 'bar-ok'}" style="width:${p.used_percent}%;"></div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  async function renderContainersTab(target: HTMLElement): Promise<void> {
    try {
      const res = await fetchContainers();
      const list = res.containers || [];

      if (list.length === 0) {
        target.innerHTML = `
          <div class="empty-state" style="padding:40px;">
            <p>No active Docker containers reporting to host.</p>
          </div>
        `;
        return;
      }

      target.innerHTML = `
        <div class="containers-mini-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px;">
          ${list
            .map(
              (c: ContainerSummary) => `
            <div class="container-pulse-card" style="padding:14px; background:var(--gb-surface-2); border:1px solid var(--gb-border); border-radius:var(--gb-radius);">
              <div class="card-head" style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="status-dot ${c.state === 'running' ? 'status-green' : 'status-gray'}"></span>
                  <strong>${esc(c.name)}</strong>
                </div>
                <span class="badge ${c.state === 'running' ? 'badge-success' : 'badge-error'}">${esc(c.state.toUpperCase())}</span>
              </div>
              <div class="c-image" style="font-size:0.75rem; color:var(--gb-muted); margin:6px 0;"><code>${esc(c.image)}</code></div>
              <div class="c-stats-row" style="display:flex; justify-content:space-between; font-size:0.8rem; margin-top:8px;">
                <div><span class="lbl">CPU</span> <strong style="color:var(--gb-ok);">${c.cpu_percent}%</strong></div>
                <div><span class="lbl">MEM</span> <strong style="color:#a855f7;">${esc(c.mem_usage.split('/')[0] || c.mem_usage)}</strong></div>
                <div><span class="lbl">PIDs</span> <strong>${c.pids}</strong></div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    } catch {
      target.innerHTML = `<div class="empty-state" style="padding:40px;"><p>Failed to query Docker containers.</p></div>`;
    }
  }

  async function loadHistory(hours: number): Promise<void> {
    try {
      const data = await fetchSystemHistory(hours, 100);
      currentHistory = data.history || [];
      renderActiveTab();
    } catch (err) {
      console.warn('Failed to load history', err);
    }
  }

  async function loadStats(hours: number): Promise<void> {
    try {
      const stats: SystemStatsResponse = await fetchSystemStats(hours);

      const avgRamEl = container.querySelector('#statAvgRam') as HTMLElement;
      const ramRangeEl = container.querySelector('#statRamRange') as HTMLElement;
      const ramBarEl = container.querySelector('#statRamBar') as HTMLElement;

      const avgLoadEl = container.querySelector('#statAvgLoad') as HTMLElement;
      const loadRangeEl = container.querySelector('#statLoadRange') as HTMLElement;
      const loadBarEl = container.querySelector('#statLoadBar') as HTMLElement;

      const avgCpuEl = container.querySelector('#statAvgCpu') as HTMLElement;
      const cpuPeakEl = container.querySelector('#statCpuPeak') as HTMLElement;
      const cpuBarEl = container.querySelector('#statCpuBar') as HTMLElement;

      const sampleEl = container.querySelector('#statSampleCount') as HTMLElement;
      const badgeEl = container.querySelector('#sqliteSampleBadge') as HTMLElement;

      if (avgRamEl) avgRamEl.textContent = `${stats.memory.avg_percent.toFixed(1)}%`;
      if (ramRangeEl) ramRangeEl.textContent = `Min: ${(stats.memory.min_percent ?? 0).toFixed(0)}% · Peak: ${(stats.memory.max_percent ?? 0).toFixed(0)}%`;
      if (ramBarEl) ramBarEl.style.width = `${Math.min(100, stats.memory.avg_percent)}%`;

      if (avgLoadEl) avgLoadEl.textContent = stats.load.avg_1m.toFixed(2);
      if (loadRangeEl) loadRangeEl.textContent = `5m: ${stats.load.avg_5m.toFixed(2)} · 15m: ${stats.load.avg_15m.toFixed(2)} · Peak 1m: ${(stats.load.max_1m ?? 0).toFixed(2)}`;
      if (loadBarEl) loadBarEl.style.width = `${Math.min(100, (stats.load.avg_1m / (currentSnapshot?.cpu.core_count_logical || 4)) * 100)}%`;

      if (avgCpuEl) avgCpuEl.textContent = `${stats.cpu.avg_percent.toFixed(1)}%`;
      if (cpuPeakEl) cpuPeakEl.textContent = `Peak: ${(stats.cpu.max_percent ?? 0).toFixed(1)}%`;
      if (cpuBarEl) cpuBarEl.style.width = `${Math.min(100, stats.cpu.avg_percent)}%`;

      if (sampleEl) sampleEl.textContent = `${stats.sample_count} points`;
      if (badgeEl) badgeEl.textContent = `${stats.sample_count} Snapshots (${stats.timeframe_hours}h)`;
    } catch (err) {
      console.warn('Failed to load system stats', err);
    }
  }

  async function poll(): Promise<void> {
    if (isPaused) return;
    try {
      const snap = await fetchSystemMetrics();
      currentSnapshot = snap;
      updateHostBar(snap);

      if (currentHistory.length > 0) {
        const last = currentHistory[currentHistory.length - 1];
        const nowIso = snap.timestamp;
        if (last.timestamp !== nowIso) {
          currentHistory.push({
            timestamp: nowIso,
            cpu: snap.cpu.total_percent,
            memory: snap.memory.used_percent,
            memory_used_bytes: snap.memory.used_bytes,
            memory_total_bytes: snap.memory.total_bytes,
            swap: snap.memory.swap_used_percent,
            load_1m: snap.load_avg[0] || 0,
            load_5m: snap.load_avg[1] || 0,
            load_15m: snap.load_avg[2] || 0,
            disk_read_kb: Math.round(snap.disk.read_bytes_per_sec / 1024),
            disk_write_kb: Math.round(snap.disk.write_bytes_per_sec / 1024),
            net_rx_kb: Math.round(snap.network.bytes_recv_per_sec / 1024),
            net_tx_kb: Math.round(snap.network.bytes_sent_per_sec / 1024),
          });
          if (currentHistory.length > 120) {
            currentHistory.shift();
          }
          renderActiveTab();
        }
      }
    } catch (err) {
      console.warn('System poll error', err);
    }
  }

  // Wire Tab navigation
  const tabBtns = container.querySelectorAll('.beszel-tab') as NodeListOf<HTMLButtonElement>;
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = (btn.getAttribute('data-tab') as any) || 'core';
      window.location.hash = `#/system?tab=${activeTab}`;
      renderActiveTab();
    });
  });

  // Wire Timeframe Select
  const timeSelect = container.querySelector('#beszelTimeSelect') as HTMLSelectElement;
  timeSelect.addEventListener('change', async () => {
    currentTimeframeHours = parseFloat(timeSelect.value) || 1;
    await loadHistory(currentTimeframeHours);
    await loadStats(currentTimeframeHours);
  });

  // Wire Refresh button
  const refreshBtn = container.querySelector('#refreshBeszelBtn') as HTMLButtonElement;
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('spin');
    const snap = await fetchSystemMetrics();
    currentSnapshot = snap;
    updateHostBar(snap);
    await loadHistory(currentTimeframeHours);
    await loadStats(currentTimeframeHours);
    setTimeout(() => refreshBtn.classList.remove('spin'), 400);
  });

  // Initial load
  const initialSnap = await fetchSystemMetrics();
  currentSnapshot = initialSnap;
  updateHostBar(initialSnap);

  await loadHistory(currentTimeframeHours);
  await loadStats(currentTimeframeHours);

  // Poll every 3 seconds
  pollTimer = window.setInterval(poll, 3000);
}

export function cleanupSystem(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
