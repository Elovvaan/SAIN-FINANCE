import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  addReportingSection,
  createReportingDefinition,
  createReportingRun,
  createReportingSchedule,
  listReportingWorkspace,
  updateReportingItem,
} from "@/server/reporting/enterprise-reporting-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "REPORTING_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code.endsWith("_NOT_FOUND")) return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("REPORTING_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("REPORTING_REQUEST_FAILED", error);
  return NextResponse.json({ error: "REPORTING_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    return NextResponse.json(await listReportingWorkspace(operator, request.nextUrl.searchParams.get("q") || ""));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const entityType = String(body.entityType || "");

    if (entityType === "DEFINITION") {
      return NextResponse.json(await createReportingDefinition({
        operator,
        reportCode: String(body.reportCode || ""),
        reportName: String(body.reportName || ""),
        reportType: String(body.reportType || "EXECUTIVE"),
        audience: String(body.audience || "EXECUTIVE"),
        description: String(body.description || "") || undefined,
        templateConfig: typeof body.templateConfig === "object" && body.templateConfig !== null ? body.templateConfig as Record<string,unknown> : {},
        dataSourceConfig: typeof body.dataSourceConfig === "object" && body.dataSourceConfig !== null ? body.dataSourceConfig as Record<string,unknown> : {},
      }), { status: 201 });
    }

    if (entityType === "SCHEDULE") {
      return NextResponse.json(await createReportingSchedule({
        operator,
        reportingDefinitionId: String(body.reportingDefinitionId || ""),
        scheduleName: String(body.scheduleName || ""),
        frequency: String(body.frequency || "MONTHLY"),
        timezone: String(body.timezone || "America/Denver"),
        nextRunAt: String(body.nextRunAt || "") || undefined,
        recipients: Array.isArray(body.recipients) ? body.recipients : [],
        deliveryChannels: Array.isArray(body.deliveryChannels) ? body.deliveryChannels.map(String) : ["PORTAL"],
      }), { status: 201 });
    }

    if (entityType === "RUN") {
      return NextResponse.json(await createReportingRun({
        operator,
        reportingDefinitionId: String(body.reportingDefinitionId || ""),
        reportingScheduleId: String(body.reportingScheduleId || "") || undefined,
        reportingPeriodStart: String(body.reportingPeriodStart || "") || undefined,
        reportingPeriodEnd: String(body.reportingPeriodEnd || "") || undefined,
        outputFormat: String(body.outputFormat || "PDF"),
        parameters: typeof body.parameters === "object" && body.parameters !== null ? body.parameters as Record<string,unknown> : {},
      }), { status: 201 });
    }

    if (entityType === "SECTION") {
      return NextResponse.json(await addReportingSection({
        operator,
        reportingRunId: String(body.reportingRunId || ""),
        sectionCode: String(body.sectionCode || ""),
        sectionName: String(body.sectionName || ""),
        sequenceNumber: Number(body.sequenceNumber),
        sectionType: String(body.sectionType || "TABLE"),
        sectionData: typeof body.sectionData === "object" && body.sectionData !== null ? body.sectionData as Record<string,unknown> : {},
      }), { status: 201 });
    }

    return NextResponse.json({ error: "REPORTING_ENTITY_TYPE_INVALID" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateReportingItem({
      operator,
      itemType: String(body.itemType || ""),
      itemId: String(body.itemId || ""),
      action: String(body.action || ""),
      note: String(body.note || "") || undefined,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
