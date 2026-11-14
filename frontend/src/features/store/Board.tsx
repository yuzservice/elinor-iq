/** The store floor. Every rack is drawn from its template: line racks as a spine plus pieces (no frames), hub racks as a
 * post with arms, a dot per step and one code label per arm just outside its tip. Read-only on the map; in the designer
 * racks are dragged (size comes from the template), the store edges and the door are dragged too. */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { toFaDigits } from "../../lib/dates";
import {
  CELL, STORE_MAX, along, armCodes, clampRack, codeFs, elementLabel, elements, footprint, hubOrigin, minStore, placed, showsCode, sides, slotFor,
  snap, stepRadius, tipLabelTransform, type Templates,
} from "./geometry";
import type { Layout, Rack, Template, TemplatePiece } from "./types";

const WALL = 6;
const KIND = { full: "رگال کامل", half: "نیم‌رگال" } as const;

export type RackTool = "goods" | "template" | "copy" | "rotate" | "delete";

type Design = {
  selected: string | null;
  overlap: Set<string>;
  onSelect: (key: string) => void;
  onChange: (next: Layout) => void;
  onTool: (tool: RackTool, key: string) => void;
};

type Props = {
  layout: Layout;
  templates: Templates;
  zoom: number;
  codesOn: boolean;
  hits?: Set<string> | null;
  onOpen?: (key: string) => void;
  design?: Design;
};

type Drag = { mode: "move" | "bw" | "bh" | "door"; key?: string; dx?: number; dy?: number };

export const doorEdge = (layout: Pick<Layout, "door_side" | "width_cm" | "height_cm">) =>
  layout.door_side === "left" || layout.door_side === "right" ? layout.height_cm : layout.width_cm;

function LinePieces({ rack, t, Z, codesOn }: { rack: Rack; t: Template; Z: number; codesOn: boolean }) {
  const [fw, fh] = footprint(t, rack.rotation);
  const vertical = rack.rotation % 180 !== 0;
  const one = sides(t) === 1;
  const lengthPx = ((vertical ? fh : fw) / CELL) * Z, depthPx = ((vertical ? fw : fh) / CELL) * Z;
  const len = t.length_cm || 1;
  const piece = (p: TemplatePiece) => {
    const product = slotFor(rack, { key: p.key, piece: p })?.product ?? null;
    const a0 = (p.offset_cm / len) * 100, w = p.kind === "full" ? ((p.length_cm ?? 0) / len) * 100 : 0;
    const half = p.kind === "half";
    const fill = product ? `${product.color ?? "#3b82f6"}cc` : "var(--map-empty)";
    const line = product ? "rgba(255,255,255,.55)" : "var(--map-empty-line)";
    const bar = product?.color ?? (product ? "var(--accent)" : "var(--map-empty-line)");
    const base: CSSProperties = half
      ? { position: "absolute", borderRadius: 2, background: bar, zIndex: 2 }
      : { position: "absolute", boxSizing: "border-box", border: `1px solid ${line}`, borderRadius: 3, background: fill };
    const across: CSSProperties = !vertical
      ? one ? { top: "8%", bottom: "8%" } : p.side === "a" ? { top: "6%", bottom: "calc(50% + 1px)" } : { top: "calc(50% + 1px)", bottom: "6%" }
      : one ? { left: "8%", right: "8%" } : p.side === "a" ? { right: "6%", left: "calc(50% + 1px)" } : { left: "6%", right: "calc(50% + 1px)" };
    const alongStyle: CSSProperties = !vertical
      ? half ? { right: `calc(${a0}% - 2px)`, width: 4 } : { right: `${a0}%`, width: `${w}%` }
      : half ? { top: `calc(${a0}% - 2px)`, height: 4 } : { top: `${a0}%`, height: `${w}%` };
    const pieceLen = half ? 0 : ((p.length_cm ?? 0) / len) * lengthPx;
    const thick = depthPx * (one ? 0.84 : 0.42);
    const show = showsCode(p, !!product, pieceLen, thick, codesOn);
    const outer = p.side === "a" || one;
    const code: CSSProperties = half
      ? {
        position: "absolute", whiteSpace: "nowrap", fontSize: codeFs(Z * 0.27), fontWeight: 700, color: "var(--text)", pointerEvents: "none",
        padding: "1px 4px", borderRadius: 5, background: "var(--map-chip)", border: `1px solid ${product?.color ?? "var(--map-wall)"}`, lineHeight: "14px",
        ...(vertical ? { top: "50%", transform: "translateY(-50%)", ...(outer ? { right: -3 } : { left: -3 }) } : { left: "50%", transform: "translateX(-50%)", ...(outer ? { top: -3 } : { bottom: -3 }) }),
      }
      : {
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", whiteSpace: "nowrap",
        fontSize: codeFs(Math.min(thick * 0.55, pieceLen / 4.4)), fontWeight: 800, letterSpacing: "-.2px", color: "#fff",
        textShadow: "0 0 3px #000, 0 1px 2px #000", pointerEvents: "none", writingMode: vertical ? "vertical-rl" : undefined,
      };
    return (
      <span key={p.key} title={product ? toFaDigits(product.title) : `${KIND[p.kind]}، خالی`} style={{ ...base, ...across, ...alongStyle }}>
        {show ? <span style={code}>{toFaDigits(product!.short_code)}</span> : null}
      </span>
    );
  };
  return (
    <>
      <span aria-hidden="true" style={vertical
        ? { position: "absolute", top: 0, bottom: 0, width: 2, background: "var(--map-spine)", ...(one ? { right: 0 } : { left: "calc(50% - 1px)" }) }
        : { position: "absolute", left: 0, right: 0, height: 2, background: "var(--map-spine)", ...(one ? { bottom: 0 } : { top: "calc(50% - 1px)" }) }} />
      {t.pieces.map(piece)}
    </>
  );
}

function HubArms({ rack, t, Z, codesOn }: { rack: Rack; t: Template; Z: number; codesOn: boolean }) {
  const { ox, oy } = hubOrigin(t, rack.rotation, Z);
  const k = Z / CELL;
  const dot = Math.max(7, Math.round(Z * 0.24));
  return (
    <>
      {t.arms.map((arm) => {
        const deg = arm.angle_deg + rack.rotation;
        const codes = armCodes(rack, arm);
        const any = codes.some((c) => c !== "—");
        const [tx, ty] = along(ox, oy, deg, arm.length_cm * k + 5);
        const tip = Array.from({ length: arm.steps }, (_, step) => {
          const slot = arm.id === null ? undefined : rack.slots.find((s) => s.arm_id === arm.id && s.step === step);
          return `پله ${toFaDigits(step + 1)}: ${slot?.product ? toFaDigits(slot.product.title) : "خالی"}`;
        }).join("\n");
        return (
          <span key={arm.key}>
            <span aria-hidden="true" style={{ position: "absolute", left: ox, top: oy - 1.5, width: arm.length_cm * k, height: 3, borderRadius: 2, background: "var(--map-spine)", transformOrigin: "0 50%", transform: `rotate(${-deg}deg)` }} />
            {Array.from({ length: arm.steps }, (_, step) => {
              const [x, y] = along(ox, oy, deg, stepRadius(arm, step) * k);
              const product = arm.id === null ? null : rack.slots.find((s) => s.arm_id === arm.id && s.step === step)?.product ?? null;
              return (
                <span key={step} title={`پله ${toFaDigits(step + 1)}${product ? `: ${toFaDigits(product.title)}` : "، خالی"}`}
                  style={{ position: "absolute", left: x - dot / 2, top: y - dot / 2, width: dot, height: dot, borderRadius: "50%", boxSizing: "border-box", zIndex: 2,
                    background: product ? product.color ?? "var(--accent)" : "var(--map-floor)", border: `1px solid ${product ? "rgba(255,255,255,.6)" : "var(--text-faint)"}` }} />
              );
            })}
            {codesOn && any ? (
              <span title={tip} style={{ position: "absolute", left: tx, top: ty, transform: tipLabelTransform(deg), padding: "2px 5px", borderRadius: 6, background: "var(--map-chip)",
                border: "1px solid var(--map-wall)", whiteSpace: "pre", textAlign: "center", fontSize: codeFs(Z * 0.3), fontWeight: 700, lineHeight: 1.25, color: "var(--text)", zIndex: 4 }}>
                {codes.join("\n")}
              </span>
            ) : null}
          </span>
        );
      })}
      <span aria-hidden="true" style={{ position: "absolute", left: ox - 4, top: oy - 4, width: 8, height: 8, borderRadius: "50%", background: "var(--map-spine)", zIndex: 3 }} />
    </>
  );
}

const TOOLS: [RackTool, string, string][] = [["goods", "کالاها", ""], ["template", "قالب", "ویرایش قالب این رگال"], ["copy", "⧉", "کپی این رگال"], ["rotate", "⟳", "چرخش ۹۰ درجه"], ["delete", "✕", "حذف رگال"]];

export function Board({ layout, templates, zoom: Z, codesOn, hits, onOpen, design }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const px = (cm: number) => (cm / CELL) * Z;

  useEffect(() => {
    if (!drag || !design) return;
    const move = (e: PointerEvent) => {
      const el = boardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const xCm = ((e.clientX - rect.left - WALL) / Z) * CELL, yCm = ((e.clientY - rect.top - WALL) / Z) * CELL;
      const cur = layoutRef.current;
      if (drag.mode === "bw" || drag.mode === "bh") {
        const min = minStore(cur.racks, templates);
        const next = drag.mode === "bw"
          ? { ...cur, width_cm: Math.max(min.w, Math.min(STORE_MAX.w, snap(xCm, 100))) }
          : { ...cur, height_cm: Math.max(min.h, Math.min(STORE_MAX.h, snap(yCm, 100))) };
        if (next.width_cm !== cur.width_cm || next.height_cm !== cur.height_cm) design.onChange({ ...next, door_offset_cm: Math.min(next.door_offset_cm, doorEdge(next) - next.door_width_cm) });
        return;
      }
      if (drag.mode === "door") {
        const pos = cur.door_side === "left" || cur.door_side === "right" ? yCm : xCm;
        const offset = Math.max(0, Math.min(doorEdge(cur) - cur.door_width_cm, snap(pos - cur.door_width_cm / 2, CELL)));
        if (offset !== cur.door_offset_cm) design.onChange({ ...cur, door_offset_cm: offset });
        return;
      }
      const index = cur.racks.findIndex((r) => r.key === drag.key);
      if (index < 0) return;
      const rack = cur.racks[index];
      const next = clampRack({ ...rack, x_cm: (Math.floor(xCm / CELL) - (drag.dx ?? 0)) * CELL, y_cm: (Math.floor(yCm / CELL) - (drag.dy ?? 0)) * CELL }, templates, cur);
      if (next.x_cm === rack.x_cm && next.y_cm === rack.y_cm) return;
      design.onChange({ ...cur, racks: cur.racks.map((r, i) => (i === index ? next : r)) });
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
  }, [drag, design, Z, templates]);

  const start = (mode: Drag["mode"]) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDrag({ mode });
  };

  const grid = design ? "var(--map-grid)" : "color-mix(in srgb, var(--map-grid) 55%, transparent)";
  const vertical = layout.door_side === "left" || layout.door_side === "right";
  const doorStyle: CSSProperties = {
    position: "absolute", background: "var(--map-door)", cursor: design ? (vertical ? "ns-resize" : "ew-resize") : undefined, touchAction: "none",
    ...(vertical ? { top: px(layout.door_offset_cm), height: px(layout.door_width_cm), width: WALL + (design ? 4 : 0), [layout.door_side]: -WALL - (design ? 2 : 0) }
      : { left: px(layout.door_offset_cm), width: px(layout.door_width_cm), height: WALL + (design ? 4 : 0), [layout.door_side]: -WALL - (design ? 2 : 0) }),
  };
  const doorLabel: CSSProperties = {
    position: "absolute", fontSize: 11, color: "var(--map-door)", whiteSpace: "nowrap", pointerEvents: "none",
    ...(vertical ? { top: px(layout.door_offset_cm) - 18, [layout.door_side]: -WALL } : { left: px(layout.door_offset_cm), [layout.door_side]: -22 }),
  };

  return (
    // LTR scroll box: scrolling starts at the store's origin (top-left), where the door and the first racks usually are.
    <div dir="ltr" className="overflow-auto rounded-xl" style={{ maxHeight: "calc(100vh - 150px)", minHeight: 360, background: "var(--map-backdrop)", padding: "52px 40px 40px 30px" }}>
      <div
        ref={boardRef}
        className="relative select-none"
        style={{
          width: px(layout.width_cm), height: px(layout.height_cm), border: `${WALL}px solid var(--map-wall)`, borderRadius: 4, boxSizing: "content-box",
          backgroundColor: "var(--map-floor)",
          backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`,
          backgroundSize: `${2 * Z}px ${2 * Z}px`, touchAction: drag ? "none" : undefined,
        }}
      >
        <span aria-hidden="true" style={doorStyle} onPointerDown={design ? start("door") : undefined} title={design ? "ورودی را در امتداد دیوار بکشید" : undefined} />
        <span dir="rtl" style={doorLabel}>ورودی</span>
        {layout.racks.map((rack) => {
          const t = templates.get(rack.template_id);
          if (!t) return null;
          const [fw, fh] = footprint(t, rack.rotation);
          const on = design?.selected === rack.key;
          const found = hits?.has(rack.key);
          const [total, filled] = placed(rack, t);
          const outline = design?.overlap.has(rack.key) ? "2px solid var(--danger)" : on ? "2px dashed var(--accent)" : found ? "3px solid var(--warning)" : undefined;
          const tip = [`${rack.code} · ${t.name}`, ...elements(t).map((el) => {
            const product = slotFor(rack, el)?.product;
            return `${elementLabel(el)}: ${product ? toFaDigits(product.title) : "—"}`;
          })].join("\n");
          return (
            <div
              key={rack.key}
              role="button"
              tabIndex={0}
              title={tip}
              aria-label={`${rack.code}، ${toFaDigits(filled)} از ${toFaDigits(total)} جایگاه کالا دارد`}
              aria-pressed={design ? on : undefined}
              onClick={() => (design ? undefined : onOpen?.(rack.key))}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                if (design) design.onSelect(rack.key);
                else onOpen?.(rack.key);
              }}
              onPointerDown={design ? (e) => {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                design.onSelect(rack.key);
                setDrag({ mode: "move", key: rack.key, dx: Math.floor((e.clientX - r.left) / Z), dy: Math.floor((e.clientY - r.top) / Z) });
              } : undefined}
              style={{
                position: "absolute", left: px(rack.x_cm), top: px(rack.y_cm), width: px(fw), height: px(fh), boxSizing: "border-box", borderRadius: 4,
                cursor: design ? (drag?.key === rack.key ? "grabbing" : "grab") : "pointer",
                zIndex: on ? 3 : 1, opacity: hits && !found ? 0.3 : 1, outline, outlineOffset: on ? 3 : 2, touchAction: design ? "none" : undefined,
              }}
            >
              {t.kind === "hub" ? <HubArms rack={rack} t={t} Z={Z} codesOn={codesOn} /> : <LinePieces rack={rack} t={t} Z={Z} codesOn={codesOn} />}
              <span style={{ position: "absolute", ...(t.kind === "hub" ? { right: -34, top: -20 } : { right: -2, top: -17 }), padding: "0 5px", borderRadius: 4,
                background: "var(--map-floor)", fontSize: 11, fontWeight: 700, lineHeight: "15px", color: on ? "var(--accent)" : "var(--text-secondary)", pointerEvents: "none", whiteSpace: "nowrap", zIndex: 5 }}>
                {rack.code}
              </span>
              {on && design && !drag ? (
                <span dir="rtl" onPointerDown={(e) => e.stopPropagation()}
                  className="absolute z-[6] flex gap-0.5 whitespace-nowrap rounded-[10px] border border-line bg-elevated p-[3px] shadow-soft"
                  style={{ left: "50%", transform: "translateX(-50%)", bottom: "calc(100% + 20px)" }}>
                  {TOOLS.map(([tool, label, hint]) => (
                    <button key={tool} type="button" title={hint || undefined} aria-label={hint || undefined}
                      onClick={(e) => (e.stopPropagation(), design.onTool(tool, rack.key))}
                      className={`min-h-[26px] cursor-pointer rounded-[7px] border-0 bg-transparent px-[9px] text-xs hover:bg-hover ${tool === "delete" ? "text-rose" : "text-ink"}`}>
                      {label}
                    </button>
                  ))}
                </span>
              ) : null}
            </div>
          );
        })}
        {design ? (
          <>
            <span title="عرض فروشگاه را بکشید" onPointerDown={start("bw")} style={{ position: "absolute", right: -14 - WALL, top: "calc(50% - 26px)", width: 10, height: 52, borderRadius: 5, background: "var(--map-wall)", cursor: "ew-resize", touchAction: "none" }} />
            <span title="طول فروشگاه را بکشید" onPointerDown={start("bh")} style={{ position: "absolute", bottom: -14 - WALL, left: "calc(50% - 26px)", width: 52, height: 10, borderRadius: 5, background: "var(--map-wall)", cursor: "ns-resize", touchAction: "none" }} />
          </>
        ) : null}
      </div>
    </div>
  );
}
