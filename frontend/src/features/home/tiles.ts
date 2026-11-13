import type { LineKey } from "../products/types";
import type { HomeData } from "./types";

type Trend = HomeData["trend"];

/** Tile click: the «شعبه» filter becomes this branch, or «همه شعب» when it already is. Other params are kept. */
export function toggleLine(params: URLSearchParams, line: LineKey): URLSearchParams {
  const next = new URLSearchParams(params);
  if (next.get("line") === line) next.delete("line");
  else next.set("line", line);
  return next;
}

/** Branches by sales, largest first, with rank (1-based) and share of the sum of all shown branches. */
export function rankBranches(branches: HomeData["branches"]) {
  const total = branches.reduce((sum, b) => sum + b.sales, 0);
  return [...branches]
    .sort((a, b) => b.sales - a.sales)
    .map((b, index) => ({ ...b, rank: index + 1, share: total ? b.sales / total : null }));
}

/** conic-gradient stops for the share donut, in the given order; an empty ring when nothing was sold. */
export function donutStops(parts: { color: string; value: number }[], empty = "var(--chart-track)") {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (!total) return `${empty} 0% 100%`;
  let at = 0;
  return parts.map((p) => {
    const from = at;
    at += (p.value / total) * 100;
    return `${p.color} ${from.toFixed(1)}% ${at.toFixed(1)}%`;
  }).join(", ");
}

/** Up to `slots` sparkline bars for one branch from trend[].lines; buckets are summed in order. A bar whose buckets are
 *  all in the future is null (drawn as a faint stub). */
export function sparkBars(trend: Trend, line: LineKey, slots = 24): (number | null)[] {
  const n = Math.min(slots, trend.length);
  const out: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const part = trend.slice(Math.floor((i * trend.length) / n), Math.floor(((i + 1) * trend.length) / n));
    out.push(part.every((p) => p.future) ? null : part.reduce((sum, p) => sum + (p.lines?.[line] ?? 0), 0));
  }
  return out;
}
