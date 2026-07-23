import { NextRequest, NextResponse } from "next/server";
import {
  addWorkflowStep,
  createWorkflowDefinition,
  listWorkflowWorkspace,
  startWorkflowInstance,
  updateWorkflowItem,
} from "../../../../server/workflow/enterprise-workflow-service";

function getOperator(request: NextRequest) {
  const institutionKey = request.headers.get("x-institution-key")?.trim();
  const userId = request.headers.get("x-user-id")?.trim();
  if (!institutionKey || !userId) throw new Error("WORKFLOW_OPERATOR_HEADERS_REQUIRED");
  return { institutionKey, userId };
}

export async function GET(request: NextRequest) {
  try {
    const operator = getOperator(request);
    const query = request.nextUrl.searchParams.get("query") || "";
    const workspace = await listWorkflowWorkspace(operator, query);
    return NextResponse.json(workspace);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = getOperator(request);
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "CREATE_DEFINITION") {
      return NextResponse.json(await createWorkflowDefinition({
        operator,
        workflowCode: String(body.workflowCode || ""),
        workflowName: String(body.workflowName || ""),
        category: String(body.category || ""),
        description: optionalString(body.description),
        triggerType: optionalString(body.triggerType),
        triggerConfig: objectValue(body.triggerConfig),
      }));
    }

    if (action === "ADD_STEP") {
      return NextResponse.json(await addWorkflowStep({
        operator,
        workflowDefinitionId: String(body.workflowDefinitionId || ""),
        stepCode: String(body.stepCode || ""),
        stepName: String(body.stepName || ""),
        stepType: String(body.stepType || ""),
        sequenceNumber: Number(body.sequenceNumber),
        assignedRole: optionalString(body.assignedRole),
        configuration: objectValue(body.configuration),
        slaMinutes: optionalNumber(body.slaMinutes),
        isRequired: typeof body.isRequired === "boolean" ? body.isRequired : undefined,
      }));
    }

    if (action === "START_INSTANCE") {
      return NextResponse.json(await startWorkflowInstance({
        operator,
        workflowDefinitionId: String(body.workflowDefinitionId || ""),
        relatedEntityType: optionalString(body.relatedEntityType),
        relatedEntityId: optionalString(body.relatedEntityId),
        priority: optionalString(body.priority),
        context: objectValue(body.context),
      }));
    }

    if (action === "UPDATE_ITEM") {
      return NextResponse.json(await updateWorkflowItem({
        operator,
        itemType: String(body.itemType || ""),
        itemId: String(body.itemId || ""),
        action: String(body.itemAction || ""),
        note: optionalString(body.note),
      }));
    }

    throw new Error("WORKFLOW_ACTION_INVALID");
  } catch (error) {
    return errorResponse(error);
  }
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "WORKFLOW_REQUEST_FAILED";
  const status = message.endsWith("_NOT_FOUND") ? 404 : message.includes("REQUIRED") || message.includes("INVALID") ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}