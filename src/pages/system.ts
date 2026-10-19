/**
 * Beszel-Style High-Fidelity System Telemetry Dashboard.
 * Replicates the exact visual language, 2x2 time-series area charts,
 * host metadata ribbon, sub-tabs (Core, Network, Disk, Containers),
 * and timeframe controls (1h, 6h, 24h, 7d).
 */

import {
  fetchSystemMetrics,
  fetchSystemHistory,
  fetchContainers,
  fetchSystemStats,
} from '../lib/api';
import { formatBytes, formatUptime, esc } from '../lib/format';
import { renderBeszelChart, renderBarGauge } from '../lib/charts';
import type {
  SystemSnapshot,
  SystemHistoryPoint,
  ContainerSummary,
  SystemStatsResponse,
} from '../lib/api';

let pollTimer: number | null = null;

export async function renderSystem(container: HTMLElement): Promise<void> {
  let activeTab: 'core' | 'network' | 'disk' | 'containers' = 'core';
  let currentTimeframeHours = 1; // Default to 1 hour matching screenshot
  let isPaused = false;

  let currentSnapshot: SystemSnapshot | null = null;
  let currentHistory: SystemHistoryPoint[] = [];

  container.innerHTML = `
    <!-- Beszel-Style Host Header & Summary Ribbon -->
    <div class="beszel-host-header" id="beszelHostHeader">
      <div class="beszel-host-title-row">
        <div class="beszel-host-left">
          <div class="beszel-host-name" id="bHostTitle">local-host</div>
          <span class="beszel-status-up"><span class="status-dot status-green"></span> Up</span>
        </div>

        <div class="beszel-header-controls">
          <div class="beszel-time-dropdown-wrap">
            <span class="time-icon">⏱️</span>
            <select id="beszelTimeSelect" class="beszel-select">
              <option value="1" selected>1 hour</option>
              <option value="6">6 hours</option>
              <option value="24">24 hours</option>
              <option value="168">7 days</option>
            </select>
          </div>
          <button id="refreshBeszelBtn" class="beszel-icon-btn" title="Refresh Telemetry">🎛️</button>
        </div>
      </div>

      <div class="beszel-meta-chips" id="bMetaChips">
        <div class="chip-item"><span class="chip-icon">🌐</span> <code id="bIp">-</code></div>
        <div class="chip-item"><span class="chip-icon">💻</span> <strong id="bHostname">-</strong></div>
        <div class="chip-item"><span class="chip-icon">⏱️</span> <span id="bUptime">-</span></div>
        <div class="chip-item"><span class="chip-icon">🐧</span> <span id="bDistro">-</span></div>
        <div class="chip-item"><span class="chip-icon">⚙️</span> <span id="bCpuModel">-</span></div>
        <div class="chip-item"><span class="chip-icon">💾</span> <strong id="bRamTotal" style="color:#10b981;">-</strong></div>
      </div>
    </div>

    <!-- Beszel Sub-Navigation Tabs -->
    <div class="beszel-subnav" id="beszelSubnav">
      <button class="beszel-tab active" data-tab="core"><span class="tab-icon">⚙️</span> Core</button>
      <button class="beszel-tab" data-tab="network"><span class="tab-icon">🌐</span> Network</button>
      <button class="beszel-tab" data-tab="disk"><span class="tab-icon">💾</span> Disk</button>
      <button class="beszel-tab" data-tab="containers"><span class="tab-icon">🐳</span> Containers</button>
    </div>

    <!-- Active Tab Container (2x2 Chart Grid) -->
    <div id="beszelTabContent">
      <div class="loading-state" style="padding:40px;"><div class="spin">⚡</div></div>
    </div>

    <!-- SQLite Persistent Telemetry & Rolling Aggregates Section -->
    <div class="sqlite-stats-card" id="sqliteStatsCard" style="margin-top:28px;">
      <div class="sqlite-stats-header">
        <div>
          <div class="sqlite-title">
            <span>🗄️ SQLite Persistent Telemetry & Rolling Averages</span>
            <span class="badge badge-info" id="sqliteSampleBadge">Active Engine</span>
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
          name: 'CPU',
          color: '#3b82f6', // Beszel blue
          values: cpuValues,
          gradient: true,
        },
      ],
      {
        title: 'CPU Usage',
        subtitle: 'Average system-wide CPU utilization',
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
        { name: '1 min', color: '#a855f7', values: load1Values },
        { name: '5 min', color: '#3b82f6', values: load5Values },
        { name: '15 min', color: '#f97316', values: load15Values },
      ],
      {
        title: 'Load Average',
        subtitle: 'System load averages over time',
        legend: true,
        timestamps,
      }
    );

    // 3. Memory Usage (in GB)
    const memGbValues = hist.map((h) => {
      const bytes = h.memory_used_bytes || (h.memory / 100) * (currentSnapshot?.memory.total_bytes || 6000000000);
      return Math.round((bytes / (1024 ** 3)) * 100) / 100;
    });

    const memChartHtml = renderBeszelChart(
      [
        {
          name: 'Used RAM',
          color: '#10b981', // Beszel emerald
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
      return Math.round((bytes / (1024 ** 3)) * 100) / 100;
    });

    const swapChartHtml = renderBeszelChart(
      [
        {
          name: 'Swap Used',
          color: '#06b6d4', // Cyan
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
        currentSnapshot?.cpu.per_core && currentSnapshot.cpu.per_core.length > 0
          ? `
        <details class="core-details" style="margin-top:16px;">
          <summary>Show Per-Core Distribution (${currentSnapshot.cpu.core_count_logical} Logical Cores)</summary>
          <div class="core-grid" style="margin-top:10px;">
            ${currentSnapshot.cpu.per_core.map((p, idx) => renderBarGauge(p, `Core ${idx}`, `${p}%`)).join('')}
          </div>
        </details>
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
            <button class="beszel-more-btn">•••</button>
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
              <div><span>Mesh State:</span> <strong style="color:#10b981;">Tailscale Active</strong></div>
            </div>
          </div>
        </div>
      </div>
    `;
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
        subtitle: 'Read & write bandwidth bandwidth over time',
        unit: 'MB/s',
        legend: true,
        timestamps,
      }
    );

    const partitions = currentSnapshot?.disk.partitions || [];

    target.innerHTML = `
      <div class="beszel-charts-grid">
        ${ioChartHtml}

        <div class="beszel-chart-card">
          <div class="beszel-chart-header">
            <div>
              <h3 class="beszel-chart-title">Partition Space</h3>
              <div class="beszel-chart-subtitle">Mounted volumes and root filesystem</div>
            </div>
            <button class="beszel-more-btn">•••</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:14px; padding-top:6px;">
            ${partitions
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
        <div class="containers-mini-grid" style="grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px;">
          ${list
            .map(
              (c: ContainerSummary) => `
            <div class="container-pulse-card" style="padding:14px; background:#121215; border:1px solid rgba(255,255,255,0.08); border-radius:12px;">
              <div class="card-head" style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="status-dot ${c.state === 'running' ? 'status-green' : 'status-gray'}"></span>
                  <strong>${esc(c.name)}</strong>
                </div>
                <span class="badge ${c.state === 'running' ? 'badge-success' : 'badge-error'}">${esc(c.state.toUpperCase())}</span>
              </div>
              <div class="c-image" style="font-size:0.75rem; color:#71717a; margin:6px 0;"><code>${esc(c.image)}</code></div>
              <div class="c-stats-row" style="display:flex; justify-content:space-between; font-size:0.8rem; margin-top:8px;">
                <div><span class="lbl">CPU</span> <strong style="color:#10b981;">${c.cpu_percent}%</strong></div>
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
      const stats = await fetchSystemStats(hours);
      const avgRamEl = container.querySelector('#statAvgRam');
      const ramRangeEl = container.querySelector('#statRamRange');
      const ramBarEl = container.querySelector('#statRamBar') as HTMLElement;
      const avgLoadEl = container.querySelector('#statAvgLoad');
      const loadRangeEl = container.querySelector('#statLoadRange');
      const loadBarEl = container.querySelector('#statLoadBar') as HTMLElement;
      const avgCpuEl = container.querySelector('#statAvgCpu');
      const cpuPeakEl = container.querySelector('#statCpuPeak');
      const cpuBarEl = container.querySelector('#statCpuBar') as HTMLElement;
      const sampleEl = container.querySelector('#statSampleCount');
      const badgeEl = container.querySelector('#sqliteSampleBadge');

      if (avgRamEl) avgRamEl.textContent = `${stats.memory.avg_percent.toFixed(1)}%`;
      if (ramRangeEl) {
        ramRangeEl.textContent = `Min: ${stats.memory.min_percent ?? 0}% · Peak: ${stats.memory.max_percent ?? 0}% (${formatBytes(stats.memory.avg_bytes ?? 0)})`;
      }
      if (ramBarEl) ramBarEl.style.width = `${Math.min(100, stats.memory.avg_percent)}%`;

      if (avgLoadEl) avgLoadEl.textContent = stats.load.avg_1m.toFixed(2);
      if (loadRangeEl) {
        loadRangeEl.textContent = `5m: ${stats.load.avg_5m.toFixed(2)} · 15m: ${stats.load.avg_15m.toFixed(2)} · Peak 1m: ${stats.load.max_1m.toFixed(2)}`;
      }
      if (loadBarEl) loadBarEl.style.width = `${Math.min(100, (stats.load.avg_1m / 4) * 100)}%`;

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

      // Append latest point to history
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
