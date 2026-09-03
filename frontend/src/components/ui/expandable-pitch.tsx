"use client";

import { useState } from "react";

interface ExpandablePitchProps {
  text: string;
  className?: string;
  clampClass?: string;
  readMoreLabel?: string;
  readLessLabel?: string;
}

/**
 * Descripción (pitch comercial) con truncamiento condicional y botón
 * "Leer más / Leer menos". Cada instancia maneja su propio estado de
 * expansión, por lo que es independiente por tarjeta.
 */
export default function ExpandablePitch({
  text,
  className = "",
  clampClass = "line-clamp-3",
  readMoreLabel = "Leer más",
  readLessLabel = "Leer menos",
}: ExpandablePitchProps) {
  const [expandido, setExpandido] = useState(false);

  if (!text) return null;

  return (
    <div className={className}>
      <p
        className={`text-sm leading-relaxed text-[var(--text-dim)] ${
          expandido ? "" : clampClass
        }`}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="mt-1 text-xs font-medium text-blue-400 transition-colors hover:text-blue-300"
      >
        {expandido ? readLessLabel : readMoreLabel}
      </button>
    </div>
  );
}
