/**
 * Daylight Console shell.
 * Top header (brand + primary nav + command jump + live pill),
 * mobile bottom nav (4 primary slots + "More" sheet) and
 * a route registry powering the command jump on desktop and mobile.
 */

export interface RouteMeta {
  path: string;
  name: string;
  desc: string;
  keywords: string;
  primary: boolean; // shown in the top-level nav rows
  mobile: boolean; // pinned slot in the mobile bottom bar
  icon: string; // inline SVG (stroke-based, 24px viewBox)
}

export function icon(name: string, size = 18): string {
  const paths: Record<string, string> = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    chart: '<path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="8"/><rect x="12" y="6" width="3" height="12"/><rect x="17" y="13" width="3" height="5"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.layout}</svg>`;
}

export const ROUTES: RouteMeta[] = [
  { path: '/', name: 'Home', desc: 'Fleet overview & vitals', keywords: 'overview dashboard home fleet health', primary: true, mobile: true, icon: 'home' },
  { path: '/tasks', name: 'Tasks', desc: 'Process monitor (btop)', keywords: 'processes btop cpu tasks kill', primary: true, mobile: true, icon: 'zap' },
  { path: '/services', name: 'Services', desc: 'systemd daemons', keywords: 'systemd daemons services restart', primary: true, mobile: true, icon: 'cpu' },
  { path: '/system', name: 'System', desc: 'Hardware telemetry', keywords: 'beszel charts cpu ram disk telemetry system', primary: true, mobile: true, icon: 'monitor' },
  { path: '/network', name: 'Network', desc: 'Tailscale mesh & sockets', keywords: 'tailscale wireguard ports sockets network', primary: false, mobile: false, icon: 'globe' },
  { path: '/journal', name: 'Journal', desc: 'Kernel & systemd logs', keywords: 'logs journalctl oom psi kernel journal', primary: false, mobile: false, icon: 'file' },
  { path: '/maintenance', name: 'Maintenance', desc: 'Admin actions & cleanup', keywords: 'admin prune vacuum restart docker maintenance', primary: false, mobile: false, icon: 'wrench' },
  { path: '/containers', name: 'Containers', desc: 'Docker fleet & logs', keywords: 'docker dozzel containers logs fleet', primary: false, mobile: false, icon: 'box' },
  { path: '/apps', name: 'Apps', desc: 'Public apps & tunnels', keywords: 'tunnels public apps picoshare', primary: false, mobile: false, icon: 'rocket' },
  { path: '/antigravity', name: 'Quotas', desc: 'LLM quota pools', keywords: 'antigravity omniroute llm quota tokens', primary: false, mobile: false, icon: 'chart' },
];

function matchRoutes(query: string): RouteMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return ROUTES;
  return ROUTES.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.desc.toLowerCase().includes(q) ||
      r.keywords.includes(q)
  );
}

function cmdkItem(r: RouteMeta): string {
  return `
    <div class="cmdk-item" role="option" data-goto="#${r.path}">
      <span class="dd-icon">${icon(r.icon, 16)}</span>
      <span class="cmdk-item-title">${r.name}</span>
      <span class="cmdk-item-desc">${r.desc}</span>
    </div>`;
}

function wireCmdk(root: HTMLElement, input: HTMLInputElement, pop: HTMLElement): void {
  let selected = 0;
  let current: RouteMeta[] = [];

  const render = () => {
    current = matchRoutes(input.value);
    selected = 0;
    pop.innerHTML = current.length
      ? current.map(cmdkItem).join('')
      : '<div class="cmdk-empty">No matching page</div>';
    pop.querySelectorAll<HTMLElement>('.cmdk-item').forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        window.location.hash = el.dataset.goto!;
        input.value = '';
        render();
        input.blur();
      });
    });
  };
  render();

  const highlight = () => {
    pop.querySelectorAll<HTMLElement>('.cmdk-item').forEach((el, i) => {
      el.classList.toggle('selected', i === selected);
    });
  };
  highlight();

  input.addEventListener('input', render);
  input.addEventListener('focus', () => {
    input.closest('.cmdk-box')?.classList.add('focused');
    pop.classList.add('visible');
    render();
  });
  input.addEventListener('blur', () => {
    input.closest('.cmdk-box')?.classList.remove('focused');
    // Small delay so mousedown on results wins over blur
    window.setTimeout(() => pop.classList.remove('visible'), 120);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selected = Math.min(selected + 1, current.length - 1);
      highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selected = Math.max(selected - 1, 0);
      highlight();
    } else if (e.key === 'Enter') {
      const r = current[selected] || current[0];
      if (r) {
        window.location.hash = `#${r.path}`;
        input.value = '';
        render();
        input.blur();
      }
    } else if (e.key === 'Escape') {
      input.blur();
    }
  });
}

export function renderShell(root: HTMLElement): void {
  root.innerHTML = `
    <div class="app-layout">
      <!-- Top Header -->
      <header class="app-top-header">
        <div class="brand">
          <a href="#/" class="brand-link" aria-label="FleetPulse home">
            <span class="brand-logo">${icon('pulse', 16)}</span>
            <div class="brand-text">
              <span class="brand-title">FleetPulse</span>
              <span class="brand-sub">Host observability</span>
            </div>
          </a>
        </div>

        <nav class="shell-nav desktop-nav" id="shellNav" aria-label="Primary">
          ${ROUTES.filter((r) => r.primary)
            .map((r) => `<a href="#${r.path}" data-route="${r.path}">${r.name}</a>`)
            .join('')}
          <div class="nav-more-wrap">
            <button id="navMoreBtn" class="nav-more-btn" aria-haspopup="true" aria-expanded="false">
              More <span class="chev">${icon('chevron', 12)}</span>
            </button>
            <div class="nav-dropdown" id="navDropdown" hidden>
              <div class="dd-label">More pages</div>
              ${ROUTES.filter((r) => !r.primary)
                .map(
                  (r) => `
                <a href="#${r.path}" data-route="${r.path}">
                  <span class="dd-icon">${icon(r.icon, 16)}</span>
                  ${r.name}
                  <span class="dd-desc">${r.desc}</span>
                </a>`
                )
                .join('')}
            </div>
          </div>
        </nav>

        <div class="header-right">
          <div class="cmdk desktop-cmdk" id="cmdkDesktop">
            <div class="cmdk-box" id="cmdkBox">
              <span class="cmdk-icon">${icon('search', 15)}</span>
              <input id="cmdkInput" class="cmdk-input" type="text" placeholder="Jump to page…" autocomplete="off" spellcheck="false" aria-label="Jump to page" />
              <span class="cmdk-kbd">/</span>
            </div>
            <div class="cmdk-pop" id="cmdkPop" role="listbox" hidden></div>
          </div>
          <button id="cmdkMobileTrigger" class="cmdk-mobile-trigger" aria-label="Search pages">${icon('search', 20)}</button>
          <button id="pwaInstallBtn" class="btn btn-pwa-install" style="display: none;" title="Install Dashboard as App">Install App</button>
          <div class="live-status-pill" title="Telemetry live streaming">
            <span class="live-dot"></span>
            <span class="live-text">LIVE</span>
          </div>
        </div>
      </header>

      <!-- Main Page Viewport -->
      <main id="page" class="page-content container"></main>

      <!-- Mobile Bottom Navigation -->
      <nav class="mobile-bottom-nav" id="mobileNav" aria-label="Primary mobile">
        ${ROUTES.filter((r) => r.mobile)
          .map(
            (r) => `
          <a href="#${r.path}" data-route="${r.path}" class="nav-item">
            <span class="nav-icon">${icon(r.icon, 20)}</span>
            <span class="nav-label">${r.name}</span>
          </a>`
          )
          .join('')}
        <button id="mobileMoreBtn" class="nav-item" aria-haspopup="true" aria-expanded="false">
          <span class="nav-icon">${icon('more', 20)}</span>
          <span class="nav-label">More</span>
        </button>
      </nav>

      <!-- Mobile command sheet -->
      <div class="cmdk-sheet" id="cmdkSheet">
        <div class="sheet-backdrop" data-close></div>
        <div class="sheet-panel">
          <div class="cmdk-box">
            <span class="cmdk-icon">${icon('search', 18)}</span>
            <input id="cmdkMobileInput" class="cmdk-input" type="text" placeholder="Jump to page…" autocomplete="off" spellcheck="false" aria-label="Jump to page" />
            <button class="cmdk-kbd" data-close style="border:1px solid var(--card-border); cursor:pointer; font-family:var(--font-mono);">${icon('x', 12)}</button>
          </div>
          <div class="cmdk-pop" id="cmdkMobilePop" role="listbox"></div>
        </div>
      </div>

      <!-- Mobile More sheet -->
      <div class="nav-more-sheet" id="navMoreSheet">
        <div class="sheet-backdrop" data-close></div>
        <div class="sheet-panel">
          <div class="sheet-title">All pages</div>
          <div class="more-grid">
            ${ROUTES.filter((r) => !r.mobile)
              .map(
                (r) => `
              <a href="#${r.path}" data-route="${r.path}">
                <span class="m-icon">${icon(r.icon, 18)}</span>
                <span class="m-name">${r.name}</span>
              </a>`
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // --- Command jump wiring ---
  wireCmdk(
    root,
    root.querySelector('#cmdkInput') as HTMLInputElement,
    root.querySelector('#cmdkPop') as HTMLElement
  );
  wireCmdk(
    root,
    root.querySelector('#cmdkMobileInput') as HTMLInputElement,
    root.querySelector('#cmdkMobilePop') as HTMLElement
  );

  // Global "/" shortcut focuses desktop search (or opens mobile sheet)
  const desktopInput = root.querySelector('#cmdkInput') as HTMLInputElement;
  const mobileSheet = root.querySelector('#cmdkSheet') as HTMLElement;
  const mobileInput = root.querySelector('#cmdkMobileInput') as HTMLInputElement;
  document.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === '/' && !typing) {
      e.preventDefault();
      if (window.innerWidth <= 768) {
        mobileSheet.classList.add('open');
        setTimeout(() => mobileInput.focus(), 30);
      } else {
        desktopInput.focus();
      }
    }
  });

  // Mobile search sheet open/close
  root.querySelector('#cmdkMobileTrigger')?.addEventListener('click', () => {
    mobileSheet.classList.add('open');
    setTimeout(() => mobileInput.focus(), 30);
  });
  mobileSheet.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', () => {
      mobileSheet.classList.remove('open');
      mobileInput.value = '';
    })
  );

  // Desktop "More" dropdown
  const moreBtn = root.querySelector('#navMoreBtn') as HTMLElement;
  const dropdown = root.querySelector('#navDropdown') as HTMLElement;
  const closeDropdown = () => {
    dropdown.hidden = true;
    moreBtn.setAttribute('aria-expanded', 'false');
  };
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
    moreBtn.setAttribute('aria-expanded', String(!dropdown.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!dropdown.hidden && !dropdown.contains(e.target as Node)) closeDropdown();
  });
  dropdown.addEventListener('click', () => closeDropdown());

  // Mobile "More" sheet
  const moreSheet = root.querySelector('#navMoreSheet') as HTMLElement;
  root.querySelector('#mobileMoreBtn')?.addEventListener('click', () => {
    moreSheet.classList.add('open');
  });
  moreSheet.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', () => moreSheet.classList.remove('open'))
  );
  moreSheet.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => moreSheet.classList.remove('open'))
  );

  // Highlight the More button when a secondary route is active
  const syncMoreActive = () => {
    const path = (window.location.hash.replace(/^#/, '') || '/').split('?')[0];
    const secondary = ROUTES.find((r) => !r.primary && r.path === path);
    moreBtn.classList.toggle('active', !!secondary);
    const mobileMoreBtn = root.querySelector('#mobileMoreBtn') as HTMLElement | null;
    mobileMoreBtn?.classList.toggle('active', !!secondary);
  };
  window.addEventListener('hashchange', syncMoreActive);
  syncMoreActive();

  // Highlight active items inside sheets/dropdown (router only toggles top navs)
  window.addEventListener('hashchange', () => {
    const path = (window.location.hash.replace(/^#/, '') || '/').split('?')[0];
    root
      .querySelectorAll('#navDropdown a, .more-grid a')
      .forEach((a) => a.classList.toggle('active', (a as HTMLElement).dataset.route === path));
  });
}
