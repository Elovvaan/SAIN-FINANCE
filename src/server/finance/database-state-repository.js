const SELECT_STATE = `
  SELECT state, revision
  FROM filing_office_state
  WHERE institution_key = $1
`;

const SELECT_STATE_FOR_UPDATE = `${SELECT_STATE.trimEnd()} FOR UPDATE`;

const SELECT_AUDIT = `
  SELECT event
  FROM filing_office_audit_events
  WHERE institution_key = $1
  ORDER BY occurred_at ASC, event_id ASC
`;

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

const INSERT_AUDIT_EVENT = `
  INSERT INTO filing_office_audit_events (
    institution_key,
    event_id,
    actor_id,
    operation,
    target_id,
    occurred_at,
    previous_state,
    resulting_state,
    authority_id,
    event
  ) VALUES (
    $1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10::jsonb
  )
`;

/**
 * Transitional SQL repository for the Filing Office aggregate.
 *
 * Phase 2B stores audit history in an append-only relational table while the
 * remaining aggregate stays in JSONB. The public repository contract and the
 * FilingState domain shape remain unchanged.
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
      if (row) return this.readStateWithAudit(client, row.state);
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
        await this.insertAuditEvents(client, validated.audit);
        return;
      }

      const persisted = await this.readStateWithAudit(client, current.state);
      const appendedAudit = assertAppendOnlyAudit(persisted.audit, validated.audit);
      await this.updateState(client, validated, current.revision);
      await this.insertAuditEvents(client, appendedAudit);
    });
  }

  async transact(callback) {
    return this.database.transaction(async (client) => {
      const current = await this.readRow(client, true);
      let state;
      let existingAudit = [];

      if (current) {
        state = await this.readStateWithAudit(client, current.state);
        existingAudit = structuredClone(state.audit);
      } else if (this.allowInitialState) {
        state = this.createInitialState();
      } else {
        throw new Error("STATE_STORE_UNAVAILABLE: database state not initialized");
      }

      const result = await callback(state);
      const validated = this.validate(state);
      const appendedAudit = assertAppendOnlyAudit(existingAudit, validated.audit);

      if (current) {
        await this.updateState(client, validated, current.revision);
      } else {
        await this.insertState(client, validated);
      }
      await this.insertAuditEvents(client, appendedAudit);

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

  async readStateWithAudit(client, storedState) {
    const result = await client.query(SELECT_AUDIT, [this.institutionKey]);
    return this.validate({
      ...storedState,
      audit: result.rows.map((row) => row.event),
    });
  }

  async insertState(client, state) {
    try {
      await client.query(INSERT_STATE, [
        this.institutionKey,
        JSON.stringify(withoutAudit(state)),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("STATE_WRITE_CONFLICT");
      throw error;
    }
  }

  async updateState(client, state, revision) {
    const result = await client.query(UPDATE_STATE, [
      this.institutionKey,
      JSON.stringify(withoutAudit(state)),
      revision,
    ]);

    if ((result.rowCount ?? result.rows.length) !== 1) {
      throw new Error("STATE_WRITE_CONFLICT");
    }
  }

  async insertAuditEvents(client, events) {
    for (const event of events) {
      try {
        await client.query(INSERT_AUDIT_EVENT, [
          this.institutionKey,
          event.id,
          event.actorId,
          event.operation,
          event.targetId,
          event.at,
          event.previousState ?? null,
          event.resultingState ?? null,
          event.authorityId ?? null,
          JSON.stringify(event),
        ]);
      } catch (error) {
        if (isUniqueViolation(error)) throw new Error("AUDIT_EVENT_CONFLICT");
        throw error;
      }
    }
  }
}

function withoutAudit(state) {
  return { ...state, audit: [] };
}

function assertAppendOnlyAudit(existing, next) {
  if (next.length < existing.length) throw new Error("AUDIT_HISTORY_IMMUTABLE");

  for (let index = 0; index < existing.length; index += 1) {
    if (JSON.stringify(existing[index]) !== JSON.stringify(next[index])) {
      throw new Error("AUDIT_HISTORY_IMMUTABLE");
    }
  }

  return next.slice(existing.length);
}

function isUniqueViolation(error) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505",
  );
}
