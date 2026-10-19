import { describe, it, expect } from 'vitest';
import { ansiToHtml, formatLogLevelBadge } from '../src/lib/ansi';

describe('ansi', () => {
  it('escapes html tags properly', () => {
    const raw = '<script>alert(1)</script>';
    const html = ansiToHtml(raw);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('converts ANSI color sequences to styled spans', () => {
    const raw = '\x1b[32mSUCCESS\x1b[0m: container ready';
    const html = ansiToHtml(raw);
    expect(html).toContain('<span');
    expect(html).toContain('SUCCESS');
    expect(html).toContain('container ready');
  });

  it('formats log level badges', () => {
    expect(formatLogLevelBadge('error')).toContain('badge-error');
    expect(formatLogLevelBadge('warn')).toContain('badge-warn');
    expect(formatLogLevelBadge('info')).toContain('badge-info');
  });
});
