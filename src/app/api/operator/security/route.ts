import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  createAccessPolicy,
  createEncryptionKey,
  createMfaMethod,
  createRecoveryPlan,
  createSecret,
  createSecurityEvent,
  createSecurityFinding,
  createTrustedDevice,
  listSecurityWorkspace,
  updateSecurityItem,
} from "@/server/security/enterprise-security-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "SECURITY_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code.endsWith("_NOT_FOUND")) return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("SECURITY_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("SECURITY_REQUEST_FAILED", error);
  return NextResponse.json({ error: "SECURITY_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    return NextResponse.json(await listSecurityWorkspace(operator, request.nextUrl.searchParams.get("q") || ""));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const entityType = String(body.entityType || "");

    if (entityType === "MFA_METHOD") {
      return NextResponse.json(await createMfaMethod({
        operator,
        userId: String(body.userId || ""),
        methodType: String(body.methodType || "TOTP"),
        displayName: String(body.displayName || ""),
        credentialId: String(body.credentialId || "") || undefined,
        publicKey: String(body.publicKey || "") || undefined,
        phoneLastFour: String(body.phoneLastFour || "") || undefined,
        emailAddress: String(body.emailAddress || "") || undefined,
        secretReference: String(body.secretReference || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "DEVICE") {
      return NextResponse.json(await createTrustedDevice({
        operator,
        userId: String(body.userId || ""),
        deviceName: String(body.deviceName || ""),
        deviceFingerprint: String(body.deviceFingerprint || ""),
        platform: String(body.platform || "") || undefined,
        browser: String(body.browser || "") || undefined,
        ipAddress: String(body.ipAddress || "") || undefined,
        trustLevel: String(body.trustLevel || "STANDARD"),
        expiresAt: String(body.expiresAt || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "POLICY") {
      return NextResponse.json(await createAccessPolicy({
        operator,
        policyCode: String(body.policyCode || ""),
        policyName: String(body.policyName || ""),
        resourceType: String(body.resourceType || ""),
        actionPattern: String(body.actionPattern || ""),
        decision: String(body.decision || "DENY"),
        priority: body.priority == null || body.priority === "" ? undefined : Number(body.priority),
        description: String(body.description || "") || undefined,
        conditions: typeof body.conditions === "object" && body.conditions !== null ? body.conditions as Record<string,unknown> : {},
      }), { status: 201 });
    }

    if (entityType === "KEY") {
      return NextResponse.json(await createEncryptionKey({
        operator,
        keyAlias: String(body.keyAlias || ""),
        keyPurpose: String(body.keyPurpose || ""),
        provider: String(body.provider || ""),
        providerKeyReference: String(body.providerKeyReference || ""),
        algorithm: String(body.algorithm || ""),
        rotationIntervalDays: body.rotationIntervalDays == null || body.rotationIntervalDays === "" ? undefined : Number(body.rotationIntervalDays),
        nextRotationAt: String(body.nextRotationAt || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "SECRET") {
      return NextResponse.json(await createSecret({
        operator,
        secretName: String(body.secretName || ""),
        secretType: String(body.secretType || ""),
        vaultProvider: String(body.vaultProvider || ""),
        vaultReference: String(body.vaultReference || ""),
        ownerTeam: String(body.ownerTeam || "") || undefined,
        rotationIntervalDays: body.rotationIntervalDays == null || body.rotationIntervalDays === "" ? undefined : Number(body.rotationIntervalDays),
        nextRotationAt: String(body.nextRotationAt || "") || undefined,
        expiresAt: String(body.expiresAt || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "EVENT") {
      return NextResponse.json(await createSecurityEvent({
        operator,
        eventType: String(body.eventType || ""),
        severity: String(body.severity || "MEDIUM"),
        source: String(body.source || ""),
        title: String(body.title || ""),
        description: String(body.description || ""),
        userId: String(body.userId || "") || undefined,
        securitySessionId: String(body.securitySessionId || "") || undefined,
        ipAddress: String(body.ipAddress || "") || undefined,
        riskScore: body.riskScore == null || body.riskScore === "" ? undefined : Number(body.riskScore),
        eventData: typeof body.eventData === "object" && body.eventData !== null ? body.eventData as Record<string,unknown> : {},
        assignedTo: String(body.assignedTo || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "FINDING") {
      return NextResponse.json(await createSecurityFinding({
        operator,
        findingCode: String(body.findingCode || ""),
        findingType: String(body.findingType || ""),
        title: String(body.title || ""),
        description: String(body.description || ""),
        severity: String(body.severity || "MEDIUM"),
        affectedAsset: String(body.affectedAsset || "") || undefined,
        ownerUserId: String(body.ownerUserId || "") || undefined,
        remediationPlan: String(body.remediationPlan || "") || undefined,
        targetDate: String(body.targetDate || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "RECOVERY_PLAN") {
      return NextResponse.json(await createRecoveryPlan({
        operator,
        planCode: String(body.planCode || ""),
        planName: String(body.planName || ""),
        planType: String(body.planType || "DISASTER_RECOVERY"),
        businessService: String(body.businessService || ""),
        recoveryTimeObjectiveMinutes: body.recoveryTimeObjectiveMinutes == null || body.recoveryTimeObjectiveMinutes === "" ? undefined : Number(body.recoveryTimeObjectiveMinutes),
        recoveryPointObjectiveMinutes: body.recoveryPointObjectiveMinutes == null || body.recoveryPointObjectiveMinutes === "" ? undefined : Number(body.recoveryPointObjectiveMinutes),
        primaryOwner: String(body.primaryOwner || ""),
        secondaryOwner: String(body.secondaryOwner || "") || undefined,
        runbookLocation: String(body.runbookLocation || "") || undefined,
        nextTestAt: String(body.nextTestAt || "") || undefined,
      }), { status: 201 });
    }

    return NextResponse.json({ error: "SECURITY_ENTITY_TYPE_INVALID" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateSecurityItem({
      operator,
      itemType: String(body.itemType || ""),
      itemId: String(body.itemId || ""),
      action: String(body.action || ""),
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
