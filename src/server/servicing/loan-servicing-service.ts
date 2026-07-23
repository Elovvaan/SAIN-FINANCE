import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type ServicingOperator = { institutionKey: string; userId: string };

const paymentTypes = new Set(["REGULAR", "PARTIAL", "EXTRA_PRINCIPAL", "INTEREST_ONLY", "ESCROW_ONLY", "PAYOFF", "REVERSAL", "RETURNED", "CORRECTION"]);

function monthlyPayment(principal: number, annualRate: number, months: number) {
  if (months <= 0) throw new Error("SERVICING_TERM_INVALID");
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return principal / months;
  return principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
}

function addMonths(date: Date, months: number) {
  const value = new Date(date);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

function delinquencyStatus(daysPastDue: number) {
  if (daysPastDue >= 120) return "DEFAULT";
  if (daysPastDue >= 90) return "DPD_90";
  if (daysPastDue >= 60) return "DPD_60";
  if (daysPastDue >= 30) return "DPD_30";
  if (daysPastDue >= 1) return "DPD_1_29";
  return "CURRENT";
}

export async function listServicingLoans(operator: ServicingOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const result = await client.query(
      `SELECT s.servicing_loan_id, s.loan_package_id, s.account_number, s.status,
              s.delinquency_status, s.original_principal, s.principal_balance,
              s.annual_interest_rate, s.payment_frequency, s.term_months,
              s.next_due_date, s.next_payment_amount, s.escrow_balance,
              s.unapplied_balance, s.late_fee_balance, s.days_past_due,
              s.last_payment_at, s.maturity_date, s.updated_at,
              l.package_number, l.loan_type, l.currency_code,
              p.display_name AS customer_name,
              COALESCE(pay.payment_count, 0)::int AS payment_count,
              COALESCE(pay.total_paid, 0)::numeric AS total_paid
       FROM servicing_loans s
       JOIN loan_packages l ON l.institution_key=s.institution_key AND l.loan_package_id=s.loan_package_id
       JOIN customer_profiles p ON p.institution_key=l.institution_key AND p.customer_id=l.primary_customer_id
       LEFT JOIN (
         SELECT institution_key, servicing_loan_id, COUNT(*) FILTER (WHERE status='POSTED') AS payment_count,
                SUM(amount) FILTER (WHERE status='POSTED') AS total_paid
         FROM servicing_payments GROUP BY institution_key, servicing_loan_id
       ) pay ON pay.institution_key=s.institution_key AND pay.servicing_loan_id=s.servicing_loan_id
       WHERE s.institution_key=$1
         AND ($2='' OR to_tsvector('english', coalesce(s.account_number,'') || ' ' || coalesce(l.package_number,'') || ' ' || coalesce(p.display_name,'') || ' ' || coalesce(l.loan_type,'')) @@ plainto_tsquery('english',$2))
       ORDER BY CASE s.delinquency_status WHEN 'DEFAULT' THEN 1 WHEN 'DPD_90' THEN 2 WHEN 'DPD_60' THEN 3 WHEN 'DPD_30' THEN 4 WHEN 'DPD_1_29' THEN 5 ELSE 6 END, s.next_due_date ASC
       LIMIT 500`,
      [operator.institutionKey, query.trim()],
    );
    return result.rows;
  });
}

export async function listEligibleFundedLoans(operator: ServicingOperator) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const result = await client.query(
      `SELECT l.loan_package_id, l.package_number, l.loan_type, l.approved_amount,
              l.currency_code, p.display_name AS customer_name
       FROM loan_packages l
       JOIN customer_profiles p ON p.institution_key=l.institution_key AND p.customer_id=l.primary_customer_id
       LEFT JOIN servicing_loans s ON s.institution_key=l.institution_key AND s.loan_package_id=l.loan_package_id
       WHERE l.institution_key=$1 AND s.servicing_loan_id IS NULL
         AND l.status IN ('APPROVED','FUNDED','CLOSED')
       ORDER BY l.updated_at DESC LIMIT 500`,
      [operator.institutionKey],
    );
    return result.rows;
  });
}

export async function getServicingLoanDetail(operator: ServicingOperator, servicingLoanId: string) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const loan = await client.query(
      `SELECT s.*, l.package_number, l.loan_type, l.currency_code, p.display_name AS customer_name
       FROM servicing_loans s
       JOIN loan_packages l ON l.institution_key=s.institution_key AND l.loan_package_id=s.loan_package_id
       JOIN customer_profiles p ON p.institution_key=l.institution_key AND p.customer_id=l.primary_customer_id
       WHERE s.institution_key=$1 AND s.servicing_loan_id=$2 LIMIT 1`,
      [operator.institutionKey, servicingLoanId],
    );
    if (!loan.rows[0]) throw new Error("SERVICING_LOAN_NOT_FOUND");
    const [schedule, payments, escrow, events] = await Promise.all([
      client.query(`SELECT * FROM servicing_payment_schedule WHERE institution_key=$1 AND servicing_loan_id=$2 ORDER BY installment_number ASC`, [operator.institutionKey, servicingLoanId]),
      client.query(`SELECT * FROM servicing_payments WHERE institution_key=$1 AND servicing_loan_id=$2 ORDER BY effective_date DESC, received_at DESC`, [operator.institutionKey, servicingLoanId]),
      client.query(`SELECT * FROM servicing_escrow_items WHERE institution_key=$1 AND servicing_loan_id=$2 ORDER BY created_at ASC`, [operator.institutionKey, servicingLoanId]),
      client.query(`SELECT * FROM servicing_events WHERE institution_key=$1 AND servicing_loan_id=$2 ORDER BY occurred_at DESC LIMIT 250`, [operator.institutionKey, servicingLoanId]),
    ]);
    return { loan: loan.rows[0], schedule: schedule.rows, payments: payments.rows, escrow: escrow.rows, events: events.rows };
  });
}

export async function boardServicingLoan(input: {
  operator: ServicingOperator;
  loanPackageId: string;
  annualInterestRate: number;
  termMonths: number;
  amortizationMonths?: number;
  originationDate: string;
  firstPaymentDate: string;
}) {
  if (!input.loanPackageId) throw new Error("SERVICING_LOAN_PACKAGE_REQUIRED");
  const annualRate = Number(input.annualInterestRate);
  const termMonths = Number(input.termMonths);
  const amortizationMonths = Number(input.amortizationMonths || input.termMonths);
  if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 1) throw new Error("SERVICING_RATE_INVALID");
  if (!Number.isInteger(termMonths) || termMonths <= 0 || !Number.isInteger(amortizationMonths) || amortizationMonths <= 0) throw new Error("SERVICING_TERM_INVALID");
  const originationDate = new Date(`${input.originationDate}T00:00:00.000Z`);
  const firstPaymentDate = new Date(`${input.firstPaymentDate}T00:00:00.000Z`);
  if (Number.isNaN(originationDate.getTime()) || Number.isNaN(firstPaymentDate.getTime())) throw new Error("SERVICING_DATE_INVALID");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const found = await client.query<{ loan_package_id: string; approved_amount: string | null; requested_amount: string; package_number: string; status: string }>(
      `SELECT loan_package_id, approved_amount::text, requested_amount::text, package_number, status
       FROM loan_packages WHERE institution_key=$1 AND loan_package_id=$2
         AND status IN ('APPROVED','FUNDED','CLOSED') LIMIT 1`,
      [input.operator.institutionKey, input.loanPackageId],
    );
    const loan = found.rows[0];
    if (!loan) throw new Error("SERVICING_ELIGIBLE_LOAN_NOT_FOUND");
    const existing = await client.query(`SELECT servicing_loan_id FROM servicing_loans WHERE institution_key=$1 AND loan_package_id=$2 LIMIT 1`, [input.operator.institutionKey, input.loanPackageId]);
    if (existing.rows[0]) throw new Error("SERVICING_LOAN_EXISTS");

    const principal = Number(loan.approved_amount || loan.requested_amount);
    if (!Number.isFinite(principal) || principal <= 0) throw new Error("SERVICING_PRINCIPAL_INVALID");
    const payment = Number(monthlyPayment(principal, annualRate, amortizationMonths).toFixed(2));
    const servicingLoanId = randomUUID();
    const accountNumber = `SF-${new Date().getUTCFullYear()}-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const maturityDate = addMonths(originationDate, termMonths);
    const firstPayment = firstPaymentDate.toISOString().slice(0, 10);

    await client.query(
      `INSERT INTO servicing_loans (
         servicing_loan_id,institution_key,loan_package_id,account_number,status,delinquency_status,
         original_principal,principal_balance,annual_interest_rate,payment_frequency,term_months,
         amortization_months,origination_date,maturity_date,first_payment_date,next_due_date,
         next_payment_amount,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,'ACTIVE','CURRENT',$5,$5,$6,'MONTHLY',$7,$8,$9,$10,$11,$11,$12,$13,$13)`,
      [servicingLoanId, input.operator.institutionKey, input.loanPackageId, accountNumber, principal, annualRate, termMonths, amortizationMonths, input.originationDate, maturityDate, firstPayment, payment, input.operator.userId],
    );

    let balance = principal;
    for (let installment = 1; installment <= amortizationMonths; installment += 1) {
      const interest = Number((balance * (annualRate / 12)).toFixed(2));
      const principalPart = installment === amortizationMonths ? balance : Number(Math.min(balance, Math.max(0, payment - interest)).toFixed(2));
      const scheduledPayment = Number((principalPart + interest).toFixed(2));
      balance = Number(Math.max(0, balance - principalPart).toFixed(2));
      await client.query(
        `INSERT INTO servicing_payment_schedule (
           schedule_item_id,institution_key,servicing_loan_id,installment_number,due_date,
           scheduled_payment,scheduled_principal,scheduled_interest,remaining_principal
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [randomUUID(), input.operator.institutionKey, servicingLoanId, installment, addMonths(firstPaymentDate, installment - 1), scheduledPayment, principalPart, interest, balance],
      );
    }

    await client.query(`UPDATE loan_packages SET status='SERVICING',updated_by=$3,updated_at=NOW() WHERE institution_key=$1 AND loan_package_id=$2`, [input.operator.institutionKey, input.loanPackageId, input.operator.userId]);
    await recordEvent(client, input.operator, servicingLoanId, input.loanPackageId, "LOAN_BOARDED", { accountNumber, principal, annualRate, termMonths, amortizationMonths, payment });
    return { servicingLoanId, accountNumber, status: "ACTIVE", nextPaymentAmount: payment };
  });
}

export async function updateServicingLoan(input: {
  operator: ServicingOperator;
  servicingLoanId: string;
  action: string;
  paymentType?: string;
  amount?: number;
  effectiveDate?: string;
  externalReference?: string;
  notes?: string;
  escrowType?: string;
  payeeName?: string;
  annualAmount?: number;
}) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const found = await client.query<{ loan_package_id: string; status: string; principal_balance: string; annual_interest_rate: string; next_due_date: string; next_payment_amount: string; escrow_balance: string; late_fee_balance: string; unapplied_balance: string; last_accrual_date: string | null }>(
      `SELECT loan_package_id,status,principal_balance::text,annual_interest_rate::text,next_due_date::text,
              next_payment_amount::text,escrow_balance::text,late_fee_balance::text,unapplied_balance::text,last_accrual_date::text
       FROM servicing_loans WHERE institution_key=$1 AND servicing_loan_id=$2 LIMIT 1`,
      [input.operator.institutionKey, input.servicingLoanId],
    );
    const current = found.rows[0];
    if (!current) throw new Error("SERVICING_LOAN_NOT_FOUND");

    if (input.action === "POST_PAYMENT") {
      const type = input.paymentType || "REGULAR";
      if (!paymentTypes.has(type) || ["REVERSAL", "RETURNED", "CORRECTION"].includes(type)) throw new Error("SERVICING_PAYMENT_TYPE_INVALID");
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("SERVICING_PAYMENT_AMOUNT_INVALID");
      const effectiveDate = input.effectiveDate || new Date().toISOString().slice(0, 10);
      const principalBalance = Number(current.principal_balance);
      const annualRate = Number(current.annual_interest_rate);
      const accrualStart = current.last_accrual_date ? new Date(`${current.last_accrual_date}T00:00:00.000Z`) : new Date(`${effectiveDate}T00:00:00.000Z`);
      const accrualEnd = new Date(`${effectiveDate}T00:00:00.000Z`);
      const accruedInterest = Number((principalBalance * annualRate * daysBetween(accrualStart, accrualEnd) / 365).toFixed(2));
      const lateFee = Math.min(amount, Number(current.late_fee_balance));
      let remaining = Number((amount - lateFee).toFixed(2));
      let interest = type === "EXTRA_PRINCIPAL" || type === "ESCROW_ONLY" ? 0 : Math.min(remaining, accruedInterest);
      remaining = Number((remaining - interest).toFixed(2));
      let escrow = type === "ESCROW_ONLY" ? remaining : 0;
      if (type === "ESCROW_ONLY") remaining = 0;
      const principal = type === "INTEREST_ONLY" ? 0 : Math.min(remaining, principalBalance);
      remaining = Number((remaining - principal).toFixed(2));
      const unapplied = Math.max(0, remaining);
      const newBalance = Number(Math.max(0, principalBalance - principal).toFixed(2));
      const paymentId = randomUUID();

      await client.query(
        `INSERT INTO servicing_payments (
           servicing_payment_id,institution_key,servicing_loan_id,payment_type,status,amount,
           principal_amount,interest_amount,escrow_amount,late_fee_amount,unapplied_amount,
           effective_date,external_reference,notes,posted_by
         ) VALUES ($1,$2,$3,$4,'POSTED',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [paymentId, input.operator.institutionKey, input.servicingLoanId, type, amount, principal, interest, escrow, lateFee, unapplied, effectiveDate, input.externalReference?.trim() || null, input.notes?.trim() || null, input.operator.userId],
      );

      const paidOff = newBalance === 0;
      await client.query(
        `UPDATE servicing_loans SET principal_balance=$3,escrow_balance=escrow_balance+$4,
           late_fee_balance=GREATEST(0,late_fee_balance-$5),unapplied_balance=unapplied_balance+$6,
           last_payment_at=NOW(),last_accrual_date=$7,status=CASE WHEN $8 THEN 'PAID_OFF' ELSE status END,
           paid_off_at=CASE WHEN $8 THEN NOW() ELSE paid_off_at END,
           next_due_date=CASE WHEN $8 THEN next_due_date ELSE (next_due_date + INTERVAL '1 month')::date END,
           updated_by=$9,updated_at=NOW()
         WHERE institution_key=$1 AND servicing_loan_id=$2`,
        [input.operator.institutionKey, input.servicingLoanId, newBalance, escrow, lateFee, unapplied, effectiveDate, paidOff, input.operator.userId],
      );
      await client.query(
        `UPDATE servicing_payment_schedule SET status='PAID',paid_at=NOW()
         WHERE institution_key=$1 AND servicing_loan_id=$2 AND status IN ('SCHEDULED','PARTIALLY_PAID')
           AND installment_number=(SELECT MIN(installment_number) FROM servicing_payment_schedule WHERE institution_key=$1 AND servicing_loan_id=$2 AND status IN ('SCHEDULED','PARTIALLY_PAID'))`,
        [input.operator.institutionKey, input.servicingLoanId],
      );
      if (paidOff) await client.query(`UPDATE loan_packages SET status='PAID_OFF',updated_by=$3,updated_at=NOW() WHERE institution_key=$1 AND loan_package_id=$2`, [input.operator.institutionKey, current.loan_package_id, input.operator.userId]);
      await recordEvent(client, input.operator, input.servicingLoanId, current.loan_package_id, "PAYMENT_POSTED", { paymentId, type, amount, principal, interest, escrow, lateFee, unapplied, newBalance });
      return { paymentId, status: paidOff ? "PAID_OFF" : current.status, principalBalance: newBalance };
    }

    if (input.action === "ADD_ESCROW_ITEM") {
      const allowedTypes = new Set(["PROPERTY_TAX", "HOMEOWNERS_INSURANCE", "FLOOD_INSURANCE", "PMI", "HOA", "OTHER"]);
      const type = input.escrowType || "OTHER";
      if (!allowedTypes.has(type)) throw new Error("SERVICING_ESCROW_TYPE_INVALID");
      const annualAmount = Number(input.annualAmount);
      if (!Number.isFinite(annualAmount) || annualAmount < 0) throw new Error("SERVICING_ESCROW_AMOUNT_INVALID");
      const escrowItemId = randomUUID();
      await client.query(
        `INSERT INTO servicing_escrow_items (escrow_item_id,institution_key,servicing_loan_id,escrow_type,payee_name,annual_amount,monthly_amount,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [escrowItemId, input.operator.institutionKey, input.servicingLoanId, type, input.payeeName?.trim() || null, annualAmount, Number((annualAmount / 12).toFixed(2)), input.operator.userId],
      );
      await recordEvent(client, input.operator, input.servicingLoanId, current.loan_package_id, "ESCROW_ITEM_ADDED", { escrowItemId, type, annualAmount });
      return { escrowItemId };
    }

    if (input.action === "REFRESH_DELINQUENCY") {
      const today = new Date();
      const dueDate = new Date(`${current.next_due_date}T00:00:00.000Z`);
      const daysPastDue = today > dueDate ? daysBetween(dueDate, today) : 0;
      const status = delinquencyStatus(daysPastDue);
      await client.query(`UPDATE servicing_loans SET days_past_due=$3,delinquency_status=$4,status=CASE WHEN $4='DEFAULT' THEN 'DEFAULT' ELSE status END,updated_by=$5,updated_at=NOW() WHERE institution_key=$1 AND servicing_loan_id=$2`, [input.operator.institutionKey, input.servicingLoanId, daysPastDue, status, input.operator.userId]);
      await recordEvent(client, input.operator, input.servicingLoanId, current.loan_package_id, "DELINQUENCY_REFRESHED", { daysPastDue, delinquencyStatus: status });
      return { daysPastDue, delinquencyStatus: status };
    }

    throw new Error("SERVICING_ACTION_INVALID");
  });
}

async function recordEvent(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  operator: ServicingOperator,
  servicingLoanId: string,
  loanPackageId: string,
  eventType: string,
  eventData: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO servicing_events (servicing_event_id,institution_key,servicing_loan_id,loan_package_id,event_type,actor_user_id,event_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [randomUUID(), operator.institutionKey, servicingLoanId, loanPackageId, eventType, operator.userId, JSON.stringify(eventData)],
  );
}