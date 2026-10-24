import { useEffect, useState } from "react";
import { customersService } from "../services/customers";
import type { PublicTier } from "../types";

let cached: Promise<PublicTier[]> | null = null;

function load(): Promise<PublicTier[]> {
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

/** Active, enabled tiers in priority order. Fetched once and shared by every caller. */
export function useTiers(): { tiers: PublicTier[]; loading: boolean } {
  const [tiers, setTiers] = useState<PublicTier[]>([]);
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
      .then((next) => alive && setTiers(next))
      .catch(() => alive && setTiers([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [generation]);

  return { tiers, loading };
}
