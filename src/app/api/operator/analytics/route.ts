import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  createAnalyticsAlert,
  createAnalyticsDashboard,
  createAnalyticsMetric,
  createAnalyticsSnapshot,
  listAnalyticsWorkspace,
  recordMetricValue,
  updateAnalyticsItem,
} from "@/server/analytics/enterprise-analytics-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "ANALYTICS_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code.endsWith("_NOT_FOUND")) return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("ANALYTICS_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("ANALYTICS_REQUEST_FAILED", error);
  return NextResponse.json({ error: "ANALYTICS_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    return NextResponse.json(await listAnalyticsWorkspace(operator, request.nextUrl.searchParams.get("q") || ""));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const entityType = String(body.entityType || "");

    if (entityType === "DASHBOARD") {
      return NextResponse.json(await createAnalyticsDashboard({
        operator,
        dashboardCode: String(body.dashboardCode || ""),
        dashboardName: String(body.dashboardName || ""),
        audience: String(body.audience || "EXECUTIVE"),
        description: String(body.description || "") || undefined,
        layout: typeof body.layout === "object" && body.layout !== null ? body.layout as Record<string,unknown> : {},
      }), { status: 201 });
    }

    if (entityType === "METRIC") {
      return NextResponse.json(await createAnalyticsMetric({
        operator,
        metricCode: String(body.metricCode || ""),
        metricName: String(body.metricName || ""),
        category: String(body.category || "PORTFOLIO"),
        unit: String(body.unit || "NUMBER"),
        aggregation: String(body.aggregation || "SUM"),
        targetValue: body.targetValue === "" || body.targetValue == null ? undefined : Number(body.targetValue),
        warningThreshold: body.warningThreshold === "" || body.warningThreshold == null ? undefined : Number(body.warningThreshold),
        criticalThreshold: body.criticalThreshold === "" || body.criticalThreshold == null ? undefined : Number(body.criticalThreshold),
        sourceDefinition: typeof body.sourceDefinition === "object" && body.sourceDefinition !== null ? body.sourceDefinition as Record<string,unknown> : {},
      }), { status: 201 });
    }

    if (entityType === "VALUE") {
      return NextResponse.json(await recordMetricValue({
        operator,
        analyticsMetricId: String(body.analyticsMetricId || ""),
        periodStart: String(body.periodStart || ""),
        periodEnd: String(body.periodEnd || ""),
        metricValue: Number(body.metricValue),
        comparisonValue: body.comparisonValue === "" || body.comparisonValue == null ? undefined : Number(body.comparisonValue),
        dimensionValues: typeof body.dimensionValues === "object" && body.dimensionValues !== null ? body.dimensionValues as Record<string,unknown> : {},
        status: String(body.status || "FINAL"),
      }), { status: 201 });
    }

    if (entityType === "ALERT") {
      return NextResponse.json(await createAnalyticsAlert({
        operator,
        analyticsMetricId: String(body.analyticsMetricId || ""),
        severity: String(body.severity || "WARNING"),
        title: String(body.title || ""),
        message: String(body.message || ""),
        observedValue: body.observedValue === "" || body.observedValue == null ? undefined : Number(body.observedValue),
        thresholdValue: body.thresholdValue === "" || body.thresholdValue == null ? undefined : Number(body.thresholdValue),
        assignedTo: String(body.assignedTo || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "SNAPSHOT") {
      return NextResponse.json(await createAnalyticsSnapshot({
        operator,
        snapshotType: String(body.snapshotType || "DAILY"),
        snapshotDate: String(body.snapshotDate || ""),
        summary: typeof body.summary === "object" && body.summary !== null ? body.summary as Record<string,unknown> : {},
      }), { status: 201 });
    }

    return NextResponse.json({ error: "ANALYTICS_ENTITY_TYPE_INVALID" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateAnalyticsItem({
      operator,
      itemType: String(body.itemType || ""),
      itemId: String(body.itemId || ""),
      action: String(body.action || ""),
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
