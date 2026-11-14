import { esc } from './lib/format';
import { routeLoadingHtml } from './lib/ui';

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
  // Update desktop sidebar, mobile bottom tab bar and the More sheet.
  document.querySelectorAll('#shellNav a, #mobileNav a, #gbMoreSheet a').forEach((a) => {
    const r = (a as HTMLElement).dataset.route;
    a.classList.toggle('active', r === path);
  });
  // The More button lights up when the active route lives inside the sheet.
  const moreRoutes = ['/services', '/containers', '/network', '/journal', '/maintenance', '/antigravity'];
  document.getElementById('gbMoreBtn')?.classList.toggle('active', moreRoutes.includes(path));
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
    page.innerHTML = routeLoadingHtml();
    const loader = routes[path] || routes['/'];
    try {
      const renderFn = await loader();
      await renderFn(page);
    } catch (err) {
      page.innerHTML = `
        <div class="gb-state gb-state-error">
          <p class="gb-state-title">Couldn't load this page</p>
          <p class="gb-state-sub">${esc(String(err))}</p>
          <button class="gb-btn gb-btn-secondary" onclick="window.location.reload()">Try again</button>
        </div>
      `;
    }
    document.dispatchEvent(new CustomEvent('gb:rendered'));
  },
  start(): void {
    window.addEventListener('hashchange', () => this.render());
    // Freshness chip tap → re-render the current route.
    window.addEventListener('gb:refresh', () => this.render());
    if (!window.location.hash) window.location.hash = '#/';
    this.render();
  },
};
