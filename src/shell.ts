/**
 * Glanceboard shell.
 * Desktop (>=1024px): quiet left sidebar with grouped navigation.
 * Mobile (<1024px): slim top bar + 5-item bottom nav; "More" opens a
 * bottom sheet holding the remaining routes. All touch targets >= 44px.
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

const I = {
  home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.3V21h13V9.3"/>'),
  system: svg('<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2.5V5M15 2.5V5M9 19v2.5M15 19v2.5M2.5 9H5M2.5 15H5M19 9h2.5M19 15h2.5"/>'),
  tasks: svg('<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
  apps: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
  more: svg('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
  services: svg('<rect x="3.5" y="4" width="17" height="6.5" rx="1.5"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="1.5"/><path d="M7 7.2h.01M7 16.7h.01"/>'),
  containers: svg('<path d="M12 2.5 21 7.4v9.2l-9 4.9-9-4.9V7.4z"/><path d="M3.4 7.6 12 12.3l8.6-4.7M12 22V12.3"/>'),
  network: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3.6 2.8 14.4 0 18-2.8-3.6-2.8-14.4 0-18z"/>'),
  journal: svg('<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M9 13h6M9 17h4"/>'),
  maintenance: svg('<path d="M14.5 6.5a4 4 0 0 0-5.4 5.2L3.5 17.3l3.2 3.2 5.6-5.6a4 4 0 0 0 5.2-5.4l-2.7 2.7-2.4-.6-.6-2.4z"/>'),
  quotas: svg('<path d="M4.5 15.5a8 8 0 1 1 15 0"/><path d="M12 15.5l3.8-3.8"/><circle cx="12" cy="15.5" r="1.2"/>'),
};

// Primary mobile items (thumb zone) — most used first.
const primaryNav: NavItem[] = [
  { route: '/', label: 'Home', desc: 'Fleet health at a glance', icon: I.home },
  { route: '/system', label: 'System', desc: 'CPU, RAM, disk & network vitals', icon: I.system },
  { route: '/tasks', label: 'Tasks', desc: 'Live process manager', icon: I.tasks },
  { route: '/apps', label: 'Apps', desc: 'Start & stop curated apps', icon: I.apps },
];

const moreNav: NavItem[] = [
  { route: '/services', label: 'Services', desc: 'systemd daemons', icon: I.services },
  { route: '/containers', label: 'Containers', desc: 'Docker fleet & logs', icon: I.containers },
  { route: '/network', label: 'Network', desc: 'Tailscale mesh & ports', icon: I.network },
  { route: '/journal', label: 'Journal', desc: 'Kernel & systemd logs', icon: I.journal },
  { route: '/maintenance', label: 'Maintenance', desc: 'Prune, vacuum, restarts', icon: I.maintenance },
  { route: '/antigravity', label: 'Quotas', desc: 'AI account quota pools', icon: I.quotas },
];

// Desktop sidebar groups.
const sidebarGroups: { title: string; items: NavItem[] }[] = [
  { title: 'Monitor', items: [primaryNav[0], primaryNav[1], moreNav[2], moreNav[3]] },
  { title: 'Operate', items: [primaryNav[2], moreNav[0], moreNav[1], moreNav[4]] },
  { title: 'Apps', items: [primaryNav[3], moreNav[5]] },
];

function navLink(item: NavItem, extraClass = ''): string {
  return `
    <a href="#${item.route}" data-route="${item.route}" class="${extraClass}" title="${item.desc}">
      <span class="gb-nav-icon">${item.icon}</span>
      <span class="gb-nav-label">${item.label}</span>
    </a>
  `;
}

function iconFor(route: string): string {
  return [...primaryNav, ...moreNav].find((n) => n.route === route)?.icon || I.more;
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

        <!-- Mobile bottom nav: 5 items max, thumb zone -->
        <nav class="gb-bottomnav" id="mobileNav" aria-label="Primary">
          ${primaryNav.map((it) => navLink(it, 'gb-tab')).join('')}
          <button type="button" id="gbMoreBtn" class="gb-tab gb-tab-more" aria-expanded="false" aria-controls="gbMoreSheet">
            <span class="gb-nav-icon">${I.more}</span>
            <span class="gb-nav-label">More</span>
          </button>
        </nav>

        <!-- "More" bottom sheet (mobile) -->
        <div class="gb-sheet-backdrop" id="gbSheetBackdrop" hidden></div>
        <div class="gb-sheet" id="gbMoreSheet" role="dialog" aria-modal="true" aria-label="More pages" hidden>
          <div class="gb-sheet-grab" aria-hidden="true"></div>
          <div class="gb-sheet-title">More</div>
          <div class="gb-sheet-grid">
            ${moreNav
              .map(
                (it) => `
              <a href="#${it.route}" data-route="${it.route}" class="gb-sheet-item">
                <span class="gb-sheet-icon">${it.icon}</span>
                <span class="gb-sheet-text">
                  <span class="gb-sheet-label">${it.label}</span>
                  <span class="gb-sheet-desc">${it.desc}</span>
                </span>
              </a>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  wireMoreSheet();
  wireFreshness();
}

// ---------------------------------------------------------------------------
// More sheet
// ---------------------------------------------------------------------------

function setSheetOpen(open: boolean): void {
  const backdrop = document.getElementById('gbSheetBackdrop');
  const sheet = document.getElementById('gbMoreSheet');
  const btn = document.getElementById('gbMoreBtn');
  if (!backdrop || !sheet || !btn) return;
  backdrop.hidden = !open;
  sheet.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  // Slide-up transition needs one frame before removing [hidden].
  requestAnimationFrame(() => sheet.classList.toggle('open', open));
  if (open) (sheet.querySelector('.gb-sheet-item') as HTMLElement | null)?.focus();
  else btn.focus();
}

function wireMoreSheet(): void {
  const btn = document.getElementById('gbMoreBtn');
  const backdrop = document.getElementById('gbSheetBackdrop');
  btn?.addEventListener('click', () => {
    const sheet = document.getElementById('gbMoreSheet');
    setSheetOpen(!sheet || sheet.hidden);
  });
  backdrop?.addEventListener('click', () => setSheetOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setSheetOpen(false);
  });
  // Close the sheet whenever navigation happens from inside it.
  document.getElementById('gbMoreSheet')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) setSheetOpen(false);
  });
}

/** Highlight the More button when the active route lives in the sheet. */
export function setMoreActive(active: boolean): void {
  document.getElementById('gbMoreBtn')?.classList.toggle('active', active);
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

// ---------------------------------------------------------------------------
// PWA install — mirror the main.ts handler onto the mobile button too
// ---------------------------------------------------------------------------

function syncMobileInstallButton(): void {
  const desktopBtn = document.getElementById('pwaInstallBtn');
  const mobileBtn = document.getElementById('pwaInstallBtnMobile');
  if (!desktopBtn || !mobileBtn) return;
  const sync = () => {
    mobileBtn.style.display = desktopBtn.style.display;
  };
  new MutationObserver(sync).observe(desktopBtn, { attributes: true, attributeFilter: ['style'] });
  sync();
}
