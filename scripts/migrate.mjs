import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL_NOT_CONFIGURED");
  process.exit(1);
}

const migrationsDirectory = path.join(process.cwd(), "database", "migrations");
const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  ssl: process.env.SAIN_DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});

function checksum(content) {
  return createHash("sha256").update(content).digest("hex");
}

function migrationBody(content) {
  return content
    .replace(/^\s*BEGIN\s*;\s*/i, "")
    .replace(/\s*COMMIT\s*;\s*$/i, "")
    .trim();
}

async function ensureHistory(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS sain_schema_migrations (
      migration_name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('sain-finance-migrations'))");
    await ensureHistory(client);

    const files = (await readdir(migrationsDirectory))
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort((left, right) => left.localeCompare(right));

    for (const file of files) {
      const fileContent = await readFile(path.join(migrationsDirectory, file), "utf8");
      const currentChecksum = checksum(fileContent);
      const existing = await client.query(
        "SELECT checksum FROM sain_schema_migrations WHERE migration_name = $1",
        [file],
      );

      if (existing.rows.length) {
        if (existing.rows[0].checksum !== currentChecksum) {
          throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${file}`);
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(migrationBody(fileContent));
        await client.query(
          "INSERT INTO sain_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
          [file, currentChecksum],
        );
        await client.query("COMMIT");
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`MIGRATION_FAILED:${file}:${message}`);
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('sain-finance-migrations'))");
    } finally {
      client.release();
      await pool.end();
    }
  }
}

migrate().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
