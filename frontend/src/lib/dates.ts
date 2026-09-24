import jalaali from "jalaali-js";

const MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toFaDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => FA_DIGITS[Number(digit)]);
}

export function toEnDigits(value: string): string {
  return value.replace(/[۰-۹]/g, (digit) => String(FA_DIGITS.indexOf(digit)));
}

export function parseTimestamp(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toJalaliParts(value?: string | Date | null): { jy: number; jm: number; jd: number } | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return jalaali.toJalaali(year, month, day);
  }
  const date = parseTimestamp(value);
  if (!date) return null;
  return jalaali.toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function jalaliToIso(jy: number, jm: number, jd: number): string {
  const gregorian = jalaali.toGregorian(jy, jm, jd);
  const month = String(gregorian.gm).padStart(2, "0");
  const day = String(gregorian.gd).padStart(2, "0");
  return `${gregorian.gy}-${month}-${day}`;
}

export function isoToJalali(iso?: string | null): { jy: number; jm: number; jd: number } | null {
  if (!iso) return null;
  return toJalaliParts(iso.slice(0, 10));
}

export function formatJalali(value?: string | Date | null, style: "numeric" | "long" = "numeric"): string {
  const parts = toJalaliParts(value);
  if (!parts) return "—";
  if (style === "long") {
    return toFaDigits(`${parts.jd} ${MONTHS[parts.jm - 1]} ${parts.jy}`);
  }
  const month = String(parts.jm).padStart(2, "0");
  const day = String(parts.jd).padStart(2, "0");
  return toFaDigits(`${parts.jy}/${month}/${day}`);
}

export function formatJalaliDateTime(value?: string | Date | null): string {
  const date = parseTimestamp(value);
  const formatted = formatJalali(value, "numeric");
  if (!date || formatted === "—") return "—";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${formatted} \u2066${toFaDigits(`${hours}:${minutes}`)}\u2069`;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  return jalaali.jalaaliMonthLength(jy, jm);
}

export function jalaliMonthName(jm: number): string {
  return MONTHS[jm - 1] || "";
}

export function todayIso(): string {
  const now = new Date();
  const gregorian = {
    gy: now.getFullYear(),
    gm: now.getMonth() + 1,
    gd: now.getDate(),
  };
  const month = String(gregorian.gm).padStart(2, "0");
  const day = String(gregorian.gd).padStart(2, "0");
  return `${gregorian.gy}-${month}-${day}`;
}
