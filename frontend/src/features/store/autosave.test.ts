import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosave, type SaveResult, type SaveStatus } from "./autosave";

function setup(save: (doc: number, version: number | null) => Promise<SaveResult>) {
  let doc = 0;
  const statuses: SaveStatus[] = [];
  const saved: SaveResult[] = [];
  const autosave = new Autosave<number>({
    build: () => doc,
    save: (d, v) => save(d, v),
    onSaved: (r) => saved.push(r),
    onStatus: (s) => statuses.push(s),
    version: 1,
  });
  return { autosave, statuses, saved, edit: (next: number) => ((doc = next), autosave.change()) };
}

const ok = (version: number, ids: Record<string, number> = {}) => Promise.resolve({ version, ids });

describe("designer autosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces changes into one save about a second after the last change", async () => {
    const save = vi.fn((_d: number, v: number | null) => ok((v ?? 0) + 1));
    const { autosave, statuses, edit } = setup(save);
    edit(1);
    vi.advanceTimersByTime(600);
    edit(2);
    vi.advanceTimersByTime(600);
    expect(save).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toBe("dirty");
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(2, 1);
    expect(autosave.version).toBe(2);
    expect(statuses.slice(-2)).toEqual(["saving", "saved"]);
    expect(autosave.unsaved).toBe(false);
  });

  it("builds the document when the save starts, after the previous save's ids", async () => {
    let release: (r: SaveResult) => void = () => {};
    const save = vi.fn((_d: number, v: number | null) => (v === 1 ? new Promise<SaveResult>((r) => (release = r)) : ok((v ?? 0) + 1)));
    const { autosave, edit, saved } = setup(save);
    edit(1);
    const first = autosave.flush();
    edit(2); // while the first save is in flight
    expect(save).toHaveBeenCalledTimes(1);
    release({ version: 2, ids: { k1: 10 } });
    await first;
    expect(saved[0].ids).toEqual({ k1: 10 });
    expect(autosave.status).toBe("dirty");
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenLastCalledWith(2, 2);
    expect(autosave.status).toBe("saved");
  });

  it("shows an error, keeps the change and retries on demand", async () => {
    const save = vi.fn().mockRejectedValueOnce(Object.assign(new Error("network"), { status: 0 })).mockImplementation(() => ok(2));
    const { autosave, statuses, edit } = setup(save);
    edit(1);
    await autosave.flush();
    expect(statuses.at(-1)).toBe("error");
    expect(autosave.unsaved).toBe(true);
    await autosave.flush(); // «تلاش دوباره»
    expect(save).toHaveBeenCalledTimes(2);
    expect(autosave.status).toBe("saved");
  });

  it("stops on a version conflict and never overwrites", async () => {
    const save = vi.fn().mockRejectedValue(Object.assign(new Error("conflict"), { status: 409 }));
    const { autosave, edit } = setup(save);
    edit(1);
    await autosave.flush();
    expect(autosave.status).toBe("conflict");
    edit(2);
    await vi.advanceTimersByTimeAsync(2000);
    await autosave.flush(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.unsaved).toBe(true);
  });

  it("saves everything at once when the page is left", async () => {
    const save = vi.fn((_d: number, v: number | null) => ok((v ?? 0) + 1));
    const { autosave, edit } = setup(save);
    edit(5);
    await autosave.flush(true);
    expect(save).toHaveBeenCalledWith(5, 1);
    expect(autosave.unsaved).toBe(false);
  });
});
