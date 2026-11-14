/**
 * Glanceboard shared UI primitives.
 * Real loading / error / empty states, an in-app confirm dialog
 * (replaces the jarring native window.confirm in an installed PWA),
 * and freshness ("Updated 12s ago") helpers.
 */

import { esc } from './format';

// ---------------------------------------------------------------------------
// Async states
// ---------------------------------------------------------------------------

export function skeletonBlock(className = ''): string {
  return `<div class="gb-skeleton ${className}"></div>`;
}

/** Route-level skeleton used while a page chunk + its first fetch resolves. */
export function routeLoadingHtml(): string {
  return `
    <div class="gb-route-loading">
      ${skeletonBlock('gb-sk-title')}
      <div class="gb-vitals-grid gb-skel-grid">
        ${skeletonBlock('gb-sk-tile')}
        ${skeletonBlock('gb-sk-tile')}
        ${skeletonBlock('gb-sk-tile')}
        ${skeletonBlock('gb-sk-tile')}
      </div>
      ${skeletonBlock('gb-sk-block')}
      ${skeletonBlock('gb-sk-block gb-sk-block-sm')}
    </div>
  `;
}

export function errorStateHtml(message: string, retryId = ''): string {
  return `
    <div class="gb-state gb-state-error" ${retryId ? `data-retry="${retryId}"` : ''}>
      <p class="gb-state-title">Couldn't load this data</p>
      <p class="gb-state-sub">${esc(message)}</p>
      <button class="gb-btn gb-btn-secondary gb-retry-btn" ${retryId ? `data-retry="${retryId}"` : ''}>Try again</button>
    </div>
  `;
}

export function emptyStateHtml(title: string, sub = ''): string {
  return `
    <div class="gb-state gb-state-empty">
      <p class="gb-state-title">${esc(title)}</p>
      ${sub ? `<p class="gb-state-sub">${esc(sub)}</p>` : ''}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Time ago (freshness indicator)
// ---------------------------------------------------------------------------

export function timeAgoLabel(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 3) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

// ---------------------------------------------------------------------------
// In-app confirm dialog (destructive actions)
// ---------------------------------------------------------------------------

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'gb-dialog-backdrop';
    backdrop.innerHTML = `
      <div class="gb-dialog" role="alertdialog" aria-modal="true" aria-label="${esc(opts.title)}">
        <h2 class="gb-dialog-title">${esc(opts.title)}</h2>
        <p class="gb-dialog-msg">${esc(opts.message)}</p>
        <div class="gb-dialog-actions">
          <button class="gb-btn gb-btn-secondary" data-gb-dialog="cancel">Cancel</button>
          <button class="gb-btn ${opts.danger === false ? 'gb-btn-primary' : 'gb-btn-danger'}" data-gb-dialog="confirm">
            ${esc(opts.confirmLabel || 'Confirm')}
          </button>
        </div>
      </div>
    `;

    let settled = false;
    const done = (result: boolean) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(result);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(false);
    };

    backdrop.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = (target.closest('[data-gb-dialog]') as HTMLElement | null)?.dataset.gbDialog;
      if (action === 'confirm') done(true);
      else if (action === 'cancel' || target === backdrop) done(false);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(backdrop);
    (backdrop.querySelector('[data-gb-dialog="confirm"]') as HTMLElement)?.focus();
  });
}
