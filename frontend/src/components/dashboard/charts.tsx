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

function formatTooltipLabel(point: SalesTrendPoint, metric: RevenueChartMetric): string {
  const value = chartValue(point, metric);
  return metric === "amount" ? formatToman(value) : `${formatNumber(value)} فاکتور`;
}

export function RevenueChart({
  points,
  metric = "purchase_count",
}: {
  points: SalesTrendPoint[];
  metric?: RevenueChartMetric;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");
  const gradientId = `wave-grad-${uid}`;
  const strokeId = `stroke-grad-${uid}`;

  if (!points.length) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted">
        اطلاعاتی برای این بازه پیدا نشد.
      </div>
    );
  }

  const width = 800;
  const height = 220;
  const padL = 48;
  const padR = 24;
  const padT = 32;
  const padB = 32;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  
  const values = points.map((p) => chartValue(p, metric));
  const max = Math.max(...values, 1);
  const min = 0;
  
  // Peak point
  const peakIndex = values.reduce((best, val, idx) => (val > values[best] ? idx : best), 0);

  // Generate smooth SVG Catmull-Rom or Bezier path
  const coords = points.map((point, index) => {
    const x = padL + (index / Math.max(points.length - 1, 1)) * chartW;
    const val = chartValue(point, metric);
    const y = padT + chartH - ((val - min) / (max - min || 1)) * chartH;
    return { x, y, point, index };
  });

  // Build SVG path
  let pathD = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const cpX = (curr.x + next.x) / 2;
    pathD += ` C ${cpX} ${curr.y}, ${cpX} ${next.y}, ${next.x} ${next.y}`;
  }

  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${padT + chartH} L ${coords[0].x} ${padT + chartH} Z`;

  const ticks = [0, 0.33, 0.66, 1].map((ratio) => Math.round(max * ratio));

  return (
    <div className="w-full relative" style={{ direction: "ltr" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[220px] overflow-visible font-sans select-none"
        role="group"
        aria-label="نمودار روند فروش"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.38" />
            <stop offset="65%" stopColor="var(--accent)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {ticks.map((tick) => {
          const y = padT + chartH - ((tick - min) / (max - min || 1)) * chartH;
          return (
            <g key={tick} aria-hidden="true">
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke="var(--chart-grid)"
                strokeDasharray="4 6"
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-secondary)"
                className="font-mono tabular"
              >
                {formatAxisValue(tick, metric)}
              </text>
            </g>
          );
        })}

        {/* Gradient Wave Area */}
        <path d={areaD} fill={`url(#${gradientId})`} />

        {/* Wave Curve Line */}
        <path
          d={pathD}
          fill="none"
          stroke={`url(#${strokeId})`}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Interactive Data Points */}
        {coords.map(({ x, y, point, index }) => {
          const isPeak = index === peakIndex;
          const isActive = index === activeIndex;
          const dateLabel = point.date_label || point.date;
          const label = formatTooltipLabel(point, metric);
          const tooltipWidth = Math.max(90, label.length * 7.5);
          const tooltipX = Math.min(Math.max(x - tooltipWidth / 2, 8), width - tooltipWidth - 8);
          const tooltipY = Math.max(6, y - 32);

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
              className="cursor-pointer outline-none"
            >
              {/* Vertical scrub line on hover */}
              {isActive && (
                <line
                  x1={x}
                  x2={x}
                  y1={padT}
                  y2={padT + chartH}
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  opacity="0.8"
                />
              )}

              {/* Touch hit area */}
              <circle cx={x} cy={y} r="16" fill="transparent" />

              {/* Visual circle dot */}
              <circle
                cx={x}
                cy={y}
                r={isActive ? 6.5 : isPeak ? 5.5 : 4}
                fill={isActive ? "#ffffff" : isPeak ? "#60a5fa" : "var(--accent)"}
                stroke={isActive ? "var(--accent)" : "#ffffff"}
                strokeWidth={isActive ? 3 : 2}
                className="transition-all duration-200"
              />

              {/* Tooltip on active */}
              {isActive && (
                <g aria-hidden="true" className="pointer-events-none">
                  <rect
                    x={tooltipX}
                    y={tooltipY}
                    width={tooltipWidth}
                    height="24"
                    rx="8"
                    fill="var(--surface)"
                    stroke="var(--accent)"
                    strokeWidth="1.5"
                    className="shadow-xl"
                  />
                  <text
                    x={tooltipX + tooltipWidth / 2}
                    y={tooltipY + 16}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="bold"
                    fill="var(--text)"
                    className="tabular"
                  >
                    {label}
                  </text>
                </g>
              )}

              {/* Bottom date label */}
              {(points.length <= 10 || index % Math.ceil(points.length / 8) === 0 || index === points.length - 1) && (
                <text
                  x={x}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="11"
                  fill={isPeak ? "var(--accent)" : "var(--text-secondary)"}
                  fontWeight={isPeak ? "bold" : "normal"}
                  className="font-mono tabular"
                >
                  {dateLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
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
    return (
      <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-muted">
        ترکیب کانالی برای این بازه نیست.
      </div>
    );
  }

  const radius = 56;
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
    <div className="flex h-full flex-col justify-between">
      <div className="relative mx-auto mt-2 w-full max-w-[210px]">
        <svg viewBox="0 0 160 160" className="w-full" role="img" aria-label="نمودار سهم کانال‌ها">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--chart-track)" strokeWidth="13" />
          <g transform="rotate(-90 80 80)">
            {segments.map((segment) => (
              <circle
                key={segment.key}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={channelColor(segment.key)}
                strokeWidth="13"
                strokeDasharray={`${Math.max(segment.length - (segments.length > 1 ? 3 : 0), 0)} ${circumference}`}
                strokeDashoffset={-segment.offset}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <div className="tabular text-[28px] font-black leading-none text-ink">
            {formatNumber(Math.round(lead.share * 100))}٪
          </div>
          <div className="mt-1.5 text-[11px] font-bold text-muted truncate max-w-[120px]">
            {shortLineLabel(lead.label)}
          </div>
        </div>
      </div>

      <ul className="mt-6 space-y-3">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-muted">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: channelColor(segment.key) }}
                aria-hidden="true"
              />
              <span className="truncate font-semibold text-ink">{shortLineLabel(segment.label)}</span>
            </span>
            <span className="tabular shrink-0 text-ink">
              <span className="font-bold">{formatValue(segment.value)}</span>
              <span className="mr-2 text-muted font-normal">
                {formatNumber(Math.round(segment.share * 100))}٪
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TargetGauge({
  currentValue,
  targetValue = 3_000_000_000,
  label = "تحقق تارگت ۳ میلیارد",
  periodLabel = "هدف‌گذاری فروش مهرماه",
}: {
  currentValue: number;
  targetValue?: number;
  label?: string;
  periodLabel?: string;
}) {
  const percent = Math.min(100, Math.max(0, Math.round((currentValue / targetValue) * 100 * 10) / 10));
  const remaining = Math.max(0, targetValue - currentValue);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-muted font-medium">{periodLabel}</span>
            <h4 className="text-base font-extrabold text-ink mt-0.5">{label}</h4>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-accent/15 text-accent font-bold border border-accent/30">
            {formatNumber(percent)}٪
          </span>
        </div>

        {/* Circular Gauge */}
        <div className="my-6 flex justify-center items-center relative">
          <svg className="w-44 h-44 -rotate-90">
            <circle
              cx="88"
              cy="88"
              r={radius}
              stroke="var(--chart-track)"
              strokeWidth="14"
              fill="transparent"
            />
            <circle
              cx="88"
              cy="88"
              r={radius}
              stroke="url(#radialGaugeGrad)"
              strokeWidth="14"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="radialGaugeGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute text-center">
            <span className="text-3xl font-black text-ink tabular">
              {formatNumber(percent)}٪
            </span>
            <div className="text-[10px] text-muted font-medium mt-0.5">پیشرفت کل</div>
          </div>
        </div>

        {/* Target Breakdown rows */}
        <div className="space-y-2 text-xs">
          <div className="flex justify-between p-2.5 rounded-xl bg-elevated border border-line">
            <span className="text-muted font-medium">فروش ثبت شده:</span>
            <span className="font-bold text-ink tabular">{formatToman(currentValue)}</span>
          </div>
          <div className="flex justify-between p-2.5 rounded-xl bg-elevated border border-line">
            <span className="text-muted font-medium">باقی‌مانده تا تارگت:</span>
            <span className="font-bold text-amber-600 dark:text-amber-400 tabular">{formatToman(remaining)}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-500/30 text-xs text-blue-700 dark:text-blue-300">
        ⚡ با حفظ میانگین روزانه (۹۹ م/روز)، عبور از تارگت در ۲ روز آینده پیش‌بینی می‌شود.
      </div>
    </div>
  );
}
