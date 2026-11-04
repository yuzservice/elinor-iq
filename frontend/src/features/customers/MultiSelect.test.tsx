// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultiSelect } from "./MultiSelect";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const options = [{ value: "a", label: "الف" }, { value: "b", label: "ب" }, { value: "c", label: "ج", count: 0 }];
let host: HTMLDivElement;
let root: Root;

function render(selected: string[], onChange = vi.fn(), extra: Partial<Parameters<typeof MultiSelect>[0]> = {}) {
  act(() => root.render(<MultiSelect label="سطح" options={options} selected={selected} onChange={onChange} {...extra} />));
  return onChange;
}
const key = (target: Element, name: string) => act(() => target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true })));
const toggle = () => host.querySelector<HTMLButtonElement>("button[aria-haspopup=listbox]")!;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("MultiSelect", () => {
  it("shows «همه», one name, or a count with a clear button", () => {
    render([]);
    expect(toggle().textContent).toContain("همه");
    expect(host.querySelector("[aria-label='پاک کردن سطح']")).toBeNull();
    render(["b"]);
    expect(toggle().textContent).toContain("ب");
    const onChange = render(["a", "b"]);
    expect(toggle().textContent).toContain("۲ مورد");
    act(() => host.querySelector<HTMLButtonElement>("[aria-label='پاک کردن سطح']")!.click());
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("opens with arrows, moves between options, toggles with Enter, closes with Escape", () => {
    const onChange = render([]);
    toggle().focus();
    key(toggle(), "ArrowDown");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const boxes = () => Array.from(host.querySelectorAll<HTMLInputElement>("[role=listbox] input[type=checkbox]"));
    expect(document.activeElement).toBe(boxes()[0]);
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(boxes()[1]);
    key(document.activeElement!, "Enter");
    expect(onChange).toHaveBeenCalledWith(["b"]);
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    key(document.activeElement!, "Escape");
    window.removeEventListener("keydown", outer);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle());
    expect(outer).not.toHaveBeenCalled(); // the filter panel stays open
  });

  it("closes on an outside click and keeps a single value when single", () => {
    const onChange = render(["a"], vi.fn(), { single: true });
    act(() => toggle().click());
    act(() => host.querySelectorAll<HTMLInputElement>("[role=listbox] input")[1].click());
    expect(onChange).toHaveBeenCalledWith(["b"]);
    act(() => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("adds a search box only for long lists", () => {
    render([]);
    act(() => toggle().click());
    expect(host.querySelector("input[type=search]")).toBeNull();
    const many = Array.from({ length: 9 }, (_, index) => ({ value: String(index), label: `گزینه ${index}` }));
    act(() => root.render(<MultiSelect label="شهر" options={many} selected={[]} onChange={vi.fn()} />));
    act(() => toggle().click());
    act(() => toggle().click());
    expect(host.querySelector("input[type=search]")).not.toBeNull();
  });
});
