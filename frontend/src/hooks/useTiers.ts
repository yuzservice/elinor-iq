import { useEffect, useState } from "react";
import { customersService } from "../services/customers";
import type { PublicTier, PublicTierGroup } from "../types";

let cached: Promise<PublicTierGroup[]> | null = null;

function load(): Promise<PublicTierGroup[]> {
  if (!cached) {
    cached = customersService
      .tiers()
      .then((payload) => payload.results)
      .catch((error) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}

/** Drop the shared tier list, e.g. after a new rule version is activated. */
export function invalidateTiers() {
  cached = null;
  listeners.forEach((listener) => listener());
}

const listeners = new Set<() => void>();

/** Flat list of tiers with their channel, in group order. */
export function flattenTierGroups(groups: PublicTierGroup[]): PublicTier[] {
  return groups.flatMap((group) =>
    group.tiers.map((tier) => ({ ...tier, channel: group.channel, channel_label: group.channel_label })),
  );
}

/** Active, enabled tiers grouped by channel (and flattened). Fetched once and shared by every caller. */
export function useTiers(): { tiers: PublicTier[]; groups: PublicTierGroup[]; loading: boolean } {
  const [groups, setGroups] = useState<PublicTierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const listener = () => setGeneration((value) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((next) => alive && setGroups(next))
      .catch(() => alive && setGroups([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [generation]);

  return { tiers: flattenTierGroups(groups), groups, loading };
}
