/** Line template editor: the template drawn large; pieces drag along the spine, full-piece edges change length, the end
 * handle the template length and the dashed handles its depth. A piece with a product on any rack cannot be removed. */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { toFaDigits } from "../../lib/dates";
import { MIN_FULL, filledRacks, fitPieces, newKey, sides, snap } from "./geometry";
import type { Kind, Rack, Side, Template, TemplatePiece } from "./types";

const cm = (n: number) => `${toFaDigits(n)} سانت`;
const SIDE = { a: "طرف الف", b: "طرف ب" } as const;
const KIND = { full: "رگال کامل", half: "نیم‌رگال" } as const;
export const GHOST = "min-h-8 cursor-pointer rounded-[10px] border border-line bg-transparent px-3 text-[12.5px] text-muted hover:text-ink disabled:cursor-default disabled:opacity-35";

type Drag = { mode: "move" | "left" | "right" | "len" | "arm"; index: number | null; grab?: number };

type Props = {
  template: Template;
  racks: Rack[];
  onChange: (t: Template) => void;
  onBlock: (message: string) => void;
};

export function Seg<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
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

export function LineTemplateEditor({ template: t, racks, onChange, onBlock }: Props) {
  const [selected, setSelected] = useState<number | null>(t.pieces.length ? 0 : null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const spineRef = useRef<HTMLDivElement>(null);
  const tRef = useRef(t);
  tRef.current = t;
  const length = t.length_cm ?? 150, arm = t.arm_cm ?? 50;
  const K = Math.min(2.2, 900 / Math.max(length, 300));
  const armPx = arm * K;
  const px = (c: number) => Math.round(c * K);
  const piece = selected !== null ? t.pieces[selected] ?? null : null;
  const filledOn = (p: TemplatePiece) => filledRacks(racks, t, { pieceId: p.id });

  useEffect(() => setSelected((s) => (s !== null && s < t.pieces.length ? s : t.pieces.length ? 0 : null)), [t.id, t.pieces.length]);

  const update = (fn: (cur: Template) => Template) => onChange(fitPieces(fn(tRef.current)));
  const setPiece = (index: number, patch: Partial<TemplatePiece>) => update((cur) => ({ ...cur, pieces: cur.pieces.map((p, i) => (i === index ? { ...p, ...patch } : p)) }));

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const el = spineRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const xCm = (r.right - e.clientX) / K, yCm = Math.abs(e.clientY - r.top) / K;
      const cur = tRef.current;
      const len = cur.length_cm ?? 150;
      const p = drag.index !== null ? cur.pieces[drag.index] : null;
      let next: Template = cur;
      if (drag.mode === "move" && p) {
        const max = len - (p.kind === "full" ? p.length_cm ?? 0 : 0);
        next = { ...cur, pieces: cur.pieces.map((x, i) => (i === drag.index ? { ...x, offset_cm: Math.max(0, Math.min(max, snap(xCm - (drag.grab ?? 0), 5))) } : x)) };
      } else if (drag.mode === "left" && p) {
        const l = Math.max(MIN_FULL, Math.min(len - p.offset_cm, snap(xCm - p.offset_cm, 5)));
        next = { ...cur, pieces: cur.pieces.map((x, i) => (i === drag.index ? { ...x, length_cm: l } : x)) };
      } else if (drag.mode === "right" && p) {
        const end = p.offset_cm + (p.length_cm ?? 0);
        const offset = Math.max(0, Math.min(end - MIN_FULL, snap(xCm, 5)));
        next = { ...cur, pieces: cur.pieces.map((x, i) => (i === drag.index ? { ...x, offset_cm: offset, length_cm: end - offset } : x)) };
      } else if (drag.mode === "len") {
        const need = Math.max(100, ...cur.pieces.map((x) => x.offset_cm + (x.kind === "full" ? x.length_cm ?? 0 : 0)));
        next = { ...cur, length_cm: Math.max(need, Math.min(1200, snap(xCm, 10))) };
      } else if (drag.mode === "arm") {
        next = { ...cur, arm_cm: Math.max(25, Math.min(150, snap(yCm, 5))) };
      }
      if (JSON.stringify(next) !== JSON.stringify(cur)) onChange(fitPieces(next));
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
    update((cur) => {
      const len = cur.length_cm ?? 150;
      const l = kind === "full" ? Math.min(100, len) : null;
      setSelected(cur.pieces.length);
      return { ...cur, pieces: [...cur.pieces, { id: null, key: newKey("p"), side, kind, offset_cm: Math.max(0, len - (l ?? 0) - (kind === "half" ? 10 : 0)), length_cm: l }] };
    });

  const copyPiece = () => {
    if (!piece) return;
    update((cur) => {
      setSelected(cur.pieces.length);
      const step = piece.kind === "full" ? (piece.length_cm ?? 0) + 5 : 20;
      return { ...cur, pieces: [...cur.pieces, { ...piece, id: null, key: newKey("p"), offset_cm: piece.offset_cm + step }] };
    });
  };

  const deletePiece = () => {
    if (selected === null || !piece) return;
    const filled = filledOn(piece);
    if (filled.length) return onBlock(`این تکه روی ${toFaDigits(filled.length)} رگال کالا دارد (${filled.map((r) => r.code).join("، ")}). اول کالا را بردارید.`);
    if (t.pieces.length < 2) return onBlock("قالب دست‌کم یک تکه لازم دارد.");
    update((cur) => ({ ...cur, pieces: cur.pieces.filter((_, i) => i !== selected) }));
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
  const ruler: number[] = [];
  for (let c = 0; c <= length; c += 50) ruler.push(c);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-elevated px-2.5 py-2">
        <span className="text-xs text-muted">افزودن:</span>
        <button type="button" className={GHOST} onClick={() => addPiece("a", "full")}>رگال کامل · طرف الف</button>
        <button type="button" className={GHOST} onClick={() => addPiece("a", "half")}>نیم‌رگال · طرف الف</button>
        <button type="button" className={GHOST} onClick={() => addPiece("b", "full")}>رگال کامل · طرف ب</button>
        <button type="button" className={GHOST} onClick={() => addPiece("b", "half")}>نیم‌رگال · طرف ب</button>
        {piece && selected !== null ? (
          <>
            <span className="mx-1 h-[22px] w-px bg-line" />
            <Seg label="طرف" value={piece.side} options={[["a", "الف"], ["b", "ب"]]} onPick={(side) => setPiece(selected, { side })} />
            <Seg label="نوع" value={piece.kind} options={[["full", "کامل"], ["half", "نیم"]]}
              onPick={(kind) => setPiece(selected, { kind, length_cm: kind === "full" ? Math.min(100, length) : null })} />
            <button type="button" className={GHOST} onClick={copyPiece} title="کپی تکه" aria-label="کپی تکه">⧉</button>
            <button type="button" className={`${GHOST} !border-rose/35 !text-rose`} onClick={deletePiece} title="حذف تکه" aria-label="حذف تکه">✕</button>
          </>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <div className="relative select-none overflow-hidden rounded-[14px] border border-line"
          style={{
            minWidth: px(length) + 140, height: Math.round(armPx * 2 + 120), backgroundColor: "var(--map-floor)",
            backgroundImage: "linear-gradient(var(--map-grid) 1px, transparent 1px), linear-gradient(90deg, var(--map-grid) 1px, transparent 1px)",
            backgroundSize: `${Math.round(10 * K)}px ${Math.round(10 * K)}px`,
            cursor: drag ? (drag.mode === "arm" ? "ns-resize" : drag.mode === "move" ? "grabbing" : "ew-resize") : "default",
          }}>
          <div ref={spineRef} className="absolute top-1/2 h-0" style={{ right: 60, width: px(length) }}>
            <span aria-hidden="true" className="absolute inset-x-0 -top-[3px] h-1.5 rounded-[3px]" style={{ background: "var(--map-spine)" }} />
            {[true, false].map((top) => (
              <span key={String(top)} aria-hidden="true" className="absolute inset-x-0" style={{ [top ? "top" : "bottom"]: -Math.round(armPx + 4), borderTop: "1px dashed color-mix(in srgb, var(--accent) 45%, transparent)" }} />
            ))}
            <span title="عمق را بکشید" onPointerDown={start("arm", null)} style={armHandle(true)} />
            <span title="عمق را بکشید" onPointerDown={start("arm", null)} style={armHandle(false)} />
            {t.pieces.map((p, i) => {
              const on = i === selected, top = p.side === "a", showDim = on || drag?.index === i;
              const n = filledOn(p).length;
              const colour = on ? "var(--accent)" : n ? "var(--text-secondary)" : "var(--text-faint)";
              const label = KIND[p.kind] + (n ? ` · کالا در ${toFaDigits(n)} رگال` : "");
              const grab = (e: ReactPointerEvent) => {
                const r = spineRef.current!.getBoundingClientRect();
                start("move", i, (r.right - e.clientX) / K - p.offset_cm)(e);
              };
              const aria = `${SIDE[p.side]}، ${KIND[p.kind]}، ${cm(p.offset_cm)} از سر راست`;
              if (p.kind === "full") {
                return (
                  <div key={p.key} role="button" tabIndex={0} aria-label={aria} aria-pressed={on} onPointerDown={grab} onFocus={() => setSelected(i)}
                    className="absolute cursor-grab" style={{ right: px(p.offset_cm), width: px(p.length_cm ?? 0), height: Math.round(armPx), [top ? "bottom" : "top"]: 3, zIndex: on ? 3 : 1, touchAction: "none" }}>
                    <span className="absolute inset-0 box-border rounded-md" style={{ border: `2px solid ${colour}`, background: "var(--map-empty)", boxShadow: on ? "0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent)" : undefined }} />
                    <span className="pointer-events-none absolute inset-x-2 top-[calc(50%-9px)] truncate text-center text-xs font-semibold text-muted">{label}</span>
                    <span title="طول را بکشید" onPointerDown={start("left", i)} style={edge("left", on)} />
                    <span title="طول را بکشید" onPointerDown={start("right", i)} style={edge("right", on)} />
                    {showDim ? <span style={{ ...dim, left: "50%", transform: "translateX(-50%)", [top ? "top" : "bottom"]: -22 }}>{cm(p.length_cm ?? 0)} · از {toFaDigits(p.offset_cm)}</span> : null}
                  </div>
                );
              }
              return (
                <div key={p.key} role="button" tabIndex={0} aria-label={aria} aria-pressed={on} onPointerDown={grab} onFocus={() => setSelected(i)}
                  className="absolute cursor-grab" style={{ right: `calc(${px(p.offset_cm)}px - 20px)`, width: 40, height: Math.round(armPx + 6), [top ? "bottom" : "top"]: 3, zIndex: on ? 3 : 1, touchAction: "none" }}>
                  <span className="absolute left-[calc(50%-2px)] w-1 rounded-sm" style={{ [top ? "bottom" : "top"]: 0, height: Math.round(armPx), background: colour }} />
                  <span className="absolute inset-x-0 h-1 rounded-sm" style={{ [top ? "top" : "bottom"]: 4, background: colour, boxShadow: on ? "0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent)" : undefined }} />
                  <span className="pointer-events-none absolute -inset-x-[50px] truncate text-center text-[11.5px] font-semibold text-muted" style={{ [top ? "top" : "bottom"]: -20 }}>{label}</span>
                  {showDim ? <span style={{ ...dim, left: "50%", transform: "translateX(-50%)", [top ? "top" : "bottom"]: -42 }}>از {toFaDigits(p.offset_cm)}</span> : null}
                </div>
              );
            })}
            <span title="طول رگال را بکشید" onPointerDown={start("len", null)}
              className="absolute -left-[7px] -top-4 z-[4] h-8 w-2.5 cursor-ew-resize rounded-[5px] bg-accent" style={{ border: "2px solid var(--map-floor)", touchAction: "none" }} />
            <span style={{ ...dim, left: -12, top: 22, transform: "translateX(-100%)", ...(drag?.mode === "len" ? {} : { background: "var(--elevated)", color: "var(--text-secondary)" }) }}>{cm(length)}</span>
            {ruler.map((c) => (
              <span key={c} className="absolute text-[10px] text-faint" style={{ right: px(c), top: Math.round(armPx + 14), transform: "translateX(50%)" }}>{toFaDigits(c)}</span>
            ))}
          </div>
          <span className="absolute right-3.5 top-2.5 text-[11.5px] text-muted">طرف الف</span>
          <span className="absolute bottom-2.5 right-3.5 text-[11.5px] text-muted">طرف ب</span>
        </div>
      </div>
      <span className="text-[11.5px] text-muted">
        تکه را بکشید تا جابه‌جا شود · لبه رگال کامل طولش را عوض می‌کند · دستگیره سر خط وسط طول رگال و خط‌چین بالا و پایین عمق آن است · برای رگال دیواری فقط یک طرف تکه بگذارید.
      </span>
    </>
  );
}

export const lineInfo = (t: Template) => `${toFaDigits(t.pieces.length)} جایگاه · طول ${cm(t.length_cm ?? 0)} · عمق ${cm((t.arm_cm ?? 0) * sides(t))}`;
