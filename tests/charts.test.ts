import { describe, it, expect } from 'vitest';
import { renderSparkline, renderDonutGauge, renderBarGauge, renderBeszelChart } from '../src/lib/charts';

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

  it('renderBeszelChart generates high-fidelity Beszel area chart', () => {
    const html = renderBeszelChart(
      [
        {
          name: 'CPU',
          color: '#3b82f6',
          values: [10, 20, 15, 30, 45, 25, 35],
          gradient: true,
        },
      ],
      {
        title: 'CPU Usage',
        subtitle: 'Average system-wide CPU utilization',
        unit: '%',
        timestamps: ['11:20 AM', '11:30 AM', '11:40 AM', '11:50 AM', '12:00 PM', '12:10 PM', '12:20 PM'],
      }
    );
    expect(html).toContain('CPU Usage');
    expect(html).toContain('Average system-wide CPU utilization');
    expect(html).toContain('<svg');
    expect(html).toContain('<path');
    expect(html).toContain('11:20 AM');
    expect(html).toContain('%');
  });

  it('renderBeszelChart supports multi-line series like Load Average with legend', () => {
    const html = renderBeszelChart(
      [
        { name: '1 min', color: '#a855f7', values: [0.8, 1.2, 1.5, 1.1] },
        { name: '5 min', color: '#3b82f6', values: [0.6, 0.9, 1.1, 1.0] },
        { name: '15 min', color: '#f97316', values: [0.5, 0.7, 0.8, 0.9] },
      ],
      {
        title: 'Load Average',
        subtitle: 'System load averages over time',
        legend: true,
      }
    );
    expect(html).toContain('Load Average');
    expect(html).toContain('1 min');
    expect(html).toContain('5 min');
    expect(html).toContain('15 min');
    expect(html).toContain('#a855f7');
  });
});
