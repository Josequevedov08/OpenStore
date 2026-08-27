"use client";

import { cn } from "../../lib/utils";

interface StatisticCard1Props {
  label: string;
  value: string;
  className?: string;
}

/**
 * Tarjeta de estadística compacta y elegante (estilo oscuro).
 * Usada en la fila de métricas globales debajo del buscador.
 */
export default function StatisticCard1({
  label,
  value,
  className,
}: StatisticCard1Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 px-4 py-5 text-center transition-colors hover:border-white/20",
        className,
      )}
    >
      <span className="text-2xl font-extrabold text-white md:text-3xl">
        {value}
      </span>
      <span className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </span>
    </div>
  );
}
