# 🚀 OpenStore: GitHub AI Explorer

*(English version below / Versión en inglés abajo)*

[![Frontend](https://img.shields.io/badge/frontend-Vercel-black?logo=vercel)](https://app-repositorio-github-one.vercel.app)
[![Backend](https://img.shields.io/badge/backend-Render-46E3B7?logo=render)](https://app-repositorio-github.onrender.com/health)
[![Stack](https://img.shields.io/badge/stack-React%20%2B%20FastAPI-blue)](#-stack-tecnológico)
[![AI](https://img.shields.io/badge/AI-Google%20Gemini-orange?logo=google)](https://aistudio.google.com/)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](./LICENSE)

## 🇪🇸 Español

**Demo en vivo:** https://app-repositorio-github-one.vercel.app

Una "App Store" para repositorios de GitHub: buscas por palabra clave, por usuario o pegando una URL, y una IA (Google Gemini, capa gratuita) lee el README técnico y lo convierte en una ficha comercial fácil de entender — sin jerga de programador — con inglés como idioma por defecto y español como alternativa.

![Vista de la plataforma](./docs/img/screenshot.png)

### ✨ Características

* **Búsqueda global de GitHub:** por palabra clave, pegando la URL de un repo, o con `@usuario` / `github.com/usuario` para listar los repos de una persona u organización, siempre ordenados por estrellas.
* **Fichas comerciales con IA:** el README técnico se traduce y resume en una propuesta de valor persuasiva, tecnologías detectadas, características clave y requisitos externos en lenguaje de negocio.
* **Bilingüe de verdad:** switch EN/ES en la interfaz; el backend genera el contenido en el idioma pedido (traduce automáticamente desde chino, ruso, español, inglés, etc.), no solo traduce la UI.
* **Degradación honesta:** si la IA no está disponible (sin cuota, sin key), se muestra un badge de "Análisis pendiente" en vez de texto crudo en otro idioma o una ficha rota.
* **Respeta cuotas gratuitas:** ritmo de llamadas al LLM configurable (`AI_RATE_LIMIT_SECONDS`) para no exceder la capa gratuita del proveedor.

### 🛠️ Stack Tecnológico

* **Frontend:** React 19, Tailwind CSS 4, Vite. Desplegado en Vercel.
* **Backend:** Python, FastAPI, httpx. Desplegado en Render.
* **IA:** Google Gemini (`google-genai`), con soporte alternativo para OpenAI/Groq/Anthropic vía `AI_PROVIDER`.

### 🚀 Cómo correrlo en local

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

Variables de entorno del backend (`backend/.env.example`): `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_RATE_LIMIT_SECONDS`, `GITHUB_TOKEN` (opcional pero muy recomendado: sin él, la API de GitHub limita a 60 peticiones/hora; con un [token de solo lectura](https://github.com/settings/tokens) sube a 5,000/hora), `CORS_ORIGINS`.

---

## 🇬🇧 English

**Live demo:** https://app-repositorio-github-one.vercel.app

An "App Store" for GitHub repositories: search by keyword, by user, or by pasting a URL, and an AI (Google Gemini, free tier) reads the technical README and turns it into an easy-to-understand commercial pitch — no dev jargon — in English by default, with Spanish as an alternative.

![Platform view](./docs/img/screenshot.png)

### ✨ Features

* **Global GitHub search:** by keyword, by pasting a repo URL, or with `@username` / `github.com/username` to list a person's or organization's repos, sorted by stars.
* **AI-generated commercial pitches:** the technical README is translated and summarized into a persuasive value proposition, detected technologies, key features, and external requirements in plain business language.
* **Actually bilingual:** an EN/ES switch in the UI; the backend generates the content in the requested language (auto-translating from Chinese, Russian, Spanish, English, etc.), not just a UI-string swap.
* **Honest degradation:** if the AI is unavailable (no quota, no key), an "Analysis pending" badge is shown instead of raw text in a foreign script or a broken card.
* **Free-tier aware:** configurable pacing between LLM calls (`AI_RATE_LIMIT_SECONDS`) to stay within the provider's free quota.

### 🛠️ Tech Stack

* **Frontend:** React 19, Tailwind CSS 4, Vite. Deployed on Vercel.
* **Backend:** Python, FastAPI, httpx. Deployed on Render.
* **AI:** Google Gemini (`google-genai`), with alternate support for OpenAI/Groq/Anthropic via `AI_PROVIDER`.

### 🚀 Running it locally

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

Backend environment variables (`backend/.env.example`): `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_RATE_LIMIT_SECONDS`, `GITHUB_TOKEN` (optional but strongly recommended: without it GitHub's API caps you at 60 requests/hour; a [read-only token](https://github.com/settings/tokens) raises that to 5,000/hour), `CORS_ORIGINS`.
