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

const allowedTransitions: Record<string, Set<string>> = {
  SUBMITTED: new Set(["IN_REVIEW", "INTERVIEW", "REJECTED"]),
  IN_REVIEW: new Set(["INTERVIEW", "OFFERED", "REJECTED"]),
  INTERVIEW: new Set(["OFFERED", "REJECTED"]),
  OFFERED: new Set(["HIRED", "REJECTED"]),
  HIRED: new Set(),
  REJECTED: new Set(),
  WITHDRAWN: new Set(),
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
    code === "INVALID_APPLICATION_STATUS" ||
    code === "INVALID_APPLICATION_TRANSITION"
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
      if (!employer) return { employer: null, jobs: [] as JobRow[], applicants: [] as ApplicantRow[] };

      const jobsResult = await client.query<JobRow>(
        `SELECT * FROM employer_jobs WHERE employer_id = $1 ORDER BY created_at DESC`,
        [employer.employer_id],
      );
      const applicantsResult = await client.query<ApplicantRow>(
        `SELECT a.application_id, a.job_id, j.title AS job_title, a.status,
                a.cover_note, a.resume_filename, a.resume_media_type,
                a.resume_byte_length, a.submitted_at, a.updated_at,
                p.career_profile_id, p.email, p.full_name, p.career_stage,
                p."current_role" AS current_role, p.location AS applicant_location
         FROM job_applications a
         JOIN employer_jobs j ON j.job_id = a.job_id
         JOIN career_profiles p ON p.career_profile_id = a.career_profile_id
         WHERE j.employer_id = $1
         ORDER BY a.submitted_at DESC`,
        [employer.employer_id],
      );
      return { employer, jobs: jobsResult.rows, applicants: applicantsResult.rows };
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
        return result.rows[0];
      });
      return NextResponse.json({ job }, { status: 201 });
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
      const jobId = required(body.jobId, "JOB_ID_REQUIRED");
      const status = required(body.status, "JOB_STATUS_REQUIRED").toUpperCase();
      if (!["DRAFT", "PUBLISHED", "CLOSED"].includes(status)) throw new Error("INVALID_JOB_STATUS");
      const job = await database.transaction(async (client) => {
        const result = await client.query<JobRow>(
          `UPDATE employer_jobs SET status = $2, updated_at = NOW() WHERE job_id = $1 RETURNING *`,
          [jobId, status],
        );
        if (!result.rows[0]) throw new Error("JOB_NOT_FOUND");
        return result.rows[0];
      });
      return NextResponse.json({ job });
    }

    if (action === "updateApplicationStatus") {
      const businessEmail = required(body.businessEmail, "BUSINESS_EMAIL_REQUIRED").toLowerCase();
      const applicationId = required(body.applicationId, "APPLICATION_ID_REQUIRED");
      const status = required(body.status, "APPLICATION_STATUS_REQUIRED").toUpperCase();
      if (!applicationStatuses.has(status) || status === "WITHDRAWN") throw new Error("INVALID_APPLICATION_STATUS");
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
        if (!allowedTransitions[previousStatus]?.has(status)) throw new Error("INVALID_APPLICATION_TRANSITION");

        const result = await client.query<ApplicantRow>(
          `UPDATE job_applications a
           SET status = $3, updated_at = NOW()
           FROM employer_jobs j, employer_profiles e, career_profiles p
           WHERE a.application_id = $1
             AND a.job_id = j.job_id
             AND j.employer_id = e.employer_id
             AND e.business_email = $2
             AND a.career_profile_id = p.career_profile_id
           RETURNING a.application_id, a.job_id, j.title AS job_title, a.status,
                     a.cover_note, a.resume_filename, a.resume_media_type,
                     a.resume_byte_length, a.submitted_at, a.updated_at,
                     p.career_profile_id, p.email, p.full_name, p.career_stage,
                     p."current_role" AS current_role, p.location AS applicant_location`,
          [applicationId, businessEmail, status],
        );
        const updated = result.rows[0];
        if (!updated) throw new Error("APPLICATION_NOT_FOUND");
        await client.query(
          `INSERT INTO application_status_events (
             status_event_id, application_id, previous_status, new_status, actor_workspace, actor_identifier
           ) VALUES ($1, $2, $3, $4, 'EMPLOYER', $5)`,
          [randomUUID(), applicationId, previousStatus, status, businessEmail],
        );
        return updated;
      });
      return NextResponse.json({ application });
    }

    throw new Error("ACTION_REQUIRED");
  } catch (error) {
    return jsonError(error);
  }
}
