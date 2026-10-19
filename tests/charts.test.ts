import { describe, it, expect } from 'vitest';
import { renderSparkline, renderDonutGauge, renderBarGauge } from '../src/lib/charts';

describe('charts', () => {
  it('renderSparkline generates valid SVG with path', () => {
    const svg = renderSparkline([10, 25, 40, 30, 80, 65], { width: 120, height: 32 });
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('<path');
    expect(svg).toContain('width="120"');
  });

  it('renderSparkline handles empty or single value gracefully', () => {
    const svgEmpty = renderSparkline([]);
    expect(svgEmpty).toContain('<svg');
    const svgSingle = renderSparkline([50]);
    expect(svgSingle).toContain('<svg');
  });

  it('renderDonutGauge generates circular SVG with percent', () => {
    const svg = renderDonutGauge(75, { label: 'CPU' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('75%');
    expect(svg).toContain('CPU');
  });

  it('renderBarGauge generates bar container', () => {
    const html = renderBarGauge(45, 'Core 0', '45%');
    expect(html).toContain('Core 0');
    expect(html).toContain('45%');
    expect(html).toContain('width: 45%');
  });
});
