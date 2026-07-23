import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type TreasuryOperator = { institutionKey: string; userId: string };

const paymentTypes = new Set(["INTERNAL_TRANSFER", "WIRE", "ACH", "CASHIERS_CHECK", "ESCROW_DISBURSEMENT", "CONSTRUCTION_DRAW"]);
const directions = new Set(["INBOUND", "OUTBOUND", "INTERNAL"]);
const accountTypes = new Set(["OPERATING", "SETTLEMENT", "ESCROW", "CLEARING", "SUSPENSE", "RESERVE"]);

function paymentNumber() {
  return `PAY-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function listTreasuryWorkspace(operator: TreasuryOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const [accounts, payments, summary] = await Promise.all([
      client.query(
        `SELECT a.treasury_account_id,a.account_number,a.account_name,a.account_type,a.currency_code,
                a.available_balance,a.ledger_balance,a.minimum_balance,a.status,g.account_number AS gl_account_number,g.account_name AS gl_account_name
         FROM treasury_accounts a
         JOIN gl_accounts g ON g.institution_key=a.institution_key AND g.gl_account_id=a.gl_account_id
         WHERE a.institution_key=$1
         ORDER BY a.status,a.account_type,a.account_number`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT p.treasury_payment_id,p.payment_number,p.payment_type,p.direction,p.status,p.amount,p.currency_code,
                p.beneficiary_name,p.beneficiary_reference,p.external_reference,p.requested_execution_date,
                p.authorized_at,p.released_at,p.settled_at,p.returned_at,p.return_reason,p.created_at,
                s.account_number AS source_account_number,s.account_name AS source_account_name,
                d.account_number AS destination_account_number,d.account_name AS destination_account_name
         FROM treasury_payments p
         LEFT JOIN treasury_accounts s ON s.institution_key=p.institution_key AND s.treasury_account_id=p.source_treasury_account_id
         LEFT JOIN treasury_accounts d ON d.institution_key=p.institution_key AND d.treasury_account_id=p.destination_treasury_account_id
         WHERE p.institution_key=$1
           AND ($2='' OR to_tsvector('english',coalesce(p.payment_number,'')||' '||coalesce(p.beneficiary_name,'')||' '||coalesce(p.external_reference,'')||' '||coalesce(p.beneficiary_reference,'')) @@ plainto_tsquery('english',$2))
         ORDER BY CASE p.status WHEN 'PENDING_AUTHORIZATION' THEN 1 WHEN 'AUTHORIZED' THEN 2 WHEN 'RELEASED' THEN 3 WHEN 'DRAFT' THEN 4 ELSE 5 END,p.created_at DESC
         LIMIT 300`,
        [operator.institutionKey, query.trim()],
      ),
      client.query(
        `SELECT
           COALESCE(SUM(available_balance),0)::text AS total_available,
           COALESCE(SUM(ledger_balance),0)::text AS total_ledger,
           COALESCE(SUM(CASE WHEN available_balance < minimum_balance THEN 1 ELSE 0 END),0)::int AS liquidity_alerts
         FROM treasury_accounts WHERE institution_key=$1 AND status='ACTIVE'`,
        [operator.institutionKey],
      ),
    ]);
    return { accounts: accounts.rows, payments: payments.rows, summary: summary.rows[0] };
  });
}

export async function createTreasuryAccount(input: {
  operator: TreasuryOperator;
  accountNumber: string;
  accountName: string;
  accountType: string;
  currencyCode?: string;
  glAccountId: string;
  minimumBalance?: number;
}) {
  if (!input.accountNumber.trim() || !input.accountName.trim() || !input.glAccountId) throw new Error("TREASURY_ACCOUNT_FIELDS_REQUIRED");
  if (!accountTypes.has(input.accountType)) throw new Error("TREASURY_ACCOUNT_TYPE_INVALID");
  const minimumBalance = Number(input.minimumBalance || 0);
  if (!Number.isFinite(minimumBalance) || minimumBalance < 0) throw new Error("TREASURY_MINIMUM_BALANCE_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const gl = await client.query(`SELECT gl_account_id FROM gl_accounts WHERE institution_key=$1 AND gl_account_id=$2 AND status='ACTIVE' LIMIT 1`, [input.operator.institutionKey, input.glAccountId]);
    if (!gl.rows[0]) throw new Error("TREASURY_GL_ACCOUNT_NOT_FOUND");
    const id = randomUUID();
    await client.query(
      `INSERT INTO treasury_accounts (treasury_account_id,institution_key,account_number,account_name,account_type,currency_code,gl_account_id,minimum_balance,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
      [id,input.operator.institutionKey,input.accountNumber.trim(),input.accountName.trim(),input.accountType,(input.currencyCode || "USD").toUpperCase(),input.glAccountId,minimumBalance,input.operator.userId],
    );
    await recordEvent(client,input.operator,null,id,"ACCOUNT_CREATED",null,"ACTIVE",{ accountNumber: input.accountNumber.trim(), accountType: input.accountType });
    return { treasuryAccountId: id, status: "ACTIVE" };
  });
}

export async function createTreasuryPayment(input: {
  operator: TreasuryOperator;
  paymentType: string;
  direction: string;
  amount: number;
  currencyCode?: string;
  sourceTreasuryAccountId?: string;
  destinationTreasuryAccountId?: string;
  beneficiaryName?: string;
  beneficiaryReference?: string;
  externalReference?: string;
  requestedExecutionDate: string;
}) {
  if (!paymentTypes.has(input.paymentType)) throw new Error("TREASURY_PAYMENT_TYPE_INVALID");
  if (!directions.has(input.direction)) throw new Error("TREASURY_DIRECTION_INVALID");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("TREASURY_AMOUNT_INVALID");
  if (!input.sourceTreasuryAccountId && !input.destinationTreasuryAccountId) throw new Error("TREASURY_ACCOUNT_REQUIRED");
  if (!input.requestedExecutionDate) throw new Error("TREASURY_EXECUTION_DATE_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const ids = [input.sourceTreasuryAccountId,input.destinationTreasuryAccountId].filter(Boolean);
    if (ids.length) {
      const found = await client.query(`SELECT treasury_account_id FROM treasury_accounts WHERE institution_key=$1 AND treasury_account_id=ANY($2::uuid[]) AND status='ACTIVE'`, [input.operator.institutionKey,ids]);
      if (found.rowCount !== new Set(ids).size) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");
    }
    if (input.direction === "INTERNAL" && (!input.sourceTreasuryAccountId || !input.destinationTreasuryAccountId || input.sourceTreasuryAccountId === input.destinationTreasuryAccountId)) throw new Error("TREASURY_INTERNAL_ACCOUNTS_INVALID");
    const id = randomUUID();
    const number = paymentNumber();
    await client.query(
      `INSERT INTO treasury_payments (treasury_payment_id,institution_key,payment_number,payment_type,direction,amount,currency_code,source_treasury_account_id,destination_treasury_account_id,beneficiary_name,beneficiary_reference,external_reference,requested_execution_date,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,
      [id,input.operator.institutionKey,number,input.paymentType,input.direction,input.amount,(input.currencyCode || "USD").toUpperCase(),input.sourceTreasuryAccountId || null,input.destinationTreasuryAccountId || null,input.beneficiaryName?.trim() || null,input.beneficiaryReference?.trim() || null,input.externalReference?.trim() || null,input.requestedExecutionDate,input.operator.userId],
    );
    await recordEvent(client,input.operator,id,null,"PAYMENT_CREATED",null,"DRAFT",{ paymentNumber: number, amount: input.amount, paymentType: input.paymentType });
    return { treasuryPaymentId: id, paymentNumber: number, status: "DRAFT" };
  });
}

export async function updateTreasuryPayment(input: { operator: TreasuryOperator; treasuryPaymentId: string; action: string; returnReason?: string }) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const found = await client.query<{ status: string; amount: string; source_treasury_account_id: string | null; destination_treasury_account_id: string | null }>(
      `SELECT status,amount::text,source_treasury_account_id,destination_treasury_account_id FROM treasury_payments WHERE institution_key=$1 AND treasury_payment_id=$2 FOR UPDATE`,
      [input.operator.institutionKey,input.treasuryPaymentId],
    );
    const current = found.rows[0];
    if (!current) throw new Error("TREASURY_PAYMENT_NOT_FOUND");
    const transitions: Record<string,{ from: string[]; to: string }> = {
      SUBMIT: { from: ["DRAFT"], to: "PENDING_AUTHORIZATION" },
      AUTHORIZE: { from: ["PENDING_AUTHORIZATION"], to: "AUTHORIZED" },
      RELEASE: { from: ["AUTHORIZED"], to: "RELEASED" },
      SETTLE: { from: ["RELEASED"], to: "SETTLED" },
      CANCEL: { from: ["DRAFT","PENDING_AUTHORIZATION","AUTHORIZED"], to: "CANCELLED" },
      RETURN: { from: ["RELEASED","SETTLED"], to: "RETURNED" },
    };
    const transition = transitions[input.action];
    if (!transition || !transition.from.includes(current.status)) throw new Error("TREASURY_ACTION_INVALID");
    if (input.action === "RETURN" && !input.returnReason?.trim()) throw new Error("TREASURY_RETURN_REASON_REQUIRED");

    if (input.action === "RELEASE" && current.source_treasury_account_id) {
      const account = await client.query<{ available_balance: string }>(`SELECT available_balance::text FROM treasury_accounts WHERE institution_key=$1 AND treasury_account_id=$2 FOR UPDATE`,[input.operator.institutionKey,current.source_treasury_account_id]);
      if (!account.rows[0] || Number(account.rows[0].available_balance) < Number(current.amount)) throw new Error("TREASURY_INSUFFICIENT_AVAILABLE_BALANCE");
      await client.query(`UPDATE treasury_accounts SET available_balance=available_balance-$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND treasury_account_id=$2`,[input.operator.institutionKey,current.source_treasury_account_id,Number(current.amount),input.operator.userId]);
    }
    if (input.action === "SETTLE") {
      if (current.source_treasury_account_id) await client.query(`UPDATE treasury_accounts SET ledger_balance=ledger_balance-$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND treasury_account_id=$2`,[input.operator.institutionKey,current.source_treasury_account_id,Number(current.amount),input.operator.userId]);
      if (current.destination_treasury_account_id) await client.query(`UPDATE treasury_accounts SET ledger_balance=ledger_balance+$3,available_balance=available_balance+$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND treasury_account_id=$2`,[input.operator.institutionKey,current.destination_treasury_account_id,Number(current.amount),input.operator.userId]);
    }
    if (input.action === "RETURN" && current.source_treasury_account_id) {
      await client.query(`UPDATE treasury_accounts SET ledger_balance=ledger_balance+$3,available_balance=available_balance+$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND treasury_account_id=$2`,[input.operator.institutionKey,current.source_treasury_account_id,Number(current.amount),input.operator.userId]);
      if (current.destination_treasury_account_id && current.status === "SETTLED") await client.query(`UPDATE treasury_accounts SET ledger_balance=ledger_balance-$3,available_balance=GREATEST(available_balance-$3,0),updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND treasury_account_id=$2`,[input.operator.institutionKey,current.destination_treasury_account_id,Number(current.amount),input.operator.userId]);
    }

    await client.query(
      `UPDATE treasury_payments SET status=$3,
         authorized_at=CASE WHEN $3='AUTHORIZED' THEN NOW() ELSE authorized_at END,
         authorized_by=CASE WHEN $3='AUTHORIZED' THEN $4 ELSE authorized_by END,
         released_at=CASE WHEN $3='RELEASED' THEN NOW() ELSE released_at END,
         released_by=CASE WHEN $3='RELEASED' THEN $4 ELSE released_by END,
         settled_at=CASE WHEN $3='SETTLED' THEN NOW() ELSE settled_at END,
         returned_at=CASE WHEN $3='RETURNED' THEN NOW() ELSE returned_at END,
         return_reason=CASE WHEN $3='RETURNED' THEN $5 ELSE return_reason END,
         updated_by=$4,updated_at=NOW()
       WHERE institution_key=$1 AND treasury_payment_id=$2`,
      [input.operator.institutionKey,input.treasuryPaymentId,transition.to,input.operator.userId,input.returnReason?.trim() || null],
    );
    await recordEvent(client,input.operator,input.treasuryPaymentId,null,`PAYMENT_${transition.to}`,current.status,transition.to,{ returnReason: input.returnReason?.trim() || null });
    return { status: transition.to };
  });
}

async function recordEvent(client: { query: (text: string, values?: unknown[]) => Promise<unknown> },operator: TreasuryOperator,paymentId: string | null,accountId: string | null,eventType: string,previousStatus: string | null,resultingStatus: string,eventData: Record<string,unknown>) {
  await client.query(
    `INSERT INTO treasury_events (treasury_event_id,institution_key,treasury_payment_id,treasury_account_id,event_type,actor_user_id,previous_status,resulting_status,event_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [randomUUID(),operator.institutionKey,paymentId,accountId,eventType,operator.userId,previousStatus,resultingStatus,JSON.stringify(eventData)],
  );
}
