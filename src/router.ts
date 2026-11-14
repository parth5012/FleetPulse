import { esc } from './lib/format';
import { routeLoadingHtml } from './lib/ui';

type RenderFn = (container: HTMLElement) => void | Promise<void>;

let activeCleanup: (() => void) | null = null;

const routes: Record<string, () => Promise<RenderFn>> = {
  '/': async () => (await import('./pages/home')).renderHome,
  '/system': async () => {
    const mod = await import('./pages/system');
    activeCleanup = mod.cleanupSystem;
    return mod.renderSystem;
  },
  '/tasks': async () => {
    const mod = await import('./pages/tasks');
    activeCleanup = mod.cleanupTasks;
    return mod.renderTasks;
  },
  '/apps': async () => {
    const mod = await import('./pages/apps');
    activeCleanup = mod.cleanupApps;
    return mod.renderApps;
  },
  '/ops': async () => {
    const mod = await import('./pages/ops');
    activeCleanup = mod.cleanupOps;
    return mod.renderOps;
  },
};

// 10 routes down to 5: backward-compatible redirects for stale PWA bookmarks / deep links
const redirects: Record<string, string> = {
  '/network': '/system?tab=network',
  '/services': '/apps?tab=services',
  '/containers': '/apps?tab=containers',
  '/journal': '/ops?tab=journal',
  '/maintenance': '/ops?tab=maintenance',
  '/antigravity': '/ops?tab=quotas',
};

function currentRouteInfo(): { path: string; query: string } {
  const hash = window.location.hash || '#/';
  const full = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = full.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return { path, query: queryPart };
}

function setActive(path: string): void {
  // Update desktop sidebar and mobile bottom tab bar
  document.querySelectorAll('#shellNav a, #mobileNav a').forEach((a) => {
    const r = (a as HTMLElement).dataset.route;
    a.classList.toggle('active', r === path);
  });
}

export const router = {
  async render(): Promise<void> {
    const { path, query } = currentRouteInfo();

    // Handle old route redirects immediately
    if (redirects[path]) {
      const target = redirects[path];
      window.location.replace(`#${target}`);
      return;
    }

    if (activeCleanup) {
      try {
        activeCleanup();
      } catch (e) {
        console.warn('Cleanup error:', e);
      }
      activeCleanup = null;
    }

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
