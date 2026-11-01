import { describe, expect, it } from "vitest";
import { answerSummary, dueLabel, isOneClick, needsDncConfirm, rawAnswers, saveCheck, toggleOption } from "./callForm";
import type { FormOutcome } from "./types";

const outcome = (patch: Partial<FormOutcome> = {}): FormOutcome => ({
  id: "o",
  title: "نتیجه",
  is_active: true,
  connected: false,
  after_save: "close",
  fields: [],
  ...patch,
});

describe("call form", () => {
  it("treats a not-connected outcome without fields as one click", () => {
    expect(isOneClick(outcome())).toBe(true);
    expect(isOneClick(outcome({ connected: true }))).toBe(false);
    expect(isOneClick(outcome({ fields: [{ id: "f", type: "text", title: "ت" }] }))).toBe(false);
  });

  it("asks for confirmation on dnc outcomes only", () => {
    expect(needsDncConfirm(outcome({ after_save: "dnc" }))).toBe(true);
    expect(needsDncConfirm(outcome({ after_save: "retry" }))).toBe(false);
  });

  it("requires required fields, then the note for connected calls", () => {
    const form = outcome({ connected: true, fields: [{ id: "cat", type: "multi", title: "دسته", required: true }, { id: "ok", type: "toggle", title: "تیک", required: true }] });
    expect(saveCheck(form, {}, "", 20)).toEqual({ ok: false, hint: "لازم است: دسته" });
    expect(saveCheck(form, { cat: [] }, "", 20).ok).toBe(false);
    expect(saveCheck(form, { cat: ["x"] }, "کوتاه", 20)).toEqual({ ok: false, hint: "یادداشت حداقل ۲۰ حرف (الان ۵)" });
    expect(saveCheck(form, { cat: ["x"] }, "این یادداشت به اندازه کافی بلند است", 20)).toEqual({ ok: true, hint: "آماده ثبت" });
    expect(saveCheck(null, {}, "", 20).ok).toBe(false);
  });

  it("does not require a note when not connected", () => {
    expect(saveCheck(outcome({ fields: [{ id: "f", type: "text", title: "ت" }] }), {}, "", 20).ok).toBe(true);
  });

  it("toggles multi options", () => {
    expect(toggleOption(undefined, "a")).toEqual(["a"]);
    expect(toggleOption(["a", "b"], "a")).toEqual(["b"]);
  });

  it("labels due dates in Tehran calendar days", () => {
    const now = new Date("2026-11-02T08:00:00Z");
    expect(dueLabel("2026-11-02T21:00:00Z", now).text).toBe("۱ روز دیگر"); // past midnight in Tehran
    expect(dueLabel("2026-11-02T10:00:00Z", now)).toEqual({ text: "امروز", overdue: false });
    expect(dueLabel("2026-10-30T10:00:00Z", now)).toEqual({ text: "۳ روز تأخیر", overdue: true });
  });

  it("summarizes stored answers and restores raw values", () => {
    const stored = {
      a: { type: "single" as const, title: "دسته", value: "x", labels: ["مانتو"] },
      b: { type: "toggle" as const, title: "معرفی", value: true },
      c: { type: "rating" as const, title: "امتیاز", value: 4 },
    };
    expect(answerSummary(stored)).toBe("دسته: مانتو؛ معرفی: بله؛ امتیاز: ۴");
    expect(rawAnswers(stored)).toEqual({ a: "x", b: true, c: 4 });
  });
});

describe("form builder helpers", () => {
  it("moves items within bounds and adds options only to choice fields", async () => {
    const { move, newField, newOutcome, outcomeSubtitle } = await import("./builderOps");
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2], 1, 1)).toEqual([1, 2]);
    expect(newField("single").options).toHaveLength(1);
    expect(newField("rating").options).toHaveLength(0);
    expect(outcomeSubtitle(newOutcome())).toBe("یک کلیکی");
    expect(outcomeSubtitle({ ...newOutcome(), connected: true, after_save: "retry", retry_times: 3 })).toBe("فقط یادداشت، ۳ تلاش مجدد");
  });
});
