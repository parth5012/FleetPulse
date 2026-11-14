# FleetPulse — Calm Ops

An evolutionary redesign of the dark UI: from neon "Obsidian" glow to a quiet, Linear/Vercel-grade ops console. Dark-first, one accent, no noise.

## Design principles

1. **Calm by default.** Near-black neutral surfaces (`#0a0a0b` canvas, `#101013` cards, `#16161a` raised) with hairline borders (`rgba(255,255,255,0.07)`). No glows, no gradients, no drop-shadow halos, no emoji icons.
2. **One accent, one meaning.** Emerald (`#10b981` family) is reserved for primary actions, live state, active nav, and "running" semantics. Everything else is grayscale + desaturated chart hues (memory `#8b7cf6`, IO `#5b9dd9`, network `#38c5d6`, load `#d0a44c`).
3. **Status is never color alone.** Every status is a dot **plus a text label** ("73 running", "22 stopped", "Healthy", "2 failed"). Vitals bars escalate: >70% warning amber, >85% danger red.
4. **Structure over decoration.** Strict 8pt spacing grid, documented type scale, uppercase micro-labels for sections, tabular numerals (`font-variant-numeric: tabular-nums`) for every metric.
5. **Task success in minimal taps.** Desktop: grouped sidebar (Overview / Monitor / Operate / Tools). Mobile: 4 primary bottom-nav items + a "More" sheet holding the other 6 routes. 44px touch targets, visible focus rings (`--ring`) on every interactive element.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` / `--surface-1/2/3` | `#0a0a0b` / `#101013` / `#16161a` / `#1d1d21` | canvas / cards / hover & raised / tracks & chips |
| `--border` / `--border-strong` | `rgba(255,255,255,.07)` / `.14` | hairlines / hover borders |
| `--text` / `--text-secondary` / `--text-muted` / `--text-subtle` | `#ededf0` / `#a2a2ab` / `#8f8f98` / `#6d6d76` | 4-step text ladder (muted ≥4.5:1) |
| `--accent` / `--accent-strong` / `--accent-text` | `#10b981` / `#059669` / `#34d399` | live & active / filled buttons (white text ≥4.5:1) / accent as text |
| `--ok/warning/danger/info` + `-text`/`-bg` | emerald / amber / red / cyan pairs | status semantics (always with a label) |
| `--s-1…--s-7` | 4 / 8 / 12 / 16 / 24 / 32 / 48 px | 8pt spacing grid |
| `--fs-2xs…--fs-2xl` | 11 / 12 / 13 / 14 / 16 / 20 / 26 px | type scale (base 14px, ratio ≈1.2) |
| `--radius-sm/md/lg` | 6 / 8 / 12 px | controls / inputs / cards |
| `--ring` | 2px bg + 4px accent-45% | universal focus ring |

## UX problems fixed

- **10 emoji nav items everywhere** → grouped sidebar on desktop; on mobile 4 primaries + More sheet (all 10 routes ≤2 taps). Emoji replaced by a stroke-based inline SVG icon set (`src/lib/icons.ts`, 16–20px, currentColor).
- **No information hierarchy on Home** → new anatomy: host vitals strip (CPU/Memory/Disk/Network with 24h sparkline, live bar, threshold color) → status band (services/containers/tasks/kernel/mesh counts with labels) → two live activity cards → quiet Explore links.
- **Every card screamed "click me"** (8 filled gradient buttons per view) → one quiet action per card; no filled CTA on Home at all.
- **Glow/gradient noise and low-contrast badges** → removed globally; badges rebuilt as a semantic set (`.badge-success/info/warn/error` with readable text-on-tint).
- **Inconsistent affordances** → single button vocabulary, hover/focus/active states everywhere, skeleton loading rows instead of spinners, graceful degradation when an API call fails.
- **Color-only status** → dot + label pairs everywhere; container/service "stopped" is neutral gray with a count, "failed" is red text.
- **Touch targets** → ≥44px on mobile for buttons, chips, bottom nav, and sheet items.

## What generalizes

The System page proves the system: same tokens, icon set, tabs, chips, and badge vocabulary restyled with zero structural rewrites. Remaining pages inherit the calmer tokens automatically.

## Non-goals

- Light theme kept as a mapped fallback (`prefers-color-scheme: light`) but dark is the designed default.
- No new dependencies; charts remain hand-rolled SVG.
