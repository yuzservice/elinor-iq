import { api, queryPath } from "./api";
import type {
  Answers,
  CallListRow,
  CallSettings,
  CallTag,
  CustomerCalls,
  FormSchema,
  ProgramForm,
  ProgramPreview,
  ProgramRow,
  TaskCounts,
  TaskDetail,
  TaskRow,
} from "../features/calls/types";

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

export type TaskListParams = Record<string, string | number | undefined>;

export const callsService = {
  tasks: (params: TaskListParams) =>
    api<{ results: TaskRow[]; total: number; page: number; per_page: number }>(queryPath("/calls/tasks/", params)),
  counts: () => api<TaskCounts>("/calls/tasks/counts/"),
  task: (id: number) => api<TaskDetail>(`/calls/tasks/${id}/`),
  saveLog: (id: number, body: { outcome_id: string; answers: Answers; note: string }) =>
    api<{ log_id: number; result: string; due_at: string | null; followup_at: string | null }>(`/calls/tasks/${id}/logs/`, json("POST", body)),
  bulk: (body: { ids: number[]; action: "postpone" | "priority"; days?: number; value?: boolean }) =>
    api<{ updated: number }>("/calls/tasks/bulk/", json("POST", body)),
  editLog: (id: number, body: { answers: Answers; note: string }) => api(`/calls/logs/${id}/`, json("PATCH", body)),
  customerCalls: (sourceId: number, page = 1) => api<CustomerCalls>(queryPath(`/calls/customers/${sourceId}/`, { page })),

  clearDnc: (sourceId: number, reason: string) => api(`/calls/customers/${sourceId}/clear-dnc/`, json("POST", { reason })),

  tags: () => api<{ results: CallTag[] }>("/calls/tags/"),
  createTag: (body: Partial<CallTag>) => api<CallTag>("/calls/tags/", json("POST", body)),
  updateTag: (id: number, body: Partial<CallTag>) => api<CallTag>(`/calls/tags/${id}/`, json("PATCH", body)),
  settings: () => api<CallSettings>("/calls/settings/"),
  saveSettings: (body: Partial<CallSettings>) => api<CallSettings>("/calls/settings/", json("PUT", body)),
  agents: () => api<{ results: { id: number; username: string }[] }>("/calls/agents/"),

  lists: () => api<{ results: CallListRow[] }>("/calls/lists/"),
  list: (id: number) => api<CallListRow>(`/calls/lists/${id}/`),
  createList: (body: { name: string; kind?: string; filter_params?: unknown; customer_ids?: number[]; create_program?: boolean }) =>
    api<CallListRow & { program_id: number | null }>("/calls/lists/", json("POST", body)),
  updateList: (id: number, body: { name?: string; filter_params?: unknown }) => api<CallListRow>(`/calls/lists/${id}/`, json("PATCH", body)),
  deleteList: (id: number) => api(`/calls/lists/${id}/`, { method: "DELETE" }),
  excelDryRun: (file: File) => {
    const data = new FormData();
    data.append("file", file);
    data.append("dry_run", "1");
    return api<{ total: number; matched: number; unknown: number; unknown_sample: string[] }>("/calls/lists/excel/", { method: "POST", body: data });
  },
  excelCreate: (file: File, name: string) => {
    const data = new FormData();
    data.append("file", file);
    data.append("name", name);
    return api<{ list: CallListRow }>("/calls/lists/excel/", { method: "POST", body: data });
  },

  programs: () => api<{ results: ProgramRow[] }>("/calls/programs/"),
  program: (id: number) => api<ProgramRow>(`/calls/programs/${id}/`),
  createProgram: (name: string) => api<ProgramRow>("/calls/programs/", json("POST", { name })),
  updateProgram: (id: number, body: Record<string, unknown>) => api<ProgramRow>(`/calls/programs/${id}/`, json("PATCH", body)),
  preview: (id: number) => api<ProgramPreview>(`/calls/programs/${id}/preview/`),
  activate: (id: number) => api<ProgramRow>(`/calls/programs/${id}/activate/`, { method: "POST" }),
  programStatus: (id: number, action: "pause" | "resume" | "end") => api<ProgramRow>(`/calls/programs/${id}/status/`, json("POST", { action })),
  form: (id: number) => api<ProgramForm>(`/calls/programs/${id}/form/`),
  saveForm: (id: number, schema: FormSchema) => api(`/calls/programs/${id}/form/`, json("PUT", { schema })),
  publishForm: (id: number) => api(`/calls/programs/${id}/form/publish/`, { method: "POST" }),

  report: <T,>(name: string, params: TaskListParams = {}) => api<T>(queryPath(`/calls/reports/${name}/`, params)),
  closeEscalation: (id: number) => api(`/calls/escalations/${id}/close/`, { method: "POST" }),
};
