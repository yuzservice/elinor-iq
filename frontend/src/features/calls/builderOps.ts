import type { FieldType, FormField, FormOutcome, FormSchema } from "./types";

export const FIELD_PALETTE: { type: FieldType; label: string }[] = [
  { type: "single", label: "تک‌انتخابی" },
  { type: "multi", label: "چندانتخابی" },
  { type: "toggle", label: "تیک روشن/خاموش" },
  { type: "text", label: "متن کوتاه" },
  { type: "long_text", label: "متن بلند" },
  { type: "number", label: "عدد" },
  { type: "rating", label: "امتیاز ۱ تا ۵" },
  { type: "date", label: "تاریخ" },
  { type: "time", label: "ساعت" },
];

export const AFTER_SAVE_LABELS = [
  { value: "close", label: "پایان در این برنامه" },
  { value: "retry", label: "تلاش مجدد" },
  { value: "dnc", label: "خروج از همه صف‌ها" },
] as const;

export function fieldTypeLabel(type: FieldType) {
  return FIELD_PALETTE.find((item) => item.type === type)?.label ?? type;
}

// randomUUID needs a secure context; the panel can also run on plain http.
export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newOutcome(): FormOutcome {
  return {
    id: newId(),
    title: "نتیجه جدید",
    is_active: true,
    connected: false,
    after_save: "close",
    retry_times: 2,
    retry_gap: 1,
    retry_unit: "day",
    no_call_days: null,
    escalate: false,
    tag_ids: [],
    fields: [],
  };
}

export function newField(type: FieldType): FormField {
  const hasOptions = type === "single" || type === "multi";
  return {
    id: newId(),
    type,
    title: "",
    required: false,
    creates_followup: false,
    options: hasOptions ? [{ id: newId(), title: "", is_active: true, tag_ids: [] }] : [],
  };
}

export function move<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function outcomeSubtitle(outcome: FormOutcome): string {
  const parts = [outcome.fields.length ? `${outcome.fields.length} فیلد` : outcome.connected ? "فقط یادداشت" : "یک کلیکی"];
  if (outcome.after_save === "retry") parts.push(`${outcome.retry_times ?? 0} تلاش مجدد`);
  if (outcome.after_save === "dnc") parts.push("خروج از همه صف‌ها");
  if (!outcome.is_active) parts.push("غیرفعال");
  return parts.join("، ");
}

export const emptySchema = (): FormSchema => ({ outcomes: [] });
