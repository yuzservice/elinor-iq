import { api } from "./api";
import type { SystemStatus } from "../types";

export const systemService = {
  status: () => api<SystemStatus>("/system/status/"),
  syncNow: () => api<{ ok: boolean }>("/system/sync/", { method: "POST" }),
};
