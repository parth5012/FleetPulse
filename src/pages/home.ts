/**
 * Central Command Hub.
 * Provides high-level health cards, live telemetry summaries, and direct links
 * to the Beszel-style System Monitor, Dozzel-style Container & Log Console,
 * and Antigravity Multi-Account Quota tracker.
 */

import { fetchSystemMetrics, fetchContainers, fetchLimits } from '../lib/api';
import { formatBytes, formatUptime, esc } from '../lib/format';
import { renderSparkline, renderDonutGauge } from '../lib/charts';

export async function renderHome(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="home-hero">
      <div class="hero-badge">⚡ UNIFIED OBSERVABILITY PLATFORM</div>
      <h1 class="hero-title">Visual Telemetry Hub</h1>
      <p class="hero-desc">
        Integrated infrastructure telemetry inspired by <strong>Beszel</strong> (lightweight real-time server vitals)
        and <strong>Dozzel</strong> (container fleet monitoring & live log streaming).
      </p>
    </div>

    <!-- Quick Services Grid -->
    <div class="services-grid">
      <!-- Card 1: Beszel System Monitor -->
      <div class="service-card" id="homeSysCard">
        <div class="service-head">
          <div class="service-icon icon-sys">🖥️</div>
          <div>
            <h3>System Monitor (Beszel)</h3>
            <p class="muted">Live CPU, RAM, Disk I/O & Network throughput</p>
          </div>
          <span class="pill pill-live" id="homeSysPill">Polling...</span>
        </div>
        <div class="service-body">
          <div class="home-metric-row">
            <div id="homeCpuGauge"></div>
            <div id="homeMemGauge"></div>
            <div id="homeDiskGauge"></div>
          </div>
          <div class="service-meta-list" id="homeSysMeta">
            <div><span>Host:</span> <strong id="hMetaHost">-</strong></div>
            <div><span>Uptime:</span> <strong id="hMetaUptime">-</strong></div>
            <div><span>Load:</span> <strong id="hMetaLoad">-</strong></div>
          </div>
        </div>
        <div class="service-foot">
          <a href="#/system" class="btn btn-primary" style="width:100%;justify-content:center;">Open System Monitor →</a>
        </div>
      </div>

      <!-- Card 2: Dozzel Container & Logs -->
      <div class="service-card" id="homeDockCard">
        <div class="service-head">
          <div class="service-icon icon-dock">🐳</div>
          <div>
            <h3>Containers & Logs (Dozzel)</h3>
            <p class="muted">Real-time log tailing, ANSI colors & fleet stats</p>
          </div>
          <span class="pill pill-live" id="homeDockPill">Polling...</span>
        </div>
        <div class="service-body">
          <div class="home-containers-preview" id="homeContainersPreview">
            <div class="empty-state" style="padding:16px 8px;"><p>Loading containers...</p></div>
          </div>
        </div>
        <div class="service-foot">
          <a href="#/containers" class="btn btn-primary" style="width:100%;justify-content:center;">Open Log Console →</a>
        </div>
      </div>

      <!-- Card 3: Antigravity Quota Hub -->
      <div class="service-card" id="homeAgyCard">
        <div class="service-head">
          <div class="service-icon icon-agy">⚡</div>
          <div>
            <h3>Antigravity Quotas</h3>
            <p class="muted">5h + weekly LLM quota pools across accounts</p>
          </div>
          <span class="pill" id="homeAgyPill">Ready</span>
        </div>
        <div class="service-body">
          <div class="home-agy-preview" id="homeAgyPreview">
            <div class="empty-state" style="padding:16px 8px;"><p>Connecting to OmniRoute...</p></div>
          </div>
        </div>
        <div class="service-foot">
          <a href="#/antigravity" class="btn btn-primary" style="width:100%;justify-content:center;">Open Quota Dashboard →</a>
        </div>
      </div>
    </div>
  `;

  // Fetch live stats in background
  try {
    const sys = await fetchSystemMetrics();
    const sysPill = container.querySelector('#homeSysPill') as HTMLElement;
    if (sysPill) {
      sysPill.textContent = 'ONLINE';
      sysPill.className = 'pill pill-live';
    }

    const cpuG = container.querySelector('#homeCpuGauge') as HTMLElement;
    if (cpuG) {
      cpuG.innerHTML = renderDonutGauge(sys.cpu.total_percent, { size: 76, strokeWidth: 7, label: 'CPU' });
    }
    const memG = container.querySelector('#homeMemGauge') as HTMLElement;
    if (memG) {
      memG.innerHTML = renderDonutGauge(sys.memory.used_percent, { size: 76, strokeWidth: 7, label: 'RAM', color: '#818cf8' });
    }
    const diskG = container.querySelector('#homeDiskGauge') as HTMLElement;
    if (diskG) {
      diskG.innerHTML = renderDonutGauge(sys.disk.used_percent, { size: 76, strokeWidth: 7, label: 'DISK', color: '#10b981' });
    }

    (container.querySelector('#hMetaHost') as HTMLElement).textContent = sys.host.hostname || 'localhost';
    (container.querySelector('#hMetaUptime') as HTMLElement).textContent = formatUptime(sys.host.uptime_seconds);
    (container.querySelector('#hMetaLoad') as HTMLElement).textContent = (sys.load_avg || []).join(' · ') || '0.0';
  } catch (err) {
    console.warn('Home sys fetch error', err);
  }

  // Fetch containers preview
  try {
    const data = await fetchContainers();
    const list = data.containers || [];
    const dockPill = container.querySelector('#homeDockPill') as HTMLElement;
    if (dockPill) {
      dockPill.textContent = `${list.length} Containers`;
      dockPill.className = 'pill pill-live';
    }

    const preview = container.querySelector('#homeContainersPreview') as HTMLElement;
    if (preview) {
      preview.innerHTML = list
        .slice(0, 4)
        .map(
          (c) => `
        <div class="home-c-row">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="status-dot ${c.state === 'running' ? 'status-green' : 'status-gray'}"></span>
            <strong style="font-size:0.85rem;">${esc(c.name)}</strong>
          </div>
          <div style="display:flex;gap:6px;">
            <span class="c-pill">CPU ${c.cpu_percent}%</span>
            <span class="c-pill">RAM ${esc(c.mem_usage.split('/')[0] || c.mem_usage)}</span>
          </div>
        </div>
      `
        )
        .join('');
    }
  } catch (err) {
    console.warn('Home dock fetch error', err);
  }

  // Fetch Antigravity preview
  try {
    const data = await fetchLimits(false);
    const accs = data.accounts || [];
    const agyPill = container.querySelector('#homeAgyPill') as HTMLElement;
    if (agyPill) {
      agyPill.textContent = `${accs.length} Accounts`;
      agyPill.className = 'pill pill-live';
    }
    const agyPreview = container.querySelector('#homeAgyPreview') as HTMLElement;
    if (agyPreview) {
      if (accs.length === 0) {
        agyPreview.innerHTML = '<div class="empty-state" style="padding:16px 8px;"><p>No Antigravity accounts configured</p></div>';
      } else {
        agyPreview.innerHTML = accs
          .slice(0, 3)
          .map(
            (a) => `
          <div class="home-c-row">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="status-dot status-green"></span>
              <strong style="font-size:0.85rem;">${esc(a.account_id)}</strong>
            </div>
            <span class="c-pill">${(a.groups || []).length || (a.families || []).length} Quota pools</span>
          </div>
        `
          )
          .join('');
      }
    }
  } catch (err) {
    console.warn('Home agy fetch error', err);
  }
}
