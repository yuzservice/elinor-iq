/** Designer and template autosave: one save in flight at a time, debounced after each change, flushed on page hide or
 * leave. The document is built when the save starts (not when the change happened), so ids returned by the previous save
 * are always included and nothing is created twice. Several instances share one layout version (`version`) and one queue
 * (`serial`). A version conflict (409) stops autosaving until reload; a blocked change (409 «blocked») is dropped and
 * reported through `onBlocked` so the page can put the saved state back. */

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export type SaveResult = { version: number };
export type VersionRef = { current: number | null };

type Options<D, R extends SaveResult> = {
  build: () => D;
  save: (doc: D, version: number | null, leaving: boolean) => Promise<R>;
  onSaved: (result: R) => void;
  onStatus: (status: SaveStatus, message?: string) => void;
  onBlocked?: (message: string) => void;
  version: VersionRef;
  serial?: <T>(task: () => Promise<T>) => Promise<T>;
  delay?: number;
};

/** A queue that runs saves one after another (shared by every autosave on the page). */
export function createSerial() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task, task);
    tail = next.catch(() => undefined);
    return next;
  };
}

export const SAVE_TEXT: Record<SaveStatus, string> = {
  idle: "",
  dirty: "در حال ذخیره…",
  saving: "در حال ذخیره…",
  saved: "ذخیره شد ✓",
  error: "ذخیره نشد — تلاش دوباره",
  conflict: "نسخه جدیدتری ذخیره شده است",
};

export class Autosave<D, R extends SaveResult = SaveResult> {
  status: SaveStatus = "idle";
  private dirty = false;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: Options<D, R>) {}

  get version() {
    return this.options.version.current;
  }

  /** Something changed: save about a second after the last change. */
  change() {
    if (this.status === "conflict") return;
    this.dirty = true;
    if (!this.running) this.set("dirty");
    this.clearTimer();
    this.timer = setTimeout(() => void this.flush(), this.options.delay ?? 1000);
  }

  /** Save now (page hide, navigation, «تلاش دوباره»). Resolves when nothing is left to save. */
  async flush(leaving = false): Promise<void> {
    this.clearTimer();
    if (this.status === "conflict") return;
    while (this.running) await this.running;
    if (!this.dirty) return;
    this.running = this.run(leaving);
    try {
      await this.running;
    } finally {
      this.running = null;
    }
    // Changes made during the save wait for their own debounce, unless the page is being left.
    if (leaving && this.dirty && this.status === "dirty") return this.flush(true);
  }

  /** True while a change has not reached the server. */
  get unsaved() {
    return this.dirty || this.running !== null;
  }

  dispose() {
    this.clearTimer();
  }

  private async run(leaving: boolean) {
    this.dirty = false;
    this.set("saving");
    const serial = this.options.serial ?? (<T>(task: () => Promise<T>) => task());
    try {
      const result = await serial(() => this.options.save(this.options.build(), this.options.version.current, leaving));
      this.options.version.current = result.version;
      this.options.onSaved(result);
      this.set(this.dirty ? "dirty" : "saved");
    } catch (error) {
      const { status, code, message } = error as { status?: number; code?: string; message: string };
      if (status === 409 && code === "blocked") {
        this.set("error", message);
        this.options.onBlocked?.(message);
        return;
      }
      this.dirty = true;
      if (status === 409) this.set("conflict", message);
      else this.set("error", message);
    }
  }

  private set(status: SaveStatus, message?: string) {
    this.status = status;
    this.options.onStatus(status, message);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
