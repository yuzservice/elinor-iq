import { api, queryPath } from "./api";
import type { HomePeriod, HomeSummary } from "../types";

export const homeService = {
  summary: (period: HomePeriod = "month") =>
    api<HomeSummary>(queryPath("/home/summary/", { period })),
};
