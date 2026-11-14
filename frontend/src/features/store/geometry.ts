/** Store map geometry (docs/design/store-map-prototype.html). Everything is in cm; the floor grid is 50 cm a cell. */
import { toEnDigits } from "../../lib/dates";
import type { Layout, LayoutResponse, Rack, Slot } from "./types";

export const CELL = 50;
export const MIN_FULL = 30;
export const STORE_MIN = { w: 800, h: 600 };
export const STORE_MAX = { w: 4500, h: 3500 };
export const ZOOM = { min: 10, max: 36, step: 4, desktop: 20, mobile: 14 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const snap = (v: number, step: number) => Math.round(v / step) * step;

let seq = 0;
export const newKey = (prefix: string) => `${prefix}n${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Server payload → client layout with stable keys. */
export function fromServer(data: LayoutResponse["layout"]): Layout | null {
  if (!data) return null;
  return {
    ...data,
    racks: data.racks.map((r) => ({ ...r, key: `r${r.id}`, slots: r.slots.map((s) => ({ ...s, key: `s${s.id}` })) })),
  };
}

/** Client layout → PUT body (products are saved per slot, never here). */
export function toDoc(layout: Layout) {
  const { width_cm, height_cm, door_side, door_offset_cm, door_width_cm, version } = layout;
  return {
    version, width_cm, height_cm, door_side, door_offset_cm, door_width_cm,
    racks: layout.racks.map(({ id, key, code, x_cm, y_cm, rotation, length_cm, arm_cm, slots }) => ({
      id, key, code, x_cm, y_cm, rotation, length_cm, arm_cm,
      slots: slots.map(({ id: sid, key: skey, side, kind, offset_cm, length_cm: len }) => ({ id: sid, key: skey, side, kind, offset_cm, length_cm: len })),
    })),
  };
}

/** Puts the ids from a save onto the matching client keys. */
export function applyIds(layout: Layout, ids: Record<string, number>, version: number): Layout {
  return {
    ...layout,
    version,
    racks: layout.racks.map((r) => ({
      ...r,
      id: r.id ?? ids[r.key] ?? null,
      slots: r.slots.map((s) => ({ ...s, id: s.id ?? ids[s.key] ?? null })),
    })),
  };
}

/** Sides that hold pieces: 1 for a wall rack, otherwise 2. */
export const sides = (rack: Rack) => new Set(rack.slots.map((s) => s.side)).size || 2;

/** Floor footprint in cm, rounded up to whole cells: [width, height] on the floor. */
export function footprint(rack: Rack): [number, number] {
  const length = Math.max(2, Math.ceil(rack.length_cm / CELL)) * CELL;
  const depth = Math.max(1, Math.ceil((rack.arm_cm * sides(rack)) / CELL)) * CELL;
  return rack.rotation ? [depth, length] : [length, depth];
}

export function clampRack(rack: Rack, layout: Pick<Layout, "width_cm" | "height_cm">): Rack {
  const [w, h] = footprint(rack);
  return { ...rack, x_cm: clamp(snap(rack.x_cm, CELL), 0, Math.max(0, layout.width_cm - w)), y_cm: clamp(snap(rack.y_cm, CELL), 0, Math.max(0, layout.height_cm - h)) };
}

/** Keeps every piece inside the rack: full pieces at least 30 cm, offsets from the right end. */
export function fitSlots(rack: Rack): Rack {
  return {
    ...rack,
    slots: rack.slots.map((s) => {
      const length = s.kind === "full" ? clamp(s.length_cm ?? 100, MIN_FULL, rack.length_cm) : null;
      return { ...s, length_cm: length, offset_cm: clamp(s.offset_cm, 0, rack.length_cm - (length ?? 0)) };
    }),
  };
}

type Box = [number, number, number, number];
const box = (r: Rack): Box => [r.x_cm, r.y_cm, ...footprint(r)];
const hit = (a: Box, b: Box) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/** Racks that overlap another rack (outlined red in the designer). */
export function overlapping(racks: Rack[]): Set<string> {
  const boxes = racks.map(box);
  return new Set(racks.filter((_, i) => boxes.some((b, j) => j !== i && hit(boxes[i], b))).map((r) => r.key));
}

/** First free spot, scanning rows from the top-left corner one cell in. */
export function freeSpot(rack: Rack, racks: Rack[], layout: Pick<Layout, "width_cm" | "height_cm">): [number, number] {
  const [w, h] = footprint(rack);
  const boxes = racks.filter((r) => r.key !== rack.key).map(box);
  for (let y = CELL; y + h <= layout.height_cm; y += CELL)
    for (let x = CELL; x + w <= layout.width_cm; x += CELL) if (!boxes.some((b) => hit([x, y, w, h], b))) return [x, y];
  return [0, 0];
}

/** Smallest store that still holds every rack. */
export function minStore(racks: Rack[]) {
  return {
    w: Math.max(STORE_MIN.w, ...racks.map((r) => r.x_cm + footprint(r)[0])),
    h: Math.max(STORE_MIN.h, ...racks.map((r) => r.y_cm + footprint(r)[1])),
  };
}

export function nextCode(racks: Rack[]) {
  const used = new Set(racks.map((r) => r.code));
  let n = 1;
  while (used.has(`R-${String(n).padStart(2, "0")}`)) n++;
  return `R-${String(n).padStart(2, "0")}`;
}

export function newRack(racks: Rack[], layout: Pick<Layout, "width_cm" | "height_cm">): Rack {
  const key = newKey("r");
  const rack: Rack = {
    id: null, key, code: nextCode(racks), x_cm: 0, y_cm: 0, rotation: 0, length_cm: 150, arm_cm: 50,
    slots: (["a", "b"] as const).map((side) => ({ id: null, key: newKey("s"), side, kind: "full", offset_cm: 0, length_cm: 150, product: null })),
  };
  const [x, y] = freeSpot(rack, racks, layout);
  return { ...rack, x_cm: x, y_cm: y };
}

/** A copy next to the original (right, below, left, above, else the first free spot); products are not copied. */
export function copyRack(source: Rack, racks: Rack[], layout: Pick<Layout, "width_cm" | "height_cm">): Rack {
  const copy: Rack = {
    ...source, id: null, key: newKey("r"), code: nextCode(racks),
    slots: source.slots.map((s) => ({ ...s, id: null, key: newKey("s"), product: null })),
  };
  const [w, h] = footprint(copy);
  const boxes = racks.map(box);
  const spots: [number, number][] = [[source.x_cm + w + CELL, source.y_cm], [source.x_cm, source.y_cm + h + CELL], [source.x_cm - w - CELL, source.y_cm], [source.x_cm, source.y_cm - h - CELL]];
  const spot = spots.find(([x, y]) => x >= 0 && y >= 0 && x + w <= layout.width_cm && y + h <= layout.height_cm && !boxes.some((b) => hit([x, y, w, h], b)));
  const [x, y] = spot ?? freeSpot(copy, racks, layout);
  return { ...copy, x_cm: x, y_cm: y };
}

/** Slot indexes in reading order: side a, then side b, each from the right end. */
export function slotOrder(rack: Rack): number[] {
  return rack.slots.map((_, i) => i).sort((i, j) => {
    const a = rack.slots[i], b = rack.slots[j];
    return a.side === b.side ? a.offset_cm - b.offset_cm : a.side === "a" ? -1 : 1;
  });
}

/** The next empty slot after `from` in reading order (wrapping); `from` itself when every slot is filled. */
export function nextEmpty(rack: Rack, from: number): number {
  const order = slotOrder(rack);
  const start = order.indexOf(from);
  for (let step = 1; step <= order.length; step++) {
    const i = order[(start + step) % order.length];
    if (!rack.slots[i].product) return i;
  }
  return from;
}

export const firstEmpty = (rack: Rack) => slotOrder(rack).find((i) => !rack.slots[i].product) ?? slotOrder(rack)[0] ?? null;

/** Clutter rule for the code on a piece: codes on, a product, zoom ≥ 12, and a full piece at least 26 × 9 px. */
export function showsCode(slot: Pick<Slot, "kind" | "product">, lengthPx: number, thickPx: number, zoom: number, codesOn: boolean) {
  return codesOn && !!slot.product && zoom >= 12 && (slot.kind === "half" || (lengthPx >= 26 && thickPx >= 9));
}

export function codeFontPx(kind: Slot["kind"], lengthPx: number, thickPx: number, zoom: number) {
  return kind === "half" ? clamp(Math.round(zoom * 0.45), 8, 10) : clamp(Math.round(Math.min(thickPx * 0.62, lengthPx / 6.2)), 8, 11);
}

const norm = (text: string) => toEnDigits(text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))).trim();

/** «این کالا کجاست؟»: racks holding a product whose title or short code matches; null for an empty query. */
export function findRacks(racks: Rack[], query: string): Set<string> | null {
  const q = norm(query);
  if (!q) return null;
  return new Set(
    racks.filter((r) => r.slots.some((s) => s.product && (norm(s.product.title).includes(q) || s.product.short_code.includes(q)))).map((r) => r.key),
  );
}

export const placed = (rack: Rack) => [rack.slots.length, rack.slots.filter((s) => s.product).length] as const;
