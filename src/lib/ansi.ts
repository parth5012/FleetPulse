/**
 * ANSI Escape Code Parser & Sanitizer for Dozzel-style live log viewer.
 * Converts terminal escape sequences into clean, safe, styled HTML spans.
 */

import { esc } from './format';

const ANSI_COLORS: Record<string, string> = {
  // Standard Foreground
  '30': '#4b5563', // black / dark gray
  '31': '#f87171', // red
  '32': '#34d399', // green
  '33': '#fbbf24', // yellow
  '34': '#60a5fa', // blue
  '35': '#c084fc', // magenta / purple
  '36': '#22d3ee', // cyan
  '37': '#f3f4f6', // white

  // Bright Foreground
  '90': '#9ca3af', // bright black / gray
  '91': '#ef4444', // bright red
  '92': '#10b981', // bright green
  '93': '#f59e0b', // bright yellow
  '94': '#3b82f6', // bright blue
  '95': '#a855f7', // bright magenta
  '96': '#06b6d4', // bright cyan
  '97': '#ffffff', // bright white
};

export function ansiToHtml(raw: string): string {
  if (!raw) return '';

  // First HTML escape to neutralize injection attacks
  const escaped = esc(raw);

  // Match ANSI escape sequences: \u001b[...m or \x1b[...m
  const ansiRegex = /(?:\x1b|\u001b)\[([0-9;]*)m/g;

  let currentSpanOpen = false;
  let formatted = escaped.replace(ansiRegex, (_match, codeStr: string) => {
    if (!codeStr || codeStr === '0') {
      if (currentSpanOpen) {
        currentSpanOpen = false;
        return '</span>';
      }
      return '';
    }

    const codes = codeStr.split(';');
    const styles: string[] = [];

    for (const code of codes) {
      if (ANSI_COLORS[code]) {
        styles.push(`color: ${ANSI_COLORS[code]}`);
      } else if (code === '1') {
        styles.push('font-weight: 700');
      } else if (code === '2') {
        styles.push('opacity: 0.7');
      } else if (code === '4') {
        styles.push('text-decoration: underline');
      }
    }

    let prefix = '';
    if (currentSpanOpen) {
      prefix = '</span>';
      currentSpanOpen = false;
    }

    if (styles.length > 0) {
      currentSpanOpen = true;
      return `${prefix}<span style="${styles.join('; ')}">`;
    }

    return prefix;
  });

  if (currentSpanOpen) {
    formatted += '</span>';
  }

  return formatted;
}

export function formatLogLevelBadge(level: string): string {
  const norm = (level || 'info').toLowerCase();
  let badgeClass = 'badge-info';
  let label = norm.toUpperCase();

  if (norm.includes('err') || norm.includes('fatal')) {
    badgeClass = 'badge-error';
    label = 'ERROR';
  } else if (norm.includes('warn')) {
    badgeClass = 'badge-warn';
    label = 'WARN';
  } else if (norm.includes('debug') || norm.includes('trace')) {
    badgeClass = 'badge-debug';
    label = 'DEBUG';
  } else if (norm.includes('info')) {
    badgeClass = 'badge-info';
    label = 'INFO';
  }

  return `<span class="log-badge ${badgeClass}">${label}</span>`;
}
