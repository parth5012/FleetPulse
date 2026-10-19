/**
 * System Services Monitoring View (systemd User & System scopes).
 * Displays loaded services with live RAM consumption, CPU percentage,
 * active/sub states, search filtering, and restart controls.
 */

import { fetchServices, triggerServiceAction, ServiceItem, ServicesOverview } from '../lib/api';
import { esc } from '../lib/format';
import { renderDonutGauge, renderStackedBar, StackedSegment } from '../lib/charts';

interface ServicesState {
  scope: 'all' | 'user' | 'system';
  stateFilter: 'all' | 'running' | 'failed' | 'inactive';
  sortBy: string;
  order: 'asc' | 'desc';
  limit: number;
  search: string;
  refreshInterval: number;
  timerId: number | null;
  services: ServiceItem[];
  overview: ServicesOverview | null;
  loading: boolean;
  error: string | null;
}

let state: ServicesState = {
  scope: 'all',
  stateFilter: 'all',
  sortBy: 'ram',
  order: 'desc',
  limit: 150,
  search: '',
  refreshInterval: 5000,
  timerId: null,
  services: [],
  overview: null,
  loading: true,
  error: null,
};

export function cleanupServices(): void {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

export async function renderServices(container: HTMLElement): Promise<void> {
  cleanupServices();

  container.innerHTML = `
    <div class="services-page">
      <!-- Header -->
      <div class="page-header">
        <div class="header-titles">
          <div class="page-badge">⚙️ SYSTEMD DAEMONS & SERVICES</div>
          <h1 class="page-title">System & User Services</h1>
          <p class="page-subtitle">Inspect Linux background daemons with live memory allocation and CPU activity.</p>
        </div>
        <div class="header-actions">
          <button id="servicesRefreshBtn" class="btn btn-secondary btn-sm" title="Manual refresh">
            🔄 Refresh
          </button>
        </div>
      </div>

      <!-- Services Vitals Ribbon -->
      <div class="vitals-ribbon" id="servicesVitals">
        <div class="vital-card">
          <div class="vital-label">TOTAL SERVICES</div>
          <div class="vital-value" id="svcTotal">--</div>
          <div class="vital-sub" id="svcTotalSub">User: -- | System: --</div>
        </div>
        <div class="vital-card" style="display:flex; align-items:center; gap:14px;">
          <div id="svcActiveDonut" style="flex-shrink:0;"></div>
          <div style="flex:1; min-width:0;">
            <div class="vital-label">ACTIVE RATIO</div>
            <div class="vital-value text-success" id="svcRunning">--</div>
            <div class="vital-sub">Active daemon processes</div>
          </div>
        </div>
        <div class="vital-card">
          <div class="vital-label">FAILED</div>
          <div class="vital-value" id="svcFailed">0</div>
          <div class="vital-sub" id="svcFailedSub">Degraded or crashed units</div>
        </div>
        <div class="vital-card">
          <div class="vital-label">DAEMON MEMORY</div>
          <div class="vital-value text-primary" id="svcMemory">--</div>
          <div class="vital-sub">Tracked cgroup RAM footprint</div>
        </div>
      </div>

      <!-- Top Daemon Memory Consumption Stacked Bar -->
      <div class="card" id="svcDistributionCard" style="margin-bottom: 20px; padding: 16px 20px; display: none;">
        <div id="svcMemDistBar"></div>
      </div>

      <!-- Filter & Scope Toolbar -->
      <div class="tasks-toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input
            type="search"
            id="svcSearchInput"
            class="input-search"
            placeholder="Search service name, unit, description, PID..."
            value="${esc(state.search)}"
          />
          <button id="svcSearchClear" class="btn-clear ${state.search ? 'visible' : ''}">✕</button>
        </div>

        <div class="toolbar-controls">
          <!-- Scope Switcher -->
          <div class="control-group">
            <label class="control-label">Scope:</label>
            <div class="btn-group">
              <button class="btn-chip ${state.scope === 'all' ? 'active' : ''}" data-scope="all">All</button>
              <button class="btn-chip ${state.scope === 'user' ? 'active' : ''}" data-scope="user">User</button>
              <button class="btn-chip ${state.scope === 'system' ? 'active' : ''}" data-scope="system">System</button>
            </div>
          </div>

          <!-- State Filter -->
          <div class="control-group">
            <label class="control-label">State:</label>
            <select id="svcStateSelect" class="select-sm">
              <option value="all" ${state.stateFilter === 'all' ? 'selected' : ''}>All States</option>
              <option value="running" ${state.stateFilter === 'running' ? 'selected' : ''}>Running</option>
              <option value="failed" ${state.stateFilter === 'failed' ? 'selected' : ''}>Failed</option>
              <option value="inactive" ${state.stateFilter === 'inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>

          <!-- Sort Selector -->
          <div class="control-group">
            <label class="control-label">Sort:</label>
            <div class="btn-group">
              <button class="btn-chip ${state.sortBy === 'ram' ? 'active' : ''}" data-sort="ram">RAM</button>
              <button class="btn-chip ${state.sortBy === 'cpu' ? 'active' : ''}" data-sort="cpu">CPU</button>
              <button class="btn-chip ${state.sortBy === 'name' ? 'active' : ''}" data-sort="name">Name</button>
            </div>
          </div>

          <!-- Order Toggle -->
          <button id="svcOrderToggle" class="btn btn-secondary btn-sm" title="Toggle sort order">
            ${state.order === 'desc' ? '▼ Desc' : '▲ Asc'}
          </button>
        </div>
      </div>

      <!-- Services View Container -->
      <div class="tasks-view-container" id="servicesViewContainer">
        <div class="loading-state">
          <div class="spin">⚡</div>
          <p>Inspecting systemd daemon units...</p>
        </div>
      </div>
    </div>
  `;

  attachEventListeners(container);
  await loadServices(container);
  setupAutoRefresh(container);
}

function setupAutoRefresh(container: HTMLElement): void {
  cleanupServices();
  if (state.refreshInterval > 0) {
    state.timerId = window.setInterval(() => {
      loadServices(container, false);
    }, state.refreshInterval);
  }
}

async function loadServices(container: HTMLElement, showLoading = true): Promise<void> {
  const view = container.querySelector('#servicesViewContainer');
  if (!view) return;

  if (showLoading && state.services.length === 0) {
    view.innerHTML = `
      <div class="loading-state">
        <div class="spin">⚡</div>
        <p>Inspecting systemd daemon units...</p>
      </div>
    `;
  }

  try {
    const res = await fetchServices(
      state.scope,
      state.stateFilter,
      state.sortBy,
      state.order,
      state.limit,
      state.search
    );
    state.services = res.services;
    state.overview = res.overview;
    state.error = null;
    renderVitals(container);
    renderServicesList(view);
  } catch (err) {
    state.error = String(err);
    if (state.services.length === 0) {
      view.innerHTML = `
        <div class="error-banner">
          <span class="error-icon">⚠️</span>
          <div class="error-text">
            <strong>Failed to query systemd:</strong> ${esc(state.error)}
          </div>
          <button id="svcRetryBtn" class="btn btn-secondary btn-sm">Retry</button>
        </div>
      `;
      container.querySelector('#svcRetryBtn')?.addEventListener('click', () => loadServices(container));
    }
  }
}

function renderVitals(container: HTMLElement): void {
  if (!state.overview) return;
  const ov = state.overview;

  const totalEl = container.querySelector('#svcTotal');
  const totalSubEl = container.querySelector('#svcTotalSub');
  const runEl = container.querySelector('#svcRunning');
  const activeDonutEl = container.querySelector('#svcActiveDonut') as HTMLElement;
  const failEl = container.querySelector('#svcFailed');
  const failSubEl = container.querySelector('#svcFailedSub');
  const memEl = container.querySelector('#svcMemory');

  if (totalEl) totalEl.textContent = String(ov.total_services);
  if (totalSubEl) totalSubEl.textContent = `User: ${ov.user_services} | System: ${ov.system_services}`;
  if (runEl) runEl.textContent = String(ov.running_services);

  if (activeDonutEl && ov.total_services > 0) {
    const activePct = Math.round((ov.running_services / ov.total_services) * 100);
    activeDonutEl.innerHTML = renderDonutGauge(activePct, {
      size: 58,
      strokeWidth: 6,
      color: '#10b981',
    });
  }

  if (failEl) {
    failEl.textContent = String(ov.failed_services);
    failEl.className = `vital-value ${ov.failed_services > 0 ? 'text-danger' : 'text-muted'}`;
  }
  if (failSubEl) {
    failSubEl.textContent = ov.failed_services > 0 ? '⚠️ Action needed' : 'All monitored units healthy';
  }
  if (memEl) memEl.textContent = ov.total_memory_formatted;

  // Render Top Service Memory Allocation Stacked Bar
  const distCard = container.querySelector('#svcDistributionCard') as HTMLElement;
  const memDistEl = container.querySelector('#svcMemDistBar') as HTMLElement;

  if (distCard && memDistEl && state.services.length > 0) {
    const colors = ['#818cf8', '#38bdf8', '#34d399', '#f59e0b', '#ec4899'];
    const topMemSvcs = [...state.services]
      .sort((a, b) => b.memory_bytes - a.memory_bytes)
      .slice(0, 5)
      .filter((s) => s.memory_bytes > 512 * 1024);

    if (topMemSvcs.length > 0) {
      distCard.style.display = 'block';
      const segments: StackedSegment[] = topMemSvcs.map((s, i) => ({
        label: s.name.length > 16 ? s.name.slice(0, 14) + '..' : s.name,
        value: s.memory_bytes,
        color: colors[i % colors.length],
        displayValue: s.memory_formatted,
      }));
      memDistEl.innerHTML = renderStackedBar(segments, {
        height: 10,
        title: 'Top Service Memory Consumers (cgroup footprint)',
        showLegend: true,
      });
    }
  }
}

function renderServicesList(view: Element): void {
  if (state.services.length === 0) {
    view.innerHTML = `
      <div class="empty-state">
        <p>No services found matching current filters.</p>
        <button id="clearSvcFilterBtn" class="btn btn-secondary btn-sm" style="margin-top: 12px">Clear filters</button>
      </div>
    `;
    view.querySelector('#clearSvcFilterBtn')?.addEventListener('click', () => {
      state.search = '';
      state.scope = 'all';
      state.stateFilter = 'all';
      loadServices(view.parentElement!);
    });
    return;
  }

  const sortIcon = (col: string) => {
    if (state.sortBy !== col) return '';
    return state.order === 'desc' ? ' ▼' : ' ▲';
  };

  view.innerHTML = `
    <!-- Desktop Table View -->
    <div class="table-responsive desktop-only">
      <table class="data-table">
        <thead>
          <tr>
            <th class="th-name sortable" data-col="name">Service Unit${sortIcon('name')}</th>
            <th class="th-scope">Scope</th>
            <th class="th-status sortable" data-col="status">Status${sortIcon('status')}</th>
            <th class="th-pid sortable" data-col="pid">PID${sortIcon('pid')}</th>
            <th class="th-cpu sortable" data-col="cpu">CPU %${sortIcon('cpu')}</th>
            <th class="th-ram sortable" data-col="ram">RAM Footprint${sortIcon('ram')}</th>
            <th class="th-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${state.services
            .map((s) => {
              const isRunning = s.active_state === 'active' || s.sub_state === 'running';
              const isFailed = s.active_state === 'failed';
              const statusClass = isFailed ? 'status-failed' : isRunning ? 'status-running' : 'status-inactive';

              return `
                <tr class="service-row">
                  <td class="td-name">
                    <div class="svc-name-block">
                      <strong class="svc-unit-name">${esc(s.name)}</strong>
                      <span class="svc-desc">${esc(s.description || s.unit)}</span>
                    </div>
                  </td>
                  <td class="td-scope">
                    <span class="badge-scope scope-${s.scope}">${s.scope}</span>
                  </td>
                  <td class="td-status">
                    <span class="status-chip ${statusClass}">
                      ${s.active_state} (${s.sub_state})
                    </span>
                  </td>
                  <td class="td-pid">
                    ${s.main_pid > 0 ? `<code>${s.main_pid}</code>` : '<span class="text-muted">-</span>'}
                  </td>
                  <td class="td-cpu">
                    <div class="metric-meter">
                      <span class="metric-num ${s.cpu_percent > 10 ? 'text-warning' : 'text-primary'}">
                        ${s.cpu_percent.toFixed(1)}%
                      </span>
                      <div class="meter-bar-track">
                        <div class="meter-bar-fill fill-cpu" style="width: ${Math.min(s.cpu_percent, 100)}%"></div>
                      </div>
                    </div>
                  </td>
                  <td class="td-ram">
                    <div class="metric-meter">
                      <span class="metric-num text-primary">${s.memory_formatted}</span>
                      <div class="meter-bar-track">
                        <div class="meter-bar-fill fill-ram" style="width: ${Math.min(s.memory_percent * 2, 100)}%"></div>
                      </div>
                    </div>
                  </td>
                  <td class="td-actions">
                    <button class="btn-action-restart btn-sm" data-scope="${s.scope}" data-unit="${esc(s.unit)}" title="Restart service">
                      🔄 Restart
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
    <div class="mobile-only services-card-list">
      ${state.services
        .map((s) => {
          const isRunning = s.active_state === 'active' || s.sub_state === 'running';
          const isFailed = s.active_state === 'failed';
          const statusClass = isFailed ? 'status-failed' : isRunning ? 'status-running' : 'status-inactive';

          return `
            <div class="service-card">
              <div class="service-card-top">
                <div class="service-card-identity">
                  <div class="service-card-title-row">
                    <strong class="service-card-name">${esc(s.name)}</strong>
                    <span class="badge-scope scope-${s.scope}">${s.scope}</span>
                  </div>
                  <span class="service-card-desc">${esc(s.description || s.unit)}</span>
                </div>
                <div class="service-card-status">
                  <span class="status-chip ${statusClass}">${s.active_state}</span>
                </div>
              </div>

              <!-- Metric Bars -->
              <div class="service-card-metrics">
                <div class="card-metric-block">
                  <div class="card-metric-header">
                    <span class="card-metric-title">RAM USAGE</span>
                    <span class="card-metric-val text-primary">${s.memory_formatted}</span>
                  </div>
                  <div class="meter-bar-track">
                    <div class="meter-bar-fill fill-ram" style="width: ${Math.min(s.memory_percent * 2, 100)}%"></div>
                  </div>
                </div>

                <div class="card-metric-block">
                  <div class="card-metric-header">
                    <span class="card-metric-title">CPU</span>
                    <span class="card-metric-val ${s.cpu_percent > 10 ? 'text-warning' : 'text-primary'}">
                      ${s.cpu_percent.toFixed(1)}%
                    </span>
                  </div>
                  <div class="meter-bar-track">
                    <div class="meter-bar-fill fill-cpu" style="width: ${Math.min(s.cpu_percent, 100)}%"></div>
                  </div>
                </div>
              </div>

              <div class="service-card-footer">
                <span class="service-pid-tag">
                  PID: ${s.main_pid > 0 ? `<code>${s.main_pid}</code>` : 'None'}
                </span>
                <span class="sub-state-tag">Sub: ${s.sub_state}</span>
                <button class="btn-action-restart btn-sm" data-scope="${s.scope}" data-unit="${esc(s.unit)}">
                  🔄 Restart
                </button>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;

  // Attach restart listeners
  view.querySelectorAll('.btn-action-restart').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const el = btn as HTMLElement;
      const scope = (el.dataset.scope || 'user') as 'user' | 'system';
      const unit = el.dataset.unit || '';

      const confirmed = window.confirm(`Restart ${scope} service "${unit}"?`);
      if (!confirmed) return;

      el.setAttribute('disabled', 'true');
      el.textContent = 'Restarting...';

      try {
        const res = await triggerServiceAction(scope, unit, 'restart');
        showToast(res.message || `Service ${unit} restarted`, 'success');
        await loadServices(view.parentElement!, false);
      } catch (err) {
        showToast(`Failed to restart service: ${String(err)}`, 'error');
        el.removeAttribute('disabled');
        el.textContent = '🔄 Restart';
      }
    });
  });

  // Header clicks for table sorting
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
      loadServices(view.parentElement!);
    });
  });
}

function updateActiveSortUI(): void {
  document.querySelectorAll('.btn-chip[data-sort]').forEach((b) => {
    const s = (b as HTMLElement).dataset.sort;
    b.classList.toggle('active', s === state.sortBy);
  });
  const orderBtn = document.querySelector('#svcOrderToggle');
  if (orderBtn) {
    orderBtn.textContent = state.order === 'desc' ? '▼ Desc' : '▲ Asc';
  }
}

function attachEventListeners(container: HTMLElement): void {
  // Search
  const searchInput = container.querySelector('#svcSearchInput') as HTMLInputElement;
  const searchClear = container.querySelector('#svcSearchClear') as HTMLElement;
  let debounceTimer: number | null = null;

  searchInput?.addEventListener('input', () => {
    const val = searchInput.value;
    state.search = val;
    searchClear?.classList.toggle('visible', !!val);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      loadServices(container);
    }, 250);
  });

  searchClear?.addEventListener('click', () => {
    state.search = '';
    if (searchInput) searchInput.value = '';
    searchClear.classList.remove('visible');
    loadServices(container);
  });

  // Scope buttons
  container.querySelectorAll('.btn-chip[data-scope]').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.btn-chip[data-scope]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.scope = (btn as HTMLElement).dataset.scope as any;
      loadServices(container);
    });
  });

  // State Select
  const stateSelect = container.querySelector('#svcStateSelect') as HTMLSelectElement;
  stateSelect?.addEventListener('change', () => {
    state.stateFilter = stateSelect.value as any;
    loadServices(container);
  });

  // Sort buttons
  container.querySelectorAll('.btn-chip[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.sortBy = (btn as HTMLElement).dataset.sort || 'ram';
      updateActiveSortUI();
      loadServices(container);
    });
  });

  // Order toggle
  container.querySelector('#svcOrderToggle')?.addEventListener('click', () => {
    state.order = state.order === 'desc' ? 'asc' : 'desc';
    updateActiveSortUI();
    loadServices(container);
  });

  // Refresh
  container.querySelector('#servicesRefreshBtn')?.addEventListener('click', () => {
    loadServices(container);
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
