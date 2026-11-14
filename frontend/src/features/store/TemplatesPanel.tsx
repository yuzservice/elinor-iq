/** «قالب رگال‌ها» (super admin): the template library, starter shapes and the line/hub editors. A change applies to every
 * rack built from the template and autosaves; removals that would drop a product are refused with a message. */
import { useState } from "react";
import { toFaDigits } from "../../lib/dates";
import { HubTemplateEditor, hubInfo } from "./HubTemplateEditor";
import { GHOST, LineTemplateEditor, lineInfo } from "./LineTemplateEditor";
import { STARTERS, elements, sides, stepRadius } from "./geometry";
import type { Rack, Template } from "./types";

/** Small top-view drawing of a template, for the library and pickers. */
export function TemplateMini({ t, size = 56 }: { t: Pick<Template, "kind" | "length_cm" | "arm_cm" | "pieces" | "arms">; size?: number }) {
  const c = size / 2;
  if (t.kind === "hub") {
    const k = (size / 2 - 5) / Math.max(30, ...t.arms.map((a) => a.length_cm));
    const pt = (deg: number, r: number) => [c + Math.cos((deg * Math.PI) / 180) * r * k, c - Math.sin((deg * Math.PI) / 180) * r * k];
    return (
      <svg aria-hidden="true" width={size} height={size} className="flex-none rounded-[10px]" style={{ background: "var(--map-backdrop)" }}>
        {t.arms.map((a, i) => {
          const [x, y] = pt(a.angle_deg, a.length_cm);
          return (
            <g key={i}>
              <line x1={c} y1={c} x2={x} y2={y} stroke="var(--text-secondary)" strokeWidth={3} strokeLinecap="round" />
              {Array.from({ length: a.steps }, (_, j) => {
                const [dx, dy] = pt(a.angle_deg, stepRadius(a, j));
                return <circle key={j} cx={dx} cy={dy} r={2.5} fill="var(--accent)" />;
              })}
            </g>
          );
        })}
        <circle cx={c} cy={c} r={3} fill="var(--text)" />
      </svg>
    );
  }
  const len = t.length_cm || 1, k = (size - 10) / len, two = sides(t) === 2;
  const spineY = two ? c - 1 : size - 12;
  return (
    <svg aria-hidden="true" width={size} height={size} className="flex-none rounded-[10px]" style={{ background: "var(--map-backdrop)" }}>
      <rect x={5} y={spineY} width={size - 10} height={2} fill="var(--map-spine)" />
      {t.pieces.map((p, i) => {
        const y = p.side === "a" ? (two ? c - 12 : size - 23) : two ? c + 3 : size - 23;
        const right = size - 5 - p.offset_cm * k;
        return p.kind === "full"
          ? <rect key={i} x={right - Math.max(3, (p.length_cm ?? 0) * k)} y={y} width={Math.max(3, (p.length_cm ?? 0) * k)} height={9} rx={2} fill="none" stroke="var(--text-secondary)" />
          : <rect key={i} x={right - 1} y={y} width={2} height={9} fill="var(--accent)" />;
      })}
    </svg>
  );
}

export const templateMeta = (t: Template) =>
  `${t.kind === "hub" ? `${toFaDigits(t.arms.length)} بازو · ` : "خطی · "}${toFaDigits(elements(t).length)} جایگاه · ${t.racks ? `${toFaDigits(t.racks)} رگال روی نقشه` : "هنوز روی نقشه نیست"}`;

type Props = {
  templates: Template[];
  racks: Rack[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: (name: string, shape: Pick<Template, "kind" | "length_cm" | "arm_cm" | "pieces" | "arms">) => Promise<void>;
  onChange: (t: Template) => void;
  onDelete: (t: Template) => void;
  message: { text: string; bad: boolean } | null;
  onMessage: (text: string, bad: boolean) => void;
};

export function TemplatesPanel({ templates, racks, selectedId, onSelect, onCreate, onChange, onDelete, message, onMessage }: Props) {
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = templates.find((x) => x.id === selectedId) ?? templates[0] ?? null;
  const used = t ? racks.filter((r) => r.template_id === t.id).length : 0;
  const create = async (name: string, shape: Parameters<Props["onCreate"]>[1]) => {
    setBusy(true);
    try {
      await onCreate(name, shape);
      setStarting(false);
    } catch (err) {
      onMessage((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const block = (text: string) => onMessage(text, true);
  const shown = message ?? (t
    ? used ? { text: `تغییر این قالب روی همه‌ی ${toFaDigits(used)} رگال ساخته‌شده از آن اعمال و خودکار ذخیره می‌شود.`, bad: false }
      : { text: "این قالب هنوز روی نقشه نیست. در «طراحی نقشه» از «+ رگال» آن را بگذارید.", bad: false }
    : null);

  return (
    <div className="grid items-start gap-3.5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <section aria-label="کتابخانه قالب‌ها" className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-3.5">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-[15px] font-semibold text-ink">قالب‌ها</h2>
          <button type="button" aria-expanded={starting} onClick={() => setStarting(!starting)}
            className="min-h-[30px] cursor-pointer rounded-[10px] border-0 bg-accent px-3 text-[12.5px] font-semibold text-on-accent">+ قالب جدید</button>
        </div>
        {starting ? (
          <div className="flex flex-col gap-[5px] rounded-xl border border-accent/30 p-2.5" style={{ background: "var(--map-floor)" }}>
            <span className="text-xs text-muted">از کدام شکل شروع کنیم؟</span>
            {STARTERS.map((s) => (
              <button key={s.name} type="button" disabled={busy} onClick={() => create(s.name, s.shape)}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-transparent bg-elevated px-2 py-[7px] text-start font-[inherit] text-[12.5px] text-ink disabled:opacity-50">
                <TemplateMini t={s.shape} size={40} />
                <span className="flex flex-col gap-px"><b className="font-semibold">{s.name}</b><span className="text-[11px] text-muted">{s.note}</span></span>
              </button>
            ))}
          </div>
        ) : null}
        {templates.map((x) => {
          const on = x.id === t?.id;
          return (
            <button key={x.id} type="button" aria-pressed={on} onClick={() => onSelect(x.id)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-[14px] border p-2 text-start font-[inherit] text-inherit ${on ? "border-accent/55 bg-accent/10" : "border-transparent bg-elevated"}`}>
              <TemplateMini t={x} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="truncate text-[13px] font-semibold text-ink">{x.name}</b>
                <span className="text-[11.5px] text-muted">{templateMeta(x)}</span>
              </span>
            </button>
          );
        })}
        {!templates.length ? <span className="text-[12.5px] text-muted">هنوز قالبی نیست؛ با «+ قالب جدید» شروع کنید.</span> : null}
      </section>

      {t ? (
        <section aria-label="ویرایش قالب" className="flex min-w-0 flex-col gap-2.5 rounded-[18px] border border-line bg-surface px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <input value={t.name} onChange={(e) => onChange({ ...t, name: e.target.value.slice(0, 64) })} aria-label="نام قالب"
                className="min-h-9 w-[220px] rounded-[10px] border border-line bg-elevated px-3 text-[13px] font-semibold text-ink outline-none focus:border-accent" />
              <span className="text-[12.5px] text-muted">{t.kind === "hub" ? hubInfo(t) : lineInfo(t)}</span>
            </div>
            <div className="flex gap-1.5">
              <button type="button" className={GHOST} disabled={busy} onClick={() => create(`${t.name} (کپی)`, {
                kind: t.kind, length_cm: t.length_cm, arm_cm: t.arm_cm,
                pieces: t.pieces.map((p) => ({ ...p, id: null })), arms: t.arms.map((a) => ({ ...a, id: null })),
              })}>⧉ کپی قالب</button>
              <button type="button" className={`${GHOST} !border-rose/35 !text-rose`} disabled={used > 0}
                title={used ? `این قالب در ${toFaDigits(used)} رگال استفاده شده؛ اول آن رگال‌ها را حذف کنید` : "حذف قالب"} onClick={() => onDelete(t)}>حذف</button>
            </div>
          </div>
          {t.kind === "hub"
            ? <HubTemplateEditor key={t.id} template={t} racks={racks} onChange={onChange} onBlock={block} />
            : <LineTemplateEditor key={t.id} template={t} racks={racks} onChange={onChange} onBlock={block} />}
          {shown ? (
            <div role={shown.bad ? "alert" : "status"} className={`rounded-[10px] px-3 py-2 text-xs ${shown.bad ? "bg-rose/10 text-rose" : "bg-sage/10 text-sage"}`}>{shown.text}</div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
