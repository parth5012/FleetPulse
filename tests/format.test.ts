import { describe, it, expect } from 'vitest';
import { esc, formatBytes, formatTimeRemaining, formatUptime } from '../src/lib/format';

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

  it('formatBytes converts bytes into human readable units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1048576 * 1.5)).toBe('1.5 MB');
    expect(formatBytes(1073741824 * 4)).toBe('4.0 GB');
  });

  it('formatUptime formats seconds into day/hr/min', () => {
    expect(formatUptime(45)).toBe('45s');
    expect(formatUptime(125)).toBe('2m 5s');
    expect(formatUptime(3665)).toBe('1h 1m');
    expect(formatUptime(90000)).toBe('1d 1h');
  });
});
