import { fetchApps, triggerAppAction } from '../lib/api';
import { esc } from '../lib/format';
import { confirmDialog } from '../lib/ui';
import type { CuratedApp } from '../lib/api';

export async function renderApps(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <header class="page-header">
      <div>
        <h1>🚀 Apps</h1>
        <p class="muted" style="font-size:.88rem;margin-top:4px;">
          Curated services that do not auto-start on boot. Start, stop, or open them with one click.
        </p>
      </div>
      <div class="header-actions">
        <button id="refreshAppsBtn" class="btn">🔄 Refresh</button>
      </div>
    </header>
    <div id="appsGrid" class="apps-grid">
      <div class="empty-state"><p>Loading apps...</p></div>
    </div>
  `;

  const grid = container.querySelector('#appsGrid') as HTMLElement;
  const refreshBtn = container.querySelector('#refreshAppsBtn') as HTMLButtonElement;

  async function load(): Promise<void> {
    try {
      const data = await fetchApps();
      const apps = data.apps || [];
      if (apps.length === 0) {
        grid.innerHTML = '<div class="empty-state"><p>No curated apps.</p></div>';
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
      grid.innerHTML = `<div class="empty-state"><p>Failed to load apps: ${esc(String(err))}</p></div>`;
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
