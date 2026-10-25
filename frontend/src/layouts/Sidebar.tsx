import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../theme/ThemeProvider";
import {
  IconCollapse,
  IconCustomers,
  IconHome,
  IconLogout,
  IconClub,
  IconProducts,
  IconSales,
  IconSettings,
} from "../components/Icons";
import { NAV_ITEMS } from "../lib/nav";

const ICONS = {
  home: IconHome,
  sales: IconSales,
  customers: IconCustomers,
  club: IconClub,
  products: IconProducts,
};

export function Sidebar() {
  const { user, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const navigate = useNavigate();

  // Persist collapsed state in localStorage
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("elinor-sidebar-collapsed") === "true";
    }
    return false;
  });


  useEffect(() => {
    localStorage.setItem("elinor-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  const isDark =
    preference === "dark" ||
    (preference === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const toggleThemeMode = () => {
    setPreference(isDark ? "light" : "dark");
  };

  return (
    <aside
      className={`hidden lg:flex sticky top-0 h-screen shrink-0 flex-col justify-between border-l border-line bg-surface/85 backdrop-blur-xl transition-[width] duration-300 ease-in-out z-30 select-none ${
        collapsed ? "w-[72px] p-2.5" : "w-[264px] p-4"
      }`}
    >
      {/* ============================================================== */}
      {/* TOP SECTION: BRAND & COLLAPSE TOGGLE                          */}
      {/* ============================================================== */}
      <div className="space-y-3">
        
        {/* Brand Bar */}
        <div
          className={`flex items-center transition-all ${
            collapsed ? "flex-col gap-2 py-1" : "justify-between px-1 pb-3 border-b border-line"
          }`}
        >
          {/* Logo & Name */}
          <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
            <div className="h-9 w-9 rounded-xl bg-accent text-on-accent flex items-center justify-center font-black text-sm shadow-md shadow-accent/20 shrink-0">
              E
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold tracking-[0.25em] text-accent uppercase leading-none">
                  ELINOR BOUTIQUE
                </div>
                <div className="text-sm font-extrabold text-ink mt-1 tracking-tight flex items-center gap-1.5 leading-none">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 pulse-glow shrink-0" />
                  <span>هوش فروشگاهی</span>
                </div>
              </div>
            )}
          </div>

          {/* Collapse / Expand Toggle Button */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={`h-8 w-8 rounded-xl bg-elevated border border-line text-muted hover:text-ink hover:bg-hover flex items-center justify-center transition-all shrink-0 ${
              collapsed ? "mt-1" : ""
            }`}
            title={collapsed ? "گسترش منو (Shift + [)" : "جمع کردن منو"}
            aria-label={collapsed ? "گسترش منو" : "جمع کردن منو"}
          >
            <span
              className={`inline-block transition-transform duration-200 text-xs font-bold ${
                collapsed ? "rotate-180" : ""
              }`}
            >
              <IconCollapse />
            </span>
          </button>
        </div>



        {/* ============================================================== */}
        {/* NAVIGATION LINKS                                               */}
        {/* ============================================================== */}
        <nav className="space-y-1 pt-1">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.key];
            const isHome = item.key === "home";
            const isCustomers = item.key === "customers";

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `relative flex items-center rounded-xl text-xs font-semibold transition-all group ${
                    collapsed
                      ? "h-10 w-10 mx-auto justify-center"
                      : "justify-between px-3 py-2.5"
                  } ${
                    isActive
                      ? "bg-accent text-on-accent font-bold shadow-md shadow-accent/25"
                      : "text-muted hover:text-ink hover:bg-hover"
                  }`
                }
              >
                {/* Right Side: Icon & Label */}
                <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
                  <Icon />
                  {!collapsed && <span>{item.label}</span>}
                </div>

                {/* Left Side: Badges (Expanded Mode) */}
                {!collapsed && (
                  <div className="flex items-center">
                    {isHome && (
                      <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-md font-mono">
                        Live
                      </span>
                    )}
                    {isCustomers && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-muted font-mono border border-line">
                        ۴,۲۱۸
                      </span>
                    )}
                  </div>
                )}

                {/* Hover Tooltip (Collapsed Mode) */}
                {collapsed && (
                  <div className="opacity-0 pointer-events-none group-hover:opacity-100 absolute right-12 z-50 px-2.5 py-1 rounded-lg bg-elevated border border-line text-ink text-xs font-semibold whitespace-nowrap shadow-xl transition-opacity">
                    {item.label}
                  </div>
                )}
              </NavLink>
            );
          })}

          {/* Settings NavLink */}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `relative flex items-center rounded-xl text-xs font-semibold transition-all group ${
                collapsed
                  ? "h-10 w-10 mx-auto justify-center"
                  : "justify-between px-3 py-2.5"
              } ${
                isActive
                  ? "bg-accent text-on-accent font-bold shadow-md shadow-accent/25"
                  : "text-muted hover:text-ink hover:bg-hover"
              }`
            }
          >
            <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
              <IconSettings />
              {!collapsed && <span>تنظیمات</span>}
            </div>

            {/* Hover Tooltip (Collapsed Mode) */}
            {collapsed && (
              <div className="opacity-0 pointer-events-none group-hover:opacity-100 absolute right-12 z-50 px-2.5 py-1 rounded-lg bg-elevated border border-line text-ink text-xs font-semibold whitespace-nowrap shadow-xl transition-opacity">
                تنظیمات
              </div>
            )}
          </NavLink>
        </nav>
      </div>

      {/* ============================================================== */}
      {/* BOTTOM SECTION: AI COPILOT & USER CONTROLS                    */}
      {/* ============================================================== */}
      <div className="space-y-3">
        
        {/* AI Assistant Widget */}
        {!collapsed ? (
          <div className="p-3.5 rounded-2xl bg-accent/5 border border-accent/20">
            <div className="flex items-center gap-2 text-xs font-bold text-accent">
              <span className="h-2 w-2 rounded-full bg-accent pulse-glow" />
              <span>دستیار هوشمند الینور</span>
            </div>
            <p className="text-[11px] text-muted mt-2 leading-5 line-clamp-2">
              فروش مانتو کتی شانتون در شعبه ساری ۳۴٪ بالاتر از میانگین است؛ موجودی انبار ...
            </p>
            <button
              type="button"
              onClick={() => navigate("/products")}
              className="mt-2 text-[10px] font-bold text-accent hover:underline flex items-center gap-1 transition-colors"
            >
              <span>مشاهده جزییات تأمین</span>
              <span>←</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/products")}
            className="h-10 w-10 mx-auto rounded-xl bg-accent/10 border border-accent/25 text-accent hover:bg-accent/20 flex items-center justify-center text-sm shadow-sm transition-all group relative"
            title="دستیار هوشمند الینور"
          >
            ✨
            <div className="opacity-0 pointer-events-none group-hover:opacity-100 absolute right-12 z-50 px-2.5 py-1 rounded-lg bg-elevated border border-line text-ink text-xs font-semibold whitespace-nowrap shadow-xl transition-opacity">
              دستیار هوشمند
            </div>
          </button>
        )}

        {/* User Card & Controls */}
        {!collapsed ? (
          <div className="p-3 rounded-2xl bg-elevated border border-line space-y-2.5">
            {/* User row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-full border-2 border-accent bg-surface flex items-center justify-center font-bold text-ink text-xs shrink-0 shadow-sm">
                  {user?.username?.slice(0, 2).toUpperCase() || "AD"}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-ink truncate">
                    {user?.username || "admin"}
                  </div>
                  <div className="text-[10px] text-faint">مدیر ارشد فروشگاه</div>
                </div>
              </div>

              {/* Logout button */}
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate("/login");
                }}
                title="خروج از حساب"
                className="h-7 w-7 rounded-lg hover:bg-hover text-muted hover:text-danger flex items-center justify-center transition-colors shrink-0"
              >
                <IconLogout />
              </button>
            </div>

            {/* Theme switch row */}
            <div className="pt-2 border-t border-line flex items-center justify-between text-xs">
              <span className="text-[10px] text-muted font-medium">پوسته ظاهری:</span>
              <button
                type="button"
                onClick={toggleThemeMode}
                className="px-2.5 py-1 rounded-lg bg-surface border border-line text-ink text-[11px] font-semibold flex items-center gap-1.5 hover:bg-hover transition-colors"
              >
                <span>{isDark ? "🌙 تیره" : "☀️ روشن"}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Collapsed User & Theme Icons */
          <div className="space-y-1.5 pt-1 border-t border-line flex flex-col items-center">
            {/* Theme Toggle Icon */}
            <button
              type="button"
              onClick={toggleThemeMode}
              className="h-9 w-9 rounded-xl bg-elevated border border-line flex items-center justify-center text-xs text-ink hover:bg-hover transition-all group relative"
              title={isDark ? "تغییر به تم روشن" : "تغییر به تم تیره"}
            >
              {isDark ? "🌙" : "☀️"}
              <div className="opacity-0 pointer-events-none group-hover:opacity-100 absolute right-12 z-50 px-2.5 py-1 rounded-lg bg-elevated border border-line text-ink text-xs font-semibold whitespace-nowrap shadow-xl transition-opacity">
                {isDark ? "حالت روشن" : "حالت تیره"}
              </div>
            </button>

            {/* Avatar */}
            <div
              className="h-9 w-9 rounded-xl border-2 border-accent bg-surface flex items-center justify-center font-bold text-ink text-xs shrink-0 shadow-sm cursor-pointer group relative"
              title={user?.username || "admin"}
            >
              {user?.username?.slice(0, 2).toUpperCase() || "AD"}
              <div className="opacity-0 pointer-events-none group-hover:opacity-100 absolute right-12 z-50 px-2.5 py-1 rounded-lg bg-elevated border border-line text-ink text-xs font-semibold whitespace-nowrap shadow-xl transition-opacity">
                {user?.username || "admin"} (مدیر ارشد)
              </div>
            </div>

            {/* Logout Icon */}
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              title="خروج از حساب"
              className="h-9 w-9 rounded-xl hover:bg-hover text-muted hover:text-danger flex items-center justify-center transition-colors group relative"
            >
              <IconLogout />
              <div className="opacity-0 pointer-events-none group-hover:opacity-100 absolute right-12 z-50 px-2.5 py-1 rounded-lg bg-elevated border border-line text-danger text-xs font-semibold whitespace-nowrap shadow-xl transition-opacity">
                خروج
              </div>
            </button>
          </div>
        )}

      </div>
    </aside>
  );
}
