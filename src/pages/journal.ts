/**
 * System Journal (journalctl) & Kernel PSI / OOM Watcher.
 */

import { fetchJournalLogs, fetchKernelHealth } from '../lib/api';
import type { JournalLogsResponse, JournalEntry, KernelHealthResponse } from '../lib/api';
import { esc } from '../lib/format';

let refreshTimer: number | null = null;

export async function renderJournal(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <header class="page-header">
      <div>
        <div style="display:flex;align-items:center;gap:10px;">
          <h1>📜 System Journal & Kernel Watcher</h1>
          <span class="pill pill-live" id="journalLivePill"><span class="pulse-dot"></span> STREAMING</span>
        </div>
        <p class="muted" style="font-size:.88rem;margin-top:4px;">
          Live systemd journal log streaming, error level filtering, Linux PSI pressure stalls, and kernel OOM detection
        </p>
      </div>
      <div class="header-actions">
        <button id="pauseJournalBtn" class="btn"><span id="pauseJournalIcon">⏸️</span> Pause</button>
        <button id="refreshJournalBtn" class="btn btn-primary"><span id="refreshJournalIcon">🔄</span> Refresh</button>
      </div>
    </header>

    <!-- Kernel Watcher & PSI Memory Pressure Ribbon -->
    <div class="kernel-watcher-card" id="kernelWatcherCard">
      <div class="kernel-watcher-header">
        <div class="section-title">
          <span>🛡️ Kernel Telemetry & Resource Pressure (PSI)</span>
          <span class="badge badge-success" id="oomBadge">0 OOM Kills</span>
        </div>
        <span class="freq-tag" id="psiStallStatus">Pressure Normal</span>
      </div>

      <div class="kernel-pressure-grid">
        <!-- OOM Watcher Tile -->
        <div class="pressure-tile">
          <div class="tile-label"><span class="indicator-dot dot-cpu"></span> OOM Killer Interventions</div>
          <div class="tile-val" id="oomCountVal">0</div>
          <div class="tile-sub" id="oomSub">No out-of-memory termination events recorded</div>
        </div>

        <!-- Memory PSI Pressure Tile -->
        <div class="pressure-tile">
          <div class="tile-label"><span class="indicator-dot dot-mem"></span> Memory Pressure (Stall %)</div>
          <div class="tile-val" id="memPsiVal">0.0%</div>
          <div class="tile-sub" id="memPsiSub">avg10: 0% · avg60: 0% · avg300: 0%</div>
          <div class="bar-outer" style="height:4px;margin-top:6px;">
            <div class="bar-inner" id="memPsiBar" style="width:0%;background:#a855f7;"></div>
          </div>
        </div>

        <!-- CPU PSI Pressure Tile -->
        <div class="pressure-tile">
          <div class="tile-label"><span class="indicator-dot dot-cpu"></span> CPU Pressure (Stall %)</div>
          <div class="tile-val" id="cpuPsiVal">0.0%</div>
          <div class="tile-sub" id="cpuPsiSub">avg10: 0% · avg60: 0% · avg300: 0%</div>
          <div class="bar-outer" style="height:4px;margin-top:6px;">
            <div class="bar-inner" id="cpuPsiBar" style="width:0%;background:#10b981;"></div>
          </div>
        </div>

        <!-- I/O PSI Pressure Tile -->
        <div class="pressure-tile">
          <div class="tile-label"><span class="indicator-dot dot-disk"></span> I/O Storage Pressure</div>
          <div class="tile-val" id="ioPsiVal">0.0%</div>
          <div class="tile-sub" id="ioPsiSub">avg10: 0% · avg60: 0% · avg300: 0%</div>
          <div class="bar-outer" style="height:4px;margin-top:6px;">
            <div class="bar-inner" id="ioPsiBar" style="width:0%;background:#f59e0b;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Journal Stream Controls Bar -->
    <div class="journal-controls-card">
      <div class="journal-controls-left">
        <div class="timeframe-buttons" id="journalPriorityFilters">
          <button class="btn btn-sm btn-primary" data-p="">ALL</button>
          <button class="btn btn-sm" data-p="err">ERR & CRIT</button>
          <button class="btn btn-sm" data-p="warning">WARNING</button>
          <button class="btn btn-sm" data-p="info">INFO</button>
        </div>

        <select id="journalUnitSelect" class="input-sm select-styled">
          <option value="">All Services & Units</option>
          <option value="dashboard-service.service">dashboard-service.service</option>
          <option value="omniroute.service">omniroute.service</option>
          <option value="hermes-gateway.service">hermes-gateway.service</option>
          <option value="kanban-sync.service">kanban-sync.service</option>
          <option value="t3.service">t3.service</option>
          <option value="element-web.service">element-web.service</option>
          <option value="secondbrain-sync.service">secondbrain-sync.service</option>
        </select>
      </div>

      <div class="journal-controls-right">
        <input type="text" id="journalSearchInput" class="input-sm" placeholder="Filter message text..." style="min-width:200px;" />
        <span class="badge badge-info" id="journalCountBadge">0 Logs</span>
      </div>
    </div>

    <!-- Live Journal Console -->
    <div class="journal-console-wrap">
      <div class="log-stream-console" id="journalConsole">
        <div class="loading-state" style="padding:24px;"><div class="spin">⚡</div></div>
      </div>
    </div>
  `;

  let isPaused = false;
  let currentPriority = '';
  let currentUnit = '';
  let searchQuery = '';

  async function loadKernelWatcher(): Promise<void> {
    try {
      const data: KernelHealthResponse = await fetchKernelHealth();
      const oomVal = container.querySelector('#oomCountVal') as HTMLElement;
      const oomSub = container.querySelector('#oomSub') as HTMLElement;
      const oomBadge = container.querySelector('#oomBadge') as HTMLElement;

      if (data.oom_kill_count > 0) {
        oomVal.textContent = String(data.oom_kill_count);
        oomVal.style.color = '#ef4444';
        oomSub.textContent = `Warning: ${data.oom_kill_count} OOM termination events detected!`;
        oomBadge.className = 'badge badge-error';
        oomBadge.textContent = `${data.oom_kill_count} OOM KILLS`;
      } else {
        oomVal.textContent = '0';
        oomVal.style.color = 'var(--text)';
        oomSub.textContent = 'No out-of-memory termination events recorded';
        oomBadge.className = 'badge badge-success';
        oomBadge.textContent = '0 OOM Kills';
      }

      // Memory PSI
      const memSome = data.memory_pressure?.some || {};
      const memAvg10 = memSome.avg10 || 0;
      const memVal = container.querySelector('#memPsiVal') as HTMLElement;
      const memSub = container.querySelector('#memPsiSub') as HTMLElement;
      const memBar = container.querySelector('#memPsiBar') as HTMLElement;
      if (memVal) memVal.textContent = `${memAvg10.toFixed(2)}%`;
      if (memSub) memSub.textContent = `avg10: ${memAvg10.toFixed(2)}% · avg60: ${(memSome.avg60 || 0).toFixed(2)}% · avg300: ${(memSome.avg300 || 0).toFixed(2)}%`;
      if (memBar) memBar.style.width = `${Math.min(100, memAvg10 * 10)}%`;

      // CPU PSI
      const cpuSome = data.cpu_pressure?.some || {};
      const cpuAvg10 = cpuSome.avg10 || 0;
      const cpuVal = container.querySelector('#cpuPsiVal') as HTMLElement;
      const cpuSub = container.querySelector('#cpuPsiSub') as HTMLElement;
      const cpuBar = container.querySelector('#cpuBar') as HTMLElement;
      if (cpuVal) cpuVal.textContent = `${cpuAvg10.toFixed(2)}%`;
      if (cpuSub) cpuSub.textContent = `avg10: ${cpuAvg10.toFixed(2)}% · avg60: ${(cpuSome.avg60 || 0).toFixed(2)}% · avg300: ${(cpuSome.avg300 || 0).toFixed(2)}%`;
      if (cpuBar) cpuBar.style.width = `${Math.min(100, cpuAvg10 * 10)}%`;

      // IO PSI
      const ioSome = data.io_pressure?.some || {};
      const ioAvg10 = ioSome.avg10 || 0;
      const ioVal = container.querySelector('#ioPsiVal') as HTMLElement;
      const ioSub = container.querySelector('#ioPsiSub') as HTMLElement;
      const ioBar = container.querySelector('#ioPsiBar') as HTMLElement;
      if (ioVal) ioVal.textContent = `${ioAvg10.toFixed(2)}%`;
      if (ioSub) ioSub.textContent = `avg10: ${ioAvg10.toFixed(2)}% · avg60: ${(ioSome.avg60 || 0).toFixed(2)}% · avg300: ${(ioSome.avg300 || 0).toFixed(2)}%`;
      if (ioBar) ioBar.style.width = `${Math.min(100, ioAvg10 * 10)}%`;
    } catch (err) {
      console.warn('Failed to fetch kernel watcher stats', err);
    }
  }

  async function loadJournalLogs(): Promise<void> {
    if (isPaused) return;

    const consoleEl = container.querySelector('#journalConsole') as HTMLElement;
    const badge = container.querySelector('#journalCountBadge') as HTMLElement;

    try {
      const data: JournalLogsResponse = await fetchJournalLogs(
        'user',
        currentUnit || undefined,
        currentPriority || undefined,
        searchQuery || undefined,
        150
      );

      const logs = data.logs || [];
      badge.textContent = `${logs.length} Logs`;

      if (logs.length === 0) {
        consoleEl.innerHTML = `<div class="empty-state" style="padding:24px;"><p>No journal logs matching current filter criteria.</p></div>`;
        return;
      }

      consoleEl.innerHTML = logs.map((l: JournalEntry) => {
        let pClass = 'j-info';
        if (l.priority_num <= 3) pClass = 'j-error';
        else if (l.priority_num === 4) pClass = 'j-warn';
        else if (l.priority_num >= 7) pClass = 'j-debug';

        const timeStr = l.timestamp ? l.timestamp.replace('T', ' ').substring(0, 19) : '-';

        return `
          <div class="journal-line ${pClass}">
            <span class="j-time">${esc(timeStr)}</span>
            <span class="j-prio ${pClass}">${esc(l.priority_label.toUpperCase())}</span>
            <span class="j-unit">[${esc(l.unit)}]</span>
            <span class="j-msg">${esc(l.message)}</span>
          </div>
        `;
      }).join('');
    } catch (err) {
      consoleEl.innerHTML = `<div class="empty-state" style="padding:24px;"><p>Error querying journal logs: ${String(err)}</p></div>`;
    }
  }

  // Priority filters
  const pBtns = container.querySelectorAll('#journalPriorityFilters button') as NodeListOf<HTMLButtonElement>;
  pBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      pBtns.forEach((b) => b.classList.remove('btn-primary'));
      btn.classList.add('btn-primary');
      currentPriority = btn.getAttribute('data-p') || '';
      await loadJournalLogs();
    });
  });

  // Unit filter select
  const unitSelect = container.querySelector('#journalUnitSelect') as HTMLSelectElement;
  unitSelect.addEventListener('change', async () => {
    currentUnit = unitSelect.value;
    await loadJournalLogs();
  });

  // Search input
  const searchInput = container.querySelector('#journalSearchInput') as HTMLInputElement;
  let debounceTimeout: number | null = null;
  searchInput.addEventListener('input', () => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = window.setTimeout(async () => {
      searchQuery = searchInput.value.trim();
      await loadJournalLogs();
    }, 300);
  });

  // Pause / Resume
  const pauseBtn = container.querySelector('#pauseJournalBtn') as HTMLButtonElement;
  const pauseIcon = container.querySelector('#pauseJournalIcon') as HTMLElement;
  const livePill = container.querySelector('#journalLivePill') as HTMLElement;

  pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
      pauseBtn.classList.add('btn-active');
      pauseIcon.textContent = '▶️';
      pauseBtn.innerHTML = '<span>▶️</span> Resume';
      livePill.className = 'pill';
      livePill.innerHTML = 'PAUSED';
    } else {
      pauseBtn.classList.remove('btn-active');
      pauseIcon.textContent = '⏸️';
      pauseBtn.innerHTML = '<span>⏸️</span> Pause';
      livePill.className = 'pill pill-live';
      livePill.innerHTML = '<span class="pulse-dot"></span> STREAMING';
      loadJournalLogs();
    }
  });

  // Refresh button
  const refreshBtn = container.querySelector('#refreshJournalBtn') as HTMLButtonElement;
  const refreshIcon = container.querySelector('#refreshJournalIcon') as HTMLElement;
  refreshBtn.addEventListener('click', async () => {
    refreshIcon.classList.add('spin');
    await loadKernelWatcher();
    await loadJournalLogs();
    setTimeout(() => refreshIcon.classList.remove('spin'), 400);
  });

  // Initial load
  await loadKernelWatcher();
  await loadJournalLogs();

  // Polling every 5 seconds for live stream
  refreshTimer = window.setInterval(() => {
    if (!isPaused) {
      loadJournalLogs();
      loadKernelWatcher();
    }
  }, 5000);
}

export function cleanupJournal(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
