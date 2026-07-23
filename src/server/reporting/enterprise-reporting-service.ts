import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type ReportingOperator = { institutionKey: string; userId: string };

const reportTypes = new Set(["REGULATORY","BOARD","EXECUTIVE","FINANCIAL","RISK","COMPLIANCE","TREASURY","PORTFOLIO"]);
const audiences = new Set(["REGULATOR","BOARD","EXECUTIVE","FINANCE","RISK","COMPLIANCE","TREASURY","OPERATIONS"]);
const frequencies = new Set(["DAILY","WEEKLY","MONTHLY","QUARTERLY","ANNUALLY","AD_HOC"]);
const outputFormats = new Set(["PDF","CSV","XLSX","JSON"]);

export async function listReportingWorkspace(operator: ReportingOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const [definitions, schedules, runs, summary] = await Promise.all([
      client.query(
        `SELECT reporting_definition_id,report_code,report_name,report_type,audience,status,description,updated_at
         FROM reporting_definitions
         WHERE institution_key=$1
           AND ($2='' OR to_tsvector('english',report_code||' '||report_name||' '||report_type||' '||audience) @@ plainto_tsquery('english',$2))
         ORDER BY report_type,report_name`,
        [operator.institutionKey,query.trim()],
      ),
      client.query(
        `SELECT s.reporting_schedule_id,s.schedule_name,s.frequency,s.timezone,s.next_run_at,s.status,s.recipients,s.delivery_channels,
                d.reporting_definition_id,d.report_code,d.report_name,d.report_type
         FROM reporting_schedules s
         JOIN reporting_definitions d ON d.reporting_definition_id=s.reporting_definition_id AND d.institution_key=s.institution_key
         WHERE s.institution_key=$1
         ORDER BY CASE s.status WHEN 'ACTIVE' THEN 1 ELSE 2 END,s.next_run_at NULLS LAST,s.schedule_name`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT r.reporting_run_id,r.reporting_period_start,r.reporting_period_end,r.status,r.output_format,r.output_location,r.summary,r.error_message,r.created_at,r.started_at,r.completed_at,
                d.report_code,d.report_name,d.report_type
         FROM reporting_runs r
         JOIN reporting_definitions d ON d.reporting_definition_id=r.reporting_definition_id AND d.institution_key=r.institution_key
         WHERE r.institution_key=$1
         ORDER BY r.created_at DESC
         LIMIT 250`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM reporting_definitions WHERE institution_key=$1 AND status='ACTIVE') AS active_definitions,
           (SELECT COUNT(*)::int FROM reporting_schedules WHERE institution_key=$1 AND status='ACTIVE') AS active_schedules,
           (SELECT COUNT(*)::int FROM reporting_runs WHERE institution_key=$1 AND status IN ('QUEUED','RUNNING')) AS pending_runs,
           (SELECT COUNT(*)::int FROM reporting_runs WHERE institution_key=$1 AND status='FAILED') AS failed_runs,
           (SELECT COUNT(*)::int FROM reporting_runs WHERE institution_key=$1 AND status='COMPLETE' AND completed_at >= NOW()-INTERVAL '30 days') AS completed_last_30_days`,
        [operator.institutionKey],
      ),
    ]);
    return { definitions: definitions.rows, schedules: schedules.rows, runs: runs.rows, summary: summary.rows[0] };
  });
}

export async function createReportingDefinition(input: {
  operator: ReportingOperator;
  reportCode: string;
  reportName: string;
  reportType: string;
  audience: string;
  description?: string;
  templateConfig?: Record<string, unknown>;
  dataSourceConfig?: Record<string, unknown>;
}) {
  if (!input.reportCode.trim() || !input.reportName.trim()) throw new Error("REPORTING_DEFINITION_FIELDS_REQUIRED");
  if (!reportTypes.has(input.reportType)) throw new Error("REPORTING_TYPE_INVALID");
  if (!audiences.has(input.audience)) throw new Error("REPORTING_AUDIENCE_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const reportingDefinitionId = randomUUID();
    await client.query(
      `INSERT INTO reporting_definitions
       (reporting_definition_id,institution_key,report_code,report_name,report_type,audience,description,template_config,data_source_config,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$10)`,
      [reportingDefinitionId,input.operator.institutionKey,input.reportCode.trim().toUpperCase(),input.reportName.trim(),input.reportType,input.audience,input.description?.trim() || null,JSON.stringify(input.templateConfig || {}),JSON.stringify(input.dataSourceConfig || {}),input.operator.userId],
    );
    await recordEvent(client,input.operator,"DEFINITION",reportingDefinitionId,"REPORTING_DEFINITION_CREATED",{ reportType: input.reportType, audience: input.audience });
    return { reportingDefinitionId,status: "ACTIVE" };
  });
}

export async function createReportingSchedule(input: {
  operator: ReportingOperator;
  reportingDefinitionId: string;
  scheduleName: string;
  frequency: string;
  timezone?: string;
  nextRunAt?: string;
  recipients?: unknown[];
  deliveryChannels?: string[];
}) {
  if (!input.reportingDefinitionId || !input.scheduleName.trim()) throw new Error("REPORTING_SCHEDULE_FIELDS_REQUIRED");
  if (!frequencies.has(input.frequency)) throw new Error("REPORTING_FREQUENCY_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const definition = await client.query(
      `SELECT reporting_definition_id FROM reporting_definitions WHERE institution_key=$1 AND reporting_definition_id=$2`,
      [input.operator.institutionKey,input.reportingDefinitionId],
    );
    if (!definition.rows[0]) throw new Error("REPORTING_DEFINITION_NOT_FOUND");
    const reportingScheduleId = randomUUID();
    await client.query(
      `INSERT INTO reporting_schedules
       (reporting_schedule_id,institution_key,reporting_definition_id,schedule_name,frequency,timezone,next_run_at,recipients,delivery_channels,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$10)`,
      [reportingScheduleId,input.operator.institutionKey,input.reportingDefinitionId,input.scheduleName.trim(),input.frequency,input.timezone?.trim() || "America/Denver",input.nextRunAt || null,JSON.stringify(input.recipients || []),JSON.stringify(input.deliveryChannels || ["PORTAL"]),input.operator.userId],
    );
    await recordEvent(client,input.operator,"SCHEDULE",reportingScheduleId,"REPORTING_SCHEDULE_CREATED",{ frequency: input.frequency, reportingDefinitionId: input.reportingDefinitionId });
    return { reportingScheduleId,status: "ACTIVE" };
  });
}

export async function createReportingRun(input: {
  operator: ReportingOperator;
  reportingDefinitionId: string;
  reportingScheduleId?: string;
  reportingPeriodStart?: string;
  reportingPeriodEnd?: string;
  outputFormat?: string;
  parameters?: Record<string, unknown>;
}) {
  if (!input.reportingDefinitionId) throw new Error("REPORTING_DEFINITION_REQUIRED");
  const outputFormat = input.outputFormat || "PDF";
  if (!outputFormats.has(outputFormat)) throw new Error("REPORTING_OUTPUT_FORMAT_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const definition = await client.query(
      `SELECT reporting_definition_id,status FROM reporting_definitions WHERE institution_key=$1 AND reporting_definition_id=$2`,
      [input.operator.institutionKey,input.reportingDefinitionId],
    );
    if (!definition.rows[0]) throw new Error("REPORTING_DEFINITION_NOT_FOUND");
    if (definition.rows[0].status !== "ACTIVE") throw new Error("REPORTING_DEFINITION_NOT_ACTIVE");
    const reportingRunId = randomUUID();
    await client.query(
      `INSERT INTO reporting_runs
       (reporting_run_id,institution_key,reporting_definition_id,reporting_schedule_id,reporting_period_start,reporting_period_end,status,output_format,parameters,requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,'QUEUED',$7,$8::jsonb,$9)`,
      [reportingRunId,input.operator.institutionKey,input.reportingDefinitionId,input.reportingScheduleId || null,input.reportingPeriodStart || null,input.reportingPeriodEnd || null,outputFormat,JSON.stringify(input.parameters || {}),input.operator.userId],
    );
    await recordEvent(client,input.operator,"RUN",reportingRunId,"REPORTING_RUN_QUEUED",{ outputFormat, reportingDefinitionId: input.reportingDefinitionId });
    return { reportingRunId,status: "QUEUED" };
  });
}

export async function addReportingSection(input: {
  operator: ReportingOperator;
  reportingRunId: string;
  sectionCode: string;
  sectionName: string;
  sequenceNumber: number;
  sectionType: string;
  sectionData?: Record<string, unknown>;
}) {
  if (!input.reportingRunId || !input.sectionCode.trim() || !input.sectionName.trim()) throw new Error("REPORTING_SECTION_FIELDS_REQUIRED");
  if (!Number.isInteger(input.sequenceNumber) || input.sequenceNumber < 1) throw new Error("REPORTING_SECTION_SEQUENCE_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const run = await client.query(
      `SELECT reporting_run_id FROM reporting_runs WHERE institution_key=$1 AND reporting_run_id=$2`,
      [input.operator.institutionKey,input.reportingRunId],
    );
    if (!run.rows[0]) throw new Error("REPORTING_RUN_NOT_FOUND");
    const reportingSectionId = randomUUID();
    await client.query(
      `INSERT INTO reporting_sections
       (reporting_section_id,institution_key,reporting_run_id,section_code,section_name,sequence_number,section_type,section_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [reportingSectionId,input.operator.institutionKey,input.reportingRunId,input.sectionCode.trim().toUpperCase(),input.sectionName.trim(),input.sequenceNumber,input.sectionType,JSON.stringify(input.sectionData || {})],
    );
    await recordEvent(client,input.operator,"SECTION",reportingSectionId,"REPORTING_SECTION_ADDED",{ reportingRunId: input.reportingRunId, sequenceNumber: input.sequenceNumber });
    return { reportingSectionId,status: "COMPLETE" };
  });
}

export async function updateReportingItem(input: { operator: ReportingOperator; itemType: string; itemId: string; action: string; note?: string }) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    if (input.itemType === "DEFINITION") {
      const statusByAction: Record<string,string> = { ACTIVATE: "ACTIVE", DEACTIVATE: "INACTIVE", ARCHIVE: "ARCHIVED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("REPORTING_ACTION_INVALID");
      const result = await client.query(
        `UPDATE reporting_definitions SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND reporting_definition_id=$2 RETURNING reporting_definition_id`,
        [input.operator.institutionKey,input.itemId,status,input.operator.userId],
      );
      if (!result.rows[0]) throw new Error("REPORTING_DEFINITION_NOT_FOUND");
      await recordEvent(client,input.operator,"DEFINITION",input.itemId,`REPORTING_DEFINITION_${status}`,{});
      return { status };
    }
    if (input.itemType === "SCHEDULE") {
      const statusByAction: Record<string,string> = { ACTIVATE: "ACTIVE", PAUSE: "PAUSED", DISABLE: "DISABLED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("REPORTING_ACTION_INVALID");
      const result = await client.query(
        `UPDATE reporting_schedules SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND reporting_schedule_id=$2 RETURNING reporting_schedule_id`,
        [input.operator.institutionKey,input.itemId,status,input.operator.userId],
      );
      if (!result.rows[0]) throw new Error("REPORTING_SCHEDULE_NOT_FOUND");
      await recordEvent(client,input.operator,"SCHEDULE",input.itemId,`REPORTING_SCHEDULE_${status}`,{});
      return { status };
    }
    if (input.itemType === "RUN") {
      const statusByAction: Record<string,string> = { START: "RUNNING", COMPLETE: "COMPLETE", FAIL: "FAILED", CANCEL: "CANCELLED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("REPORTING_ACTION_INVALID");
      const result = await client.query(
        `UPDATE reporting_runs
         SET status=$3,
             started_at=CASE WHEN $3='RUNNING' THEN NOW() ELSE started_at END,
             completed_at=CASE WHEN $3 IN ('COMPLETE','FAILED','CANCELLED') THEN NOW() ELSE completed_at END,
             error_message=CASE WHEN $3='FAILED' THEN $4 ELSE error_message END,
             updated_at=NOW()
         WHERE institution_key=$1 AND reporting_run_id=$2 RETURNING reporting_run_id`,
        [input.operator.institutionKey,input.itemId,status,input.note?.trim() || null],
      );
      if (!result.rows[0]) throw new Error("REPORTING_RUN_NOT_FOUND");
      await recordEvent(client,input.operator,"RUN",input.itemId,`REPORTING_RUN_${status}`,{ note: input.note || null });
      return { status };
    }
    throw new Error("REPORTING_ITEM_TYPE_INVALID");
  });
}

async function recordEvent(client: { query: (text: string, values?: unknown[]) => Promise<unknown> }, operator: ReportingOperator, entityType: string, entityId: string, eventType: string, eventData: Record<string,unknown>) {
  await client.query(
    `INSERT INTO reporting_events (reporting_event_id,institution_key,entity_type,entity_id,event_type,event_data,actor_user_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [randomUUID(),operator.institutionKey,entityType,entityId,eventType,JSON.stringify(eventData),operator.userId],
  );
}
