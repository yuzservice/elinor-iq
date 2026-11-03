import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { filterOptions, selectionLabel, type Option } from "./customerListUrl";

// Inline, not absolute: the floating filter panel scrolls, so an overlay list would be clipped.
const LIST_CLASS = "mt-1 flex max-h-64 flex-col overflow-hidden rounded-xl border border-slate-300/70 bg-surface dark:border-white/[0.14]";

/** Compact checkbox dropdown for every option list in the filter panel. `single` keeps at most one value. */
export function MultiSelect({ label, options, selected, single, searchable, onChange }: {
  label: string;
  options: Option[];
  selected: string[];
  single?: boolean;
  searchable?: boolean;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) (root.current?.querySelector<HTMLInputElement>("input[type=search], input[type=checkbox]"))?.focus();
    else setQuery("");
  }, [open]);

  const toggle = (value: string) => {
    if (single) onChange(selected.includes(value) ? [] : [value]);
    else onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      // Close only this list, not the whole filter panel.
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!open) {
      setOpen(true);
      return;
    }
    const items = Array.from(root.current?.querySelectorAll<HTMLInputElement>("[role=listbox] input[type=checkbox]") ?? []);
    const index = items.indexOf(document.activeElement as HTMLInputElement);
    const next = event.key === "ArrowDown" ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
    items[next]?.focus();
  };

  const visible = filterOptions(options, query);
  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${selectionLabel(selected, options)}`}
        onClick={() => setOpen(!open)}
        className={`flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-[11px] border bg-surface px-3 text-right text-[13px] ${
          selected.length ? "border-blue-400/60 text-ink" : "border-slate-300/70 text-muted dark:border-white/[0.12]"
        }`}
      >
        <span className="truncate">{selectionLabel(selected, options)}</span>
        <span aria-hidden="true" className="text-[10px] text-faint">▾</span>
      </button>
      {open ? (
        <div className={LIST_CLASS}>
          {searchable ? (
            <input
              type="search"
              aria-label={`جستجو در ${label}`}
              placeholder="جستجو"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="m-2 min-h-9 rounded-lg border border-slate-300/70 bg-elevated px-2.5 text-[13px] text-ink outline-none focus:border-accent dark:border-white/[0.12]"
            />
          ) : null}
          <div id={listId} role="listbox" aria-multiselectable={!single} aria-label={label} className="overflow-y-auto px-1 pb-1">
            {visible.map((option) => (
              <label key={option.value} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[13px] text-ink hover:bg-hover">
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      toggle(option.value);
                    }
                  }}
                />
                {option.label}
              </label>
            ))}
            {!visible.length ? <p className="m-0 px-2.5 py-2 text-[12.5px] text-muted">موردی پیدا نشد.</p> : null}
          </div>
          <div className="flex justify-end border-t border-line px-2 py-1.5">
            <button type="button" disabled={!selected.length} onClick={() => onChange([])} className="min-h-8 cursor-pointer border-0 bg-transparent px-2 text-[12.5px] text-blue-600 disabled:opacity-40 dark:text-blue-300">
              پاک کردن
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
