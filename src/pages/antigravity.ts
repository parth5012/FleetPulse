import { fetchLimits, syncOmniRoute } from '../lib/api';
import { esc, formatTimeRemaining } from '../lib/format';
import type { AccountSnapshot, QuotaBucket, QuotaGroup } from '../lib/api';

function renderBucket(bucket: QuotaBucket): string {
  const fraction = Math.max(0, Math.min(1, Number(bucket.remainingFraction || 0)));
  const pct = Math.round(fraction * 100);
  let statusClass = 'ok';
  let statusText = `${pct}%`;
  if (bucket.disabled) {
    statusClass = 'med';
    statusText = '100% (Weekly Capped)';
  } else if (pct === 0 || fraction < 0.05) {
    statusClass = 'low';
    statusText = '0% EXHAUSTED';
  } else if (pct < 40) {
    statusClass = 'med';
  }
  const resetStr = bucket.resetTime ? formatTimeRemaining(bucket.resetTime) : '';
  const width = bucket.disabled ? 100 : pct;
  return `
    <div class="bucket-row">
      <div class="bucket-top">
        <div class="bucket-name">
          <span>${esc(bucket.displayName || bucket.bucketId)}</span>
          ${bucket.window ? `<span class="window-tag">${esc(bucket.window)}</span>` : ''}
        </div>
        <div class="bucket-status">
          <span class="pct-tag pct-${statusClass}">${statusText}</span>
        </div>
      </div>
      <div class="bar-outer">
        <div class="bar-inner bar-${statusClass}" style="width: ${width}%;"></div>
      </div>
      <div class="bucket-info">
        <span>${esc(bucket.description || '')}</span>
        ${resetStr ? `<span class="reset-clock">⏳ ${esc(resetStr)}</span>` : ''}
      </div>
    </div>
  `;
}

function renderGroup(group: QuotaGroup): string {
  const isGemini = /gemini/i.test(group.displayName || '');
  const icon = isGemini ? '⚡' : '🧠';
  const bucketsHtml = (group.buckets || []).map(renderBucket).join('');
  return `
    <div class="group-section">
      <div class="group-header">
        <div>
          <div class="group-title">${icon} ${esc(group.displayName)}</div>
          ${group.description ? `<div class="group-desc">${esc(group.description)}</div>` : ''}
        </div>
      </div>
      ${bucketsHtml}
    </div>
  `;
}

function renderAccount(acc: AccountSnapshot): string {
  const initial = (acc.account_id || '?')[0].toUpperCase();
  let groupsHtml = '';
  if (acc.groups && acc.groups.length > 0) {
    groupsHtml = acc.groups.map(renderGroup).join('');
  } else if (acc.families && acc.families.length > 0) {
    const pseudoGroups = [
      {
        displayName: 'Gemini Models',
        buckets: acc.families.filter((f) => f.family === 'gemini').map((f) => ({
          displayName: `${f.window.toUpperCase()} Limit`,
          window: f.window,
          remainingFraction: f.remaining,
          resetTime: f.resetTime,
          description: f.models ? `Applies to: ${f.models.slice(0, 4).join(', ')}` : '',
        })),
      },
      {
        displayName: 'Claude & 3P Models',
        buckets: acc.families.filter((f) => f.family === 'claude' || f.family === 'openai').map((f) => ({
          displayName: `${f.family.toUpperCase()} ${f.window.toUpperCase()}`,
          window: f.window,
          remainingFraction: f.remaining,
          resetTime: f.resetTime,
          description: f.models ? `Applies to: ${f.models.slice(0, 4).join(', ')}` : '',
        })),
      },
    ].filter((g) => g.buckets.length > 0);
    groupsHtml = pseudoGroups.map(renderGroup).join('');
  } else if (acc.error) {
    groupsHtml = `<div class="bucket-info" style="color:var(--danger);font-weight:600;">Error: ${esc(acc.error)}</div>`;
  } else {
    groupsHtml = `<div class="bucket-info">No quota buckets reported for this account.</div>`;
  }
  const modelsHtml = acc.models && acc.models.length > 0
    ? `<details class="models-expander"><summary>View Available Models (${acc.models.length})</summary><div class="model-chips">${acc.models.map((m) => `<span class="model-chip">${esc(m.model)}</span>`).join('')}</div></details>`
    : '';
  return `
    <div class="account-card">
      <div class="account-header">
        <div class="account-title">
          <div class="account-avatar">${initial}</div>
          <div>
            <div>${esc(acc.account_id)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);font-weight:normal;">OmniRoute Managed OAuth</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          ${acc.error ? `<span class="pct-tag pct-low">Connection Error</span>` : `<span class="pct-tag pct-ok">Active</span>`}
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
    <header style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--card-border);">
      <div>
        <h1>⚡ Antigravity Quota Dashboard</h1>
        <p class="muted" style="font-size:.88rem;margin-top:4px;">Antigravity Limits: Live 5-hour and weekly quota pools across OmniRoute accounts</p>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span id="livePill" class="pill pill-live">Checking...</span>
        <button id="refreshBtn" class="btn btn-primary"><span id="refreshIcon">🔄</span> Refresh</button>
        <button id="syncBtn" class="btn">⚡ Sync OmniRoute</button>
      </div>
    </header>
    <div class="stats-grid" id="statsGrid">
      <div class="stat-card"><div class="label">Configured Accounts</div><div class="val" id="statAccounts">-</div><div class="sub">OmniRoute Local Vault</div></div>
      <div class="stat-card"><div class="label">Gemini Quota Status</div><div class="val" id="statGemini">-</div><div class="sub">Pro & Flash 5h / Weekly</div></div>
      <div class="stat-card"><div class="label">Claude & GPT 3P Status</div><div class="val" id="stat3p">-</div><div class="sub">Next reset tracking</div></div>
      <div class="stat-card"><div class="label">Last Upstream Poll</div><div class="val" id="statPoll">-</div><div class="sub" id="statCached">Real-time</div></div>
    </div>
    <div id="accountsList"><div class="empty-state"><p>Loading Antigravity accounts from OmniRoute...</p></div></div>
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
      (container.querySelector('#statAccounts') as HTMLElement).textContent = String(accs.length);

      let geminiMin = 1.0;
      let geminiMax = 0.0;
      let anyGemini = false;
      let nextReset: string | null = null;
      accs.forEach((a) => {
        (a.groups || []).forEach((g) => {
          if (/gemini/i.test(g.displayName || '')) {
            (g.buckets || []).forEach((b) => {
              anyGemini = true;
              const rem = Number(b.remainingFraction || 0);
              geminiMin = Math.min(geminiMin, rem);
              geminiMax = Math.max(geminiMax, rem);
            });
          } else if (/claude|gpt|3p/i.test(g.displayName || '')) {
            (g.buckets || []).forEach((b) => {
              if (b.resetTime && (!nextReset || new Date(b.resetTime) < new Date(nextReset))) {
                nextReset = b.resetTime;
              }
            });
          }
        });
      });
      (container.querySelector('#statGemini') as HTMLElement).textContent = anyGemini
        ? `${Math.round(geminiMin * 100)}% - ${Math.round(geminiMax * 100)}%`
        : 'Active';
      (container.querySelector('#stat3p') as HTMLElement).textContent = nextReset ? formatTimeRemaining(nextReset) : 'Tracking';
      (container.querySelector('#statPoll') as HTMLElement).textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      (container.querySelector('#statCached') as HTMLElement).textContent = data.cached ? 'From 3m Cache' : 'Live from Google';

      livePill.textContent = `${accs.length} Accounts Active`;
      livePill.className = 'pill pill-live';

      if (accs.length === 0) {
        const errMsg = data.error || 'No accounts found in OmniRoute.';
        accountsList.innerHTML = `<div class="empty-state"><p><strong>${esc(errMsg)}</strong></p><p style="font-size:.85rem;color:var(--text-muted);margin-top:8px;">On Vercel, set <code>ANTIGRAVITY_ACCOUNTS_JSON</code>. Local installations auto-discover from OmniRoute.</p></div>`;
      } else {
        accountsList.innerHTML = accs.map(renderAccount).join('');
      }
    } catch (err) {
      refreshIcon.classList.remove('spin');
      livePill.textContent = 'Fetch Error';
      livePill.className = 'pill';
      console.error(err);
    }
  }

  container.querySelector('#refreshBtn')?.addEventListener('click', () => loadData(true));
  container.querySelector('#syncBtn')?.addEventListener('click', async () => {
    const syncBtn = container.querySelector('#syncBtn') as HTMLButtonElement;
    syncBtn.textContent = 'Syncing...';
    try {
      await syncOmniRoute();
      syncBtn.textContent = '✅ Synced';
      setTimeout(() => { syncBtn.textContent = '⚡ Sync OmniRoute'; }, 2500);
    } catch {
      syncBtn.textContent = '❌ Sync Failed';
      setTimeout(() => { syncBtn.textContent = '⚡ Sync OmniRoute'; }, 2500);
    }
  });

  loadData(false);
  setInterval(() => loadData(false), 60000);
}
