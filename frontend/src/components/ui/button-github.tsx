"use client";

import { GithubIcon } from "./modal-shared";

interface StarOnGithubProps {
  texto?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * Botón "Ver Repositorio" / "Ver en GitHub".
 * - Si recibe `href`  -> etiqueta <a> (enlace externo, abre en nueva pestaña).
 * - Si recibe `onClick` -> etiqueta <button> (acción interna, p.ej. abrir modal).
 */
export default function StarOnGithub({
  texto = "Ver Repositorio",
  href,
  onClick,
  className,
}: StarOnGithubProps) {
  const cls = [
    "group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#232323] to-[#161616] px-4 py-3 text-sm font-semibold text-white transition-all",
    "hover:from-[#2a2a2a] hover:to-[#1c1c1c]",
    "after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-blue-400/80 after:to-transparent after:opacity-60 after:blur-[1px] after:transition-opacity group-hover:after:opacity-100",
    "shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:shadow-[0_10px_40px_rgba(59,130,246,0.25)]",
    className ?? "",
  ].join(" ");

  const inner = (
    <>
      <GithubIcon className="h-4 w-4 text-zinc-200" />
      <span>{texto}</span>
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
