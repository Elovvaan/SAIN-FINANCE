import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Transitional repository used while SAIN Finance moves from the single-file
 * prototype store to a transactional database. It centralizes persistence so
 * domain services no longer need to know how state is stored.
 */
export class JsonFileStateRepository {
  constructor(options) {
    this.options = options;
    this.dataDirectory =
      options.dataDirectory || process.env.SAIN_DATA_DIR || path.join(process.cwd(), ".sain-data");
    this.storeFile = path.join(this.dataDirectory, options.fileName);
    this.backupFile = path.join(this.dataDirectory, options.backupFileName);
  }

  async load() {
    await mkdir(this.dataDirectory, { recursive: true });

    const primary = await this.tryRead(this.storeFile);
    if (primary.ok) return primary.state;

    const backup = await this.tryRead(this.backupFile);
    if (backup.ok) return backup.state;

    if (this.options.allowInitialState) return this.options.createInitialState();

    const primaryReason = primary.error instanceof Error ? primary.error.message : "unknown primary error";
    const backupReason = backup.error instanceof Error ? backup.error.message : "unknown backup error";
    throw new Error(`STATE_STORE_UNAVAILABLE: primary=${primaryReason}; backup=${backupReason}`);
  }

  async save(state) {
    await mkdir(this.dataDirectory, { recursive: true });
    const temporary = `${this.storeFile}.${randomUUID()}.tmp`;
    const serialized = JSON.stringify(state, null, 2);

    try {
      const current = await readFile(this.storeFile, "utf8");
      await writeFile(this.backupFile, current, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    await writeFile(temporary, serialized, "utf8");
    await rename(temporary, this.storeFile);
  }

  async tryRead(file) {
    try {
      const raw = await readFile(file, "utf8");
      return { ok: true, state: this.options.validate(JSON.parse(raw)) };
    } catch (error) {
      return { ok: false, error };
    }
  }
}

export class InMemoryStateRepository {
  constructor(initialState, clone = structuredClone) {
    this.clone = clone;
    this.state = clone(initialState);
  }

  async load() {
    return this.clone(this.state);
  }

  async save(state) {
    this.state = this.clone(state);
  }
}
