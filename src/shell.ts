/**
 * Glanceboard shell.
 * Desktop (>=1024px): quiet left sidebar with grouped navigation (5 core pages).
 * Mobile (<1024px): slim top bar + exactly 5-item bottom nav (Home, System, Tasks, Apps, Ops).
 * All touch targets >= 44px. Safe-area insets handled.
 */

export interface NavItem {
  route: string;
  label: string;
  desc: string;
  icon: string;
}

function svg(body: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const I = {
  home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.3V21h13V9.3"/>'),
  system: svg('<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2.5V5M15 2.5V5M9 19v2.5M15 19v2.5M2.5 9H5M2.5 15H5M19 9h2.5M19 15h2.5"/>'),
  tasks: svg('<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
  apps: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
  ops: svg('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
};

// 5 Consolidated Core Pages
export const navItems: NavItem[] = [
  { route: '/', label: 'Home', desc: 'Fleet health at a glance', icon: I.home },
  { route: '/system', label: 'System', desc: 'Host vitals & network mesh', icon: I.system },
  { route: '/tasks', label: 'Tasks', desc: 'Live process manager', icon: I.tasks },
  { route: '/apps', label: 'Apps', desc: 'Apps, services & containers', icon: I.apps },
  { route: '/ops', label: 'Ops', desc: 'Maintenance, journal & quotas', icon: I.ops },
];

// Desktop sidebar groups
const sidebarGroups: { title: string; items: NavItem[] }[] = [
  { title: 'Monitor', items: [navItems[0], navItems[1]] },
  { title: 'Workloads', items: [navItems[2], navItems[3]] },
  { title: 'Administration', items: [navItems[4]] },
];

function navLink(item: NavItem, extraClass = ''): string {
  return `
    <a href="#${item.route}" data-route="${item.route}" class="${extraClass}" title="${item.desc}">
      <span class="gb-nav-icon">${item.icon}</span>
      <span class="gb-nav-label">${item.label}</span>
    </a>
  `;
}

export function renderShell(root: HTMLElement): void {
  root.innerHTML = `
    <div class="gb-shell">
      <!-- Desktop sidebar -->
      <aside class="gb-sidebar">
        <a href="#/" class="gb-brand">
          <span class="gb-brand-mark">${svg('<path d="M12 2.5 21 7.4v9.2l-9 4.9-9-4.9V7.4z"/><path d="M12 22V12.3"/>')}</span>
          <span class="gb-brand-name">FleetPulse</span>
        </a>
        <nav class="gb-side-nav" id="shellNav" aria-label="Primary">
          ${sidebarGroups
            .map(
              (g) => `
            <div class="gb-nav-group">
              <div class="gb-nav-group-title">${g.title}</div>
              ${g.items.map((it) => navLink(it, 'gb-side-link')).join('')}
            </div>
          `
            )
            .join('')}
        </nav>
      </aside>

      <div class="gb-main">
        <!-- Top bar (freshness lives here on both layouts) -->
        <header class="gb-topbar">
          <a href="#/" class="gb-brand gb-brand-mobile" aria-label="FleetPulse home">
            <span class="gb-brand-mark">${svg('<path d="M12 2.5 21 7.4v9.2l-9 4.9-9-4.9V7.4z"/><path d="M12 22V12.3"/>')}</span>
            <span class="gb-brand-name">FleetPulse</span>
          </a>
          <div class="gb-topbar-right">
            <button id="pwaInstallBtn" class="gb-btn gb-btn-secondary gb-install-btn" style="display: none;">Install</button>
            <button id="gbFreshness" class="gb-freshness" title="Reload current view">
              <span class="gb-fresh-dot"></span>
              <span id="gbFreshnessText">Updated just now</span>
            </button>
          </div>
        </header>

        <main id="page" class="page-content gb-page"></main>

        <!-- Mobile bottom nav: exactly 5 items, thumb zone -->
        <nav class="gb-bottomnav" id="mobileNav" aria-label="Primary">
          ${navItems.map((it) => navLink(it, 'gb-tab')).join('')}
        </nav>
      </div>
    </div>
  `;

  wireFreshness();
}

let lastRender = Date.now();
let freshnessTimer: number | null = null;

export function markRendered(): void {
  lastRender = Date.now();
  paintFreshness();
}

function paintFreshness(): void {
  const el = document.getElementById('gbFreshnessText');
  if (!el) return;
  const s = Math.max(0, Math.round((Date.now() - lastRender) / 1000));
  el.textContent = s < 3 ? 'Updated just now' : s < 60 ? `Updated ${s}s ago` : `Updated ${Math.floor(s / 60)}m ago`;
}

function wireFreshness(): void {
  document.getElementById('gbFreshness')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('gb:refresh'));
  });
  document.addEventListener('gb:rendered', markRendered);
  if (freshnessTimer !== null) window.clearInterval(freshnessTimer);
  freshnessTimer = window.setInterval(paintFreshness, 5000);
  paintFreshness();
}
