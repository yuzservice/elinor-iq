import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthContext } from "../hooks/useAuth";
import { AppShell } from "../layouts/AppShell";
import { LoginPage } from "../pages/LoginPage";
import { HomePage } from "../pages/HomePage";
import { SalesPage } from "../pages/SalesPage";
import { CustomersPage } from "../pages/CustomersPage";
import { Customer360Page } from "../pages/Customer360Page";
import { ProductsPage } from "../pages/ProductsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { authService } from "../services/auth";
import { ThemeProvider } from "../theme/ThemeProvider";
import { SALES_AGENT_ROLE } from "../lib/nav";
import type { User } from "../types";

const CallCenterPage = lazy(() => import("../pages/CallCenterPage").then((module) => ({ default: module.CallCenterPage })));

/** Agents only reach /calls and Customer 360; the API enforces the same rule. */
function AgentRedirect({ user }: { user: User }) {
  const { pathname } = useLocation();
  if (user.role === SALES_AGENT_ROLE && !/^\/(calls|customers\/\d+)/.test(pathname)) return <Navigate to="/calls" replace />;
  return <AppShell />;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    authService
      .csrf()
      .then(() => authService.me())
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      login: async (username: string, password: string) => {
        const next = await authService.login(username, password);
        setUser(next);
      },
      logout: async () => {
        try {
          await authService.logout();
        } finally {
          setUser(null);
        }
      },
    }),
    [user, ready],
  );

  if (!ready) {
    return (
      <ThemeProvider>
        <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">در حال دریافت اطلاعات...</div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <AuthContext.Provider value={value}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              user ? (
                <AgentRedirect user={user} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          >
            <Route path="/" element={<HomePage />} />
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<Customer360Page />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="/calls"
              element={
                <Suspense fallback={<div className="p-8 text-sm text-muted">در حال دریافت اطلاعات...</div>}>
                  <CallCenterPage />
                </Suspense>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
        </Routes>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}
