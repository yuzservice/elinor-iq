import { useMemo, useState } from "react";
import { Panel } from "../components/ui";
import {
  ChangePill,
  HomePeriodToggle,
  MetricCardIcons,
  MetricSquareCard,
  PeriodToggle,
  PillGroup,
  RevenueChart,
  SalesGauge,
} from "../components/dashboard";
import { ErrorState, Skeleton } from "../components/Table";
import { useApi } from "../hooks/useApi";
import { formatToman, shiftTehranIsoDate, toInputDate } from "../lib/format";
import { homeService } from "../services/home";
import { salesService, type SalesLineFilter } from "../services/sales";
import type { HomePeriod, HomeSummary } from "../types";

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
  const gauge = buildGauge(data?.metric_cards || []);
  const salesAmountCard = data?.metric_cards?.find((card) => card.key === "sales_amount");
  const trendAmountTotal = trend.error ? null : points.reduce((sum, point) => sum + (point.amount || 0), 0);

  if (error && !data) return <ErrorState />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-ink">خلاصه فروش</h1>
          {data?.window.label ? <p className="mt-1 text-[13px] text-muted">{data.window.label}</p> : null}
        </div>
        <HomePeriodToggle value={period} onChange={setPeriod} />
      </div>

      {data?.data_coverage?.partial && data.data_coverage.message ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-6 text-amber-950">
          {data.data_coverage.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {loading && !data?.metric_cards?.length
          ? [0, 1, 2, 3].map((item) => <Skeleton key={item} className="min-h-[280px] rounded-[24px]" />)
          : (data?.metric_cards || []).map((card) => (
              <MetricSquareCard key={card.key} card={card} icon={<MetricCardIcons name={card.kind} />} />
            ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.62fr_0.88fr]">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">بینش فروش</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="tabular text-[32px] font-semibold leading-none text-ink">
                  {trendAmountTotal == null ? "—" : formatToman(trendAmountTotal)}
                </div>
                <ChangePill value={salesAmountCard?.change_pct ?? null} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <PeriodToggle
                value={group}
                onChange={setGroup}
                options={[
                  { value: "daily", label: "روزانه" },
                  { value: "monthly", label: "ماهانه" },
                ]}
              />
            </div>
          </div>
          <div className="mt-4">
            <PillGroup value={salesLine} onChange={setSalesLine} options={SALES_LINES} />
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

        <Panel>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">نمای کلی فروش</h2>
            <span className="text-lg text-faint">⋯</span>
          </div>
          <SalesGauge {...gauge} formatValue={formatToman} />
        </Panel>
      </div>
    </div>
  );
}

function buildGauge(cards: HomeSummary["metric_cards"]) {
  const sales = cards.find((card) => card.key === "sales_amount");
  const units = cards.find((card) => card.key === "units_sold");
  const salesValue = sales?.total || 0;
  const target = Math.max(Math.round(salesValue * 1.4), 1);
  const growth = sales?.change_pct != null ? Math.min(100, Math.max(0, 50 + sales.change_pct)) : 0;
  const progress = Math.min(100, Math.round((salesValue / target) * 1000) / 10);
  const unitsTotal = units?.total || 0;
  void unitsTotal;
  return { growth, salesValue, target, progress };
}
