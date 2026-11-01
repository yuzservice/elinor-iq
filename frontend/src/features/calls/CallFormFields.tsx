import { JalaliDateField } from "../../components/JalaliDatePicker";
import { formatNumber } from "../../lib/format";
import { activeOptions, toggleOption } from "./callForm";
import type { Answers, FormField } from "./types";
import { Chip, H, INPUT, SOFT } from "./ui";

export function CallField({ field, answers, onChange }: { field: FormField; answers: Answers; onChange: (id: string, value: unknown) => void }) {
  const value = answers[field.id];
  const title = `${field.title}${field.required && field.type !== "toggle" ? " (اجباری)" : ""}`;
  if (field.type === "toggle") {
    return (
      <label className={`inline-flex min-h-9 items-center gap-2 text-[13px] ${SOFT}`}>
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(field.id, event.target.checked)} />
        {field.title}
      </label>
    );
  }
  const text = value == null ? "" : String(value);
  return (
    <div className="flex flex-col gap-[7px]">
      <h3 className={H}>{title}</h3>
      {field.type === "single" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeOptions(field).map((option) => (
            <Chip key={option.id} on={value === option.id} onClick={() => onChange(field.id, value === option.id ? "" : option.id)}>
              {option.title}
            </Chip>
          ))}
        </div>
      ) : null}
      {field.type === "multi" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeOptions(field).map((option) => (
            <Chip
              key={option.id}
              on={Array.isArray(value) && value.includes(option.id)}
              onClick={() => onChange(field.id, toggleOption(value, option.id))}
            >
              {option.title}
            </Chip>
          ))}
        </div>
      ) : null}
      {field.type === "rating" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((rate) => (
            <Chip key={rate} on={value === rate} aria-label={`امتیاز ${rate}`} onClick={() => onChange(field.id, value === rate ? "" : rate)}>
              {formatNumber(rate)}
            </Chip>
          ))}
        </div>
      ) : null}
      {field.type === "text" ? (
        <input className={INPUT} aria-label={field.title} value={text} onChange={(event) => onChange(field.id, event.target.value)} />
      ) : null}
      {field.type === "long_text" ? (
        <textarea className={`${INPUT} pt-2`} rows={2} aria-label={field.title} value={text} onChange={(event) => onChange(field.id, event.target.value)} />
      ) : null}
      {field.type === "number" ? (
        <input className={INPUT} type="number" aria-label={field.title} value={text} onChange={(event) => onChange(field.id, event.target.value)} />
      ) : null}
      {field.type === "time" ? (
        <input className={INPUT} type="time" dir="ltr" aria-label={field.title} value={text} onChange={(event) => onChange(field.id, event.target.value)} />
      ) : null}
      {field.type === "date" ? <JalaliDateField value={text} onChange={(iso) => onChange(field.id, iso)} allowEmpty emptyLabel="انتخاب تاریخ" /> : null}
    </div>
  );
}
