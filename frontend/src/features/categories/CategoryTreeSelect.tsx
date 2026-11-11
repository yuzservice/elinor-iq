import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { checkState, indexTree, searchNodes, selectionText, toggleNode, type CategoryNode } from "./categoryTree";

// Inline, not absolute: filter panels scroll, so an overlay list would be clipped (same as MultiSelect).
const LIST_CLASS = "mt-1 flex max-h-[320px] flex-col overflow-hidden rounded-xl border border-slate-300/70 bg-surface dark:border-white/[0.14]";

/** The one category selector of the app: expand/collapse, a parent selects its subtree (partial state), search by path. */
export function CategoryTreeSelect({ label, nodes, selected, onChange, overlay = false }: {
  label: string;
  nodes: CategoryNode[];
  selected: number[];
  onChange: (ids: number[]) => void;
  overlay?: boolean; // float over the page (report bars) instead of pushing content (filter panels)
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const index = useMemo(() => indexTree(nodes), [nodes]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const toggle = (id: number) => onChange(toggleNode(id, selected, index));
  const flip = (id: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      setOpen(false);
    }
  };

  const found = searchNodes(nodes, query);
  const visibleTree: CategoryNode[] = [];
  const walk = (parent: number | null) =>
    (index.children.get(parent) ?? []).forEach((id) => {
      const node = index.byId.get(id) as CategoryNode;
      visibleTree.push(node);
      if (expanded.has(id)) walk(id);
    });
  walk(null);
  const rows = query.trim() ? found : visibleTree;

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="tree"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${selectionText(selected, index)}`}
        onClick={() => setOpen(!open)}
        className={`flex cursor-pointer items-center justify-between gap-2 rounded-[10px] border px-2.5 text-right text-[13px] ${
          overlay ? "min-h-[38px] bg-elevated px-3" : "min-h-9 w-full bg-surface"
        } ${selected.length ? "border-blue-400/60 text-ink" : "border-slate-300/70 text-muted dark:border-white/[0.12]"}`}
      >
        {overlay ? <span className="text-muted">{label}</span> : null}
        <span className={`truncate ${overlay ? (selected.length ? "max-w-[160px] text-[12.5px] text-blue-600 dark:text-blue-300" : "text-[12.5px] text-faint") : ""}`}>
          {overlay && !selected.length ? "همه" : selectionText(selected, index)}
        </span>
        <span aria-hidden="true" className="text-[10px] text-faint">▾</span>
      </button>
      {open ? (
        <div className={`${LIST_CLASS} ${overlay ? "absolute right-0 top-full z-40 w-[300px] shadow-2xl" : ""}`}>
          <input
            type="search"
            aria-label={`جستجو در ${label}`}
            placeholder="جستجوی دسته"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="m-1.5 min-h-8 rounded-lg border border-slate-300/70 bg-elevated px-2.5 text-[13px] text-ink outline-none focus:border-accent dark:border-white/[0.12]"
          />
          <div id={listId} role="tree" aria-multiselectable aria-label={label} className="overflow-y-auto px-1 pb-1">
            {rows.map((node) => {
              const state = checkState(node.id, selected, index);
              const searching = Boolean(query.trim());
              return (
                <div
                  key={node.id}
                  role="treeitem"
                  aria-selected={state === "on"}
                  aria-expanded={!searching && node.has_children ? expanded.has(node.id) : undefined}
                  className="flex min-h-8 items-center gap-1.5 rounded-lg px-1.5 text-[13px] text-ink hover:bg-hover"
                  style={{ paddingInlineStart: searching ? 6 : 6 + node.depth * 16 }}
                >
                  {!searching && node.has_children ? (
                    <button
                      type="button"
                      aria-label={expanded.has(node.id) ? `بستن ${node.title}` : `باز کردن ${node.title}`}
                      onClick={() => flip(node.id)}
                      className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent text-[11px] text-faint hover:bg-hover"
                    >
                      {expanded.has(node.id) ? "▾" : "◂"}
                    </button>
                  ) : (
                    <span className="w-6 shrink-0" />
                  )}
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state === "on"}
                      ref={(input) => {
                        if (input) input.indeterminate = state === "partial";
                      }}
                      onChange={() => toggle(node.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">{searching ? node.path : node.label}</span>
                  </label>
                </div>
              );
            })}
            {!rows.length ? <p className="m-0 px-2.5 py-2 text-[12.5px] text-muted">{nodes.length ? "موردی پیدا نشد." : "در حال دریافت دسته‌ها..."}</p> : null}
          </div>
          <div className="flex justify-end border-t border-line px-1.5 py-1">
            <button type="button" disabled={!selected.length} onClick={() => onChange([])} className="min-h-7 cursor-pointer border-0 bg-transparent px-2 text-[12.5px] text-blue-600 disabled:opacity-40 dark:text-blue-300">
              پاک کردن
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
