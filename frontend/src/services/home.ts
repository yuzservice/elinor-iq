import { api, queryPath } from "./api";
import type { HomeSummary } from "../types";

export const homeService = {
  summary: (from?: string, to?: string) =>
    api<HomeSummary>(queryPath("/home/summary/", { from, to })),
};
