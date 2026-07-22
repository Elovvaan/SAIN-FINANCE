import type { FilingState } from "./filing-office-domain";

export interface FilingOfficeOperationContext {
  state: FilingState;
  operation: string;
  actorId: string;
  input: Record<string, unknown>;
}

export type FilingOfficeOperationHandler = (
  context: FilingOfficeOperationContext,
) => unknown | undefined;
