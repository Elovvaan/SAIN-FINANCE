import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "./postgres-database";

export type FinancialPostingOperator = {
  institutionKey: string;
  userId: string;
};

export type FinancialPostingLine = {
  glAccountId: string;
  debitAmount?: number;
  creditAmount?: number;
  description?: string;
  customerId?: string;
  loanPackageId?: string;
  servicingLoanId?: string;
  metadata?: Record<string, unknown>;
};

export type FinancialPostingInput = {
  operator: FinancialPostingOperator;
  idempotencyKey: string;
  sourceModule: string;
  sourceReference: string;
  accountingDate: string;
  description: string;
  lines: FinancialPostingLine[];
  metadata?: Record<string, unknown>;
  autoPost?: boolean;
};

export type FinancialPostingResult = {
  postingId: string;
  glBatchId: string;
  glJournalEntryId: string;
  batchNumber: string;
  journalNumber: string;
  status: "DRAFT" | "POSTED";
  idempotentReplay: boolean;
};

function money(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) throw new Error("FINANCIAL_POSTING_AMOUNT_INVALID");
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function makeNumber(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function normalizeLines(lines: FinancialPostingLine[]) {
  if (!Array.isArray(lines) || lines.length < 2) throw new Error("FINANCIAL_POSTING_LINES_REQUIRED");

  const normalized = lines.map((line, index) => ({
    ...line,
    lineNumber: index + 1,
    debitAmount: money(line.debitAmount),
    creditAmount: money(line.creditAmount),
  }));

  for (const line of normalized) {
    const hasDebit = line.debitAmount > 0;
    const hasCredit = line.creditAmount > 0;
    if (!line.glAccountId || line.debitAmount < 0 || line.creditAmount < 0 || hasDebit === hasCredit) {
      throw new Error("FINANCIAL_POSTING_LINE_INVALID");
    }
  }

  const debitTotal = money(normalized.reduce((sum, line) => sum + line.debitAmount, 0));
  const creditTotal = money(normalized.reduce((sum, line) => sum + line.creditAmount, 0));
  if (debitTotal <= 0 || debitTotal !== creditTotal) throw new Error("FINANCIAL_POSTING_NOT_BALANCED");

  return { normalized, debitTotal, creditTotal };
}

export class FinancialPostingService {
  static async post(input: FinancialPostingInput): Promise<FinancialPostingResult> {
    if (!input.operator.institutionKey || !input.operator.userId) throw new Error("FINANCIAL_POSTING_OPERATOR_REQUIRED");
    if (!input.idempotencyKey.trim()) throw new Error("FINANCIAL_POSTING_IDEMPOTENCY_KEY_REQUIRED");
    if (!input.sourceModule.trim() || !input.sourceReference.trim()) throw new Error("FINANCIAL_POSTING_SOURCE_REQUIRED");
    if (!input.accountingDate || !input.description.trim()) throw new Error("FINANCIAL_POSTING_FIELDS_REQUIRED");

    const { normalized, debitTotal, creditTotal } = normalizeLines(input.lines);
    const database = new PostgresDatabase();

    return database.transaction(async (client) => {
      const replay = await client.query<{
        posting_id: string;
        gl_batch_id: string;
        gl_journal_entry_id: string;
        batch_number: string;
        journal_number: string;
        status: "DRAFT" | "POSTED";
      }>(
        `SELECT p.posting_id,p.gl_batch_id,p.gl_journal_entry_id,b.batch_number,e.journal_number,e.status
         FROM financial_postings p
         JOIN gl_batches b ON b.institution_key=p.institution_key AND b.gl_batch_id=p.gl_batch_id
         JOIN gl_journal_entries e ON e.institution_key=p.institution_key AND e.gl_journal_entry_id=p.gl_journal_entry_id
         WHERE p.institution_key=$1 AND p.idempotency_key=$2
         LIMIT 1`,
        [input.operator.institutionKey, input.idempotencyKey.trim()],
      );

      if (replay.rows[0]) {
        const existing = replay.rows[0];
        return {
          postingId: existing.posting_id,
          glBatchId: existing.gl_batch_id,
          glJournalEntryId: existing.gl_journal_entry_id,
          batchNumber: existing.batch_number,
          journalNumber: existing.journal_number,
          status: existing.status,
          idempotentReplay: true,
        };
      }

      const accountIds = [...new Set(normalized.map((line) => line.glAccountId))];
      const accountCheck = await client.query<{ gl_account_id: string }>(
        `SELECT gl_account_id FROM gl_accounts
         WHERE institution_key=$1 AND status='ACTIVE' AND gl_account_id=ANY($2::uuid[])`,
        [input.operator.institutionKey, accountIds],
      );
      if (accountCheck.rows.length !== accountIds.length) throw new Error("FINANCIAL_POSTING_ACCOUNT_NOT_FOUND");

      const postingId = randomUUID();
      const glBatchId = randomUUID();
      const glJournalEntryId = randomUUID();
      const batchNumber = makeNumber("BAT");
      const journalNumber = makeNumber("JE");
      const metadata = {
        ...(input.metadata ?? {}),
        idempotencyKey: input.idempotencyKey.trim(),
        postingId,
        debitTotal,
        creditTotal,
      };

      await client.query(
        `INSERT INTO gl_batches (
           gl_batch_id,institution_key,batch_number,source_module,status,accounting_date,
           description,created_by
         ) VALUES ($1,$2,$3,$4,'OPEN',$5,$6,$7)`,
        [
          glBatchId,
          input.operator.institutionKey,
          batchNumber,
          input.sourceModule.trim(),
          input.accountingDate,
          input.description.trim(),
          input.operator.userId,
        ],
      );

      await client.query(
        `INSERT INTO gl_journal_entries (
           gl_journal_entry_id,institution_key,gl_batch_id,journal_number,source_module,
           source_reference,accounting_date,status,description,created_by,metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9,$10::jsonb)`,
        [
          glJournalEntryId,
          input.operator.institutionKey,
          glBatchId,
          journalNumber,
          input.sourceModule.trim(),
          input.sourceReference.trim(),
          input.accountingDate,
          input.description.trim(),
          input.operator.userId,
          JSON.stringify(metadata),
        ],
      );

      for (const line of normalized) {
        await client.query(
          `INSERT INTO gl_journal_lines (
             gl_journal_line_id,institution_key,gl_journal_entry_id,gl_account_id,line_number,
             debit_amount,credit_amount,description,customer_id,loan_package_id,servicing_loan_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            randomUUID(),
            input.operator.institutionKey,
            glJournalEntryId,
            line.glAccountId,
            line.lineNumber,
            line.debitAmount,
            line.creditAmount,
            line.description?.trim() || null,
            line.customerId || null,
            line.loanPackageId || null,
            line.servicingLoanId || null,
          ],
        );
      }

      await client.query(
        `INSERT INTO financial_postings (
           posting_id,institution_key,idempotency_key,source_module,source_reference,
           gl_batch_id,gl_journal_entry_id,status,metadata,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8::jsonb,$9)`,
        [
          postingId,
          input.operator.institutionKey,
          input.idempotencyKey.trim(),
          input.sourceModule.trim(),
          input.sourceReference.trim(),
          glBatchId,
          glJournalEntryId,
          JSON.stringify(metadata),
          input.operator.userId,
        ],
      );

      await this.recordEvent(client, input.operator, glJournalEntryId, "FINANCIAL_POSTING_CREATED", metadata);

      if (input.autoPost !== false) {
        await this.postJournalInTransaction({
          client,
          operator: input.operator,
          glBatchId,
          glJournalEntryId,
          accountingDate: input.accountingDate,
          debitTotal,
          creditTotal,
          postingId,
        });
      }

      return {
        postingId,
        glBatchId,
        glJournalEntryId,
        batchNumber,
        journalNumber,
        status: input.autoPost === false ? "DRAFT" : "POSTED",
        idempotentReplay: false,
      };
    });
  }

  static async reverse(input: {
    operator: FinancialPostingOperator;
    originalJournalEntryId: string;
    idempotencyKey: string;
    accountingDate: string;
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<FinancialPostingResult> {
    const database = new PostgresDatabase();

    return database.transaction(async (client) => {
      const entry = await client.query<{
        source_module: string;
        source_reference: string | null;
        status: string;
      }>(
        `SELECT source_module,source_reference,status
         FROM gl_journal_entries
         WHERE institution_key=$1 AND gl_journal_entry_id=$2
         LIMIT 1`,
        [input.operator.institutionKey, input.originalJournalEntryId],
      );
      const original = entry.rows[0];
      if (!original) throw new Error("FINANCIAL_POSTING_ORIGINAL_NOT_FOUND");
      if (original.status !== "POSTED") throw new Error("FINANCIAL_POSTING_ORIGINAL_NOT_POSTED");

      const lines = await client.query<{
        gl_account_id: string;
        debit_amount: string;
        credit_amount: string;
        description: string | null;
        customer_id: string | null;
        loan_package_id: string | null;
        servicing_loan_id: string | null;
      }>(
        `SELECT gl_account_id,debit_amount::text,credit_amount::text,description,customer_id,loan_package_id,servicing_loan_id
         FROM gl_journal_lines
         WHERE institution_key=$1 AND gl_journal_entry_id=$2
         ORDER BY line_number`,
        [input.operator.institutionKey, input.originalJournalEntryId],
      );

      const result = await this.post({
        operator: input.operator,
        idempotencyKey: input.idempotencyKey,
        sourceModule: `${original.source_module}_REVERSAL`,
        sourceReference: original.source_reference || input.originalJournalEntryId,
        accountingDate: input.accountingDate,
        description: input.description,
        lines: lines.rows.map((line) => ({
          glAccountId: line.gl_account_id,
          debitAmount: money(line.credit_amount),
          creditAmount: money(line.debit_amount),
          description: line.description || undefined,
          customerId: line.customer_id || undefined,
          loanPackageId: line.loan_package_id || undefined,
          servicingLoanId: line.servicing_loan_id || undefined,
        })),
        metadata: {
          ...(input.metadata ?? {}),
          reversalOfEntryId: input.originalJournalEntryId,
        },
        autoPost: true,
      });

      await client.query(
        `UPDATE gl_journal_entries
         SET reversal_of_entry_id=$3
         WHERE institution_key=$1 AND gl_journal_entry_id=$2 AND status='POSTED'`,
        [input.operator.institutionKey, result.glJournalEntryId, input.originalJournalEntryId],
      );
      await client.query(
        `UPDATE gl_journal_entries
         SET status='REVERSED'
         WHERE institution_key=$1 AND gl_journal_entry_id=$2 AND status='POSTED'`,
        [input.operator.institutionKey, input.originalJournalEntryId],
      );
      await this.recordEvent(client, input.operator, input.originalJournalEntryId, "FINANCIAL_POSTING_REVERSED", {
        reversingJournalEntryId: result.glJournalEntryId,
      });

      return result;
    });
  }

  private static async postJournalInTransaction(input: {
    client: { query: Function };
    operator: FinancialPostingOperator;
    glBatchId: string;
    glJournalEntryId: string;
    accountingDate: string;
    debitTotal: number;
    creditTotal: number;
    postingId: string;
  }) {
    await input.client.query(
      `UPDATE gl_journal_entries
       SET status='POSTED',posted_at=NOW(),posted_by=$3
       WHERE institution_key=$1 AND gl_journal_entry_id=$2 AND status='DRAFT'`,
      [input.operator.institutionKey, input.glJournalEntryId, input.operator.userId],
    );

    await input.client.query(
      `UPDATE gl_batches
       SET status='POSTED',posted_at=NOW(),posted_by=$3
       WHERE institution_key=$1 AND gl_batch_id=$2 AND status='OPEN'`,
      [input.operator.institutionKey, input.glBatchId, input.operator.userId],
    );

    await input.client.query(
      `INSERT INTO gl_account_balances (
         gl_account_balance_id,institution_key,gl_account_id,accounting_date,
         debit_total,credit_total,ending_balance
       )
       SELECT gen_random_uuid(),l.institution_key,l.gl_account_id,$3::date,
              SUM(l.debit_amount),SUM(l.credit_amount),
              CASE WHEN a.normal_balance='DEBIT'
                   THEN SUM(l.debit_amount-l.credit_amount)
                   ELSE SUM(l.credit_amount-l.debit_amount)
              END
       FROM gl_journal_lines l
       JOIN gl_accounts a ON a.institution_key=l.institution_key AND a.gl_account_id=l.gl_account_id
       WHERE l.institution_key=$1 AND l.gl_journal_entry_id=$2
       GROUP BY l.institution_key,l.gl_account_id,a.normal_balance
       ON CONFLICT (institution_key,gl_account_id,accounting_date) DO UPDATE SET
         debit_total=gl_account_balances.debit_total+EXCLUDED.debit_total,
         credit_total=gl_account_balances.credit_total+EXCLUDED.credit_total,
         ending_balance=gl_account_balances.ending_balance+EXCLUDED.ending_balance,
         updated_at=NOW()`,
      [input.operator.institutionKey, input.glJournalEntryId, input.accountingDate],
    );

    await input.client.query(
      `UPDATE financial_postings
       SET status='POSTED',posted_at=NOW(),updated_at=NOW()
       WHERE posting_id=$1`,
      [input.postingId],
    );

    await this.recordEvent(input.client, input.operator, input.glJournalEntryId, "FINANCIAL_POSTING_POSTED", {
      postingId: input.postingId,
      debitTotal: input.debitTotal,
      creditTotal: input.creditTotal,
    });
  }

  private static async recordEvent(
    client: { query: Function },
    operator: FinancialPostingOperator,
    glJournalEntryId: string,
    eventType: string,
    eventData: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO gl_events (
         gl_event_id,institution_key,gl_journal_entry_id,event_type,actor_user_id,event_data
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [
        randomUUID(),
        operator.institutionKey,
        glJournalEntryId,
        eventType,
        operator.userId,
        JSON.stringify(eventData),
      ],
    );
  }
}
