/** RFM segment metadata for the UI. Keys and order mirror backend apps/customers/rfm.py SEGMENTS. */
export const RFM_SEGMENTS = [
  { key: "champions", label: "قهرمانان", dot: "bg-emerald-500", cell: "bg-emerald-500/25 text-emerald-800 dark:text-emerald-200" },
  { key: "loyal", label: "وفاداران", dot: "bg-teal-500", cell: "bg-teal-500/20 text-teal-800 dark:text-teal-200" },
  { key: "potential", label: "وفادار بالقوه", dot: "bg-sky-500", cell: "bg-sky-500/20 text-sky-800 dark:text-sky-200" },
  { key: "new", label: "تازه‌واردها", dot: "bg-indigo-500", cell: "bg-indigo-500/20 text-indigo-800 dark:text-indigo-200" },
  { key: "attention", label: "نیازمند توجه", dot: "bg-amber-500", cell: "bg-amber-500/20 text-amber-800 dark:text-amber-200" },
  { key: "at_risk", label: "در خطر", dot: "bg-orange-500", cell: "bg-orange-500/25 text-orange-800 dark:text-orange-200" },
  { key: "cant_lose", label: "نباید از دست برود", dot: "bg-rose-500", cell: "bg-rose-500/25 text-rose-800 dark:text-rose-200" },
  { key: "hibernating", label: "خواب / از دست رفته", dot: "bg-slate-400", cell: "bg-slate-400/20 text-slate-700 dark:text-slate-300" },
] as const;

export type RfmSegmentKey = (typeof RFM_SEGMENTS)[number]["key"];

const BY_KEY = new Map<string, (typeof RFM_SEGMENTS)[number]>(RFM_SEGMENTS.map((segment) => [segment.key, segment]));

export function rfmSegment(key: string | null | undefined) {
  return key ? BY_KEY.get(key) ?? null : null;
}

export function isRfmSegment(key: string | null | undefined): key is RfmSegmentKey {
  return Boolean(key && BY_KEY.has(key));
}

/** Same (R, F) → segment map as the backend; used to colour the matrix before data arrives. */
export function segmentForCell(r: number, f: number): RfmSegmentKey {
  if ((r === 5 && f >= 4) || (r === 4 && f === 5)) return "champions";
  if (r >= 3 && f >= 4) return "loyal";
  if (r >= 4 && f >= 2) return "potential";
  if (r >= 4) return "new";
  if (r === 3) return "attention";
  if (f === 5) return "cant_lose";
  if (f >= 3) return "at_risk";
  return "hibernating";
}

export const SCORE_LABELS = { r: "تازگی", f: "تکرار", m: "ارزش" } as const;

/** Old Customers-page links that moved to the club page. Returns the new path, or null. */
export function clubRedirect(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get("tab") === "campaigns") return "/club?tab=campaigns";
  if (params.get("tierRules") === "1") return "/club?tierRules=1";
  return null;
}
