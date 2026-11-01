import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi";
import { callsService } from "../../services/calls";
import type { CallSettings, CallTag } from "./types";
import { Add, CARD, H, INPUT, MUTED, SOFT } from "./ui";

const RULES: { key: keyof CallSettings; title: string; help: string; unit: string }[] = [
  { key: "buy_window_days", title: "پنجره سنجش خرید", help: "خرید تا چند روز بعد از تماس در گزارش فروش حساب شود.", unit: "روز" },
  { key: "default_gap_days", title: "فاصله بین دو تماس موفق", help: "مشتری بعد از تماس موفق تا این مدت در هیچ برنامه‌ای نمی‌آید.", unit: "روز" },
  { key: "note_min_chars", title: "حداقل طول یادداشت اجباری", help: "برای جلوگیری از یادداشت‌های بی‌معنی.", unit: "حرف" },
];
const COLORS = ["#34d399", "#fb7185", "#fbbf24", "#60a5fa", "#a78bfa", "#94a3b8"];
const CHECK = `inline-flex min-h-9 items-center gap-2 text-[13px] ${SOFT}`;

export function SettingsPanel() {
  const settings = useApi(() => callsService.settings(), []);
  const [tags, setTags] = useState<CallTag[]>([]);
  const loaded = useApi(() => callsService.tags(), []);
  useEffect(() => {
    if (loaded.data) setTags(loaded.data.results);
  }, [loaded.data]);

  const saveTag = async (tag: CallTag, patch: Partial<CallTag>) => {
    setTags((prev) => prev.map((row) => (row.id === tag.id ? { ...row, ...patch } : row)));
    await callsService.updateTag(tag.id, patch);
  };
  const addTag = async () => {
    const row = await callsService.createTag({ title: "برچسب جدید" });
    setTags((prev) => [...prev, row]);
  };

  return (
    <div className="flex flex-col gap-4">
      <section className={`${CARD} px-[18px] py-1.5`}>
        {settings.data
          ? RULES.map((rule) => (
              <label key={rule.key} className="flex min-h-16 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-black/[0.06] py-2 last:border-0 dark:border-white/[0.06]">
                <span className="flex flex-[1_1_280px] flex-col gap-0.5">
                  <span className="text-[13.5px] text-ink">{rule.title}</span>
                  <span className={MUTED}>{rule.help}</span>
                </span>
                <span className={`flex items-center gap-1.5 ${MUTED}`}>
                  <input
                    className={`${INPUT} w-[90px]`}
                    type="number"
                    min={0}
                    defaultValue={settings.data?.[rule.key]}
                    onBlur={(event) => callsService.saveSettings({ [rule.key]: Number(event.target.value) })}
                  />
                  {rule.unit}
                </span>
              </label>
            ))
          : <p className={MUTED}>در حال دریافت اطلاعات...</p>}
      </section>
      <section className="flex flex-col gap-2">
        <div className="flex flex-col gap-[3px]">
          <h2 className={`${H} text-[15px]`}>برچسب‌ها</h2>
          <span className={MUTED}>در همه برنامه‌ها مشترک است. برچسب «نیاز به اقدام» خودکار یک کارت در گزارش می‌سازد.</span>
        </div>
        {tags.map((tag) => (
          <div key={tag.id} className={`${CARD} flex flex-wrap items-center gap-x-[18px] gap-y-2 px-3.5 py-2.5`}>
            <input
              className={`${INPUT} w-auto max-w-[260px] flex-[1_1_180px]`}
              aria-label="عنوان برچسب"
              value={tag.title}
              onChange={(event) => setTags((prev) => prev.map((row) => (row.id === tag.id ? { ...row, title: event.target.value } : row)))}
              onBlur={(event) => event.target.value.trim() && saveTag(tag, { title: event.target.value.trim() })}
            />
            <span className="flex items-center gap-1.5">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`رنگ ${color}`}
                  aria-pressed={tag.color === color}
                  onClick={() => saveTag(tag, { color })}
                  className={`h-[26px] w-[26px] cursor-pointer rounded-full border-2 ${tag.color === color ? "border-ink" : "border-transparent"}`}
                  style={{ background: color }}
                />
              ))}
            </span>
            <label className={CHECK}><input type="checkbox" checked={tag.needs_action} onChange={(event) => saveTag(tag, { needs_action: event.target.checked })} />نیاز به اقدام</label>
            <label className={CHECK}><input type="checkbox" checked={tag.open_until_purchase} onChange={(event) => saveTag(tag, { open_until_purchase: event.target.checked })} />تا خرید باز بماند</label>
            <label className={CHECK}><input type="checkbox" checked={tag.is_active} onChange={(event) => saveTag(tag, { is_active: event.target.checked })} />فعال</label>
          </div>
        ))}
        <Add className="self-start" onClick={addTag}>افزودن برچسب</Add>
      </section>
    </div>
  );
}
