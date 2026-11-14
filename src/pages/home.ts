/**
 * Calm Ops Home: fleet health at a glance.
 * Vitals strip (live, polled) → status band → fleet activity → quick links.
 */

import {
  fetchSystemMetrics,
  fetchSystemStats,
  fetchSystemHistory,
  fetchContainers,
  fetchLimits,
  fetchTasks,
  fetchServices,
  fetchTailscaleStatus,
  fetchKernelHealth,
} from '../lib/api';
import type { SystemStatsResponse, SystemHistoryPoint } from '../lib/api';
import { esc } from '../lib/format';
import { renderSparkline } from '../lib/charts';
import { icons } from '../lib/icons';

let pollTimer: number | null = null;

interface Vital {
  key: string;
  label: string;
  value: string;
  percent: number;
  color: string;
  spark?: number[];
  detail: string;
}

function vitalColor(key: string, pct: number): string {
  if (pct > 85) return 'var(--danger)';
  if (pct > 70) return 'var(--warning)';
  if (key === 'cpu') return 'var(--chart-cpu)';
  if (key === 'memory') return 'var(--chart-mem)';
  if (key === 'disk') return 'var(--chart-io)';
  return 'var(--chart-net)';
}

export async function renderHome(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Fleet overview</h1>
        <p class="page-sub" id="homeSub">Loading host vitals…</p>
      </div>
    </div>

    <!-- Host vitals strip -->
    <section class="vitals-strip" id="vitalsStrip" aria-label="Host vitals">
      ${['CPU', 'Memory', 'Disk', 'Network']
        .map(
          (label) => `
        <div class="vital-tile" data-vital="${label}">
          <div class="vital-top">
            <span class="micro-label">${label}</span>
          </div>
          <div class="vital-value"><span class="vital-num">—</span></div>
          <div class="vital-bar"><div class="vital-bar-fill" style="width:0%"></div></div>
          <div class="vital-detail">—</div>
        </div>
      `
        )
        .join('')}
    </section>

    <!-- Fleet status band -->
    <section class="status-band" id="statusBand" aria-label="Fleet status">
      <div class="status-band-item">
        <div class="status-band-head">
          ${icons.services({ size: 16 })}
          <span>Services</span>
        </div>
        <div class="status-band-body" id="bandServices"><span class="status-counts">—</span></div>
        <a class="quiet-link" href="#/services">View services ${icons.chevronRight({ size: 14 })}</a>
      </div>
      <div class="status-band-item">
        <div class="status-band-head">
          ${icons.containers({ size: 16 })}
          <span>Containers</span>
        </div>
        <div class="status-band-body" id="bandContainers"><span class="status-counts">—</span></div>
        <a class="quiet-link" href="#/containers">View containers ${icons.chevronRight({ size: 14 })}</a>
      </div>
      <div class="status-band-item">
        <div class="status-band-head">
          ${icons.zap({ size: 16 })}
          <span>Tasks</span>
        </div>
        <div class="status-band-body" id="bandTasks"><span class="status-counts">—</span></div>
        <a class="quiet-link" href="#/tasks">Task manager ${icons.chevronRight({ size: 14 })}</a>
      </div>
      <div class="status-band-item">
        <div class="status-band-head">
          ${icons.journal({ size: 16 })}
          <span>Kernel</span>
        </div>
        <div class="status-band-body" id="bandKernel"><span class="status-counts">—</span></div>
        <a class="quiet-link" href="#/journal">Journal ${icons.chevronRight({ size: 14 })}</a>
      </div>
    </section>

    <!-- Two-column live activity -->
    <section class="home-grid" aria-label="Live activity">
      <div class="card">
        <div class="card-head">
          <span class="micro-label">Top processes</span>
          <span class="card-head-meta" id="procMeta"></span>
        </div>
        <div class="card-rows" id="topProcs"><div class="row-skeleton"></div><div class="row-skeleton"></div><div class="row-skeleton"></div><div class="row-skeleton"></div></div>
        <div class="card-foot">
          <a class="quiet-link" href="#/tasks">Open task manager ${icons.arrowUpRight({ size: 14 })}</a>
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <span class="micro-label">Services by memory</span>
          <span class="card-head-meta" id="svcMeta"></span>
        </div>
        <div class="card-rows" id="topSvcs"><div class="row-skeleton"></div><div class="row-skeleton"></div><div class="row-skeleton"></div><div class="row-skeleton"></div></div>
        <div class="card-foot">
          <a class="quiet-link" href="#/services">Inspect services ${icons.arrowUpRight({ size: 14 })}</a>
        </div>
      </div>
    </section>

    <!-- Quick links into deeper pages -->
    <section aria-label="Explore">
      <h2 class="section-title">Explore</h2>
      <div class="explore-grid">
        <a class="explore-card" href="#/system">
          <div class="explore-head">${icons.system({ size: 17 })}<span>System monitor</span>${icons.chevronRight({ size: 15, strokeWidth: 2 })}</div>
          <div class="explore-desc">Time-series charts for CPU, load, memory, swap and disk I/O</div>
        </a>
        <a class="explore-card" href="#/network">
          <div class="explore-head">${icons.network({ size: 17 })}<span>Network</span>${icons.chevronRight({ size: 15, strokeWidth: 2 })}</div>
          <div class="explore-desc">Tailscale mesh peers, WireGuard routes and open listening sockets</div>
        </a>
        <a class="explore-card" href="#/journal">
          <div class="explore-head">${icons.journal({ size: 17 })}<span>Journal</span>${icons.chevronRight({ size: 15, strokeWidth: 2 })}</div>
          <div class="explore-desc">systemd logs, OOM killer events and PSI pressure stalls</div>
        </a>
        <a class="explore-card" href="#/containers">
          <div class="explore-head">${icons.containers({ size: 17 })}<span>Containers</span>${icons.chevronRight({ size: 15, strokeWidth: 2 })}</div>
          <div class="explore-desc">Docker fleet stats and live log console with ANSI tailing</div>
        </a>
        <a class="explore-card" href="#/apps">
          <div class="explore-head">${icons.apps({ size: 17 })}<span>Apps</span>${icons.chevronRight({ size: 15, strokeWidth: 2 })}</div>
          <div class="explore-desc">Curated self-hosted apps with one-tap start and stop</div>
        </a>
        <a class="explore-card" href="#/antigravity">
          <div class="explore-head">${icons.quotas({ size: 17 })}<span>Quotas</span>${icons.chevronRight({ size: 15, strokeWidth: 2 })}</div>
          <div class="explore-desc">LLM quota pools across OmniRoute accounts, 5h and weekly windows</div>
        </a>
        <a class="explore-card" href="#/maintenance">
          <div class="explore-head">${icons.maintenance({ size: 17 })}<span>Maintenance</span>${icons.chevronRight({ size: 15, strokeWidth: 2 })}</div>
          <div class="explore-desc">Docker prune, journal vacuum and daemon restart shortcuts</div>
        </a>
      </div>
    </section>
  `;

  // --- Initial load: everything in parallel, each failure tolerated ---
  const tasksP = fetchTasks('cpu', 'desc', 5)
    .then((r) => {
      const body = container.querySelector('#topProcs');
      if (body) {
        body.innerHTML = r.tasks
          .map(
            (t) => `
          <div class="data-row">
            <span class="row-pid">${t.pid}</span>
            <span class="row-name">${esc(t.name)}</span>
            <span class="row-metric tnum">${t.cpu_percent.toFixed(1)}%</span>
            <span class="row-metric tnum muted">${esc(t.memory_formatted)}</span>
          </div>`
          )
          .join('');
      }
      const meta = container.querySelector('#procMeta');
      if (meta) meta.textContent = `${r.overview.total_processes} processes`;
      const band = container.querySelector('#bandTasks');
      if (band) {
        band.innerHTML = `<span class="status-counts tnum">${r.overview.total_processes}</span>
          <span class="status-chip-label">processes · ${r.overview.cpu_total_percent.toFixed(0)}% CPU</span>`;
      }
    })
    .catch(() => {});

  const svcsP = fetchServices('all', 'all', 'memory', 'desc', 5)
    .then((r) => {
      const body = container.querySelector('#topSvcs');
      if (body) {
        body.innerHTML = r.services
          .map(
            (s) => `
          <div class="data-row">
            <span class="status-dot ${s.active_state === 'active' ? 'status-ok' : 'status-idle'}" aria-hidden="true"></span>
            <span class="row-name">${esc(s.name)}</span>
            <span class="row-scope">${esc(s.scope)}</span>
            <span class="row-metric tnum muted">${esc(s.memory_formatted)}</span>
          </div>`
          )
          .join('');
      }
      const meta = container.querySelector('#svcMeta');
      if (meta) meta.textContent = `${r.overview.running_services} running`;
      const failed = r.overview.failed_services;
      const band = container.querySelector('#bandServices');
      if (band) {
        band.innerHTML = `
          <span class="status-dot status-${failed > 0 ? 'error' : 'ok'}" aria-hidden="true"></span>
          <span class="status-counts tnum">${r.overview.running_services} running</span>
          ${failed > 0 ? `<span class="status-chip-label" style="color:var(--danger-text)">${failed} failed</span>` : ''}`;
      }
    })
    .catch(() => {});

  const containersP = fetchContainers()
    .then((r) => {
      const list = r.containers || [];
      const running = list.filter((c) => c.state === 'running').length;
      const stopped = list.length - running;
      const band = container.querySelector('#bandContainers');
      if (band) {
        band.innerHTML = `
          <span class="status-dot status-${running > 0 ? 'ok' : 'idle'}" aria-hidden="true"></span>
          <span class="status-counts tnum">${running} running</span>
          ${stopped > 0 ? `<span class="status-chip-label">${stopped} stopped</span>` : ''}`;
      }
    })
    .catch(() => {});

  const kernelP = fetchKernelHealth()
    .then((k) => {
      const oom = k.oom_kill_count || 0;
      const band = container.querySelector('#bandKernel');
      if (band) {
        band.innerHTML = oom > 0
          ? `<span class="status-dot status-error" aria-hidden="true"></span><span class="status-counts tnum" style="color:var(--danger-text)">${oom} OOM kills</span>`
          : `<span class="status-dot status-ok" aria-hidden="true"></span><span class="status-counts">Healthy</span>`;
      }
    })
    .catch(() => {});

  const statsP = fetchSystemStats(24).catch(() => null);
  const historyP = fetchSystemHistory(24, 60).catch(() => ({ history: [] }));
  const metricsP = fetchSystemMetrics().catch(() => null);

  // Vitals + host subtitle
  try {
    const [snap, stats, history] = await Promise.all([metricsP, statsP, historyP]);

    if (snap) {
      const sparkCpu = (history.history as SystemHistoryPoint[]).map((h) => h.cpu);
      const sparkMem = (history.history as SystemHistoryPoint[]).map((h) => h.memory);
      const sparkDisk = (history.history as SystemHistoryPoint[]).map((h) => h.disk_used_percent ?? snap.disk.used_percent);
      const sparkNet = (history.history as SystemHistoryPoint[]).map((h) => h.net_rx_kb || 0);
      const statsData = stats as SystemStatsResponse | null;

      const vitals: Vital[] = [
        {
          key: 'cpu',
          label: 'CPU',
          value: `${snap.cpu.total_percent.toFixed(0)}%`,
          percent: snap.cpu.total_percent,
          color: vitalColor('cpu', snap.cpu.total_percent),
          spark: sparkCpu,
          detail: `${snap.cpu.core_count_logical} cores · load ${snap.load_avg?.[0]?.toFixed(2) ?? '0.0'}${
            statsData ? ` · 24h ${statsData.cpu.avg_percent.toFixed(0)}%` : ''
          }`,
        },
        {
          key: 'memory',
          label: 'Memory',
          value: `${snap.memory.used_percent.toFixed(0)}%`,
          percent: snap.memory.used_percent,
          color: vitalColor('memory', snap.memory.used_percent),
          spark: sparkMem,
          detail: `${(snap.memory.used_bytes / 1024 ** 3).toFixed(1)} / ${(snap.memory.total_bytes / 1024 ** 3).toFixed(1)} GB${
            statsData ? ` · 24h ${statsData.memory.avg_percent.toFixed(0)}%` : ''
          }`,
        },
        {
          key: 'disk',
          label: 'Disk',
          value: `${snap.disk.used_percent.toFixed(0)}%`,
          percent: snap.disk.used_percent,
          color: vitalColor('disk', snap.disk.used_percent),
          spark: sparkDisk,
          detail: `${(snap.disk.free_bytes / 1024 ** 3).toFixed(0)} GB free`,
        },
        {
          key: 'network',
          label: 'Network',
          value: `${(snap.network.bytes_recv_per_sec / 1024).toFixed(0)} KB/s`,
          percent: Math.min(100, (snap.network.bytes_recv_per_sec / (10 * 1024 * 1024)) * 100),
          color: vitalColor('network', 0),
          spark: sparkNet,
          detail: `↓ ${(snap.network.bytes_recv_per_sec / 1024 / 1024).toFixed(1)} · ↑ ${(snap.network.bytes_sent_per_sec / 1024 / 1024).toFixed(1)} MB/s`,
        },
      ];

      vitals.forEach((v) => {
        const tile = container.querySelector(`[data-vital="${v.label}"]`) as HTMLElement | null;
        if (!tile) return;
        tile.querySelector('.vital-num')!.textContent = v.value;
        const fill = tile.querySelector('.vital-bar-fill') as HTMLElement;
        fill.style.width = `${Math.min(100, Math.max(2, v.percent))}%`;
        fill.style.background = v.color;
        const detail = tile.querySelector('.vital-detail')!;
        detail.textContent = v.detail;
        if (v.spark && v.spark.length > 4) {
          const sparkEl = tile.querySelector('.vital-top') as HTMLElement;
          sparkEl.insertAdjacentHTML(
            'beforeend',
            `<span class="vital-spark">${renderSparkline(v.spark, { width: 72, height: 24, color: v.color, strokeWidth: 1.5 })}</span>`
          );
        }
      });

      const sub = container.querySelector('#homeSub');
      if (sub) {
        sub.textContent = `${snap.host.hostname} · up ${formatShortUptime(snap.host.uptime_seconds)} · ${snap.host.platform}`;
      }
    }
  } catch (err) {
    console.warn('Home vitals error', err);
    const sub = container.querySelector('#homeSub');
    if (sub) sub.textContent = 'Host telemetry unavailable';
  }

  await Promise.allSettled([tasksP, svcsP, containersP, kernelP]);

  // Live polling: refresh vitals strip every 5s while the page is open.
  const poll = async (): Promise<void> => {
    try {
      const snap = await fetchSystemMetrics();
      const updates: Array<[string, string, number]> = [
        ['cpu', `${snap.cpu.total_percent.toFixed(0)}%`, snap.cpu.total_percent],
        ['memory', `${snap.memory.used_percent.toFixed(0)}%`, snap.memory.used_percent],
        ['disk', `${snap.disk.used_percent.toFixed(0)}%`, snap.disk.used_percent],
        [
          'network',
          `${(snap.network.bytes_recv_per_sec / 1024).toFixed(0)} KB/s`,
          Math.min(100, (snap.network.bytes_recv_per_sec / (10 * 1024 * 1024)) * 100),
        ],
      ];
      updates.forEach(([key, val, pct]) => {
        const tile = container.querySelector(`[data-vital="${key}"]`) as HTMLElement | null;
        if (!tile) return;
        tile.querySelector('.vital-num')!.textContent = val;
        const fill = tile.querySelector('.vital-bar-fill') as HTMLElement;
        fill.style.width = `${Math.min(100, Math.max(2, pct))}%`;
        fill.style.background = vitalColor(key, pct);
      });
      const sub = container.querySelector('#homeSub');
      if (sub && !sub.textContent?.includes('unavailable')) {
        sub.textContent = `${snap.host.hostname} · up ${formatShortUptime(snap.host.uptime_seconds)} · ${snap.host.platform}`;
      }
    } catch {
      // keep last known values
    }
  };
  pollTimer = window.setInterval(() => void poll(), 5000);

  // Fire-and-forget extras: tailscale + quota headroom chips appended to status band.
  void Promise.allSettled([fetchTailscaleStatus(), fetchLimits(false)]).then(([tail, agy]) => {
    const band = container.querySelector('#statusBand');
    if (!band) return;
    if (tail.status === 'fulfilled' && tail.value.installed && tail.value.backend_state === 'Running') {
      const peers = tail.value.peer_count;
      band.insertAdjacentHTML(
        'beforeend',
        `<div class="status-band-item">
          <div class="status-band-head">${icons.network({ size: 16 })}<span>Mesh</span></div>
          <div class="status-band-body"><span class="status-dot status-ok" aria-hidden="true"></span><span class="status-counts tnum">${peers} peers</span></div>
          <a class="quiet-link" href="#/network">Network ${icons.chevronRight({ size: 14 })}</a>
        </div>`
      );
    }
    if (agy.status === 'fulfilled') {
      const accs = agy.value.accounts || [];
      if (accs.length > 0) {
        band.insertAdjacentHTML(
          'beforeend',
          `<div class="status-band-item">
            <div class="status-band-head">${icons.quotas({ size: 16 })}<span>Quotas</span></div>
            <div class="status-band-body"><span class="status-counts tnum">${accs.length}</span><span class="status-chip-label">accounts</span></div>
            <a class="quiet-link" href="#/antigravity">Quota dashboard ${icons.chevronRight({ size: 14 })}</a>
          </div>`
        );
      }
    }
  });
}

export function cleanupHome(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function formatShortUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}
