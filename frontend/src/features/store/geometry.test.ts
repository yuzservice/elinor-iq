import { describe, expect, it } from "vitest";
import {
  applyCreated, applyTemplateResult, armCodes, byId, clampRack, codeFs, copyRack, elementLabel, elements, filledRacks, findRacks, firstEmpty, fitPieces,
  footprint, freeAngle, hubOrigin, inkOn, minStore, newRack, nextCode, nextEmpty, nextRotation, overlapping, placed, showsCode, sides, slotFor,
  stepRadius, tipLabelTransform, toDoc, toTemplateDoc,
} from "./geometry";
import type { Layout, MapProduct, Rack, Slot, Template, TemplateArm, TemplatePiece } from "./types";

const product = (id: number, title: string, code: string, color = "#123456"): MapProduct => ({ id, title, short_code: code, color, status: "normal" });
const piece = (id: number, side: TemplatePiece["side"], kind: TemplatePiece["kind"], offset: number, length: number | null): TemplatePiece =>
  ({ id, key: `p${id}`, side, kind, offset_cm: offset, length_cm: length });
const arm = (id: number, angle: number, length = 45, steps = 2): TemplateArm => ({ id, key: `a${id}`, angle_deg: angle, length_cm: length, steps });
const line = (id: number, pieces: TemplatePiece[], length = 150, armCm = 50): Template => ({ id, name: "خطی", kind: "line", length_cm: length, arm_cm: armCm, pieces, arms: [], racks: 0 });
const hub = (id: number, arms: TemplateArm[]): Template => ({ id, name: "صلیبی", kind: "hub", length_cm: null, arm_cm: null, pieces: [], arms, racks: 0 });
const rack = (key: string, template_id: number, x = 0, y = 0, slots: Slot[] = [], rotation: Rack["rotation"] = 0): Rack =>
  ({ id: null, key, code: key.toUpperCase(), x_cm: x, y_cm: y, rotation, template_id, slots });
const store = { width_cm: 1000, height_cm: 600 };

const LINE = line(1, [piece(11, "a", "full", 0, 150), piece(12, "b", "full", 0, 150)]);
const CROSS = hub(2, [arm(21, 0), arm(22, 90), arm(23, 180), arm(24, 270)]);
const WALL = hub(3, [arm(31, 270, 60, 4)]);
const T = byId([LINE, CROSS, WALL]);

describe("footprint", () => {
  it("line: whole cells, swapped at 90°, one side deep for a wall rack", () => {
    expect(footprint(LINE, 0)).toEqual([150, 100]);
    expect(footprint({ ...LINE, length_cm: 160 }, 0)).toEqual([200, 100]);
    expect(footprint(LINE, 90)).toEqual([100, 150]);
    const wall = line(4, [piece(41, "a", "full", 0, 150)]);
    expect(sides(wall)).toBe(1);
    expect(footprint(wall, 0)).toEqual([150, 50]);
  });

  it("hub: rotated arms plus the post, rounded up to cells (same numbers as the server)", () => {
    expect(footprint(CROSS, 0)).toEqual([100, 100]);
    expect(footprint(CROSS, 90)).toEqual([100, 100]);
    expect(footprint(WALL, 0)).toEqual([50, 100]);
    expect(footprint(WALL, 90)).toEqual([100, 50]);
    expect(footprint(hub(5, [arm(51, 0, 50, 3), arm(52, 180, 50, 3)]), 90)).toEqual([50, 100]);
    expect(footprint(hub(6, [arm(61, 45, 90, 1)]), 0)).toEqual([100, 100]);
    expect(footprint(hub(7, [arm(71, 0, 44, 1)]), 180)).toEqual([50, 50]);
  });

  it("keeps racks inside the store and the store around its racks", () => {
    expect(clampRack({ ...rack("r", 1), x_cm: 990, y_cm: -30 }, T, store)).toMatchObject({ x_cm: 850, y_cm: 0 });
    expect(clampRack({ ...rack("w", 3, 990, 990, [], 90) }, T, store)).toMatchObject({ x_cm: 900, y_cm: 550 });
    expect(minStore([rack("a", 1, 900, 550)], T)).toEqual({ w: 1050, h: 650 });
  });

  it("flags overlaps, finds free spots, adds and copies racks without products", () => {
    const racks = [rack("a", 1, 0, 0), rack("b", 2, 100, 50), rack("c", 1, 500, 300)];
    expect(overlapping(racks, T)).toEqual(new Set(["a", "b"]));
    const added = newRack(CROSS, racks, T, store);
    expect(added).toMatchObject({ template_id: 2, rotation: 0, slots: [] });
    expect(overlapping([...racks, added], T).has(added.key)).toBe(false);
    const filled = { ...rack("s", 2, 0, 0, [{ id: 9, piece_id: null, arm_id: 21, step: 0, product: product(1, "x", "1") }], 90), id: 7 };
    const copy = copyRack(filled, [filled], T, store);
    expect(copy).toMatchObject({ id: null, template_id: 2, rotation: 90, slots: [], x_cm: 150, y_cm: 0 });
    expect(nextCode([{ ...rack("x", 1), code: "R-01" }, { ...rack("y", 1), code: "R-03" }])).toBe("R-02");
  });

  it("turns hub racks a quarter at a time and line racks 0/90", () => {
    expect([0, 90, 180, 270].map((r) => nextRotation(CROSS, r as Rack["rotation"]))).toEqual([90, 180, 270, 0]);
    expect([nextRotation(LINE, 0), nextRotation(LINE, 90)]).toEqual([90, 0]);
  });
});

describe("hub drawing helpers", () => {
  it("places steps from the post outwards", () => {
    expect([0, 1].map((j) => stepRadius(arm(1, 0, 46, 2), j))).toEqual([16, 36]);
    expect(stepRadius(arm(1, 0, 60, 1), 0)).toBe(33);
  });

  it("centres the post inside the footprint box", () => {
    expect(hubOrigin(CROSS, 0, 44)).toEqual({ ox: 44, oy: 44 });
    const { ox, oy } = hubOrigin(WALL, 0, 50); // 50 cm box, arm pointing down from near the top
    expect(ox).toBeCloseTo(25);
    expect(oy).toBeCloseTo(((100 - 66) / 2 + 6) * 1);
  });

  it("anchors each arm label just outside its tip, away from the arm", () => {
    expect(tipLabelTransform(0)).toBe("translate(0, -50%)"); // right: label starts at the tip
    expect(tipLabelTransform(180)).toBe("translate(-100%, -50%)"); // left: label ends at the tip
    expect(tipLabelTransform(90)).toBe("translate(-50%, -100%)"); // up: label sits above
    expect(tipLabelTransform(270)).toBe("translate(-50%, 0)"); // down: label hangs below
    expect(tipLabelTransform(45 + 270)).toBe("translate(0, -50%)");
  });

  it("lists an arm's codes in step order with «—» for empty steps", () => {
    const r = rack("x", 2, 0, 0, [
      { id: 1, piece_id: null, arm_id: 21, step: 1, product: product(5, "کراپ ۹۲۰۴", "9204") },
      { id: 2, piece_id: null, arm_id: 21, step: 0, product: null },
    ]);
    expect(armCodes(r, CROSS.arms[0])).toEqual(["—", "۹۲۰۴"]);
    expect(armCodes(r, { ...CROSS.arms[1], id: null })).toEqual(["—", "—"]);
  });

  it("keeps codes readable", () => {
    expect([codeFs(4), codeFs(11.4), codeFs(30)]).toEqual([9, 11, 14]);
    expect(inkOn("#ffffff")).toBe("#0a0e14");
    expect(inkOn("#f9a8d4")).toBe("#0a0e14");
    expect(inkOn("#1e3a8a")).toBe("#fff");
    expect(inkOn(null)).toBe("#fff");
    const p = { kind: "full" as const };
    expect(showsCode(p, true, 40, 12, true)).toBe(true);
    expect(showsCode(p, true, 40, 12, false)).toBe(false);
    expect(showsCode(p, true, 20, 12, true)).toBe(false);
    expect(showsCode(p, true, 40, 9, true)).toBe(false);
    expect(showsCode({ kind: "half" }, true, 0, 0, true)).toBe(true);
    expect(showsCode(p, false, 40, 12, true)).toBe(false);
  });

  it("finds a free direction for a new arm", () => {
    expect(freeAngle(CROSS.arms, 0)).toBe(45);
    expect(freeAngle([arm(1, 0)], 0)).toBe(90);
    expect(freeAngle([0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => arm(i, a)), 0)).toBeNull();
  });
});

describe("elements and slots", () => {
  const p1 = product(1, "وست جین زنانه ۷۵۵۶", "7556");
  const mixed = line(8, [piece(81, "b", "full", 0, 70), piece(82, "a", "half", 90, null), piece(83, "a", "full", 0, 80), piece(84, "b", "half", 100, null)]);

  it("reads line pieces side a then b from the right end, hub arms step by step", () => {
    expect(elements(mixed).map((e) => e.key)).toEqual(["p83", "p82", "p81", "p84"]);
    expect(elements(CROSS).map((e) => e.key).slice(0, 3)).toEqual(["a21:0", "a21:1", "a22:0"]);
    expect(elementLabel(elements(CROSS)[3])).toBe("بازوی ۲ (بالا) · پله ۲");
    expect(elementLabel(elements(mixed)[1])).toBe("طرف الف · نیم‌رگال");
  });

  it("matches slots to elements and picks the next empty one", () => {
    const r = rack("x", 2, 0, 0, [
      { id: 1, piece_id: null, arm_id: 21, step: 0, product: p1 },
      { id: 2, piece_id: null, arm_id: 21, step: 1, product: null },
      { id: 3, piece_id: null, arm_id: 22, step: 0, product: p1 },
    ]);
    expect(slotFor(r, elements(CROSS)[1])?.id).toBe(2);
    expect(slotFor(r, { key: "n", arm: { ...CROSS.arms[0], id: null }, step: 0 })).toBeUndefined();
    expect(placed(r, CROSS)).toEqual([8, 2]);
    expect(firstEmpty(r, CROSS)).toBe("a21:1");
    expect(nextEmpty(r, CROSS, "a21:1")).toBe("a22:1");
    expect(filledRacks([r, rack("y", 2)], CROSS, { armId: 21, fromStep: 1 })).toEqual([]);
    expect(filledRacks([r, rack("y", 2)], CROSS, { armId: 21 }).map((x) => x.key)).toEqual(["x"]);
  });

  it("keeps line pieces inside the template", () => {
    const fitted = fitPieces({ ...line(9, [piece(1, "a", "full", 80, 10), piece(2, "b", "half", 140, null)]), length_cm: 100 });
    expect(fitted.pieces.map((p) => [p.offset_cm, p.length_cm])).toEqual([[70, 30], [100, null]]);
  });

  it("finds racks by title or code with Persian or Latin digits", () => {
    const racks = [rack("r", 1, 0, 0, [{ id: 1, piece_id: 11, arm_id: null, step: null, product: p1 }]), rack("o", 1)];
    expect(findRacks(racks, "")).toBeNull();
    expect(findRacks(racks, "۷۵۵۶")).toEqual(new Set(["r"]));
    expect(findRacks(racks, "7556")).toEqual(new Set(["r"]));
    expect(findRacks(racks, "1234")).toEqual(new Set());
  });
});

describe("saving", () => {
  it("sends racks as position + template and maps new racks back by key", () => {
    const layout: Layout = { branch: "SARI", ...store, door_side: "left", door_offset_cm: 0, door_width_cm: 150, version: 3, templates: [CROSS], racks: [rack("k1", 2, 0, 0, [], 90)] };
    expect(toDoc(layout).racks[0]).toEqual({ id: null, key: "k1", code: "K1", x_cm: 0, y_cm: 0, rotation: 90, template_id: 2 });
    const slots: Slot[] = [{ id: 40, piece_id: null, arm_id: 21, step: 0, product: null }];
    const saved = applyCreated(layout, { k1: { ...layout.racks[0], id: 11, slots, footprint_cm: [100, 100] } }, 4);
    expect([saved.version, saved.racks[0].id, saved.racks[0].slots]).toEqual([4, 11, slots]);
  });

  it("applies a template save: element ids by key, synced slots of its racks", () => {
    const draft = { ...CROSS, arms: [...CROSS.arms, { id: null, key: "new", angle_deg: 45, length_cm: 40, steps: 1 }] };
    const layout: Layout = { branch: "SARI", ...store, door_side: "left", door_offset_cm: 0, door_width_cm: 150, version: 3, templates: [draft], racks: [{ ...rack("x", 2), id: 5 }] };
    expect(toTemplateDoc(draft, 3).arms.at(-1)).toEqual({ id: null, key: "new", angle_deg: 45, length_cm: 40, steps: 1 });
    const slots: Slot[] = [{ id: 70, piece_id: null, arm_id: 99, step: 0, product: null }];
    const next = applyTemplateResult(layout, { version: 4, ids: { new: 99 }, template: { ...CROSS, racks: 1, arms: [] }, racks: [{ id: 5, slots }] });
    expect(next.version).toBe(4);
    expect(next.templates[0].arms.at(-1)?.id).toBe(99);
    expect(next.templates[0].racks).toBe(1);
    expect(next.racks[0].slots).toBe(slots);
  });
});
