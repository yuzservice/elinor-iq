export const DATA_COVERAGE_MESSAGE = "داده فعلی: بخشی از سفارش‌های اخیر الینور";

export const NAV_ITEMS = [
  { to: "/", label: "خانه", key: "home" },
  { to: "/sales", label: "فروش", key: "sales" },
  { to: "/customers", label: "مشتریان", key: "customers" },
  { to: "/products", label: "محصولات", key: "products" },
  { to: "/calls", label: "مرکز تماس", key: "calls" },
] as const;

export const SALES_AGENT_ROLE = "sales_agent";

/** Agents see only the Call Center; other roles without call access do not see it. */
export function visibleNavItems(user: { role: string; can_manage_calls?: boolean } | null) {
  if (user?.role === SALES_AGENT_ROLE) return NAV_ITEMS.filter((item) => item.key === "calls");
  return NAV_ITEMS.filter((item) => item.key !== "calls" || user?.can_manage_calls);
}

export const PRODUCT_NAV_LABEL = "محصولات";
