import { formatJalali } from "../lib/dates";
import { formatNumber } from "../lib/format";

type Point = {
  date: string;
  date_label?: string;
  purchase_count: number;
  units_sold?: number;
  value?: number;
};

export function TrendChart({ points, metric = "purchase_count" }: { points: Point[]; metric?: "purchase_count" | "units_sold" }) {
  if (!points.length) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        اطلاعاتی برای این بازه پیدا نشد.
      </div>
    );
  }
  const width = 760;
  const height = 240;
  const padX = 16;
  const padY = 24;
  const readValue = (point: Point) =>
    metric === "units_sold" ? point.units_sold ?? 0 : point.purchase_count ?? point.value ?? 0;
  const max = Math.max(...points.map(readValue), 1);
  const coords = points.map((point, index) => {
    const x = padX + (index / Math.max(points.length - 1, 1)) * (width - padX * 2);
    const y = height - padY - (readValue(point) / max) * (height - padY * 2);
    return `${x},${y}`;
  });
  const area = `${padX},${height - padY} ${coords.join(" ")} ${width - padX},${height - padY}`;
  const first = points[0];
  const last = points[points.length - 1];
  const labelFor = (point: Point) => point.date_label || formatJalali(point.date, "long");
  return (
    <div className="overflow-hidden" dir="ltr">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-72 w-full">
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#trendFill)" />
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] text-faint" dir="rtl">
        <span>{labelFor(first)}</span>
        <span className="text-muted">
          {metric === "units_sold" ? "واحد" : "خرید"} — بیشینه: {formatNumber(max)}
        </span>
        <span>{labelFor(last)}</span>
      </div>
    </div>
  );
}
