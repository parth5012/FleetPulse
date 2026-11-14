/**
 * Theme Manager for FleetPulse.
 * Incorporates authentic themes pulled from T3 Code (Poimandres, Catppuccin, Dracula,
 * Glacier Slate Coral, Dark Modern) along with the flagship Glanceboard Obsidian (Geist).
 */

export type ThemeId = 'obsidian' | 'poimandres' | 'catppuccin' | 'dracula' | 'glacier-slate' | 'darkmodern';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  source: 'T3 Code' | 'Glanceboard';
  accentColor: string;
}

export const THEMES: ThemeOption[] = [
  { id: 'obsidian', name: 'Obsidian', source: 'Glanceboard', accentColor: '#10b981' },
  { id: 'poimandres', name: 'Poimandres', source: 'T3 Code', accentColor: '#5de4c7' },
  { id: 'catppuccin', name: 'Catppuccin', source: 'T3 Code', accentColor: '#c6a0f6' },
  { id: 'dracula', name: 'Dracula', source: 'T3 Code', accentColor: '#bd93f9' },
  { id: 'glacier-slate', name: 'Glacier Slate', source: 'T3 Code', accentColor: '#98bcbd' },
  { id: 'darkmodern', name: 'Dark Modern', source: 'T3 Code', accentColor: '#6366f1' },
];

const STORAGE_KEY = 'fleetpulse_t3_theme';

export function getStoredTheme(): ThemeId {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val && THEMES.some((t) => t.id === val)) {
      return val as ThemeId;
    }
  } catch {
    // localStorage may be unavailable
  }
  return 'obsidian';
}

export function setTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore storage error
  }
  window.dispatchEvent(new CustomEvent('gb:themechange', { detail: { theme } }));
}

export function initTheme(): void {
  const theme = getStoredTheme();
  setTheme(theme);
}
