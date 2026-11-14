/** Rack popup: the rack drawn from its template (line: spine and pieces; hub: top view with a button per step), its slots,
 * and (for edit roles) product search. A bottom sheet on phones. */
import { useEffect, useState } from "react";
import { toFaDigits } from "../../lib/dates";
import { storeMapService } from "../../services/storeMap";
import { STATUS } from "../products/display";
import { elementLabel, elements, firstEmpty, inkOn, nextEmpty, placed, slotFor, type Element } from "./geometry";
import type { MapProduct, Rack, Template } from "./types";

type Props = {
  rack: Rack;
  template: Template;
  readOnly: boolean;
  onAssign: (slotId: number, product: MapProduct | null) => Promise<void>;
  onClose: () => void;
};

const rad = (deg: number) => (deg * Math.PI) / 180;

function Swatch({ product, size = 26 }: { product: MapProduct | null; size?: number }) {
  return (
    <span className="flex-none rounded-[7px]" style={{ width: size, height: size, ...(product ? { background: product.color ?? "var(--accent)", border: "1px solid var(--border)" } : { border: "1px dashed var(--text-faint)" }) }} />
  );
}

function LineDrawing({ rack, t, selected, setSelected, readOnly }: { rack: Rack; t: Template; selected: string | null; setSelected: (k: string) => void; readOnly: boolean }) {
  const len = t.length_cm || 1;
  return (
    <div className="absolute inset-y-[18px] left-11 right-11">
      <span aria-hidden="true" className="absolute inset-x-0 top-[calc(50%-2px)] h-1 rounded-sm" style={{ background: "var(--map-spine)" }} />
      {elements(t).map((el) => {
        const p = el.piece!;
        const product = slotFor(rack, el)?.product ?? null;
        const on = el.key === selected;
        const a0 = (p.offset_cm / len) * 100, w = p.kind === "full" ? ((p.length_cm ?? 0) / len) * 100 : 0;
        const vert = p.side === "a" ? { top: 0, bottom: "calc(50% + 4px)" } : { top: "calc(50% + 4px)", bottom: 0 };
        const colour = product?.color ?? "var(--accent)";
        return (
          <button key={el.key} type="button" aria-pressed={on} aria-label={`${elementLabel(el)}، ${product ? toFaDigits(product.title) : "خالی"}`}
            title={product ? toFaDigits(product.title) : undefined} onClick={() => setSelected(el.key)}
            className="absolute flex cursor-pointer items-center justify-center p-0 font-[inherit] text-inherit"
            style={p.kind === "full"
              ? { ...vert, right: `${a0}%`, width: `${w}%`, borderRadius: 8, boxSizing: "border-box", border: `2px ${product ? "solid" : "dashed"} ${on ? "var(--accent)" : product ? "var(--text-secondary)" : "var(--text-faint)"}`,
                background: product ? `color-mix(in srgb, ${colour} 35%, transparent)` : "transparent", boxShadow: on ? "0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent)" : undefined }
              : { ...vert, right: `calc(${a0}% - 34px)`, width: 68, border: 0, borderRadius: 8, background: on ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent" }}>
            {p.kind === "half" ? <span aria-hidden="true" className="absolute inset-y-0 left-[calc(50%-2px)] w-1 rounded-sm" style={{ background: on ? "var(--accent)" : product?.color ?? "var(--text-faint)" }} /> : null}
            <span className={`relative block truncate px-1.5 text-xs font-semibold ${product ? "text-ink" : "text-muted"} ${p.kind === "half" ? "rounded-md" : ""}`}
              style={p.kind === "half" ? { background: "var(--map-chip)" } : undefined}>
              {product ? toFaDigits(product.short_code) : readOnly ? "خالی" : "+ کالا"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function HubDrawing({ rack, t, selected, setSelected }: { rack: Rack; t: Template; selected: string | null; setSelected: (k: string) => void }) {
  const mk = 100 / Math.max(30, ...t.arms.map((a) => a.length_cm));
  return (
    <div dir="ltr" className="absolute left-1/2 top-1/2 h-0 w-0">
      {t.arms.map((arm, i) => {
        const deg = arm.angle_deg + rack.rotation, c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
        const gap = (arm.length_cm * mk - 14) / arm.steps;
        return (
          <span key={arm.key}>
            <span aria-hidden="true" className="absolute left-0 top-[-2px] h-1 rounded-sm" style={{ width: arm.length_cm * mk, background: "var(--map-spine)", transformOrigin: "0 50%", transform: `rotate(${-deg}deg)` }} />
            <span className="absolute h-5 w-5 rounded-full bg-elevated text-center text-[11px] font-bold leading-5 text-muted"
              style={{ left: c * (arm.length_cm * mk + 16), top: -s * (arm.length_cm * mk + 16), transform: "translate(-50%, -50%)" }}>
              {toFaDigits(i + 1)}
            </span>
            {Array.from({ length: arm.steps }, (_, step) => {
              const el: Element = { key: `${arm.key}:${step}`, arm, armIndex: i, step };
              const product = slotFor(rack, el)?.product ?? null;
              const on = el.key === selected;
              const r = 14 + gap * (step + 0.5), off = gap < 32 ? (step % 2 ? 1 : -1) * 26 : 0;
              return (
                <button key={step} type="button" aria-pressed={on} onClick={() => setSelected(el.key)}
                  aria-label={`بازوی ${toFaDigits(i + 1)}، پله ${toFaDigits(step + 1)}، ${product ? toFaDigits(product.title) : "خالی"}`}
                  title={product ? toFaDigits(product.title) : undefined}
                  className="absolute z-[2] h-[26px] min-w-[40px] cursor-pointer rounded-lg px-[7px] font-[inherit] text-[11.5px] font-bold"
                  style={{ left: c * r + s * off, top: -s * r + c * off, transform: "translate(-50%, -50%)", boxSizing: "border-box",
                    background: product ? product.color ?? "var(--accent)" : "var(--elevated)", color: product ? inkOn(product.color) : "var(--text-secondary)",
                    border: `2px ${product ? "solid" : "dashed"} ${on ? "var(--accent)" : product ? "color-mix(in srgb, var(--text) 25%, transparent)" : "var(--text-faint)"}`,
                    boxShadow: on ? "0 0 0 4px color-mix(in srgb, var(--accent) 30%, transparent)" : undefined }}>
                  {product ? toFaDigits(product.short_code) : "+"}
                </button>
              );
            })}
          </span>
        );
      })}
      <span aria-hidden="true" className="absolute -left-[7px] -top-[7px] h-3.5 w-3.5 rounded-full" style={{ background: "var(--map-spine)", border: "3px solid var(--map-floor)", boxSizing: "border-box" }} />
    </div>
  );
}

export function RackDialog({ rack, template: t, readOnly, onAssign, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(() => firstEmpty(rack, t));
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ items: MapProduct[]; page: number; pages: number } | null>(null);
  const [error, setError] = useState("");
  const els = elements(t);
  const el = els.find((e) => e.key === selected) ?? null;
  const slot = el ? slotFor(rack, el) : undefined;
  const [total, filled] = placed(rack, t);

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
    if (!el || !slot) return;
    setError("");
    const key = el.key;
    if (product) {
      const after = { ...rack, slots: rack.slots.map((s) => (s.id === slot.id ? { ...s, product } : s)) };
      setSelected(nextEmpty(after, t, key));
      setQ("");
    }
    try {
      await onAssign(slot.id, product);
    } catch (err) {
      setSelected(key);
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
            <span className="text-[12.5px] text-muted">{t.name} · {toFaDigits(filled)} از {toFaDigits(total)} جایگاه کالا دارد</span>
          </div>
          <button type="button" aria-label="بستن" onClick={onClose} className="h-[34px] w-[34px] flex-none cursor-pointer rounded-lg border border-line bg-transparent text-[15px] text-muted hover:text-ink">✕</button>
        </div>

        {/* flex: none — the drawing never shrinks when the sheet is short */}
        <div className={`relative flex-none overflow-hidden rounded-[14px] border border-line ${t.kind === "hub" ? "h-[260px] max-sm:h-[250px]" : "h-[190px] max-sm:h-[150px]"}`} style={{ background: "var(--map-floor)" }}>
          {t.kind === "hub"
            ? <HubDrawing rack={rack} t={t} selected={selected} setSelected={setSelected} />
            : <LineDrawing rack={rack} t={t} selected={selected} setSelected={setSelected} readOnly={readOnly} />}
        </div>

        <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-muted">جایگاه‌های این رگال</span>
            {els.map((e) => {
              const product = slotFor(rack, e)?.product ?? null, on = e.key === selected;
              return (
                <button key={e.key} type="button" aria-pressed={on} onClick={() => setSelected(e.key)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-start font-[inherit] text-inherit ${on ? "border-accent/60 bg-accent/15" : "border-transparent bg-elevated"}`}>
                  <Swatch product={product} />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className={`truncate text-[13px] font-semibold ${product ? "text-ink" : "text-faint"}`}>{product ? toFaDigits(product.title) : "خالی"}</span>
                    <span className="text-[11.5px] text-muted">{product ? `کد ${toFaDigits(product.short_code)} · ` : ""}{elementLabel(e)}</span>
                  </span>
                  {readOnly ? null : <span className={`flex-none text-xs font-semibold ${product ? "text-muted" : "text-accent"}`}>{product ? "تغییر" : "+ افزودن"}</span>}
                </button>
              );
            })}
          </div>

          {readOnly || !el ? null : (
            <div className="flex flex-col gap-2 rounded-[14px] border border-accent/25 p-3" style={{ background: "var(--map-floor)" }}>
              <span className="text-[13px] font-semibold text-muted">{slot?.product ? "تغییر کالای " : "افزودن کالا به "}{elementLabel(el)}</span>
              {!slot ? (
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
