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
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from instalador import (
    GESTORES_VALIDOS,
    generar_bat,
    generar_sh,
    normalizar_gestor,
    sanitizar_comando_arranque,
)

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


def _env_int(name: str, default: int) -> int:
    """Lee una variable de entorno numérica sin poder tumbar el servidor si
    alguien la puso mal (p.ej. "4.5" en un campo que espera un entero) —
    avisa por log y usa el valor por defecto en vez de lanzar una excepción
    en tiempo de import."""
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(float(raw))
    except ValueError:
        print(f"[CONFIG] {name}='{raw}' no es un número válido; usando {default}.")
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        print(f"[CONFIG] {name}='{raw}' no es un número válido; usando {default}.")
        return default


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
    # Free tier de Groq: rápido y generoso comparado con Gemini.
    "groq": "openai/gpt-oss-20b",
    # "-lite" es más limitado en capacidad, pero su cuota gratuita diaria es
    # muchísimo más generosa (probamos 12 llamadas en paralelo sin fallos).
    # gemini-3.6-flash "normal" solo permite 20 peticiones/día en la capa
    # gratuita: se agota con una sola búsqueda de 12 repos.
    "gemini": "gemini-flash-lite-latest",
}
AI_MODEL = os.getenv("AI_MODEL") or DEFAULT_MODELS.get(AI_PROVIDER, "gpt-4o-mini")

# Proveedor de respaldo (opcional): si el proveedor principal falla por
# cuota agotada, timeout, o cualquier error, reintentamos ESE repo puntual
# con un segundo proveedor/clave distintos en vez de rendirnos directo al
# fallback "Análisis pendiente". Combina la cuota gratuita de dos servicios
# distintos (p.ej. Gemini + Groq) en vez de agotar solo uno.
AI_FALLBACK_PROVIDER = os.getenv("AI_FALLBACK_PROVIDER", "").lower()
AI_FALLBACK_API_KEY = os.getenv("AI_FALLBACK_API_KEY", "")
AI_FALLBACK_MODEL = os.getenv("AI_FALLBACK_MODEL") or DEFAULT_MODELS.get(
    AI_FALLBACK_PROVIDER, ""
)

# ---------------------------------------------------------------------------
# Caché de búsquedas: la misma consulta + idioma no vuelve a gastar cuota de
# IA/GitHub dentro de la ventana de TTL. Es en memoria (se reinicia si el
# proceso se reinicia), suficiente para una sola instancia como esta.
# ---------------------------------------------------------------------------
SEARCH_CACHE_TTL_SECONDS = _env_int("SEARCH_CACHE_TTL_SECONDS", 900)  # 15 min
_SEARCH_CACHE_MAX_ENTRIES = 500
_search_cache: dict[str, tuple[float, list]] = {}


def _cache_key(query: str, idioma: str, pagina: int = 1, orden: str = "stars") -> str:
    return f"{idioma}:{orden}:{pagina}:{query.strip().lower()}"


def _cache_get(key: str) -> Optional[list]:
    entry = _search_cache.get(key)
    if not entry:
        return None
    ts, data = entry
    if time.time() - ts > SEARCH_CACHE_TTL_SECONDS:
        _search_cache.pop(key, None)
        return None
    return data


def _cache_set(key: str, data: list) -> None:
    _search_cache[key] = (time.time(), data)
    if len(_search_cache) > _SEARCH_CACHE_MAX_ENTRIES:
        oldest = min(_search_cache, key=lambda k: _search_cache[k][0])
        _search_cache.pop(oldest, None)


# ---------------------------------------------------------------------------
# Rate limiting simple por IP: evita que una sola persona (a propósito o por
# error, p.ej. un script) agote la cuota compartida de IA/GitHub. En memoria,
# suficiente para una sola instancia como esta.
# ---------------------------------------------------------------------------
RATE_LIMIT_MAX_PETICIONES = _env_int("RATE_LIMIT_MAX_PETICIONES", 10)
RATE_LIMIT_VENTANA_SEGUNDOS = _env_int("RATE_LIMIT_VENTANA_SEGUNDOS", 300)  # 5 min
_rate_limit_hits: dict[str, list[float]] = {}


def _check_rate_limit(ip: str) -> bool:
    """True si la IP puede seguir buscando; False si excedió el límite."""
    now = time.time()
    hits = _rate_limit_hits.setdefault(ip, [])
    while hits and hits[0] < now - RATE_LIMIT_VENTANA_SEGUNDOS:
        hits.pop(0)
    if len(hits) >= RATE_LIMIT_MAX_PETICIONES:
        return False
    hits.append(now)
    return True

# AQUI ESTA EL CAMBIO DE CORS APLICADO
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://app-repositorio-github-one.vercel.app"
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
    idioma: Optional[str] = "en"  # "en" (por defecto) o "es"
    pagina: Optional[int] = 1  # para "cargar más": trae la siguiente tanda
    orden: Optional[str] = "stars"  # "stars" (por defecto) o "updated"


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
        "language": repo.get("language") or "",
        "license": licencia,
        "default_branch": repo.get("default_branch", "main"),
        "updated_at": repo.get("updated_at", ""),
        "pushed_at": repo.get("pushed_at", ""),
    }


# ---------------------------------------------------------------------------
# Fase 1: Búsqueda quirúrgica en GitHub (con enrutador inteligente)
# ---------------------------------------------------------------------------
import re

URL_RE = re.compile(r"github\.com/([^/\s]+)/([^/\s?#]+)(?:/|$)")
# URL a un perfil/usuario de GitHub (sin segundo segmento de ruta), ej:
# "https://github.com/torvalds" o "github.com/torvalds/"
PROFILE_URL_RE = re.compile(r"^https?://github\.com/([^/\s?#]+)/?$", re.IGNORECASE)
# Atajo "@usuario" para buscar los repos de una persona/organización.
USERNAME_SHORTHAND_RE = re.compile(r"^@([A-Za-z0-9][A-Za-z0-9-]{0,38})$")


async def buscar_repositorios(
    client: httpx.AsyncClient,
    query: str,
    per_page: int = 12,
    pagina: int = 1,
    orden: str = "stars",
) -> list:
    q = query.strip()

    # --- Ruta A: URL directa a un repo (owner/repo) ---
    # Solo tiene sentido en la primera "página" — una URL de repo es un
    # resultado único, no algo de lo que se pueda "cargar más".
    if pagina <= 1:
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

    # --- Ruta A2: URL de perfil ("github.com/usuario") o atajo "@usuario" ---
    # En ambos casos reescribimos la consulta al calificador `user:` que ya
    # entiende la API de búsqueda de GitHub (Ruta B), para listar SUS repos
    # ordenados por estrellas en vez de hacer una búsqueda de texto libre.
    perfil = PROFILE_URL_RE.match(q) or USERNAME_SHORTHAND_RE.match(q)
    if perfil:
        q = f"user:{perfil.group(1)}"

    # Ordenar por "más reciente" solo (sin piso de estrellas) saca a la luz
    # repos personales de 0-1 estrellas que apenas coinciden con el texto —
    # no lo que alguien espera al pedir "recientes" en una app de descubrir
    # software de calidad. Si el usuario no puso ya su propio filtro
    # "stars:", le agregamos uno razonable para que "recientes" siga
    # significando "recientes y con tracción real".
    if orden == "updated" and "stars:" not in q.lower():
        q = f"{q} stars:>50"

    # --- Ruta B: búsqueda normal en todo GitHub (soporta calificadores como
    # "user:usuario", "language:python", "stars:>100", etc.) ---
    params = {
        "q": q,
        "sort": "stars" if orden not in ("stars", "updated") else orden,
        "order": "desc",
        "per_page": per_page,
        "page": max(1, pagina),
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
# Idioma de salida por defecto de toda la plataforma. El frontend puede pedir
# "es" explícitamente vía el campo `idioma` del payload.
DEFAULT_IDIOMA = "en"


def get_system_prompt(idioma: str) -> str:
    """Devuelve el system prompt del LLM en inglés (por defecto) o español.

    En ambos casos la regla es la misma: traducir automáticamente CUALQUIER
    idioma de origen (chino, ruso, español, inglés, etc.) al idioma de salida
    solicitado.
    """
    if idioma == "es":
        return (
            "Eres un redactor comercial de software B2B y un analista técnico. "
            "REGLA CRÍTICA Y OBLIGATORIA: Todo el contenido generado, absolutamente todo, "
            "DEBE estar en Español. Si el repositorio original está en Inglés, Chino, Ruso "
            "o cualquier otro idioma, debes traducirlo y adaptarlo al Español. Cero excepciones. "
            "ACTÚAS COMO UN TRADUCTOR NATIVO AL ESPAÑOL Y REDACTOR COMERCIAL. "
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
            "6) 'imagen_url': una URL de imagen de Unsplash relacionada con tecnología/software.\n"
            "7) 'gestor_paquetes': lee la sección de instalación/setup del README e identifica QUÉ "
            "gestor de paquetes usa este proyecto. Responde EXACTAMENTE una de estas palabras: "
            "npm, yarn, pnpm, pip, poetry, cargo, go, bundler, composer, dotnet, docker, none "
            "(usa 'none' si no es claro). NO inventes otro valor.\n"
            "8) 'comando_arranque': el comando exacto para INICIAR la app tal como aparece en el "
            "README (ej: 'npm run dev', 'python main.py', 'docker compose up'). Cadena corta y "
            "literal, sin explicaciones. Si no lo encuentras, deja \"\".\n\n"
            "ESTRUCTURA JSON EXACTA:\n"
            "{\n"
            '  "titulo_comercial": string (nombre atractivo en español),\n'
            '  "propuesta_valor": string (hook + qué es + cómo funciona + CTA, en español),\n'
            '  "tecnologias": [string, ...],\n'
            '  "caracteristicas": [string, string, string],\n'
            '  "requisitos_externos": [string, ...],\n'
            '  "imagen_url": string,\n'
            '  "gestor_paquetes": string,\n'
            '  "comando_arranque": string\n'
            "}"
        )

    # Inglés (idioma por defecto de la plataforma).
    return (
        "You are a B2B software copywriter and technical analyst. "
        "CRITICAL AND MANDATORY RULE: All generated content, absolutely all of it, "
        "MUST be in English. If the original repository is in Chinese, Russian, Spanish "
        "or any other language, you must translate and adapt it into English. No exceptions. "
        "YOU ACT AS A NATIVE ENGLISH TRANSLATOR AND COMMERCIAL COPYWRITER. "
        "YOU MUST TRANSLATE ALL CONTENT FROM CHINESE, SPANISH, RUSSIAN OR ANY OTHER FOREIGN "
        "LANGUAGE INTO ENGLISH. "
        "THE OUTPUT MUST BE EXCLUSIVELY A VALID JSON OBJECT, NO MARKDOWN, NO TEXT BEFORE OR AFTER. "
        "Read this technical GitHub repository README and return a strict JSON object that turns "
        "the technical content into a persuasive commercial pitch. "
        "DO NOT return markdown or explanations, ONLY the JSON object.\n\n"
        "MANDATORY RULES:\n"
        "1) STRICT LANGUAGE: ALL of the JSON output must be in ENGLISH. Automatically translate "
        "any text in Spanish, Chinese, Russian or any other language.\n"
        "2) STRUCTURE of 'propuesta_valor' (string, write as persuasive continuous copy):\n"
        "   - A short, catchy opening HOOK (1 sentence).\n"
        "   - What it is and what it's for.\n"
        "   - How it briefly works (simple mechanics).\n"
        "   - A final CTA explaining why the user should install it.\n"
        "3) 'requisitos_externos' (array of strings): do NOT just list raw technologies. Explain in "
        "business language what the user needs for it to work, e.g. 'An OpenAI API key with credit', "
        "'Node.js installed on the server', 'A GitHub account with read permissions'.\n"
        "4) 'tecnologias' (array of strings): detected languages/frameworks.\n"
        "5) 'caracteristicas' (array of strings): exactly 3 key features in English.\n"
        "6) 'imagen_url': an Unsplash image URL related to technology/software.\n"
        "7) 'gestor_paquetes': read the install/setup section of the README and identify WHICH "
        "package manager this project uses. Reply with EXACTLY one of these words: "
        "npm, yarn, pnpm, pip, poetry, cargo, go, bundler, composer, dotnet, docker, none "
        "(use 'none' if unclear). Do NOT invent another value.\n"
        "8) 'comando_arranque': the exact command to START the app as it appears in the README "
        "(e.g. 'npm run dev', 'python main.py', 'docker compose up'). Short, literal string, no "
        "explanations. If you can't find it, leave it as \"\".\n\n"
        "EXACT JSON STRUCTURE:\n"
        "{\n"
        '  "titulo_comercial": string (catchy product name, in English),\n'
        '  "propuesta_valor": string (hook + what it is + how it works + CTA, in English),\n'
        '  "tecnologias": [string, ...],\n'
        '  "caracteristicas": [string, string, string],\n'
        '  "requisitos_externos": [string, ...],\n'
        '  "imagen_url": string,\n'
        '  "gestor_paquetes": string,\n'
        '  "comando_arranque": string\n'
        "}"
    )


# Cuántas llamadas al LLM se disparan EN PARALELO por búsqueda (no en serie).
# Para ~12 repos por búsqueda esto sigue muy por debajo del límite por minuto
# del free tier de cualquier proveedor (p.ej. 15 RPM de Gemini), y evita el
# tiempo de espera de 60-90s+ que causaba timeouts en producción.
DEFAULT_CONCURRENCY = {"gemini": 10, "groq": 10, "openai": 8, "anthropic": 8}
AI_CONCURRENCY = _env_int("AI_CONCURRENCY", DEFAULT_CONCURRENCY.get(AI_PROVIDER, 4))
# Tiempo máximo de espera por una respuesta del LLM antes de rendirse y caer
# al fallback. Sin esto, una llamada colgada bloquearía toda la búsqueda.
AI_CALL_TIMEOUT_SECONDS = _env_float("AI_CALL_TIMEOUT_SECONDS", 30.0)


def _cliente_ia(provider: str, api_key: str):
    """Devuelve un cliente async para el proveedor y clave indicados."""
    if not api_key:
        raise RuntimeError(f"Falta la API key para el proveedor '{provider}'.")

    if provider == "anthropic":
        try:
            import anthropic  # type: ignore
        except ImportError:
            raise RuntimeError("Instala 'anthropic' para usar ese proveedor.")
        return anthropic.AsyncAnthropic(api_key=api_key)

    if provider == "groq":
        from openai import AsyncOpenAI
        # Groq es compatible con la API de OpenAI: solo cambiamos el base_url.
        return AsyncOpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")

    # openai (por defecto)
    from openai import AsyncOpenAI
    return AsyncOpenAI(api_key=api_key)


async def _llamar_llm(provider: str, api_key: str, model: str, system_prompt: str, user_prompt: str) -> str:
    """Llama al LLM del proveedor indicado y devuelve el texto crudo de la respuesta."""
    if provider == "gemini":
        if google_genai is None:
            raise RuntimeError("Instala 'google-genai' para usar ese proveedor.")
        if not api_key:
            raise RuntimeError("Falta la API key para el proveedor 'gemini'.")
        cliente = google_genai.Client(api_key=api_key)
        response = await cliente.aio.models.generate_content(
            model=model,
            contents=f"{system_prompt}\n\n{user_prompt}",
            config=google_types.GenerateContentConfig(response_mime_type="application/json"),
        )
        return response.text

    client = _cliente_ia(provider, api_key)
    if provider == "anthropic":
        msg = await client.messages.create(
            model=model,
            max_tokens=800,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return msg.content[0].text

    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    return resp.choices[0].message.content


def _extraer_json(content: str) -> dict:
    """Limpieza exhaustiva del JSON: elimina fences markdown ```json ... ```,
    backticks sueltos, espacios, y cualquier texto antes/después del objeto."""
    content = content.strip()
    # Caso 1: envuelto en ```json ... ``` o ``` ... ```
    if content.startswith("```"):
        parts = content.split("```")
        if len(parts) >= 3:
            content = parts[1]
            if content.lower().startswith("json"):
                content = content[4:]
    content = content.strip()
    if content.startswith("{") and content.endswith("}"):
        pass  # ya es un objeto JSON limpio
    else:
        # Caso 2: el modelo devuelve texto + JSON + texto (extraemos el
        # primer { ... } balanceado)
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            content = content[start : end + 1]
    return json.loads(content)


async def procesar_readme_con_ia(
    readme_text: str, repo_data: dict, idioma: str = DEFAULT_IDIOMA
) -> Optional[dict]:
    """
    Envía el README al LLM y parsea la ficha comercial. Intenta primero el
    proveedor principal (AI_PROVIDER); si falla (cuota, timeout, error) y hay
    un proveedor de respaldo configurado (AI_FALLBACK_PROVIDER), reintenta
    ESE repo puntual con el respaldo antes de rendirse. Si nada funciona,
    devuelve None (se usará la ficha de fallback "Análisis pendiente").
    """
    intentos = [(AI_PROVIDER, AI_API_KEY, AI_MODEL)]
    if AI_FALLBACK_PROVIDER and AI_FALLBACK_API_KEY:
        intentos.append((AI_FALLBACK_PROVIDER, AI_FALLBACK_API_KEY, AI_FALLBACK_MODEL))

    if not any(key for _, key, _ in intentos):
        print(
            "[FASE 3] AI_API_KEY no configurada: define AI_PROVIDER y AI_API_KEY "
            "en backend/.env para activar el procesamiento con IA."
        )
        return None

    idioma = "es" if idioma == "es" else "en"
    system_prompt = get_system_prompt(idioma)

    # Acotamos el README para no saturar el contexto (primeras ~6000 chars)
    readme_trunc = (readme_text or "")[:6000]
    instruccion = (
        "INSTRUCTION: Analyze the following README and answer ONLY in English, "
        "following the commercial format required in the system prompt."
        if idioma == "en"
        else "INSTRUCCIÓN: Analiza el README siguiente y responde ÚNICAMENTE en español, "
        "siguiendo el formato comercial exigido en el system prompt."
    )
    user_prompt = (
        f"REPOSITORIO: {repo_data.get('full_name')}\n"
        f"DESCRIPCIÓN ORIGINAL: {repo_data.get('description')}\n"
        f"LENGUAJE PRINCIPAL: {repo_data.get('language') or 'not detected'}\n\n"
        f"{instruccion}\n\n"
        f"README:\n{readme_trunc}"
    )

    for provider, api_key, model in intentos:
        if not api_key:
            continue
        try:
            content = await asyncio.wait_for(
                _llamar_llm(provider, api_key, model, system_prompt, user_prompt),
                timeout=AI_CALL_TIMEOUT_SECONDS,
            )
            return _extraer_json(content)
        except asyncio.TimeoutError:
            print(
                f"[FASE 3] {provider} excedió {AI_CALL_TIMEOUT_SECONDS}s para "
                f"{repo_data.get('full_name')}."
            )
        except Exception as e:
            print(f"[FASE 3] {provider} falló para {repo_data.get('full_name')}: {type(e).__name__}: {e}")
        # Si queda otro proveedor en la lista, seguimos al siguiente intento;
        # si era el último, el bucle termina y devolvemos None abajo.

    return None


# ---------------------------------------------------------------------------
# Fase 4: Empaquetado
# ---------------------------------------------------------------------------
# Rangos Unicode de escrituras no latinas (CJK, cirílico, árabe, hangul...).
# Si la descripción cruda de GitHub cae aquí y la IA no está disponible para
# traducirla, NO la mostramos crudo: usamos un texto genérico en su lugar.
_NON_LATIN_SCRIPT_RE = re.compile(
    "[぀-ヿ㐀-䶿一-鿿가-힯Ѐ-ӿ؀-ۿ]"
)


def _contiene_script_no_latino(texto: str) -> bool:
    return bool(texto) and bool(_NON_LATIN_SCRIPT_RE.search(texto))


def construir_ficha(
    repo_data: dict, ia_data: Optional[dict], readme: str, idioma: str = DEFAULT_IDIOMA
) -> dict:
    """Une los datos crudos de GitHub con la ficha del LLM (o fallback)."""
    idioma = "es" if idioma == "es" else "en"
    # "language" viene vacío de GitHub cuando no pudo detectarlo — el texto
    # de reemplazo debe respetar el idioma pedido, no estar fijo en español.
    idioma_desconocido = "Desconocido" if idioma == "es" else "Unknown"
    lenguaje = repo_data.get("language") or ""

    if not ia_data:
        # Fallback sin IA: derivamos algo usable del repo real, sin exponer
        # texto crudo en un idioma/escritura que el usuario no pueda leer.
        if idioma == "es":
            default_desc = "Solución open-source lista para tu negocio."
            no_latin_desc = "Descripción original no disponible en este idioma por ahora."
            tag = "🤖 Análisis pendiente. "
            caracteristicas = ["Integración lista para usar", "Código abierto", "Comunidad activa"]
            requisitos = ["Cuenta de GitHub", f"Entorno {lenguaje or idioma_desconocido}"]
        else:
            default_desc = "Open-source solution ready for your business."
            no_latin_desc = "Original description not available in this language yet."
            tag = "🤖 Analysis pending. "
            caracteristicas = ["Ready-to-use integration", "Open source", "Active community"]
            requisitos = ["GitHub account", f"{lenguaje or idioma_desconocido} environment"]

        raw_desc = repo_data["description"] or default_desc
        if _contiene_script_no_latino(raw_desc):
            raw_desc = no_latin_desc
        # Truncamos a 400 chars para no romper Sheets (límite 50k/célula) ni la UI.
        truncated = raw_desc if len(raw_desc) <= 400 else raw_desc[:397] + "..."
        ia_data = {
            "titulo_comercial": repo_data["name"].replace("-", " ").title(),
            "propuesta_valor": tag + truncated,
            "tecnologias": [lenguaje] if lenguaje else [],
            "caracteristicas": caracteristicas,
            "requisitos_externos": requisitos,
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
        "forks": repo_data.get("forks_count", 0),
        # open_issues_count incluye PRs en GitHub; lo aproximamos.
        "pull_requests": max(0, repo_data.get("open_issues_count", 0) // 4),
        "issues_abiertos": repo_data.get("open_issues_count", 0),
        "lenguaje_principal": lenguaje or idioma_desconocido,
        "imagen_url": imagen,
        "repo_url": repo_data.get("html_url") or "",
        # Campos para el Instalador Inteligente. Se sanitizan AQUÍ (una sola
        # vez, en el server) para que el cliente nunca reciba ni reenvíe un
        # comando de arranque que no haya pasado el validador estricto.
        "gestor_paquetes": normalizar_gestor(ia_data.get("gestor_paquetes")),
        "comando_arranque": sanitizar_comando_arranque(ia_data.get("comando_arranque")),
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
        "language": "",
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
async def buscar_soluciones(payload: BusquedaRequest, request: Request):
    query = (payload.query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="El campo 'query' es requerido.")

    ip = request.client.host if request.client else "desconocida"
    if not _check_rate_limit(ip):
        raise HTTPException(
            status_code=429,
            detail="Demasiadas búsquedas en poco tiempo. Espera un minuto e intenta de nuevo.",
        )

    idioma = "es" if (payload.idioma or "").lower() == "es" else "en"
    pagina = max(1, payload.pagina or 1)
    orden = payload.orden if payload.orden in ("stars", "updated") else "stars"

    cache_key = _cache_key(query, idioma, pagina, orden)
    cacheado = _cache_get(cache_key)
    if cacheado is not None:
        print(f"[CACHE] Hit para '{query}' ({idioma}, pág. {pagina}), sin gastar cuota de IA/GitHub.")
        return cacheado

    # ---- RUTA CRAWL4AI: el query es una URL directa que NO es de GitHub ----
    # Una URL de GitHub (repo o perfil) se resuelve más rápido y sin depender
    # de Crawl4AI (pesado y opcional) vía la API oficial en buscar_repositorios,
    # así que la dejamos caer a la Ruta GitHub de más abajo.
    es_url = query.lower().startswith("http://") or query.lower().startswith("https://")
    es_url_github = bool(URL_RE.search(query) or PROFILE_URL_RE.match(query))
    if es_url and not es_url_github:
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

        ia = await procesar_readme_con_ia(markdown, repo_data, idioma)
        if not ia:
            return []
        ficha = construir_ficha(repo_data, ia, markdown, idioma)

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

        # `ia` ya fue validado como no-None arriba, así que esta ficha
        # siempre viene de una respuesta real de IA (nunca del fallback).
        _cache_set(cache_key, [ficha])
        return [ficha]

    # ---- RUTA GITHUB: búsqueda normal / por usuario / URL de repo ----
    timeout = httpx.Timeout(20.0)
    async with httpx.AsyncClient(headers=HEADERS, timeout=timeout, follow_redirects=True) as client:
        # Fase 1
        repos = await buscar_repositorios(client, query, per_page=12, pagina=pagina, orden=orden)
        if not repos:
            return []  # Sin resultados -> array vacío (frontend muestra mock si quiere)

        # Fase 2: extracción paralela (metadatos ya van en el item + README)
        extraidos = await asyncio.gather(
            *(extraer_repo_completo(client, r) for r in repos)
        )
        # Descarta los que fallaron (None) silenciosamente
        extraidos = [e for e in extraidos if e]

        # Fase 3 + 4: procesar README con IA y empaquetar, EN PARALELO con un
        # límite de concurrencia (AI_CONCURRENCY). Antes esto era totalmente
        # secuencial con una espera fija entre cada llamada (pensado para no
        # exceder el límite de RPM del free tier), pero para ~12 repos eso
        # significaba 60-90+ segundos por búsqueda — tiempo suficiente para
        # que el proxy de Render (o el propio navegador) cortara la conexión
        # y el frontend mostrara "no se pudo contactar al servidor" aunque el
        # backend siguiera trabajando. Disparar unas pocas llamadas a la vez
        # sigue estando muy por debajo del límite por minuto del proveedor
        # (p.ej. 15 RPM de Gemini) para una sola búsqueda, y baja el tiempo
        # total a unos pocos segundos.
        sem = asyncio.Semaphore(AI_CONCURRENCY)

        async def procesar(e):
            async with sem:
                ia = await procesar_readme_con_ia(e["readme"], e["repo_data"], idioma)
                return construir_ficha(e["repo_data"], ia, e["readme"], idioma)

        fichas = await asyncio.gather(*(procesar(e) for e in extraidos))
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
        # Solo cacheamos si al menos una ficha fue realmente procesada por
        # IA — así una búsqueda que salió toda en fallback (cuota agotada)
        # no queda "congelada" en caché mostrando puros badges de pendiente.
        hubo_ia = any("pendiente" not in f.get("propuesta_valor", "").lower()
                      and "pending" not in f.get("propuesta_valor", "").lower()
                      for f in fichas)
        if fichas and hubo_ia:
            _cache_set(cache_key, fichas)
        return fichas


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "ai_configured": bool(AI_API_KEY),
        "ai_provider": AI_PROVIDER,
        "ai_model": AI_MODEL,
        "ai_fallback_configured": bool(AI_FALLBACK_PROVIDER and AI_FALLBACK_API_KEY),
        "ai_fallback_provider": AI_FALLBACK_PROVIDER or None,
        "default_idioma": DEFAULT_IDIOMA,
        "github_token": bool(GITHUB_TOKEN),
        "search_cache_ttl_seconds": SEARCH_CACHE_TTL_SECONDS,
    }


# ---------------------------------------------------------------------------
# Instalador Inteligente: genera un .bat descargable por repositorio.
# ---------------------------------------------------------------------------
class InstaladorRequest(BaseModel):
    repo_url: str
    nombre: str
    lenguaje_principal: Optional[str] = ""
    gestor_paquetes: Optional[str] = "none"
    comando_arranque: Optional[str] = ""
    idioma: Optional[str] = "en"
    plataforma: Optional[str] = "windows"  # "windows" o "unix" (macOS/Linux)


@app.post("/api/generar-instalador")
async def generar_instalador(payload: InstaladorRequest):
    # Todo se vuelve a validar aquí server-side: nunca confiamos en que el
    # cliente reenvíe exactamente lo que nosotros mismos calculamos antes.
    plataforma = "unix" if (payload.plataforma or "").lower() == "unix" else "windows"
    generador = generar_sh if plataforma == "unix" else generar_bat
    try:
        contenido = generador(
            repo_url=payload.repo_url,
            nombre=payload.nombre or "proyecto",
            lenguaje_principal=payload.lenguaje_principal or "",
            gestor_paquetes=payload.gestor_paquetes or "none",
            comando_arranque=payload.comando_arranque or "",
            idioma=payload.idioma or "en",
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="repo_url inválida.")

    nombre_archivo = "".join(
        c for c in (payload.nombre or "instalador") if c.isalnum() or c in ("-", "_")
    ) or "instalador"
    extension = "sh" if plataforma == "unix" else "bat"
    media_type = "application/x-sh" if plataforma == "unix" else "application/bat"

    return Response(
        content=contenido,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="instalar-{nombre_archivo}.{extension}"'
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
