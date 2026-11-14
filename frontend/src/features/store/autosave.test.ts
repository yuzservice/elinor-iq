import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosave, createSerial, type SaveStatus, type VersionRef } from "./autosave";

type Result = { version: number; ids?: Record<string, number> };

function setup(save: (doc: number, version: number | null) => Promise<Result>, version: VersionRef = { current: 1 }, onBlocked?: (m: string) => void) {
  let doc = 0;
  const statuses: SaveStatus[] = [];
  const saved: Result[] = [];
  const autosave = new Autosave<number, Result>({
    build: () => doc,
    save: (d, v) => save(d, v),
    onSaved: (r) => saved.push(r),
    onStatus: (s) => statuses.push(s),
    onBlocked,
    version,
  });
  return { autosave, statuses, saved, version, edit: (next: number) => ((doc = next), autosave.change()) };
}

const ok = (version: number, ids: Record<string, number> = {}) => Promise.resolve({ version, ids });
type SaveResult = Result;

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
    const save = vi.fn().mockRejectedValue(Object.assign(new Error("conflict"), { status: 409, code: "version_conflict" }));
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

  it("drops a blocked change, reports it, and keeps autosaving", async () => {
    const blocked: string[] = [];
    const save = vi.fn().mockRejectedValueOnce(Object.assign(new Error("پله ۲ این بازو …"), { status: 409, code: "blocked" })).mockImplementation(() => ok(2));
    const { autosave, edit } = setup(save, { current: 1 }, (m) => blocked.push(m));
    edit(1);
    await autosave.flush();
    expect(blocked).toEqual(["پله ۲ این بازو …"]);
    expect(autosave.status).toBe("error");
    expect(autosave.unsaved).toBe(false);
    edit(2);
    await autosave.flush();
    expect(autosave.status).toBe("saved");
  });

  it("shares one version between autosaves and runs their saves one at a time", async () => {
    const version: VersionRef = { current: 5 };
    const serial = createSerial();
    const order: string[] = [];
    const make = (name: string) => new Autosave<number, Result>({
      build: () => 0,
      save: async (_d, v) => {
        order.push(`${name}@${v}`);
        await Promise.resolve();
        return { version: (v ?? 0) + 1 };
      },
      onSaved: () => undefined,
      onStatus: () => undefined,
      version, serial,
    });
    const layout = make("layout"), templates = make("templates");
    layout.change();
    templates.change();
    await Promise.all([layout.flush(), templates.flush()]);
    expect(order).toEqual(["layout@5", "templates@6"]);
    expect(version.current).toBe(7);
  });
});
