/**
 * Dozzel-style Container & Live Log Viewer Dashboard.
 * Fleet container management, real-time log streaming with ANSI color rendering,
 * instant log search & level filters, auto-scroll locking, download & copy.
 */

import { fetchContainers, fetchContainerLogs, triggerContainerAction } from '../lib/api';
import { ansiToHtml, formatLogLevelBadge } from '../lib/ansi';
import { esc } from '../lib/format';
import type { ContainerSummary, LogLine } from '../lib/api';

export async function renderContainers(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <header class="page-header">
      <div>
        <div style="display:flex;align-items:center;gap:10px;">
          <h1>🐳 Container & Log Console</h1>
          <span class="pill pill-live" id="fleetPill">Connecting...</span>
        </div>
        <p class="muted" style="font-size:.88rem;margin-top:4px;">
          Dozzel-style container inspection: Real-time ANSI log tailing, container fleet controls, search filtering, and auto-scroll
        </p>
      </div>
      <div class="header-actions">
        <button id="refreshFleetBtn" class="btn"><span id="fleetRefreshIcon">🔄</span> Refresh Fleet</button>
      </div>
    </header>

    <div class="dozzel-layout">
      <!-- Left Sidebar: Container Fleet -->
      <aside class="dozzel-sidebar">
        <div class="sidebar-search">
          <input type="text" id="containerSearchInput" placeholder="🔍 Filter containers..." class="input-text" />
        </div>
        <div class="sidebar-filters">
          <button class="filter-chip active" data-filter="all">All</button>
          <button class="filter-chip" data-filter="running">Running</button>
          <button class="filter-chip" data-filter="stopped">Stopped</button>
        </div>
        <div class="containers-list" id="containersList">
          <div class="empty-state"><p>Loading containers...</p></div>
        </div>
      </aside>

      <!-- Right Main: Live Log Console -->
      <section class="dozzel-main">
        <!-- Log Viewer Header Bar -->
        <div class="log-toolbar">
          <div class="log-target-info">
            <span class="status-dot status-green" id="activeDot"></span>
            <div>
              <div class="log-target-name" id="activeContainerName">Select a container</div>
              <div class="log-target-meta" id="activeContainerMeta">-</div>
            </div>
          </div>
          <div class="log-controls">
            <!-- Filter search input -->
            <input type="text" id="logFilterInput" placeholder="🔍 Filter logs..." class="input-text input-sm" />

            <!-- Level buttons -->
            <div class="level-btn-group">
              <button class="level-btn active" data-level="all">All</button>
              <button class="level-btn" data-level="error">Error</button>
              <button class="level-btn" data-level="warn">Warn</button>
              <button class="level-btn" data-level="info">Info</button>
            </div>

            <!-- Toggles & Actions -->
            <button id="autoScrollBtn" class="btn btn-sm btn-active" title="Toggle Auto-Scroll">⬇️ Auto-scroll</button>
            <button id="timestampBtn" class="btn btn-sm" title="Toggle Timestamps">⏱️ Timestamps</button>
            <button id="copyLogsBtn" class="btn btn-sm" title="Copy visible logs">📋 Copy</button>
            <button id="downloadLogsBtn" class="btn btn-sm" title="Download .log file">💾 Download</button>
            <button id="clearLogsBtn" class="btn btn-sm" title="Clear console view">🧹 Clear</button>
          </div>
        </div>

        <!-- Container Actions Banner -->
        <div class="container-action-banner" id="actionBanner" style="display:none;">
          <div style="font-size:0.85rem;color:var(--text-muted);">
            Manage <strong><span id="bannerCName"></span></strong>:
          </div>
          <div class="action-buttons">
            <button class="btn btn-sm" id="restartBtn">🔄 Restart</button>
            <button class="btn btn-sm" id="stopBtn">⏹️ Stop</button>
            <button class="btn btn-sm" id="startBtn">▶️ Start</button>
            <span id="actionStatus" style="font-size:0.8rem;margin-left:8px;"></span>
          </div>
        </div>

        <!-- Monospace Log Screen -->
        <div class="log-console-container" id="logConsoleContainer">
          <div class="log-console-scroll" id="logConsoleScroll">
            <div class="log-empty-msg" id="logEmptyMsg">Select a container from the left to view live streaming logs.</div>
            <div class="log-lines-output" id="logLinesOutput"></div>
          </div>
        </div>
      </section>
    </div>
  `;

  // UI References
  const fleetPill = container.querySelector('#fleetPill') as HTMLElement;
  const refreshFleetBtn = container.querySelector('#refreshFleetBtn') as HTMLButtonElement;
  const fleetRefreshIcon = container.querySelector('#fleetRefreshIcon') as HTMLElement;
  const containersList = container.querySelector('#containersList') as HTMLElement;
  const containerSearchInput = container.querySelector('#containerSearchInput') as HTMLInputElement;

  const activeDot = container.querySelector('#activeDot') as HTMLElement;
  const activeContainerName = container.querySelector('#activeContainerName') as HTMLElement;
  const activeContainerMeta = container.querySelector('#activeContainerMeta') as HTMLElement;
  const logFilterInput = container.querySelector('#logFilterInput') as HTMLInputElement;
  const autoScrollBtn = container.querySelector('#autoScrollBtn') as HTMLButtonElement;
  const timestampBtn = container.querySelector('#timestampBtn') as HTMLButtonElement;
  const copyLogsBtn = container.querySelector('#copyLogsBtn') as HTMLButtonElement;
  const downloadLogsBtn = container.querySelector('#downloadLogsBtn') as HTMLButtonElement;
  const clearLogsBtn = container.querySelector('#clearLogsBtn') as HTMLButtonElement;

  const actionBanner = container.querySelector('#actionBanner') as HTMLElement;
  const bannerCName = container.querySelector('#bannerCName') as HTMLElement;
  const restartBtn = container.querySelector('#restartBtn') as HTMLButtonElement;
  const stopBtn = container.querySelector('#stopBtn') as HTMLButtonElement;
  const startBtn = container.querySelector('#startBtn') as HTMLButtonElement;
  const actionStatus = container.querySelector('#actionStatus') as HTMLElement;

  const logConsoleScroll = container.querySelector('#logConsoleScroll') as HTMLElement;
  const logEmptyMsg = container.querySelector('#logEmptyMsg') as HTMLElement;
  const logLinesOutput = container.querySelector('#logLinesOutput') as HTMLElement;

  // State
  let containers: ContainerSummary[] = [];
  let selectedContainer: ContainerSummary | null = null;
  let activeFilter = 'all'; // all, running, stopped
  let activeLogLevel = 'all'; // all, error, warn, info
  let autoScroll = true;
  let showTimestamps = true;
  let currentLogs: LogLine[] = [];
  let logTimerId: number | null = null;
  let fleetTimerId: number | null = null;

  function renderContainersList(): void {
    const query = (containerSearchInput.value || '').trim().toLowerCase();
    const filtered = containers.filter((c) => {
      if (activeFilter === 'running' && c.state !== 'running') return false;
      if (activeFilter === 'stopped' && c.state === 'running') return false;
      if (query && !c.name.toLowerCase().includes(query) && !c.image.toLowerCase().includes(query)) return false;
      return true;
    });

    if (filtered.length === 0) {
      containersList.innerHTML = '<div class="empty-state" style="padding:24px 10px;"><p>No matching containers</p></div>';
      return;
    }

    containersList.innerHTML = filtered
      .map((c) => {
        const isSelected = selectedContainer && selectedContainer.id === c.id;
        const isRunning = c.state === 'running';
        return `
          <div class="c-list-item ${isSelected ? 'selected' : ''}" data-cid="${esc(c.id)}">
            <div class="c-item-top">
              <span class="status-dot ${isRunning ? 'status-green' : 'status-gray'}"></span>
              <span class="c-name" title="${esc(c.name)}">${esc(c.name)}</span>
              <span class="c-state-tag">${isRunning ? 'RUNNING' : 'STOPPED'}</span>
            </div>
            <div class="c-item-image" title="${esc(c.image)}">${esc(c.image)}</div>
            <div class="c-item-metrics">
              <span class="c-pill">CPU ${c.cpu_percent}%</span>
              <span class="c-pill">RAM ${esc(c.mem_usage.split('/')[0] || c.mem_usage)}</span>
            </div>
          </div>
        `;
      })
      .join('');

    // Attach click events
    containersList.querySelectorAll('.c-list-item').forEach((item) => {
      item.addEventListener('click', () => {
        const cid = (item as HTMLElement).dataset.cid;
        const found = containers.find((c) => c.id === cid);
        if (found) {
          selectContainer(found);
        }
      });
    });
  }

  function selectContainer(c: ContainerSummary): void {
    selectedContainer = c;
    renderContainersList();

    activeContainerName.textContent = c.name;
    activeContainerMeta.textContent = `${c.image} • ${c.status} • CPU: ${c.cpu_percent}%`;
    activeDot.className = `status-dot ${c.state === 'running' ? 'status-green' : 'status-gray'}`;

    bannerCName.textContent = c.name;
    actionBanner.style.display = 'flex';
    actionStatus.textContent = '';

    logEmptyMsg.style.display = 'none';
    logLinesOutput.innerHTML = '<div class="log-loading">Fetching logs for ' + esc(c.name) + '...</div>';

    fetchAndRenderLogs();

    if (window.innerWidth <= 768) {
      setTimeout(() => {
        const consoleEl = container.querySelector('#logConsoleContainer');
        if (consoleEl) {
          consoleEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }
  }

  function renderLogOutput(): void {
    if (!selectedContainer) return;
    const filterQuery = (logFilterInput.value || '').trim().toLowerCase();

    const filtered = currentLogs.filter((l) => {
      if (activeLogLevel !== 'all') {
        const norm = l.level.toLowerCase();
        if (activeLogLevel === 'error' && !norm.includes('err') && !norm.includes('fatal')) return false;
        if (activeLogLevel === 'warn' && !norm.includes('warn')) return false;
        if (activeLogLevel === 'info' && !norm.includes('info')) return false;
      }
      if (filterQuery && !l.message.toLowerCase().includes(filterQuery)) return false;
      return true;
    });

    if (filtered.length === 0) {
      logLinesOutput.innerHTML = '<div class="log-no-match">No logs match the current filter.</div>';
      return;
    }

    logLinesOutput.innerHTML = filtered
      .map((l) => {
        const tsHtml = showTimestamps && l.timestamp ? `<span class="log-ts">${esc(l.timestamp)}</span>` : '';
        const badgeHtml = formatLogLevelBadge(l.level);
        const msgHtml = ansiToHtml(l.message);
        return `
          <div class="log-row">
            ${tsHtml}
            ${badgeHtml}
            <span class="log-msg">${msgHtml}</span>
          </div>
        `;
      })
      .join('');

    if (autoScroll) {
      logConsoleScroll.scrollTop = logConsoleScroll.scrollHeight;
    }
  }

  async function fetchAndRenderLogs(): Promise<void> {
    if (!selectedContainer) return;
    try {
      const resp = await fetchContainerLogs(selectedContainer.name || selectedContainer.id, 150, true);
      currentLogs = resp.lines || [];
      renderLogOutput();
    } catch (err) {
      logLinesOutput.innerHTML = `<div class="log-error-msg">Failed to load logs: ${esc(String(err))}</div>`;
    }
  }

  async function loadFleet(): Promise<void> {
    fleetRefreshIcon.classList.add('spin');
    try {
      const data = await fetchContainers();
      containers = data.containers || [];
      fleetPill.textContent = `${containers.length} Containers`;
      fleetPill.className = 'pill pill-live';
      renderContainersList();

      // If no container selected yet, pick the first one
      if (!selectedContainer && containers.length > 0) {
        selectContainer(containers[0]);
      } else if (selectedContainer) {
        // Update selected metadata
        const updated = containers.find((c) => c.id === selectedContainer?.id);
        if (updated) {
          selectedContainer = updated;
          activeContainerMeta.textContent = `${updated.image} • ${updated.status} • CPU: ${updated.cpu_percent}%`;
        }
      }
    } catch (err) {
      fleetPill.textContent = 'Fleet Offline';
      fleetPill.className = 'pill';
      console.error(err);
    } finally {
      fleetRefreshIcon.classList.remove('spin');
    }
  }

  // Filter click handlers
  container.querySelectorAll('.sidebar-filters .filter-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      container.querySelectorAll('.sidebar-filters .filter-chip').forEach((c) => c.classList.remove('active'));
      (e.currentTarget as HTMLElement).classList.add('active');
      activeFilter = (e.currentTarget as HTMLElement).dataset.filter || 'all';
      renderContainersList();
    });
  });

  containerSearchInput.addEventListener('input', () => renderContainersList());

  // Log filter events
  logFilterInput.addEventListener('input', () => renderLogOutput());

  container.querySelectorAll('.level-btn-group .level-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      container.querySelectorAll('.level-btn-group .level-btn').forEach((b) => b.classList.remove('active'));
      (e.currentTarget as HTMLElement).classList.add('active');
      activeLogLevel = (e.currentTarget as HTMLElement).dataset.level || 'all';
      renderLogOutput();
    });
  });

  autoScrollBtn.addEventListener('click', () => {
    autoScroll = !autoScroll;
    autoScrollBtn.classList.toggle('btn-active', autoScroll);
    if (autoScroll) {
      logConsoleScroll.scrollTop = logConsoleScroll.scrollHeight;
    }
  });

  timestampBtn.addEventListener('click', () => {
    showTimestamps = !showTimestamps;
    timestampBtn.classList.toggle('btn-active', showTimestamps);
    renderLogOutput();
  });

  clearLogsBtn.addEventListener('click', () => {
    currentLogs = [];
    renderLogOutput();
  });

  copyLogsBtn.addEventListener('click', async () => {
    const text = currentLogs.map((l) => `${l.timestamp ? l.timestamp + ' ' : ''}[${l.level.toUpperCase()}] ${l.message}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      copyLogsBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyLogsBtn.textContent = '📋 Copy'; }, 2000);
    } catch {
      copyLogsBtn.textContent = '❌ Error';
      setTimeout(() => { copyLogsBtn.textContent = '📋 Copy'; }, 2000);
    }
  });

  downloadLogsBtn.addEventListener('click', () => {
    if (!selectedContainer) return;
    const text = currentLogs.map((l) => `${l.timestamp ? l.timestamp + ' ' : ''}[${l.level.toUpperCase()}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedContainer.name || selectedContainer.id}-logs.log`;
    a.click();
    URL.revokeObjectURL(url);
  });

  refreshFleetBtn.addEventListener('click', () => loadFleet());

  // Container action buttons
  async function handleAction(action: string): Promise<void> {
    if (!selectedContainer) return;
    actionStatus.textContent = `Executing ${action}...`;
    try {
      const res = await triggerContainerAction(selectedContainer.name || selectedContainer.id, action);
      if (res.success) {
        actionStatus.textContent = `✅ ${res.message || 'Done'}`;
        await loadFleet();
      } else {
        actionStatus.textContent = `❌ ${res.error || 'Failed'}`;
      }
    } catch (err) {
      actionStatus.textContent = `❌ Error: ${String(err)}`;
    }
    setTimeout(() => { actionStatus.textContent = ''; }, 3000);
  }

  restartBtn.addEventListener('click', () => handleAction('restart'));
  stopBtn.addEventListener('click', () => handleAction('stop'));
  startBtn.addEventListener('click', () => handleAction('start'));

  // Start polling
  await loadFleet();

  // Log stream polling every 2s
  logTimerId = window.setInterval(() => {
    if (selectedContainer) {
      fetchAndRenderLogs();
    }
  }, 2000);

  // Fleet refresh polling every 6s
  fleetTimerId = window.setInterval(loadFleet, 6000);

  // Cleanup on route departure
  window.addEventListener(
    'hashchange',
    () => {
      if (logTimerId) clearInterval(logTimerId);
      if (fleetTimerId) clearInterval(fleetTimerId);
    },
    { once: true }
  );
}
