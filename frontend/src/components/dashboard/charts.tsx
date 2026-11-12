import { useId, useState } from "react";
import { formatNumber, formatToman } from "../../lib/format";
import type { SalesTrendPoint } from "../../types";

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

