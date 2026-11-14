# Glanceboard

Redesign variant of FleetPulse focused on one question: **can you tell, within two seconds of opening the PWA, whether anything is wrong?**

## Information Architecture — 10 Routes Consolidated to 5 Pages

FleetPulse's original 10-route sprawl has been consolidated into exactly 5 cohesive, task-oriented pages. The mobile bottom navigation now contains exactly 5 primary destinations (no nested "More" sheet), and the desktop sidebar groups them cleanly:

| Page | Route | Absorbed Routes & Content | Key Capabilities |
|---|---|---|---|
| **Home** | `/` | Home | Health ring verdict, attention alert strip, host vitals tiles, quick deep links. |
| **System** | `/system` | System + `/network` | Beszel telemetry (CPU, RAM, swap, per-core), storage partitions + Tailscale mesh topology, HTTPS ingress serve routes, open listening sockets (`ss -tulpn`). |
| **Tasks** | `/tasks` | Tasks | Process monitor (btop style), CPU/RAM sorting, search, termination with in-app confirm dialog. |
| **Apps** | `/apps` | Apps + `/services` + `/containers` | "What is running": curated apps with on-demand tunnels, systemd daemons with RAM distribution, and Docker containers with Dozzel live ANSI log tailing. |
| **Ops** | `/ops` | `/maintenance` + `/journal` + `/antigravity` | Administration: one-tap Docker GC & journal vacuum, kernel PSI pressure watcher & live journalctl logs, and OmniRoute/Qoder AI quota pools. |

### Backward-Compatible Route Redirection
All 6 legacy routes automatically redirect without 404s, preserving existing PWA shortcuts and bookmarked URLs:
- `#/network` → `#/system?tab=network`
- `#/services` → `#/apps?tab=services`
- `#/containers` → `#/apps?tab=containers`
- `#/journal` → `#/ops?tab=journal`
- `#/maintenance` → `#/ops?tab=maintenance`
- `#/antigravity` → `#/ops?tab=quotas`

### In-Page Sub-Navigation & Deep Linking
Multi-aspect pages (`System`, `Apps`, `Ops`) feature horizontal-scrolling segmented tabs (`.beszel-subnav`, `.gb-tabs`) with thumb-friendly touch targets (≥44px). The active tab is bound to the URL hash query parameter (`?tab=...`), enabling direct links to any sub-view.

## Design principles

1. **Mobile-first, glance-first.** Designed at 390px, then extended to desktop. The Home page is a deliberate scroll order: fleet-health hero → attention strip (only when needed) → host vitals tiles → quick links. Nothing critical requires scrolling.
2. **Color means status, nothing else.** Surfaces are achromatic; green/amber/red appear only where they carry meaning (dots, values over threshold, alerts, the health ring). No glows, no rainbow accents, no decoration.
3. **One verdict, not ten cards.** The old home page was eight parallel cards with "Polling..." pills. Now a single health ring + one-line verdict ("All systems normal · 73/155 services up") answers the primary question, and everything else is progressive disclosure.
4. **Big numerals, tabular figures.** Metric values are mono/tabular at 21–26px so columns scan cleanly; labels are 11.5px uppercase eyebrows.
5. **Thumb zone.** The 5 primary destinations (Home, System, Tasks, Apps, Ops) live in the bottom nav with ≥44px touch targets. All safe-area insets (`env(safe-area-inset-bottom)`) are fully accounted for.

## UX problems fixed

- **10-item emoji bottom nav** (unusable thumb targets, cryptic labels) → Exactly 5 primary bottom-nav destinations (Home, System, Tasks, Apps, Ops); desktop gets a grouped sidebar (Monitor / Workloads / Administration).
- **No answer to "is anything wrong?"** → Single health score computed from real checks (CPU/RAM/disk <90%, failed services, OOM kills) with an alert strip whose rows deep-link to the fixing page; severity-tinted (amber ≥90%, red ≥95% or hard failures).
- **"Polling..." forever states** → Real skeletons while loading, per-section error states with retry, and empty states.
- **Native `window.confirm` for destructive actions** → In-app confirm dialog (bottom sheet on mobile, centered on desktop) wired into service restart, process terminate, container stop/restart, app stop/restart, docker prune, daemon restart.
- **No sense of freshness** → "Updated 12s ago" chip in the top bar; tap it to reload the view. Pulses green while data is fresh.
- **PWA-hostile chrome** → Safe-area insets (`env(safe-area-inset-bottom/-top)`) on nav, top bar, page and dialog; pinch-to-zoom enabled for accessibility; visible `:focus-visible` rings; `prefers-reduced-motion` respected.

## Tokens & Themes

### Core Glanceboard Tokens

| Token | Dark (Obsidian) | Light |
|---|---|---|
| `--gb-bg` / surface / surface-2 | `#0b0d10` / `#14161b` / `#191c22` | `#f5f6f8` / `#fff` / `#f0f1f4` |
| `--gb-border` | `rgba(255,255,255,.07)` | `rgba(0,0,0,.08)` |
| `--gb-text` / muted / faint | `#e8eaef` / `#9aa1ad` / `#6d7480` | `#17181c` / `#5d6470` / `#8a9099` |
| `--gb-ok` (healthy/running) | `#34d399` | `#059669` |
| `--gb-warn` (degraded ≥90%) | `#fbbf24` | `#b45309` |
| `--gb-bad` (failing ≥95% / errors) | `#f87171` | `#dc2626` |

- Spacing: 4/8/12/16/20/24; radii 8/12px; type weights 400/550/650 only.
- Implementation note: the design lives in `src/glanceboard.css` (loaded after `style.css`), which re-themes the token layer and quiets legacy components, so unrebuilt pages inherit the calmer look without breaking.

### Authentic T3 Code Theme Presets
Glanceboard incorporates authentic color palettes pulled directly from the T3 Code theme registry (`mcp_t3-code_t3_theme_read`), selectable directly from the top bar theme picker and persisted across PWA reloads:
- **Obsidian (Glanceboard Default)**: Ultra-clean Geist dark slate / light neutral.
- **Poimandres**: Midnight slate `#1b1e28`, surface `#21242f`, mint accent `#5de4c7`, soft ice text `#e4f0fb`.
- **Catppuccin**: Warm Macchiato dark (`#24273a`, surface `#1e2030`, mauve `#c6a0f6`) & Latte light (`#eff1f5`, lavender `#8839ef`).
- **Dracula**: Classic gothic dark slate `#282a36`, `#21222c`, purple accent `#bd93f9`, vibrant green ok `#50fa7b`.
- **Glacier Slate**: Deep icy cyan `#152123`, surface `#1a2729`, glacier cyan accent `#98bcbd`, coral warnings `#e08a80`.
- **Dark Modern**: Crisp VS Code-style charcoal `#1F1F1F`, surface `#222222`, indigo accent `#6366F1`.

## Patterns borrowed

- **Vercel Geist**: achromatic surfaces, hairline borders, status color at dot/badge scale, tabular numerals.
- **Linear**: quiet sidebar with sectioned labels, restrained motion, focus discipline.
- **Stripe Dashboard**: stat-tile rhythm (label / big value / sub-metric) and one hero metric per page.
