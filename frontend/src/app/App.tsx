import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthContext } from "../hooks/useAuth";
import { AppShell } from "../layouts/AppShell";
import { LoginPage } from "../pages/LoginPage";
import { HomePage } from "../pages/HomePage";
import { SalesPage } from "../pages/SalesPage";
import { CustomersPage } from "../pages/CustomersPage";
import { Customer360Page } from "../pages/Customer360Page";
import { ProductsPage } from "../pages/ProductsPage";
import { SmartDirectPage } from "../pages/SmartDirectPage";
import { SettingsPage } from "../pages/SettingsPage";
import { authService } from "../services/auth";
import { ThemeProvider } from "../theme/ThemeProvider";
import type { User } from "../types";

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
                <AppShell />
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
            <Route path="/smart-direct" element={<SmartDirectPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
        </Routes>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}
