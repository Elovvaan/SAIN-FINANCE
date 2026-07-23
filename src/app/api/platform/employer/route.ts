import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PostgresDatabase } from "@/server/finance/postgres-database";

export const runtime = "nodejs";

const applicationStatuses = new Set([
  "SUBMITTED",
  "IN_REVIEW",
  "INTERVIEW",
  "OFFERED",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
]);

const shortlistStatuses = new Set(["UNREVIEWED", "SHORTLISTED", "PASSED"]);

const allowedTransitions: Record<string, Set<string>> = {
  SUBMITTED: new Set(["IN_REVIEW", "INTERVIEW", "REJECTED"]),
  IN_REVIEW: new Set(["INTERVIEW", "OFFERED", "REJECTED"]),
  INTERVIEW: new Set(["OFFERED", "REJECTED"]),
  OFFERED: new Set(["HIRED", "REJECTED"]),
  HIRED: new Set(),
  REJECTED: new Set(),
  WITHDRAWN: new Set(),
};

const allowedJobTransitions: Record<string, Set<string>> = {
  DRAFT: new Set(["PUBLISHED", "CLOSED"]),
  PUBLISHED: new Set(["DRAFT", "CLOSED"]),
  CLOSED: new Set(["DRAFT", "PUBLISHED"]),
};

type EmployerRow = {
  employer_id: string;
  company_name: string;
  business_email: string;
  industry: string;
  company_size: string;
  verification_status: string;
  created_at: string;
  updated_at: string;
};

type JobRow = {
  job_id: string;
  employer_id: string;
  title: string;
  location: string;
  employment_type: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type ApplicantRow = {
  application_id: string;
  job_id: string;
  job_title: string;
  status: string;
  shortlist_status: string;
  match_score: number;
  match_summary: string | null;
  cover_note: string | null;
  resume_filename: string;
  resume_media_type: string;
  resume_byte_length: number;
  submitted_at: string;
  updated_at: string;
  career_profile_id: string;
  email: string;
  full_name: string;
  career_stage: string;
  current_role: string;
  applicant_location: string;
};

type MetricsRow = {
  total_jobs: string;
  published_jobs: string;
  active_applicants: string;
  hired_workers: string;
  prepared_payroll: string;
  open_corrections: string;
  pending_disbursements: string;
  verified_funding_sources: string;
};

function required(value: unknown, code: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function jsonError(error: unknown) {
  const code = error instanceof Error ? error.message : "EMPLOYER_WORKSPACE_UNAVAILABLE";
  if (
    code.endsWith("_REQUIRED") ||
    code === "INVALID_JOB_STATUS" ||
    code === "INVALID_JOB_TRANSITION" ||
    code === "INVALID_APPLICATION_STATUS" ||
    code === "INVALID_APPLICATION_TRANSITION" ||
    code === "INVALID_SHORTLIST_STATUS" ||
    code === "INVALID_TIMELINE_VISIBILITY"
  ) {
    return NextResponse.json({ error: code }, { status: 400 });
  }
  if (code === "EMPLOYER_NOT_FOUND" || code === "JOB_NOT_FOUND" || code === "APPLICATION_NOT_FOUND") {
    return NextResponse.json({ error: code }, { status: 404 });
  }
  console.error("EMPLOYER_WORKSPACE_REQUEST_FAILED", error);
  return NextResponse.json({ error: "EMPLOYER_WORKSPACE_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const businessEmail = required(request.nextUrl.searchParams.get("businessEmail"), "BUSINESS_EMAIL_REQUIRED").toLowerCase();
    const database = new PostgresDatabase();
    const result = await database.transaction(async (client) => {
      const employerResult = await client.query<EmployerRow>(
        `SELECT * FROM employer_profiles WHERE business_email = $1 LIMIT 1`,
        [businessEmail],
      );
      const employer = employerResult.rows[0];
      if (!employer) {
        return {
          employer: null,
          jobs: [] as JobRow[],
          applicants: [] as ApplicantRow[],
          timeline: [],
          payrollRecords: [],
          fundingSources: [],
          disbursements: [],
          corrections: [],
          metrics: null,
        };
      }

      const jobsResult = await client.query<JobRow>(
        `SELECT * FROM employer_jobs WHERE employer_id = $1 ORDER BY created_at DESC`,
        [employer.employer_id],
      );
      const applicantsResult = await client.query<ApplicantRow>(
        `SELECT a.application_id, a.job_id, j.title AS job_title, a.status,
                a.shortlist_status, a.match_score, a.match_summary,
                a.cover_note, a.resume_filename, a.resume_media_type,
                a.resume_byte_length, a.submitted_at, a.updated_at,
                p.career_profile_id, p.email, p.full_name, p.career_stage,
                p."current_role" AS current_role, p.location AS applicant_location
         FROM job_applications a
         JOIN employer_jobs j ON j.job_id = a.job_id
         JOIN career_profiles p ON p.career_profile_id = a.career_profile_id
         WHERE j.employer_id = $1
         ORDER BY
           CASE a.shortlist_status WHEN 'SHORTLISTED' THEN 0 WHEN 'UNREVIEWED' THEN 1 ELSE 2 END,
           a.match_score DESC,
           a.submitted_at DESC`,
        [employer.employer_id],
      );
      const timelineResult = await client.query(
        `SELECT t.*
         FROM application_timeline_events t
         JOIN job_applications a ON a.application_id = t.application_id
         JOIN employer_jobs j ON j.job_id = a.job_id
         WHERE j.employer_id = $1
         ORDER BY t.created_at DESC`,
        [employer.employer_id],
      );
      const payrollResult = await client.query(
        `SELECT * FROM employer_payroll_records WHERE employer_id = $1 ORDER BY created_at DESC`,
        [employer.employer_id],
      );
      const fundingResult = await client.query(
        `SELECT * FROM employer_funding_sources WHERE employer_id = $1 ORDER BY created_at DESC`,
        [employer.employer_id],
      );
      const disbursementResult = await client.query(
        `SELECT * FROM employer_disbursements WHERE employer_id = $1 ORDER BY created_at DESC`,
        [employer.employer_id],
      );
      const correctionsResult = await client.query(
        `SELECT * FROM employer_payroll_corrections WHERE employer_id = $1 ORDER BY created_at DESC`,
        [employer.employer_id],
      );
      const metricsResult = await client.query<MetricsRow>(
        `SELECT
           (SELECT COUNT(*)::text FROM employer_jobs WHERE employer_id = $1) AS total_jobs,
           (SELECT COUNT(*)::text FROM employer_jobs WHERE employer_id = $1 AND status = 'PUBLISHED') AS published_jobs,
           (SELECT COUNT(*)::text
              FROM job_applications a
              JOIN employer_jobs j ON j.job_id = a.job_id
             WHERE j.employer_id = $1 AND a.status NOT IN ('REJECTED', 'WITHDRAWN', 'HIRED')) AS active_applicants,
           (SELECT COUNT(*)::text
              FROM job_applications a
              JOIN employer_jobs j ON j.job_id = a.job_id
             WHERE j.employer_id = $1 AND a.status = 'HIRED') AS hired_workers,
           (SELECT COUNT(*)::text FROM employer_payroll_records WHERE employer_id = $1 AND status = 'PREPARED') AS prepared_payroll,
           (SELECT COUNT(*)::text FROM employer_payroll_corrections WHERE employer_id = $1 AND status IN ('OPEN', 'IN_REVIEW')) AS open_corrections,
           (SELECT COUNT(*)::text FROM employer_disbursements WHERE employer_id = $1 AND status IN ('PENDING', 'PROCESSING')) AS pending_disbursements,
           (SELECT COUNT(*)::text FROM employer_funding_sources WHERE employer_id = $1 AND status = 'VERIFIED') AS verified_funding_sources`,
        [employer.employer_id],
      );

      return {
        employer,
        jobs: jobsResult.rows,
        applicants: applicantsResult.rows,
        timeline: timelineResult.rows,
        payrollRecords: payrollResult.rows,
        fundingSources: fundingResult.rows,
        disbursements: disbursementResult.rows,
        corrections: correctionsResult.rows,
        metrics: metricsResult.rows[0],
      };
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

    if (action === "saveEmployer") {
      const companyName = required(body.companyName, "COMPANY_NAME_REQUIRED");
      const businessEmail = required(body.businessEmail, "BUSINESS_EMAIL_REQUIRED").toLowerCase();
      const industry = required(body.industry, "INDUSTRY_REQUIRED");
      const companySize = required(body.companySize, "COMPANY_SIZE_REQUIRED");
      const employer = await database.transaction(async (client) => {
        const result = await client.query<EmployerRow>(
          `INSERT INTO employer_profiles (
             employer_id, company_name, business_email, industry, company_size
           ) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (business_email) DO UPDATE SET
             company_name = EXCLUDED.company_name,
             industry = EXCLUDED.industry,
             company_size = EXCLUDED.company_size,
             updated_at = NOW()
           RETURNING *`,
          [randomUUID(), companyName, businessEmail, industry, companySize],
        );
        return result.rows[0];
      });
      return NextResponse.json({ employer }, { status: 201 });
    }

    if (action === "createJob") {
      const businessEmail = required(body.businessEmail, "BUSINESS_EMAIL_REQUIRED").toLowerCase();
      const title = required(body.title, "JOB_TITLE_REQUIRED");
      const location = required(body.location, "JOB_LOCATION_REQUIRED");
      const employmentType = required(body.employmentType, "EMPLOYMENT_TYPE_REQUIRED");
      const description = required(body.description, "JOB_DESCRIPTION_REQUIRED");
      const status = String(body.status ?? "DRAFT").toUpperCase();
      if (!["DRAFT", "PUBLISHED"].includes(status)) throw new Error("INVALID_JOB_STATUS");

      const job = await database.transaction(async (client) => {
        const employerResult = await client.query<{ employer_id: string }>(
          `SELECT employer_id FROM employer_profiles WHERE business_email = $1 LIMIT 1`,
          [businessEmail],
        );
        const employerId = employerResult.rows[0]?.employer_id;
        if (!employerId) throw new Error("EMPLOYER_NOT_FOUND");
        const result = await client.query<JobRow>(
          `INSERT INTO employer_jobs (
             job_id, employer_id, title, location, employment_type, description, status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [randomUUID(), employerId, title, location, employmentType, description, status],
        );
        const created = result.rows[0];
        await client.query(
          `INSERT INTO job_status_events (
             job_status_event_id, job_id, previous_status, new_status, actor_workspace, actor_identifier
           ) VALUES ($1, $2, NULL, $3, 'EMPLOYER', $4)`,
          [randomUUID(), created.job_id, status, businessEmail],
        );
        return created;
      });
      return NextResponse.json({ job }, { status: 201 });
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
        const accessResult = await client.query(
          `SELECT a.application_id
           FROM job_applications a
           JOIN employer_jobs j ON j.job_id = a.job_id
           JOIN employer_profiles e ON e.employer_id = j.employer_id
           WHERE a.application_id = $1 AND e.business_email = $2
           LIMIT 1`,
          [applicationId, businessEmail],
        );
        if (!accessResult.rows[0]) throw new Error("APPLICATION_NOT_FOUND");
        const result = await client.query(
          `INSERT INTO application_timeline_events (
             timeline_event_id, application_id, event_type, actor_workspace, actor_identifier,
             visibility, title, body, metadata
           ) VALUES ($1, $2, $3, 'EMPLOYER', $4, $5, $6, $7, '{}'::jsonb)
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
    const action = required(body.action, "ACTION_REQUIRED");
    const database = new PostgresDatabase();

    if (action === "updateJobStatus") {
      const businessEmail = required(body.businessEmail, "BUSINESS_EMAIL_REQUIRED").toLowerCase();
      const jobId = required(body.jobId, "JOB_ID_REQUIRED");
      const status = required(body.status, "JOB_STATUS_REQUIRED").toUpperCase();
      if (!["DRAFT", "PUBLISHED", "CLOSED"].includes(status)) throw new Error("INVALID_JOB_STATUS");
      const job = await database.transaction(async (client) => {
        const currentResult = await client.query<{ status: string }>(
          `SELECT j.status
           FROM employer_jobs j
           JOIN employer_profiles e ON e.employer_id = j.employer_id
           WHERE j.job_id = $1 AND e.business_email = $2
           LIMIT 1`,
          [jobId, businessEmail],
        );
        const previousStatus = currentResult.rows[0]?.status;
        if (!previousStatus) throw new Error("JOB_NOT_FOUND");
        if (previousStatus === status) return (await client.query<JobRow>(`SELECT * FROM employer_jobs WHERE job_id = $1`, [jobId])).rows[0];
        if (!allowedJobTransitions[previousStatus]?.has(status)) throw new Error("INVALID_JOB_TRANSITION");
        const result = await client.query<JobRow>(
          `UPDATE employer_jobs SET status = $3, updated_at = NOW()
           FROM employer_profiles e
           WHERE employer_jobs.job_id = $1
             AND employer_jobs.employer_id = e.employer_id
             AND e.business_email = $2
           RETURNING employer_jobs.*`,
          [jobId, businessEmail, status],
        );
        const updated = result.rows[0];
        if (!updated) throw new Error("JOB_NOT_FOUND");
        await client.query(
          `INSERT INTO job_status_events (
             job_status_event_id, job_id, previous_status, new_status, actor_workspace, actor_identifier
           ) VALUES ($1, $2, $3, $4, 'EMPLOYER', $5)`,
          [randomUUID(), jobId, previousStatus, status, businessEmail],
        );
        return updated;
      });
      return NextResponse.json({ job });
    }

    if (action === "updateShortlistStatus") {
      const businessEmail = required(body.businessEmail, "BUSINESS_EMAIL_REQUIRED").toLowerCase();
      const applicationId = required(body.applicationId, "APPLICATION_ID_REQUIRED");
      const shortlistStatus = required(body.shortlistStatus, "SHORTLIST_STATUS_REQUIRED").toUpperCase();
      if (!shortlistStatuses.has(shortlistStatus)) throw new Error("INVALID_SHORTLIST_STATUS");
      const application = await database.transaction(async (client) => {
        const currentResult = await client.query<{ shortlist_status: string }>(
          `SELECT a.shortlist_status
           FROM job_applications a
           JOIN employer_jobs j ON j.job_id = a.job_id
           JOIN employer_profiles e ON e.employer_id = j.employer_id
           WHERE a.application_id = $1 AND e.business_email = $2
           LIMIT 1`,
          [applicationId, businessEmail],
        );
        if (!currentResult.rows[0]) throw new Error("APPLICATION_NOT_FOUND");
        const result = await client.query(
          `UPDATE job_applications a
           SET shortlist_status = $3, updated_at = NOW()
           FROM employer_jobs j, employer_profiles e
           WHERE a.application_id = $1
             AND a.job_id = j.job_id
             AND j.employer_id = e.employer_id
             AND e.business_email = $2
           RETURNING a.*`,
          [applicationId, businessEmail, shortlistStatus],
        );
        return result.rows[0];
      });
      return NextResponse.json({ application });
    }

    if (action === "updateApplicationStatus") {
      const businessEmail = required(body.businessEmail, "BUSINESS_EMAIL_REQUIRED").toLowerCase();
      const applicationId = required(body.applicationId, "APPLICATION_ID_REQUIRED");
      const status = required(body.status, "APPLICATION_STATUS_REQUIRED").toUpperCase();
      if (!applicationStatuses.has(status)) throw new Error("INVALID_APPLICATION_STATUS");
      const application = await database.transaction(async (client) => {
        const currentResult = await client.query<{ status: string }>(
          `SELECT a.status
           FROM job_applications a
           JOIN employer_jobs j ON j.job_id = a.job_id
           JOIN employer_profiles e ON e.employer_id = j.employer_id
           WHERE a.application_id = $1 AND e.business_email = $2
           LIMIT 1`,
          [applicationId, businessEmail],
        );
        const previousStatus = currentResult.rows[0]?.status;
        if (!previousStatus) throw new Error("APPLICATION_NOT_FOUND");
        if (previousStatus !== status && !allowedTransitions[previousStatus]?.has(status)) {
          throw new Error("INVALID_APPLICATION_TRANSITION");
        }
        const result = await client.query(
          `UPDATE job_applications a
           SET status = $3, updated_at = NOW()
           FROM employer_jobs j, employer_profiles e
           WHERE a.application_id = $1
             AND a.job_id = j.job_id
             AND j.employer_id = e.employer_id
             AND e.business_email = $2
           RETURNING a.*`,
          [applicationId, businessEmail, status],
        );
        if (previousStatus !== status) {
          const statusEventId = randomUUID();
          await client.query(
            `INSERT INTO application_status_events (
               status_event_id, application_id, previous_status, new_status, actor_workspace, actor_identifier
             ) VALUES ($1, $2, $3, $4, 'EMPLOYER', $5)`,
            [statusEventId, applicationId, previousStatus, status, businessEmail],
          );
          await client.query(
            `INSERT INTO application_timeline_events (
               timeline_event_id, application_id, event_type, actor_workspace, actor_identifier,
               visibility, title, body, metadata
             ) VALUES ($1, $2, 'STATUS', 'EMPLOYER', $3, 'SHARED', $4, $5, $6::jsonb)`,
            [
              randomUUID(),
              applicationId,
              businessEmail,
              `Application moved to ${status}`,
              `Application moved from ${previousStatus} to ${status}`,
              JSON.stringify({ previousStatus, newStatus: status, sourceEventId: statusEventId }),
            ],
          );
        }
        return result.rows[0];
      });
      return NextResponse.json({ application });
    }

    throw new Error("ACTION_REQUIRED");
  } catch (error) {
    return jsonError(error);
  }
}
