export const DATA_COVERAGE_MESSAGE = "داده فعلی: بخشی از سفارش‌های اخیر الینور";

export const NAV_ITEMS = [
  { to: "/", label: "فروش", key: "home" },
  { to: "/customers", label: "مشتریان", key: "customers" },
  { to: "/products", label: "محصولات", key: "products" },
  { to: "/store", label: "فروشگاه", key: "store" },
  { to: "/calls", label: "مرکز تماس", key: "calls" },
  { to: "/pulse", label: "پالس", key: "pulse" },
] as const;

export const SALES_AGENT_ROLE = "sales_agent";
export const CONTENT_ROLE = "content";
export const SALES_STAFF_ROLE = "sales_staff";
export const STORE_STAFF_ROLE = "store_staff";

type NavUser = {
  role: string;
  can_manage_calls?: boolean;
  features?: { pulse?: boolean };
  store_map?: "design" | "edit" | "view" | null;
} | null;

/** Agents see only the Call Center, the content team only Pulse, store staff only the store map; Pulse needs
 * me.features.pulse and «فروشگاه» needs me.store_map. */
export function visibleNavItems(user: NavUser) {
  if (user?.role === SALES_AGENT_ROLE) return NAV_ITEMS.filter((item) => item.key === "calls");
  if (user?.role === CONTENT_ROLE) return NAV_ITEMS.filter((item) => item.key === "pulse" && user.features?.pulse);
  if (user?.role === STORE_STAFF_ROLE) return NAV_ITEMS.filter((item) => item.key === "store");
  return NAV_ITEMS.filter(
    (item) =>
      (item.key !== "calls" || user?.can_manage_calls) &&
      (item.key !== "pulse" || user?.features?.pulse) &&
      (item.key !== "store" || user?.store_map),
  );
}

/** Sidebar subtitle for the non-manager roles; null for managers. */
export function staffRoleLabel(role?: string) {
  const labels: Record<string, string> = {
    [SALES_AGENT_ROLE]: "کارشناس تماس",
    [CONTENT_ROLE]: "تیم محتوا",
    [SALES_STAFF_ROLE]: "کارمند فروش",
    [STORE_STAFF_ROLE]: "کارمند فروشگاه حضوری",
  };
  return labels[role ?? ""] ?? null;
}

/** Roles limited to one section, and sales staff, never see settings. */
export function showsSettings(user: NavUser) {
  return ![SALES_AGENT_ROLE, CONTENT_ROLE, STORE_STAFF_ROLE, SALES_STAFF_ROLE].includes(user?.role ?? "");
}

export const PRODUCT_NAV_LABEL = "محصولات";
