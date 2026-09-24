import { useEffect, useRef, useState } from "react";
import type { SalesFilterOption } from "./salesPageFilters";
import { selectionLabel } from "./salesPageFilters";

type FilterMultiSelectProps = {
  label: string;
  allLabel: string;
  options: SalesFilterOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  className?: string;
};

export function FilterMultiSelect({
  label,
  allLabel,
  options,
  value,
  onChange,
  disabled = false,
  className = "",
}: FilterMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = value.length > 0;
  const buttonLabel = selectionLabel(value, options, allLabel);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toggle(key: string) {
    if (value.includes(key)) {
      onChange(value.filter((current) => current !== key));
      return;
    }
    onChange([...value, key]);
  }

  return (
    <div ref={root} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-9 w-full items-center justify-between gap-2 rounded-full border px-3 text-xs transition-colors sm:min-w-[9.5rem] ${
          active
            ? "border-accent/40 bg-accent/5 text-ink"
            : "border-line bg-elevated text-ink hover:bg-hover"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <span className="truncate">{buttonLabel}</span>
        <span className="shrink-0 text-[10px] text-muted">{open ? "▴" : "▼"}</span>
      </button>

      {open && !disabled ? (
        <div
          role="listbox"
          aria-label={label}
          className="absolute z-40 mt-1 max-h-60 w-full min-w-[11rem] overflow-y-auto rounded-2xl border border-line bg-elevated p-1.5 shadow-soft"
        >
          {options.length ? (
            options.map((option) => {
              const selected = value.includes(option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => toggle(option.key)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right text-xs transition-colors ${
                    selected ? "bg-accent/10 text-ink" : "text-muted hover:bg-hover hover:text-ink"
                  }`}
                >
                  <span
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      selected ? "border-accent bg-accent text-[10px] text-on-accent" : "border-line"
                    }`}
                  >
                    {selected ? "✓" : ""}
                  </span>
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2 text-xs text-muted">گزینه‌ای موجود نیست</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
