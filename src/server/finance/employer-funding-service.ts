import { randomUUID } from "node:crypto";
import { FinancialPostingService, type FinancialPostingOperator } from "./financial-posting-service";
import { PostgresDatabase } from "./postgres-database";

export type EmployerFundingProfileInput = {
  operator: FinancialPostingOperator;
  employerKey: string;
  displayName: string;
  cashGlAccountId: string;
  fundingLiabilityGlAccountId: string;
  metadata?: Record<string, unknown>;
};

export type EmployerFundingInput = {
  operator: FinancialPostingOperator;
  employerKey: string;
  idempotencyKey: string;
  amount: number;
  accountingDate: string;
  description: string;
  metadata?: Record<string, unknown>;
};

function required(value: string, code: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function amount(value: number) {
  const normalized = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(normalized) || normalized <= 0) throw new Error("EMPLOYER_FUNDING_AMOUNT_INVALID");
  return normalized;
}

export class EmployerFundingService {
  static async configure(input: EmployerFundingProfileInput) {
    const employerKey = required(input.employerKey, "EMPLOYER_KEY_REQUIRED");
    const displayName = required(input.displayName, "EMPLOYER_DISPLAY_NAME_REQUIRED");
    const cashGlAccountId = required(input.cashGlAccountId, "EMPLOYER_CASH_ACCOUNT_REQUIRED");
    const fundingLiabilityGlAccountId = required(input.fundingLiabilityGlAccountId, "EMPLOYER_FUNDING_LIABILITY_ACCOUNT_REQUIRED");
    if (cashGlAccountId === fundingLiabilityGlAccountId) throw new Error("EMPLOYER_FUNDING_ACCOUNTS_MUST_DIFFER");

    const database = new PostgresDatabase();
    return database.transaction(async (client) => {
      const accounts = await client.query<{ gl_account_id: string }>(
        `SELECT gl_account_id FROM gl_accounts
         WHERE institution_key=$1 AND status='ACTIVE' AND gl_account_id=ANY($2::uuid[])`,
        [input.operator.institutionKey, [cashGlAccountId, fundingLiabilityGlAccountId]],
      );
      if (accounts.rows.length !== 2) throw new Error("EMPLOYER_FUNDING_ACCOUNT_NOT_FOUND");

      const result = await client.query(
        `INSERT INTO employer_funding_profiles (
           employer_funding_profile_id,institution_key,employer_key,display_name,
           cash_gl_account_id,funding_liability_gl_account_id,created_by,updated_by,metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8::jsonb)
         ON CONFLICT (institution_key,employer_key) DO UPDATE SET
           display_name=EXCLUDED.display_name,
           cash_gl_account_id=EXCLUDED.cash_gl_account_id,
           funding_liability_gl_account_id=EXCLUDED.funding_liability_gl_account_id,
           status='ACTIVE',updated_by=EXCLUDED.updated_by,updated_at=NOW(),metadata=EXCLUDED.metadata
         RETURNING employer_funding_profile_id,employer_key,display_name,cash_gl_account_id,
                   funding_liability_gl_account_id,status,created_at,updated_at`,
        [
          randomUUID(), input.operator.institutionKey, employerKey, displayName,
          cashGlAccountId, fundingLiabilityGlAccountId, input.operator.userId,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
      return result.rows[0];
    });
  }

  static async getProfile(operator: FinancialPostingOperator, employerKeyInput: string) {
    const employerKey = required(employerKeyInput, "EMPLOYER_KEY_REQUIRED");
    const database = new PostgresDatabase();
    return database.transaction(async (client) => {
      const result = await client.query(
        `SELECT employer_funding_profile_id,employer_key,display_name,cash_gl_account_id,
                funding_liability_gl_account_id,status,created_at,updated_at
         FROM employer_funding_profiles
         WHERE institution_key=$1 AND employer_key=$2 LIMIT 1`,
        [operator.institutionKey, employerKey],
      );
      return result.rows[0] ?? null;
    });
  }

  static async post(input: EmployerFundingInput) {
    const employerKey = required(input.employerKey, "EMPLOYER_KEY_REQUIRED");
    const idempotencyKey = required(input.idempotencyKey, "EMPLOYER_FUNDING_IDEMPOTENCY_KEY_REQUIRED");
    const description = required(input.description, "EMPLOYER_FUNDING_DESCRIPTION_REQUIRED");
    const fundingAmount = amount(input.amount);
    const accountingDate = input.accountingDate.trim();
    if (!accountingDate) throw new Error("EMPLOYER_FUNDING_ACCOUNTING_DATE_REQUIRED");

    const database = new PostgresDatabase();
    const existing = await database.transaction(async (client) => {
      const replay = await client.query(
        `SELECT employer_funding_event_id,employer_key,amount::text,accounting_date::text,description,
                status,financial_posting_id,gl_journal_entry_id,created_at
         FROM employer_funding_events WHERE institution_key=$1 AND idempotency_key=$2 LIMIT 1`,
        [input.operator.institutionKey, idempotencyKey],
      );
      return replay.rows[0] ?? null;
    });
    if (existing) return { ...existing, idempotentReplay: true };

    const profile = await this.getProfile(input.operator, employerKey) as null | {
      cash_gl_account_id: string;
      funding_liability_gl_account_id: string;
      status: string;
    };
    if (!profile || profile.status !== "ACTIVE") throw new Error("EMPLOYER_FUNDING_PROFILE_NOT_ACTIVE");

    const posting = await FinancialPostingService.post({
      operator: input.operator,
      idempotencyKey: `employer-funding:${idempotencyKey}`,
      sourceModule: "EMPLOYER_FUNDING",
      sourceReference: employerKey,
      accountingDate,
      description,
      lines: [
        { glAccountId: profile.cash_gl_account_id, debitAmount: fundingAmount, description },
        { glAccountId: profile.funding_liability_gl_account_id, creditAmount: fundingAmount, description },
      ],
      metadata: { ...(input.metadata ?? {}), employerKey, fundingAmount },
      autoPost: true,
    });

    return database.transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO employer_funding_events (
           employer_funding_event_id,institution_key,employer_key,idempotency_key,amount,
           accounting_date,description,status,financial_posting_id,gl_journal_entry_id,created_by,metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'POSTED',$8,$9,$10,$11::jsonb)
         ON CONFLICT (institution_key,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
         RETURNING employer_funding_event_id,employer_key,amount::text,accounting_date::text,
                   description,status,financial_posting_id,gl_journal_entry_id,created_at`,
        [
          randomUUID(), input.operator.institutionKey, employerKey, idempotencyKey, fundingAmount,
          accountingDate, description, posting.postingId, posting.glJournalEntryId,
          input.operator.userId, JSON.stringify(input.metadata ?? {}),
        ],
      );
      return { ...result.rows[0], idempotentReplay: posting.idempotentReplay };
    });
  }

  static async list(operator: FinancialPostingOperator, employerKeyInput: string) {
    const employerKey = required(employerKeyInput, "EMPLOYER_KEY_REQUIRED");
    const database = new PostgresDatabase();
    return database.transaction(async (client) => {
      const result = await client.query(
        `SELECT employer_funding_event_id,employer_key,amount::text,accounting_date::text,
                description,status,financial_posting_id,gl_journal_entry_id,created_at
         FROM employer_funding_events
         WHERE institution_key=$1 AND employer_key=$2
         ORDER BY created_at DESC LIMIT 100`,
        [operator.institutionKey, employerKey],
      );
      return result.rows;
    });
  }
}
