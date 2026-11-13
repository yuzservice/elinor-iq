import { useEffect, useState } from "react";
import { toFaDigits } from "../../lib/dates";
import { homeService } from "../../services/home";
import { fa, jdate } from "../products/display";
import { money } from "./TargetsSection";
import type { BusiestHours } from "./types";

const CARD = "rounded-[18px] border border-line bg-surface";
/** Hours 8..23, as the reference: the shop is shut outside them, so empty columns would only add noise. */
const HOURS = Array.from({ length: 16 }, (_, index) => index + 8);

const hourText = (hour: number) => toFaDigits(String(hour).padStart(2, "0"));
export const peakText = (peak: BusiestHours["peak"]) =>
  peak ? `اوج: ${peak.day} ساعت ${hourText(peak.hour)} تا ${hourText(peak.hour + 1)}` : "—";

/** Cell shade: the strongest cell is full accent, an empty one almost transparent (same ramp in light and dark). */
export function cellAlpha(value: number, max: number) {
  return max > 0 ? 0.06 + (value / max) * 0.94 : 0.06;
}

/** `null` when there is nothing to show at all, so the section can say «—» instead of drawing an empty grid. */
export function maxCell(data: BusiestHours) {
  const values = data.rows.flatMap((row) => row.cells.map((cell) => cell.avg_sales));
  return values.length ? Math.max(...values) : 0;
}

/** «شلوغ‌ترین ساعت‌ها»: its own lazy request (cached 10 min on the server), so it never delays the page. */
export function BusiestHoursSection({ params }: { params: Record<string, string | undefined> }) {
  const [data, setData] = useState<BusiestHours | null>(null);
  const [error, setError] = useState(false);
  const key = JSON.stringify(params);
  useEffect(() => {
    let alive = true;
    setError(false);
    homeService
      .busiestHours(params)
      .then((next) => alive && setData(next))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (error) {
    return (
      <section aria-label="شلوغ‌ترین ساعت‌ها" className={`${CARD} flex flex-col gap-3 px-[18px] py-4`}>
        <h2 className="m-0 text-[15px] font-bold text-ink">شلوغ‌ترین ساعت‌ها</h2>
        <p className="m-0 text-[13px] text-[var(--delta-down)]">این بخش بارگیری نشد. دوباره تلاش کنید.</p>
      </section>
    );
  }
  if (!data) return <div className={`${CARD} h-[260px] animate-pulse`} />;

  const max = maxCell(data);
  const selected = data.range.is_selected_range;
  const windowText = selected
    ? `${jdate(data.range.from)} تا ${jdate(new Date(Date.parse(data.range.to) - 1).toISOString())}`
    : "۸ هفته اخیر";
  const note = selected
    ? "بر اساس بازه انتخاب‌شده"
    : "برای بازه‌های کوتاه‌تر از ۴ هفته، ۸ هفته اخیر حساب می‌شود تا الگو قابل اعتماد باشد";

  return (
    <section aria-label="شلوغ‌ترین ساعت‌ها" className={`${CARD} flex flex-col gap-3 px-[18px] py-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-col gap-[3px]">
          <h2 className="m-0 text-[15px] font-bold text-ink">شلوغ‌ترین ساعت‌ها</h2>
          <span className="text-[12.5px] text-muted">میانگین فروش هر ساعت؛ {windowText}</span>
        </div>
        <span className="rounded-full bg-accent/15 px-3 py-[5px] text-[12.5px] font-semibold text-accent">{peakText(data.peak)}</span>
      </div>
      {max > 0 ? (
        <div className="overflow-x-auto">
          <div role="table" aria-label="فروش به تفکیک روز هفته و ساعت"
            className="grid min-w-[560px] gap-[3px] [grid-template-columns:62px_repeat(16,minmax(26px,1fr))]">
            <span />
            {HOURS.map((hour) => (
              <span key={hour} className="text-center text-[10.5px] text-faint">{hourText(hour)}</span>
            ))}
            {data.rows.map((row) => (
              <Row key={row.weekday} row={row} max={max} peak={data.peak} />
            ))}
          </div>
        </div>
      ) : (
        <p className="m-0 text-[13px] text-muted">—</p>
      )}
      <div className="flex items-center justify-between gap-2 text-[11.5px] text-faint">
        <span>{note}</span>
        <span className="flex items-center gap-1.5">
          کم
          <span className="h-2 w-[90px] rounded" style={{ background: "linear-gradient(270deg, var(--accent), rgba(59,130,246,.08))" }} />
          زیاد
        </span>
      </div>
    </section>
  );
}

function Row({ row, max, peak }: { row: BusiestHours["rows"][number]; max: number; peak: BusiestHours["peak"] }) {
  return (
    <>
      <span className="self-center text-[12px] text-ink">{row.day}</span>
      {row.cells.map((cell) => {
        const isPeak = peak?.weekday === row.weekday && peak?.hour === cell.hour;
        return (
          <span key={cell.hour} role="cell"
            title={`${row.day}، ساعت ${hourText(cell.hour)} تا ${hourText(cell.hour + 1)}: میانگین ${cell.avg_sales > 0 ? `${money(cell.avg_sales)} تومان` : `${fa(0)} تومان`}`}
            className="h-[26px] rounded-[5px]"
            style={{
              background: `color-mix(in srgb, var(--accent) ${Math.round(cellAlpha(cell.avg_sales, max) * 100)}%, transparent)`,
              outline: isPeak ? "2px solid var(--ink)" : undefined,
              outlineOffset: isPeak ? "-2px" : undefined,
            }} />
        );
      })}
    </>
  );
}
