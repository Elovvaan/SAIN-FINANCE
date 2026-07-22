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

export interface DatabaseStateRepositoryOptions {
  database: SqlDatabase;
  validate: (value: unknown) => FilingState;
  createInitialState: () => FilingState;
  allowInitialState?: boolean;
  institutionKey?: string;
}

export class DatabaseStateRepository implements FilingOfficeStateRepository {
  constructor(options: DatabaseStateRepositoryOptions);
  load(): Promise<FilingState>;
  save(state: FilingState): Promise<void>;
  transact<Result>(
    callback: (state: FilingState) => Promise<Result> | Result,
  ): Promise<Result>;
}
