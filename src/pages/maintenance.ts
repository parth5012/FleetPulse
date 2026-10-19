/**
 * One-Tap Remote Maintenance: Docker Garbage Collection, Journal Vacuum, & Core Daemon Restart Shortcuts.
 */

import {
  fetchMaintenanceDf,
  triggerDockerPrune,
  triggerJournalVacuum,
  triggerServiceRestartShortcut,
  fetchServices,
} from '../lib/api';
import type { MaintenanceDfResponse, DockerDfItem, ServicesResponse } from '../lib/api';
import { esc, formatBytes } from '../lib/format';

export async function renderMaintenance(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <header class="page-header">
      <div>
        <div style="display:flex;align-items:center;gap:10px;">
          <h1>🛠️ Remote Maintenance & Actions</h1>
          <span class="pill pill-live"><span class="pulse-dot"></span> ADMIN CONSOLE</span>
        </div>
        <p class="muted" style="font-size:.88rem;margin-top:4px;">
          Safe, bounded one-tap operational controls: Docker garbage collection, journal vacuuming, and core daemon restarts
        </p>
      </div>
      <div class="header-actions">
        <button id="refreshMaintBtn" class="btn btn-primary"><span id="refreshMaintIcon">🔄</span> Refresh Status</button>
      </div>
    </header>

    <!-- Feedback Banner -->
    <div id="maintAlert" class="maint-alert" style="display:none;"></div>

    <div class="maintenance-grid">
      <!-- Card 1: Docker Garbage Collection -->
      <div class="maint-card">
        <div class="maint-card-head">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="maint-icon">🐳</span>
            <div>
              <h3>Docker Garbage Collection</h3>
              <p class="muted">Prune dangling images, stopped containers, and build cache</p>
            </div>
          </div>
          <span class="badge badge-info" id="dockerTotalSize">-</span>
        </div>

        <div class="maint-card-body">
          <div class="docker-df-summary" id="dockerDfGrid">
            <div class="loading-state" style="padding:16px;"><div class="spin">⚡</div></div>
          </div>
        </div>

        <div class="maint-card-foot">
          <button id="pruneDockerBtn" class="btn btn-primary" style="width:100%;justify-content:center;">
            🧹 Prune Dangling Docker Objects
          </button>
        </div>
      </div>

      <!-- Card 2: System Journal Vacuum -->
      <div class="maint-card">
        <div class="maint-card-head">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="maint-icon">🧹</span>
            <div>
              <h3>System Journal Vacuum</h3>
              <p class="muted">Purge archived journalctl log chunks to recover storage</p>
            </div>
          </div>
          <span class="badge badge-info" id="diskFreeBadge">-</span>
        </div>

        <div class="maint-card-body">
          <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:6px;">
            <span>Host Root Partition Usage</span>
            <strong id="diskUsageTxt">0%</strong>
          </div>
          <div class="bar-outer" style="height:8px;margin-bottom:16px;">
            <div class="bar-inner bar-ok" id="diskBar" style="width:0%;"></div>
          </div>

          <div style="display:flex;gap:8px;align-items:center;">
            <label style="font-size:0.8rem;color:var(--text-muted);flex-shrink:0;">Retention Window:</label>
            <select id="vacuumTimeSelect" class="input-sm select-styled" style="flex:1;">
              <option value="3d">Keep Last 3 Days</option>
              <option value="7d">Keep Last 7 Days</option>
              <option value="14d">Keep Last 14 Days</option>
            </select>
          </div>
        </div>

        <div class="maint-card-foot">
          <button id="vacuumJournalBtn" class="btn btn-primary" style="width:100%;justify-content:center;">
            🗑️ Vacuum Journal Logs
          </button>
        </div>
      </div>
    </div>

    <!-- Card 3: Core Daemon Restart Shortcuts -->
    <div class="services-shortcuts-section">
      <div class="section-title">
        <span>⚡ Core Daemon Restart Shortcuts</span>
        <span class="badge badge-info">Whitelisted Units</span>
      </div>
      <p class="muted" style="font-size:0.82rem;margin-bottom:16px;">
        Restart bounded services without full SSH terminal access. Only authorized core agents and daemons can be managed.
      </p>

      <div class="daemon-shortcuts-grid" id="daemonGrid">
        <div class="loading-state" style="padding:20px;"><div class="spin">⚡</div></div>
      </div>
    </div>
  `;

  const alertBox = container.querySelector('#maintAlert') as HTMLElement;

  function showAlert(msg: string, isError = false): void {
    alertBox.style.display = 'block';
    alertBox.className = `maint-alert ${isError ? 'alert-error' : 'alert-success'}`;
    alertBox.innerHTML = `<span>${isError ? '⚠️' : '✅'}</span> <div>${esc(msg)}</div>`;
    setTimeout(() => {
      alertBox.style.display = 'none';
    }, 6000);
  }

  async function loadDf(): Promise<void> {
    const dfGrid = container.querySelector('#dockerDfGrid') as HTMLElement;
    const diskBadge = container.querySelector('#diskFreeBadge') as HTMLElement;
    const diskTxt = container.querySelector('#diskUsageTxt') as HTMLElement;
    const diskBar = container.querySelector('#diskBar') as HTMLElement;
    const dockerSizeBadge = container.querySelector('#dockerTotalSize') as HTMLElement;

    try {
      const data: MaintenanceDfResponse = await fetchMaintenanceDf();

      // Disk Root
      const root = data.disk_root;
      diskBadge.textContent = `${formatBytes(root.free_bytes)} Free`;
      diskTxt.textContent = `${root.used_percent}% (${formatBytes(root.used_bytes)} / ${formatBytes(root.total_bytes)})`;
      diskBar.style.width = `${Math.min(100, root.used_percent)}%`;

      // Docker items
      const docker = data.docker || [];
      if (docker.length === 0) {
        dfGrid.innerHTML = `<div class="empty-state" style="padding:12px;"><p>No docker storage statistics reported.</p></div>`;
        dockerSizeBadge.textContent = '0B';
      } else {
        const totalReclaimable = docker.map((d: DockerDfItem) => d.reclaimable).join(' · ');
        dockerSizeBadge.textContent = `Reclaimable: ${totalReclaimable}`;

        dfGrid.innerHTML = docker.map((d: DockerDfItem) => `
          <div class="df-tile">
            <div class="df-tile-title">${esc(d.type)} (${esc(d.active)}/${esc(d.total)})</div>
            <div class="df-tile-size">${esc(d.size)}</div>
            <div class="df-tile-reclaim">Reclaimable: <strong style="color:#10b981;">${esc(d.reclaimable)}</strong></div>
          </div>
        `).join('');
      }
    } catch (err) {
      dfGrid.innerHTML = `<div class="empty-state" style="padding:12px;"><p>Failed to query disk status: ${String(err)}</p></div>`;
    }
  }

  const CORE_SERVICES = [
    { unit: 'omniroute.service', name: 'OmniRoute LLM Gateway', desc: 'LLM proxy, provider pooling & quota manager', icon: '🔮' },
    { unit: 'dashboard-service.service', name: 'Dashboard Service', desc: 'Host telemetry, btop task manager & PWA', icon: '⚡' },
    { unit: 'hermes-gateway.service', name: 'Hermes Agent Gateway', desc: 'Multi-platform agent messaging router', icon: '📨' },
    { unit: 'kanban-sync.service', name: 'Obsidian Kanban Sync', desc: 'Task list auto-synchronizer daemon', icon: '📋' },
    { unit: 't3.service', name: 'T3 Headless Server', desc: 'T3 Code headless web backend', icon: '💻' },
    { unit: 'element-web.service', name: 'Element Web Client', desc: 'Matrix communication web app', icon: '💬' },
    { unit: 'pr-agent.service', name: 'PR-Agent Webhook', desc: 'GitHub App pull request review agent', icon: '🤖' },
  ];

  async function loadDaemons(): Promise<void> {
    const grid = container.querySelector('#daemonGrid') as HTMLElement;
    try {
      // Query running statuses
      const res: ServicesResponse = await fetchServices('user', 'all', 'cpu', 'desc', 100);
      const activeMap = new Map<string, string>();
      for (const s of (res.services || [])) {
        activeMap.set(s.unit, s.active_state);
      }

      grid.innerHTML = CORE_SERVICES.map((s) => {
        const state = activeMap.get(s.unit) || 'unknown';
        const isRunning = state === 'active';

        return `
          <div class="daemon-card">
            <div class="d-head">
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:1.4rem;">${s.icon}</span>
                <div>
                  <strong>${esc(s.name)}</strong>
                  <div class="muted" style="font-size:0.75rem;"><code>${esc(s.unit)}</code></div>
                </div>
              </div>
              <span class="badge ${isRunning ? 'badge-success' : 'badge-error'}">${isRunning ? 'RUNNING' : esc(state.toUpperCase())}</span>
            </div>
            <p class="d-desc">${esc(s.desc)}</p>
            <div class="d-actions">
              <button class="btn btn-sm btn-restart-daemon" data-unit="${esc(s.unit)}">
                <span>🔄</span> Restart
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Wire restart triggers
      grid.querySelectorAll('.btn-restart-daemon').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const unit = (btn as HTMLElement).getAttribute('data-unit') || '';
          if (!confirm(`Are you sure you want to restart ${unit}?`)) return;

          btn.innerHTML = `<span class="spin">🔄</span> Restarting...`;
          (btn as HTMLButtonElement).disabled = true;

          try {
            const resp = await triggerServiceRestartShortcut(unit);
            showAlert(resp.message);
            await loadDaemons();
          } catch (err: any) {
            showAlert(err.message || `Failed to restart ${unit}`, true);
          } finally {
            btn.innerHTML = `<span>🔄</span> Restart`;
            (btn as HTMLButtonElement).disabled = false;
          }
        });
      });
    } catch (err) {
      grid.innerHTML = `<div class="empty-state" style="padding:16px;"><p>Failed to query daemon statuses: ${String(err)}</p></div>`;
    }
  }

  // Docker Prune action
  const pruneBtn = container.querySelector('#pruneDockerBtn') as HTMLButtonElement;
  pruneBtn.addEventListener('click', async () => {
    if (!confirm('Run docker system prune -f to reclaim dangling images and stopped containers?')) return;

    pruneBtn.disabled = true;
    pruneBtn.innerHTML = `<span class="spin">⚡</span> Pruning Docker...`;

    try {
      const resp = await triggerDockerPrune();
      showAlert(`Docker Prune completed: Reclaimed ${resp.reclaimed_space}`);
      await loadDf();
    } catch (err: any) {
      showAlert(err.message || 'Docker prune failed', true);
    } finally {
      pruneBtn.disabled = false;
      pruneBtn.innerHTML = `🧹 Prune Dangling Docker Objects`;
    }
  });

  // Journal Vacuum action
  const vacuumBtn = container.querySelector('#vacuumJournalBtn') as HTMLButtonElement;
  const vacuumSelect = container.querySelector('#vacuumTimeSelect') as HTMLSelectElement;
  vacuumBtn.addEventListener('click', async () => {
    const timeVal = vacuumSelect.value;
    vacuumBtn.disabled = true;
    vacuumBtn.innerHTML = `<span class="spin">⚡</span> Vacuuming...`;

    try {
      const resp = await triggerJournalVacuum(timeVal);
      showAlert(`Journal Vacuum (${timeVal}): ${resp.output || 'Complete'}`);
      await loadDf();
    } catch (err: any) {
      showAlert(err.message || 'Journal vacuum failed', true);
    } finally {
      vacuumBtn.disabled = false;
      vacuumBtn.innerHTML = `🗑️ Vacuum Journal Logs`;
    }
  });

  // Refresh
  const refreshBtn = container.querySelector('#refreshMaintBtn') as HTMLButtonElement;
  const refreshIcon = container.querySelector('#refreshMaintIcon') as HTMLElement;
  refreshBtn.addEventListener('click', async () => {
    refreshIcon.classList.add('spin');
    await loadDf();
    await loadDaemons();
    setTimeout(() => refreshIcon.classList.remove('spin'), 400);
  });

  // Initial load
  await loadDf();
  await loadDaemons();
}
