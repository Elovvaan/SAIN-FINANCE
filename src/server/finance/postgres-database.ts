import { Pool, type PoolClient } from "pg";
import type {
  SqlDatabase,
  SqlQueryResult,
  SqlTransactionClient,
} from "./database-state-repository.js";

let pool: Pool | undefined;

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL_NOT_CONFIGURED");
  return value;
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.SAIN_DATABASE_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.SAIN_DATABASE_IDLE_TIMEOUT_MS || 30_000),
      connectionTimeoutMillis: Number(process.env.SAIN_DATABASE_CONNECTION_TIMEOUT_MS || 10_000),
      ssl: process.env.SAIN_DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

class PostgresTransactionClient implements SqlTransactionClient {
  constructor(private readonly client: PoolClient) {}

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    const result = await this.client.query(text, [...values]);
    return { rows: result.rows as Row[], rowCount: result.rowCount };
  }
}

export class PostgresDatabase implements SqlDatabase {
  async transaction<Result>(
    callback: (client: SqlTransactionClient) => Promise<Result>,
  ): Promise<Result> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await callback(new PostgresTransactionClient(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original transaction failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function closePostgresPoolForTesting() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}
