/** Designer autosave: one save in flight at a time, debounced after each change, flushed on page hide or leave.
 * The document is built when the save starts (not when the change happened), so ids returned by the previous save are
 * always included and a new rack is never created twice. A 409 stops autosaving until the page is reloaded. */

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export type SaveResult = { version: number; ids: Record<string, number> };

type Options<D> = {
  build: () => D;
  save: (doc: D, version: number | null, leaving: boolean) => Promise<SaveResult>;
  onSaved: (result: SaveResult) => void;
  onStatus: (status: SaveStatus, message?: string) => void;
  version: number | null;
  delay?: number;
};

export const SAVE_TEXT: Record<SaveStatus, string> = {
  idle: "",
  dirty: "در حال ذخیره…",
  saving: "در حال ذخیره…",
  saved: "ذخیره شد ✓",
  error: "ذخیره نشد — تلاش دوباره",
  conflict: "نسخه جدیدتری ذخیره شده است",
};

export class Autosave<D> {
  version: number | null;
  status: SaveStatus = "idle";
  private dirty = false;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: Options<D>) {
    this.version = options.version;
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
    try {
      const result = await this.options.save(this.options.build(), this.version, leaving);
      this.version = result.version;
      this.options.onSaved(result);
      this.set(this.dirty ? "dirty" : "saved");
    } catch (error) {
      const status = (error as { status?: number }).status;
      this.dirty = true;
      if (status === 409) this.set("conflict", (error as Error).message);
      else this.set("error", (error as Error).message);
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
