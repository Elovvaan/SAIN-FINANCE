import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StateRepository<T> {
  load(): Promise<T>;
  save(state: T): Promise<void>;
}

export interface JsonFileRepositoryOptions<T> {
  dataDirectory?: string;
  fileName: string;
  backupFileName: string;
  validate(value: unknown): T;
  createInitialState(): T;
  allowInitialState?: boolean;
}

/**
 * Transitional repository used while SAIN Finance moves from the single-file
 * prototype store to a transactional database. It centralizes persistence so
 * domain services no longer need to know how state is stored.
 */
export class JsonFileStateRepository<T> implements StateRepository<T> {
  private readonly dataDirectory: string;
  private readonly storeFile: string;
  private readonly backupFile: string;

  constructor(private readonly options: JsonFileRepositoryOptions<T>) {
    this.dataDirectory =
      options.dataDirectory || process.env.SAIN_DATA_DIR || path.join(process.cwd(), ".sain-data");
    this.storeFile = path.join(this.dataDirectory, options.fileName);
    this.backupFile = path.join(this.dataDirectory, options.backupFileName);
  }

  async load(): Promise<T> {
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

  async save(state: T): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const temporary = `${this.storeFile}.${randomUUID()}.tmp`;
    const serialized = JSON.stringify(state, null, 2);

    try {
      const current = await readFile(this.storeFile, "utf8");
      await writeFile(this.backupFile, current, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }

    await writeFile(temporary, serialized, "utf8");
    await rename(temporary, this.storeFile);
  }

  private async tryRead(file: string): Promise<{ ok: true; state: T } | { ok: false; error: unknown }> {
    try {
      const raw = await readFile(file, "utf8");
      return { ok: true, state: this.options.validate(JSON.parse(raw)) };
    } catch (error) {
      return { ok: false, error };
    }
  }
}

export class InMemoryStateRepository<T> implements StateRepository<T> {
  private state: T;

  constructor(initialState: T, private readonly clone: (value: T) => T = structuredClone) {
    this.state = clone(initialState);
  }

  async load(): Promise<T> {
    return this.clone(this.state);
  }

  async save(state: T): Promise<void> {
    this.state = this.clone(state);
  }
}
