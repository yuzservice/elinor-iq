import { useEffect, useMemo, useState } from "react";
import { toFaDigits, toEnDigits } from "../../lib/dates";
import { formatDateTime } from "../../lib/format";
import { ApiError } from "../../services/api";
import { homeService } from "../../services/home";
import { LINES, fa } from "../products/display";
import type { LineKey } from "../products/types";
import { money } from "./TargetsSection";
import type { CopyPreview, TargetGrid } from "./types";

const MILLION = 1_000_000;
const INPUT = "h-8 w-full min-w-[84px] rounded-lg border border-line bg-elevated px-2 text-left text-[13px] tabular-nums text-ink outline-none focus:border-accent";
const GHOST = "min-h-9 cursor-pointer rounded-[10px] border border-line bg-transparent px-3 text-[12.5px] text-muted hover:text-ink disabled:opacity-40";
const PRIMARY = "min-h-9 cursor-pointer rounded-[10px] border-0 bg-accent px-4 text-[12.5px] font-semibold text-on-accent disabled:opacity-40";

type Cell = `${number}:${LineKey}`;
const key = (month: number, line: LineKey) => `${month}:${line}` as Cell;
const SOURCE_NOTE = { target: "از تارگت سال قبل", sales: "از فروش سال قبل", incomplete: "سابقه ناقص؛ خالی می‌ماند" };

/** «تارگت‌ها» in Settings: 12 Jalali months × 4 lines, entered in million toman, saved per change with an audit trail. */
export function TargetsPanel({ initialYear }: { initialYear: number }) {
  const [year, setYear] = useState(initialYear);
  const [grid, setGrid] = useState<TargetGrid | null>(null);
  const [edits, setEdits] = useState<Record<Cell, string>>({});
  const [preview, setPreview] = useState<CopyPreview | null>(null);
  const [growth, setGrowth] = useState("10");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    setGrid(null);
    setEdits({});
    setPreview(null);
    homeService.targetGrid(year).then((g) => alive && setGrid(g)).catch(() => alive && setMessage("تارگت‌ها بارگیری نشد."));
    return () => {
      alive = false;
    };
  }, [year]);

  useEffect(() => {
    // Links from the home page land on this section (/settings#targets).
    if (grid && window.location.hash === "#targets") document.getElementById("targets")?.scrollIntoView({ block: "start" });
  }, [grid]);

  const saved = (month: number, line: LineKey) => grid?.months[month - 1]?.lines[line] ?? null;
  const shown = (month: number, line: LineKey): number | null => {
    const raw = edits[key(month, line)];
    if (raw === undefined) return saved(month, line);
    const value = Number(toEnDigits(raw).replace(/[,٬\s]/g, ""));
    return raw.trim() === "" || !Number.isFinite(value) || value <= 0 ? null : Math.round(value * MILLION);
  };
  const dirty = useMemo(
    () => Object.keys(edits).filter((cell) => {
      const [m, line] = cell.split(":");
      return shown(Number(m), line as LineKey) !== saved(Number(m), line as LineKey);
    }),
    [edits, grid], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const set = (month: number, line: LineKey, raw: string) => setEdits((e) => ({ ...e, [key(month, line)]: raw }));
  const clearMonth = (month: number) => setEdits((e) => ({ ...e, ...Object.fromEntries(LINES.map((l) => [key(month, l.key), ""])) }));
  const rowTotal = (month: number) => LINES.reduce((sum, l) => sum + (shown(month, l.key) ?? 0), 0);
  const colTotal = (line: LineKey) => Array.from({ length: 12 }, (_, i) => shown(i + 1, line) ?? 0).reduce((a, b) => a + b, 0);
  const yearTotal = LINES.reduce((sum, l) => sum + colTotal(l.key), 0);

  const loadPreview = async () => {
    setBusy(true);
    setMessage("");
    try {
      const p = await homeService.copyPreview(year, Number(toEnDigits(growth)) || 0);
      setPreview(p);
      setEdits(Object.fromEntries(p.cells.map((c) => [key(c.month, c.sales_line), c.amount ? String(c.amount / MILLION) : ""])) as Record<Cell, string>);
    } catch (err) {
      setMessage(err instanceof ApiError && err.message ? err.message : "پیش‌نمایش ساخته نشد.");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const cells = dirty.map((cell) => {
        const [m, line] = cell.split(":");
        return { month: Number(m), sales_line: line, amount: shown(Number(m), line as LineKey) };
      });
      const next = await homeService.saveTargets(year, cells, preview ? "copy" : "manual");
      setGrid(next);
      setEdits({});
      setPreview(null);
      setMessage(`${fa(next.changed ?? 0)} خانه ذخیره شد.`);
    } catch (err) {
      setMessage(err instanceof ApiError && err.message ? err.message : "ذخیره نشد.");
    } finally {
      setBusy(false);
    }
  };
  const lineLabel = (line: LineKey) => LINES.find((l) => l.key === line)?.label ?? line;

  return (
    <section id="targets" className="rounded-[24px] bg-surface p-6 shadow-soft">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-[15px] font-semibold text-ink">تارگت‌ها</h2>
          <p className="m-0 mt-1 text-xs text-faint">مبالغ به میلیون تومان، با همان معیار کارت فروش صفحه خانه. تارگت کل = جمع چهار شعبه.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="سال قبل" className={GHOST} disabled={busy} onClick={() => setYear(year - 1)}>›</button>
          <span className="min-w-14 text-center text-sm font-semibold text-ink">{toFaDigits(year)}</span>
          <button type="button" aria-label="سال بعد" className={GHOST} disabled={busy} onClick={() => setYear(year + 1)}>‹</button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-elevated px-3 py-2.5 text-[12.5px] text-muted">
        <span>کپی از سال قبل +</span>
        <input aria-label="درصد رشد" value={growth} onChange={(e) => setGrowth(e.target.value)} className={`${INPUT} !w-16 !min-w-0`} inputMode="decimal" />
        <span>٪</span>
        <button type="button" className={GHOST} disabled={busy || !grid} onClick={loadPreview}>پیش‌نمایش</button>
        {preview ? <span>پیش‌نمایش در جدول؛ تا «ذخیره» نزنید چیزی تغییر نمی‌کند.</span> : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="text-muted">
              <th scope="col" className="px-2 py-1.5 text-right font-medium">ماه</th>
              {LINES.map((l) => <th key={l.key} scope="col" className="px-2 py-1.5 text-right font-medium">{l.label}</th>)}
              <th scope="col" className="px-2 py-1.5 text-right font-medium">جمع</th>
              <th scope="col" className="px-2 py-1.5"><span className="sr-only">پاک کردن</span></th>
            </tr>
          </thead>
          <tbody>
            {(grid?.months ?? []).map((row) => (
              <tr key={row.month} className="border-t border-line">
                <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-ink">{row.name}</th>
                {LINES.map((l) => {
                  const k = key(row.month, l.key);
                  const value = edits[k] ?? (saved(row.month, l.key) != null ? String((saved(row.month, l.key) as number) / MILLION) : "");
                  const cell = preview?.cells.find((c) => c.month === row.month && c.sales_line === l.key);
                  const changed = dirty.includes(k);
                  return (
                    <td key={l.key} className="px-1.5 py-1" title={cell ? SOURCE_NOTE[cell.source] : undefined}>
                      <input
                        aria-label={`${row.name} ${l.label}`}
                        inputMode="decimal"
                        value={value}
                        onChange={(e) => set(row.month, l.key, e.target.value)}
                        className={`${INPUT} ${changed ? "!border-amber-400" : ""} ${cell?.source === "incomplete" ? "opacity-50" : ""}`}
                      />
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-2 py-1.5 font-semibold tabular-nums text-ink">{fa(rowTotal(row.month) / MILLION)}</td>
                <td className="px-1 py-1.5">
                  <button type="button" className="cursor-pointer whitespace-nowrap border-0 bg-transparent text-xs text-blue-600 dark:text-blue-300" onClick={() => clearMonth(row.month)}>پاک کردن</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line font-semibold text-ink">
              <th scope="row" className="px-2 py-2 text-right">جمع سال</th>
              {LINES.map((l) => <td key={l.key} className="px-2 py-2 tabular-nums">{fa(colTotal(l.key) / MILLION)}</td>)}
              <td className="px-2 py-2 tabular-nums">{fa(yearTotal / MILLION)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={PRIMARY} disabled={busy || !dirty.length} onClick={save}>ذخیره {dirty.length ? `(${fa(dirty.length)} خانه)` : ""}</button>
        <button type="button" className={GHOST} disabled={busy || (!dirty.length && !preview)} onClick={() => (setEdits({}), setPreview(null))}>لغو تغییرات</button>
        {message ? <span role="status" className="text-[12.5px] text-muted">{message}</span> : null}
        {yearTotal ? <span className="ms-auto text-[12.5px] text-muted">تارگت سال: {money(yearTotal)} تومان</span> : null}
      </div>

      {grid?.changes.length ? (
        <details className="mt-4 text-[12.5px] text-muted">
          <summary className="cursor-pointer">آخرین تغییرات</summary>
          <ul className="m-0 mt-2 list-none space-y-1 p-0">
            {grid.changes.map((c, i) => (
              <li key={i}>
                {formatDateTime(c.at)} · {c.by ?? "—"} · {grid.months[c.month - 1]?.name} {lineLabel(c.sales_line)}:{" "}
                {c.old == null ? "خالی" : fa(c.old / MILLION)} ← {c.new == null ? "پاک شد" : fa(c.new / MILLION)}
                {c.source === "copy" ? " (کپی از سال قبل)" : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
