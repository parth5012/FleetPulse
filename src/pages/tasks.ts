/**
 * Real-time Task Manager & Process Monitor (btop / Task Manager style).
 * Supports sorting by CPU, RAM, PID, Name, Threads, search filtering,
 * automatic refresh interval, and process termination.
 */

import { fetchTasks, triggerTaskAction, TaskItem, TasksOverview } from '../lib/api';
import { esc } from '../lib/format';

interface TasksState {
  sortBy: string;
  order: 'asc' | 'desc';
  limit: number;
  search: string;
  refreshInterval: number; // in ms, 0 = paused
  timerId: number | null;
  expandedPid: number | null;
  tasks: TaskItem[];
  overview: TasksOverview | null;
  loading: boolean;
  error: string | null;
}

let state: TasksState = {
  sortBy: 'cpu',
  order: 'desc',
  limit: 100,
  search: '',
  refreshInterval: 2000,
  timerId: null,
  expandedPid: null,
  tasks: [],
  overview: null,
  loading: true,
  error: null,
};

export function cleanupTasks(): void {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

export async function renderTasks(container: HTMLElement): Promise<void> {
  cleanupTasks();

  container.innerHTML = `
    <div class="tasks-page">
      <!-- Page Header & Quick Vitals -->
      <div class="page-header">
        <div class="header-titles">
          <div class="page-badge">⚡ REAL-TIME PROCESS MONITOR</div>
          <h1 class="page-title">Tasks & System Processes</h1>
          <p class="page-subtitle">btop & Task Manager telemetry with live CPU, memory sorting, and control.</p>
        </div>
        <div class="header-actions">
          <button id="tasksRefreshBtn" class="btn btn-secondary btn-sm" title="Manual refresh">
            🔄 Refresh
          </button>
        </div>
      </div>

      <!-- Quick Vitals Ribbon -->
      <div class="vitals-ribbon" id="tasksVitals">
        <div class="vital-card">
          <div class="vital-label">CPU LOAD</div>
          <div class="vital-value" id="vitalCpu">--%</div>
          <div class="vital-bar-track">
            <div class="vital-bar-fill vital-cpu" id="vitalCpuBar" style="width: 0%"></div>
          </div>
        </div>
        <div class="vital-card">
          <div class="vital-label">RAM USED</div>
          <div class="vital-value" id="vitalRam">--%</div>
          <div class="vital-bar-track">
            <div class="vital-bar-fill vital-ram" id="vitalRamBar" style="width: 0%"></div>
          </div>
        </div>
        <div class="vital-card">
          <div class="vital-label">PROCESSES</div>
          <div class="vital-value" id="vitalProcs">--</div>
          <div class="vital-sub" id="vitalProcSub">Running: -- | Sleeping: --</div>
        </div>
        <div class="vital-card">
          <div class="vital-label">THREADS</div>
          <div class="vital-value" id="vitalThreads">--</div>
          <div class="vital-sub">Active kernel threads</div>
        </div>
      </div>

      <!-- Toolbar / Sticky Filter & Sorting Bar -->
      <div class="tasks-toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input
            type="search"
            id="taskSearchInput"
            class="input-search"
            placeholder="Filter by name, PID, user, cmdline..."
            value="${esc(state.search)}"
          />
          <button id="taskSearchClear" class="btn-clear ${state.search ? 'visible' : ''}">✕</button>
        </div>

        <div class="toolbar-controls">
          <!-- Sort Field -->
          <div class="control-group">
            <label class="control-label">Sort By:</label>
            <div class="btn-group">
              <button class="btn-chip ${state.sortBy === 'cpu' ? 'active' : ''}" data-sort="cpu">CPU %</button>
              <button class="btn-chip ${state.sortBy === 'memory' ? 'active' : ''}" data-sort="memory">RAM</button>
              <button class="btn-chip ${state.sortBy === 'pid' ? 'active' : ''}" data-sort="pid">PID</button>
              <button class="btn-chip ${state.sortBy === 'name' ? 'active' : ''}" data-sort="name">Name</button>
            </div>
          </div>

          <!-- Order Toggle -->
          <button id="taskOrderToggle" class="btn btn-secondary btn-sm" title="Toggle sort order">
            ${state.order === 'desc' ? '▼ Desc' : '▲ Asc'}
          </button>

          <!-- Refresh Rate -->
          <div class="control-group refresh-group">
            <label class="control-label">Interval:</label>
            <select id="taskRefreshSelect" class="select-sm">
              <option value="1000" ${state.refreshInterval === 1000 ? 'selected' : ''}>1s</option>
              <option value="2000" ${state.refreshInterval === 2000 ? 'selected' : ''}>2s</option>
              <option value="5000" ${state.refreshInterval === 5000 ? 'selected' : ''}>5s</option>
              <option value="0" ${state.refreshInterval === 0 ? 'selected' : ''}>Paused</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Process Table & Cards Container -->
      <div class="tasks-view-container" id="tasksViewContainer">
        <div class="loading-state">
          <div class="spin">⚡</div>
          <p>Polling active processes...</p>
        </div>
      </div>
    </div>
  `;

  attachEventListeners(container);
  await loadTasks(container);
  setupAutoRefresh(container);
}

function setupAutoRefresh(container: HTMLElement): void {
  cleanupTasks();
  if (state.refreshInterval > 0) {
    state.timerId = window.setInterval(() => {
      loadTasks(container, false);
    }, state.refreshInterval);
  }
}

async function loadTasks(container: HTMLElement, showLoading = true): Promise<void> {
  const view = container.querySelector('#tasksViewContainer');
  if (!view) return;

  if (showLoading && state.tasks.length === 0) {
    view.innerHTML = `
      <div class="loading-state">
        <div class="spin">⚡</div>
        <p>Polling active processes...</p>
      </div>
    `;
  }

  try {
    const res = await fetchTasks(state.sortBy, state.order, state.limit, state.search);
    state.tasks = res.tasks;
    state.overview = res.overview;
    state.error = null;
    renderVitals(container);
    renderProcessList(view);
  } catch (err) {
    state.error = String(err);
    if (state.tasks.length === 0) {
      view.innerHTML = `
        <div class="error-banner">
          <span class="error-icon">⚠️</span>
          <div class="error-text">
            <strong>Failed to poll processes:</strong> ${esc(state.error)}
          </div>
          <button id="taskRetryBtn" class="btn btn-secondary btn-sm">Retry</button>
        </div>
      `;
      container.querySelector('#taskRetryBtn')?.addEventListener('click', () => loadTasks(container));
    }
  }
}

function renderVitals(container: HTMLElement): void {
  if (!state.overview) return;
  const ov = state.overview;

  const cpuEl = container.querySelector('#vitalCpu');
  const cpuBar = container.querySelector('#vitalCpuBar') as HTMLElement;
  const ramEl = container.querySelector('#vitalRam');
  const ramBar = container.querySelector('#vitalRamBar') as HTMLElement;
  const procsEl = container.querySelector('#vitalProcs');
  const procSubEl = container.querySelector('#vitalProcSub');
  const threadsEl = container.querySelector('#vitalThreads');

  if (cpuEl) cpuEl.textContent = `${ov.cpu_total_percent.toFixed(1)}%`;
  if (cpuBar) cpuBar.style.width = `${Math.min(ov.cpu_total_percent, 100)}%`;

  if (ramEl) ramEl.textContent = `${ov.memory_used_percent.toFixed(1)}%`;
  if (ramBar) ramBar.style.width = `${Math.min(ov.memory_used_percent, 100)}%`;

  if (procsEl) procsEl.textContent = String(ov.total_processes);
  if (procSubEl) procSubEl.textContent = `Running: ${ov.running} | Sleeping: ${ov.sleeping}`;
  if (threadsEl) threadsEl.textContent = String(ov.total_threads);
}

function getCpuColorClass(pct: number): string {
  if (pct > 50) return 'text-danger';
  if (pct > 15) return 'text-warning';
  if (pct > 2) return 'text-primary';
  return 'text-muted';
}

function getMemColorClass(pct: number): string {
  if (pct > 30) return 'text-danger';
  if (pct > 10) return 'text-warning';
  return 'text-primary';
}

function renderProcessList(view: Element): void {
  if (state.tasks.length === 0) {
    view.innerHTML = `
      <div class="empty-state">
        <p>No processes found matching "<strong>${esc(state.search)}</strong>"</p>
        <button id="clearSearchBtn" class="btn btn-secondary btn-sm" style="margin-top: 12px">Clear filter</button>
      </div>
    `;
    view.querySelector('#clearSearchBtn')?.addEventListener('click', () => {
      state.search = '';
      const input = document.querySelector('#taskSearchInput') as HTMLInputElement;
      if (input) input.value = '';
      loadTasks(view.parentElement!);
    });
    return;
  }

  const sortIcon = (col: string) => {
    if (state.sortBy !== col) return '';
    return state.order === 'desc' ? ' ▼' : ' ▲';
  };

  view.innerHTML = `
    <!-- Desktop / Tablet Table View -->
    <div class="table-responsive desktop-only">
      <table class="data-table btop-table">
        <thead>
          <tr>
            <th class="th-pid sortable" data-col="pid">PID${sortIcon('pid')}</th>
            <th class="th-name sortable" data-col="name">Command / Process${sortIcon('name')}</th>
            <th class="th-user">User</th>
            <th class="th-cpu sortable" data-col="cpu">CPU %${sortIcon('cpu')}</th>
            <th class="th-ram sortable" data-col="memory">RAM Usage${sortIcon('memory')}</th>
            <th class="th-threads sortable" data-col="threads">Threads${sortIcon('threads')}</th>
            <th class="th-status">Status</th>
            <th class="th-actions">Action</th>
          </tr>
        </thead>
        <tbody>
          ${state.tasks
            .map((t) => {
              const isExpanded = state.expandedPid === t.pid;
              const cpuClass = getCpuColorClass(t.cpu_percent);
              const memClass = getMemColorClass(t.memory_percent);

              return `
                <tr class="task-row ${isExpanded ? 'row-expanded' : ''}" data-pid="${t.pid}">
                  <td class="td-pid"><code>${t.pid}</code></td>
                  <td class="td-name">
                    <div class="proc-name-col" title="Click to view full cmdline">
                      <span class="proc-name">${esc(t.name)}</span>
                      ${
                        t.cmdline && t.cmdline !== t.name
                          ? `<span class="proc-cmdline-short">${esc(t.cmdline)}</span>`
                          : ''
                      }
                    </div>
                    ${
                      isExpanded && t.cmdline
                        ? `<div class="proc-cmdline-full"><code>${esc(t.cmdline)}</code></div>`
                        : ''
                    }
                  </td>
                  <td class="td-user"><span class="user-chip">${esc(t.username || '-')}</span></td>
                  <td class="td-cpu">
                    <div class="metric-meter">
                      <span class="metric-num ${cpuClass}">${t.cpu_percent.toFixed(1)}%</span>
                      <div class="meter-bar-track">
                        <div class="meter-bar-fill fill-cpu" style="width: ${Math.min(t.cpu_percent, 100)}%"></div>
                      </div>
                    </div>
                  </td>
                  <td class="td-ram">
                    <div class="metric-meter">
                      <span class="metric-num ${memClass}">${t.memory_formatted}</span>
                      <div class="meter-bar-track">
                        <div class="meter-bar-fill fill-ram" style="width: ${Math.min(t.memory_percent * 2, 100)}%"></div>
                      </div>
                    </div>
                  </td>
                  <td class="td-threads"><span class="threads-count">${t.num_threads}</span></td>
                  <td class="td-status">
                    <span class="status-chip status-${t.status.toLowerCase()}">${t.status}</span>
                  </td>
                  <td class="td-actions">
                    <button class="btn-action-kill" data-pid="${t.pid}" data-name="${esc(t.name)}" title="Terminate process (SIGTERM)">
                      Stop
                    </button>
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>

    <!-- Mobile Card View -->
    <div class="mobile-only tasks-card-list">
      ${state.tasks
        .map((t) => {
          const isExpanded = state.expandedPid === t.pid;
          const cpuClass = getCpuColorClass(t.cpu_percent);
          const memClass = getMemColorClass(t.memory_percent);

          return `
            <div class="task-card" data-pid="${t.pid}">
              <div class="task-card-top">
                <div class="task-card-identity">
                  <span class="task-card-pid">PID <code>${t.pid}</code></span>
                  <strong class="task-card-name">${esc(t.name)}</strong>
                </div>
                <div class="task-card-actions">
                  <span class="status-chip status-${t.status.toLowerCase()}">${t.status}</span>
                  <button class="btn-icon-danger btn-action-kill" data-pid="${t.pid}" data-name="${esc(t.name)}" title="Stop Process">
                    ✕
                  </button>
                </div>
              </div>

              <!-- Metric Bars -->
              <div class="task-card-metrics">
                <div class="card-metric-block">
                  <div class="card-metric-header">
                    <span class="card-metric-title">CPU</span>
                    <span class="card-metric-val ${cpuClass}">${t.cpu_percent.toFixed(1)}%</span>
                  </div>
                  <div class="meter-bar-track">
                    <div class="meter-bar-fill fill-cpu" style="width: ${Math.min(t.cpu_percent, 100)}%"></div>
                  </div>
                </div>

                <div class="card-metric-block">
                  <div class="card-metric-header">
                    <span class="card-metric-title">RAM</span>
                    <span class="card-metric-val ${memClass}">${t.memory_formatted}</span>
                  </div>
                  <div class="meter-bar-track">
                    <div class="meter-bar-fill fill-ram" style="width: ${Math.min(t.memory_percent * 2, 100)}%"></div>
                  </div>
                </div>
              </div>

              <div class="task-card-footer">
                <span class="user-chip">👤 ${esc(t.username || '-')}</span>
                <span class="threads-tag">🧵 ${t.num_threads} threads</span>
                ${
                  t.cmdline && t.cmdline !== t.name
                    ? `<button class="btn-text-expand" data-toggle-pid="${t.pid}">
                        ${isExpanded ? 'Hide cmd' : 'View cmd'}
                       </button>`
                    : ''
                }
              </div>

              ${
                isExpanded && t.cmdline
                  ? `<div class="proc-cmdline-full mobile-cmd"><code>${esc(t.cmdline)}</code></div>`
                  : ''
              }
            </div>
          `;
        })
        .join('')}
    </div>
  `;

  // Attach action listeners
  view.querySelectorAll('.btn-action-kill').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const el = btn as HTMLElement;
      const pid = parseInt(el.dataset.pid || '0', 10);
      const name = el.dataset.name || `PID ${pid}`;

      const confirmed = window.confirm(`Terminate process "${name}" (PID ${pid})?`);
      if (!confirmed) return;

      el.setAttribute('disabled', 'true');
      el.textContent = 'Stopping...';

      try {
        const res = await triggerTaskAction(pid, 'terminate');
        showToast(res.message || `Process ${pid} terminated`, 'success');
        await loadTasks(view.parentElement!, false);
      } catch (err) {
        showToast(`Failed to stop process: ${String(err)}`, 'error');
        el.removeAttribute('disabled');
        el.textContent = 'Stop';
      }
    });
  });

  // Table header clicks for sorting
  view.querySelectorAll('.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const col = (th as HTMLElement).dataset.col;
      if (!col) return;
      if (state.sortBy === col) {
        state.order = state.order === 'desc' ? 'asc' : 'desc';
      } else {
        state.sortBy = col;
        state.order = 'desc';
      }
      updateActiveSortUI();
      loadTasks(view.parentElement!);
    });
  });

  // Toggle cmdline expansion
  view.querySelectorAll('.proc-name-col, .btn-text-expand').forEach((el) => {
    el.addEventListener('click', () => {
      const row = el.closest('[data-pid]') as HTMLElement;
      const pid = parseInt(row?.dataset.pid || '0', 10);
      state.expandedPid = state.expandedPid === pid ? null : pid;
      renderProcessList(view);
    });
  });
}

function updateActiveSortUI(): void {
  document.querySelectorAll('.btn-chip[data-sort]').forEach((b) => {
    const s = (b as HTMLElement).dataset.sort;
    b.classList.toggle('active', s === state.sortBy);
  });
  const orderBtn = document.querySelector('#taskOrderToggle');
  if (orderBtn) {
    orderBtn.textContent = state.order === 'desc' ? '▼ Desc' : '▲ Asc';
  }
}

function attachEventListeners(container: HTMLElement): void {
  // Search input
  const searchInput = container.querySelector('#taskSearchInput') as HTMLInputElement;
  const searchClear = container.querySelector('#taskSearchClear') as HTMLElement;
  let debounceTimer: number | null = null;

  searchInput?.addEventListener('input', () => {
    const val = searchInput.value;
    state.search = val;
    searchClear?.classList.toggle('visible', !!val);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      loadTasks(container);
    }, 250);
  });

  searchClear?.addEventListener('click', () => {
    state.search = '';
    if (searchInput) searchInput.value = '';
    searchClear.classList.remove('visible');
    loadTasks(container);
  });

  // Sort chip buttons
  container.querySelectorAll('.btn-chip[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sort = (btn as HTMLElement).dataset.sort || 'cpu';
      state.sortBy = sort;
      updateActiveSortUI();
      loadTasks(container);
    });
  });

  // Order toggle
  container.querySelector('#taskOrderToggle')?.addEventListener('click', () => {
    state.order = state.order === 'desc' ? 'asc' : 'desc';
    updateActiveSortUI();
    loadTasks(container);
  });

  // Refresh interval select
  const refreshSelect = container.querySelector('#taskRefreshSelect') as HTMLSelectElement;
  refreshSelect?.addEventListener('change', () => {
    state.refreshInterval = parseInt(refreshSelect.value, 10);
    setupAutoRefresh(container);
  });

  // Manual refresh button
  container.querySelector('#tasksRefreshBtn')?.addEventListener('click', () => {
    loadTasks(container);
  });
}

function showToast(msg: string, type: 'success' | 'error' = 'success'): void {
  let toast = document.getElementById('globalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.className = 'global-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `global-toast toast-${type} visible`;
  setTimeout(() => {
    toast?.classList.remove('visible');
  }, 3200);
}
