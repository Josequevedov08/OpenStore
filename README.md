# 🚀 OpenStore — GitHub AI Explorer

An "App Store" for GitHub: search any public repository, get an AI-written plain-language pitch instead of a technical README, and — if you trust the author — install it with one click.

[![Frontend](https://img.shields.io/badge/frontend-Vercel-black?logo=vercel)](https://app-repositorio-github-one.vercel.app)
[![Backend](https://img.shields.io/badge/backend-Render-46E3B7?logo=render)](https://app-repositorio-github.onrender.com/health)
[![CI](https://github.com/Josequevedov08/App-Repositorio-Github/actions/workflows/ci.yml/badge.svg)](https://github.com/Josequevedov08/App-Repositorio-Github/actions/workflows/ci.yml)
[![Stack](https://img.shields.io/badge/stack-React%20%2B%20FastAPI-blue)](#-tech-stack)
[![AI](https://img.shields.io/badge/AI-Google%20Gemini%20%2B%20Groq-orange?logo=google)](https://aistudio.google.com/)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](./LICENSE)

**🔗 Live demo:** https://app-repositorio-github-one.vercel.app

---

## Contents

- [Screenshot](#screenshot)
- [Features](#features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Testing & CI](#testing--ci)
- [Security & legal](#security--legal)
- [Lessons learned](#lessons-learned)
- [Español](#español)

## Screenshot

![Platform view](./docs/img/screenshot.png)

## Features

- **Search all of public GitHub** — by keyword, by pasting a repo URL, or with `@username` / `github.com/username` to browse a person's or org's repos. Sort by top stars or most recently updated.
- **AI-generated commercial pitches** — the technical README is read, translated, and summarized into a persuasive value proposition, detected tech stack, key features, and external requirements in plain business language.
- **Actually bilingual** — an EN/ES switch in the UI; the backend generates content in the requested language (auto-translating from Chinese, Russian, Spanish, English, etc.), not just a UI-string swap.
- **Smart Installer** — click Install and download a script (`.bat` for Windows, one OS-detecting `.sh` for macOS/Linux) tailored to that specific repo: it checks for Git and the right runtime, self-heals missing tools via the system's native package manager (winget / Homebrew / apt / dnf / pacman), clones the repo to your Desktop, installs its dependencies, and runs it. See [Security & legal](#security--legal) — this runs real third-party code.
- **See more without pagination** — all fetched results show on one screen; "Load more" fetches the next 12 from GitHub instead of forcing a page click.
- **Resilient by default** — auto-retries transient network failures, per-IP rate limiting, response caching (no repeat AI/GitHub cost for the same search), and an automatic fallback AI provider if the primary one fails.
- **Honest degradation** — if the AI is unavailable (no quota, no key), an "Analysis pending" badge is shown instead of raw text in a foreign script or a broken card.

## How it works

```
Search  ──▶  GitHub Search API  ──▶  README fetch  ──▶  Gemini (per repo, parallel)  ──▶  Commercial card
                                                              │
                                     quota / timeout / error
                                                              ▼
                                          Groq (fallback)  ──▶  Commercial card
                                                              │
                                                         still fails
                                                              ▼
                                              "Analysis pending" fallback

Install ──▶  POST /api/generar-instalador  ──▶  sanitize install/start commands  ──▶  .bat / .sh download
```

The AI never gets to write a command that runs unchecked: the dependency-install command always comes from a fixed table keyed by a closed enum the AI can only pick from, and the AI-extracted start command is validated against an allow/deny list before it's ever placed in a script. Details and tests in [`backend/instalador.py`](./backend/instalador.py) / [`backend/tests/test_instalador.py`](./backend/tests/test_instalador.py).

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 19, Tailwind CSS 4, Vite — deployed on Vercel |
| Backend | Python, FastAPI, httpx — deployed on Render |
| AI | Google Gemini (`google-genai`) primary, Groq (OpenAI-compatible) as automatic fallback; also pluggable to OpenAI/Anthropic via `AI_PROVIDER` |

## Project structure

```
backend/
  main.py             FastAPI app: GitHub search, README fetch, AI pipeline, cache, rate limiting
  instalador.py        Smart Installer: .bat/.sh generation + command sanitization
  tests/                pytest suite for the installer's security validation
  requirements.txt
  .env.example
frontend/
  src/
    App.jsx            Search UI, results grid/list, sort, load-more, language switch
    components/ui/      Modal, cards, prompt input, etc.
  api/ping.py           Minimal Vercel serverless function (connectivity diagnostics)
  public/
    manual.html          Visual "how it works" guide (bilingual)
    faq.html             FAQ (bilingual)
    terminos.html        Terms & Conditions (bilingual)
    privacidad.html      Privacy Policy (bilingual)
    diagnostico.html     Self-service connectivity troubleshooting page
  .env.example
.github/workflows/ci.yml  Tests backend + builds frontend on every push
docs/img/screenshot.png
CHANGELOG.md
```

## Getting started

**Backend:**
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # paste your AI_API_KEY (free at aistudio.google.com/apikey)
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:8000/api/buscar-soluciones
npm run dev
```

## Environment variables

All in `backend/.env.example`:

| Variable | Required | Notes |
|---|---|---|
| `AI_PROVIDER` | recommended | `gemini` (default), `openai`, `groq`, or `anthropic` |
| `AI_API_KEY` | **yes** | without it, every card falls back to "Analysis pending" |
| `AI_MODEL` | no | defaults to `gemini-flash-lite-latest` — **not** a `-flash`/`-pro` model, whose free-tier quota can be as low as 20 requests/day |
| `AI_FALLBACK_PROVIDER` / `AI_FALLBACK_API_KEY` / `AI_FALLBACK_MODEL` | recommended | second provider retried per-repo if the primary fails; Groq's free tier is generous and needs no card |
| `AI_CONCURRENCY` | no | parallel LLM calls per search (default 5–10 depending on provider) |
| `AI_CALL_TIMEOUT_SECONDS` | no | max wait per LLM call before falling back (default `30`) |
| `SEARCH_CACHE_TTL_SECONDS` | no | how long an identical search is served from cache (default `900` = 15 min) |
| `RATE_LIMIT_MAX_PETICIONES` / `RATE_LIMIT_VENTANA_SEGUNDOS` | no | per-IP search rate limit (default 10 per 5 min) |
| `GITHUB_TOKEN` | strongly recommended | 60 req/hour without one vs. **5,000/hour** with a [read-only token](https://github.com/settings/tokens) — a single search already uses ~13 requests |
| `CORS_ORIGINS` | no | comma-separated allowed origins |

Frontend: `VITE_API_URL` in `frontend/.env.example`. **Paste only the bare URL** — see [Lessons learned](#lessons-learned).

## Testing & CI

```bash
cd backend
pip install pytest
python -m pytest tests/ -v
```

`.github/workflows/ci.yml` runs this plus `npm run build` on every push to `main` and every PR.

## Security & legal

- [How it works — visual manual](https://app-repositorio-github-one.vercel.app/manual.html)
- [FAQ](https://app-repositorio-github-one.vercel.app/faq.html)
- [Terms & Conditions](https://app-repositorio-github-one.vercel.app/terminos.html)
- [Privacy Policy](https://app-repositorio-github-one.vercel.app/privacidad.html)

**Read this before using the Smart Installer:** it downloads and runs a script that clones and executes real code from a third-party GitHub repository on your machine. We sanitize the script we generate (no destructive/network patterns, no AI-written install commands), but we cannot audit the repository's own source code or dependencies. Only use it for repos from authors you trust.

Both legal documents are plain-language drafts, **not professional legal advice** — have a lawyer review them before any commercial use.

## Lessons learned

A few real bugs hit in production that are worth knowing about if you fork this:

- **A free AI model's "free tier" can mean 20 requests/day, not per minute.** Check the actual quota (the provider's 429 response usually states it) before assuming "flash"/"lite" naming implies a generous limit.
- **`VITE_*` env vars are baked in at build time.** A bad value (this project once had a Markdown-formatted link — `[text](url)` — pasted into `VITE_API_URL` by mistake) fails silently as a cryptic `TypeError: Failed to fetch`/`Failed to parse URL` at runtime, not at build time, and looks exactly like a network problem. `App.jsx` now validates the URL shape at startup and logs a loud console error if it looks wrong — check the browser console first when "the server is unreachable" but the backend is confirmed healthy.
- **A renamed env var can leave a stale, wrong-typed value behind on your host's dashboard.** Renaming `AI_RATE_LIMIT_SECONDS` (a float) to `AI_CONCURRENCY` (an int) left `"4.5"` sitting in Render's UI, which would have crashed `int(os.getenv(...))` on the next restart. Parse config defensively (log + fall back) instead of trusting `int()`/`float()` not to raise.

---

## Español

<details>
<summary>Haz clic para expandir la versión en español</summary>

### Qué es

Una "App Store" para GitHub: buscas cualquier repositorio público, una IA te da una ficha comercial en lenguaje sencillo en vez del README técnico, y — si confías en el autor — lo instalas con un clic.

**Demo en vivo:** https://app-repositorio-github-one.vercel.app

### Características

- **Búsqueda global de GitHub** — por palabra clave, pegando la URL de un repo, o con `@usuario` / `github.com/usuario` para ver los repos de una persona u organización. Ordena por estrellas o por actualización reciente.
- **Fichas comerciales con IA** — el README técnico se traduce y resume en una propuesta de valor persuasiva, stack detectado, características clave y requisitos externos en lenguaje de negocio.
- **Bilingüe de verdad** — switch EN/ES en la interfaz; el backend genera el contenido en el idioma pedido (traduce automáticamente desde chino, ruso, español, inglés, etc.).
- **Instalador Inteligente** — al hacer clic en Instalar se descarga un script (`.bat` para Windows, un `.sh` con autodetección de sistema para macOS/Linux) hecho para ese repo: verifica Git y el runtime correcto, instala lo que falte con el gestor nativo del sistema (winget / Homebrew / apt / dnf / pacman), clona el repo a tu Escritorio, instala sus dependencias y lo arranca. Ver [Seguridad y legal](#security--legal) — esto ejecuta código real de un tercero.
- **Ver más sin paginación** — todos los resultados traídos se ven en una sola pantalla; "Cargar más" trae los siguientes 12 de GitHub en vez de forzar un clic a otra página.
- **Resiliente por defecto** — reintentos automáticos ante fallos de red, rate limiting por IP, caché de resultados (sin repetir gasto de IA/GitHub en la misma búsqueda), y un proveedor de IA de respaldo automático si el principal falla.
- **Degradación honesta** — si la IA no está disponible, se muestra un badge de "Análisis pendiente" en vez de texto crudo o una ficha rota.

### Cómo correrlo en local

**Backend:**
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # pega tu AI_API_KEY (gratis en aistudio.google.com/apikey)
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:8000/api/buscar-soluciones
npm run dev
```

Variables de entorno: ver la tabla en inglés más arriba. Incluyen ahora `AI_FALLBACK_*` (proveedor de respaldo), `AI_CONCURRENCY`, `SEARCH_CACHE_TTL_SECONDS` y `RATE_LIMIT_*`.

### Tests

```bash
cd backend
pip install pytest
python -m pytest tests/ -v
```

### Seguridad

**Lee esto antes de usar el Instalador Inteligente:** descarga y ejecuta un script que clona y corre código real de un repositorio de terceros en tu computadora. Sanitizamos el script que generamos (sin patrones destructivos/de red, sin comandos de instalación escritos por la IA), pero no podemos auditar el código fuente del repositorio ni sus dependencias. Úsalo solo con repos de autores en los que confíes.

Ver el [manual visual](https://app-repositorio-github-one.vercel.app/manual.html), la [FAQ](https://app-repositorio-github-one.vercel.app/faq.html), los [Términos](https://app-repositorio-github-one.vercel.app/terminos.html) y la [Política de Privacidad](https://app-repositorio-github-one.vercel.app/privacidad.html) — ambos documentos legales son borradores en lenguaje claro, **no asesoría legal profesional**.

### Lecciones aprendidas

- Un modelo de IA "gratis" puede tener una cuota de solo 20 peticiones **por día**, no por minuto — revisa la cuota real antes de asumir que "flash"/"lite" implica algo generoso.
- Las variables `VITE_*` se incrustan al momento de compilar. Un valor mal puesto (en este proyecto, un link con formato Markdown pegado por error en `VITE_API_URL`) falla en silencio como un `TypeError` críptico en tiempo real, no al compilar, y se ve exactamente como un problema de red.
- Renombrar una variable de entorno puede dejar un valor viejo con el tipo equivocado en el panel de tu hosting — parsea la configuración a la defensiva (avisa y usa un valor por defecto) en vez de confiar en que `int()`/`float()` nunca van a fallar.

</details>

---

<sub>💛 Si este proyecto te resultó útil y quieres apoyarlo: PayPal — joseramonquevedovillalobos@gmail.com</sub>

