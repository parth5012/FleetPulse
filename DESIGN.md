# DESIGN.md — Daylight Console

A professional, light-first redesign of the FleetPulse dashboard (variant: "Daylight Console").
Inspired by Stripe Dashboard, Vercel Geist, and Linear: gray-50 canvas, white cards, hairline
borders, restrained color, keyboard-first navigation.

## Design principles

1. **Light-first surfaces.** White (`#ffffff`) cards on a gray-50 (`#f7f8fa`) canvas with 1px
   `#e5e7eb` hairlines. Shadows exist only on elevated layers (command popovers, sheets, toasts) —
   never on base cards.
2. **Typography carries hierarchy.** Semibold 650–750 titles with tight tracking, gray-500 muted
   secondary text, and `ui-monospace` for every numeric value (vitals, rates, percentages) so
   columns scan vertically.
3. **Consistent status semantics.** One vocabulary everywhere: tinted chips and dots —
   emerald-700/`ecfdf5` = running/ok, amber-700/`fffbeb` = degraded, red-700/`fef2f2` = failed,
   gray = stopped/inactive. No emoji, no glows; dots + tinted pills do the talking.
4. **Task success in ≤ 2 taps.** Command jump (`/`) from anywhere; every route is one tap away on
   mobile (4 pinned slots + More sheet); the home page links every deeper page twice (status tile
   + quick link).
5. **Designed async states.** Every async section renders skeleton shimmer while loading, an
   inline error with a Retry button on failure, and an explicit empty state — never a blank box.
6. **AA contrast on light.** Interactive green is emerald-700 (`#047857`), status text uses 700-level
   tones; chart gridlines are near-invisible; `:focus-visible` outlines on all interactive elements;
   ≥ 44px touch targets on mobile (bottom nav, sheets, command input).

## UX problems fixed (vs. the old "Obsidian" dark UI)

- **Emoji icon soup + glow effects** → consistent inline SVG stroke icons, no shadows/glows.
- **10-item scrolling bottom nav** → 4 pinned slots + a "More" bottom sheet (all routes ≥ 48px tall).
- **No global navigation affordance** → command/quick-jump search in the header, `/` keyboard
  shortcut, arrow-key + Enter navigation, same sheet on mobile via the header search button.
- **Marketing hero instead of an operations view** → breadcrumb-style page header ("FleetPulse /
  Overview") with a contextual description and last-updated timestamp.
- **Fleet health buried in 8 equal cards** → one glanceable structure: host strip → vitals
  (CPU/RAM/Disk/Network) → status tiles (services running/failed, containers, OOM, quota
  headroom, disk free, mesh peers) → two live panels (top processes, heaviest services) → quick
  links.
- **"Polling…" spinner placeholders** → skeletons, retries, and real empty/error states.
- **Hardcoded dark surfaces everywhere** → all surfaces now derive from tokens
  (`--inset-bg`, `--card-border`, `--shadow-*`); log consoles intentionally stay dark for ANSI
  readability.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f7f8fa` | Page canvas |
| `--card-bg` | `#ffffff` | Cards, panels |
| `--inset-bg` | `#f4f5f7` | Table heads, tiles, inputs |
| `--card-border` | `#e5e7eb` | 1px hairlines |
| `--text` / `--text-muted` / `--text-subtle` | `#111827` / `#6b7280` / `#9ca3af` | Type hierarchy |
| `--primary` | `#047857` (emerald-700) | Actions, active states |
| `--success` / `--warning` / `--danger` / `--info` | `#067647` / `#b45309` / `#b91c1c` / `#0e7490` | Status text |
| `--success-subtle` … | `#ecfdf5` / `#fffbeb` / `#fef2f2` / `#ecfeff` | Status chip fills |
| `--shadow-sm/md/lg` | soft elevation ripples | Popovers, sheets, toasts only |
| `--radius-md/lg` | `8px` / `12px` | Cards, chips |
| Chart series | `#059669` `#7c3aed` `#d97706` `#0891b2` `#db2777` | AA-tuned series palette |
