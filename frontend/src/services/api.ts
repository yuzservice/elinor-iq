const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

async function getCsrfToken(): Promise<string> {
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  await fetch(`${API_BASE}/auth/csrf/`, { credentials: "include" });
  const next = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  return next ? decodeURIComponent(next[1]) : "";
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init.method && init.method !== "GET") {
    headers.set("X-CSRFToken", await getCsrfToken());
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data && typeof data === "object" && "detail" in data ? String(data.detail) : "";
    throw new ApiError(detail || "دریافت اطلاعات با خطا مواجه شد.", response.status);
  }
  return data as T;
}

export function queryPath(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
