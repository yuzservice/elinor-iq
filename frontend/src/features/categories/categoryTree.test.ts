import { describe, expect, it } from "vitest";
import { checkState, indexTree, searchNodes, toggleNode, type CategoryNode } from "./categoryTree";

const node = (id: number, title: string, parent_id: number | null, path: string): CategoryNode => ({ id, title, label: title, path, parent_id, depth: 0, has_children: false });
const nodes = [
  node(1, "پوشاک", null, "پوشاک"),
  node(2, "مانتو", 1, "پوشاک › مانتو"),
  node(3, "مانتو کتان", 2, "پوشاک › مانتو › مانتو کتان"),
  node(4, "مانتو جین", 2, "پوشاک › مانتو › مانتو جین"),
  node(5, "شلوار", 1, "پوشاک › شلوار"),
  node(6, "کیف", null, "کیف"),
];
const index = indexTree(nodes);

describe("category tree selection", () => {
  it("parent selects all descendants, partial state above", () => {
    const sel = toggleNode(2, [], index);
    expect(sel).toEqual([2]);
    expect(checkState(3, sel, index)).toBe("on");
    expect(checkState(1, sel, index)).toBe("partial");
    expect(checkState(5, sel, index)).toBe("off");
  });
  it("unticking a child of a selected parent keeps the siblings", () => {
    expect(toggleNode(3, [1], index)).toEqual([4, 5]);
    expect(toggleNode(3, [2], index)).toEqual([4]);
  });
  it("selecting every child selects the parent", () => {
    expect(toggleNode(4, [3], index)).toEqual([2]);
    expect(toggleNode(5, [2], index)).toEqual([1]);
  });
  it("selecting a parent replaces its selected descendants", () => {
    expect(toggleNode(1, [3, 6], index)).toEqual([1, 6]);
  });
  it("search returns full paths", () => {
    expect(searchNodes(nodes, "کتان").map((n) => n.path)).toEqual(["پوشاک › مانتو › مانتو کتان"]);
  });
});
