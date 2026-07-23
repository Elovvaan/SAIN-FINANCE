import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PostgresDatabase } from "@/server/finance/postgres-database";

export const runtime = "nodejs";

type CareerProfileRow = {
  career_profile_id: string;
  email: string;
  full_name: string;
  career_stage: string;
  current_role: string;
  location: string;
  created_at: string;
  updated_at: string;
};

type PublishedJobRow = {
  job_id: string;
  title: string;
  location: string;
  employment_type: string;
  description: string;
  company_name: string;
  industry: string;
  created_at: string;
};

type ApplicationRow = {
  application_id: string;
  job_id: string;
  status: string;
  cover_note: string | null;
  resume_filename: string;
  resume_media_type: string;
  resume_byte_length: number;
  submitted_at: string;
  updated_at: string;
  title: string;
  company_name: string;
};

function required(value: unknown, code: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function jsonError(error: unknown) {
  const code = error instanceof Error ? error.message : "CAREER_WORKSPACE_UNAVAILABLE";
  if (code.endsWith("_REQUIRED") || code === "INVALID_RESUME_TYPE" || code === "RESUME_TOO_LARGE" || code === "APPLICATION_ALREADY_EXISTS") {
    return NextResponse.json({ error: code }, { status: 400 });
  }
  if (code === "CAREER_PROFILE_NOT_FOUND" || code === "JOB_NOT_FOUND" || code === "APPLICATION_NOT_FOUND") {
    return NextResponse.json({ error: code }, { status: 404 });
  }
  console.error("CAREER_WORKSPACE_REQUEST_FAILED", error);
  return NextResponse.json({ error: "CAREER_WORKSPACE_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const email = required(request.nextUrl.searchParams.get("email"), "EMAIL_REQUIRED").toLowerCase();
    const database = new PostgresDatabase();
    const result = await database.transaction(async (client) => {
      const profileResult = await client.query<CareerProfileRow>(
        `SELECT * FROM career_profiles WHERE email = $1 LIMIT 1`,
        [email],
      );
      const profile = profileResult.rows[0] || null;
      const jobsResult = await client.query<PublishedJobRow>(
        `SELECT j.job_id, j.title, j.location, j.employment_type, j.description,
                e.company_name, e.industry, j.created_at
         FROM employer_jobs j
         JOIN employer_profiles e ON e.employer_id = j.employer_id
         WHERE j.status = 'PUBLISHED'
         ORDER BY j.created_at DESC`,
      );
      if (!profile) return { profile: null, jobs: jobsResult.rows, applications: [] as ApplicationRow[] };
      const applicationsResult = await client.query<ApplicationRow>(
        `SELECT a.application_id, a.job_id, a.status, a.cover_note,
                a.resume_filename, a.resume_media_type, a.resume_byte_length,
                a.submitted_at, a.updated_at, j.title, e.company_name
         FROM job_applications a
         JOIN employer_jobs j ON j.job_id = a.job_id
         JOIN employer_profiles e ON e.employer_id = j.employer_id
         WHERE a.career_profile_id = $1
         ORDER BY a.submitted_at DESC`,
        [profile.career_profile_id],
      );
      return { profile, jobs: jobsResult.rows, applications: applicationsResult.rows };
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const database = new PostgresDatabase();

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const email = required(form.get("email"), "EMAIL_REQUIRED").toLowerCase();
      const jobId = required(form.get("jobId"), "JOB_ID_REQUIRED");
      const coverNote = String(form.get("coverNote") || "").trim();
      const resume = form.get("resume");
      if (!(resume instanceof File)) throw new Error("RESUME_REQUIRED");
      const allowed = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
      if (!allowed.has(resume.type)) throw new Error("INVALID_RESUME_TYPE");
      const maximumBytes = 10 * 1024 * 1024;
      if (resume.size > maximumBytes) throw new Error("RESUME_TOO_LARGE");
      const content = Buffer.from(await resume.arrayBuffer());

      const application = await database.transaction(async (client) => {
        const profileResult = await client.query<{ career_profile_id: string }>(
          `SELECT career_profile_id FROM career_profiles WHERE email = $1 LIMIT 1`,
          [email],
        );
        const careerProfileId = profileResult.rows[0]?.career_profile_id;
        if (!careerProfileId) throw new Error("CAREER_PROFILE_NOT_FOUND");
        const jobResult = await client.query<{ job_id: string }>(
          `SELECT job_id FROM employer_jobs WHERE job_id = $1 AND status = 'PUBLISHED' LIMIT 1`,
          [jobId],
        );
        if (!jobResult.rows[0]) throw new Error("JOB_NOT_FOUND");
        const duplicateResult = await client.query<{ application_id: string }>(
          `SELECT application_id FROM job_applications WHERE job_id = $1 AND career_profile_id = $2 LIMIT 1`,
          [jobId, careerProfileId],
        );
        if (duplicateResult.rows[0]) throw new Error("APPLICATION_ALREADY_EXISTS");
        const result = await client.query<ApplicationRow>(
          `INSERT INTO job_applications (
             application_id, job_id, career_profile_id, cover_note,
             resume_filename, resume_media_type, resume_content, resume_byte_length
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING application_id, job_id, status, cover_note, resume_filename,
                     resume_media_type, resume_byte_length, submitted_at, updated_at,
                     ''::text AS title, ''::text AS company_name`,
          [randomUUID(), jobId, careerProfileId, coverNote || null, resume.name, resume.type, content, resume.size],
        );
        return result.rows[0];
      });
      return NextResponse.json({ application }, { status: 201 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = required(body.action, "ACTION_REQUIRED");
    if (action !== "saveProfile") throw new Error("ACTION_REQUIRED");
    const email = required(body.email, "EMAIL_REQUIRED").toLowerCase();
    const fullName = required(body.fullName, "FULL_NAME_REQUIRED");
    const careerStage = required(body.careerStage, "CAREER_STAGE_REQUIRED");
    const currentRole = required(body.currentRole, "CURRENT_ROLE_REQUIRED");
    const location = required(body.location, "LOCATION_REQUIRED");
    const profile = await database.transaction(async (client) => {
      const result = await client.query<CareerProfileRow>(
        `INSERT INTO career_profiles (
           career_profile_id, email, full_name, career_stage, "current_role", location
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           career_stage = EXCLUDED.career_stage,
           "current_role" = EXCLUDED."current_role",
           location = EXCLUDED.location,
           updated_at = NOW()
         RETURNING *`,
        [randomUUID(), email, fullName, careerStage, currentRole, location],
      );
      return result.rows[0];
    });
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const applicationId = required(body.applicationId, "APPLICATION_ID_REQUIRED");
    const database = new PostgresDatabase();
    const application = await database.transaction(async (client) => {
      const result = await client.query<ApplicationRow>(
        `UPDATE job_applications
         SET status = 'WITHDRAWN', updated_at = NOW()
         WHERE application_id = $1 AND status <> 'WITHDRAWN'
         RETURNING application_id, job_id, status, cover_note, resume_filename,
                   resume_media_type, resume_byte_length, submitted_at, updated_at,
                   ''::text AS title, ''::text AS company_name`,
        [applicationId],
      );
      if (!result.rows[0]) throw new Error("APPLICATION_NOT_FOUND");
      return result.rows[0];
    });
    return NextResponse.json({ application });
  } catch (error) {
    return jsonError(error);
  }
}