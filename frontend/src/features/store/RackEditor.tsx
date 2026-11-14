/** «طراحی رگال»: one rack drawn large; pieces drag along the spine, full-piece edges change length, the end handle the
 * rack length and the dashed handles its depth. */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { toFaDigits } from "../../lib/dates";
import { MIN_FULL, fitSlots, newKey, sides, snap } from "./geometry";
import type { Kind, Rack, Side, Slot } from "./types";

const cm = (n: number) => `${toFaDigits(n)} سانت`;
const SIDE = { a: "طرف الف", b: "طرف ب" } as const;
const KIND = { full: "رگال کامل", half: "نیم‌رگال" } as const;

type Drag = { mode: "move" | "left" | "right" | "len" | "arm"; index: number | null; grab?: number };

type Props = {
  rack: Rack;
  canDelete: boolean;
  onChange: (rack: Rack) => void;
  onGoods: () => void;
  onCopy: () => void;
  onDelete: () => void;
};

function Seg<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-[9px] p-0.5" style={{ background: "var(--map-floor)" }}>
      {options.map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onPick(key)}
          className={`min-h-7 cursor-pointer rounded-lg border-0 px-[11px] text-[12.5px] ${value === key ? "bg-accent font-semibold text-on-accent" : "bg-transparent text-muted"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

const GHOST = "min-h-8 cursor-pointer rounded-[10px] border border-line bg-transparent px-3 text-[12.5px] text-muted hover:text-ink disabled:cursor-default disabled:opacity-35";

export function RackEditor({ rack, canDelete, onChange, onGoods, onCopy, onDelete }: Props) {
  const [selected, setSelected] = useState<number | null>(rack.slots.length ? 0 : null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const spineRef = useRef<HTMLDivElement>(null);
  const rackRef = useRef(rack);
  rackRef.current = rack;
  const K = Math.min(2.2, 980 / Math.max(rack.length_cm, 300));
  const armPx = rack.arm_cm * K;
  const px = (c: number) => Math.round(c * K);
  const slot = selected !== null ? rack.slots[selected] ?? null : null;

  useEffect(() => setSelected((s) => (s !== null && s < rack.slots.length ? s : rack.slots.length ? 0 : null)), [rack.key, rack.slots.length]);

  const update = (fn: (r: Rack) => Rack) => onChange(fitSlots(fn(rackRef.current)));
  const setSlot = (index: number, patch: Partial<Slot>) => update((r) => ({ ...r, slots: r.slots.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const el = spineRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const xCm = (r.right - e.clientX) / K, yCm = Math.abs(e.clientY - r.top) / K;
      const cur = rackRef.current;
      const piece = drag.index !== null ? cur.slots[drag.index] : null;
      let next: Rack = cur;
      if (drag.mode === "move" && piece) {
        const max = cur.length_cm - (piece.kind === "full" ? piece.length_cm ?? 0 : 0);
        next = { ...cur, slots: cur.slots.map((s, i) => (i === drag.index ? { ...s, offset_cm: Math.max(0, Math.min(max, snap(xCm - (drag.grab ?? 0), 5))) } : s)) };
      } else if (drag.mode === "left" && piece) {
        const length = Math.max(MIN_FULL, Math.min(cur.length_cm - piece.offset_cm, snap(xCm - piece.offset_cm, 5)));
        next = { ...cur, slots: cur.slots.map((s, i) => (i === drag.index ? { ...s, length_cm: length } : s)) };
      } else if (drag.mode === "right" && piece) {
        const end = piece.offset_cm + (piece.length_cm ?? 0);
        const offset = Math.max(0, Math.min(end - MIN_FULL, snap(xCm, 5)));
        next = { ...cur, slots: cur.slots.map((s, i) => (i === drag.index ? { ...s, offset_cm: offset, length_cm: end - offset } : s)) };
      } else if (drag.mode === "len") {
        const need = Math.max(100, ...cur.slots.map((s) => s.offset_cm + (s.kind === "full" ? s.length_cm ?? 0 : 0)));
        next = { ...cur, length_cm: Math.max(need, Math.min(1200, snap(xCm, 10))) };
      } else if (drag.mode === "arm") {
        next = { ...cur, arm_cm: Math.max(25, Math.min(150, snap(yCm, 5))) };
      }
      if (JSON.stringify(next) !== JSON.stringify(cur)) onChange(fitSlots(next));
    };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, K, onChange]);

  const start = (mode: Drag["mode"], index: number | null, grab?: number) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (index !== null) setSelected(index);
    setDrag({ mode, index, grab });
  };

  const addPiece = (side: Side, kind: Kind) =>
    update((r) => {
      const length = kind === "full" ? Math.min(100, r.length_cm) : null;
      setSelected(r.slots.length);
      return { ...r, slots: [...r.slots, { id: null, key: newKey("s"), side, kind, offset_cm: Math.max(0, r.length_cm - (length ?? 0) - (kind === "half" ? 10 : 0)), length_cm: length, product: null }] };
    });

  const copyPiece = () => {
    if (!slot) return;
    update((r) => {
      setSelected(r.slots.length);
      const step = slot.kind === "full" ? (slot.length_cm ?? 0) + 5 : 20;
      return { ...r, slots: [...r.slots, { ...slot, id: null, key: newKey("s"), product: null, offset_cm: slot.offset_cm + step }] };
    });
  };

  const deletePiece = () => {
    if (selected === null || !slot) return;
    if (slot.product && !window.confirm(`«${toFaDigits(slot.product.title)}» روی این تکه است. تکه حذف شود؟`)) return;
    update((r) => ({ ...r, slots: r.slots.filter((_, i) => i !== selected) }));
    setSelected(null);
  };

  const edge = (side: "left" | "right", on: boolean): CSSProperties => ({
    position: "absolute", top: 0, bottom: 0, [side]: -5, width: 10, cursor: "ew-resize", zIndex: 2, touchAction: "none",
    ...(on ? { [side === "left" ? "borderLeft" : "borderRight"]: "3px solid var(--accent)", borderRadius: 3 } : {}),
  });
  const armHandle = (top: boolean): CSSProperties => ({
    position: "absolute", left: "calc(50% - 22px)", width: 44, height: 10, [top ? "top" : "bottom"]: -Math.round(armPx + 9), borderRadius: 5,
    background: "var(--accent)", border: "2px solid var(--map-floor)", cursor: "ns-resize", zIndex: 4, touchAction: "none",
  });
  const dim: CSSProperties = { position: "absolute", padding: "1px 7px", borderRadius: 999, background: "var(--accent)", color: "var(--on-accent)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", pointerEvents: "none" };
  const ruler = [];
  for (let c = 0; c <= rack.length_cm; c += 50) ruler.push(c);

  return (
    <section aria-label="طراحی رگال" className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="m-0 text-[15px] font-semibold text-ink">طراحی رگال</h2>
          <input value={rack.code} onChange={(e) => onChange({ ...rack, code: e.target.value.slice(0, 32) })} aria-label="کد رگال"
            className="min-h-8 w-[84px] rounded-[10px] border border-line bg-elevated px-3 text-[13px] text-ink outline-none focus:border-accent" />
          <span className="text-[12.5px] text-muted">
            طول {cm(rack.length_cm)} · عمق {cm(rack.arm_cm * sides(rack))}{sides(rack) === 1 ? " · یک‌طرفه (دیواری)" : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={onGoods} className="min-h-[34px] cursor-pointer rounded-[10px] border-0 bg-accent px-3.5 text-[13px] font-semibold text-on-accent">کالاهای این رگال</button>
          <button type="button" onClick={onCopy} className={GHOST}>⧉ کپی رگال</button>
          <button type="button" onClick={onDelete} disabled={!canDelete} className={`${GHOST} !border-rose/35 !text-rose`}>حذف رگال</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-elevated px-2.5 py-2">
        <span className="text-xs text-muted">افزودن:</span>
        <button type="button" className={GHOST} onClick={() => addPiece("a", "full")}>رگال کامل · طرف الف</button>
        <button type="button" className={GHOST} onClick={() => addPiece("a", "half")}>نیم‌رگال · طرف الف</button>
        <button type="button" className={GHOST} onClick={() => addPiece("b", "full")}>رگال کامل · طرف ب</button>
        <button type="button" className={GHOST} onClick={() => addPiece("b", "half")}>نیم‌رگال · طرف ب</button>
        {slot && selected !== null ? (
          <>
            <span className="mx-1 h-[22px] w-px bg-line" />
            <span className="text-xs text-muted">تکه انتخاب‌شده:</span>
            <Seg label="طرف" value={slot.side} options={[["a", "الف"], ["b", "ب"]]} onPick={(side) => setSlot(selected, { side })} />
            <Seg label="نوع" value={slot.kind} options={[["full", "کامل"], ["half", "نیم"]]}
              onPick={(kind) => setSlot(selected, { kind, length_cm: kind === "full" ? Math.min(100, rack.length_cm) : null })} />
            <button type="button" className={GHOST} onClick={copyPiece} title="کپی تکه" aria-label="کپی تکه">⧉</button>
            <button type="button" className={`${GHOST} !border-rose/35 !text-rose`} onClick={deletePiece} title="حذف تکه" aria-label="حذف تکه">✕</button>
          </>
        ) : null}
      </div>

      <div className="relative select-none overflow-hidden rounded-[14px] border border-line"
        style={{
          height: Math.round(armPx * 2 + 120), backgroundColor: "var(--map-floor)",
          backgroundImage: "linear-gradient(var(--map-grid) 1px, transparent 1px), linear-gradient(90deg, var(--map-grid) 1px, transparent 1px)",
          backgroundSize: `${Math.round(10 * K)}px ${Math.round(10 * K)}px`,
          cursor: drag ? (drag.mode === "arm" ? "ns-resize" : drag.mode === "move" ? "grabbing" : "ew-resize") : "default",
        }}>
        <div ref={spineRef} className="absolute top-1/2 h-0" style={{ right: 60, width: px(rack.length_cm) }}>
          <span aria-hidden="true" className="absolute inset-x-0 -top-[3px] h-1.5 rounded-[3px]" style={{ background: "var(--map-spine)" }} />
          {[true, false].map((top) => (
            <span key={String(top)} aria-hidden="true" className="absolute inset-x-0" style={{ [top ? "top" : "bottom"]: -Math.round(armPx + 4), borderTop: "1px dashed color-mix(in srgb, var(--accent) 45%, transparent)" }} />
          ))}
          <span title="عمق را بکشید" onPointerDown={start("arm", null)} style={armHandle(true)} />
          <span title="عمق را بکشید" onPointerDown={start("arm", null)} style={armHandle(false)} />
          {rack.slots.map((s, i) => {
            const on = i === selected, top = s.side === "a", showDim = on || drag?.index === i;
            const colour = on ? "var(--accent)" : s.product ? "var(--text-secondary)" : "var(--text-faint)";
            const label = s.product ? toFaDigits(s.product.title) : KIND[s.kind];
            const grab = (e: ReactPointerEvent) => {
              const r = spineRef.current!.getBoundingClientRect();
              start("move", i, (r.right - e.clientX) / K - s.offset_cm)(e);
            };
            const aria = `${SIDE[s.side]}، ${KIND[s.kind]}، ${cm(s.offset_cm)} از سر راست`;
            if (s.kind === "full") {
              return (
                <div key={s.key} role="button" tabIndex={0} aria-label={aria} aria-pressed={on} onPointerDown={grab} onFocus={() => setSelected(i)}
                  className="absolute cursor-grab" style={{ right: px(s.offset_cm), width: px(s.length_cm ?? 0), height: Math.round(armPx), [top ? "bottom" : "top"]: 3, zIndex: on ? 3 : 1, touchAction: "none" }}>
                  <span className="absolute inset-0 box-border rounded-md" style={{ border: `2px solid ${colour}`, background: s.product ? `color-mix(in srgb, ${s.product.color ?? "var(--accent)"} 20%, transparent)` : "var(--map-empty)",
                    boxShadow: on ? "0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent)" : undefined }} />
                  <span className={`pointer-events-none absolute inset-x-2 top-[calc(50%-9px)] truncate text-center text-xs font-semibold ${s.product ? "text-ink" : "text-faint"}`}>{label}</span>
                  <span title="طول را بکشید" onPointerDown={start("left", i)} style={edge("left", on)} />
                  <span title="طول را بکشید" onPointerDown={start("right", i)} style={edge("right", on)} />
                  {showDim ? <span style={{ ...dim, left: "50%", transform: "translateX(-50%)", [top ? "top" : "bottom"]: -22 }}>{cm(s.length_cm ?? 0)} · از {toFaDigits(s.offset_cm)}</span> : null}
                </div>
              );
            }
            return (
              <div key={s.key} role="button" tabIndex={0} aria-label={aria} aria-pressed={on} onPointerDown={grab} onFocus={() => setSelected(i)}
                className="absolute cursor-grab" style={{ right: `calc(${px(s.offset_cm)}px - 20px)`, width: 40, height: Math.round(armPx + 6), [top ? "bottom" : "top"]: 3, zIndex: on ? 3 : 1, touchAction: "none" }}>
                <span className="absolute left-[calc(50%-2px)] w-1 rounded-sm" style={{ [top ? "bottom" : "top"]: 0, height: Math.round(armPx), background: colour }} />
                <span className="absolute inset-x-0 h-1 rounded-sm" style={{ [top ? "top" : "bottom"]: 4, background: colour, boxShadow: on ? "0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent)" : undefined }} />
                <span className={`pointer-events-none absolute -inset-x-[50px] truncate text-center text-[11.5px] font-semibold ${s.product ? "text-ink" : "text-faint"}`} style={{ [top ? "top" : "bottom"]: -20 }}>{label}</span>
                {showDim ? <span style={{ ...dim, left: "50%", transform: "translateX(-50%)", [top ? "top" : "bottom"]: -42 }}>از {toFaDigits(s.offset_cm)}</span> : null}
              </div>
            );
          })}
          <span title="طول رگال را بکشید" onPointerDown={start("len", null)}
            className="absolute -left-[7px] -top-4 z-[4] h-8 w-2.5 cursor-ew-resize rounded-[5px] bg-accent" style={{ border: "2px solid var(--map-floor)", touchAction: "none" }} />
          <span style={{ ...dim, left: -12, top: 22, transform: "translateX(-100%)", ...(drag?.mode === "len" ? {} : { background: "var(--elevated)", color: "var(--text-secondary)" }) }}>{cm(rack.length_cm)}</span>
          {ruler.map((c) => (
            <span key={c} className="absolute text-[10px] text-faint" style={{ right: px(c), top: Math.round(armPx + 14), transform: "translateX(50%)" }}>{toFaDigits(c)}</span>
          ))}
        </div>
        <span className="absolute right-3.5 top-2.5 text-[11.5px] text-muted">طرف الف</span>
        <span className="absolute bottom-2.5 right-3.5 text-[11.5px] text-muted">طرف ب</span>
      </div>
      <span className="text-[11.5px] text-muted">
        تکه را بکشید تا جابه‌جا شود · لبه رگال کامل طولش را عوض می‌کند · دستگیره سر خط وسط طول رگال و خط‌چین بالا و پایین عمق آن است · برای رگال دیواری فقط یک طرف تکه بگذارید.
      </span>
    </section>
  );
}
