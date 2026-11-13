/**
 * Visible sales lines (decision 0010). The backend hides lines through settings.HIDDEN_SALES_LINES and sends the rest
 * as `/api/auth/me/` → `visible_sales_lines`; App stores it here at login. Every branch list, picker and branch-list text
 * in the UI is built from these helpers, never from a hard-coded list.
 */
import type { SalesLineKey } from "../types";

export const ALL_SALES_LINES: SalesLineKey[] = ["ONLINE", "SARI", "GORGAN", "CAPRI"];

let visible: SalesLineKey[] = ALL_SALES_LINES;

/** Called by App with the `/api/auth/me/` value; a missing or empty value shows every line (older backend). */
export function setVisibleSalesLines(lines?: readonly string[] | null) {
  const next = ALL_SALES_LINES.filter((line) => lines?.includes(line));
  visible = lines && next.length ? next : ALL_SALES_LINES;
}

export function visibleSalesLines(): SalesLineKey[] {
  return visible;
}

/** Store (in-person) lines only. */
export function visibleStoreLines(): SalesLineKey[] {
  return visible.filter((line) => line !== "ONLINE");
}

export function isVisibleLine(line: string | null | undefined): boolean {
  return Boolean(line) && (visible as string[]).includes(String(line).toUpperCase());
}

/** Keeps only items whose line is visible; items without a line (e.g. «همه») stay. */
export function onlyVisible<T>(items: readonly T[], lineOf: (item: T) => string | null | undefined): T[] {
  return items.filter((item) => {
    const line = lineOf(item);
    return !line || !(ALL_SALES_LINES as string[]).includes(String(line).toUpperCase()) || isVisibleLine(line);
  });
}

/** Persian list: «الف»، «الف و ب»، «الف، ب و ج». */
export function joinFa(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join("، ")} و ${items[items.length - 1]}`;
}

/** «ساری، گرگان و …» built from the visible store lines. */
export function storeLinesText(labels: Record<string, string>): string {
  return joinFa(visibleStoreLines().map((line) => labels[line] ?? line));
}
