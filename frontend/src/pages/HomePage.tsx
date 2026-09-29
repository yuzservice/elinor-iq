import { useMemo, useState } from "react";
import { Panel } from "../components/ui";
import {
  ChangePill,
  ChannelMix,
  HomePeriodToggle,
  MetricCardIcons,
  MetricSquareCard,
  PeriodToggle,
  PillGroup,
  RevenueChart,
} from "../components/dashboard";
import { ErrorState, Skeleton } from "../components/Table";
import { useApi } from "../hooks/useApi";
import { formatCompactToman, formatToman, shiftTehranIsoDate, toInputDate } from "../lib/format";
import { homeService } from "../services/home";
import { salesService, type SalesLineFilter } from "../services/sales";
import type { HomePeriod } from "../types";

const SALES_LINES: { value: SalesLineFilter; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "ONLINE", label: "آنلاین" },
  { value: "SARI", label: "ساری" },
  { value: "GORGAN", label: "گرگان" },
  { value: "CAPRI", label: "کاپری" },
];

const TREND_DAILY_DAYS = 7;
const TREND_MONTHLY_MONTHS = 12;

export function HomePage() {
  const [period, setPeriod] = useState<HomePeriod>("month");
  const [salesLine, setSalesLine] = useState<SalesLineFilter>("all");
  const [group, setGroup] = useState<"daily" | "monthly">("monthly");
  const { data, loading, error } = useApi(() => homeService.summary(period), [period]);
  const trendRange = useMemo(() => {
    if (!data) return { from: "", to: "" };
    const to = data.window.to || toInputDate(data.window.end);
    if (!to) return { from: "", to: "" };
    if (group === "monthly") {
      return { from: shiftTehranIsoDate(to, -(TREND_MONTHLY_MONTHS * 31)), to };
    }
    return { from: shiftTehranIsoDate(to, -(TREND_DAILY_DAYS - 1)), to };
  }, [data, group]);
  const trend = useApi(
    () => salesService.summary(trendRange.from, trendRange.to, salesLine, group, "trend"),
    [trendRange.from, trendRange.to, salesLine, group],
    Boolean(trendRange.from && trendRange.to),
  );

  const allPoints = trend.data?.trend?.points || [];
  const points = useMemo(() => {
    if (group === "monthly") return allPoints.slice(-TREND_MONTHLY_MONTHS);
    return allPoints.slice(-TREND_DAILY_DAYS);
  }, [allPoints, group]);
  const cards = [...(data?.metric_cards || [])].sort((a, b) => Number(b.key === "sales_amount") - Number(a.key === "sales_amount"));
  const salesAmountCard = cards.find((card) => card.key === "sales_amount");
  const trendAmountTotal = trend.error ? null : points.reduce((sum, point) => sum + (point.amount || 0), 0);

  if (error && !data) return <ErrorState />;

  return (
    <div className="dash-stage space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            هوش فروش
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">خلاصه فروش</h1>
          {data?.window.label ? <p className="mt-1 text-sm text-muted">{data.window.label}</p> : null}
        </div>
        <HomePeriodToggle value={period} onChange={setPeriod} />
      </div>

      {data?.data_coverage?.partial && data.data_coverage.message ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink">
          {data.data_coverage.message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-6">
        {loading && !cards.length ? (
          <>
            <Skeleton className="min-h-[240px] rounded-[24px] lg:col-span-6" />
            <Skeleton className="min-h-[220px] rounded-[24px] lg:col-span-2" />
            <Skeleton className="min-h-[220px] rounded-[24px] lg:col-span-2" />
            <Skeleton className="min-h-[220px] rounded-[24px] lg:col-span-2" />
          </>
        ) : (
          cards.map((card, index) => (
            <div
              key={card.key}
              className={`dash-rise h-full ${card.key === "sales_amount" ? "lg:col-span-6" : "lg:col-span-2"}`}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <MetricSquareCard
                card={card}
                featured={card.key === "sales_amount"}
                icon={<MetricCardIcons name={card.kind} />}
              />
            </div>
          ))
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="dash-rise h-full xl:col-span-8" style={{ animationDelay: "280ms" }}>
        <Panel className="h-full">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">بینش فروش</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="tabular text-[32px] font-semibold leading-none tracking-tight text-ink">
                  {trendAmountTotal == null ? "—" : formatCompactToman(trendAmountTotal)}
                </div>
                <ChangePill value={salesAmountCard?.change_pct ?? null} />
              </div>
              {trendAmountTotal != null ? (
                <p className="mt-2 text-[13px] tabular text-muted">{formatToman(trendAmountTotal)}</p>
              ) : null}
            </div>
            <PeriodToggle
              label="گروه‌بندی روند"
              value={group}
              onChange={setGroup}
              options={[
                { value: "daily", label: "روزانه" },
                { value: "monthly", label: "ماهانه" },
              ]}
            />
          </div>
          <div className="mt-4">
            <PillGroup label="خط فروش" value={salesLine} onChange={setSalesLine} options={SALES_LINES} />
          </div>
          <div className="mt-5">
            {trend.loading && !points.length ? (
              <Skeleton className="h-[300px]" />
            ) : trend.error ? (
              <ErrorState />
            ) : (
              <RevenueChart points={points} metric="amount" />
            )}
          </div>
        </Panel>
        </div>

        <div className="dash-rise h-full xl:col-span-4" style={{ animationDelay: "360ms" }}>
        <Panel className="h-full">
          <h2 className="text-base font-semibold text-ink">ترکیب کانال‌ها</h2>
          <p className="mt-1 text-[13px] text-muted">سهم هر خط از مبلغ فروش همین بازه</p>
          <div className="mt-4">
            <ChannelMix lines={salesAmountCard?.lines || []} formatValue={formatToman} />
          </div>
        </Panel>
        </div>
      </div>
    </div>
  );
}
