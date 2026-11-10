import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { CategoryNode } from "./categoryTree";

// One request per page load: the tree changes at most once a day.
let cached: Promise<CategoryNode[]> | null = null;

export function loadCategoryTree(): Promise<CategoryNode[]> {
  cached ??= api<{ results: CategoryNode[] }>("/products/categories/").then((data) => data.results).catch((error) => {
    cached = null;
    throw error;
  });
  return cached;
}

export function useCategoryTree(): CategoryNode[] {
  const [nodes, setNodes] = useState<CategoryNode[]>([]);
  useEffect(() => {
    let alive = true;
    loadCategoryTree().then((rows) => alive && setNodes(rows)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return nodes;
}
