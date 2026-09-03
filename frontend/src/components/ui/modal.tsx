"use client";

import { useState, useEffect } from "react";
import { X, Star, Check, GitBranch, AlertCircle, GitPullRequest, Code2, Clock, Download, Loader2 } from "lucide-react";
import { GithubIcon } from "./modal-shared";

// Imagen de respaldo (SVG embebido, sin red) para cuando la miniatura de
// Unsplash no carga — misma idea que en las tarjetas de App.jsx.
const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200" viewBox="0 0 800 200">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1f2937"/>
          <stop offset="100%" stop-color="#111827"/>
        </linearGradient>
      </defs>
      <rect width="800" height="200" fill="url(#g)"/>
      <path d="M350 80 l-20 20 20 20 M450 80 l20 20 -20 20 M390 65 l20 70" stroke="#3b82f6" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
    </svg>`
  );

interface ModalProps {
  proyecto: {
    categoria?: string;
    titulo_comercial: string;
    propuesta_valor: string;
    requisitos_externos?: string[];
    estrellas?: number | string;
    ultima_actualizacion?: string;
    repo_url?: string;
    tecnologias?: string[];
    caracteristicas?: string[];
    imagen_url?: string;
    autor?: string;
    licencia?: string;
    forks?: number;
    issues_abiertos?: number;
    pull_requests?: number;
    lenguaje_principal?: string;
    gestor_paquetes?: string;
    comando_arranque?: string;
    readme?: string;
  } | null;
  onClose: () => void;
  idioma?: "en" | "es";
  installerUrl?: string;
}

// Formatea estrellas al estilo GitHub: 12400 -> "12.4k", 850 -> "850"
function formatStars(v?: number | string): string {
  const n = typeof v === "string" ? parseFloat(v) : v ?? 0;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${n}`;
}

const MODAL_STRINGS = {
  en: {
    close: "Close",
    issues: "Open Issues",
    forks: "Forks",
    prs: "Pull Requests",
    lang: "Language",
    stack: "Tech Stack",
    features: "Key Features",
    requirements: "External Requirements",
    author: "Author",
    license: "License",
    lastCommit: "Last Commit",
    installWin: "Windows",
    installUnix: "Mac / Linux",
    installing: "Generating…",
    installHint:
      "Downloads a script that clones this repo to your Desktop, auto-installs missing tools (winget / Homebrew / apt / dnf) and starts it. Only run this if you trust the repo's author — it runs real third-party code.",
    installError: "Couldn't generate the installer. Try again in a moment.",
    viewGithub: "View on GitHub",
  },
  es: {
    close: "Cerrar",
    issues: "Issues Abiertos",
    forks: "Forks",
    prs: "Pull Requests",
    lang: "Lenguaje",
    stack: "Stack Tecnológico",
    features: "Características Principales",
    requirements: "Requisitos externos",
    author: "Autor",
    license: "Licencia",
    lastCommit: "Último Commit",
    installWin: "Windows",
    installUnix: "Mac / Linux",
    installing: "Generando…",
    installHint:
      "Descarga un script que clona este repo en tu Escritorio, instala automáticamente las herramientas que falten (winget / Homebrew / apt / dnf) y lo arranca. Solo úsalo si confías en el autor del repo — ejecuta código real de un tercero.",
    installError: "No se pudo generar el instalador. Intenta de nuevo en un momento.",
    viewGithub: "Ver en GitHub",
  },
};

export default function Modal({ proyecto, onClose, idioma = "en", installerUrl }: ModalProps) {
  const s = MODAL_STRINGS[idioma] ?? MODAL_STRINGS.en;
  const [descargando, setDescargando] = useState<"windows" | "unix" | null>(null);
  const [errorInstalador, setErrorInstalador] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    setErrorInstalador("");
    setDescargando(null);
  }, [proyecto?.repo_url]);

  if (!proyecto) return null;

  const handleInstalar = async (plataforma: "windows" | "unix") => {
    if (!installerUrl) return;
    setDescargando(plataforma);
    setErrorInstalador("");
    try {
      const res = await fetch(installerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_url: proyecto.repo_url,
          nombre: proyecto.titulo_comercial,
          lenguaje_principal: proyecto.lenguaje_principal,
          gestor_paquetes: proyecto.gestor_paquetes,
          comando_arranque: proyecto.comando_arranque,
          idioma,
          plataforma,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const ext = plataforma === "unix" ? "sh" : "bat";
      const a = document.createElement("a");
      a.href = url;
      a.download = `instalar-${(proyecto.titulo_comercial || "proyecto").replace(/[^a-zA-Z0-9-_]/g, "")}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // Historial local (solo en este navegador) de instaladores descargados.
      try {
        const HISTORY_KEY = "appstore-historial-instalaciones";
        const actual = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
        const entrada = {
          titulo_comercial: proyecto.titulo_comercial,
          repo_url: proyecto.repo_url,
          plataforma: plataforma === "unix" ? "Mac / Linux" : "Windows",
          fecha: new Date().toLocaleDateString(idioma === "es" ? "es-ES" : "en-US"),
        };
        const nuevo = [entrada, ...(Array.isArray(actual) ? actual : [])].slice(0, 20);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(nuevo));
      } catch {
        // No crítico: el historial es solo una conveniencia local.
      }
    } catch {
      setErrorInstalador(s.installError);
    } finally {
      setDescargando(null);
    }
  };

  const metrics = [
    { icon: AlertCircle, label: s.issues, value: proyecto.issues_abiertos ?? 0 },
    { icon: GitBranch, label: s.forks, value: proyecto.forks ?? 0 },
    { icon: GitPullRequest, label: s.prs, value: proyecto.pull_requests ?? 0 },
    { icon: Code2, label: s.lang, value: proyecto.lenguaje_principal ?? "—" },
    { icon: Clock, label: s.lastCommit, value: proyecto.ultima_actualizacion ?? "—" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div
        className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl [&::-webkit-scrollbar]:hidden scrollbar-width-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner de imagen */}
        <div className="relative h-48 w-full shrink-0">
          <img
            src={proyecto.imagen_url || FALLBACK_IMG}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = FALLBACK_IMG;
            }}
            alt={proyecto.titulo_comercial}
            className="h-48 w-full rounded-t-2xl object-cover"
          />
          <div className="absolute inset-0 rounded-t-2xl bg-gradient-to-t from-[var(--surface)] via-[var(--surface)]/40 to-transparent" />

          <button
            type="button"
            onClick={onClose}
            aria-label={s.close}
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="absolute bottom-4 left-6 right-6">
            {proyecto.categoria && (
              <span className="mb-2 inline-block rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
                {proyecto.categoria}
              </span>
            )}
            <h2 className="text-3xl font-bold text-white drop-shadow-lg">
              {proyecto.titulo_comercial}
            </h2>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="p-8">
          <p className="text-base leading-relaxed text-[var(--text-dim)]">
            {proyecto.propuesta_valor}
          </p>

          {/* Grid de estadísticas compacto (Issues, Forks, PRs, Lenguaje, Último Commit) */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {metrics.map((m, i) => (
              <div
                key={i}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3"
              >
                <div className="mb-1 flex items-center gap-1.5 text-[var(--text-dimmer)]">
                  <m.icon className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">
                    {m.label}
                  </span>
                </div>
                <div className="text-sm font-semibold text-[var(--text)]">{m.value}</div>
              </div>
            ))}
          </div>

          {/* Metadatos estilo GitHub */}
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-y border-[var(--border)] py-4 text-sm text-[var(--text-dim)]">
            <span><span className="text-[var(--text-dimmer)]">{s.author}: </span><span className="text-[var(--text-dim)]">{proyecto.autor}</span></span>
            <span><span className="text-[var(--text-dimmer)]">{s.license}: </span><span className="text-[var(--text-dim)]">{proyecto.licencia}</span></span>
            <span className="flex items-center gap-1.5 text-amber-300">
              <Star className="h-4 w-4 fill-amber-300" />
              {formatStars(proyecto.estrellas)}
            </span>
          </div>

          {/* Dos columnas: Stack + Características */}
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-dimmer)]">
                {s.stack}
              </h3>
              <div className="flex flex-wrap gap-2">
                {(proyecto.tecnologias ?? []).map((tech, i) => (
                  <span
                    key={i}
                    className="rounded-md border border-[var(--border)] bg-[var(--surface-hover)] px-2.5 py-1 text-xs font-medium text-[var(--text-dim)]"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-dimmer)]">
                {s.features}
              </h3>
              <ul className="flex flex-col gap-2">
                {(proyecto.caracteristicas ?? []).map((feat, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                    <Check className="h-4 w-4 shrink-0 text-green-400" />
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Requisitos externos */}
          {Array.isArray(proyecto.requisitos_externos) &&
            proyecto.requisitos_externos.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-dimmer)]">
                  {s.requirements}
                </h3>
                <ul className="flex flex-col gap-2">
                  {proyecto.requisitos_externos.map((req, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-orange-400 to-amber-300" />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>

        {/* Footer: el CTA principal descarga el Instalador Inteligente (Windows o Mac/Linux) */}
        <div className="flex flex-col gap-3 border-t border-[var(--border)] p-6">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => handleInstalar("windows")}
              disabled={descargando !== null}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {descargando === "windows" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {descargando === "windows" ? s.installing : s.installWin}
            </button>
            <button
              type="button"
              onClick={() => handleInstalar("unix")}
              disabled={descargando !== null}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600/80 px-4 py-3 text-sm font-black text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {descargando === "unix" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {descargando === "unix" ? s.installing : s.installUnix}
            </button>
            <a
              href={proyecto.repo_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] px-4 py-3 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <GithubIcon className="h-4 w-4" />
              {s.viewGithub}
            </a>
          </div>
          {errorInstalador ? (
            <p className="text-center text-xs text-red-400">{errorInstalador}</p>
          ) : (
            <p className="text-center text-xs text-[var(--text-dimmer)]">{s.installHint}</p>
          )}
        </div>
      </div>
    </div>
  );
}
