import { formatJalali, formatJalaliDateTime } from "./dates";

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("fa-IR").format(value);
}

export function formatToman(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${formatNumber(value)} تومان`;
}

export function formatDate(value?: string | null): string {
  return formatJalali(value, "numeric");
}

export function formatDateLong(value?: string | null): string {
  return formatJalali(value, "long");
}

export function formatDateTime(value?: string | null): string {
  return formatJalaliDateTime(value);
}

export function formatMobile(value?: string | null): string {
  if (!value) return "اطلاعات ناقص";
  return value;
}

export function formatPercent(value: number): string {
  return `${formatNumber(value)}٪`;
}

export function toInputDate(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}
