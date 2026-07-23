import { NextRequest, NextResponse } from "next/server";
import {
  createDeployment,
  createIncident,
  createMaintenance,
  createPlatformService,
  getPlatformOperationsWorkspace,
  updatePlatformOperation,
} from "@/lib/platform-operations-service";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    return NextResponse.json(await getPlatformOperationsWorkspace(q));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "PLATFORM_OPERATIONS_UNAVAILABLE" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const actor = request.headers.get("x-operator-user-id") || "operator";
    if (body.entityType === "SERVICE") return NextResponse.json(await createPlatformService(body, actor), { status: 201 });
    if (body.entityType === "DEPLOYMENT") return NextResponse.json(await createDeployment(body, actor), { status: 201 });
    if (body.entityType === "INCIDENT") return NextResponse.json(await createIncident(body, actor), { status: 201 });
    if (body.entityType === "MAINTENANCE") return NextResponse.json(await createMaintenance(body, actor), { status: 201 });
    return NextResponse.json({ error: "INVALID_ENTITY_TYPE" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "PLATFORM_OPERATIONS_UNAVAILABLE" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const actor = request.headers.get("x-operator-user-id") || "operator";
    return NextResponse.json(await updatePlatformOperation(body.itemType, body.itemId, body.action, actor));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "PLATFORM_OPERATIONS_UNAVAILABLE" }, { status: 500 });
  }
}
