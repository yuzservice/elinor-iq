import { api } from "./api";
import type { User } from "../types";

export const authService = {
  csrf: () => api<{ ok: boolean }>("/auth/csrf/"),
  login: (username: string, password: string) =>
    api<User>("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => api<{ ok: boolean }>("/auth/logout/", { method: "POST" }),
  me: () => api<User>("/auth/me/"),
};
