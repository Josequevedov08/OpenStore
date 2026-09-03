"use client";

import { useEffect } from "react";
import { X, Star, Check, GitBranch, AlertCircle, GitPullRequest, Code2 } from "lucide-react";
import { GithubIcon } from "./modal-shared";

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
    version?: string;
    forks?: number;
    issues_abiertos?: number;
    pull_requests?: number;
    lenguaje_principal?: string;
    readme?: string;
  } | null;
  onClose: () => void;
  idioma?: "en" | "es";
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
    version: "Version",
    install: "Install",
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
    version: "Versión",
    install: "Instalar",
    viewGithub: "Ver en GitHub",
  },
};

export default function Modal({ proyecto, onClose, idioma = "en" }: ModalProps) {
  const s = MODAL_STRINGS[idioma] ?? MODAL_STRINGS.en;
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

  if (!proyecto) return null;

  const metrics = [
    { icon: AlertCircle, label: s.issues, value: proyecto.issues_abiertos ?? 0 },
    { icon: GitBranch, label: s.forks, value: proyecto.forks ?? 0 },
    { icon: GitPullRequest, label: s.prs, value: proyecto.pull_requests ?? 0 },
    { icon: Code2, label: s.lang, value: proyecto.lenguaje_principal ?? "—" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div
        className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1A1A] shadow-2xl [&::-webkit-scrollbar]:hidden scrollbar-width-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner de imagen */}
        <div className="relative h-48 w-full shrink-0">
          <img
            src={proyecto.imagen_url}
            alt={proyecto.titulo_comercial}
            className="h-48 w-full rounded-t-2xl object-cover"
          />
          <div className="absolute inset-0 rounded-t-2xl bg-gradient-to-t from-[#1A1A1A] via-[#1A1A1A]/40 to-transparent" />

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
          <p className="text-base leading-relaxed text-zinc-400">
            {proyecto.propuesta_valor}
          </p>

          {/* Grid de estadísticas compacto (Issues, Forks, PRs, Lenguaje) */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metrics.map((m, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-3"
              >
                <div className="mb-1 flex items-center gap-1.5 text-zinc-500">
                  <m.icon className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">
                    {m.label}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white">{m.value}</div>
              </div>
            ))}
          </div>

          {/* Metadatos estilo GitHub */}
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-y border-white/10 py-4 text-sm text-zinc-400">
            <span><span className="text-zinc-500">{s.author}: </span><span className="text-zinc-300">{proyecto.autor}</span></span>
            <span><span className="text-zinc-500">{s.license}: </span><span className="text-zinc-300">{proyecto.licencia}</span></span>
            <span><span className="text-zinc-500">{s.version}: </span><span className="text-zinc-300">{proyecto.version}</span></span>
            <span className="flex items-center gap-1.5 text-amber-300">
              <Star className="h-4 w-4 fill-amber-300" />
              {formatStars(proyecto.estrellas)}
            </span>
          </div>

          {/* Dos columnas: Stack + Características */}
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {s.stack}
              </h3>
              <div className="flex flex-wrap gap-2">
                {(proyecto.tecnologias ?? []).map((tech, i) => (
                  <span
                    key={i}
                    className="rounded-md border border-white/10 bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-200"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {s.features}
              </h3>
              <ul className="flex flex-col gap-2">
                {(proyecto.caracteristicas ?? []).map((feat, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-zinc-300">
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
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  {s.requirements}
                </h3>
                <ul className="flex flex-col gap-2">
                  {proyecto.requisitos_externos.map((req, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-orange-400 to-amber-300" />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>

        {/* Footer: el CTA principal instala de verdad (abre el repo real) */}
        <div className="flex flex-col gap-3 border-t border-white/10 p-6 sm:flex-row">
          <a
            href={proyecto.repo_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-base font-black text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-500"
          >
            {s.install}
          </a>
          <a
            href={proyecto.repo_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-white/5"
          >
            <GithubIcon className="h-4 w-4" />
            {s.viewGithub}
          </a>
        </div>
      </div>
    </div>
  );
}
