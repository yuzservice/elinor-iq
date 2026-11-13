import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthContext } from "../hooks/useAuth";
import { setVisibleSalesLines } from "../lib/salesLines";
import { AppShell } from "../layouts/AppShell";
import { authService } from "../services/auth";
import { ThemeProvider } from "../theme/ThemeProvider";
import { CONTENT_ROLE, SALES_AGENT_ROLE } from "../lib/nav";
import type { User } from "../types";

// Every route is its own chunk: the first load fetches only the shell and the page being opened.
const LoginPage = lazy(() => import("../pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const HomePage = lazy(() => import("../pages/HomePage").then((module) => ({ default: module.HomePage })));
const CustomersPage = lazy(() => import("../pages/CustomersPage").then((module) => ({ default: module.CustomersPage })));
const Customer360Page = lazy(() => import("../pages/Customer360Page").then((module) => ({ default: module.Customer360Page })));
const ProductsPage = lazy(() => import("../pages/ProductsPage").then((module) => ({ default: module.ProductsPage })));
const Product360Page = lazy(() => import("../pages/Product360Page").then((module) => ({ default: module.Product360Page })));
const SettingsPage = lazy(() => import("../pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const CallCenterPage = lazy(() => import("../pages/CallCenterPage").then((module) => ({ default: module.CallCenterPage })));
const PulsePage = lazy(() => import("../pages/PulsePage").then((module) => ({ default: module.PulsePage })));

function page(element: JSX.Element) {
  return <Suspense fallback={<div className="p-8 text-sm text-muted">در حال دریافت اطلاعات...</div>}>{element}</Suspense>;
}

/** Agents only reach /calls and Customer 360, the content team only /pulse; the API enforces the same rules. */
function AgentRedirect({ user }: { user: User }) {
  const { pathname } = useLocation();
  if (user.role === SALES_AGENT_ROLE && !/^\/(calls|customers\/\d+)/.test(pathname)) return <Navigate to="/calls" replace />;
  if (user.role === CONTENT_ROLE && !pathname.startsWith("/pulse")) return <Navigate to="/pulse" replace />;
  return <AppShell />;
}

export function App() {
  const [user, setUserState] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const setUser = (next: User | null) => {
    setVisibleSalesLines(next?.visible_sales_lines);
    setUserState(next);
  };

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
          <Route path="/login" element={page(<LoginPage />)} />
          <Route
            element={
              user ? (
                <AgentRedirect user={user} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          >
            <Route path="/" element={page(<HomePage />)} />
            <Route path="/sales" element={<Navigate to="/" replace />} />
            <Route path="/customers" element={page(<CustomersPage />)} />
            <Route path="/customers/:id" element={page(<Customer360Page />)} />
            <Route path="/products" element={page(<ProductsPage />)} />
            <Route path="/products/:id" element={page(<Product360Page />)} />
            <Route path="/settings" element={page(<SettingsPage />)} />
            <Route
              path="/calls"
              element={
                <Suspense fallback={<div className="p-8 text-sm text-muted">در حال دریافت اطلاعات...</div>}>
                  <CallCenterPage />
                </Suspense>
              }
            />
            {user?.features?.pulse ? (
              <Route
                path="/pulse"
                element={
                  <Suspense fallback={<div className="p-8 text-sm text-muted">در حال دریافت اطلاعات...</div>}>
                    <PulsePage />
                  </Suspense>
                }
              />
            ) : null}
          </Route>
          <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
        </Routes>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}
