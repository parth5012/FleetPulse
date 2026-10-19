type RenderFn = (container: HTMLElement) => void | Promise<void>;

const routes: Record<string, () => Promise<RenderFn>> = {
  '/': async () => (await import('./pages/home')).renderHome,
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
  document.querySelectorAll('#shellNav a').forEach((a) => {
    const r = (a as HTMLElement).dataset.route;
    a.classList.toggle('active', r === path);
  });
}

export const router = {
  async render(): Promise<void> {
    const path = currentPath();
    setActive(path);
    const page = document.getElementById('page')!;
    page.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';
    const loader = routes[path] || routes['/'];
    try {
      const renderFn = await loader();
      await renderFn(page);
    } catch (err) {
      page.innerHTML = `<div class="empty-state"><p>Error: ${String(err)}</p></div>`;
    }
  },
  start(): void {
    window.addEventListener('hashchange', () => this.render());
    if (!window.location.hash) window.location.hash = '#/';
    this.render();
  },
};
