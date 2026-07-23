import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  assignUserRole,
  createBranch,
  createLoanProduct,
  createRole,
  createWorkflow,
  listAdministrationWorkspace,
  updateAdministrationItem,
  upsertSetting,
} from "@/server/administration/enterprise-administration-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "ADMINISTRATION_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code.endsWith("_NOT_FOUND")) return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("ADMIN_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("ADMINISTRATION_REQUEST_FAILED", error);
  return NextResponse.json({ error: "ADMINISTRATION_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    return NextResponse.json(await listAdministrationWorkspace(operator, request.nextUrl.searchParams.get("q") || ""));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const entityType = String(body.entityType || "");

    if (entityType === "BRANCH") {
      return NextResponse.json(await createBranch({
        operator,
        branchCode: String(body.branchCode || ""),
        branchName: String(body.branchName || ""),
        timezone: String(body.timezone || "") || undefined,
        address: typeof body.address === "object" && body.address !== null ? body.address as Record<string,unknown> : {},
      }), { status: 201 });
    }

    if (entityType === "ROLE") {
      return NextResponse.json(await createRole({
        operator,
        roleCode: String(body.roleCode || ""),
        roleName: String(body.roleName || ""),
        description: String(body.description || "") || undefined,
        permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
        approvalLimit: body.approvalLimit === undefined || body.approvalLimit === "" ? undefined : Number(body.approvalLimit),
      }), { status: 201 });
    }

    if (entityType === "ASSIGNMENT") {
      return NextResponse.json(await assignUserRole({
        operator,
        userId: String(body.userId || ""),
        roleId: String(body.roleId || ""),
        branchId: String(body.branchId || "") || undefined,
        effectiveFrom: String(body.effectiveFrom || "") || undefined,
        effectiveTo: String(body.effectiveTo || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "PRODUCT") {
      return NextResponse.json(await createLoanProduct({
        operator,
        productCode: String(body.productCode || ""),
        productName: String(body.productName || ""),
        minAmount: body.minAmount === undefined || body.minAmount === "" ? undefined : Number(body.minAmount),
        maxAmount: body.maxAmount === undefined || body.maxAmount === "" ? undefined : Number(body.maxAmount),
        minRate: body.minRate === undefined || body.minRate === "" ? undefined : Number(body.minRate),
        maxRate: body.maxRate === undefined || body.maxRate === "" ? undefined : Number(body.maxRate),
        minTermMonths: body.minTermMonths === undefined || body.minTermMonths === "" ? undefined : Number(body.minTermMonths),
        maxTermMonths: body.maxTermMonths === undefined || body.maxTermMonths === "" ? undefined : Number(body.maxTermMonths),
        feeSchedule: typeof body.feeSchedule === "object" && body.feeSchedule !== null ? body.feeSchedule as Record<string,unknown> : {},
        policyRules: typeof body.policyRules === "object" && body.policyRules !== null ? body.policyRules as Record<string,unknown> : {},
      }), { status: 201 });
    }

    if (entityType === "WORKFLOW") {
      return NextResponse.json(await createWorkflow({
        operator,
        workflowCode: String(body.workflowCode || ""),
        workflowName: String(body.workflowName || ""),
        module: String(body.module || ""),
        definition: typeof body.definition === "object" && body.definition !== null ? body.definition as Record<string,unknown> : {},
      }), { status: 201 });
    }

    if (entityType === "SETTING") {
      return NextResponse.json(await upsertSetting({
        operator,
        settingKey: String(body.settingKey || ""),
        settingValue: body.settingValue ?? null,
        description: String(body.description || "") || undefined,
        isSensitive: Boolean(body.isSensitive),
      }), { status: 201 });
    }

    return NextResponse.json({ error: "ADMIN_ENTITY_TYPE_INVALID" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateAdministrationItem({
      operator,
      itemType: String(body.itemType || ""),
      itemId: String(body.itemId || ""),
      action: String(body.action || ""),
    }));
  } catch (error) {
    return errorResponse(error);
  }
}