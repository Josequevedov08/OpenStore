"""
App Store de GitHub — Backend (FastAPI)
---------------------------------------
Motor que: busca repos en GitHub -> extrae metadatos + README en paralelo ->
pasa el README a un LLM que genera la ficha comercial -> empaqueta y devuelve
un array JSON idéntico al mock del frontend.

Arranque:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import sys
import asyncio
import json
import os
import random
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Integración con Google Sheets (guardado automático de fichas).
try:
    import gspread
    from google.oauth2.service_account import Credentials as GCredentials
except Exception:  # pragma: no cover
    gspread = None
    GCredentials = None

GSHEETS_CREDENTIALS_FILE = "google-credentials.json"
GSHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
GSHEETS_DOC_ID = "1ALKxpWigLGn8nJUW0M1MiLAIqhn_Ift7q-JrNx5tSt0"

# Política de event loop compatible con subprocesos en Windows (Playwright/Crawl4AI).
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# SDK oficial vigente de Gemini (google-genai). Import diferido seguro si falta.
try:
    from google import genai as google_genai
    from google.genai import types as google_types
except Exception:  # pragma: no cover
    google_genai = None
    google_types = None

# Crawl4AI para extracción de contenido desde URLs directas. Import diferido seguro.
try:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
except Exception:  # pragma: no cover
    AsyncWebCrawler = None
    BrowserConfig = None
    CrawlerRunConfig = None
    CacheMode = None

load_dotenv()

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
AI_PROVIDER = os.getenv("AI_PROVIDER", "openai").lower()
AI_API_KEY = os.getenv("AI_API_KEY", "")
# Modelo por defecto según proveedor (lee AI_MODEL del .env si se define)
DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-sonnet-latest",
    "groq": "llama3-8b-8192",
    "gemini": "gemini-2.5-flash",
}
AI_MODEL = os.getenv("AI_MODEL") or DEFAULT_MODELS.get(AI_PROVIDER, "gpt-4o-mini")

# Cliente oficial de Gemini (SDK google-genai)
if AI_PROVIDER == "gemini" and AI_API_KEY and google_genai is not None:
    GEMINI_CLIENT = google_genai.Client(api_key=AI_API_KEY)
else:
    GEMINI_CLIENT = None

CORS_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
]

GITHUB_API = "https://api.github.com"
HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "app-store-github",
}
if GITHUB_TOKEN:
    HEADERS["Authorization"] = f"Bearer {GITHUB_TOKEN}"

# Imágenes de respaldo por si el LLM no propone ninguna (tecnología/abstracto)
UNSPLASH_FALLBACK = [
    "https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=800&auto=format&fit=crop",
]

app = FastAPI(title="App Store de GitHub — Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BusquedaRequest(BaseModel):
    query: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def formato_relativo(fecha_iso: Optional[str]) -> str:
    """Convierte una fecha ISO de GitHub a texto relativo en español."""
    if not fecha_iso:
        return "Fecha desconocida"
    try:
        dt = datetime.fromisoformat(fecha_iso.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        delta = (now - dt).total_seconds()
        if delta < 3600:
            return f"Hace {int(delta // 60)} min"
        if delta < 86400:
            return f"Hace {int(delta // 3600)} h"
        dias = int(delta // 86400)
        if dias == 1:
            return "Ayer"
        if dias < 30:
            return f"Hace {dias} días"
        meses = dias // 30
        if meses < 12:
            return f"Hace {meses} meses"
        return f"Hace {meses // 12} años"
    except Exception:
        return "Fecha desconocida"


def extraer_repo_data(repo: dict) -> dict:
    """Extrae los campos crudos que necesitamos de un item de GitHub."""
    owner = (repo.get("owner") or {}).get("login", "")
    licencia = (repo.get("license") or {}).get("spdx_id") or "MIT"
    return {
        "id": str(repo.get("id", "")),
        "full_name": repo.get("full_name", ""),
        "owner": owner,
        "name": repo.get("name", ""),
        "html_url": repo.get("html_url", ""),
        "description": repo.get("description") or "",
        "stargazers_count": repo.get("stargazers_count", 0),
        "forks_count": repo.get("forks_count", 0),
        "open_issues_count": repo.get("open_issues_count", 0),
        "language": repo.get("language") or "Desconocido",
        "license": licencia,
        "default_branch": repo.get("default_branch", "main"),
        "updated_at": repo.get("updated_at", ""),
        "pushed_at": repo.get("pushed_at", ""),
    }


# ---------------------------------------------------------------------------
# Fase 1: Búsqueda quirúrgica en GitHub (con enrutador inteligente)
# ---------------------------------------------------------------------------
import re

URL_RE = re.compile(r"github\.com/([^/\s]+)/([^/\s?#]+)")


async def buscar_repositorios(client: httpx.AsyncClient, query: str, per_page: int = 12) -> list:
    q = query.strip()

    # --- Ruta A: URL directa a un repo (owner/repo) ---
    m = URL_RE.search(q)
    if m:
        owner, repo = m.group(1), m.group(2).replace(".git", "")
        try:
            resp = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}", timeout=15)
            if resp.status_code == 200:
                return [resp.json()]
            # Si falla (404, privado, etc.) no rompemos: caemos a búsqueda normal.
        except Exception as e:
            print(f"[FASE 1] URL repo falló, probando búsqueda normal: {e}")

    # --- Ruta B: búsqueda normal (el filtro user: ya va dentro del query) ---
    params = {
        "q": q,
        "sort": "stars",
        "order": "desc",
        "per_page": per_page,
    }
    try:
        resp = await client.get(f"{GITHUB_API}/search/repositories", params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return data.get("items", [])
    except Exception as e:
        print(f"[FASE 1] Error buscando repos: {e}")
        return []


# ---------------------------------------------------------------------------
# Fase 2: Extracción en paralelo (metadatos + README)
# ---------------------------------------------------------------------------
async def obtener_readme(client: httpx.AsyncClient, repo: dict) -> str:
    """Descarga el README crudo. Devuelve '' si no existe."""
    full = repo.get("full_name", "")
    if not full:
        return ""
    # GitHub resuelve automáticamente README.md / README.rst / etc.
    url = f"{GITHUB_API}/repos/{full}/readme"
    try:
        resp = await client.get(url, params={"ref": repo.get("default_branch", "main")}, timeout=12)
        if resp.status_code == 404:
            return ""
        resp.raise_for_status()
        data = resp.json()
        # El contenido viene en base64
        import base64
        content = data.get("content", "")
        encoding = data.get("encoding", "base64")
        if encoding == "base64" and content:
            return base64.b64decode(content).decode("utf-8", errors="ignore")
        return content
    except Exception:
        return ""


async def extraer_repo_completo(client: httpx.AsyncClient, repo: dict) -> dict:
    """
    Por cada repo: metadatos (ya los tenemos en 'repo') + README en paralelo.
    Devuelve un dict con repo_data y readme. Si falla, retorna None para
    ser descartado silenciosamente.
    """
    try:
        repo_data = extraer_repo_data(repo)
        readme = await obtener_readme(client, repo)
        return {"repo_data": repo_data, "readme": readme}
    except Exception as e:
        print(f"[FASE 2] Descartando {repo.get('full_name','?')}: {e}")
        return None


# ---------------------------------------------------------------------------
# Fase 3: Motor de comprensión (LLM)
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = (
    "Eres un redactor comercial de software B2B y un analista técnico. "
    "REGLA CRÍTICA Y OBLIGATORIA: Todo el contenido generado, absolutamente todo, "
    "DEBE estar en Español. Si el repositorio original está en Inglés o Chino, debes "
    "traducirlo y adaptarlo al Español. Cero excepciones. "
    "ACTÚAS COMO UN TRADUCTOR NATIVO AL ESPAÑOL Y REDACTOR COMERCIAL. "
    "DEBES TRADUCIR TODO EL CONTENIDO DEL INGLÉS, CHINO O CUALQUIER OTRO IDIOMA EXTRANJERO AL ESPAÑOL. "
    "LA SALIDA DEBE SER EXCLUSIVAMENTE UN OBJETO JSON VÁLIDO, SIN MARKDOWN, SIN TEXTO ANTES NI DESPUÉS. "
    "Lee este README técnico de un repositorio de GitHub y devuelve un JSON estricto "
    "que transforme el contenido técnico en una ficha comercial persuasiva. "
    "NO devuelvas markdown, ni explicaciones, SOLO el objeto JSON.\n\n"
    "REGLAS OBLIGATORIAS:\n"
    "1) IDIOMA ESTRICTO: TODA la salida del JSON debe estar en ESPAÑOL. Traduce automáticamente "
    "cualquier texto en inglés, chino, ruso u otro idioma.\n"
    "2) ESTRUCTURA de 'propuesta_valor' (string, redacta como texto continuo persuasivo):\n"
    "   - Un HOOK inicial corto y llamativo (1 frase).\n"
    "   - Qué es y para qué sirve.\n"
    "   - Cómo funciona brevemente (mecánica simple).\n"
    "   - Un CTA final que explique por qué el usuario debería instalarlo.\n"
    "3) 'requisitos_externos' (array de strings): NO listes tecnologías sueltas. Explica en lenguaje "
    "de negocio qué necesita el usuario para que funcione, por ejemplo: 'Una API Key de OpenAI con saldo', "
    "'Tener Node.js instalado en el servidor', 'Cuenta de GitHub con permisos de lectura'.\n"
    "4) 'tecnologias' (array de strings): lenguajes/frameworks detectados.\n"
    "5) 'caracteristicas' (array de strings): exactamente 3 funciones clave en español.\n"
    "6) 'imagen_url': una URL de imagen de Unsplash relacionada con tecnología/software.\n\n"
    "ESTRUCTURA JSON EXACTA:\n"
    "{\n"
    '  "titulo_comercial": string (nombre atractivo en español),\n'
    '  "propuesta_valor": string (hook + qué es + cómo funciona + CTA, en español),\n'
    '  "tecnologias": [string, ...],\n'
    '  "caracteristicas": [string, string, string],\n'
    '  "requisitos_externos": [string, ...],\n'
    '  "imagen_url": string\n'
    "}"
)


def _cliente_ia():
    """Devuelve un cliente según el proveedor configurado."""
    if not AI_API_KEY:
        raise RuntimeError("Falta AI_API_KEY para usar el proveedor de IA.")

    if AI_PROVIDER == "anthropic":
        try:
            import anthropic  # type: ignore
        except ImportError:
            raise RuntimeError("Instala 'anthropic' para usar AI_PROVIDER=anthropic")
        return anthropic.AsyncAnthropic(api_key=AI_API_KEY)

    if AI_PROVIDER == "groq":
        from openai import AsyncOpenAI
        # Groq es compatible con la API de OpenAI: solo cambiamos el base_url.
        return AsyncOpenAI(
            api_key=AI_API_KEY,
            base_url="https://api.groq.com/openai/v1",
        )

    # openai (por defecto)
    from openai import AsyncOpenAI
    return AsyncOpenAI(api_key=AI_API_KEY)


async def procesar_readme_con_ia(readme_text: str, repo_data: dict) -> Optional[dict]:
    """
    Envía el README al LLM y parsea la ficha comercial.
    Si no hay API key o falla, devuelve None (se usará un fallback).
    """
    if not AI_API_KEY:
        return None

    # Acotamos el README para no saturar el contexto (primeras ~6000 chars)
    readme_trunc = (readme_text or "")[:6000]
    user_prompt = (
        f"REPOSITORIO: {repo_data.get('full_name')}\n"
        f"DESCRIPCIÓN ORIGINAL: {repo_data.get('description')}\n"
        f"LENGUAJE PRINCIPAL: {repo_data.get('language')}\n\n"
        "INSTRUCCIÓN: Analiza el README siguiente y responde ÚNICAMENTE en español, "
        "siguiendo el formato comercial exigido en el system prompt.\n\n"
        f"README:\n{readme_trunc}"
    )

    try:
        # --- Flujo oficial Gemini (SDK google-genai) ---
        if AI_PROVIDER == "gemini":
            if google_genai is None or GEMINI_CLIENT is None:
                raise RuntimeError("Instala 'google-genai' para usar AI_PROVIDER=gemini")
            response = await GEMINI_CLIENT.aio.models.generate_content(
                model=AI_MODEL,
                contents=f"{SYSTEM_PROMPT}\n\n{user_prompt}",
                config=google_types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            content = response.text
        else:
            client = _cliente_ia()
            if AI_PROVIDER == "anthropic":
                msg = await client.messages.create(
                    model=AI_MODEL,
                    max_tokens=800,
                    system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_prompt}],
                )
                content = msg.content[0].text
            else:
                resp = await client.chat.completions.create(
                    model=AI_MODEL,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.3,
                    response_format={"type": "json_object"},
                )
                content = resp.choices[0].message.content

        # Limpieza exhaustiva del JSON: elimina fences markdown ```json ... ```, backticks sueltos,
        # espacios, y cualquier texto antes/después del objeto JSON.
        content = content.strip()
        # Caso 1: envuelto en ```json ... ``` o ``` ... ```
        if content.startswith("```"):
            parts = content.split("```")
            if len(parts) >= 3:
                content = parts[1]
                if content.lower().startswith("json"):
                    content = content[4:]
        # Caso 2: el modelo devuelve texto + JSON + texto (extraemos el primer { ... } balanceado)
        content = content.strip()
        if content.startswith("{") and content.endswith("}"):
            pass  # ya es un objeto JSON limpio
        else:
            # Buscamos el primer { y el último } y nos quedamos con ese rango
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1 and end > start:
                content = content[start : end + 1]
        data = json.loads(content)
        return data
    except Exception as e:
        print(f"[FASE 3] LLM falló para {repo_data.get('full_name')}: {e}")
        return None


# ---------------------------------------------------------------------------
# Fase 4: Empaquetado
# ---------------------------------------------------------------------------
def construir_ficha(repo_data: dict, ia_data: Optional[dict], readme: str) -> dict:
    """Une los datos crudos de GitHub con la ficha del LLM (o fallback)."""
    if not ia_data:
        # Fallback sin IA: derivamos algo usable del repo real.
        # Truncamos a 400 chars para no romper Sheets (límite 50k/célula) ni la UI.
        raw_desc = repo_data["description"] or "Solución open-source lista para tu negocio."
        truncated = raw_desc if len(raw_desc) <= 400 else raw_desc[:397] + "..."
        ia_data = {
            "titulo_comercial": repo_data["name"].replace("-", " ").title(),
            "propuesta_valor": "[No procesado por IA] " + truncated,
            "tecnologias": [repo_data["language"]] if repo_data["language"] != "Desconocido" else [],
            "caracteristicas": ["Integración lista para usar", "Código abierto", "Comunidad activa"],
            "requisitos_externos": ["Cuenta de GitHub", f"Entorno {repo_data['language']}"],
            "imagen_url": "",
        }

    imagen = ia_data.get("imagen_url") or random.choice(UNSPLASH_FALLBACK)

    return {
        "id": repo_data.get("id") or repo_data.get("full_name"),
        "titulo_comercial": ia_data.get("titulo_comercial") or repo_data["name"],
        "propuesta_valor": ia_data.get("propuesta_valor") or repo_data.get("description") or "",
        "tecnologias": ia_data.get("tecnologias") or [],
        "caracteristicas": ia_data.get("caracteristicas") or [],
        "requisitos_externos": ia_data.get("requisitos_externos") or [],
        "estrellas": repo_data.get("stargazers_count", 0),
        "ultima_actualizacion": formato_relativo(
            repo_data.get("pushed_at") or repo_data.get("updated_at")
        ),
        "autor": repo_data.get("owner") or "",
        "licencia": repo_data.get("license") or "MIT",
        "version": f"v1.0.0",
        "forks": repo_data.get("forks_count", 0),
        # open_issues_count incluye PRs en GitHub; lo aproximamos.
        "pull_requests": max(0, repo_data.get("open_issues_count", 0) // 4),
        "issues_abiertos": repo_data.get("open_issues_count", 0),
        "lenguaje_principal": repo_data.get("language") or "Desconocido",
        "imagen_url": imagen,
        "repo_url": repo_data.get("html_url") or "",
    }


# ---------------------------------------------------------------------------
# Extracción vía Crawl4AI (cuando el query es una URL directa)
# ---------------------------------------------------------------------------
async def extraer_markdown_crawl4ai(url: str) -> str:
    """Visita la URL con un navegador headless y devuelve el Markdown limpio."""
    if AsyncWebCrawler is None:
        raise RuntimeError("Instala 'crawl4ai' para procesar URLs directas.")

    browser_cfg = BrowserConfig(headless=True)
    run_cfg = CrawlerRunConfig(cache_mode=CacheMode.BYPASS)
    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        result = await crawler.arun(url=url, config=run_cfg)
        if getattr(result, "success", False):
            return result.markdown or ""
        print(f"[CRAWL4AI] Falló extracción de {url}: {getattr(result, 'error_message', 'unknown')}")
        return ""


def _repo_data_desde_url(url: str) -> dict:
    """Construye un repo_data mínimo a partir de una URL para no romper construir_ficha."""
    from urllib.parse import urlparse

    parsed = urlparse(url)
    nombre = parsed.path.strip("/").split("/")[-1] or parsed.netloc
    return {
        "id": url,
        "full_name": parsed.netloc + parsed.path,
        "owner": parsed.netloc,
        "name": nombre,
        "html_url": url,
        "description": f"Contenido extraído desde {url}",
        "stargazers_count": 0,
        "forks_count": 0,
        "open_issues_count": 0,
        "language": "Desconocido",
        "license": "MIT",
        "default_branch": "main",
        "updated_at": "",
        "pushed_at": "",
    }


# ---------------------------------------------------------------------------
# Guardado automático en Google Sheets
# ---------------------------------------------------------------------------
def _guardar_en_sheets(fila: list) -> None:
    """Agrega una fila al documento compartido. Función síncrona (se corre en to_thread)."""
    if gspread is None or GCredentials is None:
        print("[SHEETS] gspread no disponible; se omite el guardado.")
        return
    try:
        creds = GCredentials.from_service_account_file(
            GSHEETS_CREDENTIALS_FILE, scopes=GSHEETS_SCOPES
        )
        cliente = gspread.authorize(creds)
        hoja = cliente.open_by_key(GSHEETS_DOC_ID).sheet1
        hoja.append_row(fila)
        print("[SHEETS] Fila guardada correctamente.")
    except Exception as e:
        print(f"[SHEETS] No se pudo guardar en Sheets: {e}")



# ---------------------------------------------------------------------------
# Endpoint principal
# ---------------------------------------------------------------------------
@app.post("/api/buscar-soluciones")
async def buscar_soluciones(payload: BusquedaRequest):
    query = (payload.query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="El campo 'query' es requerido.")

    # ---- RUTA CRAWL4AI: el query es una URL directa ----
    if query.lower().startswith("http://") or query.lower().startswith("https://"):
        try:
            markdown = await extraer_markdown_crawl4ai(query)
        except Exception as e:
            print(f"[CRAWL4AI] Error extrayendo {query}: {e}")
            return []
        if not markdown:
            return []

        # Metadatos híbridos: si es un repo de GitHub, enriquecemos repo_data
        # con la API real (estrellas, autor, forks...). Si falla, fallback local.
        repo_data = _repo_data_desde_url(query)
        m = URL_RE.search(query)
        if m:
            owner, repo = m.group(1), m.group(2).replace(".git", "")
            try:
                async with httpx.AsyncClient(headers=HEADERS, timeout=httpx.Timeout(15.0), follow_redirects=True) as gh:
                    resp = await gh.get(f"{GITHUB_API}/repos/{owner}/{repo}")
                    if resp.status_code == 200:
                        repo_data = extraer_repo_data(resp.json())
            except Exception as e:
                print(f"[CRAWL4AI] Metadatos GitHub no disponibles para {owner}/{repo}: {e}")
                # Mantiene repo_data del fallback local.

        ia = await procesar_readme_con_ia(markdown, repo_data)
        if not ia:
            return []
        ficha = construir_ficha(repo_data, ia, markdown)

        # Guardado automático en Google Sheets (no bloquea el loop; falla silencioso).
        fila = [
            repo_data.get("name"),
            query,
            ia.get("propuesta_valor") or ficha.get("propuesta_valor") or "",
            " | ".join(ia.get("caracteristicas") or []),
            " | ".join(ia.get("tecnologias") or []),
            f"{repo_data.get('owner')} / {repo_data.get('license')}",
            ficha.get("estrellas", 0),
            "Recién descubierto",
        ]
        try:
            await asyncio.to_thread(_guardar_en_sheets, fila)
        except Exception as e:
            print(f"[SHEETS] Error en guardado (no fatal): {e}")

        return [ficha]

    # ---- RUTA GITHUB: búsqueda normal / por usuario / URL de repo ----
    timeout = httpx.Timeout(20.0)
    async with httpx.AsyncClient(headers=HEADERS, timeout=timeout, follow_redirects=True) as client:
        # Fase 1
        repos = await buscar_repositorios(client, query, per_page=12)
        if not repos:
            return []  # Sin resultados -> array vacío (frontend muestra mock si quiere)

        # Fase 2: extracción paralela (metadatos ya van en el item + README)
        extraidos = await asyncio.gather(
            *(extraer_repo_completo(client, r) for r in repos)
        )
        # Descarta los que fallaron (None) silenciosamente
        extraidos = [e for e in extraidos if e]

        # Fase 3 + 4: procesar README con IA y empaquetar, DE FORMA SECUENCIAL
        # para respetar el límite de 15 RPM de Google AI Studio (capa gratuita).
        async def procesar(e):
            ia = await procesar_readme_con_ia(e["readme"], e["repo_data"])
            return construir_ficha(e["repo_data"], ia, e["readme"])

        fichas = []
        total = len(extraidos)
        for i, e in enumerate(extraidos, start=1):
            fichas.append(await procesar(e))
            print(f"[RATE LIMIT] Esperando 10s... (Ficha {i}/{total})")
            await asyncio.sleep(10)
        # Filtra cualquier None accidental
        fichas = [f for f in fichas if f]

        # Guardado automático en Google Sheets (una fila por ficha; no bloquea).
        async def _guardar_ficha(ficha):
            rd = next(
                (e["repo_data"] for e in extraidos if e.get("repo_data", {}).get("html_url") == ficha.get("repo_url")),
                {},
            )
            ia_datos = ficha  # la ficha ya mezcla datos de IA y crudos
            fila = [
                ficha.get("titulo_comercial"),
                ficha.get("repo_url") or query,
                ficha.get("propuesta_valor") or "",
                " | ".join(ficha.get("caracteristicas") or []),
                " | ".join(ficha.get("tecnologias") or []),
                f"{rd.get('owner') or ficha.get('autor')} / {rd.get('license') or ficha.get('licencia')}",
                ficha.get("estrellas", 0),
                "Recién descubierto",
            ]
            try:
                await asyncio.to_thread(_guardar_en_sheets, fila)
            except Exception as e:
                print(f"[SHEETS] Error en guardado (no fatal): {e}")

        await asyncio.gather(*(_guardar_ficha(f) for f in fichas))
        return fichas


@app.get("/health")
async def health():
    return {"status": "ok", "ai_configured": bool(AI_API_KEY), "github_token": bool(GITHUB_TOKEN)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
