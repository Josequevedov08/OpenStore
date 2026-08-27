"use client";

import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { cn } from "../../lib/utils";

interface ToggleGroupProps {
  type?: "single";
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

/**
 * ToggleGroup minimalista: resalta el <Toggle> cuyo value coincide con `value`
 * e inyecta el handler onSelect en cada hijo.
 */
export default function ToggleGroup({
  value,
  onValueChange,
  children,
  className,
}: ToggleGroupProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border border-white/10 bg-[#1A1A1A] p-1",
        className,
      )}
    >
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const childValue = (child.props as { value?: string }).value;
        return cloneElement(child as any, {
          active: childValue === value,
          onSelect: onValueChange,
        });
      })}
    </div>
  );
}

interface ToggleProps {
  value: string;
  children: ReactNode;
  active?: boolean;
  onSelect?: (value: string) => void;
  className?: string;
}

export function Toggle({
  value,
  children,
  active,
  onSelect,
  className,
}: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(value)}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-white/10 text-white shadow-inner"
          : "text-zinc-400 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}
