/**
 * Central Command Hub.
 * High-level telemetry cards for Tasks (btop), System Services,
 * Beszel vitals, Dozzel containers, and Antigravity quotas.
 */

import {
  fetchSystemMetrics,
  fetchSystemStats,
  fetchContainers,
  fetchLimits,
  fetchTasks,
  fetchServices,
  fetchTailscaleStatus,
  fetchListeningPorts,
  fetchKernelHealth,
  fetchMaintenanceDf,
} from '../lib/api';
import { formatBytes, formatUptime, esc } from '../lib/format';
import { renderDonutGauge } from '../lib/charts';

export async function renderHome(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="home-hero">
      <div class="hero-badge">⚡ UNIFIED OBSERVABILITY PLATFORM</div>
      <h1 class="hero-title">Visual Telemetry & Fleet Hub</h1>
      <p class="hero-desc">
        Integrated infrastructure telemetry inspired by <strong>btop</strong> (process monitoring),
        <strong>systemd</strong> (daemon health), <strong>Beszel</strong> (server vitals),
        and <strong>Dozzel</strong> (container fleet logs).
      </p>
    </div>

    <!-- Quick Services Grid -->
    <div class="services-grid">
      <!-- Card 1: Tasks / btop Process Monitor -->
      <div class="service-card" id="homeTasksCard">
        <div class="service-head">
          <div class="service-icon icon-tasks">⚡</div>
          <div>
            <h3>Tasks & Processes (btop)</h3>
            <p class="muted">Live CPU, RAM sorted processes & task manager</p>
          </div>
          <span class="pill pill-live" id="homeTasksPill">Polling...</span>
        </div>
        <div class="service-body">
          <div class="home-tasks-preview" id="homeTasksPreview">
            <div class="loading-state" style="padding: 12px;"><div class="spin">⚡</div></div>
          </div>
        </div>
        <div class="service-foot">
          <a href="#/tasks" class="btn btn-primary" style="width:100%;justify-content:center;">Open Task Manager →</a>
        </div>
      </div>

      <!-- Card 2: System Services (systemd) -->
      <div class="service-card" id="homeSvcsCard">
        <div class="service-head">
          <div class="service-icon icon-svcs">⚙️</div>
          <div>
            <h3>System Services</h3>
            <p class="muted">User & system daemons with RAM footprint</p>
          </div>
          <span class="pill pill-live" id="homeSvcsPill">Polling...</span>
        </div>
        <div class="service-body">
          <div class="home-svcs-preview" id="homeSvcsPreview">
            <div class="loading-state" style="padding: 12px;"><div class="spin">⚡</div></div>
          </div>
        </div>
        <div class="service-foot">
          <a href="#/services" class="btn btn-primary" style="width:100%;justify-content:center;">Inspect Services →</a>
        </div>
      </div>

      <!-- Card 3: Beszel System Monitor -->
      <div class="service-card" id="homeSysCard">
        <div class="service-head">
          <div class="service-icon icon-sys">🖥️</div>
          <div>
            <h3>System Monitor (Beszel)</h3>
            <p class="muted">Live CPU, RAM, Disk I/O & Network vitals</p>
          </div>
          <span class="pill pill-live" id="homeSysPill">Polling...</span>
        </div>
        <div class="service-body">
          <div class="home-metric-row">
            <div id="homeCpuGauge"></div>
            <div id="homeMemGauge"></div>
            <div id="homeDiskGauge"></div>
          </div>
          <div class="service-meta-list" id="homeSysMeta">
            <div><span>Host:</span> <strong id="hMetaHost">-</strong></div>
            <div><span>Uptime:</span> <strong id="hMetaUptime">-</strong></div>
            <div><span>Live Load:</span> <strong id="hMetaLoad">-</strong></div>
            <div><span>Avg RAM (24h):</span> <strong id="hMetaAvgMem" style="color:#a855f7;">-</strong></div>
            <div><span>Avg Load (24h):</span> <strong id="hMetaAvgLoad" style="color:#10b981;">-</strong></div>
          </div>
        </div>
        <div class="service-foot">
          <a href="#/system" class="btn btn-primary" style="width:100%;justify-content:center;">Open System Monitor →</a>
        </div>
      </div>

      <!-- Card 4: Dozzel Container & Logs -->
      <div class="service-card" id="homeDockCard">
        <div class="service-head">
          <div class="service-icon icon-dock">🐳</div>
          <div>
            <h3>Containers & Logs (Dozzel)</h3>
            <p class="muted">Real-time log tailing, ANSI colors & fleet stats</p>
          </div>
          <span class="pill pill-live" id="homeDockPill">Polling...</span>
        </div>
        <div class="service-body">
          <div class="home-containers-preview" id="homeContainersPreview">
            <div class="empty-state" style="padding:16px 8px;"><p>Loading containers...</p></div>
          </div>
        </div>
        <div class="service-foot">
          <a href="#/containers" class="btn btn-primary" style="width:100%;justify-content:center;">Open Log Console →</a>
        </div>
      </div>

      <!-- Card 5: Antigravity Quota Hub -->
      <div class="service-card" id="homeAgyCard">
        <div class="service-head">
          <div class="service-icon icon-agy">🔮</div>
          <div>
            <h3>Antigravity Quotas</h3>
            <p class="muted">5h + weekly LLM quota pools across accounts</p>
          </div>
          <span class="pill" id="homeAgyPill">Ready</span>
        </div>
        <div class="service-body">
          <div class="home-agy-preview" id="homeAgyPreview">
            <div class="empty-state" style="padding:16px 8px;"><p>Connecting to OmniRoute...</p></div>
          </div>
        </div>
        <div class="service-foot">
          <a href="#/antigravity" class="btn btn-primary" style="width:100%;justify-content:center;">Open Quota Dashboard →</a>
        </div>
      </div>

      <!-- Card 6: Tailscale & Network Health -->
      <div class="service-card" id="homeNetCard">
        <div class="service-head">
          <div class="service-icon icon-tasks">🌐</div>
          <div>
            <h3>Network & Tailscale Inspector</h3>
            <p class="muted">Live mesh topology, WireGuard vs DERP & open sockets</p>
          </div>
          <span class="pill pill-live" id="homeNetPill">Auditing...</span>
        </div>
        <div class="service-body">
          <div id="homeNetPreview">
            <div class="loading-state" style="padding: 12px;"><div class="spin">⚡</div></div>
          </div>
        </div>
        <div class="service-foot">
          <a href="#/network" class="btn btn-primary" style="width:100%;justify-content:center;">Inspect Network →</a>
        </div>
      </div>

      <!-- Card 7: System Journal & Kernel Watcher -->
      <div class="service-card" id="homeJournalCard">
        <div class="service-head">
          <div class="service-icon icon-svcs">📜</div>
          <div>
            <h3>System Journal & Kernel Watcher</h3>
            <p class="muted">OOM killer events, Linux PSI stalls & systemd logs</p>
          </div>
          <span class="pill pill-live" id="homeJournalPill">Watching...</span>
        </div>
        <div class="service-body">
          <div id="homeJournalPreview">
            <div class="loading-state" style="padding: 12px;"><div class="spin">⚡</div></div>
          </div>
        </div>
        <div class="service-foot">
          <a href="#/journal" class="btn btn-primary" style="width:100%;justify-content:center;">View Host Logs →</a>
        </div>
      </div>

      <!-- Card 8: One-Tap Maintenance Hub -->
      <div class="service-card" id="homeMaintCard">
        <div class="service-head">
          <div class="service-icon icon-dock">🛠️</div>
          <div>
            <h3>Remote Maintenance & Actions</h3>
            <p class="muted">Docker prune, journal vacuum & daemon restart shortcuts</p>
          </div>
          <span class="pill" id="homeMaintPill">Console</span>
        </div>
        <div class="service-body">
          <div id="homeMaintPreview">
            <div class="loading-state" style="padding: 12px;"><div class="spin">⚡</div></div>
          </div>
        </div>
        <div class="service-foot">
          <a href="#/maintenance" class="btn btn-primary" style="width:100%;justify-content:center;">Admin Console →</a>
        </div>
      </div>
    </div>
  `;

  // 1. Fetch Tasks Preview
  try {
    const taskRes = await fetchTasks('cpu', 'desc', 4);
    const pill = container.querySelector('#homeTasksPill') as HTMLElement;
    if (pill) {
      pill.textContent = `${taskRes.overview.total_processes} Procs (${taskRes.overview.cpu_total_percent.toFixed(0)}% CPU)`;
    }
    const preview = container.querySelector('#homeTasksPreview') as HTMLElement;
    if (preview) {
      const cpuDonut = renderDonutGauge(taskRes.overview.cpu_total_percent, {
        size: 58,
        strokeWidth: 5,
        label: 'CPU',
        color: taskRes.overview.cpu_total_percent > 75 ? '#ef4444' : '#10b981',
      });
      const ramDonut = renderDonutGauge(taskRes.overview.memory_used_percent, {
        size: 58,
        strokeWidth: 5,
        label: 'RAM',
        color: '#a855f7',
      });

      preview.innerHTML = `
        <div style="display:flex; justify-content:space-around; align-items:center; margin-bottom:12px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
          ${cpuDonut}
          ${ramDonut}
        </div>
        ${taskRes.tasks
          .map(
            (t) => `
          <div class="home-c-row">
            <div style="display:flex;align-items:center;gap:8px;overflow:hidden;">
              <code style="font-size:0.75rem;color:var(--text-muted);">${t.pid}</code>
              <strong style="font-size:0.85rem;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">${esc(t.name)}</strong>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <span class="c-pill" style="color:var(--primary)">${t.cpu_percent.toFixed(1)}%</span>
              <span class="c-pill">${esc(t.memory_formatted)}</span>
            </div>
          </div>
        `
          )
          .join('')}
      `;
    }
  } catch (err) {
    console.warn('Home tasks fetch error', err);
  }

  // 2. Fetch Services Preview
  try {
    const svcsRes = await fetchServices('all', 'all', 'ram', 'desc', 4);
    const pill = container.querySelector('#homeSvcsPill') as HTMLElement;
    if (pill) {
      pill.textContent = `${svcsRes.overview.running_services} Active (${svcsRes.overview.total_memory_formatted})`;
    }
    const preview = container.querySelector('#homeSvcsPreview') as HTMLElement;
    if (preview) {
      preview.innerHTML = svcsRes.services.map((s) => `
        <div class="home-c-row">
          <div style="display:flex;align-items:center;gap:8px;overflow:hidden;">
            <span class="badge-scope scope-${s.scope}" style="font-size:0.65rem;padding:1px 4px;">${s.scope}</span>
            <strong style="font-size:0.85rem;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">${esc(s.name)}</strong>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <span class="c-pill">${esc(s.memory_formatted)}</span>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.warn('Home services fetch error', err);
  }

  // 3. Fetch System Vitals
  try {
    const sys = await fetchSystemMetrics();
    const sysPill = container.querySelector('#homeSysPill') as HTMLElement;
    if (sysPill) {
      sysPill.textContent = 'ONLINE';
      sysPill.className = 'pill pill-live';
    }

    const cpuG = container.querySelector('#homeCpuGauge') as HTMLElement;
    if (cpuG) {
      cpuG.innerHTML = renderDonutGauge(sys.cpu.total_percent, { size: 76, strokeWidth: 7, label: 'CPU' });
    }
    const memG = container.querySelector('#homeMemGauge') as HTMLElement;
    if (memG) {
      memG.innerHTML = renderDonutGauge(sys.memory.used_percent, { size: 76, strokeWidth: 7, label: 'RAM', color: '#a855f7' });
    }
    const diskG = container.querySelector('#homeDiskGauge') as HTMLElement;
    if (diskG) {
      diskG.innerHTML = renderDonutGauge(sys.disk.used_percent, { size: 76, strokeWidth: 7, label: 'DISK', color: '#10b981' });
    }

    const hostEl = container.querySelector('#hMetaHost') as HTMLElement;
    if (hostEl) hostEl.textContent = sys.host.hostname || 'localhost';
    const upEl = container.querySelector('#hMetaUptime') as HTMLElement;
    if (upEl) upEl.textContent = formatUptime(sys.host.uptime_seconds);
    const loadEl = container.querySelector('#hMetaLoad') as HTMLElement;
    if (loadEl) loadEl.textContent = (sys.load_avg || []).join(' · ') || '0.0';

    // Fetch rolling 24h SQLite stats for Avg RAM and Avg Load
    try {
      const stats = await fetchSystemStats(24);
      const avgMemEl = container.querySelector('#hMetaAvgMem') as HTMLElement;
      if (avgMemEl) {
        avgMemEl.textContent = `${stats.memory.avg_percent.toFixed(1)}%`;
      }
      const avgLoadEl = container.querySelector('#hMetaAvgLoad') as HTMLElement;
      if (avgLoadEl) {
        avgLoadEl.textContent = `${stats.load.avg_1m.toFixed(2)} (1m)`;
      }
    } catch {
      // optional
    }
  } catch (err) {
    console.warn('Home sys fetch error', err);
  }

  // 4. Fetch containers preview
  try {
    const data = await fetchContainers();
    const list = data.containers || [];
    const dockPill = container.querySelector('#homeDockPill') as HTMLElement;
    if (dockPill) {
      dockPill.textContent = `${list.length} Containers`;
      dockPill.className = 'pill pill-live';
    }

    const preview = container.querySelector('#homeContainersPreview') as HTMLElement;
    if (preview) {
      preview.innerHTML = list
        .slice(0, 4)
        .map(
          (c) => `
        <div class="home-c-row">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="status-dot ${c.state === 'running' ? 'status-green' : 'status-gray'}"></span>
            <strong style="font-size:0.85rem;">${esc(c.name)}</strong>
          </div>
          <div style="display:flex;gap:6px;">
            <span class="c-pill">CPU ${c.cpu_percent}%</span>
            <span class="c-pill">RAM ${esc(c.mem_usage.split('/')[0] || c.mem_usage)}</span>
          </div>
        </div>
      `
        )
        .join('');
    }
  } catch (err) {
    console.warn('Home dock fetch error', err);
  }

  // 5. Fetch Antigravity preview
  try {
    const data = await fetchLimits(false);
    const accs = data.accounts || [];
    const agyPill = container.querySelector('#homeAgyPill') as HTMLElement;
    if (agyPill) {
      agyPill.textContent = `${accs.length} Accounts`;
      agyPill.className = 'pill pill-live';
    }
    const agyPreview = container.querySelector('#homeAgyPreview') as HTMLElement;
    if (agyPreview) {
      if (accs.length === 0) {
        agyPreview.innerHTML = '<div class="empty-state" style="padding:16px 8px;"><p>No Antigravity accounts configured</p></div>';
      } else {
        let totalFrac = 0;
        let count = 0;
        accs.forEach((a) => {
          (a.groups || []).forEach((g) => {
            (g.buckets || []).forEach((b) => {
              totalFrac += Number(b.remainingFraction || 0);
              count++;
            });
          });
          if ((a.groups || []).length === 0) {
            (a.families || []).forEach((f) => {
              totalFrac += Number(f.remaining || 0);
              count++;
            });
          }
        });
        const headroomPct = count > 0 ? Math.round((totalFrac / count) * 100) : 100;

        const donutHtml = renderDonutGauge(headroomPct, {
          size: 68,
          strokeWidth: 6,
          label: 'HEADROOM',
          color: headroomPct > 50 ? '#10b981' : headroomPct > 20 ? '#f59e0b' : '#ef4444',
        });

        agyPreview.innerHTML = `
          <div style="display:flex; align-items:center; gap:16px; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="flex-shrink:0;">${donutHtml}</div>
            <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
              <strong style="font-size:0.9rem; color:var(--text);">${accs.length} OmniRoute Accounts</strong>
              <span style="font-size:0.75rem; color:var(--text-muted);">${count} Active Quota Pools</span>
              <span class="status-chip status-running" style="align-self:flex-start; margin-top:2px; font-size:0.65rem;">QUOTA READY</span>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${accs
              .slice(0, 2)
              .map(
                (a) => `
              <div class="home-c-row">
                <div style="display:flex;align-items:center;gap:8px;overflow:hidden;">
                  <span class="status-dot status-green"></span>
                  <strong style="font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.account_id)}</strong>
                </div>
                <span class="c-pill" style="flex-shrink:0;">${(a.groups || []).length || (a.families || []).length} pools</span>
              </div>
            `
              )
              .join('')}
          </div>
        `;
      }
    }
  } catch (err) {
    console.warn('Home agy fetch error', err);
  }

  // 6. Fetch Network Preview
  try {
    const [tailData, portsData] = await Promise.allSettled([
      fetchTailscaleStatus(),
      fetchListeningPorts(),
    ]);

    const netPill = container.querySelector('#homeNetPill') as HTMLElement;
    const netPreview = container.querySelector('#homeNetPreview') as HTMLElement;

    if (netPreview) {
      const isTailOk = tailData.status === 'fulfilled' && tailData.value.installed && tailData.value.backend_state === 'Running';
      const peerCount = isTailOk ? tailData.value.peer_count : 0;
      const portCount = portsData.status === 'fulfilled' ? portsData.value.count : 0;
      const directCount = isTailOk ? tailData.value.peers.filter((p) => p.is_direct).length : 0;

      if (netPill) {
        netPill.textContent = `${peerCount} Peers · ${portCount} Sockets`;
      }

      netPreview.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div class="home-c-row">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="status-dot ${isTailOk ? 'status-green' : 'status-gray'}"></span>
              <strong>Tailscale WireGuard Mesh</strong>
            </div>
            <span class="badge ${isTailOk ? 'badge-success' : 'badge-error'}">${isTailOk ? `${directCount} Direct / ${peerCount} Peers` : 'Inactive'}</span>
          </div>
          <div class="home-c-row">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="status-dot status-green"></span>
              <strong>Open Listening Sockets</strong>
            </div>
            <span class="badge badge-info">${portCount} Ports Audited</span>
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.warn('Home net fetch error', err);
  }

  // 7. Fetch Journal & Kernel Preview
  try {
    const kernelData = await fetchKernelHealth();
    const journalPill = container.querySelector('#homeJournalPill') as HTMLElement;
    const journalPreview = container.querySelector('#homeJournalPreview') as HTMLElement;

    if (journalPreview) {
      const oomCount = kernelData.oom_kill_count || 0;
      const memPsi = kernelData.memory_pressure?.some?.avg10 || 0;
      const cpuPsi = kernelData.cpu_pressure?.some?.avg10 || 0;

      if (journalPill) {
        journalPill.textContent = oomCount > 0 ? `⚠️ ${oomCount} OOM` : 'Healthy';
        journalPill.className = oomCount > 0 ? 'pill pill-error' : 'pill pill-live';
      }

      journalPreview.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div class="home-c-row">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="status-dot ${oomCount === 0 ? 'status-green' : 'status-red'}"></span>
              <strong>Kernel OOM Killer</strong>
            </div>
            <span class="badge ${oomCount === 0 ? 'badge-success' : 'badge-error'}">${oomCount} Kills</span>
          </div>
          <div class="home-c-row">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="status-dot status-green"></span>
              <strong>Memory PSI Stall</strong>
            </div>
            <span class="badge badge-info">${memPsi.toFixed(2)}% avg10</span>
          </div>
          <div class="home-c-row">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="status-dot status-green"></span>
              <strong>CPU PSI Stall</strong>
            </div>
            <span class="badge badge-info">${cpuPsi.toFixed(2)}% avg10</span>
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.warn('Home journal fetch error', err);
  }

  // 8. Fetch Maintenance Preview
  try {
    const maintData = await fetchMaintenanceDf();
    const maintPill = container.querySelector('#homeMaintPill') as HTMLElement;
    const maintPreview = container.querySelector('#homeMaintPreview') as HTMLElement;

    if (maintPreview) {
      const disk = maintData.disk_root;
      if (maintPill) {
        maintPill.textContent = `${formatBytes(disk.free_bytes)} Free`;
      }

      maintPreview.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div class="home-c-row">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="status-dot status-green"></span>
              <strong>Host Root Partition</strong>
            </div>
            <span class="badge badge-info">${disk.used_percent}% used (${formatBytes(disk.free_bytes)} free)</span>
          </div>
          <div class="home-c-row">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="status-dot status-green"></span>
              <strong>Docker Storage</strong>
            </div>
            <span class="badge badge-success">${maintData.docker.length} tracked types</span>
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.warn('Home maint fetch error', err);
  }
}
