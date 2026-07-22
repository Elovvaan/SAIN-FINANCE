import type { FilingState } from "./filing-office-domain";
import type { FilingOfficeStateRepository } from "./filing-office-store";

export interface SqlQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount?: number | null;
}

export interface SqlTransactionClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;
}

export interface SqlDatabase {
  transaction<Result>(
    callback: (client: SqlTransactionClient) => Promise<Result>,
  ): Promise<Result>;
}

interface FilingStateRow {
  state: unknown;
  revision: number;
}

export interface DatabaseStateRepositoryOptions {
  database: SqlDatabase;
  validate: (value: unknown) => FilingState;
  createInitialState: () => FilingState;
  allowInitialState?: boolean;
  institutionKey?: string;
}

const SELECT_STATE = `
  SELECT state, revision
  FROM filing_office_state
  WHERE institution_key = $1
`;

const SELECT_STATE_FOR_UPDATE = `${SELECT_STATE.trimEnd()} FOR UPDATE`;

const INSERT_STATE = `
  INSERT INTO filing_office_state (
    institution_key,
    state,
    revision,
    created_at,
    updated_at
  ) VALUES ($1, $2::jsonb, 1, NOW(), NOW())
  RETURNING revision
`;

const UPDATE_STATE = `
  UPDATE filing_office_state
  SET state = $2::jsonb,
      revision = revision + 1,
      updated_at = NOW()
  WHERE institution_key = $1
    AND revision = $3
  RETURNING revision
`;

/**
 * Transitional SQL repository for the Filing Office aggregate.
 *
 * Phase 2A keeps the existing aggregate shape in one JSONB row while moving
 * durability and concurrency control into the database. Phase 2B can normalize
 * individual entities behind this same repository contract without changing
 * domain handlers or the public API.
 */
export class DatabaseStateRepository implements FilingOfficeStateRepository {
  private readonly database: SqlDatabase;
  private readonly validate: (value: unknown) => FilingState;
  private readonly createInitialState: () => FilingState;
  private readonly allowInitialState: boolean;
  private readonly institutionKey: string;

  constructor(options: DatabaseStateRepositoryOptions) {
    this.database = options.database;
    this.validate = options.validate;
    this.createInitialState = options.createInitialState;
    this.allowInitialState = options.allowInitialState ?? false;
    this.institutionKey = options.institutionKey ?? "sain-finance";
  }

  async load(): Promise<FilingState> {
    return this.database.transaction(async (client) => {
      const row = await this.readRow(client, false);
      if (row) return this.validate(row.state);
      if (this.allowInitialState) return this.createInitialState();
      throw new Error("STATE_STORE_UNAVAILABLE: database state not initialized");
    });
  }

  async save(state: FilingState): Promise<void> {
    await this.database.transaction(async (client) => {
      const current = await this.readRow(client, true);
      const validated = this.validate(state);

      if (!current) {
        await this.insertState(client, validated);
        return;
      }

      await this.updateState(client, validated, current.revision);
    });
  }

  async transact<Result>(
    callback: (state: FilingState) => Promise<Result> | Result,
  ): Promise<Result> {
    return this.database.transaction(async (client) => {
      const current = await this.readRow(client, true);
      let state: FilingState;

      if (current) {
        state = this.validate(current.state);
      } else if (this.allowInitialState) {
        state = this.createInitialState();
      } else {
        throw new Error("STATE_STORE_UNAVAILABLE: database state not initialized");
      }

      const result = await callback(state);
      const validated = this.validate(state);

      if (current) {
        await this.updateState(client, validated, current.revision);
      } else {
        await this.insertState(client, validated);
      }

      return result;
    });
  }

  private async readRow(
    client: SqlTransactionClient,
    forUpdate: boolean,
  ): Promise<FilingStateRow | undefined> {
    const result = await client.query<FilingStateRow>(
      forUpdate ? SELECT_STATE_FOR_UPDATE : SELECT_STATE,
      [this.institutionKey],
    );
    return result.rows[0];
  }

  private async insertState(
    client: SqlTransactionClient,
    state: FilingState,
  ): Promise<void> {
    try {
      await client.query(INSERT_STATE, [this.institutionKey, JSON.stringify(state)]);
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("STATE_WRITE_CONFLICT");
      throw error;
    }
  }

  private async updateState(
    client: SqlTransactionClient,
    state: FilingState,
    revision: number,
  ): Promise<void> {
    const result = await client.query(UPDATE_STATE, [
      this.institutionKey,
      JSON.stringify(state),
      revision,
    ]);

    if ((result.rowCount ?? result.rows.length) !== 1) {
      throw new Error("STATE_WRITE_CONFLICT");
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505",
  );
}
