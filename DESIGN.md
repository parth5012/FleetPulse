# Glanceboard

Redesign variant of FleetPulse focused on one question: **can you tell, within two seconds of opening the PWA, whether anything is wrong?**

## Design principles

1. **Mobile-first, glance-first.** Designed at 390px, then extended to desktop. The Home page is a deliberate scroll order: fleet-health hero → attention strip (only when needed) → host vitals tiles → quick links. Nothing critical requires scrolling.
2. **Color means status, nothing else.** Surfaces are achromatic; green/amber/red appear only where they carry meaning (dots, values over threshold, alerts, the health ring). No glows, no rainbow accents, no decoration.
3. **One verdict, not ten cards.** The old home page was eight parallel cards with "Polling..." pills. Now a single health ring + one-line verdict ("All systems normal · 73/155 services up") answers the primary question, and everything else is progressive disclosure.
4. **Big numerals, tabular figures.** Metric values are mono/tabular at 21–26px so columns scan cleanly; labels are 11.5px uppercase eyebrows.
5. **Thumb zone.** The 5 most-used destinations (Home, System, Tasks, Apps, More) live in the bottom nav; everything else is one tap away in the "More" sheet. All nav targets ≥44px.

## UX problems fixed

- **10-item emoji bottom nav** (unusable thumb targets, cryptic labels) → 5-item nav + "More" bottom sheet with descriptions; desktop gets a grouped sidebar (Monitor / Operate / Apps).
- **No answer to "is anything wrong?"** → single health score computed from real checks (CPU/RAM/disk <90%, failed services, OOM kills) with an alert strip whose rows deep-link to the fixing page; severity-tinted (amber ≥90%, red ≥95% or hard failures).
- **"Polling..." forever states** → real skeletons while loading, per-section error states with retry, and empty states.
- **Native `window.confirm` for destructive actions** → in-app confirm dialog (bottom sheet on mobile, centered on desktop) wired into service restart, process terminate, container stop/restart, app stop/restart, docker prune, daemon restart.
- **No sense of freshness** → "Updated 12s ago" chip in the top bar; tap it to reload the view. Pulses green while data is fresh.
- **PWA-hostile chrome** → safe-area insets (`env(safe-area-inset-bottom/-top)`) on nav, top bar, page and dialog; pinched zoom re-enabled for accessibility; visible `:focus-visible` rings; `prefers-reduced-motion` respected.

## Tokens

| Token | Dark | Light |
|---|---|---|
| `--gb-bg` / surface / surface-2 | `#0b0d10` / `#14161b` / `#191c22` | `#f5f6f8` / `#fff` / `#f0f1f4` |
| `--gb-border` | `rgba(255,255,255,.07)` | `rgba(0,0,0,.08)` |
| `--gb-text` / muted / faint | `#e8eaef` / `#9aa1ad` / `#6d7480` | `#17181c` / `#5d6470` / `#8a9099` |
| `--gb-ok` (healthy/running) | `#34d399` | `#059669` |
| `--gb-warn` (degraded ≥90%) | `#fbbf24` | `#b45309` |
| `--gb-bad` (failing ≥95% / errors) | `#f87171` | `#dc2626` |

- Spacing: 4/8/12/16/20/24; radii 8/12px; type weights 400/550/650 only.
- Implementation note: the design lives in `src/glanceboard.css` (loaded after `style.css`), which re-themes the token layer and quiets legacy components, so unrebuilt pages inherit the calmer look without breaking.

## Patterns borrowed

- **Vercel Geist**: achromatic surfaces, hairline borders, status color at dot/badge scale, tabular numerals.
- **Linear**: quiet sidebar with sectioned labels, restrained motion, focus discipline.
- **Stripe Dashboard**: stat-tile rhythm (label / big value / sub-metric) and one hero metric per page.
