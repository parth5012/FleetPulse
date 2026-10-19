/**
 * Network Inspector: Tailscale Mesh Health, Serve/Funnel routes, and Open Listening Sockets.
 */

import { fetchTailscaleStatus, fetchListeningPorts } from '../lib/api';
import type { TailscaleStatusResponse, PortsResponse, SocketPort, TailscalePeer } from '../lib/api';
import { esc, formatBytes } from '../lib/format';

let refreshTimer: number | null = null;

export async function renderNetwork(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <header class="page-header">
      <div>
        <div style="display:flex;align-items:center;gap:10px;">
          <h1>🌐 Network & Tailscale Inspector</h1>
          <span class="pill pill-live" id="netStatusPill"><span class="pulse-dot"></span> MESH ACTIVE</span>
        </div>
        <p class="muted" style="font-size:.88rem;margin-top:4px;">
          Live Tailscale mesh topology, WireGuard direct vs DERP relays, Serve proxies, and open listening sockets
        </p>
      </div>
      <div class="header-actions">
        <button id="refreshNetBtn" class="btn btn-primary"><span id="refreshNetIcon">🔄</span> Refresh</button>
      </div>
    </header>

    <!-- Tailscale Mesh Overview Grid -->
    <div class="network-mesh-section">
      <div class="section-title">
        <span>🔒 Tailscale Mesh Topology</span>
        <span class="badge badge-info" id="meshPeerCountBadge">0 Peers Connected</span>
      </div>

      <div class="mesh-cards-grid" id="meshCardsGrid">
        <div class="loading-state" style="padding:24px;"><div class="spin">⚡</div></div>
      </div>
    </div>

    <!-- Tailscale Serve & Funnel Routes -->
    <div class="serve-routes-section">
      <div class="section-title">
        <span>🔀 Active Tailscale Serve & HTTPS Ingress Routes</span>
        <span class="badge badge-info" id="serveCountBadge">0 Routes</span>
      </div>
      <div class="serve-routes-table-wrap">
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

    <!-- Listening Ports & Open Sockets -->
    <div class="sockets-section">
      <div class="sockets-header">
        <div>
          <div class="section-title">
            <span>🔌 Open Listening Sockets (ss -tulpn)</span>
            <span class="badge badge-info" id="portsCountBadge">0 Sockets</span>
          </div>
          <div class="muted" style="font-size:0.8rem;margin-top:2px;">
            Audited network sockets bound to localhost, Tailscale, or public interfaces
          </div>
        </div>
        <div class="sockets-controls">
          <div class="timeframe-buttons" id="socketExposureFilters">
            <button class="btn btn-sm btn-primary" data-filter="all">All</button>
            <button class="btn btn-sm" data-filter="tailscale">Tailscale</button>
            <button class="btn btn-sm" data-filter="public">Public</button>
            <button class="btn btn-sm" data-filter="localhost">Localhost</button>
          </div>
          <input type="text" id="socketSearchInput" class="input-sm" placeholder="Filter port or process..." style="min-width:180px;" />
        </div>
      </div>

      <div class="sockets-table-wrap">
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

  let currentExposureFilter = 'all';
  let searchQuery = '';
  let cachedPorts: SocketPort[] = [];

  function getOsIcon(os: string): string {
    const o = os.toLowerCase();
    if (o.includes('linux') || o.includes('debian') || o.includes('ubuntu')) return '🐧';
    if (o.includes('windows')) return '🪟';
    if (o.includes('darwin') || o.includes('macos') || o.includes('ios')) return '🍎';
    if (o.includes('android')) return '🤖';
    return '💻';
  }

  async function loadTailscale(): Promise<void> {
    const grid = container.querySelector('#meshCardsGrid') as HTMLElement;
    const peerBadge = container.querySelector('#meshPeerCountBadge') as HTMLElement;
    const serveBadge = container.querySelector('#serveCountBadge') as HTMLElement;
    const serveTbody = container.querySelector('#serveTableBody') as HTMLElement;

    try {
      const data: TailscaleStatusResponse = await fetchTailscaleStatus();
      if (!data.installed || data.backend_state !== 'Running') {
        grid.innerHTML = `
          <div class="empty-state" style="padding:20px;grid-column:1/-1;">
            <p>⚠️ Tailscale daemon is not running or not logged in (${esc(data.backend_state)}).</p>
          </div>
        `;
        return;
      }

      peerBadge.textContent = `${data.peer_count} Peers Connected`;

      // Render Self Node Card + Peer Node Cards
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

      grid.innerHTML = selfHtml + peersHtml;

      // Render Serve Routes
      serveBadge.textContent = `${data.serve_routes.length} Ingress Routes`;
      if (data.serve_routes.length === 0) {
        serveTbody.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;padding:16px;">No Tailscale Serve or Funnel ingress routes configured.</td></tr>`;
      } else {
        serveTbody.innerHTML = data.serve_routes.map((r) => `
          <tr>
            <td><strong>:${r.port}</strong></td>
            <td><code>${esc(r.host)}</code></td>
            <td><code>${esc(r.path)}</code></td>
            <td><span class="c-pill" style="color:#10b981;">${esc(r.proxy_target)}</span></td>
            <td><span class="badge badge-info">TLS Terminated</span></td>
          </tr>
        `).join('');
      }
    } catch (err) {
      grid.innerHTML = `<div class="empty-state" style="padding:20px;grid-column:1/-1;"><p>Error querying Tailscale status</p></div>`;
    }
  }

  function renderSockets(): void {
    const tbody = container.querySelector('#socketsTableBody') as HTMLElement;
    const badge = container.querySelector('#portsCountBadge') as HTMLElement;

    let filtered = cachedPorts.filter((p) => {
      if (currentExposureFilter !== 'all' && p.exposure !== currentExposureFilter) {
        return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchPort = String(p.port).includes(q);
        const matchProc = (p.process || '').toLowerCase().includes(q);
        const matchAddr = p.local_address.toLowerCase().includes(q);
        return matchPort || matchProc || matchAddr;
      }
      return true;
    });

    badge.textContent = `${filtered.length} Sockets`;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:20px;">No listening sockets matched filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((s) => {
      let exposureClass = 'badge-info';
      let exposureText = 'Localhost';
      if (s.exposure === 'tailscale') {
        exposureClass = 'badge-success';
        exposureText = 'Tailscale Mesh';
      } else if (s.exposure === 'public') {
        exposureClass = 'badge-warn';
        exposureText = 'Public (0.0.0.0)';
      }

      return `
        <tr>
          <td><span class="badge-scope scope-user" style="font-weight:700;">${esc(s.protocol.toUpperCase())}</span></td>
          <td><strong style="font-size:1.05rem;color:var(--text);">${s.port}</strong></td>
          <td><span class="badge ${exposureClass}">${exposureText}</span></td>
          <td><code>${esc(s.local_address)}</code></td>
          <td><strong style="color:var(--accent);">${esc(s.process || 'system / root')}</strong></td>
          <td><code>${s.pid ? s.pid : '-'}</code></td>
          <td><span class="status-dot status-green"></span> ${esc(s.state)}</td>
        </tr>
      `;
    }).join('');
  }

  async function loadSockets(): Promise<void> {
    try {
      const data: PortsResponse = await fetchListeningPorts();
      cachedPorts = data.ports || [];
      renderSockets();
    } catch (err) {
      console.warn('Failed to load listening ports', err);
    }
  }

  // Filter handlers
  const filterBtns = container.querySelectorAll('#socketExposureFilters button') as NodeListOf<HTMLButtonElement>;
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('btn-primary'));
      btn.classList.add('btn-primary');
      currentExposureFilter = btn.getAttribute('data-filter') || 'all';
      renderSockets();
    });
  });

  const searchInput = container.querySelector('#socketSearchInput') as HTMLInputElement;
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    renderSockets();
  });

  const refreshBtn = container.querySelector('#refreshNetBtn') as HTMLButtonElement;
  const refreshIcon = container.querySelector('#refreshNetIcon') as HTMLElement;
  refreshBtn.addEventListener('click', async () => {
    refreshIcon.classList.add('spin');
    await loadTailscale();
    await loadSockets();
    setTimeout(() => refreshIcon.classList.remove('spin'), 400);
  });

  // Initial load
  await loadTailscale();
  await loadSockets();

  // Polling every 15s
  refreshTimer = window.setInterval(() => {
    loadTailscale();
    loadSockets();
  }, 15000);
}

export function cleanupNetwork(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
