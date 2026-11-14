/** Hub template editor: the post seen from above. Drag an arm's blue tip to turn it (45° snap) and set its length;
 * − / + steps; copy or delete an arm. A step or arm with a product on any rack cannot be removed. */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toFaDigits } from "../../lib/dates";
import { GHOST } from "./LineTemplateEditor";
import { ARM, DIR, POST, filledRacks, freeAngle, hubExtent, newKey, snap, stepRadius } from "./geometry";
import type { Rack, Template, TemplateArm } from "./types";

const W = 560, H = 440, CX = W / 2, CY = H / 2, HK = 2.3;
const rad = (deg: number) => (deg * Math.PI) / 180;
const at = (deg: number, r: number): [number, number] => [CX + Math.cos(rad(deg)) * r * HK, CY - Math.sin(rad(deg)) * r * HK];
const cm = (n: number) => `${toFaDigits(n)} سانت`;

/** Angle (45° steps, 0–315) and length (20–90 cm, 5 cm steps) for a pointer at (dx, dy) px from the post, y up. */
export function armFromPointer(dx: number, dy: number, scale = HK) {
  const angle = ((Math.round((Math.atan2(dy, dx) * 180) / Math.PI / 45) * 45) % 360 + 360) % 360;
  const length = Math.max(ARM.min, Math.min(ARM.max, snap(Math.hypot(dx, dy) / scale / 5, 1) * 5));
  return { angle, length };
}

type Props = { template: Template; racks: Rack[]; onChange: (t: Template) => void; onBlock: (message: string) => void };

export function HubTemplateEditor({ template: t, racks, onChange, onBlock }: Props) {
  const [selected, setSelected] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tRef = useRef(t);
  tRef.current = t;
  const arm = t.arms[selected] ?? null;
  const filledSteps = (a: TemplateArm, step: number) => filledRacks(racks, t, { armId: a.id }).filter((r) => r.slots.some((s) => s.product && s.arm_id === a.id && s.step === step)).length;

  useEffect(() => setSelected((s) => (s < t.arms.length ? s : 0)), [t.id, t.arms.length]);

  useEffect(() => {
    if (drag === null) return;
    const move = (e: PointerEvent) => {
      const r = stageRef.current?.getBoundingClientRect();
      if (!r) return;
      const { angle, length } = armFromPointer(e.clientX - r.left - CX, CY - (e.clientY - r.top));
      const cur = tRef.current;
      const a = cur.arms[drag];
      if (!a) return;
      const turn = cur.arms.some((o, i) => i !== drag && o.angle_deg === angle) ? a.angle_deg : angle;
      if (turn === a.angle_deg && length === a.length_cm) return;
      onChange({ ...cur, arms: cur.arms.map((o, i) => (i === drag ? { ...o, angle_deg: turn, length_cm: length } : o)) });
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
  }, [drag, onChange]);

  const setArm = (patch: Partial<TemplateArm>) => onChange({ ...t, arms: t.arms.map((a, i) => (i === selected ? { ...a, ...patch } : a)) });
  const steps = (delta: number) => {
    if (!arm) return;
    const n = arm.steps + delta;
    if (n < 1 || n > ARM.maxSteps) return;
    if (delta < 0 && filledSteps(arm, n)) return onBlock(`پله ${toFaDigits(arm.steps)} این بازو روی رگال‌های نقشه کالا دارد. اول کالا را از آن پله بردارید.`);
    setArm({ steps: n });
  };
  const addArm = (from: TemplateArm | null) => {
    const angle = freeAngle(t.arms, from?.angle_deg ?? 0);
    if (angle === null) return;
    onChange({ ...t, arms: [...t.arms, { id: null, key: newKey("a"), angle_deg: angle, length_cm: from?.length_cm ?? 45, steps: from?.steps ?? 2 }] });
    setSelected(t.arms.length);
  };
  const deleteArm = () => {
    if (!arm) return;
    if (filledRacks(racks, t, { armId: arm.id }).length) return onBlock("این بازو روی رگال‌های نقشه کالا دارد. اول کالاهایش را بردارید.");
    if (t.arms.length < 2) return onBlock("قالب دست‌کم یک بازو لازم دارد.");
    onChange({ ...t, arms: t.arms.filter((_, i) => i !== selected) });
    setSelected(0);
  };
  const grabTip = (i: number) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelected(i);
    setDrag(i);
  };
  const dragging = drag !== null ? t.arms[drag] : null;
  const dragTip = dragging ? at(dragging.angle_deg, dragging.length_cm) : null;
  const full = t.arms.length >= ARM.maxArms;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-elevated px-2.5 py-2">
        <button type="button" className={GHOST} onClick={() => addArm(null)} disabled={full}>+ بازو</button>
        {arm ? (
          <>
            <span className="mx-1 h-[22px] w-px bg-line" />
            <b className="text-[12.5px] text-accent">بازوی {toFaDigits(selected + 1)}</b>
            <span className="text-xs text-muted">طول {cm(arm.length_cm)} · رو به {DIR[arm.angle_deg]}</span>
            <span role="group" aria-label="تعداد پله" className="flex items-center gap-0.5 rounded-[9px] p-0.5" style={{ background: "var(--map-floor)" }}>
              <button type="button" aria-label="یک پله کمتر" onClick={() => steps(-1)} className="h-[30px] w-[30px] cursor-pointer rounded-lg border-0 bg-transparent text-sm text-muted hover:text-ink">−</button>
              <span className="min-w-[58px] text-center text-[12.5px] text-ink">{toFaDigits(arm.steps)} پله</span>
              <button type="button" aria-label="یک پله بیشتر" onClick={() => steps(1)} className="h-[30px] w-[30px] cursor-pointer rounded-lg border-0 bg-transparent text-sm text-muted hover:text-ink">+</button>
            </span>
            <button type="button" className={GHOST} onClick={() => addArm(arm)} disabled={full} title="کپی بازو" aria-label="کپی بازو">⧉</button>
            <button type="button" className={`${GHOST} !border-rose/35 !text-rose`} onClick={deleteArm} title="حذف بازو" aria-label="حذف بازو">✕</button>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div dir="ltr" className="max-w-full overflow-x-auto">
          <div ref={stageRef} className="relative select-none overflow-hidden rounded-[14px] border border-line"
            style={{ width: W, height: H, backgroundColor: "var(--map-floor)", cursor: drag !== null ? "grabbing" : "default",
              backgroundImage: "linear-gradient(var(--map-grid) 1px, transparent 1px), linear-gradient(90deg, var(--map-grid) 1px, transparent 1px)",
              backgroundSize: `${10 * HK}px ${10 * HK}px`, backgroundPosition: `${CX}px ${CY}px` }}>
            {[30, 60, 90].map((r) => (
              <span key={r}>
                <span className="pointer-events-none absolute box-border rounded-full" style={{ left: CX - r * HK, top: CY - r * HK, width: 2 * r * HK, height: 2 * r * HK, border: "1px dashed var(--map-grid)" }} />
                <span className="pointer-events-none absolute text-[10px] text-faint" style={{ left: CX + 4, top: CY - r * HK - 14 }}>{cm(r)}</span>
              </span>
            ))}
            {t.arms.map((a, i) => {
              const on = i === selected;
              const [tx, ty] = at(a.angle_deg, a.length_cm);
              const [nx, ny] = at(a.angle_deg, a.length_cm + 14);
              const colour = on ? "var(--accent)" : "var(--text-secondary)";
              return (
                <span key={a.key}>
                  <span onPointerDown={() => setSelected(i)} className="absolute h-1.5 cursor-pointer rounded-[3px]"
                    style={{ left: CX, top: CY - 3, width: Math.round(a.length_cm * HK), background: colour, transformOrigin: "0 50%", transform: `rotate(${-a.angle_deg}deg)`,
                      boxShadow: on ? "0 0 0 4px color-mix(in srgb, var(--accent) 20%, transparent)" : undefined }} />
                  {Array.from({ length: a.steps }, (_, step) => {
                    const [x, y] = at(a.angle_deg, stepRadius(a, step));
                    const n = filledSteps(a, step);
                    return (
                      <span key={step} onPointerDown={() => setSelected(i)} title={n ? `پله ${toFaDigits(step + 1)}: کالا در ${toFaDigits(n)} رگال` : `پله ${toFaDigits(step + 1)}`}
                        className="absolute z-[3] box-border flex h-[22px] w-[26px] cursor-pointer items-center justify-center rounded-[11px] text-[11px] font-bold text-ink"
                        style={{ left: x - 13, top: y - 11, background: n ? "color-mix(in srgb, var(--accent) 45%, var(--elevated))" : "var(--elevated)", border: `2px solid ${on ? "var(--accent)" : "var(--text-faint)"}` }}>
                        {toFaDigits(step + 1)}
                      </span>
                    );
                  })}
                  <span onPointerDown={grabTip(i)} title="سر بازو را بکشید: چرخش و طول"
                    className="absolute z-[4] box-border h-[18px] w-[18px] cursor-grab rounded-full bg-accent" style={{ left: tx - 9, top: ty - 9, border: "3px solid var(--map-floor)", touchAction: "none" }} />
                  <span className="pointer-events-none absolute h-5 w-5 rounded-full text-center text-[11px] font-bold leading-5"
                    style={{ left: nx - 10, top: ny - 10, color: on ? "var(--on-accent)" : "var(--text-secondary)", background: on ? "var(--accent)" : "var(--elevated)" }}>
                    {toFaDigits(i + 1)}
                  </span>
                </span>
              );
            })}
            <span aria-hidden="true" className="pointer-events-none absolute z-[5] box-border rounded-full"
              style={{ left: CX - POST * HK, top: CY - POST * HK, width: 2 * POST * HK, height: 2 * POST * HK, background: "var(--map-spine)", border: "3px solid var(--map-floor)" }} />
            {dragging && dragTip ? (
              <span dir="rtl" className="pointer-events-none absolute z-[6] whitespace-nowrap rounded-full bg-accent px-2 py-px text-[11px] font-semibold text-on-accent" style={{ left: dragTip[0] + 14, top: dragTip[1] - 30 }}>
                {cm(dragging.length_cm)} · رو به {DIR[dragging.angle_deg]}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-[1_1_260px] flex-col gap-1.5 rounded-[14px] border border-line p-3" style={{ background: "var(--map-floor)" }}>
          <span className="text-[12.5px] font-semibold text-muted">{arm ? `نمای کنار بازوی ${toFaDigits(selected + 1)} · پلکانی، ${toFaDigits(arm.steps)} جایگاه` : "یک بازو را انتخاب کنید"}</span>
          {arm ? (
            <div className="relative" style={{ height: 50 + arm.steps * 24 }}>
              <span aria-hidden="true" className="absolute bottom-1.5 right-[2%] top-1.5 w-2 rounded-[3px]" style={{ background: "var(--text-faint)" }} />
              {Array.from({ length: arm.steps }, (_, step) => {
                const sw = 90 / arm.steps, top = 18 + step * 24, n = filledSteps(arm, step);
                return (
                  <span key={step}>
                    <span className="absolute h-1 rounded-sm" style={{ right: `${4 + step * sw}%`, width: `${sw}%`, top, background: "var(--text-secondary)" }} />
                    {step < arm.steps - 1 ? <span className="absolute w-1 rounded-sm" style={{ right: `calc(${4 + (step + 1) * sw}% - 2px)`, top, height: 28, background: "var(--text-secondary)" }} /> : null}
                    <span className="absolute h-3 w-0.5" style={{ right: `calc(${4 + (step + 0.5) * sw}% - 1px)`, top: top + 4, background: "var(--text-faint)" }} />
                    <span className={`absolute whitespace-nowrap rounded-[7px] px-2 py-0.5 text-[11px] font-semibold ${n ? "border border-accent/40 bg-accent/25 text-ink" : "border border-dashed border-line text-faint"}`}
                      style={{ right: `${4 + (step + 0.5) * sw}%`, transform: "translateX(50%)", top: top + 16 }}>
                      پله {toFaDigits(step + 1)}{n ? ` · ${toFaDigits(n)} کالا` : ""}
                    </span>
                  </span>
                );
              })}
            </div>
          ) : null}
          <span className="text-[11.5px] leading-7 text-muted">پله ۱ نزدیک ستون است. هر پله یک جایگاه کالاست.</span>
        </div>
      </div>
      <span className="text-[11.5px] text-muted">سر آبی هر بازو را بکشید: هر ۴۵ درجه می‌چرخد و طولش عوض می‌شود · روی بازو بزنید تا انتخاب شود.</span>
    </>
  );
}

export function hubInfo(t: Template) {
  const e = hubExtent(t.arms, 0);
  const cell = (span: number) => Math.max(1, Math.ceil((span - 0.01) / 50)) * 50;
  const slots = t.arms.reduce((n, a) => n + a.steps, 0);
  return `${toFaDigits(t.arms.length)} بازو · ${toFaDigits(slots)} جایگاه · جای روی کف ${toFaDigits(cell(e.maxx - e.minx))}×${toFaDigits(cell(e.maxy - e.miny))} سانت`;
}
