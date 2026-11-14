import { ROUTES } from './shell';

type RenderFn = (container: HTMLElement) => void | Promise<void>;

let activeCleanup: (() => void) | null = null;

const routes: Record<string, () => Promise<RenderFn>> = {
  '/': async () => {
    const mod = await import('./pages/home');
    activeCleanup = mod.cleanupHome;
    return mod.renderHome;
  },
  '/tasks': async () => {
    const mod = await import('./pages/tasks');
    activeCleanup = mod.cleanupTasks;
    return mod.renderTasks;
  },
  '/services': async () => {
    const mod = await import('./pages/services');
    activeCleanup = mod.cleanupServices;
    return mod.renderServices;
  },
  '/system': async () => (await import('./pages/system')).renderSystem,
  '/containers': async () => (await import('./pages/containers')).renderContainers,
  '/apps': async () => (await import('./pages/apps')).renderApps,
  '/antigravity': async () => (await import('./pages/antigravity')).renderAntigravity,
  '/network': async () => {
    const mod = await import('./pages/network');
    activeCleanup = mod.cleanupNetwork;
    return mod.renderNetwork;
  },
  '/journal': async () => {
    const mod = await import('./pages/journal');
    activeCleanup = mod.cleanupJournal;
    return mod.renderJournal;
  },
  '/maintenance': async () => (await import('./pages/maintenance')).renderMaintenance,
};

function currentPath(): string {
  const hash = window.location.hash || '#/';
  const path = hash.replace(/^#/, '') || '/';
  return path.split('?')[0];
}

function setActive(path: string): void {
  // Update both desktop header nav and mobile bottom tab bar
  document.querySelectorAll('#shellNav a, #mobileNav a').forEach((a) => {
    const r = (a as HTMLElement).dataset.route;
    a.classList.toggle('active', r === path);
  });
}

export const router = {
  async render(): Promise<void> {
    if (activeCleanup) {
      try {
        activeCleanup();
      } catch (e) {
        console.warn('Cleanup error:', e);
      }
      activeCleanup = null;
    }

    const path = currentPath();
    setActive(path);
    const meta = ROUTES.find((r) => r.path === path);
    document.title = meta && path !== '/' ? `${meta.name} — FleetPulse` : 'FleetPulse — Fleet Overview';
    const page = document.getElementById('page')!;
    page.innerHTML = `
      <div class="page-crumb"><span class="crumb-sep">FleetPulse</span> / ${meta ? meta.name : ''}</div>
      <div class="page-title">${meta ? meta.name : 'Loading'}</div>
      <div class="sk" style="width: 40%; height: 10px; margin-bottom: 24px;"></div>
      <div class="sk" style="width: 100%; height: 120px; border-radius: 8px; margin-bottom: 12px;"></div>
      <div class="sk" style="width: 100%; height: 220px; border-radius: 8px;"></div>
    `;
    const loader = routes[path] || routes['/'];
    try {
      const renderFn = await loader();
      await renderFn(page);
    } catch (err) {
      console.warn('Route render error', err);
      page.innerHTML = `
        <div class="empty-state">
          <p style="font-weight:600; color: var(--text); margin-bottom: 4px;">Couldn't load this page</p>
          <p class="text-muted" style="font-size:0.84rem;">${String(err)}</p>
          <button class="ps-retry" onclick="location.reload()" style="margin-top:12px;">Retry</button>
        </div>
      `;
    }
  },
  start(): void {
    window.addEventListener('hashchange', () => this.render());
    if (!window.location.hash) window.location.hash = '#/';
    this.render();
  },
};
