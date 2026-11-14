/**
 * Workloads & Apps Consolidation Dashboard.
 * Consolidates Curated Apps (public tunnel services), Systemd Services (user/system daemons),
 * and Docker Containers (Dozzel-style container fleet & live log console).
 */

import { fetchApps, triggerAppAction } from '../lib/api';
import { esc } from '../lib/format';
import { confirmDialog, skeletonBlock, errorStateHtml } from '../lib/ui';
import type { CuratedApp } from '../lib/api';
import { renderServices, cleanupServices } from './services';
import { renderContainers, cleanupContainers } from './containers';

export function cleanupApps(): void {
  cleanupServices();
  cleanupContainers();
}

export async function renderApps(container: HTMLElement): Promise<void> {
  cleanupApps();

  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const tabParam = urlParams.get('tab');
  let activeTab: 'apps' | 'services' | 'containers' =
    tabParam === 'services' || tabParam === 'containers' ? tabParam : 'apps';

  container.innerHTML = `
    <div class="gb-page-head">
      <div>
        <h1 class="gb-page-title">Workloads & Apps</h1>
        <p class="gb-page-sub">Curated public apps, systemd background daemons, and Docker container fleet.</p>
      </div>
    </div>

    <!-- Apps Sub-Navigation Tabs -->
    <div class="beszel-subnav" id="appsSubnav" style="margin-bottom:20px;">
      <button class="beszel-tab ${activeTab === 'apps' ? 'active' : ''}" data-tab="apps">Curated Apps</button>
      <button class="beszel-tab ${activeTab === 'services' ? 'active' : ''}" data-tab="services">Systemd Services</button>
      <button class="beszel-tab ${activeTab === 'containers' ? 'active' : ''}" data-tab="containers">Docker Containers</button>
    </div>

    <!-- Active Tab Container -->
    <div id="appsTabContent"></div>
  `;

  async function renderActiveTab(): Promise<void> {
    const content = container.querySelector('#appsTabContent') as HTMLElement;
    if (!content) return;
    content.innerHTML = '';

    if (activeTab === 'apps') {
      await renderCuratedApps(content);
    } else if (activeTab === 'services') {
      await renderServices(content, true);
    } else if (activeTab === 'containers') {
      await renderContainers(content, true);
    }
  }

  const tabBtns = container.querySelectorAll('#appsSubnav .beszel-tab') as NodeListOf<HTMLButtonElement>;
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nextTab = (btn.getAttribute('data-tab') as 'apps' | 'services' | 'containers') || 'apps';
      if (nextTab === activeTab) return;

      if (activeTab === 'services') {
        cleanupServices();
      } else if (activeTab === 'containers') {
        cleanupContainers();
      }

      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = nextTab;
      window.location.hash = `#/apps?tab=${activeTab}`;
      await renderActiveTab();
    });
  });

  await renderActiveTab();
}

async function renderCuratedApps(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
      <div>
        <h2 style="font-size:1.15rem; font-weight:600; margin:0;">Curated Application Services</h2>
        <p class="muted" style="font-size:0.82rem; margin:2px 0 0;">
          Curated services that do not auto-start on boot. Start, stop, or open them with one click.
        </p>
      </div>
      <div class="header-actions">
        <button id="refreshAppsBtn" class="btn btn-secondary btn-sm">🔄 Refresh</button>
      </div>
    </div>
    <div id="appsGrid" class="apps-grid">
      <div class="gb-skeleton-card" style="padding:20px;">
        ${skeletonBlock('gb-sk-title')}
        ${skeletonBlock('gb-sk-block')}
      </div>
    </div>
  `;

  const grid = container.querySelector('#appsGrid') as HTMLElement;
  const refreshBtn = container.querySelector('#refreshAppsBtn') as HTMLButtonElement;

  async function load(): Promise<void> {
    try {
      const data = await fetchApps();
      const apps = data.apps || [];
      if (apps.length === 0) {
        grid.innerHTML = '<div class="empty-state"><p>No curated apps configured.</p></div>';
        return;
      }
      grid.innerHTML = apps.map((a) => appCard(a)).join('');
      grid.querySelectorAll('[data-app-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const name = (btn as HTMLElement).dataset.app!;
          const action = (btn as HTMLElement).dataset.appAction!;
          const statusEl = grid.querySelector(`#appStatus-${name}`) as HTMLElement;
          if (action === 'stop' || action === 'restart') {
            const confirmed = await confirmDialog({
              title: `${action === 'stop' ? 'Stop' : 'Restart'} "${name}"?`,
              message: `The app will ${action === 'stop' ? 'go offline' : 'restart; brief downtime while it comes back'}.`,
              confirmLabel: action === 'stop' ? 'Stop' : 'Restart',
              danger: action === 'stop',
            });
            if (!confirmed) return;
          }
          if (statusEl) statusEl.textContent = `Executing ${action}...`;
          try {
            const res = await triggerAppAction(name, action as 'start' | 'stop' | 'restart');
            if (statusEl) statusEl.textContent = res.success ? `✅ ${res.message}` : `❌ ${res.error}`;
          } catch (err) {
            if (statusEl) statusEl.textContent = `❌ ${String(err)}`;
          }
          setTimeout(() => load(), 1500);
        });
      });
    } catch (err) {
      grid.innerHTML = errorStateHtml(`Failed to load apps: ${String(err)}`, 'apps-load');
      grid.querySelector('.gb-retry-btn')?.addEventListener('click', () => load());
    }
  }

  refreshBtn.addEventListener('click', () => load());
  await load();
}

function appCard(a: CuratedApp): string {
  const running = a.running;
  const statusClass = running ? 'status-green' : 'status-gray';
  const statusText = running ? 'RUNNING' : a.state.toUpperCase();
  return `
    <div class="app-card">
      <div class="app-card-header">
        <span class="app-icon">${esc(a.icon)}</span>
        <div>
          <div class="app-title">${esc(a.title)}</div>
          <div class="muted" style="font-size:.8rem;">${esc(a.description)}</div>
        </div>
        <span class="status-dot ${statusClass}" style="margin-left:auto;"></span>
        <span class="c-state-tag">${esc(statusText)}</span>
      </div>
      <div class="app-card-meta">
        <span>Container: ${esc(a.container)}</span>
        ${a.url ? `<span>URL: <a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url)}</a></span>` : ''}
      </div>
      <div class="app-card-actions">
        <button class="btn btn-sm" data-app="${esc(a.name)}" data-app-action="start" ${running ? 'disabled' : ''}>▶️ Start</button>
        <button class="btn btn-sm" data-app="${esc(a.name)}" data-app-action="stop" ${!running ? 'disabled' : ''}>⏹️ Stop</button>
        <button class="btn btn-sm" data-app="${esc(a.name)}" data-app-action="restart">🔄 Restart</button>
        ${a.url ? `<a class="btn btn-sm" href="${esc(a.url)}" target="_blank" rel="noopener">🔗 Open</a>` : ''}
        <span id="appStatus-${esc(a.name)}" style="font-size:.8rem;margin-left:8px;"></span>
      </div>
    </div>
  `;
}
