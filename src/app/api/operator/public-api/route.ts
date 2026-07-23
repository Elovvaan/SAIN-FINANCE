import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  createApiClient,
  createApiProduct,
  createApiWebhook,
  issueApiCredential,
  listApiWorkspace,
  updateApiItem,
} from "@/server/api/enterprise-public-api-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "API_PLATFORM_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code.endsWith("_NOT_FOUND")) return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("API_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("API_PLATFORM_REQUEST_FAILED", error);
  return NextResponse.json({ error: "API_PLATFORM_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    return NextResponse.json(await listApiWorkspace(operator, request.nextUrl.searchParams.get("q") || ""));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const entityType = String(body.entityType || "");

    if (entityType === "CLIENT") {
      return NextResponse.json(await createApiClient({
        operator,
        clientName: String(body.clientName || ""),
        clientCode: String(body.clientCode || ""),
        clientType: String(body.clientType || "CONFIDENTIAL"),
        description: String(body.description || "") || undefined,
        scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : [],
        redirectUris: Array.isArray(body.redirectUris) ? body.redirectUris.map(String) : [],
        allowedOrigins: Array.isArray(body.allowedOrigins) ? body.allowedOrigins.map(String) : [],
      }), { status: 201 });
    }

    if (entityType === "PRODUCT") {
      return NextResponse.json(await createApiProduct({
        operator,
        productCode: String(body.productCode || ""),
        productName: String(body.productName || ""),
        basePath: String(body.basePath || ""),
        version: String(body.version || "v1"),
        description: String(body.description || "") || undefined,
        defaultRateLimit: body.defaultRateLimit == null || body.defaultRateLimit === "" ? undefined : Number(body.defaultRateLimit),
        documentationUrl: String(body.documentationUrl || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "CREDENTIAL") {
      return NextResponse.json(await issueApiCredential({
        operator,
        apiClientId: String(body.apiClientId || ""),
        credentialType: String(body.credentialType || "API_KEY"),
        expiresAt: String(body.expiresAt || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "WEBHOOK") {
      return NextResponse.json(await createApiWebhook({
        operator,
        apiClientId: String(body.apiClientId || ""),
        webhookName: String(body.webhookName || ""),
        endpointUrl: String(body.endpointUrl || ""),
        eventTypes: Array.isArray(body.eventTypes) ? body.eventTypes.map(String) : [],
      }), { status: 201 });
    }

    return NextResponse.json({ error: "API_ENTITY_TYPE_INVALID" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateApiItem({
      operator,
      itemType: String(body.itemType || ""),
      itemId: String(body.itemId || ""),
      action: String(body.action || ""),
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
