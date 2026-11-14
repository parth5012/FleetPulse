/**
 * Calm Ops shell: slim sticky header, desktop sidebar with grouped
 * sections, mobile bottom nav (4 primaries + More sheet).
 */
import { icons } from './lib/icons';

export function renderShell(root: HTMLElement): void {
  root.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <a href="#/" class="brand-link" aria-label="FleetPulse home">
          <span class="brand-logo">${icons.activity({ size: 17 })}</span>
          <span class="brand-title">FleetPulse</span>
        </a>
        <div class="header-right">
          <a href="#/" class="live-pill" title="Telemetry streaming" aria-label="Live telemetry">
            <span class="live-dot" aria-hidden="true"></span>
            <span>Live</span>
          </a>
          <button id="pwaInstallBtn" class="btn btn-secondary btn-sm" style="display:none;">Install app</button>
        </div>
      </header>

      <aside class="app-sidebar" aria-label="Primary">
        <nav class="sidebar-nav" id="shellNav">
          <div class="nav-group">
            <div class="nav-group-label">Overview</div>
            <a href="#/" data-route="/" class="nav-item">${icons.home()}<span>Home</span></a>
          </div>
          <div class="nav-group">
            <div class="nav-group-label">Monitor</div>
            <a href="#/system" data-route="/system" class="nav-item">${icons.system()}<span>System</span></a>
            <a href="#/network" data-route="/network" class="nav-item">${icons.network()}<span>Network</span></a>
            <a href="#/journal" data-route="/journal" class="nav-item">${icons.journal()}<span>Journal</span></a>
            <a href="#/containers" data-route="/containers" class="nav-item">${icons.containers()}<span>Containers</span></a>
          </div>
          <div class="nav-group">
            <div class="nav-group-label">Operate</div>
            <a href="#/tasks" data-route="/tasks" class="nav-item">${icons.tasks()}<span>Tasks</span></a>
            <a href="#/services" data-route="/services" class="nav-item">${icons.services()}<span>Services</span></a>
          </div>
          <div class="nav-group">
            <div class="nav-group-label">Tools</div>
            <a href="#/apps" data-route="/apps" class="nav-item">${icons.apps()}<span>Apps</span></a>
            <a href="#/antigravity" data-route="/antigravity" class="nav-item">${icons.quotas()}<span>Quotas</span></a>
            <a href="#/maintenance" data-route="/maintenance" class="nav-item">${icons.maintenance()}<span>Maintenance</span></a>
          </div>
        </nav>
      </aside>

      <main id="page" class="page-content"></main>

      <nav class="mobile-bottom-nav" id="mobileNav" aria-label="Primary mobile">
        <a href="#/" data-route="/" class="nav-item">${icons.home({ size: 22 })}<span>Home</span></a>
        <a href="#/tasks" data-route="/tasks" class="nav-item">${icons.tasks({ size: 22 })}<span>Tasks</span></a>
        <a href="#/services" data-route="/services" class="nav-item">${icons.services({ size: 22 })}<span>Services</span></a>
        <a href="#/system" data-route="/system" class="nav-item">${icons.system({ size: 22 })}<span>System</span></a>
        <button type="button" class="nav-item nav-more-btn" id="moreNavBtn" aria-expanded="false" aria-controls="moreSheet">
          ${icons.more({ size: 22 })}<span>More</span>
        </button>
      </nav>

      <div class="more-sheet" id="moreSheet" hidden>
        <div class="more-sheet-backdrop" id="moreSheetBackdrop"></div>
        <div class="more-sheet-panel" role="dialog" aria-label="More pages">
          <div class="more-sheet-head">
            <span class="micro-label">All pages</span>
            <button type="button" class="more-sheet-close" id="moreSheetClose" aria-label="Close">${icons.close({ size: 18 })}</button>
          </div>
          <div class="more-sheet-grid">
            <a href="#/network" data-route="/network" class="more-item">${icons.network()}<span>Network</span></a>
            <a href="#/journal" data-route="/journal" class="more-item">${icons.journal()}<span>Journal</span></a>
            <a href="#/containers" data-route="/containers" class="more-item">${icons.containers()}<span>Containers</span></a>
            <a href="#/apps" data-route="/apps" class="more-item">${icons.apps()}<span>Apps</span></a>
            <a href="#/antigravity" data-route="/antigravity" class="more-item">${icons.quotas()}<span>Quotas</span></a>
            <a href="#/maintenance" data-route="/maintenance" class="more-item">${icons.maintenance()}<span>Maintenance</span></a>
          </div>
        </div>
      </div>
    </div>
  `;

  wireMoreSheet();
}

function wireMoreSheet(): void {
  const sheet = document.getElementById('moreSheet');
  const openBtn = document.getElementById('moreNavBtn');
  if (!sheet || !openBtn) return;

  const setOpen = (open: boolean): void => {
    sheet.hidden = !open;
    openBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('sheet-open', open);
  };

  openBtn.addEventListener('click', () => setOpen(sheet.hidden));
  document.getElementById('moreSheetClose')?.addEventListener('click', () => setOpen(false));
  document.getElementById('moreSheetBackdrop')?.addEventListener('click', () => setOpen(false));
  sheet.querySelectorAll('.more-item').forEach((a) =>
    a.addEventListener('click', () => setOpen(false))
  );

  // Keep the More trigger highlighted when a sheet route is active.
  const observer = new MutationObserver(() => {
    const active = sheet.querySelector('.more-item.active');
    openBtn.classList.toggle('active', !!active);
  });
  observer.observe(sheet, { attributes: true, subtree: true, attributeFilter: ['class'] });
}
