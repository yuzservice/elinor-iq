import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { IconCollapse, IconCustomers, IconHome, IconLogout, IconProducts, IconSales, IconSettings, IconSmartDirect } from "../components/Icons";
import { CoverageNotice, IconButton, ThemeSwitch } from "../components/ui";
import { NAV_ITEMS } from "../lib/nav";

const ICONS = {
  home: IconHome,
  sales: IconSales,
  customers: IconCustomers,
  products: IconProducts,
  smart_direct: IconSmartDirect,
};

export function AppShell() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const showCoverageNotice = location.pathname !== "/";

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside
        className={`sticky top-0 flex h-screen shrink-0 flex-col border-l border-line bg-surface shadow-soft transition-[width] duration-200 ${
          collapsed ? "w-[76px]" : "w-[228px]"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <div className={collapsed ? "hidden" : "block"}>
            <div className="text-[11px] font-semibold tracking-brand text-accent">ELINOR</div>
            <div className="mt-1 text-sm font-medium text-ink">Intelligence</div>
          </div>
          <IconButton onClick={() => setCollapsed((value) => !value)} aria-label="جمع شدن منو">
            <span className={collapsed ? "inline-block rotate-180" : ""}>
              <IconCollapse />
            </span>
          </IconButton>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-2">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.key];
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive ? "bg-accent text-on-accent" : "text-muted hover:bg-hover hover:text-ink"
                  }`
                }
              >
                <Icon />
                {!collapsed ? <span>{item.label}</span> : null}
              </NavLink>
            );
          })}
          <div className="mt-auto" />
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                isActive ? "bg-accent text-on-accent" : "text-muted hover:bg-hover hover:text-ink"
              }`
            }
          >
            <IconSettings />
            {!collapsed ? <span>تنظیمات</span> : null}
          </NavLink>
        </nav>
        <div className="border-t border-line px-3 py-4">
          <div className={collapsed ? "hidden" : "mb-3 flex justify-center"}>
            <ThemeSwitch />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-xs text-accent">
              {user?.username?.slice(0, 1).toUpperCase()}
            </div>
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{user?.username}</div>
                <div className="text-[11px] text-faint">مدیر</div>
              </div>
            ) : null}
            <IconButton
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              aria-label="خروج"
            >
              <IconLogout />
            </IconButton>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full max-w-[1400px] px-8 py-8 lg:px-10">
          {showCoverageNotice ? <CoverageNotice /> : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
