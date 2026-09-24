export const PROFILE_EMPTY = "ثبت نشده";

export function profileValue(value?: string | null): string {
  const text = (value || "").trim();
  return text || PROFILE_EMPTY;
}

export function salesLineTone(line?: string): "accent" | "sage" | "warning" | "neutral" {
  if (line === "ONLINE") return "accent";
  if (line === "SARI") return "sage";
  if (line === "GORGAN") return "warning";
  return "neutral";
}

export function joinFacts(values: string[]): string {
  const clean = values.filter(Boolean);
  return clean.length ? clean.join("، ") : PROFILE_EMPTY;
}
