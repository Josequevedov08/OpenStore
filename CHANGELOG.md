# Changelog

High-level record of the work done on OpenStore, newest first. For the full commit-by-commit detail, see the git history.

## 2026-09-03

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
