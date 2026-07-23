import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  createIntegrationConnection,
  createIntegrationJob,
  createIntegrationProvider,
  createReconciliation,
  listIntegrationWorkspace,
  updateIntegrationItem,
} from "@/server/integrations/external-integration-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "INTEGRATION_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code.endsWith("_NOT_FOUND")) return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("INTEGRATION_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("INTEGRATION_REQUEST_FAILED", error);
  return NextResponse.json({ error: "INTEGRATION_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const query = request.nextUrl.searchParams.get("q") || "";
    return NextResponse.json(await listIntegrationWorkspace(operator, query));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const entityType = String(body.entityType || "");

    if (entityType === "PROVIDER") {
      return NextResponse.json(await createIntegrationProvider({
        operator,
        providerCode: String(body.providerCode || ""),
        providerName: String(body.providerName || ""),
        category: String(body.category || "OTHER"),
        baseUrl: String(body.baseUrl || "") || undefined,
        credentialReference: String(body.credentialReference || "") || undefined,
        timeoutMs: Number(body.timeoutMs || 30000),
        maxRetries: Number(body.maxRetries ?? 3),
      }), { status: 201 });
    }

    if (entityType === "CONNECTION") {
      return NextResponse.json(await createIntegrationConnection({
        operator,
        providerId: String(body.providerId || ""),
        connectionName: String(body.connectionName || ""),
        environment: String(body.environment || "PRODUCTION"),
        capabilities: Array.isArray(body.capabilities) ? body.capabilities.map(String) : [],
      }), { status: 201 });
    }

    if (entityType === "JOB") {
      return NextResponse.json(await createIntegrationJob({
        operator,
        connectionId: String(body.connectionId || ""),
        operation: String(body.operation || ""),
        direction: String(body.direction || "OUTBOUND"),
        correlationId: String(body.correlationId || "") || undefined,
        idempotencyKey: String(body.idempotencyKey || "") || undefined,
        sourceEntityType: String(body.sourceEntityType || "") || undefined,
        sourceEntityId: String(body.sourceEntityId || "") || undefined,
        requestPayload: typeof body.requestPayload === "object" && body.requestPayload !== null ? body.requestPayload as Record<string, unknown> : {},
      }), { status: 201 });
    }

    if (entityType === "RECONCILIATION") {
      return NextResponse.json(await createReconciliation({
        operator,
        connectionId: String(body.connectionId || ""),
        reconciliationDate: String(body.reconciliationDate || ""),
        reconciliationType: String(body.reconciliationType || ""),
      }), { status: 201 });
    }

    return NextResponse.json({ error: "INTEGRATION_ENTITY_TYPE_INVALID" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateIntegrationItem({
      operator,
      itemType: String(body.itemType || ""),
      itemId: String(body.itemId || ""),
      action: String(body.action || ""),
      healthStatus: String(body.healthStatus || "") || undefined,
      errorMessage: String(body.errorMessage || "") || undefined,
      internalCount: Number(body.internalCount || 0),
      externalCount: Number(body.externalCount || 0),
      matchedCount: Number(body.matchedCount || 0),
      exceptionCount: Number(body.exceptionCount || 0),
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
