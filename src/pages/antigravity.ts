/**
 * Visual Antigravity Quota Dashboard.
 * Real-time 5-hour and weekly LLM quota pools across OmniRoute accounts.
 * Features vector donut gauges, stacked account comparison charts,
 * radial bucket meters, countdown reset dials, and mobile-first layouts.
 */

import { fetchLimits, fetchQoderLimits, syncOmniRoute } from '../lib/api';
import { esc, formatTimeRemaining } from '../lib/format';
import { renderDonutGauge, renderStackedBar, StackedSegment } from '../lib/charts';
import type {
  AccountSnapshot,
  QuotaBucket,
  QuotaGroup,
  QoderAccountSnapshot,
  QoderQuotaAmount,
  QoderSharedPool,
  QoderResourcePackage,
} from '../lib/api';

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
  let color = '#059669';

  if (bucket.disabled) {
    statusClass = 'med';
    statusText = 'Capped';
    color = '#d97706';
  } else if (pct === 0 || fraction < 0.05) {
    statusClass = 'low';
    statusText = '0% Exhausted';
    color = '#dc2626';
  } else if (pct < 45) {
    statusClass = 'med';
    statusText = `${pct}% Low`;
    color = '#d97706';
  } else {
    color = '#059669';
  }

  return { pct, statusClass, statusText, color };
}

function renderBucket(bucket: QuotaBucket): string {
  const { pct, statusClass, statusText, color } = getBucketStatus(bucket);
  const resetStr = bucket.resetTime ? formatTimeRemaining(bucket.resetTime) : '';
  const fillWidth = bucket.disabled ? 100 : pct;

  // Mini donut gauge for the bucket
  const isMobile = window.innerWidth <= 640;
  const miniGauge = renderDonutGauge(fillWidth, {
    size: isMobile ? 48 : 56,
    strokeWidth: isMobile ? 5 : 6,
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
  const isMobile = window.innerWidth <= 640;
  const healthDonut = renderDonutGauge(healthPct, {
    size: isMobile ? 52 : 64,
    strokeWidth: isMobile ? 5 : 6,
    label: 'Quota',
    color: healthPct > 50 ? '#059669' : healthPct > 20 ? '#d97706' : '#dc2626',
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

// ---------------------------------------------------------------------------
// Qoder CLI Account Quota (dt- device token, /api/v2/quota/usage)
// ---------------------------------------------------------------------------
function safeUrl(url: string | undefined | null): string {
  const value = (url || '').trim();
  return /^https:\/\//i.test(value) ? value : '';
}

function qoderStatusColor(fraction: number): { statusClass: string; statusText: string; color: string } {
  const pct = Math.round(fraction * 100);
  if (fraction <= 0.001) {
    return { statusClass: 'low', statusText: '0% Exhausted', color: '#dc2626' };
  }
  if (pct < 20) {
    return { statusClass: 'med', statusText: `${pct}% Low`, color: '#d97706' };
  }
  return { statusClass: 'ok', statusText: `${pct}%`, color: '#059669' };
}

function renderQoderAmountBar(title: string, amount: QoderQuotaAmount, poolLabel: string): string {
  const total = Number(amount.total || 0);
  const used = Number(amount.used || 0);
  const fraction = total > 0 ? Math.max(0, Math.min(1, (total - used) / total)) : 0;
  const { statusClass, statusText, color } = qoderStatusColor(fraction);
  const unit = esc(amount.unit || 'credits');
  return `
    <div class="visual-bucket-card">
      <div class="visual-bucket-left">
        ${renderDonutGauge(Math.round(fraction * 100), {
          size: window.innerWidth <= 640 ? 48 : 56,
          strokeWidth: window.innerWidth <= 640 ? 5 : 6,
          color,
          trackColor: 'var(--bar-bg)',
        })}
      </div>
      <div class="visual-bucket-body">
        <div class="bucket-top-row">
          <div class="bucket-title-wrap">
            <strong class="bucket-display-name">${esc(title)}</strong>
          </div>
          <span class="pct-badge pct-${statusClass}">${statusText}</span>
        </div>
        <div class="bucket-bar-track">
          <div class="bucket-bar-fill bar-${statusClass}" style="width: ${Math.round(fraction * 100)}%;"></div>
        </div>
        <div class="bucket-sub-row">
          <span class="bucket-desc-text">${used.toLocaleString()} / ${total.toLocaleString()} ${unit} ${esc(poolLabel)}</span>
          ${safeUrl(amount.detailUrl) ? `<a class="reset-badge" href="${esc(safeUrl(amount.detailUrl))}" target="_blank" rel="noopener">Details ↗</a>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderQoderPoolBar(title: string, pool: QoderSharedPool): string {
  const cap = Number(pool.cap || 0);
  const used = Number(pool.used || 0);
  const fraction = cap > 0 ? Math.max(0, Math.min(1, (cap - used) / cap)) : 0;
  const { statusClass, statusText, color } = qoderStatusColor(pool.available === false ? 0 : fraction);
  const unit = esc(pool.unit || 'credits');
  return `
    <div class="visual-bucket-card">
      <div class="visual-bucket-left">
        ${renderDonutGauge(Math.round(fraction * 100), {
          size: window.innerWidth <= 640 ? 48 : 56,
          strokeWidth: window.innerWidth <= 640 ? 5 : 6,
          color,
          trackColor: 'var(--bar-bg)',
        })}
      </div>
      <div class="visual-bucket-body">
        <div class="bucket-top-row">
          <div class="bucket-title-wrap">
            <strong class="bucket-display-name">${esc(title)}</strong>
          </div>
          <span class="pct-badge pct-${statusClass}">${statusText}</span>
        </div>
        <div class="bucket-bar-track">
          <div class="bucket-bar-fill bar-${statusClass}" style="width: ${Math.round(fraction * 100)}%;"></div>
        </div>
        <div class="bucket-sub-row">
          <span class="bucket-desc-text">${used.toLocaleString()} / ${cap.toLocaleString()} ${unit} used</span>
          ${pool.available === false ? '<span class="reset-badge text-muted">Unavailable</span>' : ''}
        </div>
      </div>
    </div>
  `;
}

function renderQoderPackage(pkg: QoderResourcePackage): string {
  const total = Number(pkg.total || 0);
  const used = Number(pkg.used || 0);
  const fraction = total > 0 ? Math.max(0, Math.min(1, (total - used) / total)) : 0;
  const { statusClass, statusText, color } = qoderStatusColor(fraction);
  const resetStr = pkg.expiresAt ? formatTimeRemaining(new Date(pkg.expiresAt).toISOString()) : '';
  return `
    <div class="visual-bucket-card">
      <div class="visual-bucket-left">
        ${renderDonutGauge(Math.round(fraction * 100), {
          size: window.innerWidth <= 640 ? 48 : 56,
          strokeWidth: window.innerWidth <= 640 ? 5 : 6,
          color,
          trackColor: 'var(--bar-bg)',
        })}
      </div>
      <div class="visual-bucket-body">
        <div class="bucket-top-row">
          <div class="bucket-title-wrap">
            <strong class="bucket-display-name">${esc(pkg.name || pkg.id)}</strong>
            ${pkg.status && pkg.status !== 'QUOTA_DETAIL_STATUS_UNSPECIFIED' ? `<span class="window-pill">${esc(pkg.status.replace('QUOTA_DETAIL_STATUS_', ''))}</span>` : ''}
          </div>
          <span class="pct-badge pct-${statusClass}">${statusText}</span>
        </div>
        <div class="bucket-bar-track">
          <div class="bucket-bar-fill bar-${statusClass}" style="width: ${Math.round(fraction * 100)}%;"></div>
        </div>
        <div class="bucket-sub-row">
          <span class="bucket-desc-text">${used.toLocaleString()} / ${total.toLocaleString()} ${esc(pkg.unit || 'credits')}</span>
          ${resetStr ? `<span class="reset-badge">⏳ ${esc(resetStr)}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderQoderAccount(acc: QoderAccountSnapshot): string {
  const initial = (acc.account_id || '?')[0].toUpperCase();
  const plan = acc.userQuota;
  const total = Number(plan?.total || 0);
  const used = Number(plan?.used || 0);
  const healthPct = total > 0 ? Math.round(Math.max(0, Math.min(1, (total - used) / total)) * 100) : 100;
  const isMobile = window.innerWidth <= 640;

  const healthDonut = renderDonutGauge(healthPct, {
    size: isMobile ? 52 : 64,
    strokeWidth: isMobile ? 5 : 6,
    label: 'Quota',
    color: healthPct > 50 ? '#059669' : healthPct > 20 ? '#d97706' : '#dc2626',
  });

  const trialStr = acc.expiresAt
    ? formatTimeRemaining(new Date(acc.expiresAt).toISOString())
    : '';

  let bodyHtml = '';
  if (acc.error) {
    bodyHtml = `<div class="error-banner">⚠️ ${esc(acc.error)}</div>`;
  } else {
    const sections: string[] = [];
    if (plan) sections.push(renderQoderAmountBar('Plan Credits', plan, 'used'));
    if (acc.addOnQuota) sections.push(renderQoderAmountBar('Add-On Credits', acc.addOnQuota, 'used'));
    if (acc.sharedQuota) sections.push(renderQoderPoolBar('Shared Org Pool', acc.sharedQuota));
    (acc.packages || []).forEach((pkg) => sections.push(renderQoderPackage(pkg)));
    if (acc.isQuotaExceeded) {
      sections.push('<div class="error-banner">⚠️ Plan quota exhausted — upgrade required.</div>');
    }
    bodyHtml = sections.length > 0
      ? sections.join('')
      : '<div class="empty-state"><p>No quota pools reported for this account.</p></div>';
  }

  return `
    <div class="account-card">
      <div class="account-header">
        <div class="account-title-wrap">
          <div class="account-avatar">${initial}</div>
          <div class="account-meta">
            <strong class="account-name">${esc(acc.account_id)}</strong>
            <span class="account-sub">Qoder CLI · ${esc(acc.userType || 'account')}${trialStr ? ` · trial: ${esc(trialStr)}` : ''}</span>
          </div>
        </div>
        <div class="account-header-gauge">
          ${healthDonut}
        </div>
      </div>
      <div class="account-body">
        ${bodyHtml}
        ${safeUrl(acc.upgradeUrl) ? `<a class="model-chip" href="${esc(safeUrl(acc.upgradeUrl))}" target="_blank" rel="noopener">⬆ Upgrade plan</a>` : ''}
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

      <!-- Qoder CLI Accounts -->
      <div id="qoderSection" style="display:none;">
        <div class="page-badge" style="margin:28px 4px 12px;">⌨️ QODER CLI ACCOUNTS</div>
        <div id="qoderList"></div>
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
      const colors = ['#059669', '#7c3aed', '#d97706', '#0891b2', '#db2777'];

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

        if (accCount === 0 && a.families && a.families.length > 0) {
          a.families.forEach((f) => {
            const frac = Number(f.remaining || 0);
            totalFractionSum += frac;
            totalBuckets++;
            accFraction += frac;
            accCount++;

            if (f.family === 'gemini') {
              geminiFractionSum += frac;
              geminiBuckets++;
            } else if (f.family === 'claude' || f.family === 'openai') {
              claudeFractionSum += frac;
              claudeBuckets++;
            }
          });
        }

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

      // Responsive gauge size: compact on mobile, expansive on desktop
      const isMobile = window.innerWidth <= 640;
      const ribbonGaugeSize = isMobile ? 76 : 100;
      const ribbonStrokeWidth = isMobile ? 7 : 8;

      // Render Visual Donut Gauges in Ribbon
      const totalWrap = container.querySelector('#gaugeTotalWrap');
      if (totalWrap) {
        totalWrap.innerHTML = renderDonutGauge(overallPct, {
          size: ribbonGaugeSize,
          strokeWidth: ribbonStrokeWidth,
          label: 'Overall',
          color: overallPct > 50 ? '#059669' : overallPct > 20 ? '#d97706' : '#dc2626',
        });
      }

      const geminiWrap = container.querySelector('#gaugeGeminiWrap');
      if (geminiWrap) {
        geminiWrap.innerHTML = renderDonutGauge(geminiPct, {
          size: ribbonGaugeSize,
          strokeWidth: ribbonStrokeWidth,
          label: 'Gemini',
          color: '#059669',
        });
      }

      const claudeWrap = container.querySelector('#gaugeClaudeWrap');
      if (claudeWrap) {
        claudeWrap.innerHTML = renderDonutGauge(claudePct, {
          size: ribbonGaugeSize,
          strokeWidth: ribbonStrokeWidth,
          label: '3P / Claude',
          color: claudePct > 50 ? '#7c3aed' : claudePct > 20 ? '#d97706' : '#dc2626',
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

    loadQoderData(refresh);
  }

  const qoderSection = container.querySelector('#qoderSection') as HTMLElement;
  const qoderList = container.querySelector('#qoderList') as HTMLElement;

  async function loadQoderData(refresh: boolean): Promise<void> {
    try {
      const qoder = await fetchQoderLimits(refresh);
      const accounts = qoder.accounts || [];
      if (accounts.length === 0) {
        // No accounts configured — keep the section hidden
        qoderSection.style.display = 'none';
        return;
      }
      qoderSection.style.display = 'block';
      const errors = accounts.filter((a) => a.error).length;
      qoderList.innerHTML = accounts.map(renderQoderAccount).join('');
      if (errors > 0 && errors === accounts.length) {
        // All accounts failing usually means the captured CLI token went stale
        const hint = document.createElement('div');
        hint.className = 'empty-state';
        hint.innerHTML = '<p>Tip: re-capture the Qoder CLI device token to refresh access.</p>';
        qoderList.appendChild(hint);
      }
    } catch (err) {
      console.error('Qoder fetch error:', err);
      qoderSection.style.display = 'none';
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
