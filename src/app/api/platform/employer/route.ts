import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PostgresDatabase } from "@/server/finance/postgres-database";

export const runtime = "nodejs";

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

function required(value: unknown, code: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function jsonError(error: unknown) {
  const code = error instanceof Error ? error.message : "EMPLOYER_WORKSPACE_UNAVAILABLE";
  if (code.endsWith("_REQUIRED") || code === "INVALID_JOB_STATUS") {
    return NextResponse.json({ error: code }, { status: 400 });
  }
  if (code === "EMPLOYER_NOT_FOUND" || code === "JOB_NOT_FOUND") {
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
      if (!employer) return { employer: null, jobs: [] as JobRow[] };
      const jobsResult = await client.query<JobRow>(
        `SELECT * FROM employer_jobs WHERE employer_id = $1 ORDER BY created_at DESC`,
        [employer.employer_id],
      );
      return { employer, jobs: jobsResult.rows };
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
      if (!['DRAFT', 'PUBLISHED'].includes(status)) throw new Error("INVALID_JOB_STATUS");

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
    const jobId = required(body.jobId, "JOB_ID_REQUIRED");
    const status = required(body.status, "JOB_STATUS_REQUIRED").toUpperCase();
    if (!['DRAFT', 'PUBLISHED', 'CLOSED'].includes(status)) throw new Error("INVALID_JOB_STATUS");

    const database = new PostgresDatabase();
    const job = await database.transaction(async (client) => {
      const result = await client.query<JobRow>(
        `UPDATE employer_jobs SET status = $2, updated_at = NOW() WHERE job_id = $1 RETURNING *`,
        [jobId, status],
      );
      if (!result.rows[0]) throw new Error("JOB_NOT_FOUND");
      return result.rows[0];
    });
    return NextResponse.json({ job });
  } catch (error) {
    return jsonError(error);
  }
}
