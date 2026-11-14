/**
 * Fleet overview — Daylight Console home page.
 * Surfaces fleet health at a glance: host vitals strip, running/stopped
 * service + container counts, live telemetry (polled), and quick links
 * into every deeper page. Every async section has designed
 * loading (skeleton), error (retry), and empty states.
 */

import {
  fetchSystemMetrics,
  fetchSystemStats,
  fetchContainers,
  fetchTasks,
  fetchServices,
  fetchKernelHealth,
  fetchMaintenanceDf,
  fetchTailscaleStatus,
  fetchLimits,
  type SystemSnapshot,
} from '../lib/api';
import { formatBytes, formatUptime, esc } from '../lib/format';
import { renderDonutGauge } from '../lib/charts';
import { icon, ROUTES } from '../shell';

const POLL_MS = 5000;
let pollTimer: number | null = null;

function gaugeColor(pct: number): string {
  if (pct >= 90) return '#dc2626';
  if (pct >= 75) return '#d97706';
  return '#059669';
}

function vitalShell(id: string): string {
  return `
    <div class="fleet-vital" id="${id}">
      <div class="sk" style="width:64px; height:64px; border-radius:50%; flex-shrink:0;"></div>
      <div class="fleet-vital-meta">
        <div class="sk" style="width:55%;"></div>
        <div class="sk" style="width:80%;"></div>
      </div>
    </div>`;
}

function vitalInner(label: string, donut: string, value: string, sub: string): string {
  return `
    <div class="vital-donut-wrap">${donut}</div>
    <div class="fleet-vital-meta">
      <span class="fleet-vital-label">${label}</span>
      <span class="fleet-vital-value">${value}</span>
      <span class="fleet-vital-sub">${sub}</span>
    </div>`;
}

function skeletonRows(n: number): string {
  let rows = '';
  for (let i = 0; i < n; i++) {
    rows += `<div class="sk-row"><div class="sk" style="width:38%; height:12px;"></div><div class="sk" style="width:18%; height:12px;"></div></div>`;
  }
  return rows;
}

function panelError(id: string, label: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `
    <div class="panel-state">
      <div class="ps-icon">${icon('x', 18)}</div>
      <div class="ps-text">Couldn't load ${esc(label)}</div>
      <button class="ps-retry" data-retry="${id}">Retry</button>
    </div>`;
}

function statTile(
  href: string,
  state: 'ok' | 'warn' | 'err' | 'neutral' | 'info',
  iconName: string,
  value: string,
  label: string
): string {
  return `
    <a class="stat-tile" href="#${href}">
      <span class="st-icon ${state}">${icon(iconName, 18)}</span>
      <span class="st-main">
        <span class="st-value">${value}</span>
        <span class="st-label">${label}</span>
      </span>
    </a>`;
}

function quickCard(r: (typeof ROUTES)[number]): string {
  return `
    <a class="quick-card" href="#${r.path}">
      <span class="q-icon">${icon(r.icon, 18)}</span>
      <span>
        <div class="q-name">${r.name}</div>
        <div class="q-desc">${r.desc}</div>
      </span>
    </a>`;
}

export function cleanupHome(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

export async function renderHome(container: HTMLElement): Promise<void> {
  cleanupHome();

  container.innerHTML = `
    <div class="page-header">
      <div class="header-titles">
        <div class="page-crumb"><a href="#/">FleetPulse</a> <span class="crumb-sep">/</span> Overview</div>
        <h1 class="page-title">Fleet overview</h1>
        <p class="page-subtitle">Host vitals, services and containers at a glance. Live telemetry refreshes every few seconds.</p>
      </div>
      <div class="header-actions">
        <span class="updated-note" id="homeUpdated"></span>
      </div>
    </div>

    <!-- Host identity + live status -->
    <div class="host-card" id="homeHostCard">
      <div class="sk" style="width:120px; height:14px;"></div>
      <div class="sk" style="width:180px; height:14px;"></div>
      <div class="sk" style="width:100px; height:14px;"></div>
    </div>

    <!-- Vitals strip -->
    <div class="fleet-strip" style="margin-top:12px;" id="homeVitals">
      ${vitalShell('homeVitalCpu')}
      ${vitalShell('homeVitalRam')}
      ${vitalShell('homeVitalDisk')}
      ${vitalShell('homeVitalNet')}
    </div>

    <!-- Status summary tiles -->
    <div class="stat-row" id="homeStats">
      ${statTile('/services', 'neutral', 'cpu', '…', 'Services')}
      ${statTile('/containers', 'neutral', 'box', '…', 'Containers')}
      ${statTile('/journal', 'neutral', 'file', '…', 'Journal')}
      ${statTile('/antigravity', 'neutral', 'chart', '…', 'Quota headroom')}
    </div>

    <!-- Live panels -->
    <div class="panel-grid">
      <div class="panel-card">
        <div class="panel-head">
          <span class="ph-title">${icon('zap', 15)} Top processes</span>
          <a class="ph-link" href="#/tasks">Task manager →</a>
        </div>
        <div class="panel-body" id="homeProcs">${skeletonRows(4)}</div>
      </div>
      <div class="panel-card">
        <div class="panel-head">
          <span class="ph-title">${icon('cpu', 15)} Heaviest services</span>
          <a class="ph-link" href="#/services">All services →</a>
        </div>
        <div class="panel-body" id="homeSvcs">${skeletonRows(4)}</div>
      </div>
    </div>

    <!-- Quick links -->
    <div class="page-crumb" style="margin-bottom:8px;">Quick links</div>
    <div class="quick-grid">
      ${ROUTES.filter((r) => r.path !== '/').map(quickCard).join('')}
    </div>
  `;

  container.querySelectorAll<HTMLButtonElement>('[data-retry]').forEach((btn) => {
    btn.addEventListener('click', () => void loadHome(container));
  });

  await loadHome(container);
  pollTimer = window.setInterval(() => void refreshVitals(container), POLL_MS);
}

async function loadHome(container: HTMLElement): Promise<void> {
  const [sysRes, tasksRes, svcsRes, ctrRes, kernelRes, maintRes, tailRes, agyRes, statsRes] =
    await Promise.allSettled([
      fetchSystemMetrics(),
      fetchTasks('cpu', 'desc', 5),
      fetchServices('all', 'all', 'ram', 'desc', 5),
      fetchContainers(),
      fetchKernelHealth(),
      fetchMaintenanceDf(),
      fetchTailscaleStatus(),
      fetchLimits(false),
      fetchSystemStats(24),
    ]);

  // --- Host card ---
  const hostCard = container.querySelector('#homeHostCard') as HTMLElement | null;
  if (hostCard) {
    if (sysRes.status === 'fulfilled') {
      const sys = sysRes.value;
      const load = (sys.load_avg || []).map((l) => l.toFixed(2)).join(' · ');
      hostCard.innerHTML = `
        <span class="hc-status"><span class="status-dot status-green"></span> Up ${formatUptime(sys.host.uptime_seconds)}</span>
        <div class="hc-item"><span class="hc-label">Host</span><span class="hc-value">${esc(sys.host.hostname || 'localhost')}</span></div>
        <div class="hc-item"><span class="hc-label">Platform</span><span class="hc-value">${esc(sys.host.distro || sys.host.os_release || sys.host.platform || '—')}</span></div>
        <div class="hc-item"><span class="hc-label">Load avg</span><span class="hc-value">${esc(load) || '—'}</span></div>
        ${statsRes.status === 'fulfilled' ? `<div class="hc-item"><span class="hc-label">24h avg mem</span><span class="hc-value">${statsRes.value.memory.avg_percent.toFixed(1)}%</span></div>` : ''}
        <div class="panel-meta" id="homeUpdated2"></div>
      `;
    } else {
      hostCard.innerHTML = `
        <div class="panel-state" style="width:100%;">
          <div class="ps-text">Couldn't reach host telemetry</div>
          <button class="ps-retry" data-retry="homeHostCard">Retry</button>
        </div>`;
    }
  }

  // --- Vitals ---
  if (sysRes.status === 'fulfilled') {
    paintVitals(sysRes.value);
  } else {
    ['homeVitalCpu', 'homeVitalRam', 'homeVitalDisk', 'homeVitalNet'].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.innerHTML = `<div class="panel-state" style="width:100%; padding:8px 0;"><div class="ps-text">No telemetry</div></div>`;
    });
  }

  // --- Status tiles ---
  const stats = container.querySelector('#homeStats') as HTMLElement | null;
  if (stats) {
    let html = '';
    if (svcsRes.status === 'fulfilled') {
      const ov = svcsRes.value.overview;
      const failed = ov.failed_services ?? 0;
      const st = failed > 0 ? 'err' : 'ok';
      html += statTile(
        '/services',
        st,
        'cpu',
        `${ov.running_services}<span style="color:var(--text-muted);">/${ov.total_services}</span>`,
        failed > 0 ? `running · ${failed} failed` : 'running'
      );
    } else {
      html += statTile('/services', 'neutral', 'cpu', '—', 'Services unavailable');
    }

    if (ctrRes.status === 'fulfilled') {
      const list = ctrRes.value.containers || [];
      const running = list.filter((c) => c.state === 'running').length;
      const stopped = list.length - running;
      html += statTile(
        '/containers',
        stopped > 0 ? 'warn' : 'ok',
        'box',
        `${running}<span style="color:var(--text-muted);">/${list.length}</span>`,
        stopped > 0 ? `running · ${stopped} stopped` : 'all running'
      );
    } else {
      html += statTile('/containers', 'neutral', 'box', '—', 'Containers unavailable');
    }

    if (kernelRes.status === 'fulfilled') {
      const oom = kernelRes.value.oom_kill_count || 0;
      html += statTile(
        '/journal',
        oom > 0 ? 'err' : 'ok',
        'file',
        oom > 0 ? `${oom}` : 'Clear',
        oom > 0 ? 'OOM kills — investigate' : 'No kernel alerts'
      );
    } else {
      html += statTile('/journal', 'neutral', 'file', '—', 'Journal unavailable');
    }

    if (agyRes.status === 'fulfilled') {
      const accs = agyRes.value.accounts || [];
      let frac = 0;
      let count = 0;
      accs.forEach((a) => {
        (a.groups || []).forEach((g) => {
          (g.buckets || []).forEach((b) => {
            frac += Number(b.remainingFraction || 0);
            count++;
          });
        });
        if ((a.groups || []).length === 0) {
          (a.families || []).forEach((f) => {
            frac += Number(f.remaining || 0);
            count++;
          });
        }
      });
      const headroom = count > 0 ? Math.round((frac / count) * 100) : 100;
      html += statTile(
        '/antigravity',
        headroom > 50 ? 'ok' : headroom > 20 ? 'warn' : 'err',
        'chart',
        `${headroom}%`,
        accs.length ? `${accs.length} accounts · headroom` : 'No accounts'
      );
    } else {
      html += statTile('/antigravity', 'neutral', 'chart', '—', 'Quotas unavailable');
    }

    if (maintRes.status === 'fulfilled') {
      const disk = maintRes.value.disk_root;
      const st = disk.used_percent >= 90 ? 'err' : disk.used_percent >= 80 ? 'warn' : 'ok';
      html += statTile(
        '/maintenance',
        st,
        'wrench',
        `${disk.used_percent}%`,
        `${formatBytes(disk.free_bytes)} free on /`
      );
    } else {
      html += statTile('/maintenance', 'neutral', 'wrench', '—', 'Disk stats unavailable');
    }

    if (tailRes.status === 'fulfilled' && tailRes.value.installed && tailRes.value.backend_state === 'Running') {
      const direct = tailRes.value.peers.filter((p) => p.is_direct).length;
      html += statTile(
        '/network',
        'info',
        'globe',
        `${tailRes.value.peer_count}`,
        `peers · ${direct} direct connections`
      );
    } else {
      html += statTile('/network', 'neutral', 'globe', '—', 'Tailscale not running');
    }

    stats.innerHTML = html;
  }

  // --- Top processes panel ---
  const procs = container.querySelector('#homeProcs') as HTMLElement | null;
  if (procs) {
    if (tasksRes.status === 'fulfilled') {
      const ov = tasksRes.value.overview;
      procs.innerHTML = `
        <div class="panel-row" style="border-bottom:1px solid var(--inset-border);">
          <span class="pr-name" style="color:var(--text-muted); font-weight:500;">${ov.total_processes} processes · ${ov.cpu_total_percent.toFixed(0)}% CPU total</span>
          <span class="pr-metric">${ov.memory_used_percent.toFixed(0)}% RAM</span>
        </div>
        ${tasksRes.value.tasks
          .map(
            (t) => `
          <div class="panel-row">
            <span class="pr-name"><code style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-subtle);">${t.pid}</code> ${esc(t.name)}</span>
            <span class="pr-metric">${t.cpu_percent.toFixed(1)}% · ${esc(t.memory_formatted)}</span>
          </div>`
          )
          .join('')}`;
    } else {
      panelError('homeProcs', 'process list');
    }
  }

  // --- Heaviest services panel ---
  const svcs = container.querySelector('#homeSvcs') as HTMLElement | null;
  if (svcs) {
    if (svcsRes.status === 'fulfilled') {
      const failed = svcsRes.value.overview.failed_services ?? 0;
      svcs.innerHTML = `
        <div class="panel-row" style="border-bottom:1px solid var(--inset-border);">
          <span class="pr-name" style="color:var(--text-muted); font-weight:500;">${svcsRes.value.overview.running_services} running${failed ? ` · ${failed} failed` : ''}</span>
          <span class="pr-metric">${esc(svcsRes.value.overview.total_memory_formatted)} RAM</span>
        </div>
        ${svcsRes.value.services
          .map(
            (s) => `
          <div class="panel-row">
            <span class="pr-name"><span class="status-dot ${s.active_state === 'active' ? 'status-green' : 'status-gray'}"></span> ${esc(s.name)}</span>
            <span class="pr-metric">${esc(s.memory_formatted)}</span>
          </div>`
          )
          .join('')}`;
    } else {
      panelError('homeSvcs', 'service list');
    }
  }

  markUpdated(container);
}

async function refreshVitals(container: HTMLElement): Promise<void> {
  try {
    const sys: SystemSnapshot = await fetchSystemMetrics();
    paintVitals(sys);
    markUpdated(container);
  } catch {
    // keep last-known values on transient poll failures
  }
}

function paintVitals(sys: SystemSnapshot): void {
  const gSize = window.innerWidth <= 480 ? 52 : 64;
  const cpu = document.getElementById('homeVitalCpu');
  const ram = document.getElementById('homeVitalRam');
  const disk = document.getElementById('homeVitalDisk');
  const net = document.getElementById('homeVitalNet');
  const cpuPct = sys.cpu.total_percent;
  const memPct = sys.memory.used_percent;
  const diskPct = sys.disk.used_percent;

  if (cpu)
    cpu.innerHTML = vitalInner(
      'CPU',
      renderDonutGauge(cpuPct, { size: gSize, strokeWidth: 5, color: gaugeColor(cpuPct) }),
      `${cpuPct.toFixed(0)}%`,
      `${sys.cpu.core_count_logical} cores`
    );
  if (ram)
    ram.innerHTML = vitalInner(
      'Memory',
      renderDonutGauge(memPct, { size: gSize, strokeWidth: 5, color: '#7c3aed' }),
      `${memPct.toFixed(0)}%`,
      `${formatBytes(sys.memory.used_bytes)} / ${formatBytes(sys.memory.total_bytes)}`
    );
  if (disk)
    disk.innerHTML = vitalInner(
      'Disk',
      renderDonutGauge(diskPct, { size: gSize, strokeWidth: 5, color: gaugeColor(diskPct) }),
      `${diskPct.toFixed(0)}%`,
      `${formatBytes(sys.disk.free_bytes)} free`
    );
  if (net) {
    const rx = sys.network.bytes_recv_per_sec || 0;
    const tx = sys.network.bytes_sent_per_sec || 0;
    net.innerHTML = `
      <div class="vital-donut-wrap" style="width:${gSize}px; height:${gSize}px; border-radius:8px; background:var(--inset-bg); display:flex; align-items:center; justify-content:center; color:#0891b2;">${icon('globe', 24)}</div>
      <div class="fleet-vital-meta">
        <span class="fleet-vital-label">Network</span>
        <span class="fleet-vital-value">${formatBytes(rx + tx)}/s</span>
        <span class="fleet-vital-sub">↓ ${formatBytes(rx)}/s · ↑ ${formatBytes(tx)}/s</span>
      </div>`;
  }
}

function markUpdated(container: HTMLElement): void {
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const note = container.querySelector('#homeUpdated') as HTMLElement | null;
  const note2 = container.querySelector('#homeUpdated2') as HTMLElement | null;
  if (note) note.textContent = `Updated ${now}`;
  if (note2) note2.textContent = `Updated ${now}`;
}
