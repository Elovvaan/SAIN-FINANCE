import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PostgresDatabase } from "@/server/finance/postgres-database";

export const runtime = "nodejs";

const stages = new Set(["INITIAL", "SCREENING", "TECHNICAL", "PANEL", "FINAL"]);
const statuses = new Set(["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]);
const formats = new Set(["VIRTUAL", "PHONE", "IN_PERSON"]);
const workspaces = new Set(["EMPLOYER", "STAFFING", "CAREER"]);

function required(value: unknown, code: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function jsonError(error: unknown) {
  const code = error instanceof Error ? error.message : "INTERVIEW_WORKSPACE_UNAVAILABLE";
  if (
    code.endsWith("_REQUIRED") ||
    code === "INVALID_WORKSPACE" ||
    code === "INVALID_INTERVIEW_STAGE" ||
    code === "INVALID_INTERVIEW_STATUS" ||
    code === "INVALID_INTERVIEW_FORMAT" ||
    code === "INVALID_INTERVIEW_DATE" ||
    code === "INVALID_INTERVIEW_DURATION"
  ) {
    return NextResponse.json({ error: code }, { status: 400 });
  }
  if (code === "APPLICATION_NOT_FOUND" || code === "INTERVIEW_NOT_FOUND") {
    return NextResponse.json({ error: code }, { status: 404 });
  }
  console.error("INTERVIEW_WORKSPACE_REQUEST_FAILED", error);
  return NextResponse.json({ error: "INTERVIEW_WORKSPACE_UNAVAILABLE" }, { status: 503 });
}

async function canAccessApplication(client: any, workspace: string, identifier: string, applicationId: string) {
  if (workspace === "EMPLOYER") {
    const result = await client.query(
      `SELECT a.application_id
       FROM job_applications a
       JOIN employer_jobs j ON j.job_id = a.job_id
       JOIN employer_profiles e ON e.employer_id = j.employer_id
       WHERE a.application_id = $1 AND e.business_email = $2
       LIMIT 1`,
      [applicationId, identifier],
    );
    return Boolean(result.rows[0]);
  }

  if (workspace === "STAFFING") {
    const profile = await client.query(
      `SELECT staffing_profile_id FROM staffing_profiles WHERE business_email = $1 LIMIT 1`,
      [identifier],
    );
    if (!profile.rows[0]) return false;
    const result = await client.query(
      `SELECT a.application_id
       FROM job_applications a
       JOIN employer_jobs j ON j.job_id = a.job_id
       WHERE a.application_id = $1
         AND j.status = 'PUBLISHED'
         AND a.status NOT IN ('WITHDRAWN', 'REJECTED')
       LIMIT 1`,
      [applicationId],
    );
    return Boolean(result.rows[0]);
  }

  const result = await client.query(
    `SELECT a.application_id
     FROM job_applications a
     JOIN career_profiles p ON p.career_profile_id = a.career_profile_id
     WHERE a.application_id = $1 AND p.email = $2
     LIMIT 1`,
    [applicationId, identifier],
  );
  return Boolean(result.rows[0]);
}

export async function GET(request: NextRequest) {
  try {
    const workspace = required(request.nextUrl.searchParams.get("workspace"), "WORKSPACE_REQUIRED").toUpperCase();
    const identifier = required(request.nextUrl.searchParams.get("identifier"), "IDENTIFIER_REQUIRED").toLowerCase();
    const applicationId = request.nextUrl.searchParams.get("applicationId")?.trim() || null;
    if (!workspaces.has(workspace)) throw new Error("INVALID_WORKSPACE");

    const database = new PostgresDatabase();
    const interviews = await database.transaction(async (client) => {
      const params: unknown[] = [identifier];
      let accessClause = "";

      if (workspace === "EMPLOYER") {
        accessClause = `JOIN employer_profiles ep ON ep.employer_id = j.employer_id AND ep.business_email = $1`;
      } else if (workspace === "STAFFING") {
        const profile = await client.query(
          `SELECT staffing_profile_id FROM staffing_profiles WHERE business_email = $1 LIMIT 1`,
          [identifier],
        );
        if (!profile.rows[0]) return [];
        accessClause = "";
      } else {
        accessClause = `JOIN career_profiles cp ON cp.career_profile_id = a.career_profile_id AND cp.email = $1`;
      }

      if (applicationId) params.push(applicationId);
      const result = await client.query(
        `SELECT i.*, a.status AS application_status, a.shortlist_status,
                j.title AS job_title, j.location AS job_location,
                e.company_name, p.full_name, p.email AS candidate_email
         FROM application_interviews i
         JOIN job_applications a ON a.application_id = i.application_id
         JOIN employer_jobs j ON j.job_id = a.job_id
         JOIN employer_profiles e ON e.employer_id = j.employer_id
         JOIN career_profiles p ON p.career_profile_id = a.career_profile_id
         ${accessClause}
         WHERE 1 = 1
           ${workspace === "STAFFING" ? "AND j.status = 'PUBLISHED'" : ""}
           ${applicationId ? `AND i.application_id = $${params.length}` : ""}
         ORDER BY i.scheduled_at ASC`,
        params,
      );
      return result.rows;
    });

    return NextResponse.json({ interviews });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const workspace = required(body.workspace, "WORKSPACE_REQUIRED").toUpperCase();
    const identifier = required(body.identifier, "IDENTIFIER_REQUIRED").toLowerCase();
    const applicationId = required(body.applicationId, "APPLICATION_ID_REQUIRED");
    const stage = String(body.stage ?? "INITIAL").toUpperCase();
    const status = String(body.status ?? "SCHEDULED").toUpperCase();
    const format = String(body.format ?? "VIRTUAL").toUpperCase();
    const scheduledAt = required(body.scheduledAt, "SCHEDULED_AT_REQUIRED");
    const durationMinutes = Number(body.durationMinutes ?? 30);
    const location = String(body.location ?? "").trim() || null;
    const meetingUrl = String(body.meetingUrl ?? "").trim() || null;
    const interviewerName = String(body.interviewerName ?? "").trim() || null;
    const notes = String(body.notes ?? "").trim() || null;

    if (!new Set(["EMPLOYER", "STAFFING"]).has(workspace)) throw new Error("INVALID_WORKSPACE");
    if (!stages.has(stage)) throw new Error("INVALID_INTERVIEW_STAGE");
    if (!statuses.has(status)) throw new Error("INVALID_INTERVIEW_STATUS");
    if (!formats.has(format)) throw new Error("INVALID_INTERVIEW_FORMAT");
    if (Number.isNaN(Date.parse(scheduledAt))) throw new Error("INVALID_INTERVIEW_DATE");
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) throw new Error("INVALID_INTERVIEW_DURATION");

    const database = new PostgresDatabase();
    const interview = await database.transaction(async (client) => {
      if (!(await canAccessApplication(client, workspace, identifier, applicationId))) throw new Error("APPLICATION_NOT_FOUND");
      const result = await client.query(
        `INSERT INTO application_interviews (
           interview_id, application_id, stage, status, scheduled_at, duration_minutes,
           format, location, meeting_url, interviewer_name, notes,
           created_by_workspace, created_by_identifier
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [randomUUID(), applicationId, stage, status, scheduledAt, durationMinutes, format, location, meetingUrl, interviewerName, notes, workspace, identifier],
      );
      const created = result.rows[0];
      await client.query(
        `INSERT INTO application_timeline_events (
           timeline_event_id, application_id, event_type, actor_workspace, actor_identifier,
           visibility, title, body, metadata
         ) VALUES ($1, $2, 'INTERVIEW', $3, $4, 'APPLICANT', $5, $6, $7::jsonb)`,
        [
          randomUUID(),
          applicationId,
          workspace,
          identifier,
          "Interview scheduled",
          `${stage} interview scheduled for ${new Date(scheduledAt).toISOString()}`,
          JSON.stringify({ interviewId: created.interview_id, stage, status, format, scheduledAt, durationMinutes }),
        ],
      );
      return created;
    });

    return NextResponse.json({ interview }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const workspace = required(body.workspace, "WORKSPACE_REQUIRED").toUpperCase();
    const identifier = required(body.identifier, "IDENTIFIER_REQUIRED").toLowerCase();
    const interviewId = required(body.interviewId, "INTERVIEW_ID_REQUIRED");
    const status = required(body.status, "INTERVIEW_STATUS_REQUIRED").toUpperCase();
    if (!workspaces.has(workspace)) throw new Error("INVALID_WORKSPACE");
    if (!statuses.has(status)) throw new Error("INVALID_INTERVIEW_STATUS");
    if (workspace === "CAREER" && status !== "CONFIRMED") throw new Error("INVALID_INTERVIEW_STATUS");

    const database = new PostgresDatabase();
    const interview = await database.transaction(async (client) => {
      const currentResult = await client.query(
        `SELECT * FROM application_interviews WHERE interview_id = $1 LIMIT 1`,
        [interviewId],
      );
      const current = currentResult.rows[0];
      if (!current) throw new Error("INTERVIEW_NOT_FOUND");
      if (!(await canAccessApplication(client, workspace, identifier, current.application_id))) throw new Error("INTERVIEW_NOT_FOUND");

      const result = await client.query(
        `UPDATE application_interviews
         SET status = $2, updated_at = NOW()
         WHERE interview_id = $1
         RETURNING *`,
        [interviewId, status],
      );
      const updated = result.rows[0];
      await client.query(
        `INSERT INTO application_timeline_events (
           timeline_event_id, application_id, event_type, actor_workspace, actor_identifier,
           visibility, title, body, metadata
         ) VALUES ($1, $2, 'INTERVIEW', $3, $4, 'APPLICANT', $5, $6, $7::jsonb)`,
        [
          randomUUID(),
          current.application_id,
          workspace,
          identifier,
          `Interview ${status.toLowerCase().replaceAll("_", " ")}`,
          `Interview status moved from ${current.status} to ${status}`,
          JSON.stringify({ interviewId, previousStatus: current.status, status }),
        ],
      );
      return updated;
    });

    return NextResponse.json({ interview });
  } catch (error) {
    return jsonError(error);
  }
}
