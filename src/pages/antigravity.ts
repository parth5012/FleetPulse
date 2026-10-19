/**
 * Visual Antigravity Quota Dashboard.
 * Real-time 5-hour and weekly LLM quota pools across OmniRoute accounts.
 * Features vector donut gauges, stacked account comparison charts,
 * radial bucket meters, countdown reset dials, and mobile-first layouts.
 */

import { fetchLimits, syncOmniRoute } from '../lib/api';
import { esc, formatTimeRemaining } from '../lib/format';
import { renderDonutGauge, renderStackedBar, StackedSegment } from '../lib/charts';
import type { AccountSnapshot, QuotaBucket, QuotaGroup } from '../lib/api';

function getBucketStatus(bucket: QuotaBucket): {
  pct: number;
  statusClass: string;
  statusText: string;
  color: string;
} {
  const fraction = Math.max(0, Math.min(1, Number(bucket.remainingFraction || 0)));
  const pct = Math.round(fraction * 100);
  let statusClass = 'ok';
  let statusText = `${pct}%`;
  let color = '#10b981';

  if (bucket.disabled) {
    statusClass = 'med';
    statusText = 'Capped';
    color = '#f59e0b';
  } else if (pct === 0 || fraction < 0.05) {
    statusClass = 'low';
    statusText = '0% Exhausted';
    color = '#ef4444';
  } else if (pct < 45) {
    statusClass = 'med';
    statusText = `${pct}% Low`;
    color = '#f59e0b';
  } else {
    color = '#10b981';
  }

  return { pct, statusClass, statusText, color };
}

function renderBucket(bucket: QuotaBucket): string {
  const { pct, statusClass, statusText, color } = getBucketStatus(bucket);
  const resetStr = bucket.resetTime ? formatTimeRemaining(bucket.resetTime) : '';
  const fillWidth = bucket.disabled ? 100 : pct;

  // Mini donut gauge for the bucket
  const miniGauge = renderDonutGauge(fillWidth, {
    size: 58,
    strokeWidth: 6,
    color,
    trackColor: 'var(--bar-bg)',
  });

  return `
    <div class="visual-bucket-card">
      <div class="visual-bucket-left">
        ${miniGauge}
      </div>

      <div class="visual-bucket-body">
        <div class="bucket-top-row">
          <div class="bucket-title-wrap">
            <strong class="bucket-display-name">${esc(bucket.displayName || bucket.bucketId)}</strong>
            ${bucket.window ? `<span class="window-pill window-${bucket.window}">${esc(bucket.window.toUpperCase())}</span>` : ''}
          </div>
          <span class="pct-badge pct-${statusClass}">${statusText}</span>
        </div>

        <!-- Gradient Progress Bar -->
        <div class="bucket-bar-track">
          <div class="bucket-bar-fill bar-${statusClass}" style="width: ${fillWidth}%;"></div>
        </div>

        <div class="bucket-sub-row">
          <span class="bucket-desc-text">${esc(bucket.description || 'Standard rate pool')}</span>
          ${resetStr ? `<span class="reset-badge">⏳ ${esc(resetStr)}</span>` : '<span class="reset-badge text-muted">Ready</span>'}
        </div>
      </div>
    </div>
  `;
}

function renderGroup(group: QuotaGroup): string {
  const isGemini = /gemini/i.test(group.displayName || '');
  const icon = isGemini ? '⚡' : '🧠';
  const bucketsHtml = (group.buckets || []).map(renderBucket).join('');

  return `
    <div class="quota-group-card">
      <div class="quota-group-header">
        <div class="quota-group-title">
          <span class="group-icon">${icon}</span>
          <div>
            <h3>${esc(group.displayName)}</h3>
            ${group.description ? `<p class="group-desc">${esc(group.description)}</p>` : ''}
          </div>
        </div>
      </div>
      <div class="quota-buckets-grid">
        ${bucketsHtml}
      </div>
    </div>
  `;
}

function computeAccountHealth(acc: AccountSnapshot): number {
  const fractions: number[] = [];
  (acc.groups || []).forEach((g) => {
    (g.buckets || []).forEach((b) => {
      fractions.push(Number(b.remainingFraction || 0));
    });
  });
  if (fractions.length === 0) {
    (acc.families || []).forEach((f) => fractions.push(Number(f.remaining || 0)));
  }
  if (fractions.length === 0) return 100;
  const avg = fractions.reduce((a, b) => a + b, 0) / fractions.length;
  return Math.round(avg * 100);
}

function renderAccount(acc: AccountSnapshot): string {
  const initial = (acc.account_id || '?')[0].toUpperCase();
  const healthPct = computeAccountHealth(acc);

  let groupsHtml = '';
  if (acc.groups && acc.groups.length > 0) {
    groupsHtml = acc.groups.map(renderGroup).join('');
  } else if (acc.families && acc.families.length > 0) {
    const pseudoGroups = [
      {
        displayName: 'Gemini Models',
        buckets: acc.families
          .filter((f) => f.family === 'gemini')
          .map((f) => ({
            displayName: `${f.window.toUpperCase()} Limit`,
            window: f.window,
            remainingFraction: f.remaining,
            resetTime: f.resetTime,
            description: f.models ? `Models: ${f.models.slice(0, 3).join(', ')}` : '',
          })),
      },
      {
        displayName: 'Claude & OpenAI 3P Models',
        buckets: acc.families
          .filter((f) => f.family === 'claude' || f.family === 'openai')
          .map((f) => ({
            displayName: `${f.family.toUpperCase()} (${f.window})`,
            window: f.window,
            remainingFraction: f.remaining,
            resetTime: f.resetTime,
            description: f.models ? `Models: ${f.models.slice(0, 3).join(', ')}` : '',
          })),
      },
    ].filter((g) => g.buckets.length > 0);
    groupsHtml = pseudoGroups.map(renderGroup).join('');
  } else if (acc.error) {
    groupsHtml = `<div class="error-banner">⚠️ ${esc(acc.error)}</div>`;
  } else {
    groupsHtml = `<div class="empty-state"><p>No quota pools reported for this account.</p></div>`;
  }

  const modelsCount = (acc.models || []).length;
  const modelsHtml =
    modelsCount > 0
      ? `
      <details class="models-expander">
        <summary>🤖 View Configured Models (${modelsCount})</summary>
        <div class="model-chips">
          ${acc.models!.map((m) => `<span class="model-chip">${esc(m.model)}</span>`).join('')}
        </div>
      </details>
    `
      : '';

  // Header mini-donut for account health
  const healthDonut = renderDonutGauge(healthPct, {
    size: 64,
    strokeWidth: 6,
    label: 'Quota',
    color: healthPct > 50 ? '#10b981' : healthPct > 20 ? '#f59e0b' : '#ef4444',
  });

  return `
    <div class="account-card">
      <div class="account-header">
        <div class="account-title-wrap">
          <div class="account-avatar">${initial}</div>
          <div class="account-meta">
            <strong class="account-name">${esc(acc.account_id)}</strong>
            <span class="account-sub">OmniRoute Managed OAuth</span>
          </div>
        </div>

        <div class="account-header-gauge">
          ${healthDonut}
        </div>
      </div>

      <div class="account-body">
        ${groupsHtml}
        ${modelsHtml}
      </div>
    </div>
  `;
}

export async function renderAntigravity(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="antigravity-page">
      <!-- Page Header -->
      <header class="page-header">
        <div class="header-titles">
          <div class="page-badge">🔮 OMNIROUTE QUOTA ENGINE</div>
          <h1 class="page-title">Antigravity Quota Dashboard</h1>
          <p class="page-subtitle">Real-time 5-hour and weekly LLM token pools with visual gauges and reset countdowns.</p>
        </div>
        <div class="header-actions">
          <span id="livePill" class="pill pill-live">Checking...</span>
          <button id="refreshBtn" class="btn btn-primary"><span id="refreshIcon">🔄</span> Refresh</button>
          <button id="syncBtn" class="btn btn-secondary">⚡ Sync OmniRoute</button>
        </div>
      </header>

      <!-- Visual Donut Gauges Ribbon (Mobile & Desktop Optimized) -->
      <div class="quota-visual-ribbon" id="quotaVisualRibbon">
        <div class="gauge-card">
          <div class="gauge-card-content" id="gaugeTotalWrap">
            <div class="spin">⚡</div>
          </div>
          <div class="gauge-card-footer">
            <strong>TOTAL HEADROOM</strong>
            <span>All accounts combined</span>
          </div>
        </div>

        <div class="gauge-card">
          <div class="gauge-card-content" id="gaugeGeminiWrap">
            <div class="spin">⚡</div>
          </div>
          <div class="gauge-card-footer">
            <strong>GEMINI FLEET</strong>
            <span>Flash & Pro 5h / Weekly</span>
          </div>
        </div>

        <div class="gauge-card">
          <div class="gauge-card-content" id="gaugeClaudeWrap">
            <div class="spin">⚡</div>
          </div>
          <div class="gauge-card-footer">
            <strong>CLAUDE & 3P POOL</strong>
            <span>Opus, Sonnet, GPT-OSS</span>
          </div>
        </div>

        <div class="gauge-card">
          <div class="gauge-card-content" id="gaugeAccountsWrap">
            <div class="spin">⚡</div>
          </div>
          <div class="gauge-card-footer">
            <strong>ACTIVE ACCOUNTS</strong>
            <span id="statPollTime">Real-time</span>
          </div>
        </div>
      </div>

      <!-- Cross-Account Quota Headroom Distribution Bar -->
      <div class="quota-stack-section" id="quotaStackSection" style="display:none;">
        <div class="card" style="padding:16px;">
          <div id="quotaStackChart"></div>
        </div>
      </div>

      <!-- Accounts List -->
      <div id="accountsList" style="margin-top:20px;">
        <div class="loading-state"><div class="spin">⚡</div><p>Querying OmniRoute token vaults...</p></div>
      </div>
    </div>
  `;

  const livePill = container.querySelector('#livePill') as HTMLElement;
  const refreshIcon = container.querySelector('#refreshIcon') as HTMLElement;
  const accountsList = container.querySelector('#accountsList') as HTMLElement;

  async function loadData(refresh = false): Promise<void> {
    refreshIcon.classList.add('spin');
    livePill.textContent = refresh ? 'Fetching Fresh...' : 'Loading...';

    try {
      const data = await fetchLimits(refresh);
      refreshIcon.classList.remove('spin');
      const accs = data.accounts || [];

      // Calculate aggregated metrics
      let totalBuckets = 0;
      let totalFractionSum = 0;

      let geminiBuckets = 0;
      let geminiFractionSum = 0;

      let claudeBuckets = 0;
      let claudeFractionSum = 0;

      const accountSegments: StackedSegment[] = [];
      const colors = ['#38bdf8', '#818cf8', '#34d399', '#f59e0b', '#ec4899'];

      accs.forEach((a, idx) => {
        let accFraction = 0;
        let accCount = 0;

        (a.groups || []).forEach((g) => {
          const isGem = /gemini/i.test(g.displayName || '');
          const is3P = /claude|gpt|3p/i.test(g.displayName || '');

          (g.buckets || []).forEach((b) => {
            const frac = Number(b.remainingFraction || 0);
            totalFractionSum += frac;
            totalBuckets++;
            accFraction += frac;
            accCount++;

            if (isGem) {
              geminiFractionSum += frac;
              geminiBuckets++;
            }
            if (is3P) {
              claudeFractionSum += frac;
              claudeBuckets++;
            }
          });
        });

        const avgScore = accCount > 0 ? Math.round((accFraction / accCount) * 100) : 100;
        const shortName = a.account_id.split('@')[0];
        accountSegments.push({
          label: shortName,
          value: avgScore,
          color: colors[idx % colors.length],
          displayValue: `${avgScore}%`,
        });
      });

      const overallPct = totalBuckets > 0 ? Math.round((totalFractionSum / totalBuckets) * 100) : 100;
      const geminiPct = geminiBuckets > 0 ? Math.round((geminiFractionSum / geminiBuckets) * 100) : 100;
      const claudePct = claudeBuckets > 0 ? Math.round((claudeFractionSum / claudeBuckets) * 100) : 0;

      // Render Visual Donut Gauges in Ribbon
      const totalWrap = container.querySelector('#gaugeTotalWrap');
      if (totalWrap) {
        totalWrap.innerHTML = renderDonutGauge(overallPct, {
          size: 100,
          strokeWidth: 8,
          label: 'Overall',
          color: overallPct > 50 ? '#10b981' : overallPct > 20 ? '#f59e0b' : '#ef4444',
        });
      }

      const geminiWrap = container.querySelector('#gaugeGeminiWrap');
      if (geminiWrap) {
        geminiWrap.innerHTML = renderDonutGauge(geminiPct, {
          size: 100,
          strokeWidth: 8,
          label: 'Gemini',
          color: '#38bdf8',
        });
      }

      const claudeWrap = container.querySelector('#gaugeClaudeWrap');
      if (claudeWrap) {
        claudeWrap.innerHTML = renderDonutGauge(claudePct, {
          size: 100,
          strokeWidth: 8,
          label: '3P / Claude',
          color: claudePct > 50 ? '#818cf8' : claudePct > 20 ? '#f59e0b' : '#ef4444',
        });
      }

      const accsWrap = container.querySelector('#gaugeAccountsWrap');
      if (accsWrap) {
        accsWrap.innerHTML = `
          <div style="font-size:2.2rem; font-weight:800; color:var(--text); font-family:var(--font-mono); line-height:1;">
            ${accs.length}
          </div>
          <span class="status-chip status-running" style="margin-top:6px;">CONNECTED</span>
        `;
      }

      const pollTimeEl = container.querySelector('#statPollTime');
      if (pollTimeEl) {
        pollTimeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      // Render Cross-Account Distribution Bar
      const stackSection = container.querySelector('#quotaStackSection') as HTMLElement;
      const stackChart = container.querySelector('#quotaStackChart') as HTMLElement;
      if (stackSection && stackChart && accountSegments.length > 1) {
        stackSection.style.display = 'block';
        stackChart.innerHTML = renderStackedBar(accountSegments, {
          height: 12,
          title: 'Account Quota Headroom Distribution',
          showLegend: true,
        });
      }

      livePill.textContent = `${accs.length} Accounts Active`;
      livePill.className = 'pill pill-live';

      if (accs.length === 0) {
        const errMsg = data.error || 'No accounts found in OmniRoute local database.';
        accountsList.innerHTML = `
          <div class="empty-state">
            <p><strong>${esc(errMsg)}</strong></p>
          </div>
        `;
      } else {
        accountsList.innerHTML = accs.map(renderAccount).join('');
      }
    } catch (err) {
      refreshIcon.classList.remove('spin');
      livePill.textContent = 'Fetch Error';
      livePill.className = 'pill';
      console.error('Antigravity fetch error:', err);
    }
  }

  container.querySelector('#refreshBtn')?.addEventListener('click', () => loadData(true));
  container.querySelector('#syncBtn')?.addEventListener('click', async () => {
    const syncBtn = container.querySelector('#syncBtn') as HTMLButtonElement;
    syncBtn.textContent = 'Syncing...';
    try {
      await syncOmniRoute();
      syncBtn.textContent = '✅ Synced';
      setTimeout(() => {
        syncBtn.textContent = '⚡ Sync OmniRoute';
      }, 2500);
      loadData(true);
    } catch {
      syncBtn.textContent = '❌ Sync Failed';
      setTimeout(() => {
        syncBtn.textContent = '⚡ Sync OmniRoute';
      }, 2500);
    }
  });

  loadData(false);
}
