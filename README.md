# 🚀 OpenStore — GitHub AI Explorer

An "App Store" for GitHub: search any public repository, get an AI-written plain-language pitch instead of a technical README, and — if you trust the author — install it with one click.

[![Frontend](https://img.shields.io/badge/frontend-Vercel-black?logo=vercel)](https://app-repositorio-github-one.vercel.app)
[![Backend](https://img.shields.io/badge/backend-Render-46E3B7?logo=render)](https://app-repositorio-github.onrender.com/health)
[![Stack](https://img.shields.io/badge/stack-React%20%2B%20FastAPI-blue)](#-tech-stack)
[![AI](https://img.shields.io/badge/AI-Google%20Gemini-orange?logo=google)](https://aistudio.google.com/)
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
- [Security & legal](#security--legal)
- [Español](#español)

## Screenshot

![Platform view](./docs/img/screenshot.png)

## Features

- **Search all of public GitHub** — by keyword, by pasting a repo URL, or with `@username` / `github.com/username` to browse a person's or org's repos, sorted by stars.
- **AI-generated commercial pitches** — the technical README is read, translated, and summarized into a persuasive value proposition, detected tech stack, key features, and external requirements in plain business language.
- **Actually bilingual** — an EN/ES switch in the UI; the backend generates content in the requested language (auto-translating from Chinese, Russian, Spanish, English, etc.), not just a UI-string swap.
- **Smart Installer** — click Install and download a script (`.bat` for Windows, one OS-detecting `.sh` for macOS/Linux) tailored to that specific repo: it checks for Git and the right runtime, self-heals missing tools via the system's native package manager (winget / Homebrew / apt / dnf / pacman), clones the repo to your Desktop, installs its dependencies, and runs it. See [Security & legal](#security--legal) — this runs real third-party code.
- **Honest degradation** — if the AI is unavailable (no quota, no key), an "Analysis pending" badge is shown instead of raw text in a foreign script or a broken card.
- **Free-tier aware** — configurable pacing and timeout for LLM calls so a single search never exceeds (or hangs on) the provider's free quota.

## How it works

```
Search  ──▶  GitHub Search API  ──▶  README fetch  ──▶  Gemini (per repo)  ──▶  Commercial card
                                                              │
                                              no key / quota / timeout
                                                              ▼
                                                  "Analysis pending" fallback

Install ──▶  POST /api/generar-instalador  ──▶  sanitize install/start commands  ──▶  .bat / .sh download
```

The AI never gets to write a command that runs unchecked: the dependency-install command always comes from a fixed table keyed by a closed enum the AI can only pick from, and the AI-extracted start command is validated against an allow/deny list before it's ever placed in a script. Details in [`backend/instalador.py`](./backend/instalador.py).

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 19, Tailwind CSS 4, Vite — deployed on Vercel |
| Backend | Python, FastAPI, httpx — deployed on Render |
| AI | Google Gemini (`google-genai`), pluggable to OpenAI / Groq / Anthropic via `AI_PROVIDER` |

## Project structure

```
backend/
  main.py            FastAPI app: GitHub search, README fetch, AI pipeline, endpoints
  instalador.py       Smart Installer: .bat/.sh generation + command sanitization
  requirements.txt
  .env.example
frontend/
  src/
    App.jsx           Search UI, results grid/list, language switch
    components/ui/     Modal, cards, pagination, prompt input, etc.
  public/
    manual.html        Visual "how it works" guide (bilingual)
    terminos.html       Terms & Conditions (bilingual)
    privacidad.html     Privacy Policy (bilingual)
  .env.example
docs/img/screenshot.png
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
| `AI_MODEL` | no | defaults per provider (currently `gemini-3.6-flash` for Gemini) |
| `AI_RATE_LIMIT_SECONDS` | no | pacing between LLM calls to respect free-tier quota (default `4.5`) |
| `AI_CALL_TIMEOUT_SECONDS` | no | max wait per LLM call before falling back (default `30`) |
| `GITHUB_TOKEN` | strongly recommended | 60 req/hour without one vs. **5,000/hour** with a [read-only token](https://github.com/settings/tokens) — a single search already uses ~13 requests |
| `CORS_ORIGINS` | no | comma-separated allowed origins |

## Security & legal

- [How it works — visual manual](https://app-repositorio-github-one.vercel.app/manual.html)
- [Terms & Conditions](https://app-repositorio-github-one.vercel.app/terminos.html)
- [Privacy Policy](https://app-repositorio-github-one.vercel.app/privacidad.html)

**Read this before using the Smart Installer:** it downloads and runs a script that clones and executes real code from a third-party GitHub repository on your machine. We sanitize the script we generate (no destructive/network patterns, no AI-written install commands), but we cannot audit the repository's own source code or dependencies. Only use it for repos from authors you trust.

Both legal documents are plain-language drafts, **not professional legal advice** — have a lawyer review them before any commercial use.

---

## Español

<details>
<summary>Haz clic para expandir la versión en español</summary>

### Qué es

Una "App Store" para GitHub: buscas cualquier repositorio público, una IA te da una ficha comercial en lenguaje sencillo en vez del README técnico, y — si confías en el autor — lo instalas con un clic.

**Demo en vivo:** https://app-repositorio-github-one.vercel.app

### Características

- **Búsqueda global de GitHub** — por palabra clave, pegando la URL de un repo, o con `@usuario` / `github.com/usuario` para ver los repos de una persona u organización, ordenados por estrellas.
- **Fichas comerciales con IA** — el README técnico se traduce y resume en una propuesta de valor persuasiva, stack detectado, características clave y requisitos externos en lenguaje de negocio.
- **Bilingüe de verdad** — switch EN/ES en la interfaz; el backend genera el contenido en el idioma pedido (traduce automáticamente desde chino, ruso, español, inglés, etc.).
- **Instalador Inteligente** — al hacer clic en Instalar se descarga un script (`.bat` para Windows, un `.sh` con autodetección de sistema para macOS/Linux) hecho para ese repo: verifica Git y el runtime correcto, instala lo que falte con el gestor nativo del sistema (winget / Homebrew / apt / dnf / pacman), clona el repo a tu Escritorio, instala sus dependencias y lo arranca. Ver [Seguridad y legal](#security--legal) — esto ejecuta código real de un tercero.
- **Degradación honesta** — si la IA no está disponible, se muestra un badge de "Análisis pendiente" en vez de texto crudo o una ficha rota.
- **Consciente de cuotas gratuitas** — ritmo y timeout configurables para las llamadas al LLM.

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

Variables de entorno: ver la tabla en inglés más arriba — son las mismas claves (`AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_RATE_LIMIT_SECONDS`, `AI_CALL_TIMEOUT_SECONDS`, `GITHUB_TOKEN`, `CORS_ORIGINS`).

### Seguridad

**Lee esto antes de usar el Instalador Inteligente:** descarga y ejecuta un script que clona y corre código real de un repositorio de terceros en tu computadora. Sanitizamos el script que generamos (sin patrones destructivos/de red, sin comandos de instalación escritos por la IA), pero no podemos auditar el código fuente del repositorio ni sus dependencias. Úsalo solo con repos de autores en los que confíes.

Ver el [manual visual](https://app-repositorio-github-one.vercel.app/manual.html), los [Términos](https://app-repositorio-github-one.vercel.app/terminos.html) y la [Política de Privacidad](https://app-repositorio-github-one.vercel.app/privacidad.html) — ambos documentos son borradores en lenguaje claro, **no asesoría legal profesional**.

</details>
