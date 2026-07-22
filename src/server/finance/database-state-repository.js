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
export class DatabaseStateRepository {
  constructor(options) {
    this.database = options.database;
    this.validate = options.validate;
    this.createInitialState = options.createInitialState;
    this.allowInitialState = options.allowInitialState ?? false;
    this.institutionKey = options.institutionKey ?? "sain-finance";
  }

  async load() {
    return this.database.transaction(async (client) => {
      const row = await this.readRow(client, false);
      if (row) return this.validate(row.state);
      if (this.allowInitialState) return this.createInitialState();
      throw new Error("STATE_STORE_UNAVAILABLE: database state not initialized");
    });
  }

  async save(state) {
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

  async transact(callback) {
    return this.database.transaction(async (client) => {
      const current = await this.readRow(client, true);
      let state;

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

  async readRow(client, forUpdate) {
    const result = await client.query(
      forUpdate ? SELECT_STATE_FOR_UPDATE : SELECT_STATE,
      [this.institutionKey],
    );
    return result.rows[0];
  }

  async insertState(client, state) {
    try {
      await client.query(INSERT_STATE, [this.institutionKey, JSON.stringify(state)]);
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("STATE_WRITE_CONFLICT");
      throw error;
    }
  }

  async updateState(client, state, revision) {
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

function isUniqueViolation(error) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505",
  );
}
