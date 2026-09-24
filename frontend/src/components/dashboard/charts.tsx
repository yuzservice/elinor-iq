import { formatNumber } from "../../lib/format";
import type { SalesTrendPoint } from "../../types";
import { DASH } from "./tokens";

export function RevenueChart({ points }: { points: SalesTrendPoint[] }) {
  if (!points.length) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted">
        اطلاعاتی برای این بازه پیدا نشد.
      </div>
    );
  }
  const width = 760;
  const height = 300;
  const padL = 42;
  const padR = 12;
  const padT = 36;
  const padB = 34;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const max = Math.max(...points.map((point) => point.purchase_count), 1);
  const peakIndex = points.reduce(
    (best, point, index) => (point.purchase_count > points[best].purchase_count ? index : best),
    0,
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(max * ratio));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[300px] w-full" dir="ltr">
      <defs>
        <pattern id="dash-stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="8" fill="#E5E7EB" />
          <rect x="4" width="4" height="8" fill="#F3F4F6" />
        </pattern>
        <linearGradient id="dash-bar" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="100%" stopColor={DASH.blue} />
        </linearGradient>
      </defs>
      {ticks.map((tick) => {
        const y = padT + chartH - (tick / max) * chartH;
        return (
          <g key={tick}>
            <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="#E5E7EB" strokeDasharray="4 6" />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill={DASH.faint}>
              {tick >= 1000 ? `${Math.round(tick / 1000)}k` : tick}
            </text>
          </g>
        );
      })}
      {points.map((point, index) => {
        const slot = chartW / points.length;
        const barW = Math.min(28, slot * 0.52);
        const x = padL + index * slot + (slot - barW) / 2;
        const barH = Math.max(10, (point.purchase_count / max) * chartH);
        const y = padT + chartH - barH;
        const active = index === peakIndex;
        return (
          <g key={`${point.date}-${index}`}>
            {active ? (
              <>
                <rect x={x + barW / 2 - 34} y={y - 28} width="68" height="22" rx="8" fill={DASH.blue} />
                <text x={x + barW / 2} y={y - 13} textAnchor="middle" fontSize="10" fill="#FFFFFF">
                  {formatNumber(point.purchase_count)}
                </text>
                <circle cx={x + barW / 2} cy={y - 4} r="3" fill="#FFFFFF" />
              </>
            ) : null}
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={barW / 2}
              fill={active ? "url(#dash-bar)" : "url(#dash-stripes)"}
            />
            <text x={x + barW / 2} y={height - 10} textAnchor="middle" fontSize="10" fill={DASH.faint}>
              {(point.date_label || point.date).slice(0, 6)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function SalesGauge({
  growth,
  salesValue,
  target,
  progress,
  formatValue,
}: {
  growth: number;
  salesValue: number;
  target: number;
  progress: number;
  formatValue: (value: number) => string;
}) {
  const segments = 20;
  const filled = Math.round((growth / 100) * segments);
  return (
    <div className="flex h-full flex-col">
      <div className="relative mx-auto mt-2 w-full max-w-[300px]">
        <svg viewBox="0 0 220 130" className="w-full">
          {Array.from({ length: segments }).map((_, index) => {
            const angle = Math.PI + (index / (segments - 1)) * Math.PI;
            const inner = 58;
            const outer = 78;
            const cx = 110;
            const cy = 108;
            const x1 = cx + inner * Math.cos(angle);
            const y1 = cy + inner * Math.sin(angle);
            const x2 = cx + outer * Math.cos(angle);
            const y2 = cy + outer * Math.sin(angle);
            const active = index < filled;
            const tone = active ? `rgba(45, 127, 249, ${0.45 + (index / segments) * 0.55})` : "#E5E7EB";
            return (
              <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tone} strokeWidth="7" strokeLinecap="round" />
            );
          })}
        </svg>
        <div className="absolute inset-x-0 bottom-8 text-center">
          <div className="tabular text-[34px] font-semibold leading-none text-ink">{formatNumber(growth)}٪</div>
          <div className="mt-2 text-[12px] text-muted">رشد فروش</div>
        </div>
      </div>
      <div className="mt-2">
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>فروش {formatValue(salesValue)}</span>
          <span>هدف {formatValue(target)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E5E7EB]">
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
