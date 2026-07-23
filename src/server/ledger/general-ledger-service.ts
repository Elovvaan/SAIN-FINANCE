import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type LedgerOperator = { institutionKey: string; userId: string };

type JournalLineInput = {
  glAccountId: string;
  debitAmount?: number;
  creditAmount?: number;
  description?: string;
  customerId?: string;
  loanPackageId?: string;
  servicingLoanId?: string;
};

const accountTypes = new Set(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]);
const normalBalances = new Set(["DEBIT", "CREDIT"]);

function money(value: unknown) {
  const number = Number(value || 0);
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function makeNumber(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function listLedgerWorkspace(operator: LedgerOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const [accounts, entries, trial] = await Promise.all([
      client.query(
        `SELECT a.gl_account_id,a.account_number,a.account_name,a.account_type,a.normal_balance,a.status,a.allow_manual_posting,
                COALESCE(SUM(CASE WHEN e.status='POSTED' THEN l.debit_amount ELSE 0 END),0)::text AS debit_total,
                COALESCE(SUM(CASE WHEN e.status='POSTED' THEN l.credit_amount ELSE 0 END),0)::text AS credit_total
         FROM gl_accounts a
         LEFT JOIN gl_journal_lines l ON l.institution_key=a.institution_key AND l.gl_account_id=a.gl_account_id
         LEFT JOIN gl_journal_entries e ON e.institution_key=l.institution_key AND e.gl_journal_entry_id=l.gl_journal_entry_id
         WHERE a.institution_key=$1 AND ($2='' OR a.account_number ILIKE '%'||$2||'%' OR a.account_name ILIKE '%'||$2||'%')
         GROUP BY a.gl_account_id
         ORDER BY a.account_number LIMIT 500`,
        [operator.institutionKey, query.trim()],
      ),
      client.query(
        `SELECT e.gl_journal_entry_id,e.journal_number,e.source_module,e.source_reference,e.accounting_date,e.status,e.description,e.posted_at,e.created_at,
                COALESCE(SUM(l.debit_amount),0)::text AS debit_total,COALESCE(SUM(l.credit_amount),0)::text AS credit_total,
                COUNT(l.gl_journal_line_id)::int AS line_count
         FROM gl_journal_entries e
         LEFT JOIN gl_journal_lines l ON l.institution_key=e.institution_key AND l.gl_journal_entry_id=e.gl_journal_entry_id
         WHERE e.institution_key=$1 AND ($2='' OR e.journal_number ILIKE '%'||$2||'%' OR e.description ILIKE '%'||$2||'%' OR COALESCE(e.source_reference,'') ILIKE '%'||$2||'%')
         GROUP BY e.gl_journal_entry_id
         ORDER BY e.accounting_date DESC,e.created_at DESC LIMIT 250`,
        [operator.institutionKey, query.trim()],
      ),
      client.query(
        `SELECT a.account_type,
                COALESCE(SUM(CASE WHEN e.status='POSTED' THEN l.debit_amount ELSE 0 END),0)::text AS debit_total,
                COALESCE(SUM(CASE WHEN e.status='POSTED' THEN l.credit_amount ELSE 0 END),0)::text AS credit_total
         FROM gl_accounts a
         LEFT JOIN gl_journal_lines l ON l.institution_key=a.institution_key AND l.gl_account_id=a.gl_account_id
         LEFT JOIN gl_journal_entries e ON e.institution_key=l.institution_key AND e.gl_journal_entry_id=l.gl_journal_entry_id
         WHERE a.institution_key=$1 GROUP BY a.account_type ORDER BY a.account_type`,
        [operator.institutionKey],
      ),
    ]);
    return { accounts: accounts.rows, entries: entries.rows, trialBalanceSummary: trial.rows };
  });
}

export async function getJournalEntry(operator: LedgerOperator, journalEntryId: string) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const entry = await client.query(
      `SELECT * FROM gl_journal_entries WHERE institution_key=$1 AND gl_journal_entry_id=$2 LIMIT 1`,
      [operator.institutionKey, journalEntryId],
    );
    if (!entry.rows[0]) throw new Error("GL_ENTRY_NOT_FOUND");
    const lines = await client.query(
      `SELECT l.*,a.account_number,a.account_name,a.account_type
       FROM gl_journal_lines l JOIN gl_accounts a ON a.institution_key=l.institution_key AND a.gl_account_id=l.gl_account_id
       WHERE l.institution_key=$1 AND l.gl_journal_entry_id=$2 ORDER BY l.line_number`,
      [operator.institutionKey, journalEntryId],
    );
    const events = await client.query(
      `SELECT * FROM gl_events WHERE institution_key=$1 AND gl_journal_entry_id=$2 ORDER BY occurred_at DESC`,
      [operator.institutionKey, journalEntryId],
    );
    return { entry: entry.rows[0], lines: lines.rows, events: events.rows };
  });
}

export async function createLedgerAccount(input: {
  operator: LedgerOperator;
  accountNumber: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
}) {
  const accountNumber = input.accountNumber.trim();
  const accountName = input.accountName.trim();
  if (!accountNumber || !accountName) throw new Error("GL_ACCOUNT_FIELDS_REQUIRED");
  if (!accountTypes.has(input.accountType)) throw new Error("GL_ACCOUNT_TYPE_INVALID");
  if (!normalBalances.has(input.normalBalance)) throw new Error("GL_NORMAL_BALANCE_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO gl_accounts (gl_account_id,institution_key,account_number,account_name,account_type,normal_balance,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
      [id, input.operator.institutionKey, accountNumber, accountName, input.accountType, input.normalBalance, input.operator.userId],
    );
    await recordEvent(client, input.operator, null, "ACCOUNT_CREATED", { glAccountId: id, accountNumber, accountName });
    return { glAccountId: id };
  });
}

export async function createJournalEntry(input: {
  operator: LedgerOperator;
  sourceModule: string;
  sourceReference?: string;
  accountingDate: string;
  description: string;
  lines: JournalLineInput[];
}) {
  if (!input.sourceModule.trim() || !input.description.trim() || !input.accountingDate) throw new Error("GL_ENTRY_FIELDS_REQUIRED");
  if (!Array.isArray(input.lines) || input.lines.length < 2) throw new Error("GL_ENTRY_LINES_REQUIRED");
  const normalized = input.lines.map((line, index) => ({
    ...line,
    lineNumber: index + 1,
    debitAmount: money(line.debitAmount),
    creditAmount: money(line.creditAmount),
  }));
  for (const line of normalized) {
    if (!line.glAccountId || line.debitAmount < 0 || line.creditAmount < 0 || (line.debitAmount > 0) === (line.creditAmount > 0)) {
      throw new Error("GL_LINE_INVALID");
    }
  }
  const debitTotal = money(normalized.reduce((sum, line) => sum + line.debitAmount, 0));
  const creditTotal = money(normalized.reduce((sum, line) => sum + line.creditAmount, 0));
  if (debitTotal !== creditTotal || debitTotal <= 0) throw new Error("GL_ENTRY_NOT_BALANCED");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const accountIds = normalized.map((line) => line.glAccountId);
    const accountCheck = await client.query(
      `SELECT gl_account_id FROM gl_accounts WHERE institution_key=$1 AND status='ACTIVE' AND gl_account_id=ANY($2::uuid[])`,
      [input.operator.institutionKey, accountIds],
    );
    if (accountCheck.rows.length !== new Set(accountIds).size) throw new Error("GL_ACCOUNT_NOT_FOUND");
    const entryId = randomUUID();
    const journalNumber = makeNumber("JE");
    await client.query(
      `INSERT INTO gl_journal_entries (gl_journal_entry_id,institution_key,journal_number,source_module,source_reference,accounting_date,status,description,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',$7,$8)`,
      [entryId, input.operator.institutionKey, journalNumber, input.sourceModule.trim(), input.sourceReference?.trim() || null, input.accountingDate, input.description.trim(), input.operator.userId],
    );
    for (const line of normalized) {
      await client.query(
        `INSERT INTO gl_journal_lines (gl_journal_line_id,institution_key,gl_journal_entry_id,gl_account_id,line_number,debit_amount,credit_amount,description,customer_id,loan_package_id,servicing_loan_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [randomUUID(), input.operator.institutionKey, entryId, line.glAccountId, line.lineNumber, line.debitAmount, line.creditAmount, line.description?.trim() || null, line.customerId || null, line.loanPackageId || null, line.servicingLoanId || null],
      );
    }
    await recordEvent(client, input.operator, entryId, "JOURNAL_CREATED", { journalNumber, debitTotal, creditTotal });
    return { glJournalEntryId: entryId, journalNumber, status: "DRAFT" };
  });
}

export async function updateJournalEntry(input: { operator: LedgerOperator; journalEntryId: string; action: string }) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const found = await client.query<{ status: string; accounting_date: string }>(
      `SELECT status,accounting_date::text FROM gl_journal_entries WHERE institution_key=$1 AND gl_journal_entry_id=$2 LIMIT 1`,
      [input.operator.institutionKey, input.journalEntryId],
    );
    const current = found.rows[0];
    if (!current) throw new Error("GL_ENTRY_NOT_FOUND");
    if (input.action === "POST") {
      if (current.status !== "DRAFT") throw new Error("GL_ENTRY_NOT_DRAFT");
      const totals = await client.query<{ debit_total: string; credit_total: string }>(
        `SELECT COALESCE(SUM(debit_amount),0)::text debit_total,COALESCE(SUM(credit_amount),0)::text credit_total
         FROM gl_journal_lines WHERE institution_key=$1 AND gl_journal_entry_id=$2`,
        [input.operator.institutionKey, input.journalEntryId],
      );
      const debit = money(totals.rows[0]?.debit_total);
      const credit = money(totals.rows[0]?.credit_total);
      if (debit <= 0 || debit !== credit) throw new Error("GL_ENTRY_NOT_BALANCED");
      await client.query(
        `UPDATE gl_journal_entries SET status='POSTED',posted_at=NOW(),posted_by=$3 WHERE institution_key=$1 AND gl_journal_entry_id=$2`,
        [input.operator.institutionKey, input.journalEntryId, input.operator.userId],
      );
      await client.query(
        `INSERT INTO gl_account_balances (gl_account_balance_id,institution_key,gl_account_id,accounting_date,debit_total,credit_total,ending_balance)
         SELECT gen_random_uuid(),l.institution_key,l.gl_account_id,$3::date,SUM(l.debit_amount),SUM(l.credit_amount),
                CASE WHEN a.normal_balance='DEBIT' THEN SUM(l.debit_amount-l.credit_amount) ELSE SUM(l.credit_amount-l.debit_amount) END
         FROM gl_journal_lines l JOIN gl_accounts a ON a.institution_key=l.institution_key AND a.gl_account_id=l.gl_account_id
         WHERE l.institution_key=$1 AND l.gl_journal_entry_id=$2 GROUP BY l.institution_key,l.gl_account_id,a.normal_balance
         ON CONFLICT (institution_key,gl_account_id,accounting_date) DO UPDATE SET
           debit_total=gl_account_balances.debit_total+EXCLUDED.debit_total,
           credit_total=gl_account_balances.credit_total+EXCLUDED.credit_total,
           ending_balance=gl_account_balances.ending_balance+EXCLUDED.ending_balance,updated_at=NOW()`,
        [input.operator.institutionKey, input.journalEntryId, current.accounting_date],
      );
      await recordEvent(client, input.operator, input.journalEntryId, "JOURNAL_POSTED", { debitTotal: debit, creditTotal: credit });
      return { status: "POSTED" };
    }
    if (input.action === "VOID") {
      if (current.status !== "DRAFT") throw new Error("GL_ENTRY_NOT_DRAFT");
      await client.query(`UPDATE gl_journal_entries SET status='VOIDED' WHERE institution_key=$1 AND gl_journal_entry_id=$2`, [input.operator.institutionKey, input.journalEntryId]);
      await recordEvent(client, input.operator, input.journalEntryId, "JOURNAL_VOIDED", {});
      return { status: "VOIDED" };
    }
    throw new Error("GL_ACTION_INVALID");
  });
}

async function recordEvent(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  operator: LedgerOperator,
  journalEntryId: string | null,
  eventType: string,
  eventData: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO gl_events (gl_event_id,institution_key,gl_journal_entry_id,event_type,actor_user_id,event_data)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [randomUUID(), operator.institutionKey, journalEntryId, eventType, operator.userId, JSON.stringify(eventData)],
  );
}
