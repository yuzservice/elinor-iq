/** The store floor: racks drawn as a spine plus pieces (no frames), read-only on the map, draggable in the designer. */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { toFaDigits } from "../../lib/dates";
import { CELL, STORE_MAX, clampRack, codeFontPx, fitSlots, footprint, minStore, placed, showsCode, sides, slotOrder, snap } from "./geometry";
import type { Layout, Rack, Slot } from "./types";

const WALL = 6;
const SIDE = { a: "طرف الف", b: "طرف ب" } as const;
const KIND = { full: "رگال کامل", half: "نیم‌رگال" } as const;

export type RackTool = "goods" | "copy" | "rotate" | "delete";

type Design = {
  selected: string | null;
  overlap: Set<string>;
  canDelete: boolean;
  onSelect: (key: string) => void;
  onChange: (next: Layout) => void;
  onTool: (tool: RackTool, key: string) => void;
};

type Props = {
  layout: Layout;
  zoom: number;
  codesOn: boolean;
  hits?: Set<string> | null;
  onOpen?: (key: string) => void;
  design?: Design;
};

type Drag = { mode: "move" | "w" | "h" | "wh" | "bw" | "bh" | "door"; key?: string; dx?: number; dy?: number };

const fill = (slot: Slot) => (slot.product?.color ? `${slot.product.color}cc` : slot.product ? "var(--accent)" : "var(--map-empty)");

export function slotTitle(slot: Slot) {
  return slot.product ? toFaDigits(slot.product.title) : `${KIND[slot.kind]}، خالی`;
}

function pieceStyle(rack: Rack, slot: Slot, one: boolean): CSSProperties {
  const a0 = (slot.offset_cm / rack.length_cm) * 100;
  const w = slot.kind === "full" ? ((slot.length_cm ?? 0) / rack.length_cm) * 100 : 0;
  const line = slot.product ? "rgba(255,255,255,.55)" : "var(--map-empty-line)";
  const bar = slot.product?.color ?? (slot.product ? "var(--accent)" : "var(--map-empty-line)");
  const full = slot.kind === "full";
  const base: CSSProperties = full
    ? { position: "absolute", boxSizing: "border-box", border: `1px solid ${line}`, borderRadius: 3, background: fill(slot) }
    : { position: "absolute", borderRadius: 2, background: bar, zIndex: 2 };
  if (!rack.rotation) {
    const vert = one ? { top: "8%", bottom: "8%" } : slot.side === "a" ? { top: "8%", bottom: "calc(50% + 1px)" } : { top: "calc(50% + 1px)", bottom: "8%" };
    return { ...base, ...vert, ...(full ? { right: `${a0}%`, width: `${w}%` } : { right: `calc(${a0}% - 2px)`, width: 4 }) };
  }
  const hor = one ? { left: "8%", right: "8%" } : slot.side === "a" ? { right: "8%", left: "calc(50% + 1px)" } : { left: "8%", right: "calc(50% + 1px)" };
  return { ...base, ...hor, ...(full ? { top: `${a0}%`, height: `${w}%` } : { top: `calc(${a0}% - 2px)`, height: 4 }) };
}

function codeStyle(rack: Rack, slot: Slot, one: boolean, font: number): CSSProperties {
  if (slot.kind === "half") {
    const outer = slot.side === "a" || one;
    const pos: CSSProperties = rack.rotation
      ? { top: "50%", transform: "translateY(-50%)", ...(outer ? { right: -2 } : { left: -2 }) }
      : { left: "50%", transform: "translateX(-50%)", ...(outer ? { top: -2 } : { bottom: -2 }) };
    return { position: "absolute", ...pos, padding: "0 3px", borderRadius: 4, background: "var(--map-chip)", border: `1px solid ${slot.product?.color ?? "var(--map-wall)"}`,
      lineHeight: "13px", whiteSpace: "nowrap", fontSize: font, fontWeight: 700, color: "var(--text)", pointerEvents: "none" };
  }
  return { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", whiteSpace: "nowrap",
    fontSize: font, fontWeight: 700, letterSpacing: "-.2px", color: "#fff", textShadow: "0 0 3px #000, 0 1px 2px #000", pointerEvents: "none",
    writingMode: rack.rotation ? "vertical-rl" : undefined };
}

export function Board({ layout, zoom: Z, codesOn, hits, onOpen, design }: Props) {
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
        const min = minStore(cur.racks);
        const next = drag.mode === "bw"
          ? { ...cur, width_cm: Math.max(min.w, Math.min(STORE_MAX.w, snap(xCm, 100))) }
          : { ...cur, height_cm: Math.max(min.h, Math.min(STORE_MAX.h, snap(yCm, 100))) };
        if (next.width_cm !== cur.width_cm || next.height_cm !== cur.height_cm) design.onChange({ ...next, door_offset_cm: Math.min(next.door_offset_cm, doorEdge(next) - next.door_width_cm) });
        return;
      }
      if (drag.mode === "door") {
        const along = cur.door_side === "left" || cur.door_side === "right" ? yCm : xCm;
        const offset = Math.max(0, Math.min(doorEdge(cur) - cur.door_width_cm, snap(along - cur.door_width_cm / 2, CELL)));
        if (offset !== cur.door_offset_cm) design.onChange({ ...cur, door_offset_cm: offset });
        return;
      }
      const index = cur.racks.findIndex((r) => r.key === drag.key);
      if (index < 0) return;
      const rack = cur.racks[index];
      let next: Rack;
      if (drag.mode === "move") {
        next = clampRack({ ...rack, x_cm: (Math.floor(xCm / CELL) - (drag.dx ?? 0)) * CELL, y_cm: (Math.floor(yCm / CELL) - (drag.dy ?? 0)) * CELL }, cur);
      } else {
        const [fw, fh] = footprint(rack);
        const wCells = drag.mode === "h" ? fw / CELL : Math.max(1, Math.min((cur.width_cm - rack.x_cm) / CELL, Math.floor((xCm - rack.x_cm) / CELL) + 1));
        const hCells = drag.mode === "w" ? fh / CELL : Math.max(1, Math.min((cur.height_cm - rack.y_cm) / CELL, Math.floor((yCm - rack.y_cm) / CELL) + 1));
        const [lenCells, depthCells] = rack.rotation ? [hCells, wCells] : [wCells, hCells];
        next = clampRack(fitSlots({
          ...rack,
          length_cm: Math.min(1200, Math.max(100, lenCells * CELL)),
          arm_cm: Math.min(150, Math.max(25, snap((depthCells * CELL) / sides(rack), 5))),
        }), cur);
      }
      if (JSON.stringify(next) === JSON.stringify(rack)) return;
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
  }, [drag, design, Z]);

  const start = (mode: Drag["mode"], key?: string) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDrag({ mode, key });
  };

  const W = layout.width_cm, H = layout.height_cm;
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
    <div dir="ltr" className="overflow-auto rounded-xl" style={{ maxHeight: 720, background: "var(--map-backdrop)", padding: "44px 40px 40px 30px" }}>
      <div
        ref={boardRef}
        className="relative select-none"
        style={{
          width: px(W), height: px(H), border: `${WALL}px solid var(--map-wall)`, borderRadius: 4, boxSizing: "content-box",
          backgroundColor: "var(--map-floor)",
          backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`,
          backgroundSize: `${2 * Z}px ${2 * Z}px`, touchAction: drag ? "none" : undefined,
        }}
      >
        <span aria-hidden="true" style={doorStyle} onPointerDown={design ? start("door") : undefined} title={design ? "ورودی را در امتداد دیوار بکشید" : undefined} />
        <span dir="rtl" style={doorLabel}>ورودی</span>
        {layout.racks.map((rack) => {
          const [fw, fh] = footprint(rack);
          const one = sides(rack) === 1;
          const on = design?.selected === rack.key;
          const found = hits?.has(rack.key);
          const lengthPx = px(rack.rotation ? fh : fw), depthPx = px(rack.rotation ? fw : fh);
          const [total, filled] = placed(rack);
          const outline = design?.overlap.has(rack.key) ? "2px solid var(--danger)" : on ? "2px dashed var(--accent)" : found ? "3px solid var(--warning)" : undefined;
          const tip = [rack.code, ...slotOrder(rack).map((i) => `${SIDE[rack.slots[i].side]}، ${KIND[rack.slots[i].kind]}: ${rack.slots[i].product ? toFaDigits(rack.slots[i].product!.title) : "—"}`)].join("\n");
          const handle: CSSProperties = { position: "absolute", background: "var(--accent)", border: "2px solid var(--map-floor)", borderRadius: 4, zIndex: 4, touchAction: "none" };
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
                cursor: design ? (drag?.key === rack.key && drag.mode === "move" ? "grabbing" : "grab") : "pointer",
                zIndex: on ? 3 : 1, opacity: hits && !found ? 0.3 : 1, outline, outlineOffset: on ? 3 : 2, touchAction: design ? "none" : undefined,
              }}
            >
              <span aria-hidden="true" style={rack.rotation
                ? { position: "absolute", top: 0, bottom: 0, width: 2, background: "var(--map-spine)", ...(one ? { right: 0 } : { left: "calc(50% - 1px)" }) }
                : { position: "absolute", left: 0, right: 0, height: 2, background: "var(--map-spine)", ...(one ? { bottom: 0 } : { top: "calc(50% - 1px)" }) }} />
              {rack.slots.map((slot) => {
                const pieceLen = slot.kind === "full" ? ((slot.length_cm ?? 0) / rack.length_cm) * lengthPx : 0;
                const thick = depthPx * (one ? 0.84 : 0.42);
                const show = showsCode(slot, pieceLen, thick, Z, codesOn);
                return (
                  <span key={slot.key} title={slotTitle(slot)} style={pieceStyle(rack, slot, one)}>
                    {show ? <span style={codeStyle(rack, slot, one, codeFontPx(slot.kind, pieceLen, thick, Z))}>{toFaDigits(slot.product!.short_code)}</span> : null}
                  </span>
                );
              })}
              <span
                style={codesOn
                  ? { position: "absolute", right: -2, top: -15, padding: "0 5px", borderRadius: 4, background: "var(--map-floor)", fontSize: 10, fontWeight: 700, lineHeight: "14px",
                    color: on ? "var(--accent)" : "var(--text-secondary)", pointerEvents: "none", whiteSpace: "nowrap" }
                  : { position: "absolute", left: 0, right: 0, top: `calc(50% - ${Math.round(Z * 0.3)}px)`, textAlign: "center", fontSize: Math.max(9, Math.round(Z * 0.48)),
                    fontWeight: 800, lineHeight: 1, color: "var(--text)", textShadow: "0 0 3px var(--map-floor), 0 0 3px var(--map-floor)", pointerEvents: "none" }}
              >
                {rack.code}
              </span>
              {on && design ? (
                <>
                  <span aria-hidden="true" onPointerDown={start("w", rack.key)} style={{ ...handle, right: -9, top: "calc(50% - 9px)", width: 10, height: 18, cursor: "ew-resize" }} />
                  <span aria-hidden="true" onPointerDown={start("h", rack.key)} style={{ ...handle, bottom: -9, left: "calc(50% - 9px)", width: 18, height: 10, cursor: "ns-resize" }} />
                  <span aria-hidden="true" onPointerDown={start("wh", rack.key)} style={{ ...handle, right: -9, bottom: -9, width: 12, height: 12, cursor: "nwse-resize" }} />
                  {!drag ? (
                    <span dir="rtl" onPointerDown={(e) => e.stopPropagation()}
                      className="absolute z-[6] flex gap-0.5 whitespace-nowrap rounded-[10px] border border-line bg-elevated p-[3px] shadow-soft"
                      style={{ left: "50%", transform: "translateX(-50%)", bottom: "calc(100% + 10px)" }}>
                      {([["goods", "کالاها", ""], ["copy", "⧉ کپی", "کپی این رگال"], ["rotate", "⟳", "چرخش ۹۰ درجه"], ["delete", "✕", "حذف رگال"]] as const).map(([tool, label, hint]) => (
                        <button key={tool} type="button" title={hint || undefined} aria-label={hint || undefined}
                          disabled={tool === "delete" && !design.canDelete}
                          onClick={(e) => (e.stopPropagation(), design.onTool(tool, rack.key))}
                          className={`min-h-[26px] cursor-pointer rounded-[7px] border-0 bg-transparent px-[9px] text-xs disabled:opacity-35 ${tool === "delete" ? "text-rose" : "text-ink"} hover:bg-hover`}>
                          {label}
                        </button>
                      ))}
                    </span>
                  ) : null}
                </>
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

export const doorEdge = (layout: Pick<Layout, "door_side" | "width_cm" | "height_cm">) =>
  layout.door_side === "left" || layout.door_side === "right" ? layout.height_cm : layout.width_cm;
