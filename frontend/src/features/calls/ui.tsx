import type { ButtonHTMLAttributes, ReactNode } from "react";

export const INPUT = "min-h-[42px] w-full rounded-[11px] border border-slate-300/70 bg-elevated px-3 text-[13.5px] text-ink outline-none focus:border-accent dark:border-white/[0.12]";
export const CARD = "rounded-2xl border border-line bg-surface";
export const H = "m-0 text-sm font-semibold text-slate-700 dark:text-slate-200";
export const MUTED = "text-[12.5px] text-muted";
export const SOFT = "text-slate-600 dark:text-slate-300";

export function Chip({ on, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`min-h-[34px] cursor-pointer rounded-full border px-3 text-[12.5px] ${
        on ? "border-blue-500/50 bg-blue-500/10 font-semibold text-ink dark:border-blue-300/60 dark:bg-blue-500/[0.18]" : "border-black/10 text-muted dark:border-white/10"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Ghost({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`min-h-[38px] cursor-pointer rounded-[10px] border border-slate-300 bg-transparent px-[13px] text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.16] ${SOFT} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Add({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`min-h-10 cursor-pointer rounded-[11px] border border-dashed border-blue-500/50 bg-transparent px-3.5 text-[13px] text-blue-600 dark:border-blue-300/45 dark:text-blue-300 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Primary({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`min-h-[42px] cursor-pointer rounded-xl border-0 bg-accent px-[18px] text-[13.5px] font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function UnderlineTab({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`-mb-px min-h-10 cursor-pointer whitespace-nowrap border-b-2 bg-transparent px-0.5 text-[13.5px] ${on ? "border-accent font-semibold text-ink" : "border-transparent text-muted"}`}
    >
      {children}
    </button>
  );
}
