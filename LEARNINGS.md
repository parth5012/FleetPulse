# Learnings & Technical Decisions

## 0. Antigravity quota semantics (Google / Cloud Code upstream)
- `retrieveUserQuotaSummary` (family buckets: `gemini-weekly`, `gemini-5h`, `3p-weekly`, `3p-5h`) is the source of truth for 5h/weekly pools. `retrieveUserQuota` per-model values report the *most binding* window with that window's resetTime — claude/gpt per-model values can carry the WEEKLY phase, so they must never be min()ed into a 5h bucket without a reset-phase check (`_phase_ok`).
- Google fabricates reset times for untried pools: remainingFraction=1.0 with resetTime ≈ now+5h / now+7d to the second. OmniRoute records these verbatim as `next_reset_at` (probe+7d), so OmniRoute `claude_gpt_weekly` snapshots can sit at exactly 100% for days. The dashboard therefore prefers the upstream bucket resetTime over OmniRoute snapshot resets.
- Window phases differ per account (weekly anchors to each account's own start time, e.g. Oct-24 08:00 for brothergaming700, Oct-29 for the others). Never compare buckets across accounts.

## 1. Zero-Dependency SVG Charting vs Heavy External Libraries
- Rather than adding external charting dependencies (like Chart.js or D3) which bloat the client bundle and introduce React/Canvas lifecycle quirks, a pure SVG generator (`src/lib/charts.ts`) using cubic Bezier spline interpolation (`createSmoothPath`) produces razor-sharp, resolution-independent vector sparklines, donut gauges, and area charts.
- SVG path strings are fast to render, styleable via CSS custom properties (`var(--primary)`, `var(--card-border)`), and 100% testable in headless jsdom test suites.

## 2. Real Docker with Graceful Fallback
- In testing, container environments or restricted user accounts might not have direct access to `/var/run/docker.sock` or `docker ps`.
- Implementing automatic fallback in `containers.py` (detecting docker daemon health via `docker info`) allows the service to deliver full functionality on live Docker hosts while falling back to rich mock data in testing or sandboxed environments without throwing uncaught exceptions.

## 3. High-Performance Log Streaming with ANSI Sanitization
- Terminal logs often contain complex ANSI escape codes (`\x1b[32m`, etc.).
- Direct injection of terminal logs is an XSS vector if logs contain unescaped HTML characters. By running an HTML escaping pass *first* in `src/lib/ansi.ts` before substituting recognized ANSI color escape sequences into safe `<span>` elements, security is guaranteed while retaining terminal fidelity.

## 4. UI/UX Polishing for High-Density Telemetry
- Following `design-engineering` principles:
  - Frequent interactions (filtering logs, searching containers) should be instant with zero lag.
  - Donut gauges and sparklines use CSS transitions on `stroke-dashoffset` for believable physics.
  - Auto-scroll locking allows users to inspect historical logs without the scrollbar fighting incoming tail messages.
