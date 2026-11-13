export const DATA_COVERAGE_MESSAGE = "داده فعلی: بخشی از سفارش‌های اخیر الینور";

export const NAV_ITEMS = [
  { to: "/", label: "فروش", key: "home" },
  { to: "/customers", label: "مشتریان", key: "customers" },
  { to: "/products", label: "محصولات", key: "products" },
  { to: "/calls", label: "مرکز تماس", key: "calls" },
  { to: "/pulse", label: "پالس", key: "pulse" },
] as const;

export const SALES_AGENT_ROLE = "sales_agent";
export const CONTENT_ROLE = "content";

type NavUser = { role: string; can_manage_calls?: boolean; features?: { pulse?: boolean } } | null;

/** Agents see only the Call Center, the content team only Pulse; Pulse needs me.features.pulse. */
export function visibleNavItems(user: NavUser) {
  if (user?.role === SALES_AGENT_ROLE) return NAV_ITEMS.filter((item) => item.key === "calls");
  if (user?.role === CONTENT_ROLE) return NAV_ITEMS.filter((item) => item.key === "pulse" && user.features?.pulse);
  return NAV_ITEMS.filter(
    (item) => (item.key !== "calls" || user?.can_manage_calls) && (item.key !== "pulse" || user?.features?.pulse),
  );
}

/** Roles limited to one section never see settings. */
export function showsSettings(user: NavUser) {
  return user?.role !== SALES_AGENT_ROLE && user?.role !== CONTENT_ROLE;
}

export const PRODUCT_NAV_LABEL = "محصولات";
