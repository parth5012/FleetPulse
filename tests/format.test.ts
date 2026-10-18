import { describe, it, expect } from 'vitest';
import { esc, formatTimeRemaining } from '../src/lib/format';

describe('format', () => {
  it('escapes html', () => {
    expect(esc('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
  });
  it('formatTimeRemaining handles empty', () => {
    expect(formatTimeRemaining(null)).toBe('');
    expect(formatTimeRemaining(undefined)).toBe('');
  });
  it('formatTimeRemaining ready when past', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(formatTimeRemaining(past)).toBe('Ready to reset');
  });
});
