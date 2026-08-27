"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

interface PaginationProps {
  count: number;
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  label?: string;
  className?: string;
}

/**
 * Paginación premium controlada. Si recibe `page` + `onPageChange` es
 * controlada por el padre; si no, maneja su propio estado internamente.
 * Botón prev, números de página redondeados y botón next.
 */
export function Pagination({
  count,
  page: controlledPage,
  defaultPage = 1,
  onPageChange,
  label,
  className,
}: PaginationProps) {
  const [internalPage, setInternalPage] = useState(defaultPage);
  const isControlled = controlledPage !== undefined;
  const page = isControlled ? controlledPage : internalPage;

  const goTo = (p: number) => {
    const next = Math.min(Math.max(1, p), count);
    if (isControlled) onPageChange?.(next);
    else setInternalPage(next);
  };

  if (count <= 1) {
    return (
      <nav
        aria-label={label ?? "Pagination"}
        className={cn("flex items-center justify-center gap-2", className)}
      >
        <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
          1
        </span>
      </nav>
    );
  }

  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  let end = start + windowSize - 1;
  if (end > count) {
    end = count;
    start = Math.max(1, end - windowSize + 1);
  }
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const btnBase =
    "flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors";
  const navBtn =
    "border border-white/15 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <nav
      aria-label={label ?? "Pagination"}
      className={cn("flex items-center justify-center gap-2", className)}
    >
      <button
        type="button"
        aria-label="Página anterior"
        disabled={page === 1}
        onClick={() => goTo(page - 1)}
        className={cn(btnBase, navBtn)}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {start > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(1)}
            className={cn(btnBase, "border border-white/15 bg-zinc-900 text-zinc-200 hover:bg-zinc-800")}
          >
            1
          </button>
          {start > 2 && <span className="px-1 text-zinc-500">…</span>}
        </>
      )}

      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => goTo(p)}
          aria-current={p === page ? "page" : undefined}
          className={cn(
            btnBase,
            p === page
              ? "bg-white text-zinc-900"
              : "border border-white/15 bg-zinc-900 text-zinc-200 hover:bg-zinc-800",
          )}
        >
          {p}
        </button>
      ))}

      {end < count && (
        <>
          {end < count - 1 && <span className="px-1 text-zinc-500">…</span>}
          <button
            type="button"
            onClick={() => goTo(count)}
            className={cn(btnBase, "border border-white/15 bg-zinc-900 text-zinc-200 hover:bg-zinc-800")}
          >
            {count}
          </button>
        </>
      )}

      <button
        type="button"
        aria-label="Página siguiente"
        disabled={page === count}
        onClick={() => goTo(page + 1)}
        className={cn(btnBase, navBtn)}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

export default Pagination;
