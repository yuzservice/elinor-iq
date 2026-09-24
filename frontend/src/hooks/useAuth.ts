import { createContext, useContext } from "react";
import type { User } from "../types";

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  ready: false,
  login: async () => undefined,
  logout: async () => undefined,
});

export function useAuth() {
  return useContext(AuthContext);
}
