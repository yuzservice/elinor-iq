// @vitest-environment jsdom
/** The sales page is gone: `/sales` (and any query it carried) lands on «/», which is now the sales page. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function Where() {
  const { pathname } = useLocation();
  return <span data-testid="path">{pathname}</span>;
}

/** The same route pair as app/App.tsx, without the lazy pages (they need the API and the auth shell). */
function Routed({ start }: { start: string }) {
  return (
    <MemoryRouter initialEntries={[start]}>
      <Where />
      <Routes>
        <Route path="/" element={<span>home</span>} />
        <Route path="/sales" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MemoryRouter>
  );
}

const path = () => host.querySelector("[data-testid=path]")!.textContent;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("/sales redirect", () => {
  it("redirects /sales to /", () => {
    act(() => root.render(<Routed start="/sales" />));
    expect(path()).toBe("/");
  });

  it("redirects an old /sales URL with query params to /", () => {
    act(() => root.render(<Routed start="/sales?period=30&line=SARI" />));
    expect(path()).toBe("/");
  });

  it("leaves / alone", () => {
    act(() => root.render(<Routed start="/" />));
    expect(path()).toBe("/");
    expect(host.textContent).toContain("home");
  });
});
