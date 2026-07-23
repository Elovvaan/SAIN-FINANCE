import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  createConversation,
  createIntelligenceTask,
  createKnowledgeSource,
  createModelConfig,
  createPromptTemplate,
  createRecommendation,
  listIntelligenceWorkspace,
  updateIntelligenceItem,
} from "@/server/intelligence/intelligence-platform-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "INTELLIGENCE_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code.endsWith("_NOT_FOUND")) return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("INTELLIGENCE_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("INTELLIGENCE_REQUEST_FAILED", error);
  return NextResponse.json({ error: "INTELLIGENCE_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    return NextResponse.json(await listIntelligenceWorkspace(operator));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const entityType = String(body.entityType || "");

    if (entityType === "MODEL") {
      return NextResponse.json(await createModelConfig({
        operator,
        configCode: String(body.configCode || ""),
        configName: String(body.configName || ""),
        provider: String(body.provider || ""),
        modelName: String(body.modelName || ""),
        capabilities: Array.isArray(body.capabilities) ? body.capabilities.map(String) : [],
        credentialReference: String(body.credentialReference || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "PROMPT") {
      return NextResponse.json(await createPromptTemplate({
        operator,
        templateCode: String(body.templateCode || ""),
        templateName: String(body.templateName || ""),
        assistantType: String(body.assistantType || "OPERATIONS"),
        systemInstructions: String(body.systemInstructions || ""),
      }), { status: 201 });
    }

    if (entityType === "SOURCE") {
      return NextResponse.json(await createKnowledgeSource({
        operator,
        sourceCode: String(body.sourceCode || ""),
        sourceName: String(body.sourceName || ""),
        sourceType: String(body.sourceType || "PROCEDURE"),
        sourceReference: String(body.sourceReference || ""),
      }), { status: 201 });
    }

    if (entityType === "CONVERSATION") {
      return NextResponse.json(await createConversation({
        operator,
        assistantType: String(body.assistantType || "OPERATIONS"),
        title: String(body.title || ""),
        contextEntityType: String(body.contextEntityType || "") || undefined,
        contextEntityId: String(body.contextEntityId || "") || undefined,
        message: String(body.message || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "TASK") {
      return NextResponse.json(await createIntelligenceTask({
        operator,
        taskType: String(body.taskType || ""),
        assistantType: String(body.assistantType || "OPERATIONS"),
        priority: String(body.priority || "NORMAL"),
        sourceEntityType: String(body.sourceEntityType || "") || undefined,
        sourceEntityId: String(body.sourceEntityId || "") || undefined,
        inputData: typeof body.inputData === "object" && body.inputData !== null ? body.inputData as Record<string, unknown> : {},
      }), { status: 201 });
    }

    if (entityType === "RECOMMENDATION") {
      return NextResponse.json(await createRecommendation({
        operator,
        recommendationType: String(body.recommendationType || ""),
        title: String(body.title || ""),
        recommendation: String(body.recommendation || ""),
        severity: String(body.severity || "MEDIUM"),
        confidenceScore: body.confidenceScore === undefined || body.confidenceScore === "" ? undefined : Number(body.confidenceScore),
        sourceEntityType: String(body.sourceEntityType || "") || undefined,
        sourceEntityId: String(body.sourceEntityId || "") || undefined,
      }), { status: 201 });
    }

    return NextResponse.json({ error: "INTELLIGENCE_ENTITY_TYPE_INVALID" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateIntelligenceItem({
      operator,
      itemType: String(body.itemType || ""),
      itemId: String(body.itemId || ""),
      action: String(body.action || ""),
      explanation: String(body.explanation || "") || undefined,
      confidenceScore: body.confidenceScore === undefined || body.confidenceScore === "" ? undefined : Number(body.confidenceScore),
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
