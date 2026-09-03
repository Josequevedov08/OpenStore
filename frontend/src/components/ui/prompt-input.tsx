"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { cn } from "../../lib/utils";

interface PromptInputProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  submitLabel?: string;
  className?: string;
  id?: string;
}

/**
 * Input tipo "AI Chat": campo redondeado, ancho completo, con botón de enviar
 * y envío por Enter (sin salto de línea).
 */
export default function PromptInput({
  onSubmit,
  placeholder = "Escribe tu búsqueda...",
  submitLabel = "Buscar",
  className,
  id,
}: PromptInputProps) {
  const [value, setValue] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        "group relative flex w-full items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/80 px-4 py-3 shadow-2xl backdrop-blur-md transition-all",
        "focus-within:border-blue-500/60 focus-within:shadow-[0_0_30px_rgba(59,130,246,0.35)]",
        className,
      )}
    >
      <Search className="h-5 w-5 shrink-0 text-[var(--text-dim)]" />
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full bg-transparent text-base text-[var(--text)] placeholder:text-[var(--text-dimmer)] focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-xl bg-gradient-to-r from-orange-500 to-amber-400 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.03] active:scale-95"
      >
        {submitLabel}
      </button>
    </form>
  );
}
