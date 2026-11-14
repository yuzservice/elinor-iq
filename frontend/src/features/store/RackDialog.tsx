/** Rack popup: the rack drawing, its slots, and (for edit roles) product search. A bottom sheet on phones. */
import { useEffect, useState } from "react";
import { toFaDigits } from "../../lib/dates";
import { storeMapService } from "../../services/storeMap";
import { STATUS } from "../products/display";
import { firstEmpty, nextEmpty, placed, slotOrder } from "./geometry";
import type { MapProduct, Rack } from "./types";

const SIDE = { a: "طرف الف", b: "طرف ب" } as const;
const KIND = { full: "رگال کامل", half: "نیم‌رگال" } as const;

type Props = {
  rack: Rack;
  readOnly: boolean;
  onAssign: (slotKey: string, product: MapProduct | null) => Promise<void>;
  onClose: () => void;
};

function Swatch({ product, size = 26 }: { product: MapProduct | null; size?: number }) {
  return (
    <span className="flex-none rounded-[7px]" style={{ width: size, height: size, ...(product ? { background: product.color ?? "var(--accent)", border: "1px solid var(--border)" } : { border: "1px dashed var(--text-faint)" }) }} />
  );
}

export function RackDialog({ rack, readOnly, onAssign, onClose }: Props) {
  const [selected, setSelected] = useState<number | null>(() => firstEmpty(rack));
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ items: MapProduct[]; page: number; pages: number } | null>(null);
  const [error, setError] = useState("");
  const slot = selected !== null ? rack.slots[selected] : null;
  const [total, filled] = placed(rack);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (readOnly) return;
    let alive = true;
    const timer = setTimeout(() => {
      storeMapService.products(q.trim(), 1)
        .then((page) => alive && setResults({ items: page.results, page: page.page, pages: page.pages }))
        .catch(() => alive && setResults({ items: [], page: 1, pages: 1 }));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, readOnly]);

  const more = async () => {
    if (!results || results.page >= results.pages) return;
    const page = await storeMapService.products(q.trim(), results.page + 1);
    setResults({ items: [...results.items, ...page.results], page: page.page, pages: page.pages });
  };

  const assign = async (product: MapProduct | null) => {
    if (selected === null || !slot) return;
    setError("");
    const index = selected;
    if (product) {
      const after = { ...rack, slots: rack.slots.map((s, i) => (i === index ? { ...s, product } : s)) };
      setSelected(nextEmpty(after, index));
      setQ("");
    }
    try {
      await onAssign(slot.key, product);
    } catch (err) {
      setSelected(index);
      setError((err as Error).message || "ذخیره نشد؛ دوباره امتحان کنید.");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-5 backdrop-blur-[3px] max-sm:items-end max-sm:p-0" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`کالاهای رگال ${rack.code}`} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100vh-40px)] w-[min(860px,100%)] flex-col gap-3.5 overflow-auto rounded-[20px] border border-line bg-surface px-5 py-[18px] shadow-soft max-sm:max-h-[88vh] max-sm:rounded-b-none max-sm:px-3.5 max-sm:pb-5 max-sm:pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-[3px]">
            <h2 className="m-0 text-lg font-extrabold text-ink">کالاهای رگال {rack.code}</h2>
            <span className="text-[12.5px] text-muted">{toFaDigits(filled)} از {toFaDigits(total)} جایگاه کالا دارد · طول {toFaDigits(rack.length_cm)} سانت</span>
          </div>
          <button type="button" aria-label="بستن" onClick={onClose} className="h-[34px] w-[34px] cursor-pointer rounded-lg border border-line bg-transparent text-[15px] text-muted hover:text-ink">✕</button>
        </div>

        <div className="relative h-[190px] rounded-[14px] border border-line max-sm:h-[150px]" style={{ background: "var(--map-floor)" }}>
          <div className="absolute inset-y-[18px] left-11 right-11">
            <span aria-hidden="true" className="absolute inset-x-0 top-[calc(50%-2px)] h-1 rounded-sm" style={{ background: "var(--map-spine)" }} />
            {rack.slots.map((s, i) => {
              const on = i === selected;
              const a0 = (s.offset_cm / rack.length_cm) * 100, w = s.kind === "full" ? ((s.length_cm ?? 0) / rack.length_cm) * 100 : 0;
              const vert = s.side === "a" ? { top: 0, bottom: "calc(50% + 4px)" } : { top: "calc(50% + 4px)", bottom: 0 };
              const colour = s.product?.color ?? "var(--accent)";
              return (
                <button key={s.key} type="button" aria-pressed={on} aria-label={`${SIDE[s.side]}، ${KIND[s.kind]}، ${s.product ? toFaDigits(s.product.title) : "خالی"}`}
                  title={s.product ? toFaDigits(s.product.title) : undefined} onClick={() => setSelected(i)}
                  className="absolute flex cursor-pointer items-center justify-center p-0 font-[inherit] text-inherit"
                  style={s.kind === "full"
                    ? { ...vert, right: `${a0}%`, width: `${w}%`, borderRadius: 8, boxSizing: "border-box", border: `2px ${s.product ? "solid" : "dashed"} ${on ? "var(--accent)" : s.product ? "var(--text-secondary)" : "var(--text-faint)"}`,
                      background: s.product ? `color-mix(in srgb, ${colour} 35%, transparent)` : "transparent", boxShadow: on ? "0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent)" : undefined }
                    : { ...vert, right: `calc(${a0}% - 34px)`, width: 68, border: 0, borderRadius: 8, background: on ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent" }}>
                  {s.kind === "half" ? <span aria-hidden="true" className="absolute inset-y-0 left-[calc(50%-2px)] w-1 rounded-sm" style={{ background: on ? "var(--accent)" : s.product?.color ?? "var(--text-faint)" }} /> : null}
                  <span className={`relative block truncate px-1.5 text-xs font-semibold ${s.product ? "text-ink" : "text-muted"} ${s.kind === "half" ? "rounded-md" : ""}`}
                    style={s.kind === "half" ? { background: "var(--map-chip)" } : undefined}>
                    {s.product ? toFaDigits(s.product.short_code) : readOnly ? "خالی" : "+ کالا"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-muted">جایگاه‌های این رگال</span>
            {slotOrder(rack).map((i) => {
              const s = rack.slots[i], on = i === selected;
              return (
                <button key={s.key} type="button" aria-pressed={on} onClick={() => setSelected(i)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-start font-[inherit] text-inherit ${on ? "border-accent/60 bg-accent/15" : "border-transparent bg-elevated"}`}>
                  <Swatch product={s.product} />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className={`truncate text-[13px] font-semibold ${s.product ? "text-ink" : "text-faint"}`}>{s.product ? toFaDigits(s.product.title) : "خالی"}</span>
                    <span className="text-[11.5px] text-muted">{s.product ? `کد ${toFaDigits(s.product.short_code)} · ` : ""}{SIDE[s.side]} · {KIND[s.kind]}</span>
                  </span>
                  {readOnly ? null : <span className={`flex-none text-xs font-semibold ${s.product ? "text-muted" : "text-accent"}`}>{s.product ? "تغییر" : "+ افزودن"}</span>}
                </button>
              );
            })}
            {rack.slots.length === 0 ? <span className="text-[12.5px] text-muted">این رگال هنوز جایگاهی ندارد.</span> : null}
          </div>

          {readOnly || !slot ? null : (
            <div className="flex flex-col gap-2 rounded-[14px] border border-accent/25 p-3" style={{ background: "var(--map-floor)" }}>
              <span className="text-[13px] font-semibold text-muted">{slot.product ? "تغییر کالای " : "افزودن کالا به "}{SIDE[slot.side]}، {KIND[slot.kind]}</span>
              {slot.id === null ? (
                <span className="text-[12.5px] text-warning">این جایگاه هنوز ذخیره نشده است؛ چند لحظه صبر کنید.</span>
              ) : (
                <>
                  {slot.product ? (
                    <div className="flex items-center justify-between gap-2 rounded-[10px] bg-accent/10 px-2.5 py-2">
                      <span className="flex min-w-0 items-center gap-2"><Swatch product={slot.product} size={16} /><b className="truncate text-[13px] text-ink">{toFaDigits(slot.product.title)}</b></span>
                      <button type="button" onClick={() => assign(null)} className="min-h-7 cursor-pointer rounded-[10px] border border-line bg-transparent px-3 text-[12.5px] text-muted hover:text-ink">برداشتن</button>
                    </div>
                  ) : null}
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام یا کد کالا" aria-label="جستجوی کالا"
                    className="min-h-9 rounded-[10px] border border-line bg-elevated px-3 text-[13px] text-ink outline-none focus:border-accent" />
                  <div className="flex max-h-[260px] flex-col gap-1 overflow-y-auto">
                    {(results?.items ?? []).map((p) => {
                      const on = slot.product?.id === p.id;
                      const status = p.status ? STATUS[p.status] : null;
                      return (
                        <button key={p.id} type="button" aria-pressed={on} onClick={() => assign(p)}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-start font-[inherit] text-inherit ${on ? "border-accent/50 bg-accent/15" : "border-transparent bg-transparent hover:bg-hover"}`}>
                          <Swatch product={p} size={30} />
                          <span className="flex min-w-0 flex-1 flex-col gap-px">
                            <span className="truncate text-[13px] text-ink">{toFaDigits(p.title)}</span>
                            <span className="text-[11.5px] text-muted">کد {toFaDigits(p.short_code)}</span>
                          </span>
                          {status ? <span className="flex-none rounded-full px-2 py-0.5 text-[11px]" style={{ color: status.color, background: `color-mix(in srgb, ${status.color} 12%, transparent)` }}>{status.label}</span> : null}
                        </button>
                      );
                    })}
                    {results && !results.items.length ? <span className="px-1 py-2.5 text-[12.5px] text-muted">کالایی پیدا نشد.</span> : null}
                    {results && results.page < results.pages ? (
                      <button type="button" onClick={more} className="min-h-8 cursor-pointer rounded-[10px] border border-line bg-transparent text-[12.5px] text-muted hover:text-ink">کالاهای بیشتر</button>
                    ) : null}
                  </div>
                </>
              )}
              {error ? <span role="alert" className="text-[12.5px] text-rose">{error}</span> : null}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11.5px] text-muted">
            {readOnly ? "برای دیدن نام کامل، روی جایگاه بزنید." : "تغییرها همان لحظه ذخیره می‌شوند. بعد از انتخاب، جایگاه خالی بعدی انتخاب می‌شود."}
          </span>
          <button type="button" onClick={onClose} className="min-h-[34px] cursor-pointer rounded-[10px] border-0 bg-accent px-3.5 text-[13px] font-semibold text-on-accent">تمام</button>
        </div>
      </div>
    </div>
  );
}
