import { useEffect, useRef, useState } from "react";
import { useApi } from "../../hooks/useApi";
import { ApiError } from "../../services/api";
import { callsService } from "../../services/calls";
import { AFTER_SAVE_LABELS, FIELD_PALETTE, emptySchema, fieldTypeLabel, move, newField, newId, newOutcome, outcomeSubtitle } from "./builderOps";
import type { CallTag, FieldType, FormField, FormOutcome, FormSchema, ProgramRow } from "./types";
import { Add, CARD, Chip, Ghost, H, INPUT, MUTED, Primary, SOFT } from "./ui";

const LABEL = `flex flex-col gap-1.5 text-[13px] ${SOFT}`;
const CHECK = `inline-flex min-h-9 items-center gap-2 text-[13px] ${SOFT}`;

export function FormBuilder({ program, others, gapDefault, onPublished }: { program: ProgramRow; others: ProgramRow[]; gapDefault: number; onPublished: () => void }) {
  const form = useApi(() => callsService.form(program.id), [program.id]);
  const tags = useApi(() => callsService.tags(), []);
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [openOutcome, setOpenOutcome] = useState<string | null>(null);
  const [openField, setOpenField] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const dirty = useRef(false);

  useEffect(() => {
    if (form.data && schema === null) {
      const start = form.data.draft?.schema ?? form.data.published?.schema ?? emptySchema();
      setSchema(start);
      setOpenOutcome(start.outcomes[0]?.id ?? null);
    }
  }, [form.data, schema]);

  // Draft autosave.
  useEffect(() => {
    if (!schema || !dirty.current) return;
    const timer = window.setTimeout(() => {
      callsService.saveForm(program.id, schema).then(() => setMessage("پیش‌نویس ذخیره شد.")).catch(() => setMessage("ذخیره پیش‌نویس انجام نشد."));
      dirty.current = false;
    }, 800);
    return () => window.clearTimeout(timer);
  }, [schema, program.id]);

  // Leaving the step inside the autosave delay must not lose the edit.
  const latest = useRef(schema);
  latest.current = schema;
  useEffect(
    () => () => {
      if (dirty.current && latest.current) void callsService.saveForm(program.id, latest.current);
    },
    [program.id],
  );

  if (form.error) return <p className={MUTED}>فرم بارگذاری نشد.</p>;
  if (!schema || !form.data) return <p className={MUTED}>در حال دریافت اطلاعات...</p>;

  const usedOutcomes = new Set(form.data.used_outcome_ids);
  const usedOptions = new Set(form.data.used_option_ids);
  const tagList = (tags.data?.results ?? []).filter((tag) => tag.is_active);

  const change = (next: FormSchema) => {
    dirty.current = true;
    setSchema(next);
  };
  const outcome = schema.outcomes.find((row) => row.id === openOutcome) ?? null;
  const setOutcome = (patch: Partial<FormOutcome>) =>
    change({ outcomes: schema.outcomes.map((row) => (row.id === openOutcome ? { ...row, ...patch } : row)) });
  const setField = (id: string, patch: Partial<FormField>) =>
    setOutcome({ fields: (outcome?.fields ?? []).map((field) => (field.id === id ? { ...field, ...patch } : field)) });

  const addOutcome = () => {
    const row = newOutcome();
    change({ outcomes: [...schema.outcomes, row] });
    setOpenOutcome(row.id);
  };
  const addField = (type: FieldType) => {
    const field = newField(type);
    setOutcome({ fields: [...(outcome?.fields ?? []), field] });
    setOpenField(field.id);
  };
  const publish = async () => {
    setMessage("");
    try {
      await callsService.saveForm(program.id, schema);
      dirty.current = false;
      await callsService.publishForm(program.id);
      setMessage("فرم منتشر شد. تماس‌های بعدی با این نسخه ثبت می‌شوند.");
      onPublished();
    } catch (error) {
      setMessage(error instanceof ApiError && error.message ? error.message : "انتشار انجام نشد.");
    }
  };
  const copyFrom = async (id: number) => {
    const source = await callsService.form(id);
    const copied = source.published?.schema ?? source.draft?.schema;
    if (copied) {
      change(copied);
      setOpenOutcome(copied.outcomes[0]?.id ?? null);
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={MUTED}>{message || `نسخه منتشرشده: ${form.data.published ? form.data.published.version : "ندارد"}`}</span>
        <Primary onClick={publish}>انتشار</Primary>
      </div>
      {!schema.outcomes.length && others.length ? (
        <div className={`${CARD} flex flex-wrap items-center gap-1.5 px-4 py-3`}>
          <span className={MUTED}>فرم خالی است. از صفر بسازید یا کپی کنید از:</span>
          {others.map((row) => (
            <Ghost key={row.id} onClick={() => copyFrom(row.id)}>{row.name}</Ghost>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-3.5">
        <aside className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
          <h2 className={`${H} mb-1`}>نتیجه‌های تماس</h2>
          {schema.outcomes.map((row, index) => (
            <div key={row.id} className="flex gap-1">
              <button
                type="button"
                aria-pressed={row.id === openOutcome}
                onClick={() => setOpenOutcome(row.id)}
                className={`flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-right ${row.id === openOutcome ? "border-accent bg-blue-500/10" : "border-line bg-surface"}`}
              >
                <span className="text-[13.5px] font-semibold text-ink">{row.title || "بدون عنوان"}</span>
                <span className={MUTED}>{outcomeSubtitle(row)}</span>
              </button>
              <span className="flex flex-col gap-0.5">
                <Ghost aria-label="بالاتر" className="min-h-[26px] flex-1 px-2" onClick={() => change({ outcomes: move(schema.outcomes, index, -1) })}>▲</Ghost>
                <Ghost aria-label="پایین‌تر" className="min-h-[26px] flex-1 px-2" onClick={() => change({ outcomes: move(schema.outcomes, index, 1) })}>▼</Ghost>
              </span>
            </div>
          ))}
          <Add onClick={addOutcome}>افزودن نتیجه</Add>
        </aside>

        <main className="flex min-w-0 flex-[3_1_460px] flex-col gap-3">
          {!outcome ? (
            <section className={`${CARD} p-9 text-center`}>
              <p className={`${MUTED} m-0`}>اولین نتیجه تماس را اضافه کنید، مثلاً «پاسخ نداد» یا «علاقه‌مند است».</p>
            </section>
          ) : (
            <>
              <OutcomeSettings
                outcome={outcome}
                tags={tagList}
                gapDefault={gapDefault}
                canDelete={!usedOutcomes.has(outcome.id)}
                onChange={setOutcome}
                onRemove={() => {
                  const rest = schema.outcomes.filter((row) => row.id !== outcome.id);
                  change({ outcomes: rest });
                  setOpenOutcome(rest[0]?.id ?? null);
                }}
              />
              <div className="mt-3 flex flex-col gap-[3px]">
                <h2 className={`${H} text-[15px]`}>فرم نتیجه</h2>
                <span className={MUTED}>چیزهایی که کارمند بعد از انتخاب این نتیجه پر می‌کند.</span>
              </div>
              {outcome.fields.map((field, index) => (
                <FieldEditor
                  key={field.id}
                  field={field}
                  open={openField === field.id}
                  tags={tagList}
                  usedOptions={usedOptions}
                  onToggle={() => setOpenField(openField === field.id ? null : field.id)}
                  onChange={(patch) => setField(field.id, patch)}
                  onMove={(delta) => setOutcome({ fields: move(outcome.fields, index, delta) })}
                  onRemove={() => setOutcome({ fields: outcome.fields.filter((row) => row.id !== field.id) })}
                />
              ))}
              <div className="flex flex-col gap-[7px]">
                <span className={MUTED}>افزودن فیلد</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {FIELD_PALETTE.map((item) => (
                    <Add key={item.type} onClick={() => addField(item.type)}>{item.label}</Add>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>

        <aside className={`${CARD} flex min-w-0 flex-[2_1_260px] flex-col gap-3 p-4`}>
          <h2 className={H}>پیش‌نمایش برای کارمند</h2>
          {outcome && !outcome.fields.length ? <span className={MUTED}>این نتیجه فیلدی ندارد و با یک کلیک ثبت می‌شود.</span> : null}
          {outcome?.fields.map((field) => (
            <div key={field.id} className="flex flex-col gap-1.5">
              <span className={`text-[13px] ${SOFT}`}>{field.title || "فیلد بدون عنوان"}{field.required ? " (اجباری)" : ""}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {(field.options?.length ? field.options.filter((option) => option.is_active !== false).map((option) => option.title || "گزینه") : [fieldTypeLabel(field.type)]).map((bit, index) => (
                  <span key={index} className={`rounded-[9px] border border-line bg-elevated px-2.5 py-[5px] text-xs ${SOFT}`}>{bit}</span>
                ))}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

function TagChips({ tags, selected, onChange }: { tags: CallTag[]; selected: number[]; onChange: (ids: number[]) => void }) {
  return (
    <>
      {tags.map((tag) => (
        <Chip key={tag.id} on={selected.includes(tag.id)} onClick={() => onChange(selected.includes(tag.id) ? selected.filter((id) => id !== tag.id) : [...selected, tag.id])}>
          {tag.title}
        </Chip>
      ))}
    </>
  );
}

function OutcomeSettings({ outcome, tags, gapDefault, canDelete, onChange, onRemove }: {
  outcome: FormOutcome;
  tags: CallTag[];
  gapDefault: number;
  canDelete: boolean;
  onChange: (patch: Partial<FormOutcome>) => void;
  onRemove: () => void;
}) {
  return (
    <section className={`${CARD} flex flex-col gap-3.5 p-[18px]`}>
      <h2 className={`${H} text-[15px]`}>تنظیمات نتیجه</h2>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <label className={`${LABEL} flex-[1_1_260px]`}>
          عنوان نتیجه
          <input className={`${INPUT} max-w-[360px]`} value={outcome.title} onChange={(event) => onChange({ title: event.target.value })} />
        </label>
        {canDelete ? <Ghost onClick={onRemove}>حذف این نتیجه</Ghost> : null}
      </div>
      <label className={CHECK}>
        <input type="checkbox" checked={outcome.connected} onChange={(event) => onChange({ connected: event.target.checked })} />
        با مشتری صحبت شده (یادداشت اجباری می‌شود)
      </label>
      <div className="flex flex-col gap-2">
        <span className={`text-[13px] ${SOFT}`}>بعد از ثبت چه شود؟</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {AFTER_SAVE_LABELS.map((item) => (
            <Chip key={item.value} on={outcome.after_save === item.value} onClick={() => onChange({ after_save: item.value })}>{item.label}</Chip>
          ))}
        </div>
      </div>
      {outcome.after_save === "retry" ? (
        <div className="flex flex-wrap items-end gap-2.5">
          <label className={LABEL}>
            چند بار
            <input className={`${INPUT} w-24`} type="number" min={1} value={outcome.retry_times ?? 1} onChange={(event) => onChange({ retry_times: Number(event.target.value) })} />
          </label>
          <label className={LABEL}>
            با فاصله
            <input className={`${INPUT} w-24`} type="number" min={1} value={outcome.retry_gap ?? 1} onChange={(event) => onChange({ retry_gap: Number(event.target.value) })} />
          </label>
          <Chip on={outcome.retry_unit !== "hour"} onClick={() => onChange({ retry_unit: "day" })}>روز</Chip>
          <Chip on={outcome.retry_unit === "hour"} onClick={() => onChange({ retry_unit: "hour" })}>ساعت</Chip>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <span className={`text-[13px] ${SOFT}`}>در گزارش به‌عنوان</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <TagChips tags={tags} selected={outcome.tag_ids ?? []} onChange={(ids) => onChange({ tag_ids: ids })} />
        </div>
      </div>
      <label className={LABEL}>
        تا چند روز تماس نگیرید (خالی یعنی {gapDefault} روز، از تنظیمات عمومی)
        <input
          className={`${INPUT} w-[110px]`}
          type="number"
          min={0}
          value={outcome.no_call_days ?? ""}
          onChange={(event) => onChange({ no_call_days: event.target.value === "" ? null : Number(event.target.value) })}
        />
      </label>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <label className={CHECK}>
          <input type="checkbox" checked={Boolean(outcome.escalate)} onChange={(event) => onChange({ escalate: event.target.checked })} />
          ارجاع به مدیر
        </label>
        <label className={CHECK}>
          <input type="checkbox" checked={outcome.is_active} onChange={(event) => onChange({ is_active: event.target.checked })} />
          فعال
        </label>
      </div>
    </section>
  );
}

function FieldEditor({ field, open, tags, usedOptions, onToggle, onChange, onMove, onRemove }: {
  field: FormField;
  open: boolean;
  tags: CallTag[];
  usedOptions: Set<string>;
  onToggle: () => void;
  onChange: (patch: Partial<FormField>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const options = field.options ?? [];
  const hasOptions = field.type === "single" || field.type === "multi";
  const locked = options.some((option) => usedOptions.has(option.id));
  const setOption = (id: string, patch: Record<string, unknown>) =>
    onChange({ options: options.map((option) => (option.id === id ? { ...option, ...patch } : option)) });
  const sub = [fieldTypeLabel(field.type), field.required ? "اجباری" : "", field.creates_followup ? "می‌سازد: پیگیری" : ""].filter(Boolean).join("، ");
  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-center gap-1 pe-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-h-[50px] min-w-0 flex-[1_1_200px] cursor-pointer flex-wrap items-center justify-between gap-x-2.5 gap-y-0.5 border-0 bg-transparent px-3.5 py-1.5 text-right"
        >
          <span className="text-[13.5px] font-semibold text-ink">{field.title || "فیلد بدون عنوان"}</span>
          <span className={MUTED}>{sub}</span>
        </button>
        <Ghost aria-label="بالاتر" onClick={() => onMove(-1)}>▲</Ghost>
        <Ghost aria-label="پایین‌تر" onClick={() => onMove(1)}>▼</Ghost>
        {locked ? null : <Ghost onClick={onRemove}>حذف</Ghost>}
      </div>
      {open ? (
        <div className="flex flex-col gap-3 px-3.5 pb-4 pt-1">
          <label className={LABEL}>
            عنوان فیلد
            <input className={`${INPUT} max-w-[420px]`} value={field.title} onChange={(event) => onChange({ title: event.target.value })} />
          </label>
          {hasOptions ? (
            <div className="flex flex-col gap-2">
              <span className={`text-[13px] ${SOFT}`}>گزینه‌ها و برچسب گزارش</span>
              {options.map((option) => (
                <div key={option.id} className="flex flex-wrap items-center gap-1.5">
                  <input
                    className={`${INPUT} w-auto flex-[1_1_180px]`}
                    aria-label="عنوان گزینه"
                    value={option.title}
                    onChange={(event) => setOption(option.id, { title: event.target.value })}
                  />
                  <TagChips tags={tags} selected={option.tag_ids ?? []} onChange={(ids) => setOption(option.id, { tag_ids: ids })} />
                  {usedOptions.has(option.id) ? (
                    <label className={CHECK}>
                      <input type="checkbox" checked={option.is_active !== false} onChange={(event) => setOption(option.id, { is_active: event.target.checked })} />
                      فعال
                    </label>
                  ) : (
                    <Ghost aria-label="حذف گزینه" onClick={() => onChange({ options: options.filter((row) => row.id !== option.id) })}>حذف</Ghost>
                  )}
                </div>
              ))}
              <Add className="self-start" onClick={() => onChange({ options: [...options, { id: newId(), title: "", is_active: true, tag_ids: [] }] })}>
                افزودن گزینه
              </Add>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <label className={CHECK}>
              <input type="checkbox" checked={Boolean(field.required)} onChange={(event) => onChange({ required: event.target.checked })} />
              اجباری
            </label>
            {field.type === "date" ? (
              <label className={CHECK}>
                <input type="checkbox" checked={Boolean(field.creates_followup)} onChange={(event) => onChange({ creates_followup: event.target.checked })} />
                این تاریخ کار پیگیری بسازد
              </label>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
