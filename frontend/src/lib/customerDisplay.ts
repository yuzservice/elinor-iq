export const UNNAMED_CUSTOMER = "مشتری بدون نام";
export const INCOMPLETE_LABEL = "اطلاعات ناقص";

export function customerDisplayName(customer: {
  name?: string | null;
  name_is_fallback?: boolean;
  id?: number;
}): { name: string; fallback: boolean } {
  const name = (customer.name || "").trim();
  if (!name || customer.name_is_fallback) {
    return { name: UNNAMED_CUSTOMER, fallback: true };
  }
  if (/^مشتری\s+\d+$/.test(name)) {
    return { name: UNNAMED_CUSTOMER, fallback: true };
  }
  return { name, fallback: false };
}
