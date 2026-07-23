import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  createPortalConversation,
  createPortalNotification,
  createPortalProfile,
  createPortalRequest,
  listCustomerExperienceWorkspace,
  updateCustomerExperienceItem,
} from "@/server/customer-experience/customer-experience-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "CUSTOMER_EXPERIENCE_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code.endsWith("_NOT_FOUND")) return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("PORTAL_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("CUSTOMER_EXPERIENCE_REQUEST_FAILED", error);
  return NextResponse.json({ error: "CUSTOMER_EXPERIENCE_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const query = request.nextUrl.searchParams.get("q") || "";
    return NextResponse.json(await listCustomerExperienceWorkspace(operator, query));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const entityType = String(body.entityType || "");

    if (entityType === "PROFILE") {
      return NextResponse.json(await createPortalProfile({
        operator,
        portalRole: String(body.portalRole || "BORROWER"),
        displayName: String(body.displayName || ""),
        email: String(body.email || "") || undefined,
        phone: String(body.phone || "") || undefined,
        partyId: String(body.partyId || "") || undefined,
        userId: String(body.userId || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "REQUEST") {
      return NextResponse.json(await createPortalRequest({
        operator,
        portalProfileId: String(body.portalProfileId || ""),
        requestType: String(body.requestType || "OTHER"),
        title: String(body.title || ""),
        description: String(body.description || "") || undefined,
        priority: String(body.priority || "NORMAL"),
        relatedEntityType: String(body.relatedEntityType || "") || undefined,
        relatedEntityId: String(body.relatedEntityId || "") || undefined,
        payload: typeof body.payload === "object" && body.payload !== null ? body.payload as Record<string, unknown> : {},
        dueAt: String(body.dueAt || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "CONVERSATION") {
      return NextResponse.json(await createPortalConversation({
        operator,
        subject: String(body.subject || ""),
        conversationType: String(body.conversationType || "GENERAL"),
        relatedEntityType: String(body.relatedEntityType || "") || undefined,
        relatedEntityId: String(body.relatedEntityId || "") || undefined,
        portalProfileIds: Array.isArray(body.portalProfileIds) ? body.portalProfileIds.map(String) : [],
        openingMessage: String(body.openingMessage || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "NOTIFICATION") {
      return NextResponse.json(await createPortalNotification({
        operator,
        portalProfileId: String(body.portalProfileId || ""),
        notificationType: String(body.notificationType || "GENERAL"),
        title: String(body.title || ""),
        body: String(body.body || ""),
        priority: String(body.priority || "NORMAL"),
        actionUrl: String(body.actionUrl || "") || undefined,
        metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata as Record<string, unknown> : {},
      }), { status: 201 });
    }

    return NextResponse.json({ error: "PORTAL_ENTITY_TYPE_INVALID" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateCustomerExperienceItem({
      operator,
      itemType: String(body.itemType || ""),
      itemId: String(body.itemId || ""),
      action: String(body.action || ""),
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
