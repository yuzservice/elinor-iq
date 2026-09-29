import { useId, useState } from "react";
import { formatNumber, formatToman } from "../../lib/format";
import type { SalesTrendPoint } from "../../types";
import { channelColor, shortLineLabel } from "./tokens";

type RevenueChartMetric = "amount" | "purchase_count";

function chartValue(point: SalesTrendPoint, metric: RevenueChartMetric): number {
  return metric === "amount" ? point.amount || 0 : point.purchase_count;
}

function formatAxisValue(value: number, metric: RevenueChartMetric): string {
  if (metric === "amount") {
    if (value >= 1_000_000_000) return `${formatNumber(Math.round(value / 1_000_000_000))}B`;
    if (value >= 1_000_000) return `${formatNumber(Math.round(value / 1_000_000))}M`;
    if (value >= 1_000) return `${formatNumber(Math.round(value / 1_000))}k`;
  } else if (value >= 1000) {
    return `${formatNumber(Math.round(value / 1000))}k`;
  }
  return formatNumber(value);
}

function formatBarLabel(point: SalesTrendPoint, metric: RevenueChartMetric): string {
  const value = chartValue(point, metric);
  return metric === "amount" ? formatToman(value) : formatNumber(value);
}

export function RevenueChart({
  points,
  metric = "purchase_count",
}: {
  points: SalesTrendPoint[];
  metric?: RevenueChartMetric;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = `dash-bar-${useId().replace(/:/g, "")}`;

  if (!points.length) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted">
        اطلاعاتی برای این بازه پیدا نشد.
      </div>
    );
  }

  const width = 760;
  const height = 300;
  const padL = 56;
  const padR = 12;
  const padT = 40;
  const padB = 36;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const max = Math.max(...points.map((point) => chartValue(point, metric)), 1);
  const peakIndex = points.reduce(
    (best, point, index) => (chartValue(point, metric) > chartValue(points[best], metric) ? index : best),
    0,
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(max * ratio));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[300px] w-full font-sans" role="group" aria-label="نمودار روند فروش" style={{ direction: "ltr" }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--chart-bar-soft)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      {ticks.map((tick) => {
        const y = padT + chartH - (tick / max) * chartH;
        return (
          <g key={tick} aria-hidden="true">
            <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="var(--chart-grid)" strokeDasharray="4 6" />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="12" fill="var(--text-secondary)">
              {formatAxisValue(tick, metric)}
            </text>
          </g>
        );
      })}
      {points.map((point, index) => {
        const slot = chartW / points.length;
        const barW = Math.min(28, slot * 0.52);
        const x = padL + index * slot + (slot - barW) / 2;
        const value = chartValue(point, metric);
        const barH = Math.max(value > 0 ? 8 : 2, (value / max) * chartH);
        const y = padT + chartH - barH;
        const active = index === peakIndex || activeIndex === index;
        const label = formatBarLabel(point, metric);
        const labelWidth = Math.min(168, Math.max(96, label.length * 7.2));
        const center = x + barW / 2;
        const tipX = Math.min(Math.max(center - labelWidth / 2, 4), width - labelWidth - 4);
        const tipY = Math.max(6, y - 30);
        const dateLabel = point.date_label || point.date;
        return (
          <g
            key={`${point.date}-${index}`}
            tabIndex={0}
            role="img"
            aria-label={`${dateLabel}: ${label}`}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
            onFocus={() => setActiveIndex(index)}
            onBlur={() => setActiveIndex(null)}
            className="cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <rect x={x - 6} y={padT} width={barW + 12} height={chartH} fill="transparent" />
            {activeIndex === index ? (
              <g aria-hidden="true">
                <rect x={tipX} y={tipY} width={labelWidth} height="22" rx="8" fill="var(--accent)" />
                <text x={tipX + labelWidth / 2} y={tipY + 15} textAnchor="middle" fontSize="12" fill="var(--on-accent)">
                  {label}
                </text>
              </g>
            ) : null}
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={Math.min(10, barW / 2)}
              fill={active ? `url(#${gradientId})` : "var(--chart-bar-soft)"}
            />
            {index === peakIndex ? (
              <circle cx={center} cy={y} r="4" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" aria-hidden="true" />
            ) : null}
            <text x={center} y={height - 12} textAnchor="middle" fontSize="12" fill="var(--text-secondary)">
              {dateLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

type MixLine = { key: string; label: string; value: number };

export function ChannelMix({
  lines,
  formatValue,
}: {
  lines: MixLine[];
  formatValue: (value: number) => string;
}) {
  const safe = lines.filter((line) => line.value > 0);
  const total = safe.reduce((sum, line) => sum + line.value, 0);
  if (!total) {
    return <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-muted">ترکیب کانالی برای این بازه نیست.</div>;
  }

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;
  const segments = safe.map((line) => {
    const share = line.value / total;
    const length = share * circumference;
    const segment = { ...line, share, length, offset: cursor };
    cursor += length;
    return segment;
  });
  const lead = segments.reduce((best, segment) => (segment.value > best.value ? segment : best), segments[0]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative mx-auto mt-2 w-full max-w-[220px]">
        <svg viewBox="0 0 160 160" className="w-full" role="img" aria-label="نمودار سهم کانال‌ها">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--chart-track)" strokeWidth="14" />
          <g transform="rotate(-90 80 80)">
            {segments.map((segment) => (
              <circle
                key={segment.key}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={channelColor(segment.key)}
                strokeWidth="14"
                strokeDasharray={`${Math.max(segment.length - (segments.length > 1 ? 3 : 0), 0)} ${circumference}`}
                strokeDashoffset={-segment.offset}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          <div className="tabular text-[32px] font-semibold leading-none text-ink">{formatNumber(Math.round(lead.share * 100))}٪</div>
          <div className="mt-2 text-[13px] text-muted">{shortLineLabel(lead.label)}</div>
        </div>
      </div>
      <ul className="mt-4 space-y-3">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2 text-muted">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: channelColor(segment.key) }} aria-hidden="true" />
              <span className="truncate">{shortLineLabel(segment.label)}</span>
            </span>
            <span className="tabular shrink-0 text-ink">
              <span className="font-medium">{formatValue(segment.value)}</span>
              <span className="mr-2 text-muted">{formatNumber(Math.round(segment.share * 100))}٪</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
