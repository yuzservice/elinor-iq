import { useState } from "react";
import { useApi } from "../../hooks/useApi";
import { pulseService } from "../../services/pulse";
import { bandColor, fa, percent, scoreBand } from "./format";
import { CARD, Chip, FAINT, SectionTitle } from "./ui";

const WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

export function HoursTab() {
  const [group, setGroup] = useState<"reel" | "all">("reel");
  const { data, loading, error } = useApi(() => pulseService.hours(group), [group]);
  if (error) return <div className="py-8 text-center text-[13px] text-muted">ساعت طلایی بارگذاری نشد.</div>;
  if (loading || !data) return <div className="h-64 animate-pulse rounded-[18px] bg-elevated" />;
  const head = data.headline;
  const hours = data.cells.length ? data.cells.map((cell) => cell.hour) : [12];
  const range = Array.from({ length: Math.max(...hours) - Math.min(...hours) + 1 }, (_, i) => Math.min(...hours) + i);
  const cell = (weekday: number, hour: number) => data.cells.find((item) => item.weekday === weekday && item.hour === hour);
  const subject = group === "reel" ? "ریل‌های" : "پست‌های";
  return (
    <div>
      <div className={CARD} style={{ background: "linear-gradient(160deg,var(--pulse-soft),transparent 70%),var(--surface)" }}>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--pulse)] text-[13px] text-[var(--pulse-ink)]">✦</span> نتیجه
        </div>
        <p className="mb-0 mt-2 text-[14.5px] leading-8">
          {head.noon_vs_night_pct != null ? (
            <>
              {subject} ظهر (۱۱ تا ۱۴) حدود{" "}
              <b className="text-[var(--pulse-strong)]">
                {percent(Math.abs(head.noon_vs_night_pct))} {head.noon_vs_night_pct >= 0 ? "بیشتر" : "کمتر"}
              </b>{" "}
              از شب (۱۸ تا ۲۳) دیده شده‌اند، و {fa(head.night_posts)} از {fa(head.posts)} شب منتشر شده‌اند.{" "}
            </>
          ) : (
            "برای مقایسه‌ی ظهر و شب هنوز پست کافی نیست. "
          )}
          {head.best_weekday ? (
            <>
              بهترین روز <b className="text-[var(--pulse-strong)]">{head.best_weekday}</b>، ضعیف‌ترین {head.worst_weekday}.
            </>
          ) : null}
        </p>
      </div>
      <div className="mt-3.5 flex gap-1.5">
        <Chip on={group === "reel"} onClick={() => setGroup("reel")}>
          فقط ریل
        </Chip>
        <Chip on={group === "all"} onClick={() => setGroup("all")}>
          همه‌ی پست‌ها
        </Chip>
      </div>
      <div className={`${CARD} mt-2.5 overflow-x-auto px-2.5 py-3`}>
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `48px repeat(${range.length}, minmax(14px, 1fr))` }}>
          <span />
          {range.map((hour) => (
            <span key={hour} className={`grid place-items-center text-[10px] ${FAINT}`}>
              {fa(hour)}
            </span>
          ))}
          {WEEKDAYS.map((day, weekday) => [
            <span key={`d${weekday}`} className={`grid items-center text-[10px] ${FAINT}`}>
              {day}
            </span>,
            ...range.map((hour) => {
              const item = cell(weekday, hour);
              if (!item) return <span key={`${weekday}-${hour}`} className="aspect-square rounded-[5px] bg-[var(--chart-track)] opacity-40" />;
              return (
                <span
                  key={`${weekday}-${hour}`}
                  title={`${day} ساعت ${fa(hour)}: ${fa(item.posts)} پست، امتیاز ${fa(item.score, 1)}`}
                  className="grid aspect-square place-items-center rounded-[5px] text-[9px] font-bold text-white"
                  style={{ background: bandColor(item.band), opacity: item.faded ? 0.35 : 1 }}
                >
                  {item.faded ? "" : fa(item.posts)}
                </span>
              );
            }),
          ])}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2.5 text-[10.5px] text-muted">
          {(
            [
              ["great", "۱٫۵× به بالا"],
              ["good", "۱ تا ۱٫۵"],
              ["mid", "۰٫۷ تا ۱"],
              ["bad", "زیر ۰٫۷"],
            ] as const
          ).map(([band, label]) => (
            <span key={band}>
              <i className="me-1 inline-block h-2.5 w-2.5 rounded-[3px] align-[-1px]" style={{ background: bandColor(band) }} />
              {label}
            </span>
          ))}
          <span>
            <i className="me-1 inline-block h-2.5 w-2.5 rounded-[3px] align-[-1px] opacity-35" style={{ background: "var(--s-mid)" }} />
            کمتر از ۳ پست (کم‌اعتبار)
          </span>
        </div>
        <div className={`mt-1.5 text-[10.5px] ${FAINT}`}>عدد داخل خانه = تعداد پست. رنگ = میانه‌ی امتیاز پست‌ها نسبت به میانه‌ی نوع خودشان.</div>
      </div>
      <SectionTitle>روزهای هفته</SectionTitle>
      <div className={`${CARD} px-3.5 pb-3.5 pt-1.5`}>
        {data.weekdays.map((day) => (
          <div key={day.weekday} className="mt-2.5 grid grid-cols-[90px_1fr_70px] items-center gap-2.5 text-xs">
            <span className="text-muted">{day.label}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--chart-track)]">
              <i className="block h-full rounded-full" style={{ width: `${Math.min(100, ((day.score ?? 0) / 2) * 100)}%`, background: bandColor(scoreBand(day.score)) }} />
            </div>
            <span>
              {day.score != null ? `${fa(day.score, 2)}×` : "—"} <span className={`text-[10px] ${FAINT}`}>({fa(day.posts)})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
