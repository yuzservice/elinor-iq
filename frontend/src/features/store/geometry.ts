/** Store map geometry (docs/design/store-map-prototype.html). Everything is in cm; the floor grid is 50 cm a cell.
 * Mirrors backend/apps/store_map/templates.py (footprint, elements) so the board and the server agree. */
import { toEnDigits, toFaDigits } from "../../lib/dates";
import type { Layout, LayoutResponse, Rack, Rotation, ServerRack, Slot, Template, TemplateArm, TemplatePiece, TemplateResult } from "./types";

export const CELL = 50;
export const POST = 6;
export const MIN_FULL = 30;
export const ARM = { min: 20, max: 90, maxSteps: 5, maxArms: 8 };
export const STORE_MIN = { w: 800, h: 600 };
export const STORE_MAX = { w: 4500, h: 3500 };
/** px per 50 cm cell: readable codes without zooming; the board grows and scrolls. */
export const ZOOM = { min: 14, max: 64, step: 6, desktop: 44, mobile: 32 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const snap = (v: number, step: number) => Math.round(v / step) * step;
const rad = (deg: number) => (deg * Math.PI) / 180;

let seq = 0;
export const newKey = (prefix: string) => `${prefix}n${Date.now().toString(36)}${(seq++).toString(36)}`;

export const DIR: Record<number, string> = { 0: "راست", 45: "راست‌بالا", 90: "بالا", 135: "چپ‌بالا", 180: "چپ", 225: "چپ‌پایین", 270: "پایین", 315: "راست‌پایین" };
const SIDE = { a: "طرف الف", b: "طرف ب" } as const;
const KIND = { full: "رگال کامل", half: "نیم‌رگال" } as const;

// ---------------------------------------------------------------- server ↔ client

export function templateFromServer(t: TemplateResult["template"]): Template {
  return { ...t, pieces: t.pieces.map((p) => ({ ...p, key: `p${p.id}` })), arms: t.arms.map((a) => ({ ...a, key: `a${a.id}` })) };
}

export function rackFromServer(r: ServerRack): Rack {
  const { footprint_cm: _f, ...rest } = r;
  return { ...rest, key: `r${r.id}` };
}

export function fromServer(data: LayoutResponse["layout"]): Layout | null {
  if (!data) return null;
  return { ...data, templates: data.templates.map(templateFromServer), racks: data.racks.map(rackFromServer) };
}

/** Designer PUT body: store, door and racks (position, rotation, template). Slots follow the templates on the server. */
export function toDoc(layout: Layout) {
  const { width_cm, height_cm, door_side, door_offset_cm, door_width_cm, version } = layout;
  return {
    version, width_cm, height_cm, door_side, door_offset_cm, door_width_cm,
    racks: layout.racks.map(({ id, key, code, x_cm, y_cm, rotation, template_id }) => ({ id, key, code, x_cm, y_cm, rotation, template_id })),
  };
}

/** New racks from a designer save get their id and slots (matched by client key). */
export function applyCreated(layout: Layout, created: Record<string, ServerRack>, version: number): Layout {
  return { ...layout, version, racks: layout.racks.map((r) => (r.id === null && created[r.key] ? { ...r, id: created[r.key].id, slots: created[r.key].slots } : r)) };
}

export function toTemplateDoc(t: Template, version: number | null) {
  return {
    version, name: t.name, kind: t.kind, length_cm: t.length_cm, arm_cm: t.arm_cm,
    pieces: t.pieces.map(({ id, key, side, kind, offset_cm, length_cm }) => ({ id, key, side, kind, offset_cm, length_cm })),
    arms: t.arms.map(({ id, key, angle_deg, length_cm, steps }) => ({ id, key, angle_deg, length_cm, steps })),
  };
}

/** A template save: new element ids by key, and the synced slots of every rack built from it. */
export function applyTemplateResult(layout: Layout, result: TemplateResult): Layout {
  const slots = new Map(result.racks.map((r) => [r.id, r.slots]));
  return {
    ...layout,
    version: result.version,
    templates: layout.templates.map((t) => (t.id !== result.template.id ? t : {
      ...t,
      racks: result.template.racks,
      pieces: t.pieces.map((p) => ({ ...p, id: p.id ?? result.ids[p.key] ?? null })),
      arms: t.arms.map((a) => ({ ...a, id: a.id ?? result.ids[a.key] ?? null })),
    })),
    racks: layout.racks.map((r) => (r.id !== null && slots.has(r.id) ? { ...r, slots: slots.get(r.id)! } : r)),
  };
}

// ---------------------------------------------------------------- footprint

/** Sides that hold pieces: 1 for a wall rack, otherwise 2. */
export const sides = (t: Pick<Template, "pieces">) => new Set(t.pieces.map((p) => p.side)).size || 2;

/** Hub extent around the post centre in cm (x right, y up), after rotation. */
export function hubExtent(arms: Pick<TemplateArm, "angle_deg" | "length_cm">[], rotation: number) {
  const xs = [-POST, POST], ys = [-POST, POST];
  arms.forEach((a) => {
    xs.push(Math.cos(rad(a.angle_deg + rotation)) * a.length_cm);
    ys.push(Math.sin(rad(a.angle_deg + rotation)) * a.length_cm);
  });
  return { minx: Math.min(...xs), maxx: Math.max(...xs), miny: Math.min(...ys), maxy: Math.max(...ys) };
}

const cells = (span: number) => Math.max(1, Math.ceil((span - 0.01) / CELL));

/** Floor footprint [width, height] in cm: line as before; hub = rotated arms + post, rounded up to cells. */
export function footprint(t: Template, rotation: number): [number, number] {
  if (t.kind === "hub") {
    const e = hubExtent(t.arms, rotation);
    return [cells(e.maxx - e.minx) * CELL, cells(e.maxy - e.miny) * CELL];
  }
  const length = Math.max(2, Math.ceil((t.length_cm ?? 0) / CELL)) * CELL;
  const depth = Math.max(1, Math.ceil(((t.arm_cm ?? 0) * sides(t)) / CELL)) * CELL;
  return rotation % 180 ? [depth, length] : [length, depth];
}

export type Templates = Map<number, Template>;
export const byId = (templates: Template[]): Templates => new Map(templates.map((t) => [t.id, t]));
const rackFp = (rack: Rack, templates: Templates): [number, number] => {
  const t = templates.get(rack.template_id);
  return t ? footprint(t, rack.rotation) : [CELL, CELL];
};

export function clampRack(rack: Rack, templates: Templates, layout: Pick<Layout, "width_cm" | "height_cm">): Rack {
  const [w, h] = rackFp(rack, templates);
  return { ...rack, x_cm: clamp(snap(rack.x_cm, CELL), 0, Math.max(0, layout.width_cm - w)), y_cm: clamp(snap(rack.y_cm, CELL), 0, Math.max(0, layout.height_cm - h)) };
}

type Box = [number, number, number, number];
const boxOf = (r: Rack, templates: Templates): Box => [r.x_cm, r.y_cm, ...rackFp(r, templates)];
const hit = (a: Box, b: Box) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

export function overlapping(racks: Rack[], templates: Templates): Set<string> {
  const boxes = racks.map((r) => boxOf(r, templates));
  return new Set(racks.filter((_, i) => boxes.some((b, j) => j !== i && hit(boxes[i], b))).map((r) => r.key));
}

export function freeSpot(rack: Rack, racks: Rack[], templates: Templates, layout: Pick<Layout, "width_cm" | "height_cm">): [number, number] {
  const [w, h] = rackFp(rack, templates);
  const boxes = racks.filter((r) => r.key !== rack.key).map((r) => boxOf(r, templates));
  for (let y = CELL; y + h <= layout.height_cm; y += CELL)
    for (let x = CELL; x + w <= layout.width_cm; x += CELL) if (!boxes.some((b) => hit([x, y, w, h], b))) return [x, y];
  return [0, 0];
}

export function minStore(racks: Rack[], templates: Templates) {
  return {
    w: Math.max(STORE_MIN.w, ...racks.map((r) => r.x_cm + rackFp(r, templates)[0])),
    h: Math.max(STORE_MIN.h, ...racks.map((r) => r.y_cm + rackFp(r, templates)[1])),
  };
}

export function nextCode(racks: Rack[]) {
  const used = new Set(racks.map((r) => r.code));
  let n = 1;
  while (used.has(`R-${String(n).padStart(2, "0")}`)) n++;
  return `R-${String(n).padStart(2, "0")}`;
}

export function newRack(template: Template, racks: Rack[], templates: Templates, layout: Pick<Layout, "width_cm" | "height_cm">): Rack {
  const rack: Rack = { id: null, key: newKey("r"), code: nextCode(racks), x_cm: 0, y_cm: 0, rotation: 0, template_id: template.id, slots: [] };
  const [x, y] = freeSpot(rack, racks, templates, layout);
  return { ...rack, x_cm: x, y_cm: y };
}

/** A copy next to the original: same template and rotation, empty slots (right, below, left, above, else a free spot). */
export function copyRack(source: Rack, racks: Rack[], templates: Templates, layout: Pick<Layout, "width_cm" | "height_cm">): Rack {
  const copy: Rack = { ...source, id: null, key: newKey("r"), code: nextCode(racks), slots: [] };
  const [w, h] = rackFp(copy, templates);
  const boxes = racks.map((r) => boxOf(r, templates));
  const spots: [number, number][] = [[source.x_cm + w + CELL, source.y_cm], [source.x_cm, source.y_cm + h + CELL], [source.x_cm - w - CELL, source.y_cm], [source.x_cm, source.y_cm - h - CELL]];
  const spot = spots.find(([x, y]) => x >= 0 && y >= 0 && x + w <= layout.width_cm && y + h <= layout.height_cm && !boxes.some((b) => hit([x, y, w, h], b)));
  const [x, y] = spot ?? freeSpot(copy, racks, templates, layout);
  return { ...copy, x_cm: x, y_cm: y };
}

/** Line racks turn 0/90; hub racks a quarter turn at a time. */
export const nextRotation = (t: Template, rotation: Rotation): Rotation => (t.kind === "hub" ? (((rotation + 90) % 360) as Rotation) : rotation ? 0 : 90);

// ---------------------------------------------------------------- elements and slots

/** One slot position of a template: a line piece, or one step of a hub arm. */
export type Element = { key: string; piece?: TemplatePiece; arm?: TemplateArm; armIndex?: number; step?: number };

/** Template elements in reading order: line = side a then b, each from the right end; hub = arm by arm, step 1 first. */
export function elements(t: Template): Element[] {
  if (t.kind === "hub") return t.arms.flatMap((arm, armIndex) => Array.from({ length: arm.steps }, (_, step) => ({ key: `${arm.key}:${step}`, arm, armIndex, step })));
  return [...t.pieces]
    .sort((a, b) => (a.side === b.side ? a.offset_cm - b.offset_cm : a.side === "a" ? -1 : 1))
    .map((piece) => ({ key: piece.key, piece }));
}

export function slotFor(rack: Rack, el: Element): Slot | undefined {
  if (el.piece) return el.piece.id === null ? undefined : rack.slots.find((s) => s.piece_id === el.piece!.id);
  return el.arm?.id == null ? undefined : rack.slots.find((s) => s.arm_id === el.arm!.id && s.step === el.step);
}

export function elementLabel(el: Element): string {
  if (el.arm) return `بازوی ${toFaDigits(el.armIndex! + 1)} (${DIR[el.arm.angle_deg] ?? ""}) · پله ${toFaDigits(el.step! + 1)}`;
  return `${SIDE[el.piece!.side]} · ${KIND[el.piece!.kind]}`;
}

export function placed(rack: Rack, t: Template | undefined): [number, number] {
  if (!t) return [0, 0];
  const els = elements(t);
  return [els.length, els.filter((el) => slotFor(rack, el)?.product).length];
}

/** The next empty element after `fromKey` (wrapping); `fromKey` itself when all are filled. */
export function nextEmpty(rack: Rack, t: Template, fromKey: string): string {
  const els = elements(t);
  const start = els.findIndex((el) => el.key === fromKey);
  for (let step = 1; step <= els.length; step++) {
    const el = els[(start + step) % els.length];
    if (!slotFor(rack, el)?.product) return el.key;
  }
  return fromKey;
}

export const firstEmpty = (rack: Rack, t: Template) => {
  const els = elements(t);
  return (els.find((el) => !slotFor(rack, el)?.product) ?? els[0])?.key ?? null;
};

/** Racks of a template whose slot for this element (or any step of this arm from `fromStep`) holds a product. */
export function filledRacks(racks: Rack[], t: Template, match: { pieceId?: number | null; armId?: number | null; fromStep?: number }): Rack[] {
  return racks.filter((r) => r.template_id === t.id && r.slots.some((s) => s.product && (
    (match.pieceId != null && s.piece_id === match.pieceId) ||
    (match.armId != null && s.arm_id === match.armId && (s.step ?? 0) >= (match.fromStep ?? 0)))));
}

// ---------------------------------------------------------------- drawing

/** Step position along an arm, from the post edge to the tip (step 0 next to the post). */
export const stepRadius = (arm: Pick<TemplateArm, "length_cm" | "steps">, step: number) => POST + ((arm.length_cm - POST) * (step + 0.5)) / arm.steps;

/** Post centre in px inside the rack's footprint box (the arms' bounding box is centred in it). */
export function hubOrigin(t: Template, rotation: number, zoom: number) {
  const e = hubExtent(t.arms, rotation);
  const [w, h] = footprint(t, rotation);
  const k = zoom / CELL;
  return { ox: ((w - (e.maxx - e.minx)) / 2 - e.minx) * k, oy: ((h - (e.maxy - e.miny)) / 2 + e.maxy) * k };
}

/** Screen point (px) at `r` cm along a direction (deg, counter-clockwise from the right) from an origin. */
export const along = (ox: number, oy: number, deg: number, rPx: number): [number, number] => [ox + Math.cos(rad(deg)) * rPx, oy - Math.sin(rad(deg)) * rPx];

/** Anchor for the per-arm code label just outside the tip, so it never sits on the arm. */
export function tipLabelTransform(deg: number): string {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  if (c > 0.3) return "translate(0, -50%)";
  if (c < -0.3) return "translate(-100%, -50%)";
  return s > 0 ? "translate(-50%, -100%)" : "translate(-50%, 0)";
}

/** Short codes of an arm's steps, step 1 first; «—» for an empty step. */
export function armCodes(rack: Rack, arm: TemplateArm): string[] {
  return Array.from({ length: arm.steps }, (_, step) => {
    const slot = arm.id === null ? undefined : rack.slots.find((s) => s.arm_id === arm.id && s.step === step);
    return slot?.product ? toFaDigits(slot.product.short_code) : "—";
  });
}

/** Text colour that stays readable on a product colour: dark ink on light colours, white otherwise. */
export function inkOn(hex: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#0a0e14" : "#fff";
}

/** Code font size, readable at the default zoom: 9–14 px. */
export const codeFs = (px: number) => clamp(Math.round(px), 9, 14);

/** Clutter rule for a code on a line piece: codes on, a product, and a full piece at least 24 × 10 px (half pieces always). */
export function showsCode(piece: Pick<TemplatePiece, "kind">, hasProduct: boolean, lengthPx: number, thickPx: number, codesOn: boolean) {
  return codesOn && hasProduct && (piece.kind === "half" || (lengthPx >= 24 && thickPx >= 10));
}

// ---------------------------------------------------------------- templates

/** Starter shapes for «+ قالب جدید». */
export const STARTERS: { name: string; note: string; shape: Pick<Template, "kind" | "length_cm" | "arm_cm" | "pieces" | "arms"> }[] = (() => {
  const arms = (list: [number, number, number][]) => list.map(([angle_deg, length_cm, steps]) => ({ id: null, key: newKey("a"), angle_deg, length_cm, steps }));
  const hub = (list: [number, number, number][]) => ({ kind: "hub" as const, length_cm: null, arm_cm: null, pieces: [], arms: arms(list) });
  return [
    { name: "صلیبی ۴ بازو", note: "هر بازو پلکانی، چهار طرف", shape: hub([[0, 45, 2], [90, 45, 2], [180, 45, 2], [270, 45, 2]]) },
    { name: "سه بازو", note: "برای گوشه‌ها و وسط سالن", shape: hub([[90, 45, 2], [225, 45, 2], [315, 45, 2]]) },
    { name: "دو بازو روبه‌رو", note: "پلکانی دوطرفه", shape: hub([[0, 50, 3], [180, 50, 3]]) },
    { name: "بازوی دیواری", note: "یک بازوی پلکانی روی دیوار", shape: hub([[270, 60, 4]]) },
    {
      name: "رگال خطی", note: "رگال کامل و نیم‌رگال در دو طرف",
      shape: { kind: "line", length_cm: 150, arm_cm: 50, arms: [], pieces: (["a", "b"] as const).map((side) => ({ id: null, key: newKey("p"), side, kind: "full", offset_cm: 0, length_cm: 150 })) },
    },
  ];
})();

/** A free angle for a new arm: a quarter turn from `from` first, then any 45° step. */
export function freeAngle(arms: TemplateArm[], from: number): number | null {
  const used = new Set(arms.map((a) => a.angle_deg));
  for (let k = 1; k <= 4; k++) if (!used.has((from + k * 90) % 360)) return (from + k * 90) % 360;
  for (let k = 1; k <= 8; k++) if (!used.has((from + k * 45) % 360)) return (from + k * 45) % 360;
  return null;
}

/** Keeps every line piece inside the template: full pieces at least 30 cm, offsets from the right end. */
export function fitPieces(t: Template): Template {
  const length = t.length_cm ?? 0;
  return {
    ...t,
    pieces: t.pieces.map((p) => {
      const len = p.kind === "full" ? clamp(p.length_cm ?? 100, MIN_FULL, length) : null;
      return { ...p, length_cm: len, offset_cm: clamp(p.offset_cm, 0, length - (len ?? 0)) };
    }),
  };
}

// ---------------------------------------------------------------- search

const norm = (text: string) => toEnDigits(text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))).trim();

/** «این کالا کجاست؟»: racks holding a product whose title or short code matches; null for an empty query. */
export function findRacks(racks: Rack[], query: string): Set<string> | null {
  const q = norm(query);
  if (!q) return null;
  return new Set(racks.filter((r) => r.slots.some((s) => s.product && (norm(s.product.title).includes(q) || s.product.short_code.includes(q)))).map((r) => r.key));
}
