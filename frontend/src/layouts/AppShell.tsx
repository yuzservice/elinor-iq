import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../theme/ThemeProvider";
import {
  IconCustomers,
  IconHome,
  IconClub,
  IconProducts,
  IconSales,
  IconSettings,
} from "../components/Icons";
import { CoverageNotice } from "../components/ui";
import { NAV_ITEMS } from "../lib/nav";
import { Sidebar } from "./Sidebar";

const ICONS = {
  home: IconHome,
  sales: IconSales,
  customers: IconCustomers,
  club: IconClub,
  products: IconProducts,
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
  const { user } = useAuth();
  const location = useLocation();
  const showCoverageNotice = location.pathname !== "/";

  return (
    <div className="flex min-h-screen bg-canvas text-ink transition-colors">
      
      {/* 1. DESKTOP SIDEBAR (Modular, Redesigned & Responsive) */}
      <Sidebar />

      {/* 2. MAIN CONTENT AREA */}
      <div className="min-w-0 flex-1 flex flex-col">
        
        {/* Mobile Top Header */}
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
              {user?.username?.slice(0, 2).toUpperCase() || "AD"}
            </div>
          </div>
        </header>

        {/* Page Content Canvas */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-3.5 sm:p-6 lg:p-8 space-y-5 sm:space-y-6 pb-28 lg:pb-8">
          {showCoverageNotice ? <CoverageNotice /> : null}
          <Outlet />
        </main>

        {/* Mobile Floating VisionOS Dock */}
        <div className="lg:hidden fixed bottom-3 inset-x-3 z-50 pointer-events-none flex justify-center">
          <nav className="floating-dock pointer-events-auto w-full max-w-sm px-3 py-2 flex items-center justify-around text-[10px] text-muted shadow-2xl">
            {NAV_ITEMS.map((item) => {
              const Icon = ICONS[item.key];
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
