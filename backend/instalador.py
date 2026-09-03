"""
Instalador Inteligente — genera un script .bat (Windows) personalizado por
repositorio: verifica Git y el runtime necesario, los instala solo con
`winget` si faltan (con permiso/consentimiento visible del usuario vía UAC),
clona el repo al Escritorio, instala sus dependencias y lo arranca.

REGLA DE SEGURIDAD (no negociable): el README de un repositorio es contenido
NO CONFIABLE. Nunca se ejecuta texto libre generado por la IA a partir de él.
- El comando de INSTALACIÓN de dependencias sale de una tabla fija en este
  archivo, elegida por `gestor_paquetes` (que la IA solo puede fijar a uno
  de un conjunto cerrado de valores). La IA nunca escribe ese texto.
- El comando de ARRANQUE sí lo extrae la IA del README (varía demasiado
  para tener una tabla fija), pero pasa por `sanitizar_comando_arranque`:
  debe empezar con un binario conocido y no puede contener separadores de
  comandos, redirecciones, ni patrones destructivos/de red. Si no pasa la
  validación, se descarta y el script deja instrucciones manuales en vez
  de ejecutar algo sin validar.
"""

import re
from typing import Optional

# ---------------------------------------------------------------------------
# Gestores de paquetes soportados: la IA solo puede elegir una de estas
# claves (o "none"). El comando literal lo decide SIEMPRE este backend.
# ---------------------------------------------------------------------------
GESTORES_VALIDOS = {
    "npm": "npm install",
    "yarn": "yarn install",
    "pnpm": "pnpm install",
    "pip": "pip install -r requirements.txt",
    "poetry": "poetry install",
    "cargo": "cargo build",
    "go": "go build ./...",
    "bundler": "bundle install",
    "composer": "composer install",
    "dotnet": "dotnet restore",
    "docker": "docker compose build",
    "none": None,
}


def normalizar_gestor(valor: Optional[str]) -> str:
    v = (valor or "").strip().lower()
    return v if v in GESTORES_VALIDOS else "none"


# ---------------------------------------------------------------------------
# Validación del comando de arranque extraído por la IA del README.
# ---------------------------------------------------------------------------
_BINARIOS_PERMITIDOS = (
    "npm", "yarn", "pnpm", "python", "python3", "node", "go", "cargo",
    "docker", "docker-compose", "dotnet", "ruby", "php", "bundle", "poetry",
    "java", "flask", "uvicorn", "gunicorn", "streamlit",
)
_COMANDO_ARRANQUE_RE = re.compile(
    r"^(" + "|".join(_BINARIOS_PERMITIDOS) + r")\b[\w\s.\-/:=\"']{0,150}$"
)
_TOKENS_PELIGROSOS = (
    ";", "&&", "||", "|", "`", "$(", ">", "<", "..\\", "../",
    "rm -rf", "del ", "rmdir", "format ", "shutdown", "reg add", "reg delete",
    "net user", "curl ", "wget ", "invoke-webrequest", "iex ", "iex(",
    "powershell -e", "powershell -enc", "start /b", "taskkill",
)


def sanitizar_comando_arranque(valor: Optional[str]) -> str:
    """Devuelve el comando tal cual SOLO si pasa una validación estricta de
    allowlist + denylist. Si no, devuelve "" (el script no ejecutará nada
    y mostrará instrucciones manuales en su lugar)."""
    cmd = (valor or "").strip()
    if not cmd or len(cmd) > 180:
        return ""
    bajo = cmd.lower()
    if any(tok in bajo for tok in _TOKENS_PELIGROSOS):
        return ""
    if not _COMANDO_ARRANQUE_RE.match(cmd):
        return ""
    return cmd


# ---------------------------------------------------------------------------
# Runtime requerido según el lenguaje principal detectado por GitHub (dato
# confiable, no viene de la IA). Cada entrada: comando para comprobar si ya
# está instalado + id de winget para instalarlo si falta.
# ---------------------------------------------------------------------------
RUNTIME_POR_LENGUAJE = {
    "python": {"check": "python", "winget_id": "Python.Python.3.12", "nombre": "Python"},
    "javascript": {"check": "node", "winget_id": "OpenJS.NodeJS.LTS", "nombre": "Node.js"},
    "typescript": {"check": "node", "winget_id": "OpenJS.NodeJS.LTS", "nombre": "Node.js"},
    "go": {"check": "go", "winget_id": "GoLang.Go", "nombre": "Go"},
    "rust": {"check": "cargo", "winget_id": "Rustlang.Rustup", "nombre": "Rust"},
    "java": {"check": "java", "winget_id": "EclipseAdoptium.Temurin.21.JDK", "nombre": "Java JDK"},
    "c#": {"check": "dotnet", "winget_id": "Microsoft.DotNet.SDK.8", "nombre": ".NET SDK"},
    "ruby": {"check": "ruby", "winget_id": "RubyInstallerTeam.Ruby.3.3", "nombre": "Ruby"},
    "php": {"check": "php", "winget_id": "PHP.PHP.8.3", "nombre": "PHP"},
}


def runtime_para_lenguaje(lenguaje: Optional[str]) -> Optional[dict]:
    return RUNTIME_POR_LENGUAJE.get((lenguaje or "").strip().lower())


REPO_URL_RE = re.compile(r"^https://github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?/?$")

TEXTOS = {
    "es": {
        "titulo": "Instalador de {nombre}",
        "check_git": "Verificando si Git esta instalado...",
        "falta_git": "Git no esta instalado. Instalando con winget (puede pedir permisos de Administrador)...",
        "uac_aviso": "Si aparece una ventana de permisos de Windows, presiona 'Si' para continuar.",
        "reabrir": "Se instalo una herramienta nueva. Cierra esta ventana, vuelve a abrir install.bat y ejecutalo de nuevo para que Windows detecte el cambio.",
        "check_runtime": "Verificando si {nombre} esta instalado...",
        "falta_runtime": "{nombre} no esta instalado. Instalando con winget...",
        "clonando": "Clonando el repositorio en tu Escritorio...",
        "ya_existe": "Ya existe una carpeta con ese nombre en tu Escritorio. Bórrala o renómbrala e intenta de nuevo.",
        "clon_fallo": "No se pudo clonar el repositorio. Revisa tu conexion a internet.",
        "instalando_deps": "Instalando dependencias del proyecto (esto puede tardar unos minutos)...",
        "arrancando": "Iniciando el proyecto...",
        "sin_arranque": "No se detecto un comando de inicio automatico y seguro para este proyecto.",
        "manual": "Abre la carpeta en tu Escritorio y revisa su archivo README para ver como iniciarlo manualmente.",
        "listo": "Listo! Revisa la ventana / tu navegador para ver el proyecto en marcha.",
        "presiona_tecla": "Presiona una tecla para cerrar esta ventana...",
    },
    "en": {
        "titulo": "Installer for {nombre}",
        "check_git": "Checking if Git is installed...",
        "falta_git": "Git is not installed. Installing it with winget (may ask for Administrator permission)...",
        "uac_aviso": "If a Windows permission window appears, click 'Yes' to continue.",
        "reabrir": "A new tool was installed. Close this window, reopen install.bat and run it again so Windows picks up the change.",
        "check_runtime": "Checking if {nombre} is installed...",
        "falta_runtime": "{nombre} is not installed. Installing it with winget...",
        "clonando": "Cloning the repository to your Desktop...",
        "ya_existe": "A folder with that name already exists on your Desktop. Delete or rename it and try again.",
        "clon_fallo": "Could not clone the repository. Check your internet connection.",
        "instalando_deps": "Installing project dependencies (this can take a few minutes)...",
        "arrancando": "Starting the project...",
        "sin_arranque": "No safe, automatic start command was detected for this project.",
        "manual": "Open the folder on your Desktop and check its README for how to start it manually.",
        "listo": "Done! Check the window / your browser to see the project running.",
        "presiona_tecla": "Press any key to close this window...",
    },
}


def generar_bat(
    *,
    repo_url: str,
    nombre: str,
    lenguaje_principal: str,
    gestor_paquetes: str,
    comando_arranque: str,
    idioma: str = "en",
) -> str:
    """Construye el contenido del .bat. Revalida TODO server-side, sin
    confiar en el idioma/formato de lo recibido del cliente."""
    idioma = "es" if idioma == "es" else "en"
    t = TEXTOS[idioma]

    m = REPO_URL_RE.match((repo_url or "").strip())
    if not m:
        raise ValueError("repo_url inválida")
    carpeta = m.group(2)

    gestor = normalizar_gestor(gestor_paquetes)
    comando_instalacion = GESTORES_VALIDOS[gestor]
    comando_arranque = sanitizar_comando_arranque(comando_arranque)
    runtime = runtime_para_lenguaje(lenguaje_principal)

    lineas = [
        "@echo off",
        "chcp 65001 >nul",
        "setlocal enabledelayedexpansion",
        f"title {t['titulo'].format(nombre=nombre)}",
        "",
        f"echo {t['check_git']}",
        "where git >nul 2>&1",
        "if %errorlevel% neq 0 (",
        f"    echo {t['falta_git']}",
        f"    echo {t['uac_aviso']}",
        "    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements",
        f"    echo {t['reabrir']}",
        f"    pause",
        "    exit /b 0",
        ")",
        "",
    ]

    if runtime:
        lineas += [
            f"echo {t['check_runtime'].format(nombre=runtime['nombre'])}",
            f"where {runtime['check']} >nul 2>&1",
            "if %errorlevel% neq 0 (",
            f"    echo {t['falta_runtime'].format(nombre=runtime['nombre'])}",
            f"    echo {t['uac_aviso']}",
            f"    winget install --id {runtime['winget_id']} -e --source winget --accept-package-agreements --accept-source-agreements",
            f"    echo {t['reabrir']}",
            f"    pause",
            "    exit /b 0",
            ")",
            "",
        ]

    lineas += [
        f"echo {t['clonando']}",
        'cd /d "%USERPROFILE%\\Desktop"',
        f'if exist "{carpeta}" (',
        f"    echo {t['ya_existe']}",
        "    pause",
        "    exit /b 1",
        ")",
        f'git clone "{repo_url}" "{carpeta}"',
        "if %errorlevel% neq 0 (",
        f"    echo {t['clon_fallo']}",
        "    pause",
        "    exit /b 1",
        ")",
        f'cd /d "{carpeta}"',
        "",
    ]

    if comando_instalacion:
        lineas += [
            f"echo {t['instalando_deps']}",
            comando_instalacion,
            "",
        ]

    if comando_arranque:
        lineas += [
            f"echo {t['arrancando']}",
            comando_arranque,
        ]
    else:
        lineas += [
            f"echo {t['sin_arranque']}",
            f"echo {t['manual']}",
            'start "" "%cd%"',
        ]

    lineas += [
        "",
        f"echo {t['listo']}",
        f"echo {t['presiona_tecla']}",
        "pause >nul",
    ]

    # BOM UTF-8 + "chcp 65001": para que cmd.exe muestre bien los acentos.
    return "﻿" + "\r\n".join(lineas) + "\r\n"
