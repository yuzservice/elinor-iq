import { api, queryPath } from "./api";
import type { CopyPreview, HomeData, TargetGrid, TargetProgress, TargetScope } from "../features/home/types";

export const homeService = {
  summary: (params: Record<string, string | undefined>) => api<HomeData>(queryPath("/home/summary/", params)),
  targets: (scope: TargetScope, line?: string) => api<TargetProgress>(queryPath("/home/targets/", { scope, line })),
  targetGrid: (year?: number) => api<TargetGrid>(queryPath("/sales/targets/", { year })),
  saveTargets: (year: number, cells: { month: number; sales_line: string; amount: number | null }[], source: "manual" | "copy" = "manual") =>
    api<TargetGrid>("/sales/targets/", { method: "PUT", body: JSON.stringify({ year, cells, source }) }),
  copyPreview: (year: number, growth: number) => api<CopyPreview>(queryPath("/sales/targets/copy-preview/", { year, growth })),
};
