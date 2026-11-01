import { formatNumber } from "../../lib/format";
import type { AnswerEntry, Answers, FormField, FormOutcome } from "./types";

export function isEmpty(field: FormField, value: unknown): boolean {
  if (field.type === "toggle") return false;
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null || String(value).trim() === "";
}

/** One-click outcomes save as soon as they are picked. */
export function isOneClick(outcome: FormOutcome): boolean {
  return !outcome.connected && outcome.fields.length === 0;
}

export function saveCheck(outcome: FormOutcome | null, answers: Answers, note: string, noteMin: number): { ok: boolean; hint: string } {
  if (!outcome) return { ok: false, hint: "" };
  const missing = outcome.fields.filter((field) => field.required && isEmpty(field, answers[field.id]));
  if (missing.length) return { ok: false, hint: `لازم است: ${missing.map((field) => field.title).join("، ")}` };
  const length = note.trim().length;
  if (outcome.connected && length < noteMin) {
    return { ok: false, hint: `یادداشت حداقل ${formatNumber(noteMin)} حرف (الان ${formatNumber(length)})` };
  }
  return { ok: true, hint: "آماده ثبت" };
}

export function toggleOption(current: unknown, id: string): string[] {
  const selected = Array.isArray(current) ? (current as string[]) : [];
  return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
}

export function activeOptions(field: FormField) {
  return (field.options ?? []).filter((option) => option.is_active !== false);
}

/** Days between today and the due date, in Tehran calendar days. */
export function dueLabel(dueAt: string, now = new Date()): { text: string; overdue: boolean } {
  const day = (value: Date) => {
    const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(value).split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  const diff = day(new Date(dueAt)) - day(now);
  if (diff === 0) return { text: "امروز", overdue: false };
  if (diff < 0) return { text: `${formatNumber(-diff)} روز تأخیر`, overdue: true };
  return { text: `${formatNumber(diff)} روز دیگر`, overdue: false };
}

export function answerSummary(answers: Record<string, AnswerEntry>): string {
  return Object.values(answers)
    .map((entry) => {
      if (entry.labels?.length) return `${entry.title}: ${entry.labels.join("، ")}`;
      if (entry.type === "toggle") return `${entry.title}: ${entry.value ? "بله" : "خیر"}`;
      return `${entry.title}: ${typeof entry.value === "number" ? formatNumber(entry.value) : String(entry.value)}`;
    })
    .join("؛ ");
}

/** Raw answer values from a stored snapshot, for editing a log. */
export function rawAnswers(answers: Record<string, AnswerEntry>): Answers {
  return Object.fromEntries(Object.entries(answers).map(([id, entry]) => [id, entry.value]));
}
