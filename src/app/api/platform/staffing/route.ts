import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PostgresDatabase } from "@/server/finance/postgres-database";

export const runtime = "nodejs";

const placementStatuses = new Set(["NEW", "MATCHED", "SCREENING", "SUBMITTED", "INTERVIEW", "OFFERED", "PLACED", "CLOSED"]);
const applicationStatuses = new Set(["SUBMITTED", "IN_REVIEW", "INTERVIEW", "OFFERED", "HIRED", "REJECTED"]);

const allowedTransitions: Record<string, Set<string>> = {
  SUBMITTED: new Set(["IN_REVIEW", "INTERVIEW", "REJECTED"]),
  IN_REVIEW: new Set(["INTERVIEW", "OFFERED", "REJECTED"]),
  INTERVIEW: new Set(["OFFERED", "REJECTED"]),
  OFFERED: new Set(["HIRED", "REJECTED"]),
  HIRED: new Set(),
  REJECTED: new Set(),
  WITHDRAWN: new Set(),
};

function required(value: unknown, code: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function jsonError(error: unknown) {
  const code = error instanceof Error ? error.message : "STAFFING_OS_UNAVAILABLE";
  if (
    code.endsWith("_REQUIRED") ||
    code === "INVALID_PLACEMENT_STATUS" ||
    code === "INVALID_APPLICATION_STATUS" ||
    code === "INVALID_APPLICATION_TRANSITION" ||
    code === "INVALID_TIMELINE_VISIBILITY"
  ) {
    return NextResponse.json({ error: code }, { status: 400 });
  }
  if (code === "STAFFING_PROFILE_NOT_FOUND" || code === "APPLICATION_NOT_FOUND" || code === "ASSIGNMENT_NOT_FOUND") {
    return NextResponse.json({ error: code }, { status: 404 });
  }
  console.error("STAFFING_OS_REQUEST_FAILED", error);
  return NextResponse.json({ error: "STAFFING_OS_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const businessEmail = required(request.nextUrl.searchParams.get("businessEmail"), "BUSINESS_EMAIL_REQUIRED").toLowerCase();
    const database = new PostgresDatabase();
    const result = await database.transaction(async (client) => {
      const profileResult = await client.query(`SELECT * FROM staffing_profiles WHERE business_email = $1 LIMIT 1`, [businessEmail]);
      const profile = profileResult.rows[0] || null;
      const candidatesResult = await client.query(`
        SELECT a.application_id, a.status AS application_status, a.cover_note, a.resume_filename,
               a.submitted_at, cp.full_name, cp.email, cp."current_role", cp.location,
               j.job_id, j.title, j.location AS job_location, j.status AS job_status, e.company_name,
               sa.staffing_assignment_id, sa.recruiter_note, sa.placement_status, sa.updated_at AS assignment_updated_at
        FROM job_applications a
        JOIN career_profiles cp ON cp.career_profile_id = a.career_profile_id
        JOIN employer_jobs j ON j.job_id = a.job_id
        JOIN employer_profiles e ON e.employer_id = j.employer_id
        LEFT JOIN staffing_assignments sa ON sa.application_id = a.application_id
        ORDER BY a.submitted_at DESC
      `);
      const timelineResult = await client.query(`
        SELECT *
        FROM application_timeline_events
        ORDER BY created_at DESC
      `);
      return { profile, candidates: candidatesResult.rows, timeline: timelineResult.rows };
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = required(body.action, "ACTION_REQUIRED");
    const database = new PostgresDatabase();

    if (action === "saveProfile") {
      const agencyName = required(body.agencyName, "AGENCY_NAME_REQUIRED");
      const businessEmail = required(body.businessEmail, "BUSINESS_EMAIL_REQUIRED").toLowerCase();
      const recruiterCount = required(body.recruiterCount, "RECRUITER_COUNT_REQUIRED");
      const locations = required(body.locations, "LOCATIONS_REQUIRED");
      const profile = await database.transaction(async (client) => {
        const result = await client.query(`
          INSERT INTO staffing_profiles (staffing_profile_id, agency_name, business_email, recruiter_count, locations)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (business_email) DO UPDATE SET
            agency_name = EXCLUDED.agency_name,
            recruiter_count = EXCLUDED.recruiter_count,
            locations = EXCLUDED.locations,
            updated_at = NOW()
          RETURNING *
        `, [randomUUID(), agencyName, businessEmail, recruiterCount, locations]);
        return result.rows[0];
      });
      return NextResponse.json({ profile }, { status: 201 });
    }

    if (action === "assignCandidate") {
      const businessEmail = required(body.businessEmail, "BUSINESS_EMAIL_REQUIRED").toLowerCase();
      const applicationId = required(body.applicationId, "APPLICATION_ID_REQUIRED");
      const recruiterNote = String(body.recruiterNote ?? "").trim() || null;
      const placementStatus = String(body.placementStatus ?? "NEW").toUpperCase();
      if (!placementStatuses.has(placementStatus)) throw new Error("INVALID_PLACEMENT_STATUS");
      const assignment = await database.transaction(async (client) => {
        const profileResult = await client.query<{ staffing_profile_id: string }>(`SELECT staffing_profile_id FROM staffing_profiles WHERE business_email = $1 LIMIT 1`, [businessEmail]);
        const staffingProfileId = profileResult.rows[0]?.staffing_profile_id;
        if (!staffingProfileId) throw new Error("STAFFING_PROFILE_NOT_FOUND");
        const appResult = await client.query(`SELECT application_id, status FROM job_applications WHERE application_id = $1 LIMIT 1`, [applicationId]);
        const application = appResult.rows[0];
        if (!application || application.status === "WITHDRAWN") throw new Error("APPLICATION_NOT_FOUND");
        const result = await client.query(`
          INSERT INTO staffing_assignments (staffing_assignment_id, staffing_profile_id, application_id, recruiter_note, placement_status)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (application_id) DO UPDATE SET
            staffing_profile_id = EXCLUDED.staffing_profile_id,
            recruiter_note = EXCLUDED.recruiter_note,
            placement_status = EXCLUDED.placement_status,
            updated_at = NOW()
          RETURNING *
        `, [randomUUID(), staffingProfileId, applicationId, recruiterNote, placementStatus]);
        const created = result.rows[0];
        await client.query(
          `INSERT INTO application_timeline_events (
             timeline_event_id, application_id, event_type, actor_workspace, actor_identifier,
             visibility, title, body, metadata
           ) VALUES ($1, $2, 'PLACEMENT', 'STAFFING', $3, 'INTERNAL', $4, $5, $6::jsonb)`,
          [
            randomUUID(),
            applicationId,
            businessEmail,
            "Candidate assigned",
            recruiterNote,
            JSON.stringify({ placementStatus, assignmentId: created.staffing_assignment_id }),
          ],
        );
        return created;
      });
      return NextResponse.json({ assignment }, { status: 201 });
    }

    if (action === "addTimelineEvent") {
      const businessEmail = required(body.businessEmail, "BUSINESS_EMAIL_REQUIRED").toLowerCase();
      const applicationId = required(body.applicationId, "APPLICATION_ID_REQUIRED");
      const title = required(body.title, "TIMELINE_TITLE_REQUIRED");
      const timelineBody = String(body.body ?? "").trim() || null;
      const eventType = String(body.eventType ?? "NOTE").toUpperCase();
      const visibility = String(body.visibility ?? "INTERNAL").toUpperCase();
      if (!["NOTE", "INTERVIEW", "PLACEMENT", "SYSTEM"].includes(eventType)) throw new Error("INVALID_APPLICATION_STATUS");
      if (!["INTERNAL", "SHARED", "APPLICANT"].includes(visibility)) throw new Error("INVALID_TIMELINE_VISIBILITY");
      const event = await database.transaction(async (client) => {
        const profileResult = await client.query(`SELECT staffing_profile_id FROM staffing_profiles WHERE business_email = $1 LIMIT 1`, [businessEmail]);
        if (!profileResult.rows[0]) throw new Error("STAFFING_PROFILE_NOT_FOUND");
        const appResult = await client.query(`SELECT application_id FROM job_applications WHERE application_id = $1 LIMIT 1`, [applicationId]);
        if (!appResult.rows[0]) throw new Error("APPLICATION_NOT_FOUND");
        const result = await client.query(
          `INSERT INTO application_timeline_events (
             timeline_event_id, application_id, event_type, actor_workspace, actor_identifier,
             visibility, title, body, metadata
           ) VALUES ($1, $2, $3, 'STAFFING', $4, $5, $6, $7, '{}'::jsonb)
           RETURNING *`,
          [randomUUID(), applicationId, eventType, businessEmail, visibility, title, timelineBody],
        );
        return result.rows[0];
      });
      return NextResponse.json({ event }, { status: 201 });
    }

    throw new Error("ACTION_REQUIRED");
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "updateAssignment");
    const database = new PostgresDatabase();

    if (action === "updateApplicationStatus") {
      const businessEmail = required(body.businessEmail, "BUSINESS_EMAIL_REQUIRED").toLowerCase();
      const applicationId = required(body.applicationId, "APPLICATION_ID_REQUIRED");
      const status = required(body.status, "APPLICATION_STATUS_REQUIRED").toUpperCase();
      if (!applicationStatuses.has(status)) throw new Error("INVALID_APPLICATION_STATUS");
      const application = await database.transaction(async (client) => {
        const profileResult = await client.query<{ staffing_profile_id: string }>(
          `SELECT staffing_profile_id FROM staffing_profiles WHERE business_email = $1 LIMIT 1`,
          [businessEmail],
        );
        if (!profileResult.rows[0]) throw new Error("STAFFING_PROFILE_NOT_FOUND");
        const currentResult = await client.query<{ status: string }>(
          `SELECT status FROM job_applications WHERE application_id = $1 LIMIT 1`,
          [applicationId],
        );
        const previousStatus = currentResult.rows[0]?.status;
        if (!previousStatus) throw new Error("APPLICATION_NOT_FOUND");
        if (!allowedTransitions[previousStatus]?.has(status)) throw new Error("INVALID_APPLICATION_TRANSITION");
        const result = await client.query(`
          UPDATE job_applications
          SET status = $2, updated_at = NOW()
          WHERE application_id = $1
          RETURNING *
        `, [applicationId, status]);
        const updated = result.rows[0];
        if (!updated) throw new Error("APPLICATION_NOT_FOUND");
        const statusEventId = randomUUID();
        await client.query(
          `INSERT INTO application_status_events (
             status_event_id, application_id, previous_status, new_status, actor_workspace, actor_identifier
           ) VALUES ($1, $2, $3, $4, 'STAFFING', $5)`,
          [statusEventId, applicationId, previousStatus, status, businessEmail],
        );
        await client.query(
          `INSERT INTO application_timeline_events (
             timeline_event_id, application_id, event_type, actor_workspace, actor_identifier,
             visibility, title, body, metadata
           ) VALUES ($1, $2, 'STATUS', 'STAFFING', $3, 'SHARED', $4, $5, $6::jsonb)`,
          [
            randomUUID(),
            applicationId,
            businessEmail,
            "Application status changed",
            `Application moved from ${previousStatus} to ${status}`,
            JSON.stringify({ previousStatus, newStatus: status, sourceEventId: statusEventId }),
          ],
        );
        return updated;
      });
      return NextResponse.json({ application });
    }

    const assignmentId = required(body.assignmentId, "ASSIGNMENT_ID_REQUIRED");
    const recruiterNote = String(body.recruiterNote ?? "").trim() || null;
    const placementStatus = required(body.placementStatus, "PLACEMENT_STATUS_REQUIRED").toUpperCase();
    if (!placementStatuses.has(placementStatus)) throw new Error("INVALID_PLACEMENT_STATUS");
    const assignment = await database.transaction(async (client) => {
      const currentResult = await client.query(`SELECT * FROM staffing_assignments WHERE staffing_assignment_id = $1 LIMIT 1`, [assignmentId]);
      const current = currentResult.rows[0];
      if (!current) throw new Error("ASSIGNMENT_NOT_FOUND");
      const result = await client.query(`
        UPDATE staffing_assignments
        SET recruiter_note = $2, placement_status = $3, updated_at = NOW()
        WHERE staffing_assignment_id = $1
        RETURNING *
      `, [assignmentId, recruiterNote, placementStatus]);
      const updated = result.rows[0];
      await client.query(
        `INSERT INTO application_timeline_events (
           timeline_event_id, application_id, event_type, actor_workspace, actor_identifier,
           visibility, title, body, metadata
         ) VALUES ($1, $2, 'PLACEMENT', 'STAFFING', NULL, 'INTERNAL', $3, $4, $5::jsonb)`,
        [
          randomUUID(),
          updated.application_id,
          "Placement updated",
          recruiterNote,
          JSON.stringify({ previousPlacementStatus: current.placement_status, placementStatus, assignmentId }),
        ],
      );
      return updated;
    });
    return NextResponse.json({ assignment });
  } catch (error) {
    return jsonError(error);
  }
}
