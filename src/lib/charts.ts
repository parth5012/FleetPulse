/**
 * Lightweight SVG Chart Engine for Visual Telemetry & Mobile Dashboards.
 * Produces crisp, vector-sharp sparklines, area charts, donut gauges,
 * stacked resource bars, and multi-ring radial gauges with zero external dependencies.
 */

export interface SparklineOptions {
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  gradient?: boolean;
  min?: number;
  max?: number;
}

export interface DonutOptions {
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  color?: string;
  trackColor?: string;
}

export interface ChartSeries {
  name: string;
  color: string;
  values: number[];
}

export interface AreaChartOptions {
  width?: number;
  height?: number;
  title?: string;
  unit?: string;
  labels?: string[];
  yMax?: number;
}

export interface StackedSegment {
  label: string;
  value: number;
  color: string;
  displayValue?: string;
}

function createSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function renderSparkline(values: number[], options: SparklineOptions = {}): string {
  const width = options.width || 120;
  const height = options.height || 36;
  const color = options.color || '#10b981';
  const strokeWidth = options.strokeWidth || 2;
  const gradient = options.gradient !== false;

  if (!values || values.length === 0) {
    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline-svg">
        <line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="var(--card-border)" stroke-dasharray="3,3" />
      </svg>
    `;
  }

  const minVal = options.min !== undefined ? options.min : Math.min(...values);
  const maxVal = options.max !== undefined ? options.max : Math.max(...values, minVal + 1);
  const range = maxVal - minVal || 1;

  const padding = strokeWidth + 2;
  const drawWidth = width - padding * 2;
  const drawHeight = height - padding * 2;

  const points = values.map((v, i) => {
    const x = padding + (values.length > 1 ? (i / (values.length - 1)) * drawWidth : drawWidth / 2);
    const normalized = Math.max(0, Math.min(1, (v - minVal) / range));
    const y = padding + (1 - normalized) * drawHeight;
    return { x, y };
  });

  const linePath = createSmoothPath(points);
  const gradId = `spark-grad-${Math.random().toString(36).substring(2, 8)}`;

  let areaSvg = '';
  if (gradient && points.length > 1) {
    const lastX = points[points.length - 1].x;
    const firstX = points[0].x;
    const areaPath = `${linePath} L ${lastX} ${height} L ${firstX} ${height} Z`;
    areaSvg = `
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#${gradId})" />
    `;
  }

  const lastPoint = points[points.length - 1];

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline-svg" style="overflow:visible;">
      ${areaSvg}
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${lastPoint.x.toFixed(1)}" cy="${lastPoint.y.toFixed(1)}" r="${strokeWidth + 1}" fill="${color}" />
    </svg>
  `;
}

export function renderDonutGauge(percent: number, options: DonutOptions = {}): string {
  const size = options.size || 110;
  const strokeWidth = options.strokeWidth || 9;
  const label = options.label || '';
  const sublabel = options.sublabel || '';

  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  let color = options.color;
  if (!color) {
    if (pct >= 90) color = 'var(--danger, #ef4444)';
    else if (pct >= 75) color = 'var(--warning, #f59e0b)';
    else color = 'var(--primary, #10b981)';
  }

  const trackColor = options.trackColor || 'var(--bar-bg, #222226)';

  return `
    <div class="donut-gauge-wrap" style="width:${size}px; height:${size}px; position:relative; display:inline-flex; align-items:center; justify-content:center;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg);">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${trackColor}" stroke-width="${strokeWidth}" />
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
          stroke-dasharray="${circumference.toFixed(1)}"
          stroke-dashoffset="${offset.toFixed(1)}"
          stroke-linecap="round"
          style="transition: stroke-dashoffset 0.6s cubic-bezier(0.23, 1, 0.32, 1), stroke 0.3s ease;"
        />
      </svg>
      <div class="donut-gauge-content" style="position:absolute; text-align:center; pointer-events:none;">
        <div style="font-size:${size < 48 ? '0.68rem' : size < 60 ? '0.78rem' : size < 85 ? '0.96rem' : '1.18rem'}; font-weight:800; line-height:1; color:var(--text);">${pct}%</div>
        ${label ? `<div style="font-size:${size < 60 ? '0.54rem' : '0.65rem'}; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-top:${size < 60 ? '1px' : '3px'};">${label}</div>` : ''}
        ${sublabel ? `<div style="font-size:0.6rem; color:var(--text-muted); opacity:0.8;">${sublabel}</div>` : ''}
      </div>
    </div>
  `;
}

export function renderBarGauge(percent: number, label: string, valueStr: string, color?: string): string {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  let barColor = color;
  if (!barColor) {
    if (pct >= 90) barColor = 'var(--danger, #ef4444)';
    else if (pct >= 75) barColor = 'var(--warning, #f59e0b)';
    else barColor = 'var(--primary, #10b981)';
  }

  return `
    <div class="bar-gauge-item">
      <div class="bar-gauge-header" style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px;">
        <span style="font-weight:600; color:var(--text);">${label}</span>
        <span style="font-family:monospace; color:var(--text-muted);">${valueStr}</span>
      </div>
      <div class="bar-outer" style="height:7px;">
        <div class="bar-inner" style="width: ${pct}%; background: ${barColor};"></div>
      </div>
    </div>
  `;
}

export function renderStackedBar(
  segments: StackedSegment[],
  options: { height?: number; showLegend?: boolean; title?: string } = {}
): string {
  const height = options.height || 10;
  const total = segments.reduce((acc, s) => acc + Math.max(0, s.value), 0) || 1;

  let offset = 0;
  const barSegmentsSvg = segments
    .map((s) => {
      const pct = (Math.max(0, s.value) / total) * 100;
      const x = offset;
      offset += pct;
      if (pct <= 0) return '';
      return `<rect x="${x}%" y="0" width="${pct}%" height="100%" fill="${s.color}" rx="0" />`;
    })
    .join('');

  const legendHtml =
    options.showLegend !== false
      ? `
      <div class="stacked-bar-legend" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:8px; font-size:0.75rem;">
        ${segments
          .filter((s) => s.value > 0)
          .map(
            (s) => `
          <div style="display:flex; align-items:center; gap:5px;">
            <span style="width:8px; height:8px; border-radius:2px; background:${s.color}; display:inline-block;"></span>
            <span style="color:var(--text-muted);">${s.label}:</span>
            <strong style="font-family:var(--font-mono); color:var(--text);">${s.displayValue || s.value}</strong>
          </div>
        `
          )
          .join('')}
      </div>
    `
      : '';

  return `
    <div class="stacked-bar-wrap" style="width:100%;">
      ${
        options.title
          ? `<div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); margin-bottom:5px; text-transform:uppercase;">${options.title}</div>`
          : ''
      }
      <div style="width:100%; height:${height}px; background:var(--bar-bg); border-radius:99px; overflow:hidden; position:relative;">
        <svg width="100%" height="100%" preserveAspectRatio="none">
          ${barSegmentsSvg}
        </svg>
      </div>
      ${legendHtml}
    </div>
  `;
}

export function renderMultiDonut(
  rings: { percent: number; color: string; label: string }[],
  size = 140
): string {
  const count = rings.length;
  if (count === 0) return '';

  const strokeWidth = 7;
  const gap = 3;
  const maxRadius = (size - strokeWidth) / 2;

  let circlesSvg = '';
  rings.forEach((r, idx) => {
    const radius = maxRadius - idx * (strokeWidth + gap);
    if (radius <= 0) return;
    const circumference = 2 * Math.PI * radius;
    const pct = Math.max(0, Math.min(100, r.percent));
    const offset = circumference - (pct / 100) * circumference;

    // Track circle
    circlesSvg += `
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="var(--bar-bg)" stroke-width="${strokeWidth}" opacity="0.6" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${r.color}" stroke-width="${strokeWidth}"
        stroke-dasharray="${circumference.toFixed(1)}"
        stroke-dashoffset="${offset.toFixed(1)}"
        stroke-linecap="round"
        style="transition: stroke-dashoffset 0.6s ease;"
      />
    `;
  });

  return `
    <div class="multi-donut-wrap" style="display:inline-flex; align-items:center; justify-content:center; position:relative; width:${size}px; height:${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg);">
        ${circlesSvg}
      </svg>
    </div>
  `;
}

export function renderAreaChart(series: ChartSeries[], options: AreaChartOptions = {}): string {
  const width = options.width || 680;
  const height = options.height || 200;
  const paddingLeft = 45;
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 30;

  const drawWidth = width - paddingLeft - paddingRight;
  const drawHeight = height - paddingTop - paddingBottom;

  // Compute scale
  let maxVal = options.yMax !== undefined ? options.yMax : 100;
  series.forEach((s) => {
    s.values.forEach((v) => {
      if (v > maxVal) maxVal = v;
    });
  });
  if (maxVal === 0) maxVal = 100;

  // Gridlines & Y-labels
  const gridSteps = 4;
  let gridSvg = '';
  for (let i = 0; i <= gridSteps; i++) {
    const fraction = i / gridSteps;
    const y = paddingTop + (1 - fraction) * drawHeight;
    const valLabel = Math.round(fraction * maxVal);
    gridSvg += `
      <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="var(--card-border)" stroke-dasharray="2,3" opacity="0.6" />
      <text x="${paddingLeft - 8}" y="${y + 3}" fill="var(--text-muted)" font-size="9" text-anchor="end" font-family="monospace">${valLabel}${options.unit || '%'}</text>
    `;
  }

  // Draw series paths
  let seriesSvg = '';
  series.forEach((s, idx) => {
    const vals = s.values;
    if (vals.length === 0) return;

    const points = vals.map((v, i) => {
      const x = paddingLeft + (vals.length > 1 ? (i / (vals.length - 1)) * drawWidth : drawWidth / 2);
      const normalized = Math.max(0, Math.min(1, v / maxVal));
      const y = paddingTop + (1 - normalized) * drawHeight;
      return { x, y };
    });

    const linePath = createSmoothPath(points);
    const gradId = `area-grad-${idx}-${Math.random().toString(36).substring(2, 6)}`;
    const lastX = points[points.length - 1].x;
    const firstX = points[0].x;
    const areaPath = `${linePath} L ${lastX} ${paddingTop + drawHeight} L ${firstX} ${paddingTop + drawHeight} Z`;

    seriesSvg += `
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${s.color}" stop-opacity="0.30" />
          <stop offset="100%" stop-color="${s.color}" stop-opacity="0.01" />
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#${gradId})" />
      <path d="${linePath}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    `;
  });

  return `
    <div class="area-chart-wrap" style="width:100%; overflow-x:auto;">
      <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="display:block;">
        ${gridSvg}
        ${seriesSvg}
      </svg>
    </div>
  `;
}
