import { api, queryPath } from "./api";
import type {
  Paginated,
  SmartDirectDebug,
  SmartDirectSessionSummary,
  SmartDirectSummary,
} from "../types";

export const smartDirectService = {
  summary: () => api<SmartDirectSummary>("/smart-direct/summary/"),
  debug: () => api<SmartDirectDebug>("/smart-direct/debug/"),
  sessions: (page = 1) =>
    api<Paginated<SmartDirectSessionSummary>>(queryPath("/smart-direct/sessions/", { page, per_page: 20 })),
  session: (id: number) => api<SmartDirectSessionSummary>(`/smart-direct/sessions/${id}/`),
  reply: (id: number, text: string) =>
    api<{ ok: boolean; message_id: string; session_id: number }>(`/smart-direct/sessions/${id}/reply/`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
};
