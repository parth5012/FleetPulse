/**
 * Calm Ops icon system — inline SVG, stroke-based, currentColor.
 * All icons: 24×24 viewBox, stroke-width 1.75, no fills. Use size 16–20px.
 */

export interface IconOptions {
  size?: number;
  strokeWidth?: number;
}

function icon(paths: string, opts: IconOptions = {}): string {
  const size = opts.size || 18;
  const sw = opts.strokeWidth || 1.75;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

export const icons = {
  home: (o?: IconOptions) =>
    icon('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>', o),
  activity: (o?: IconOptions) =>
    icon('<path d="M3 12h4l3-8 4 16 3-8h4"/>', o),
  tasks: (o?: IconOptions) =>
    icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h6M7 12.5h10M7 16h8"/>', o),
  services: (o?: IconOptions) =>
    icon('<path d="M12 2.5 4 7v10l8 4.5 8-4.5V7l-8-4.5z"/><circle cx="12" cy="12" r="3"/>', o),
  system: (o?: IconOptions) =>
    icon('<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M8 8.5h8M8 11.5h5"/>', o),
  network: (o?: IconOptions) =>
    icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', o),
  journal: (o?: IconOptions) =>
    icon('<path d="M6 2.5h12a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z"/><path d="M9 7.5h7M9 11h7M9 14.5h4"/>', o),
  maintenance: (o?: IconOptions) =>
    icon('<path d="M14.5 6.5a4 4 0 0 0-5.6 4.9L4 16.3V20h3.7l4.9-4.9a4 4 0 0 0 4.9-5.6l-2.6 2.6-2.3-.5-.5-2.3 2.4-2.8z"/>', o),
  containers: (o?: IconOptions) =>
    icon('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V7"/><path d="M3 12h18M8 7v13M16 7v13"/>', o),
  apps: (o?: IconOptions) =>
    icon('<path d="M12 3c2 3.5 2 6-0.5 8.5S6 14 3.5 12C3 8 7 3.5 12 3z"/><path d="M12.5 11.5C15 13 17 16 16.5 20c-4 .5-7-2-8.5-4.5"/>', o),
  quotas: (o?: IconOptions) =>
    icon('<path d="M12 21a9 9 0 1 1 9-9"/><path d="M12 12 18.5 5.5"/><path d="M16 12h5M18 8v4"/>', o),
  more: (o?: IconOptions) =>
    icon('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>', o),
  close: (o?: IconOptions) =>
    icon('<path d="M6 6l12 12M18 6 6 18"/>', o),
  chevronRight: (o?: IconOptions) =>
    icon('<path d="M9 6l6 6-6 6"/>', o),
  refresh: (o?: IconOptions) =>
    icon('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 3v4h-4"/>', o),
  clock: (o?: IconOptions) =>
    icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', o),
  cpu: (o?: IconOptions) =>
    icon('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>', o),
  memory: (o?: IconOptions) =>
    icon('<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 10v4M12 10v4M16 10v4"/>', o),
  disk: (o?: IconOptions) =>
    icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M18.5 5.5 14 10"/>', o),
  zap: (o?: IconOptions) =>
    icon('<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>', o),
  arrowUpRight: (o?: IconOptions) =>
    icon('<path d="M7 17 17 7M9 7h8v8"/>', o),
  dot: (o?: IconOptions) =>
    icon('<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>', o),
};
