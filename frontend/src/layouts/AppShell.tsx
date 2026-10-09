import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../theme/ThemeProvider";
import {
  IconCollapse,
  IconCustomers,
  IconHome,
  IconLogout,
  IconProducts,
  IconSales,
  IconSettings,
  IconSmartDirect,
} from "../components/Icons";
import { CoverageNotice, ThemeSwitch } from "../components/ui";
import { NAV_ITEMS } from "../lib/nav";

const ICONS = {
  home: IconHome,
  sales: IconSales,
  customers: IconCustomers,
  products: IconProducts,
  smart_direct: IconSmartDirect,
};

function MobileThemeToggle() {
  const { preference, setPreference } = useTheme();
  const isDark =
    preference === "dark" ||
    (preference === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <button
      type="button"
      onClick={() => setPreference(isDark ? "light" : "dark")}
      className="h-8 w-8 rounded-xl bg-elevated border border-line flex items-center justify-center text-xs shadow-sm hover:bg-hover active:scale-95 transition-all text-ink"
      title={isDark ? "تغییر به حالت روشن" : "تغییر به حالت تیره"}
      aria-label="تغییر تم"
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [activeBranch, setActiveBranch] = useState("all");
  const navigate = useNavigate();
  const location = useLocation();
  const showCoverageNotice = location.pathname !== "/";

  return (
    <div className="flex min-h-screen bg-canvas text-ink transition-colors">
      
      {/* ============================================================== */}
      {/* 1. DESKTOP SIDEBAR (Visible on lg and above)                   */}
      {/* ============================================================== */}
      <aside
        className={`hidden lg:flex sticky top-0 h-screen shrink-0 flex-col justify-between p-5 transition-[width] duration-300 z-30 ${
          collapsed ? "w-24" : "w-64"
        }`}
      >
        <div className="space-y-5">
          {/* Brand Card */}
          <div className="bento-card p-4 glass-rim">
            <div className="flex items-center justify-between">
              {!collapsed ? (
                <div>
                  <div className="text-[10px] font-extrabold tracking-[0.25em] text-accent uppercase">
                    ELINOR BOUTIQUE
                  </div>
                  <div className="text-base font-extrabold mt-0.5 tracking-tight flex items-center gap-2 text-ink">
                    <span>هوش فروشگاهی</span>
                    <span className="h-2 w-2 rounded-full bg-emerald-500 pulse-glow" />
                  </div>
                </div>
              ) : (
                <div className="h-8 w-8 mx-auto rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-md">
                  E
                </div>
              )}
              
              <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
                className="h-7 w-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent hover:bg-accent/20 transition-colors"
                title={collapsed ? "باز شدن منو" : "جمع شدن منو"}
              >
                <span className={`inline-block transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}>
                  <IconCollapse />
                </span>
              </button>
            </div>

            {/* Quick Branch Selector */}
            {!collapsed && (
              <div className="mt-4 pt-3 border-t border-line">
                <label className="text-[10px] text-muted font-semibold block mb-1.5">
                  شعبه فعال:
                </label>
                <select
                  value={activeBranch}
                  onChange={(e) => setActiveBranch(e.target.value)}
                  className="w-full bg-elevated border border-line rounded-xl px-2.5 py-1.5 text-xs font-semibold text-ink focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="all">همه خطوط فروش (۴ شعبه)</option>
                  <option value="ONLINE">فروشگاه آنلاین (سایت)</option>
                  <option value="SARI">شعبه ساری (حضوری POS)</option>
                  <option value="GORGAN">شعبه گرگان (حضوری POS)</option>
                  <option value="CAPRI">شعبه کاپری (حضوری POS)</option>
                </select>
              </div>
            )}
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = ICONS[item.key];
              const isSmartDirect = item.key === "smart_direct";
              const isHome = item.key === "home";
              const isCustomers = item.key === "customers";

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                      isActive
                        ? "bg-accent text-on-accent font-bold shadow-md shadow-accent/25 border border-accent/30"
                        : "text-muted hover:text-ink hover:bg-hover"
                    } ${collapsed ? "justify-center" : ""}`
                  }
                  title={collapsed ? item.label : undefined}
                >
                  <div className="flex items-center gap-3">
                    <Icon />
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                  {!collapsed && (
                    <>
                      {isHome && (
                        <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-md font-mono">
                          Live
                        </span>
                      )}
                      {isCustomers && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-muted font-mono border border-line">
                          ۴,۲۱۸
                        </span>
                      )}
                      {isSmartDirect && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold shadow-sm">
                          ۳ پیام
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-accent text-on-accent font-bold shadow-md shadow-accent/25 border border-accent/30"
                    : "text-muted hover:text-ink hover:bg-hover"
                } ${collapsed ? "justify-center" : ""}`
              }
              title={collapsed ? "تنظیمات" : undefined}
            >
              <div className="flex items-center gap-3">
                <IconSettings />
                {!collapsed && <span>تنظیمات</span>}
              </div>
            </NavLink>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="space-y-3">
          {/* AI Copilot Widget */}
          {!collapsed && (
            <div className="bento-card p-3.5 glass-rim border-accent/25 bg-accent/5">
              <div className="flex items-center gap-2 text-xs font-bold text-accent">
                <span className="h-2 w-2 rounded-full bg-accent pulse-glow" />
                <span>دستیار هوشمند الینور</span>
              </div>
              <p className="text-[11px] text-muted mt-2 leading-5 line-clamp-2">
                فروش مانتو کتی شانتون در شعبه ساری ۳۴٪ بالاتر از میانگین است؛ موجودی انبار به ۳ قلم کاهش یافته است.
              </p>
              <button
                type="button"
                onClick={() => navigate("/products")}
                className="mt-2 text-[10px] font-bold text-accent hover:underline flex items-center gap-1 transition-colors"
              >
                <span>مشاهده جزییات تأمین موجودی</span>
                <span>←</span>
              </button>
            </div>
          )}

          {/* User Profile Card */}
          <div className="bento-card p-3 flex items-center justify-between glass-rim">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 p-[1px]">
                <div className="h-full w-full bg-surface rounded-[15px] flex items-center justify-center font-bold text-ink text-xs">
                  {user?.username?.slice(0, 2).toUpperCase() || "RS"}
                </div>
              </div>
              {!collapsed && (
                <div>
                  <div className="text-xs font-bold text-ink">
                    {user?.username || "رضا سلطانی"}
                  </div>
                  <div className="text-[10px] text-faint">مدیر ارشد فروشگاه</div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              {!collapsed && <ThemeSwitch />}
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate("/login");
                }}
                title="خروج"
                className="p-1.5 rounded-xl hover:bg-hover text-muted hover:text-danger transition-colors"
              >
                <IconLogout />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ============================================================== */}
      {/* 2. MAIN CONTENT AREA                                           */}
      {/* ============================================================== */}
      <div className="min-w-0 flex-1 flex flex-col relative z-10">
        
        {/* Mobile Top Header (Optimized: No crowded 3-button theme switch) */}
        <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between border-b border-line bg-surface/90 backdrop-blur-xl px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-accent flex items-center justify-center font-bold text-white text-xs shadow-md">
              E
            </div>
            <div>
              <div className="text-[9px] text-accent font-black tracking-wider uppercase">
                ELINOR BOUTIQUE
              </div>
              <div className="text-xs font-extrabold text-ink leading-none">هوش فروش</div>
            </div>
          </div>

          {/* Compact Mobile Actions: 1-click theme icon + Avatar */}
          <div className="flex items-center gap-2">
            <MobileThemeToggle />
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-accent/15 text-[10px] font-bold text-accent border border-accent/25">
              {user?.username?.slice(0, 2).toUpperCase() || "RS"}
            </div>
          </div>
        </header>

        {/* Page Content Canvas with generous bottom padding for mobile dock */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-3.5 sm:p-6 lg:p-8 space-y-5 sm:space-y-6 pb-28 lg:pb-8">
          {showCoverageNotice ? <CoverageNotice /> : null}
          <Outlet />
        </main>

        {/* Mobile Floating VisionOS Dock */}
        <div className="lg:hidden fixed bottom-3 inset-x-3 z-50 pointer-events-none flex justify-center">
          <nav className="floating-dock pointer-events-auto w-full max-w-sm px-3 py-2 flex items-center justify-around text-[10px] text-muted shadow-2xl">
            {NAV_ITEMS.map((item) => {
              const Icon = ICONS[item.key];
              const isSmartDirect = item.key === "smart_direct";
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 p-1 transition-all ${
                      isActive ? "text-accent font-bold scale-105" : "hover:text-ink"
                    } relative`
                  }
                >
                  <Icon />
                  <span className="text-[9px] leading-tight">{item.label}</span>
                  {isSmartDirect && (
                    <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-pink-500 animate-pulse" />
                  )}
                </NavLink>
              );
            })}

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 p-1 transition-all ${
                  isActive ? "text-accent font-bold scale-105" : "hover:text-ink"
                }`
              }
            >
              <IconSettings />
              <span className="text-[9px] leading-tight">تنظیمات</span>
            </NavLink>
          </nav>
        </div>

      </div>

    </div>
  );
}
