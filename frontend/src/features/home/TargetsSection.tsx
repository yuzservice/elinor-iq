import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toFaDigits } from "../../lib/dates";
import { formatCompactToman } from "../../lib/format";
import { homeService } from "../../services/home";
import { LINES, fa, jdate } from "../products/display";
import type { LineStatus, TargetProgress, TargetScope } from "./types";

const CARD = "rounded-[18px] border border-line bg-surface";
const GHOST = "inline-flex min-h-9 cursor-pointer items-center rounded-[10px] border border-line bg-transparent px-3 text-[12.5px] text-muted no-underline hover:text-ink";
const SCOPES: [TargetScope, string][] = [["month", "ماه"], ["quarter", "فصل"], ["year", "سال"]];
const EMPTY_TEXT: Record<TargetScope, string> = { month: "این ماه", quarter: "این فصل", year: "امسال" };
const STATUS: Record<Exclude<LineStatus, null>, { label: string; color: string }> = {
  ahead: { label: "جلوتر از برنامه", color: "var(--delta-up)" },
  on_plan: { label: "طبق برنامه", color: "var(--accent)" },
  behind: { label: "عقب از برنامه", color: "var(--delta-down)" },
};
export const TARGETS_LINK = "/settings#targets";

/** «میلیارد» / «میلیون» without the currency word, as in the reference. */
export function money(value: number | null | undefined) {
  return formatCompactToman(value).replace(" تومان", "");
}

function points(gap: number) {
  return `${gap >= 0 ? "+" : "−"}${toFaDigits(Math.round(Math.abs(gap)))}٪`;
}

export function TargetsSection() {
  const [scope, setScope] = useState<TargetScope>("month");
  const [data, setData] = useState<TargetProgress | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    homeService.targets(scope).then((d) => alive && (setData(d), setError(false))).catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [scope]);

  const d = data?.scope === scope ? data : null;
  const c = d?.company;
  const ahead = (c?.gap ?? 0) >= 0;
  const expected = d ? Math.min(100, d.expected_pct) : 0;
  return (
    <section id="home-targets" aria-label="تارگت" className={`${CARD} flex flex-col gap-4 px-5 py-[18px]`}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-col gap-[3px]">
          <h2 className="m-0 text-[15px] font-semibold text-ink">تارگت فروش</h2>
          <span className="text-[12.5px] text-muted">
            {d ? `${toFaDigits(d.label)}، روز ${fa(d.elapsed_days)} از ${fa(d.total_days)}` : error ? "تارگت بارگیری نشد." : "…"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="بازه تارگت" className="flex gap-0.5 rounded-[11px] bg-elevated p-[3px]">
            {SCOPES.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={scope === key} onClick={() => setScope(key)}
                className={`min-h-8 cursor-pointer rounded-[9px] border-0 px-3 text-[12.5px] ${scope === key ? "bg-accent font-semibold text-on-accent" : "bg-transparent text-muted hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </div>
          {d?.can_edit ? <Link to={TARGETS_LINK} className={GHOST}>تنظیم تارگت‌ها</Link> : null}
        </div>
      </div>

      {d && !c ? (
        <div className="flex flex-col items-start gap-2.5 rounded-[14px] border border-dashed border-blue-300/40 p-[22px]">
          <span className="text-sm font-semibold text-ink">تارگت {EMPTY_TEXT[scope]} هنوز تعریف نشده است.</span>
          <span className="text-[12.5px] text-muted">
            {scope === "month" ? "تارگت هر شعبه را وارد کنید یا از ماه مشابه سال قبل با درصد رشد دلخواه کپی کنید." : "برای همه ماه‌های این بازه تارگت تعریف کنید."}
          </span>
          {d.can_edit ? (
            <Link to={TARGETS_LINK} className="inline-flex min-h-10 items-center rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-on-accent no-underline">
              تعریف تارگت این ماه
            </Link>
          ) : (
            <span className="text-[12.5px] text-muted">تعریف تارگت با مدیر یا ادمین است.</span>
          )}
        </div>
      ) : null}

      {d && c ? (
        <div className="flex flex-wrap items-stretch gap-x-8 gap-y-[22px]">
          <div className="flex min-w-0 flex-[2_1_460px] flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[34px] font-extrabold text-ink">{fa(c.pct)}٪</span>
                <span className="text-[12.5px] text-muted">از {money(c.target)} تومان؛ تا امروز {money(c.actual)}</span>
              </span>
              <span className="rounded-full px-3 py-1 text-[13px] font-semibold"
                style={{ color: ahead ? "var(--delta-up)" : "var(--delta-down)", background: ahead ? "var(--delta-up-bg)" : "var(--delta-down-bg)" }}>
                {ahead ? "جلوتر از برنامه" : "عقب از برنامه"}: {toFaDigits(Math.round(Math.abs(c.gap)))}٪
              </span>
            </div>
            <div className="relative h-4 rounded-lg bg-[var(--chart-track)]">
              <div className="absolute right-0 top-0 h-4 rounded-lg" style={{ width: `${Math.min(100, c.pct)}%`, background: ahead ? "var(--delta-up)" : "var(--warning)" }} />
              <div title="جایی که باید تا امروز می‌رسیدیم" className="absolute -top-1 h-6 w-0.5 bg-ink" style={{ right: `calc(${expected}% - 1px)` }} />
            </div>
            <div className="flex flex-wrap justify-between gap-1 text-[12.5px] text-muted">
              <span>{fa(d.expected_pct)}٪ از زمان گذشته است</span>
              <span>خط عمودی: جایی که باید تا امروز می‌رسیدیم</span>
            </div>
            {c.lines_included.length < LINES.length ? (
              <span className="text-xs text-muted">
                فقط شعبه‌های دارای تارگت جمع شده‌اند: {c.lines_included.map((key) => LINES.find((l) => l.key === key)?.label).join("، ")}
              </span>
            ) : null}
            <div className="grid gap-3 border-t border-line pt-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
              <div className="flex flex-col gap-[3px]" title="اگر بقیه دوره با همین سرعت بفروشیم، دوره با این عدد تمام می‌شود.">
                <span className="text-[12.5px] text-muted">پیش‌بینی پایان دوره</span>
                <span className="text-lg font-bold text-ink">{fa((c.forecast * 100) / c.target)}٪ تارگت</span>
                <span className="text-xs text-muted">حدود {money(c.forecast)} تومان با سرعت فعلی</span>
              </div>
              <div className="flex flex-col gap-[3px]" title="برای رسیدن به تارگت، در هر روز باقی‌مانده باید این مقدار بفروشیم.">
                <span className="text-[12.5px] text-muted">فروش لازم روزانه</span>
                <span className="text-lg font-bold text-ink">{c.required_daily == null ? "—" : `${money(c.required_daily)} تومان`}</span>
                <span className="text-xs text-muted">میانگین فعلی: {money(c.avg_daily)} در روز</span>
              </div>
              <div className="flex flex-col gap-[3px]">
                <span className="text-[12.5px] text-muted">روزهای باقی‌مانده</span>
                <span className="text-lg font-bold text-ink">{fa(d.remaining_days)} روز</span>
                <span className="text-xs text-muted">تا {jdate(d.end)}</span>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5">
            <span className="text-[13px] font-semibold text-muted">شعب</span>
            {LINES.map((line) => {
              const row = d.lines.find((r) => r.line === line.key);
              const status = row?.status ? STATUS[row.status] : null;
              return (
                <div key={line.key} className="flex flex-col gap-[5px]">
                  <div className="flex justify-between text-[13px]">
                    <span className="flex items-center gap-[7px]"><span className="h-2 w-2 rounded-full" style={{ background: line.color }} />{line.label}</span>
                    {row?.target ? (
                      <span><b>{fa(row.pct)}٪</b> <span className="text-[12.5px] text-muted">از {money(row.target)}</span></span>
                    ) : (
                      <span className="text-[12.5px] text-muted">تارگت ندارد</span>
                    )}
                  </div>
                  <div className="relative h-2 rounded bg-[var(--chart-track)]">
                    {row?.target ? (
                      <>
                        <div className="absolute right-0 top-0 h-2 rounded" style={{ width: `${Math.min(100, row.pct ?? 0)}%`, background: line.color }} />
                        <div className="absolute -top-[3px] h-3.5 w-0.5 bg-ink" style={{ right: `calc(${expected}% - 1px)` }} />
                      </>
                    ) : null}
                  </div>
                  {status && row?.gap != null ? <span className="text-xs" style={{ color: status.color }}>{status.label} ({points(row.gap)})</span> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
