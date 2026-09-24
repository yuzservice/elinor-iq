import { api } from "./api";
import type { SystemStatus } from "../types";

export type PanelAdmin = {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
};

export const systemService = {
  status: () => api<SystemStatus>("/system/status/"),
  syncNow: () => api<{ ok: boolean; message?: string }>("/system/sync/", { method: "POST" }),
  syncPosRange: (body: { from: string; to: string; branches: string[] }) =>
    api<{ ok: boolean; message?: string }>("/system/sync/", { method: "POST", body: JSON.stringify(body) }),
  saveApi: (body: { base_url: string; username: string; password: string }) =>
    api<{ ok: boolean }>("/system/api-config/", { method: "PUT", body: JSON.stringify(body) }),
  admins: () => api<{ results: PanelAdmin[] }>("/system/admins/"),
  createAdmin: (body: { username: string; password: string }) =>
    api<PanelAdmin>("/system/admins/", { method: "POST", body: JSON.stringify(body) }),
};
