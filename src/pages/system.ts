/**
 * Beszel-style System Metrics Dashboard.
 * Real-time monitoring of host CPU (overall & per-core), Memory (RAM & Swap),
 * Disk usage & I/O, Network throughput, and rolling time-series area charts.
 */

import { fetchSystemMetrics, fetchSystemHistory, fetchContainers } from '../lib/api';
import { formatBytes, formatUptime, esc } from '../lib/format';
import { renderDonutGauge, renderSparkline, renderAreaChart, renderBarGauge } from '../lib/charts';
import type { SystemSnapshot, SystemHistoryPoint, ContainerSummary } from '../lib/api';

export async function renderSystem(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <header class="page-header">
      <div>
        <div style="display:flex;align-items:center;gap:10px;">
          <h1>🖥️ System Monitor</h1>
          <span class="pill pill-live" id="streamPill"><span class="pulse-dot"></span> LIVE</span>
        </div>
        <p class="muted" style="font-size:.88rem;margin-top:4px;">
          Beszel-style telemetry: Real-time host metrics, CPU per-core load, memory allocation, disk I/O, and network rates
        </p>
      </div>
      <div class="header-actions">
        <button id="pauseBtn" class="btn"><span id="pauseIcon">⏸️</span> Pause</button>
        <button id="refreshBtn" class="btn btn-primary"><span id="refreshIcon">🔄</span> Refresh</button>
      </div>
    </header>

    <!-- Host Info Bar -->
    <div class="host-info-bar" id="hostBar">
      <div class="host-pill"><span class="icon">💻</span> <strong id="hostName">-</strong></div>
      <div class="host-pill"><span class="icon">🐧</span> <span id="hostOs">-</span></div>
      <div class="host-pill"><span class="icon">⏱️</span> Uptime: <strong id="hostUptime">-</strong></div>
      <div class="host-pill"><span class="icon">⚙️</span> <span id="hostCores">-</span> cores</div>
      <div class="host-pill"><span class="icon">📈</span> Load: <span id="hostLoad">-</span></div>
      <div class="host-pill"><span class="icon">📦</span> Processes: <span id="hostProcs">-</span></div>
    </div>

    <!-- 4 Primary Metric Cards with Radial Donut Gauges & Sparklines -->
    <div class="metrics-quad-grid">
      <!-- CPU Card -->
      <div class="metric-hero-card" id="cpuCard">
        <div class="card-top">
          <div class="card-title">
            <span class="indicator-dot dot-cpu"></span> CPU Utilization
          </div>
          <span class="freq-tag" id="cpuFreq">- GHz</span>
        </div>
        <div class="card-main">
          <div id="cpuDonut"></div>
          <div class="card-vitals">
            <div class="vital-row"><span>Load Average</span><strong id="cpuLoad">-</strong></div>
            <div class="vital-row"><span>Logical Cores</span><strong id="cpuLogical">-</strong></div>
            <div class="vital-row"><span>Physical Cores</span><strong id="cpuPhysical">-</strong></div>
            <div class="spark-box" id="cpuSpark"></div>
          </div>
        </div>
        <!-- Per Core Expander -->
        <details class="core-details" id="coreExpander">
          <summary>Show Per-Core Distribution</summary>
          <div class="core-grid" id="coreBars"></div>
        </details>
      </div>

      <!-- Memory Card -->
      <div class="metric-hero-card" id="memCard">
        <div class="card-top">
          <div class="card-title">
            <span class="indicator-dot dot-mem"></span> Memory (RAM)
          </div>
          <span class="freq-tag" id="memTotal">- GB</span>
        </div>
        <div class="card-main">
          <div id="memDonut"></div>
          <div class="card-vitals">
            <div class="vital-row"><span>Used RAM</span><strong id="memUsed">-</strong></div>
            <div class="vital-row"><span>Available</span><strong id="memAvail">-</strong></div>
            <div class="vital-row"><span>Swap Used</span><strong id="memSwap">-</strong></div>
            <div class="spark-box" id="memSpark"></div>
          </div>
        </div>
        <div class="swap-bar-wrap" id="swapBarWrap">
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:3px;color:var(--text-muted);">
            <span>Swap Allocation</span>
            <span id="swapPct">0%</span>
          </div>
          <div class="bar-outer" style="height:6px;">
            <div class="bar-inner bar-ok" id="swapBar" style="width:0%;"></div>
          </div>
        </div>
      </div>

      <!-- Disk Card -->
      <div class="metric-hero-card" id="diskCard">
        <div class="card-top">
          <div class="card-title">
            <span class="indicator-dot dot-disk"></span> Storage & Disk I/O
          </div>
          <span class="freq-tag" id="diskTotal">- GB</span>
        </div>
        <div class="card-main">
          <div id="diskDonut"></div>
          <div class="card-vitals">
            <div class="vital-row"><span>Used Space</span><strong id="diskUsed">-</strong></div>
            <div class="vital-row"><span>Free Space</span><strong id="diskFree">-</strong></div>
            <div class="vital-row"><span>Read Rate</span><strong id="diskRead">- MB/s</strong></div>
            <div class="vital-row"><span>Write Rate</span><strong id="diskWrite">- MB/s</strong></div>
          </div>
        </div>
        <!-- Partitions breakdown -->
        <div class="partitions-list" id="partList"></div>
      </div>

      <!-- Network Card -->
      <div class="metric-hero-card" id="netCard">
        <div class="card-top">
          <div class="card-title">
            <span class="indicator-dot dot-net"></span> Network Throughput
          </div>
          <span class="freq-tag" id="netPackets">- pkt/s</span>
        </div>
        <div class="card-main" style="flex-direction:column;align-items:stretch;">
          <div class="net-rates-box">
            <div class="net-rate-item net-rx">
              <span class="arrow-icon">⬇</span>
              <div>
                <div class="rate-val" id="netRxVal">0.0 kB/s</div>
                <div class="rate-label">Incoming (Download)</div>
              </div>
            </div>
            <div class="net-rate-item net-tx">
              <span class="arrow-icon">⬆</span>
              <div>
                <div class="rate-val" id="netTxVal">0.0 kB/s</div>
                <div class="rate-label">Outgoing (Upload)</div>
              </div>
            </div>
          </div>
          <div class="spark-box" style="margin-top:12px;" id="netSpark"></div>
        </div>
      </div>
    </div>

    <!-- Time Series Charts (Beszel multi-series graph) -->
    <div class="charts-section">
      <div class="chart-box">
        <div class="chart-header">
          <div class="chart-title">📊 CPU & Memory History (Rolling 60s)</div>
          <div class="chart-legend">
            <span class="legend-item"><i style="background:#38bdf8;"></i> CPU %</span>
            <span class="legend-item"><i style="background:#818cf8;"></i> Memory %</span>
          </div>
        </div>
        <div id="cpuMemChart" class="chart-body"></div>
      </div>

      <div class="chart-box">
        <div class="chart-header">
          <div class="chart-title">🌐 Network Traffic History (KB/s)</div>
          <div class="chart-legend">
            <span class="legend-item"><i style="background:#10b981;"></i> Download (Rx)</span>
            <span class="legend-item"><i style="background:#f59e0b;"></i> Upload (Tx)</span>
          </div>
        </div>
        <div id="netChart" class="chart-body"></div>
      </div>
    </div>

    <!-- Live Container Pulse Section (Cross link to Dozzel) -->
    <div class="containers-pulse-card">
      <div class="pulse-header">
        <div>
          <div style="font-size:1.05rem;font-weight:700;display:flex;align-items:center;gap:8px;">
            🐳 Container Fleet Telemetry
          </div>
          <div class="muted" style="font-size:0.8rem;">Live containers reporting to this host</div>
        </div>
        <a href="#/containers" class="btn btn-sm">Open Dozzel Log Viewer →</a>
      </div>
      <div class="containers-mini-grid" id="containersMiniGrid">
        <div class="empty-state"><p>Querying container stats...</p></div>
      </div>
    </div>
  `;

  // Element handles
  const streamPill = container.querySelector('#streamPill') as HTMLElement;
  const pauseBtn = container.querySelector('#pauseBtn') as HTMLButtonElement;
  const pauseIcon = container.querySelector('#pauseIcon') as HTMLElement;
  const refreshBtn = container.querySelector('#refreshBtn') as HTMLButtonElement;
  const refreshIcon = container.querySelector('#refreshIcon') as HTMLElement;

  let isPaused = false;
  let timerId: number | null = null;
  const cpuHistory: number[] = [];
  const memHistory: number[] = [];
  const netRxHistory: number[] = [];
  const netTxHistory: number[] = [];

  function updateVitals(snap: SystemSnapshot): void {
    // Host Info
    (container.querySelector('#hostName') as HTMLElement).textContent = snap.host.hostname || 'localhost';
    (container.querySelector('#hostOs') as HTMLElement).textContent = `${snap.host.platform} ${snap.host.architecture}`;
    (container.querySelector('#hostUptime') as HTMLElement).textContent = formatUptime(snap.host.uptime_seconds);
    (container.querySelector('#hostCores') as HTMLElement).textContent = `${snap.cpu.core_count_logical}`;
    (container.querySelector('#hostLoad') as HTMLElement).textContent = (snap.load_avg || []).join(' · ') || '0.0';
    (container.querySelector('#hostProcs') as HTMLElement).textContent = String(snap.host.process_count);

    // CPU Card
    const cpuTotal = snap.cpu.total_percent;
    cpuHistory.push(cpuTotal);
    if (cpuHistory.length > 30) cpuHistory.shift();

    (container.querySelector('#cpuDonut') as HTMLElement).innerHTML = renderDonutGauge(cpuTotal, {
      size: 110,
      label: 'CPU',
      sublabel: `${cpuTotal.toFixed(1)}%`,
    });
    (container.querySelector('#cpuFreq') as HTMLElement).textContent = snap.cpu.frequency_mhz
      ? `${(snap.cpu.frequency_mhz / 1000).toFixed(2)} GHz`
      : 'Active';
    (container.querySelector('#cpuLoad') as HTMLElement).textContent = (snap.load_avg || []).join(', ');
    (container.querySelector('#cpuLogical') as HTMLElement).textContent = String(snap.cpu.core_count_logical);
    (container.querySelector('#cpuPhysical') as HTMLElement).textContent = String(snap.cpu.core_count_physical);
    (container.querySelector('#cpuSpark') as HTMLElement).innerHTML = renderSparkline(cpuHistory, {
      color: '#38bdf8',
      width: 140,
      height: 34,
    });

    // Per-core bars
    const coreBars = container.querySelector('#coreBars') as HTMLElement;
    if (coreBars && snap.cpu.per_core && snap.cpu.per_core.length > 0) {
      coreBars.innerHTML = snap.cpu.per_core
        .map((p, idx) => renderBarGauge(p, `Core ${idx}`, `${p}%`))
        .join('');
    }

    // Memory Card
    const memUsedPct = snap.memory.used_percent;
    memHistory.push(memUsedPct);
    if (memHistory.length > 30) memHistory.shift();

    (container.querySelector('#memDonut') as HTMLElement).innerHTML = renderDonutGauge(memUsedPct, {
      size: 110,
      label: 'RAM',
      color: '#818cf8',
      sublabel: `${memUsedPct.toFixed(1)}%`,
    });
    (container.querySelector('#memTotal') as HTMLElement).textContent = formatBytes(snap.memory.total_bytes);
    (container.querySelector('#memUsed') as HTMLElement).textContent = formatBytes(snap.memory.used_bytes);
    (container.querySelector('#memAvail') as HTMLElement).textContent = formatBytes(snap.memory.available_bytes);
    (container.querySelector('#memSwap') as HTMLElement).textContent = formatBytes(snap.memory.swap_used_bytes);
    (container.querySelector('#memSpark') as HTMLElement).innerHTML = renderSparkline(memHistory, {
      color: '#818cf8',
      width: 140,
      height: 34,
    });

    const swapPct = snap.memory.swap_used_percent || 0;
    (container.querySelector('#swapPct') as HTMLElement).textContent = `${swapPct}% (${formatBytes(snap.memory.swap_used_bytes)} / ${formatBytes(snap.memory.swap_total_bytes)})`;
    (container.querySelector('#swapBar') as HTMLElement).style.width = `${swapPct}%`;

    // Disk Card
    const diskUsedPct = snap.disk.used_percent;
    (container.querySelector('#diskDonut') as HTMLElement).innerHTML = renderDonutGauge(diskUsedPct, {
      size: 110,
      label: 'DISK',
      color: '#10b981',
      sublabel: `${diskUsedPct.toFixed(1)}%`,
    });
    (container.querySelector('#diskTotal') as HTMLElement).textContent = formatBytes(snap.disk.total_bytes);
    (container.querySelector('#diskUsed') as HTMLElement).textContent = formatBytes(snap.disk.used_bytes);
    (container.querySelector('#diskFree') as HTMLElement).textContent = formatBytes(snap.disk.free_bytes);
    (container.querySelector('#diskRead') as HTMLElement).textContent = `${(snap.disk.read_bytes_per_sec / (1024 * 1024)).toFixed(2)} MB/s`;
    (container.querySelector('#diskWrite') as HTMLElement).textContent = `${(snap.disk.write_bytes_per_sec / (1024 * 1024)).toFixed(2)} MB/s`;

    const partList = container.querySelector('#partList') as HTMLElement;
    if (partList && snap.disk.partitions) {
      partList.innerHTML = snap.disk.partitions
        .slice(0, 3)
        .map(
          (p) => `
          <div class="partition-row">
            <span class="part-mount"><code>${esc(p.mountpoint)}</code></span>
            <span class="part-stat">${formatBytes(p.used_bytes)} / ${formatBytes(p.total_bytes)} (${p.used_percent}%)</span>
          </div>
        `
        )
        .join('');
    }

    // Network Card
    const rxKb = snap.network.bytes_recv_per_sec / 1024;
    const txKb = snap.network.bytes_sent_per_sec / 1024;
    netRxHistory.push(rxKb);
    netTxHistory.push(txKb);
    if (netRxHistory.length > 30) netRxHistory.shift();
    if (netTxHistory.length > 30) netTxHistory.shift();

    (container.querySelector('#netRxVal') as HTMLElement).textContent = rxKb > 1024
      ? `${(rxKb / 1024).toFixed(2)} MB/s`
      : `${rxKb.toFixed(1)} kB/s`;
    (container.querySelector('#netTxVal') as HTMLElement).textContent = txKb > 1024
      ? `${(txKb / 1024).toFixed(2)} MB/s`
      : `${txKb.toFixed(1)} kB/s`;
    (container.querySelector('#netPackets') as HTMLElement).textContent = `${Math.round(snap.network.packets_recv_per_sec + snap.network.packets_sent_per_sec)} pkt/s`;

    (container.querySelector('#netSpark') as HTMLElement).innerHTML = renderSparkline(netRxHistory, {
      color: '#10b981',
      width: 220,
      height: 36,
    });

    // Render Main Charts
    renderMainCharts();
  }

  function renderMainCharts(): void {
    const cpuMemEl = container.querySelector('#cpuMemChart') as HTMLElement;
    if (cpuMemEl && cpuHistory.length > 0) {
      cpuMemEl.innerHTML = renderAreaChart(
        [
          { name: 'CPU', color: '#38bdf8', values: cpuHistory },
          { name: 'Memory', color: '#818cf8', values: memHistory },
        ],
        { height: 180, yMax: 100, unit: '%' }
      );
    }

    const netEl = container.querySelector('#netChart') as HTMLElement;
    if (netEl && netRxHistory.length > 0) {
      netEl.innerHTML = renderAreaChart(
        [
          { name: 'Download', color: '#10b981', values: netRxHistory },
          { name: 'Upload', color: '#f59e0b', values: netTxHistory },
        ],
        { height: 180, unit: 'k' }
      );
    }
  }

  async function loadInitialHistory(): Promise<void> {
    try {
      const histData = await fetchSystemHistory();
      if (histData.history && histData.history.length > 0) {
        histData.history.forEach((h: SystemHistoryPoint) => {
          cpuHistory.push(h.cpu);
          memHistory.push(h.memory);
          netRxHistory.push(h.net_rx_kb);
          netTxHistory.push(h.net_tx_kb);
        });
      }
    } catch {
      // Historical data endpoint optional fallback
    }
  }

  async function pollMetrics(): Promise<void> {
    if (isPaused) return;
    try {
      const snap = await fetchSystemMetrics();
      updateVitals(snap);
    } catch (err) {
      console.warn('System poll error', err);
    }
  }

  async function loadContainersPulse(): Promise<void> {
    const grid = container.querySelector('#containersMiniGrid') as HTMLElement;
    try {
      const res = await fetchContainers();
      const list = res.containers || [];
      if (list.length === 0) {
        grid.innerHTML = '<div class="empty-state"><p>No containers detected on host</p></div>';
        return;
      }
      grid.innerHTML = list
        .map(
          (c: ContainerSummary) => `
        <div class="container-pulse-card">
          <div class="card-head">
            <span class="status-dot ${c.state === 'running' ? 'status-green' : 'status-gray'}"></span>
            <strong>${esc(c.name)}</strong>
          </div>
          <div class="c-image">${esc(c.image)}</div>
          <div class="c-stats-row">
            <div><span class="lbl">CPU</span> <strong>${c.cpu_percent}%</strong></div>
            <div><span class="lbl">MEM</span> <strong>${esc(c.mem_usage.split('/')[0] || c.mem_usage)}</strong></div>
            <div><span class="lbl">PIDs</span> <strong>${c.pids}</strong></div>
          </div>
        </div>
      `
        )
        .join('');
    } catch {
      grid.innerHTML = '<div class="empty-state"><p>Container telemetry offline</p></div>';
    }
  }

  // Event handlers
  pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
      pauseBtn.classList.add('btn-active');
      pauseIcon.textContent = '▶️';
      pauseBtn.innerHTML = '<span>▶️</span> Resume';
      streamPill.className = 'pill';
      streamPill.innerHTML = 'PAUSED';
    } else {
      pauseBtn.classList.remove('btn-active');
      pauseIcon.textContent = '⏸️';
      pauseBtn.innerHTML = '<span>⏸️</span> Pause';
      streamPill.className = 'pill pill-live';
      streamPill.innerHTML = '<span class="pulse-dot"></span> LIVE';
      pollMetrics();
    }
  });

  refreshBtn.addEventListener('click', async () => {
    refreshIcon.classList.add('spin');
    await pollMetrics();
    await loadContainersPulse();
    setTimeout(() => refreshIcon.classList.remove('spin'), 400);
  });

  // Start initialization
  await loadInitialHistory();
  await pollMetrics();
  await loadContainersPulse();

  // Periodic polling every 2.0s
  timerId = window.setInterval(() => {
    if (!isPaused) {
      pollMetrics();
    }
  }, 2000);

  // Poll containers pulse every 10s
  const cTimer = window.setInterval(loadContainersPulse, 10000);

  // Cleanup on route departure
  window.addEventListener(
    'hashchange',
    () => {
      if (timerId) clearInterval(timerId);
      clearInterval(cTimer);
    },
    { once: true }
  );
}
