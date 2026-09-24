import type { SalesLineFilter } from "../../services/sales";
import type { SalesLineKey } from "../../types";

export type SalesFilterOption = {
  key: string;
  label: string;
  scope?: "online" | "pos";
};

export type SalesFilterOptions = {
  branches: SalesFilterOption[];
  channels: SalesFilterOption[];
  payment_methods: SalesFilterOption[];
};

export type SalesFilterValues = {
  from: string;
  to: string;
  branches: string[];
  channels: string[];
  payments: string[];
  compareEnabled: boolean;
  compareFrom: string;
  compareTo: string;
};

export const EMPTY_SALES_FILTERS: SalesFilterValues = {
  from: "",
  to: "",
  branches: [],
  channels: [],
  payments: [],
  compareEnabled: false,
  compareFrom: "",
  compareTo: "",
};

const ONLINE_CHANNEL_KEYS = new Set(["website", "shopino", "digify"]);

export function buildSalesKpiParams(filters: SalesFilterValues) {
  return {
    from: filters.from,
    to: filters.to,
    branches: filters.branches.join(","),
    channels: filters.channels.join(","),
    payments: filters.payments.join(","),
    compare_from:
      filters.compareEnabled && filters.compareFrom ? filters.compareFrom : undefined,
    compare_to: filters.compareEnabled && filters.compareTo ? filters.compareTo : undefined,
  };
}

export function deriveSalesLineFilter(branches: string[], channels: string[]): SalesLineFilter {
  const onlineOnly =
    channels.length > 0 && channels.every((key) => ONLINE_CHANNEL_KEYS.has(key)) && !channels.includes("pos");
  const posOnly = channels.length > 0 && channels.includes("pos") && channels.every((key) => key === "pos");

  if (onlineOnly) return "ONLINE";
  if (branches.length === 1 && (channels.length === 0 || posOnly)) {
    return branches[0] as SalesLineKey;
  }
  return "all";
}

export function isBranchFilterDisabled(channels: string[]): boolean {
  return channels.length > 0 && channels.every((key) => ONLINE_CHANNEL_KEYS.has(key));
}

export function hasActiveSalesFilters(values: SalesFilterValues): boolean {
  return Boolean(
    values.from ||
      values.to ||
      values.branches.length ||
      values.channels.length ||
      values.payments.length ||
      values.compareEnabled ||
      values.compareFrom ||
      values.compareTo,
  );
}

export function describeSalesFilterSelections(
  values: SalesFilterValues,
  options: SalesFilterOptions = { branches: [], channels: [], payment_methods: [] },
): string[] {
  const chips: string[] = [];
  const findLabel = (list: SalesFilterOption[], key: string) =>
    list.find((item) => item.key === key)?.label || key;

  if (values.from || values.to) {
    chips.push(`بازه ${values.from || "…"} تا ${values.to || "…"}`);
  }
  if (values.branches.length) {
    chips.push(values.branches.map((key) => findLabel(options.branches, key)).join("، "));
  }
  if (values.channels.length) {
    chips.push(values.channels.map((key) => findLabel(options.channels, key)).join("، "));
  }
  if (values.payments.length) {
    chips.push(values.payments.map((key) => findLabel(options.payment_methods, key)).join("، "));
  }
  if (values.compareEnabled && (values.compareFrom || values.compareTo)) {
    chips.push(`مقایسه ${values.compareFrom || "…"} تا ${values.compareTo || "…"}`);
  }
  return chips;
}

export function selectionLabel(
  selected: string[],
  options: SalesFilterOption[],
  allLabel: string,
): string {
  if (!selected.length) return allLabel;
  if (selected.length === 1) {
    return findOptionLabel(options, selected[0]) || allLabel;
  }
  return `${selected.length} مورد`;
}

function findOptionLabel(options: SalesFilterOption[], key: string): string | undefined {
  return options.find((item) => item.key === key)?.label;
}
