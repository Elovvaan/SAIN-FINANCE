import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PostgresDatabase } from "@/server/finance/postgres-database";

export const runtime = "nodejs";

const allowedDocumentTypes = new Set([
  "EMPLOYMENT_AGREEMENT",
  "OFFER_LETTER",
  "W4",
  "I9",
  "IDENTITY",
  "PAY_STATEMENT",
  "TAX_FORM",
  "HR_DOCUMENT",
  "OTHER",
]);

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

type PayrollRow = {
  payroll_line_item_id: string;
  payroll_record_id: string;
  reference: string;
  description: string;
  gross_amount: string;
  deductions_amount: string;
  net_amount: string;
  status: string;
  pay_date: string | null;
  company_name: string;
  created_at: string;
};

type PayrollSummaryRow = {
  lifetime_gross: string;
  lifetime_net: string;
  latest_net: string;
  next_pay_date: string | null;
};

type WorkerDocumentRow = {
  worker_document_id: string;
  document_type: string;
  title: string;
  filename: string;
  media_type: string;
  byte_length: number;
  status: string;
  version_number: number;
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
  if (
    code.endsWith("_REQUIRED") ||
    code === "INVALID_DOCUMENT_TYPE" ||
    code === "INVALID_DOCUMENT_MEDIA_TYPE" ||
    code === "DOCUMENT_TOO_LARGE"
  ) {
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
        return {
          profile: null,
          metrics: null,
          timeline: [],
          supportCases: [],
          payrollRecords: [],
          payrollSummary: null,
          documents: [],
        };
      }

      const metricsResult = await client.query<ApplicationSummaryRow>(
        `SELECT COUNT(*)::text AS total_applications,
                COUNT(*) FILTER (WHERE status NOT IN ('REJECTED', 'WITHDRAWN', 'HIRED'))::text AS active_applications
         FROM job_applications
         WHERE career_profile_id = $1`,
        [profile.career_profile_id],
      );

      const timelineResult = await client.query<TimelineRow>(
        `SELECT timeline_event_id, title, body, created_at
         FROM (
           SELECT t.timeline_event_id, t.title, t.body, t.created_at
           FROM application_timeline_events t
           JOIN job_applications a ON a.application_id = t.application_id
           WHERE a.career_profile_id = $1
             AND t.visibility IN ('SHARED', 'APPLICANT')
           UNION ALL
           SELECT pe.payroll_event_id AS timeline_event_id, pe.title, pe.detail AS body, pe.created_at
           FROM payroll_events pe
           JOIN payroll_workers pw ON pw.payroll_worker_id = pe.payroll_worker_id
           WHERE pw.career_profile_id = $1
           UNION ALL
           SELECT de.document_event_id AS timeline_event_id,
                  CASE de.event_type
                    WHEN 'UPLOADED' THEN 'Document uploaded'
                    WHEN 'REPLACED' THEN 'Document replaced'
                    WHEN 'DOWNLOADED' THEN 'Document downloaded'
                    ELSE 'Document removed'
                  END AS title,
                  wd.title AS body,
                  de.created_at
           FROM worker_document_events de
           JOIN worker_documents wd ON wd.worker_document_id = de.worker_document_id
           WHERE wd.career_profile_id = $1
         ) events
         ORDER BY created_at DESC
         LIMIT 30`,
        [profile.career_profile_id],
      );

      const supportResult = await client.query<SupportCaseRow>(
        `SELECT support_case_id, subject, detail, status, created_at, updated_at
         FROM worker_support_cases
         WHERE career_profile_id = $1
         ORDER BY created_at DESC`,
        [profile.career_profile_id],
      );

      const payrollResult = await client.query<PayrollRow>(
        `SELECT li.payroll_line_item_id, li.payroll_record_id, pr.reference, li.description,
                li.gross_amount, li.deductions_amount, li.net_amount, li.status,
                pr.pay_date, e.company_name, li.created_at
         FROM payroll_line_items li
         JOIN payroll_workers pw ON pw.payroll_worker_id = li.payroll_worker_id
         JOIN employer_payroll_records pr ON pr.payroll_record_id = li.payroll_record_id
         JOIN employer_profiles e ON e.employer_id = pw.employer_id
         WHERE pw.career_profile_id = $1
         ORDER BY COALESCE(pr.pay_date, li.created_at::date) DESC, li.created_at DESC`,
        [profile.career_profile_id],
      );

      const payrollSummaryResult = await client.query<PayrollSummaryRow>(
        `SELECT
           COALESCE(SUM(li.gross_amount), 0)::text AS lifetime_gross,
           COALESCE(SUM(li.net_amount), 0)::text AS lifetime_net,
           COALESCE((
             SELECT li2.net_amount
             FROM payroll_line_items li2
             JOIN payroll_workers pw2 ON pw2.payroll_worker_id = li2.payroll_worker_id
             JOIN employer_payroll_records pr2 ON pr2.payroll_record_id = li2.payroll_record_id
             WHERE pw2.career_profile_id = $1
             ORDER BY COALESCE(pr2.pay_date, li2.created_at::date) DESC, li2.created_at DESC
             LIMIT 1
           ), 0)::text AS latest_net,
           (
             SELECT pr3.pay_date::text
             FROM payroll_line_items li3
             JOIN payroll_workers pw3 ON pw3.payroll_worker_id = li3.payroll_worker_id
             JOIN employer_payroll_records pr3 ON pr3.payroll_record_id = li3.payroll_record_id
             WHERE pw3.career_profile_id = $1
               AND pr3.pay_date >= CURRENT_DATE
               AND li3.status IN ('PREPARED', 'APPROVED', 'PROCESSING')
             ORDER BY pr3.pay_date ASC
             LIMIT 1
           ) AS next_pay_date
         FROM payroll_line_items li
         JOIN payroll_workers pw ON pw.payroll_worker_id = li.payroll_worker_id
         WHERE pw.career_profile_id = $1`,
        [profile.career_profile_id],
      );

      const documentResult = await client.query<WorkerDocumentRow>(
        `SELECT worker_document_id, document_type, title, filename, media_type,
                byte_length, status, version_number, created_at, updated_at
         FROM worker_documents
         WHERE career_profile_id = $1
           AND status = 'ACTIVE'
         ORDER BY created_at DESC`,
        [profile.career_profile_id],
      );

      return {
        profile,
        metrics: metricsResult.rows[0] || { total_applications: "0", active_applications: "0" },
        timeline: timelineResult.rows,
        supportCases: supportResult.rows,
        payrollRecords: payrollResult.rows,
        payrollSummary: payrollSummaryResult.rows[0] || {
          lifetime_gross: "0",
          lifetime_net: "0",
          latest_net: "0",
          next_pay_date: null,
        },
        documents: documentResult.rows,
      };
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
      const title = required(form.get("title"), "DOCUMENT_TITLE_REQUIRED");
      const documentType = required(form.get("documentType"), "DOCUMENT_TYPE_REQUIRED").toUpperCase();
      if (!allowedDocumentTypes.has(documentType)) throw new Error("INVALID_DOCUMENT_TYPE");
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("DOCUMENT_FILE_REQUIRED");
      const allowedMediaTypes = new Set([
        "application/pdf",
        "image/png",
        "image/jpeg",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ]);
      if (!allowedMediaTypes.has(file.type)) throw new Error("INVALID_DOCUMENT_MEDIA_TYPE");
      const maximumBytes = 15 * 1024 * 1024;
      if (file.size > maximumBytes) throw new Error("DOCUMENT_TOO_LARGE");
      const content = Buffer.from(await file.arrayBuffer());

      const document = await database.transaction(async (client) => {
        const profileResult = await client.query<{ career_profile_id: string }>(
          `SELECT career_profile_id FROM career_profiles WHERE email = $1 LIMIT 1`,
          [email],
        );
        const careerProfileId = profileResult.rows[0]?.career_profile_id;
        if (!careerProfileId) throw new Error("WORKER_PROFILE_NOT_FOUND");
        const result = await client.query<WorkerDocumentRow>(
          `INSERT INTO worker_documents (
             worker_document_id, career_profile_id, document_type, title,
             filename, media_type, byte_length, content, status, version_number
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', 1)
           RETURNING worker_document_id, document_type, title, filename, media_type,
                     byte_length, status, version_number, created_at, updated_at`,
          [randomUUID(), careerProfileId, documentType, title, file.name, file.type, file.size, content],
        );
        const created = result.rows[0];
        await client.query(
          `INSERT INTO worker_document_events (
             document_event_id, worker_document_id, event_type, actor_identifier
           ) VALUES ($1, $2, 'UPLOADED', $3)`,
          [randomUUID(), created.worker_document_id, email],
        );
        return created;
      });

      return NextResponse.json({ document }, { status: 201 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const email = required(body.email, "EMAIL_REQUIRED").toLowerCase();
    const subject = required(body.subject, "SUBJECT_REQUIRED");
    const detail = required(body.detail, "DETAIL_REQUIRED");

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