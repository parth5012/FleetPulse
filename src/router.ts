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
  // Update desktop sidebar, mobile bottom bar, and the More sheet items.
  document.querySelectorAll('.nav-item, .more-item').forEach((a) => {
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
    const page = document.getElementById('page')!;
    page.innerHTML = '<div class="page-loading"><span class="live-dot live-dot-lg" aria-hidden="true"></span><p>Loading…</p></div>';
    const loader = routes[path] || routes['/'];
    try {
      const renderFn = await loader();
      await renderFn(page);
    } catch (err) {
      page.innerHTML = `<div class="empty-state"><p>Error loading view: ${String(err)}</p></div>`;
    }
  },
  start(): void {
    window.addEventListener('hashchange', () => this.render());
    if (!window.location.hash) window.location.hash = '#/';
    this.render();
  },
};
