/**
 * Glanceboard Home — a glanceable status board, designed mobile-first.
 * Deliberate scroll order:
 *   1. Fleet health hero (one ring + one-line verdict)
 *   2. Attention strip (only when something needs action)
 *   3. Host vitals row (CPU / RAM / Disk / Net compact tiles)
 *   4. Quick links into deeper pages
 * Real loading, error and empty states throughout.
 */

import {
  fetchSystemMetrics,
  fetchSystemStats,
  fetchContainers,
  fetchServices,
  fetchKernelHealth,
  type SystemSnapshot,
  type ServicesResponse,
  type KernelHealthResponse,
} from '../lib/api';
import { formatBytes, esc } from '../lib/format';
import { errorStateHtml, emptyStateHtml } from '../lib/ui';

interface Check {
  label: string;
  detail: string;
  link: string;
  ok: boolean;
  sev: 'warn' | 'bad';
}

function ringSvg(pct: number, color: string): string {
  const r = 54;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return `
    <svg class="gb-ring" viewBox="0 0 128 128" role="img" aria-label="Fleet health ${Math.round(pct)}%">
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--gb-border)" stroke-width="9"/>
      <circle
        cx="64" cy="64" r="${r}" fill="none" stroke="${color}" stroke-width="9"
        stroke-linecap="round" stroke-dasharray="${filled.toFixed(1)} ${c.toFixed(1)}"
        transform="rotate(-90 64 64)"/>
      <text x="64" y="70" text-anchor="middle" class="gb-ring-num">${Math.round(pct)}<tspan class="gb-ring-unit">%</tspan></text>
    </svg>
  `;
}

function barHtml(pct: number, state: 'ok' | 'warn' | 'bad'): string {
  return `
    <div class="gb-bar"><div class="gb-bar-fill st-${state}" style="width:${Math.max(2, Math.min(100, pct)).toFixed(1)}%"></div></div>
  `;
}

function stateFor(pct: number): 'ok' | 'warn' | 'bad' {
  if (pct >= 95) return 'bad';
  if (pct >= 85) return 'warn';
  return 'ok';
}

function tileHtml(opts: {
  label: string;
  value: string;
  sub: string;
  pct: number | null;
  href: string;
  state: 'ok' | 'warn' | 'bad' | 'neutral';
}): string {
  return `
    <a href="#${opts.href}" class="gb-tile st-${opts.state}">
      <span class="gb-tile-label">${esc(opts.label)}</span>
      <span class="gb-tile-value">${esc(opts.value)}</span>
      ${opts.pct !== null ? barHtml(opts.pct, opts.state === 'neutral' ? 'ok' : opts.state) : ''}
      <span class="gb-tile-sub">${esc(opts.sub)}</span>
    </a>
  `;
}

function quickTile(opts: { href: string; label: string; value: string; icon: string }): string {
  return `
    <a href="#${opts.href}" class="gb-quick-tile">
      <span class="gb-quick-icon">${opts.icon}</span>
      <span class="gb-quick-text">
        <span class="gb-quick-label">${esc(opts.label)}</span>
        <span class="gb-quick-value">${esc(opts.value)}</span>
      </span>
      <span class="gb-quick-chev" aria-hidden="true">›</span>
    </a>
  `;
}

const QUICK_ICONS = {
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
  services: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4" width="17" height="6.5" rx="1.5"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="1.5"/></svg>',
  containers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2.5 21 7.4v9.2l-9 4.9-9-4.9V7.4z"/><path d="M3.4 7.6 12 12.3l8.6-4.7M12 22V12.3"/></svg>',
  journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5"/></svg>',
  maintenance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6.5a4 4 0 0 0-5.4 5.2L3.5 17.3l3.2 3.2 5.6-5.6a4 4 0 0 0 5.2-5.4l-2.7 2.7-2.4-.6-.6-2.4z"/></svg>',
};

export async function renderHome(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <header class="gb-page-head">
      <h1 class="gb-page-title">Fleet</h1>
      <p class="gb-page-sub" id="gbHomeSub">Checking your host…</p>
    </header>

    <!-- 1. Fleet health hero -->
    <section class="gb-hero" id="gbHero" aria-live="polite">
      <div class="gb-hero-ring" id="gbHeroRing"><div class="gb-skeleton gb-sk-ring"></div></div>
      <div class="gb-hero-text">
        <div class="gb-skeleton gb-sk-verdict" id="gbHeroVerdict"></div>
        <div class="gb-skeleton gb-sk-sub" id="gbHeroSub"></div>
      </div>
    </section>

    <!-- 2. Attention strip (only when needed) -->
    <section class="gb-alerts" id="gbAlerts" hidden aria-label="Needs attention"></section>

    <!-- 3. Host vitals -->
    <section class="gb-vitals" id="gbVitals" aria-label="Host vitals">
      <div class="gb-vitals-grid">
        <div class="gb-skeleton gb-sk-tile"></div>
        <div class="gb-skeleton gb-sk-tile"></div>
        <div class="gb-skeleton gb-sk-tile"></div>
        <div class="gb-skeleton gb-sk-tile"></div>
      </div>
    </section>

    <!-- 4. Quick links -->
    <section class="gb-quick" id="gbQuick" aria-label="Quick links"></section>
  `;

  const [sysR, svcR, ctrR, krnR, statsR] = await Promise.allSettled([
    fetchSystemMetrics(),
    fetchServices('all', 'all', 'cpu', 'desc', 150),
    fetchContainers(),
    fetchKernelHealth(),
    fetchSystemStats(24),
  ]);

  // Any hard failure of the core snapshot gets a real error state + retry.
  if (sysR.status === 'rejected') {
    const hero = container.querySelector('#gbHero') as HTMLElement;
    hero.innerHTML = errorStateHtml(String(sysR.reason));
    const sub = container.querySelector('#gbHomeSub') as HTMLElement;
    sub.textContent = 'Telemetry unavailable';
    const retry = hero.querySelector('.gb-retry-btn') as HTMLElement | null;
    retry?.addEventListener('click', () => renderHome(container));
    return;
  }

  const sys: SystemSnapshot = sysR.value;
  const svcs: ServicesResponse | null = svcR.status === 'fulfilled' ? svcR.value : null;
  const containers = ctrR.status === 'fulfilled' ? ctrR.value.containers || [] : null;
  const kernel: KernelHealthResponse | null = krnR.status === 'fulfilled' ? krnR.value : null;
  const stats = statsR.status === 'fulfilled' ? statsR.value : null;

  const cpu = sys.cpu.total_percent;
  const mem = sys.memory.used_percent;
  const disk = sys.disk.used_percent;
  const netRx = sys.network.bytes_recv_per_sec;
  const netTx = sys.network.bytes_sent_per_sec;
  const netKbps = netRx / 1024;

  const runningServices = svcs?.overview.running_services ?? null;
  const totalServices = svcs?.overview.total_services ?? null;
  const failedServices = svcs?.overview.failed_services ?? 0;
  const runningContainers = containers ? containers.filter((c) => c.state === 'running').length : null;
  const totalContainers = containers ? containers.length : null;
  const oomKills = kernel?.oom_kill_count ?? 0;

  // --- Health checks & score -------------------------------------------------
  const checks: Check[] = [
    {
      label: 'CPU is running hot',
      detail: `${cpu.toFixed(0)}% sustained`,
      link: '/system',
      ok: cpu < 90,
      sev: cpu >= 95 ? 'bad' : 'warn',
    },
    {
      label: 'Memory pressure high',
      detail: `${mem.toFixed(0)}% of RAM in use`,
      link: '/system',
      ok: mem < 90,
      sev: mem >= 95 ? 'bad' : 'warn',
    },
    {
      label: 'Disk almost full',
      detail: `${disk.toFixed(0)}% used · ${formatBytes(sys.disk.free_bytes)} free`,
      link: '/maintenance',
      ok: disk < 90,
      sev: disk >= 95 ? 'bad' : 'warn',
    },
    ...(svcs
      ? [
          {
            label: `${failedServices} service${failedServices === 1 ? '' : 's'} failed`,
            detail: 'systemd units in a failed state',
            link: '/services',
            ok: failedServices === 0,
            sev: 'bad' as const,
          },
        ]
      : []),
    ...(kernel
      ? [
          {
            label: `Kernel OOM killer fired ${oomKills} time${oomKills === 1 ? '' : 's'}`,
            detail: 'Processes were killed by memory exhaustion',
            link: '/journal',
            ok: oomKills === 0,
            sev: 'bad' as const,
          },
        ]
      : []),
  ];

  const failedChecks = checks.filter((c) => !c.ok);
  const score = ((checks.length - failedChecks.length) / checks.length) * 100;
  const allGood = failedChecks.length === 0;

  // --- Hero ------------------------------------------------------------------
  const verdictColor = allGood ? 'var(--gb-ok)' : failedChecks.length <= 2 ? 'var(--gb-warn)' : 'var(--gb-bad)';
  const ringColor = allGood ? 'var(--gb-ok)' : failedChecks.length <= 2 ? 'var(--gb-warn)' : 'var(--gb-bad)';
  const ring = container.querySelector('#gbHeroRing') as HTMLElement;
  ring.innerHTML = ringSvg(score, ringColor);

  const verdict = container.querySelector('#gbHeroVerdict') as HTMLElement;
  verdict.className = 'gb-hero-verdict';
  verdict.style.color = verdictColor;
  verdict.textContent = allGood
    ? 'All systems normal'
    : failedChecks.length === 1
      ? '1 issue needs attention'
      : `${failedChecks.length} issues need attention`;

  const heroSub = container.querySelector('#gbHeroSub') as HTMLElement;
  heroSub.className = 'gb-hero-sub';
  const svcPhrase =
    runningServices !== null && totalServices !== null ? `${runningServices}/${totalServices} services up` : `${totalServices ?? '—'} services`;
  const ctrPhrase = totalContainers !== null ? `${runningContainers}/${totalContainers} containers running` : `${totalContainers ?? '—'} containers`;
  heroSub.textContent = `${svcPhrase} · ${ctrPhrase} · uptime ${formatUptime(sys.host.uptime_seconds)}`;

  const homeSub = container.querySelector('#gbHomeSub') as HTMLElement;
  homeSub.textContent = `${sys.host.hostname} · up ${formatUptime(sys.host.uptime_seconds)}`;

  // --- Attention strip -------------------------------------------------------
  const alerts = container.querySelector('#gbAlerts') as HTMLElement;
  if (!allGood) {
    alerts.hidden = false;
    alerts.innerHTML = failedChecks
      .map(
        (c) => `
      <a href="#${c.link}" class="gb-alert-item sev-${c.sev}">
        <span class="gb-alert-dot" aria-hidden="true"></span>
        <span class="gb-alert-text">
          <span class="gb-alert-label">${esc(c.label)}</span>
          <span class="gb-alert-detail">${esc(c.detail)}</span>
        </span>
        <span class="gb-alert-action">View</span>
      </a>
    `
      )
      .join('');
  }

  // --- Vitals tiles ----------------------------------------------------------
  const vitalsGrid = container.querySelector('#gbVitals .gb-vitals-grid') as HTMLElement;
  const avg = (v: number | undefined, digits = 0) => (v === undefined ? '' : `24h avg ${v.toFixed(digits)}%`);
  const load1m = (sys.load_avg || [])[0];
  vitalsGrid.innerHTML = [
    tileHtml({
      label: 'CPU',
      value: `${cpu.toFixed(0)}%`,
      sub: load1m !== undefined ? `load ${load1m.toFixed(2)}${stats ? ` · ${avg(stats.cpu.avg_percent)}` : ''}` : avg(stats?.cpu.avg_percent),
      pct: cpu,
      href: '/system',
      state: stateFor(cpu),
    }),
    tileHtml({
      label: 'RAM',
      value: `${mem.toFixed(0)}%`,
      sub: `${formatBytes(sys.memory.used_bytes)} used${stats ? ` · ${avg(stats.memory.avg_percent)}` : ''}`,
      pct: mem,
      href: '/system',
      state: stateFor(mem),
    }),
    tileHtml({
      label: 'Disk',
      value: `${disk.toFixed(0)}%`,
      sub: `${formatBytes(sys.disk.free_bytes)} free`,
      pct: disk,
      href: '/system',
      state: stateFor(disk),
    }),
    tileHtml({
      label: 'Network',
      value: netKbps >= 1024 ? `${(netKbps / 1024).toFixed(1)} MB/s` : `${Math.round(netKbps)} KB/s`,
      sub: `↓ in · ↑ ${formatBytes(netTx)}/s out`,
      pct: null,
      href: '/network',
      state: 'neutral',
    }),
  ].join('');

  // --- Quick links -----------------------------------------------------------
  const quick = container.querySelector('#gbQuick') as HTMLElement;
  const quickItems: string[] = [];

  if (svcs) {
    quickItems.push(
      quickTile({
        href: '/services',
        label: 'Services',
        value: svcs ? `${svcs.overview.running_services} running${svcs.overview.failed_services ? ` · ${svcs.overview.failed_services} failed` : ''}` : '—',
        icon: QUICK_ICONS.services,
      })
    );
  }
  if (containers) {
    quickItems.push(
      quickTile({
        href: '/containers',
        label: 'Containers',
        value: `${runningContainers}/${totalContainers} up`,
        icon: QUICK_ICONS.containers,
      })
    );
  }
  quickItems.push(
    quickTile({
      href: '/tasks',
      label: 'Processes',
      value: `Top consumers`,
      icon: QUICK_ICONS.tasks,
    })
  );
  if (kernel) {
    quickItems.push(
      quickTile({
        href: '/journal',
        label: 'Journal',
        value: oomKills === 0 ? 'No OOM events' : `${oomKills} OOM kills`,
        icon: QUICK_ICONS.journal,
      })
    );
  }
  quickItems.push(
    quickTile({
      href: '/maintenance',
      label: 'Maintenance',
      value: `${formatBytes(sys.disk.free_bytes)} free · prune tools`,
      icon: QUICK_ICONS.maintenance,
    })
  );

  if (quickItems.length === 0) {
    quick.innerHTML = emptyStateHtml('Nothing to show yet', 'Deeper pages are available in the navigation.');
  } else {
    quick.innerHTML = quickItems.join('');
  }

  // Partial data failures → inline error states in the affected sections.
  if (svcR.status === 'rejected') {
    const el = container.querySelector('#gbQuick') as HTMLElement;
    el.insertAdjacentHTML('afterbegin', errorStateHtml('Service list unavailable'));
  }
}

function formatUptime(seconds: number | null | undefined): string {
  const s = Math.floor(Number(seconds || 0));
  const d = Math.floor(s / 86400);
  if (d >= 1) return `${d}d ${Math.floor((s % 86400) / 3600)}h`;
  const h = Math.floor(s / 3600);
  if (h >= 1) return `${h}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)}m`;
}
