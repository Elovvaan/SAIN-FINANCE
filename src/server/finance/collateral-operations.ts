import { randomUUID } from "node:crypto";
import {
  appendAuditEvent,
  assertAuthority,
  now,
  type CollateralRecord,
} from "./filing-office-domain";
import type { FilingOfficeOperationContext } from "./filing-office-operation-types";

export function handleCollateralOperation(context: FilingOfficeOperationContext): unknown | undefined {
  const { state, operation, actorId, input } = context;

  switch (operation) {
    case "addCollateralRecord": {
      const authority = assertAuthority(state, actorId, "COLLATERAL_ADD");
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_COLLATERAL_AMOUNT");

      const record: CollateralRecord = {
        id: randomUUID(),
        institutionId: state.institution.id,
        description: String(input.description),
        amount,
        status: input.exception ? "EXCEPTION" : "PLEDGED",
        electronic: Boolean(input.electronic),
        creditCardReceivable: Boolean(input.creditCardReceivable),
        thirdPartyCustodian: Boolean(input.thirdPartyCustodian),
        createdAt: now(),
      };

      state.collateral.push(record);
      appendAuditEvent(state, actorId, operation, record.id, undefined, record.status, authority.id);
      return record;
    }

    case "withdrawCollateralRecord": {
      const authority = assertAuthority(state, actorId, "COLLATERAL_WITHDRAW");
      const record = state.collateral.find((candidate) => candidate.id === input.collateralId);
      if (!record) throw new Error("COLLATERAL_NOT_FOUND");

      const previous = record.status;
      record.status = "WITHDRAWN";
      record.withdrawnAt = now();
      appendAuditEvent(state, actorId, operation, record.id, previous, record.status, authority.id);
      return record;
    }

    case "generateCollateralSchedule": {
      const authority = assertAuthority(state, actorId, "DOCUMENT_GENERATE");
      const records = state.collateral.filter((item) => item.status === "PLEDGED");
      const total = records.reduce((sum, item) => sum + item.amount, 0);
      appendAuditEvent(state, actorId, operation, String(input.packageId), undefined, String(total), authority.id);
      return { total, records };
    }

    default:
      return undefined;
  }
}
