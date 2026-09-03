"""
Instalador Inteligente — genera un script personalizado por repositorio
(.bat para Windows, .sh para macOS/Linux con autodetección de SO): verifica
Git y el runtime necesario, los instala solo con el gestor nativo de cada
sistema si faltan (winget / Homebrew / apt / dnf / pacman, con
consentimiento visible antes de cualquier prompt de permisos), clona el
repo al Escritorio, instala sus dependencias y lo arranca.

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
- Los únicos comandos que SÍ vienen "de red hacia un instalador" (winget /
  el bootstrap oficial de Homebrew) son literales fijos escritos por
  nosotros en este archivo — nunca generados ni influenciados por la IA o
  por el contenido del repositorio.
"""

import re
from typing import Literal, Optional

Plataforma = Literal["windows", "unix"]

# ---------------------------------------------------------------------------
# Gestores de paquetes soportados: la IA solo puede elegir una de estas
# claves (o "none"). El comando literal lo decide SIEMPRE este backend, y es
# el mismo en Windows y Unix (npm/pip/etc. funcionan igual en ambos).
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
    "powershell -e", "powershell -enc", "start /b", "taskkill", "sudo ",
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
# confiable, no viene de la IA). Un id de instalación por gestor nativo de
# cada sistema operativo.
# ---------------------------------------------------------------------------
RUNTIME_POR_LENGUAJE = {
    "python": {
        "nombre": "Python",
        "win": {"check": "python", "winget_id": "Python.Python.3.12"},
        "brew": "python@3.12",
        "apt": "python3 python3-pip python3-venv",
        "dnf": "python3 python3-pip",
        "pacman": "python python-pip",
        "check_unix": "python3",
    },
    "javascript": {
        "nombre": "Node.js",
        "win": {"check": "node", "winget_id": "OpenJS.NodeJS.LTS"},
        "brew": "node",
        "apt": "nodejs npm",
        "dnf": "nodejs npm",
        "pacman": "nodejs npm",
        "check_unix": "node",
    },
    "typescript": {
        "nombre": "Node.js",
        "win": {"check": "node", "winget_id": "OpenJS.NodeJS.LTS"},
        "brew": "node",
        "apt": "nodejs npm",
        "dnf": "nodejs npm",
        "pacman": "nodejs npm",
        "check_unix": "node",
    },
    "go": {
        "nombre": "Go",
        "win": {"check": "go", "winget_id": "GoLang.Go"},
        "brew": "go",
        "apt": "golang-go",
        "dnf": "golang",
        "pacman": "go",
        "check_unix": "go",
    },
    "rust": {
        "nombre": "Rust",
        "win": {"check": "cargo", "winget_id": "Rustlang.Rustup"},
        "brew": "rust",
        "apt": "cargo",
        "dnf": "cargo",
        "pacman": "rust",
        "check_unix": "cargo",
    },
    "java": {
        "nombre": "Java JDK",
        "win": {"check": "java", "winget_id": "EclipseAdoptium.Temurin.21.JDK"},
        "brew": "openjdk@21",
        "apt": "default-jdk",
        "dnf": "java-21-openjdk",
        "pacman": "jdk-openjdk",
        "check_unix": "java",
    },
    "c#": {
        "nombre": ".NET SDK",
        "win": {"check": "dotnet", "winget_id": "Microsoft.DotNet.SDK.8"},
        "brew": "dotnet",
        "apt": "dotnet-sdk-8.0",
        "dnf": "dotnet-sdk-8.0",
        "pacman": "dotnet-sdk",
        "check_unix": "dotnet",
    },
    "ruby": {
        "nombre": "Ruby",
        "win": {"check": "ruby", "winget_id": "RubyInstallerTeam.Ruby.3.3"},
        "brew": "ruby",
        "apt": "ruby-full",
        "dnf": "ruby",
        "pacman": "ruby",
        "check_unix": "ruby",
    },
    "php": {
        "nombre": "PHP",
        "win": {"check": "php", "winget_id": "PHP.PHP.8.3"},
        "brew": "php",
        "apt": "php",
        "dnf": "php",
        "pacman": "php",
        "check_unix": "php",
    },
}


def runtime_para_lenguaje(lenguaje: Optional[str]) -> Optional[dict]:
    return RUNTIME_POR_LENGUAJE.get((lenguaje or "").strip().lower())


REPO_URL_RE = re.compile(r"^https://github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?/?$")

TEXTOS = {
    "es": {
        "titulo": "Instalador de {nombre}",
        "aviso_codigo": "Este script va a descargar y ejecutar codigo real del repositorio de un tercero. Solo continua si confias en el autor.",
        "check_git": "Verificando si Git esta instalado...",
        "falta_git": "Git no esta instalado. Instalando (puede pedir tu permiso/contrasena)...",
        "uac_aviso": "Si el sistema pide permiso o contrasena, es normal: acepta para continuar.",
        "reabrir": "Se instalo una herramienta nueva. Cierra esta ventana, vuelve a abrir el instalador y ejecutalo de nuevo para que el sistema detecte el cambio.",
        "check_runtime": "Verificando si {nombre} esta instalado...",
        "falta_runtime": "{nombre} no esta instalado. Instalando...",
        "sin_gestor": "No se detecto un gestor de paquetes del sistema (winget/Homebrew/apt/dnf/pacman). Instala {nombre} manualmente y vuelve a ejecutar este script.",
        "clonando": "Clonando el repositorio en tu Escritorio...",
        "ya_existe": "Ya existe una carpeta con ese nombre en tu Escritorio. Borrala o renombrala e intenta de nuevo.",
        "clon_fallo": "No se pudo clonar el repositorio. Revisa tu conexion a internet.",
        "instalando_deps": "Instalando dependencias del proyecto (esto puede tardar unos minutos)...",
        "arrancando": "Iniciando el proyecto...",
        "sin_arranque": "No se detecto un comando de inicio automatico y seguro para este proyecto.",
        "manual": "Abre la carpeta en tu Escritorio y revisa su README para ver como iniciarlo manualmente.",
        "listo": "Listo! Revisa la ventana / tu navegador para ver el proyecto en marcha.",
        "presiona_tecla": "Presiona una tecla para cerrar esta ventana...",
        "sin_homebrew": "Homebrew no esta instalado. Instalando Homebrew (te pedira tu contrasena)...",
        "sin_gestor_linux": "No se encontro apt, dnf ni pacman en este sistema. Instala {nombre} manualmente.",
    },
    "en": {
        "titulo": "Installer for {nombre}",
        "aviso_codigo": "This script will download and run real third-party code from the repository. Only continue if you trust the author.",
        "check_git": "Checking if Git is installed...",
        "falta_git": "Git is not installed. Installing it (may ask for your permission/password)...",
        "uac_aviso": "If the system asks for permission or a password, that's expected: accept to continue.",
        "reabrir": "A new tool was installed. Close this window, reopen the installer and run it again so the system picks up the change.",
        "check_runtime": "Checking if {nombre} is installed...",
        "falta_runtime": "{nombre} is not installed. Installing it...",
        "sin_gestor": "No system package manager was found (winget/Homebrew/apt/dnf/pacman). Install {nombre} manually and re-run this script.",
        "clonando": "Cloning the repository to your Desktop...",
        "ya_existe": "A folder with that name already exists on your Desktop. Delete or rename it and try again.",
        "clon_fallo": "Could not clone the repository. Check your internet connection.",
        "instalando_deps": "Installing project dependencies (this can take a few minutes)...",
        "arrancando": "Starting the project...",
        "sin_arranque": "No safe, automatic start command was detected for this project.",
        "manual": "Open the folder on your Desktop and check its README for how to start it manually.",
        "listo": "Done! Check the window / your browser to see the project running.",
        "presiona_tecla": "Press any key to close this window...",
        "sin_homebrew": "Homebrew is not installed. Installing Homebrew (it will ask for your password)...",
        "sin_gestor_linux": "Could not find apt, dnf or pacman on this system. Install {nombre} manually.",
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
    """Construye el .bat de Windows. Revalida TODO server-side."""
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
        f"echo {t['aviso_codigo']}",
        "",
        f"echo {t['check_git']}",
        "where git >nul 2>&1",
        "if %errorlevel% neq 0 (",
        f"    echo {t['falta_git']}",
        f"    echo {t['uac_aviso']}",
        "    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements",
        f"    echo {t['reabrir']}",
        "    pause",
        "    exit /b 0",
        ")",
        "",
    ]

    if runtime:
        win = runtime["win"]
        lineas += [
            f"echo {t['check_runtime'].format(nombre=runtime['nombre'])}",
            f"where {win['check']} >nul 2>&1",
            "if %errorlevel% neq 0 (",
            f"    echo {t['falta_runtime'].format(nombre=runtime['nombre'])}",
            f"    echo {t['uac_aviso']}",
            f"    winget install --id {win['winget_id']} -e --source winget --accept-package-agreements --accept-source-agreements",
            f"    echo {t['reabrir']}",
            "    pause",
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
        lineas += [f"echo {t['instalando_deps']}", comando_instalacion, ""]

    if comando_arranque:
        lineas += [f"echo {t['arrancando']}", comando_arranque]
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


def generar_sh(
    *,
    repo_url: str,
    nombre: str,
    lenguaje_principal: str,
    gestor_paquetes: str,
    comando_arranque: str,
    idioma: str = "en",
) -> str:
    """Construye un .sh único para macOS y Linux: detecta el sistema y el
    gestor de paquetes nativo disponible (Homebrew / apt / dnf / pacman) en
    tiempo de ejecución. Revalida TODO server-side."""
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

    def instalar_paquete_shell(paquete_var: str) -> str:
        """Bloque shell que instala $PAQUETE con el gestor nativo disponible."""
        return "\n".join([
            'if [ "$OS" = "Darwin" ]; then',
            "    if ! command -v brew >/dev/null 2>&1; then",
            f'        echo "{t["sin_homebrew"]}"',
            '        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
            "    fi",
            f'    brew install {paquete_var}',
            "elif command -v apt-get >/dev/null 2>&1; then",
            f'    sudo apt-get update && sudo apt-get install -y {paquete_var}',
            "elif command -v dnf >/dev/null 2>&1; then",
            f'    sudo dnf install -y {paquete_var}',
            "elif command -v pacman >/dev/null 2>&1; then",
            f'    sudo pacman -S --noconfirm {paquete_var}',
            "else",
            f'    echo "{t["sin_gestor_linux"].format(nombre=paquete_var)}"',
            "    exit 1",
            "fi",
        ])

    lineas = [
        "#!/usr/bin/env bash",
        "set -e",
        f'echo "{t["titulo"].format(nombre=nombre)}"',
        "",
        'OS="$(uname)"',
        "",
        f'echo "{t["aviso_codigo"]}"',
        "",
        f'echo "{t["check_git"]}"',
        "if ! command -v git >/dev/null 2>&1; then",
        f'    echo "{t["falta_git"]}"',
        f'    echo "{t["uac_aviso"]}"',
        instalar_paquete_shell("git"),
        f'    echo "{t["reabrir"]}"',
        '    read -r -p "..." _',
        "    exit 0",
        "fi",
        "",
    ]

    if runtime:
        brew_pkg = runtime.get("brew", "")
        apt_pkg = runtime.get("apt", "")
        dnf_pkg = runtime.get("dnf", "")
        pacman_pkg = runtime.get("pacman", "")
        check_unix = runtime.get("check_unix", "")
        bloque_runtime = "\n".join([
            'if [ "$OS" = "Darwin" ]; then',
            "    if ! command -v brew >/dev/null 2>&1; then",
            f'        echo "{t["sin_homebrew"]}"',
            '        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
            "    fi",
            f'    brew install {brew_pkg}',
            "elif command -v apt-get >/dev/null 2>&1; then",
            f'    sudo apt-get update && sudo apt-get install -y {apt_pkg}',
            "elif command -v dnf >/dev/null 2>&1; then",
            f'    sudo dnf install -y {dnf_pkg}',
            "elif command -v pacman >/dev/null 2>&1; then",
            f'    sudo pacman -S --noconfirm {pacman_pkg}',
            "else",
            f'    echo "{t["sin_gestor"].format(nombre=runtime["nombre"])}"',
            "    exit 1",
            "fi",
        ])
        lineas += [
            f'echo "{t["check_runtime"].format(nombre=runtime["nombre"])}"',
            f"if ! command -v {check_unix} >/dev/null 2>&1; then",
            f'    echo "{t["falta_runtime"].format(nombre=runtime["nombre"])}"',
            f'    echo "{t["uac_aviso"]}"',
            bloque_runtime,
            f'    echo "{t["reabrir"]}"',
            '    read -r -p "..." _',
            "    exit 0",
            "fi",
            "",
        ]

    lineas += [
        f'echo "{t["clonando"]}"',
        'DESTINO="$HOME/Desktop"',
        '[ -d "$DESTINO" ] || DESTINO="$HOME"',
        'cd "$DESTINO"',
        f'if [ -d "{carpeta}" ]; then',
        f'    echo "{t["ya_existe"]}"',
        "    exit 1",
        "fi",
        f'git clone "{repo_url}" "{carpeta}" || {{ echo "{t["clon_fallo"]}"; exit 1; }}',
        f'cd "{carpeta}"',
        "",
    ]

    if comando_instalacion:
        lineas += [f'echo "{t["instalando_deps"]}"', comando_instalacion, ""]

    if comando_arranque:
        lineas += [f'echo "{t["arrancando"]}"', comando_arranque]
    else:
        lineas += [
            f'echo "{t["sin_arranque"]}"',
            f'echo "{t["manual"]}"',
            'open "$PWD" 2>/dev/null || xdg-open "$PWD" 2>/dev/null || true',
        ]

    lineas += [
        "",
        f'echo "{t["listo"]}"',
    ]

    return "\n".join(lineas) + "\n"
