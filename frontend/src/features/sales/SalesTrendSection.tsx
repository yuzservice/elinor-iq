import { useEffect, useMemo, useState } from "react";
import { ErrorState, Skeleton } from "../../components/Table";
import { formatCompactToman, formatNumber } from "../../lib/format";
import type { SalesOverviewTrendPoint } from "../../services/sales";

type TrendMetric = "net_sales" | "order_count" | "items_sold";
type TrendGroup = "daily" | "weekly" | "monthly";

const METRICS: { key: TrendMetric; label: string }[] = [
  { key: "net_sales", label: "فروش خالص" },
  { key: "order_count", label: "تعداد سفارش" },
  { key: "items_sold", label: "تعداد آیتم" },
];

const GROUPS: { key: TrendGroup; label: string; minDays: number }[] = [
  { key: "daily", label: "روزانه", minDays: 0 },
  { key: "weekly", label: "هفتگی", minDays: 8 },
  { key: "monthly", label: "ماهانه", minDays: 32 },
];

function rangeDays(from?: string, to?: string) {
  if (!from || !to) return 92;
  const start = new Date(`${from}T12:00:00+03:30`).getTime();
  const end = new Date(`${to}T12:00:00+03:30`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 92;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function metricValue(point: SalesOverviewTrendPoint | null | undefined, metric: TrendMetric) {
  return point?.[metric] ?? 0;
}

function formatMetric(value: number, metric: TrendMetric) {
  if (metric === "net_sales") return formatCompactToman(value);
  return formatNumber(value);
}

function axisLabel(value: number, metric: TrendMetric) {
  if (metric !== "net_sales") return formatNumber(value);
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(value / 1_000_000_000)} میلیارد`;
  if (abs >= 1_000_000) return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value / 1_000_000)} میلیون`;
  return formatNumber(value);
}

function ControlGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full bg-hover p-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          disabled={option.disabled}
          onClick={() => onChange(option.key)}
          className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
            value === option.key ? "bg-elevated text-ink shadow-soft" : "text-muted hover:text-ink"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SalesTrendSection({
  points,
  from,
  to,
  showCompare,
  loading,
  error,
  group,
  onGroupChange,
}: {
  points: SalesOverviewTrendPoint[] | undefined;
  from?: string;
  to?: string;
  showCompare: boolean;
  loading?: boolean;
  error?: boolean;
  group: TrendGroup;
  onGroupChange: (group: TrendGroup) => void;
}) {
  const [metric, setMetric] = useState<TrendMetric>("net_sales");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const days = rangeDays(from, to);
  const activeGroup = GROUPS.some((item) => item.key === group && days >= item.minDays) ? group : "daily";
  useEffect(() => {
    if (activeGroup !== group) onGroupChange(activeGroup);
  }, [activeGroup, group, onGroupChange]);

  const chart = useMemo(() => buildChart(points || [], metric, showCompare), [points, metric, showCompare]);
  const summary = useMemo(() => extremes(points || [], metric), [points, metric]);
  const active = activeIndex != null ? points?.[activeIndex] : null;

  return (
    <section className="mt-4 rounded-[24px] border border-line/80 bg-elevated px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-5 sm:py-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-[15px] font-semibold text-ink">روند فروش</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ControlGroup label="شاخص روند" value={metric} options={METRICS} onChange={setMetric} />
          <ControlGroup
            label="بازه تجمیع"
            value={activeGroup}
            options={GROUPS.map((item) => ({ ...item, disabled: days < item.minDays }))}
            onChange={onGroupChange}
          />
        </div>
      </div>

      {loading && !points ? (
        <Skeleton className="mt-4 h-72 rounded-2xl" />
      ) : error ? (
        <div className="mt-4">
          <ErrorState />
        </div>
      ) : !points?.length || chart.max <= 0 ? (
        <p className="mt-8 mb-6 text-center text-sm text-muted">برای این فیلترها روندی ثبت نشده است.</p>
      ) : (
        <>
          <div className="relative mt-4">
            <TrendChart
              points={points}
              metric={metric}
              showCompare={showCompare}
              activeIndex={activeIndex}
              onHover={setActiveIndex}
            />
            {active ? (
              <div className="pointer-events-none absolute start-3 top-3 z-10 max-w-[16rem] rounded-2xl border border-line bg-elevated/95 px-3 py-2 text-right shadow-soft">
                <div className="text-xs font-medium text-ink">{active.label}</div>
                {METRICS.map((item) => (
                  <div key={item.key} className="mt-1 text-[11px] text-muted">
                    {item.label}: {formatMetric(active[item.key], item.key)}
                  </div>
                ))}
                {showCompare && active.compare ? (
                  <div className="mt-2 border-t border-line/70 pt-2 text-[11px] text-faint">
                    مقایسه ({active.compare.label}): {formatMetric(active.compare[metric], metric)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {showCompare ? (
            <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted">
              <span className="inline-flex items-center gap-2">
                <span className="h-0.5 w-6 bg-accent" /> بازه اصلی
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-0.5 w-6 border-t border-dashed border-muted" /> بازه مقایسه
              </span>
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SummaryCard title="بیشترین" label={summary.max?.label} value={summary.max ? formatMetric(summary.max.value, metric) : "—"} />
            <SummaryCard title="کمترین" label={summary.min?.label} value={summary.min ? formatMetric(summary.min.value, metric) : "—"} />
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCard({ title, label, value }: { title: string; label?: string; value: string }) {
  return (
    <div className="rounded-2xl bg-hover/70 px-3 py-2.5">
      <div className="text-[11px] text-muted">{title}</div>
      <div className="mt-1 text-sm font-medium text-ink">{label || "—"}</div>
      <div className="text-[11px] text-faint">{value}</div>
    </div>
  );
}

function extremes(points: SalesOverviewTrendPoint[], metric: TrendMetric) {
  if (!points.length) return { max: null, min: null };
  let max = points[0];
  let min = points[0];
  for (const point of points) {
    if (point[metric] > max[metric]) max = point;
    if (point[metric] < min[metric]) min = point;
  }
  return { max: { label: max.label, value: max[metric] }, min: { label: min.label, value: min[metric] } };
}

function buildChart(points: SalesOverviewTrendPoint[], metric: TrendMetric, showCompare: boolean) {
  const values = points.flatMap((point) => [
    metricValue(point, metric),
    showCompare ? metricValue(point.compare, metric) : 0,
  ]);
  return { max: Math.max(0, ...values) };
}

function TrendChart({
  points,
  metric,
  showCompare,
  activeIndex,
  onHover,
}: {
  points: SalesOverviewTrendPoint[];
  metric: TrendMetric;
  showCompare: boolean;
  activeIndex: number | null;
  onHover: (index: number | null) => void;
}) {
  const width = 720;
  const height = 280;
  const pad = { top: 16, right: 12, bottom: 36, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(
    1,
    ...points.flatMap((point) => [point[metric], showCompare ? point.compare?.[metric] ?? 0 : 0]),
  );
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;
  const yFor = (value: number) => pad.top + innerH - (value / max) * innerH;
  const xFor = (index: number) => (points.length === 1 ? pad.left + innerW / 2 : pad.left + index * step);
  const line = (selector: (point: SalesOverviewTrendPoint) => number) =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(selector(point))}`).join(" ");
  const area = `${line((point) => point[metric])} L ${xFor(points.length - 1)} ${pad.top + innerH} L ${xFor(0)} ${pad.top + innerH} Z`;
  const ticks = [0, 0.5, 1].map((ratio) => Math.round(max * ratio));
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-72 w-full" role="img" aria-label="نمودار روند فروش">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={yFor(tick)} y2={yFor(tick)} className="stroke-line" strokeWidth="1" />
          <text x={pad.left - 8} y={yFor(tick) + 4} textAnchor="end" className="fill-muted text-[11px]">
            {axisLabel(tick, metric)}
          </text>
        </g>
      ))}
      <path d={area} className="fill-accent/10" />
      <path d={line((point) => point[metric])} fill="none" className="stroke-accent" strokeWidth="2.5" />
      {showCompare ? (
        <path
          d={line((point) => point.compare?.[metric] ?? 0)}
          fill="none"
          className="stroke-muted"
          strokeWidth="2"
          strokeDasharray="5 4"
        />
      ) : null}
      {points.map((point, index) => (
        <g key={point.date}>
          <circle cx={xFor(index)} cy={yFor(point[metric])} r={activeIndex === index ? 4.5 : 3} className="fill-accent" />
          <rect
            x={xFor(index) - step / 2}
            y={pad.top}
            width={Math.max(step, 24)}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => onHover(index)}
            onMouseLeave={() => onHover(null)}
            onTouchStart={() => onHover(index)}
          />
          {index % labelStep === 0 ? (
            <text x={xFor(index)} y={height - 10} textAnchor="middle" className="fill-faint text-[10px]">
              {point.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
