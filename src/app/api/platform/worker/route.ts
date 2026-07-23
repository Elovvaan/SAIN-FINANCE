import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PostgresDatabase } from "@/server/finance/postgres-database";

export const runtime = "nodejs";

type WorkerProfileRow = {
  career_profile_id: string;
  email: string;
  full_name: string;
  career_stage: string;
  current_role: string;
  location: string;
};

type ApplicationSummaryRow = {
  total_applications: string;
  active_applications: string;
};

type TimelineRow = {
  timeline_event_id: string;
  title: string;
  body: string | null;
  created_at: string;
};

type SupportCaseRow = {
  support_case_id: string;
  subject: string;
  detail: string;
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
  const code = error instanceof Error ? error.message : "WORKER_WORKSPACE_UNAVAILABLE";
  if (code.endsWith("_REQUIRED")) {
    return NextResponse.json({ error: code }, { status: 400 });
  }
  if (code === "WORKER_PROFILE_NOT_FOUND") {
    return NextResponse.json({ error: code }, { status: 404 });
  }
  console.error("WORKER_WORKSPACE_REQUEST_FAILED", error);
  return NextResponse.json({ error: "WORKER_WORKSPACE_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const email = required(request.nextUrl.searchParams.get("email"), "EMAIL_REQUIRED").toLowerCase();
    const database = new PostgresDatabase();
    const result = await database.transaction(async (client) => {
      const profileResult = await client.query<WorkerProfileRow>(
        `SELECT career_profile_id, email, full_name, career_stage, "current_role" AS current_role, location
         FROM career_profiles
         WHERE email = $1
         LIMIT 1`,
        [email],
      );
      const profile = profileResult.rows[0] || null;
      if (!profile) {
        return { profile: null, metrics: null, timeline: [], supportCases: [] };
      }

      const metricsResult = await client.query<ApplicationSummaryRow>(
        `SELECT COUNT(*)::text AS total_applications,
                COUNT(*) FILTER (WHERE status NOT IN ('REJECTED', 'WITHDRAWN', 'HIRED'))::text AS active_applications
         FROM job_applications
         WHERE career_profile_id = $1`,
        [profile.career_profile_id],
      );

      const timelineResult = await client.query<TimelineRow>(
        `SELECT t.timeline_event_id, t.title, t.body, t.created_at
         FROM application_timeline_events t
         JOIN job_applications a ON a.application_id = t.application_id
         WHERE a.career_profile_id = $1
           AND t.visibility IN ('SHARED', 'APPLICANT')
         ORDER BY t.created_at DESC
         LIMIT 20`,
        [profile.career_profile_id],
      );

      const supportResult = await client.query<SupportCaseRow>(
        `SELECT support_case_id, subject, detail, status, created_at, updated_at
         FROM worker_support_cases
         WHERE career_profile_id = $1
         ORDER BY created_at DESC`,
        [profile.career_profile_id],
      );

      return {
        profile,
        metrics: metricsResult.rows[0] || { total_applications: "0", active_applications: "0" },
        timeline: timelineResult.rows,
        supportCases: supportResult.rows,
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
    const email = required(body.email, "EMAIL_REQUIRED").toLowerCase();
    const subject = required(body.subject, "SUBJECT_REQUIRED");
    const detail = required(body.detail, "DETAIL_REQUIRED");
    const database = new PostgresDatabase();

    const supportCase = await database.transaction(async (client) => {
      const profileResult = await client.query<{ career_profile_id: string }>(
        `SELECT career_profile_id FROM career_profiles WHERE email = $1 LIMIT 1`,
        [email],
      );
      const careerProfileId = profileResult.rows[0]?.career_profile_id;
      if (!careerProfileId) throw new Error("WORKER_PROFILE_NOT_FOUND");

      const result = await client.query<SupportCaseRow>(
        `INSERT INTO worker_support_cases (
           support_case_id, career_profile_id, subject, detail, status
         ) VALUES ($1, $2, $3, $4, 'OPEN')
         RETURNING support_case_id, subject, detail, status, created_at, updated_at`,
        [randomUUID(), careerProfileId, subject, detail],
      );
      return result.rows[0];
    });

    return NextResponse.json({ supportCase }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
