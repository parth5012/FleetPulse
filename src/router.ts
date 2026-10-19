type RenderFn = (container: HTMLElement) => void | Promise<void>;

let activeCleanup: (() => void) | null = null;

const routes: Record<string, () => Promise<RenderFn>> = {
  '/': async () => (await import('./pages/home')).renderHome,
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
  '/antigravity': async () => (await import('./pages/antigravity')).renderAntigravity,
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
    const page = document.getElementById('page')!;
    page.innerHTML = '<div class="empty-state"><p class="spin">⚡</p><p>Loading...</p></div>';
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
