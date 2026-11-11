/** Shared category tree: selection rules (pure, tested). A selected parent stands for its whole subtree. */

export type CategoryNode = {
  id: number;
  title: string;
  label: string; // short path where titles repeat: «مانتو (پوشاک)»
  path: string; // full path for search results
  parent_id: number | null;
  depth: number;
  has_children: boolean;
};

export type TreeIndex = { byId: Map<number, CategoryNode>; children: Map<number | null, number[]> };

export function indexTree(nodes: CategoryNode[]): TreeIndex {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<number | null, number[]>();
  nodes.forEach((node) => {
    const parent = node.parent_id != null && byId.has(node.parent_id) ? node.parent_id : null;
    children.set(parent, [...(children.get(parent) ?? []), node.id]);
  });
  return { byId, children };
}

function ancestors(id: number, index: TreeIndex): number[] {
  const out: number[] = [];
  let parent = index.byId.get(id)?.parent_id ?? null;
  while (parent != null && index.byId.has(parent)) {
    out.push(parent);
    parent = index.byId.get(parent)?.parent_id ?? null;
  }
  return out;
}

function descendants(id: number, index: TreeIndex): number[] {
  const out: number[] = [];
  const stack = [...(index.children.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop() as number;
    out.push(next);
    stack.push(...(index.children.get(next) ?? []));
  }
  return out;
}

export type CheckState = "on" | "partial" | "off";

export function checkState(id: number, selected: number[], index: TreeIndex): CheckState {
  const set = new Set(selected);
  if (set.has(id) || ancestors(id, index).some((a) => set.has(a))) return "on";
  return descendants(id, index).some((d) => set.has(d)) ? "partial" : "off";
}

/** Toggle one node; returns the minimal selection (no node together with its ancestor). */
export function toggleNode(id: number, selected: number[], index: TreeIndex): number[] {
  const set = new Set(selected);
  const state = checkState(id, selected, index);
  if (state !== "on") {
    descendants(id, index).forEach((d) => set.delete(d));
    set.add(id);
    return normalize([...set], index);
  }
  if (set.has(id)) {
    set.delete(id);
    return [...set];
  }
  // Selected through an ancestor: drop the ancestor and keep its other branches down to this node.
  const chain = ancestors(id, index);
  const top = chain.find((a) => set.has(a)) as number;
  set.delete(top);
  let path = [id, ...chain.slice(0, chain.indexOf(top))];
  let parent = top;
  while (path.length) {
    const along = path[path.length - 1];
    (index.children.get(parent) ?? []).forEach((child) => child !== along && set.add(child));
    parent = along;
    path = path.slice(0, -1);
  }
  return normalize([...set], index);
}

/** When every child of a node is selected, select the node instead. */
function normalize(selected: number[], index: TreeIndex): number[] {
  let set = new Set(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [parent, kids] of index.children) {
      if (parent == null || set.has(parent) || !kids.length || !kids.every((kid) => set.has(kid))) continue;
      kids.forEach((kid) => set.delete(kid));
      set.add(parent);
      changed = true;
    }
    set = new Set([...set].filter((id) => !ancestors(id, index).some((a) => set.has(a))));
  }
  return [...set].sort((a, b) => a - b);
}

export function searchNodes(nodes: CategoryNode[], query: string): CategoryNode[] {
  const q = query.trim().toLowerCase();
  return q ? nodes.filter((node) => node.path.toLowerCase().includes(q)) : [];
}

export function selectionText(selected: number[], index: TreeIndex): string {
  if (!selected.length) return "همه";
  if (selected.length === 1) return index.byId.get(selected[0])?.label ?? "۱ دسته";
  return `${new Intl.NumberFormat("fa-IR").format(selected.length)} دسته`;
}

export function parseIds(raw: string | null): number[] {
  return (raw ?? "").split(",").map((part) => Number(part.trim())).filter((value) => Number.isInteger(value) && value > 0);
}
