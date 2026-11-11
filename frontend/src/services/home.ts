import { api, queryPath } from "./api";
import type { CopyPreview, TargetGrid, TargetProgress, TargetScope } from "../features/home/types";
import type { HomePeriod, HomeSummary } from "../types";

export const homeService = {
  summary: (period: HomePeriod = "month") =>
    api<HomeSummary>(queryPath("/home/summary/", { period })),
  targets: (scope: TargetScope) => api<TargetProgress>(queryPath("/home/targets/", { scope })),
  targetGrid: (year?: number) => api<TargetGrid>(queryPath("/sales/targets/", { year })),
  saveTargets: (year: number, cells: { month: number; sales_line: string; amount: number | null }[], source: "manual" | "copy" = "manual") =>
    api<TargetGrid>("/sales/targets/", { method: "PUT", body: JSON.stringify({ year, cells, source }) }),
  copyPreview: (year: number, growth: number) => api<CopyPreview>(queryPath("/sales/targets/copy-preview/", { year, growth })),
};
