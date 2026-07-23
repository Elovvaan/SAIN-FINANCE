import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type LoanPackageOperator = {
  institutionKey: string;
  userId: string;
};

export type CreateLoanPackageInput = {
  operator: LoanPackageOperator;
  primaryCustomerId: string;
  loanType: string;
  purpose?: string;
  requestedAmount: number;
  currencyCode?: string;
  interestRate?: number | null;
  termMonths?: number | null;
  paymentFrequency?: string;
  paymentType?: string;
  amortizationMonths?: number | null;
  balloonPayment?: boolean;
  originationFee?: number;
  closingCosts?: number;
  underwritingNotes?: string;
};

const loanTypes = new Set(["REAL_ESTATE", "VEHICLE", "EQUIPMENT", "BUSINESS", "PERSONAL", "LINE_OF_CREDIT", "OTHER"]);
const paymentFrequencies = new Set(["MONTHLY", "BIWEEKLY", "WEEKLY", "QUARTERLY", "ANNUALLY", "OTHER"]);
const paymentTypes = new Set(["PRINCIPAL_AND_INTEREST", "INTEREST_ONLY", "BALLOON", "REVOLVING", "OTHER"]);

function optionalPositiveInteger(value: number | null | undefined, errorCode: string) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (!Number.isInteger(value) || value <= 0) throw new Error(errorCode);
  return value;
}

function optionalRate(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("LOAN_INTEREST_RATE_INVALID");
  return value;
}

export async function createLoanPackage(input: CreateLoanPackageInput) {
  if (!input.primaryCustomerId) throw new Error("LOAN_CUSTOMER_REQUIRED");
  if (!loanTypes.has(input.loanType)) throw new Error("LOAN_TYPE_INVALID");
  if (!Number.isFinite(input.requestedAmount) || input.requestedAmount <= 0) throw new Error("LOAN_REQUESTED_AMOUNT_INVALID");

  const interestRate = optionalRate(input.interestRate);
  const termMonths = optionalPositiveInteger(input.termMonths, "LOAN_TERM_INVALID");
  const amortizationMonths = optionalPositiveInteger(input.amortizationMonths, "LOAN_AMORTIZATION_INVALID");
  const paymentFrequency = input.paymentFrequency?.trim() || null;
  const paymentType = input.paymentType?.trim() || null;
  if (paymentFrequency && !paymentFrequencies.has(paymentFrequency)) throw new Error("LOAN_PAYMENT_FREQUENCY_INVALID");
  if (paymentType && !paymentTypes.has(paymentType)) throw new Error("LOAN_PAYMENT_TYPE_INVALID");

  const originationFee = Number.isFinite(input.originationFee) ? Number(input.originationFee) : 0;
  const closingCosts = Number.isFinite(input.closingCosts) ? Number(input.closingCosts) : 0;
  if (originationFee < 0 || closingCosts < 0) throw new Error("LOAN_FEES_INVALID");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const customer = await client.query(
      `SELECT customer_id, display_name FROM customer_profiles
       WHERE institution_key = $1 AND customer_id = $2 AND status <> 'ARCHIVED' LIMIT 1`,
      [input.operator.institutionKey, input.primaryCustomerId],
    );
    if (!customer.rows[0]) throw new Error("CUSTOMER_NOT_FOUND");

    const loanPackageId = randomUUID();
    const sequenceResult = await client.query<{ next_number: number }>(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(package_number, '\\D', '', 'g'), '')::bigint), 0) + 1 AS next_number
       FROM loan_packages WHERE institution_key = $1`,
      [input.operator.institutionKey],
    );
    const packageNumber = `LN-${String(Number(sequenceResult.rows[0]?.next_number || 1)).padStart(8, "0")}`;

    await client.query(
      `INSERT INTO loan_packages (
         loan_package_id, institution_key, package_number, primary_customer_id,
         assigned_operator_id, loan_type, purpose, status, requested_amount,
         currency_code, interest_rate, term_months, payment_frequency,
         payment_type, amortization_months, balloon_payment, origination_fee,
         closing_costs, underwriting_notes, created_by, updated_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $5, $5
       )`,
      [
        loanPackageId,
        input.operator.institutionKey,
        packageNumber,
        input.primaryCustomerId,
        input.operator.userId,
        input.loanType,
        input.purpose?.trim() || null,
        input.requestedAmount,
        (input.currencyCode || "USD").toUpperCase(),
        interestRate,
        termMonths,
        paymentFrequency,
        paymentType,
        amortizationMonths,
        Boolean(input.balloonPayment),
        originationFee,
        closingCosts,
        input.underwritingNotes?.trim() || null,
      ],
    );

    await client.query(
      `INSERT INTO loan_package_borrowers (
         loan_package_borrower_id, institution_key, loan_package_id,
         customer_id, borrower_role, created_by
       ) VALUES ($1, $2, $3, $4, 'PRIMARY', $5)`,
      [randomUUID(), input.operator.institutionKey, loanPackageId, input.primaryCustomerId, input.operator.userId],
    );

    await client.query(
      `INSERT INTO loan_package_events (
         loan_package_event_id, institution_key, loan_package_id, event_type,
         actor_user_id, resulting_status, event_data
       ) VALUES ($1, $2, $3, 'CREATED', $4, 'DRAFT', $5::jsonb)`,
      [
        randomUUID(),
        input.operator.institutionKey,
        loanPackageId,
        input.operator.userId,
        JSON.stringify({ packageNumber, primaryCustomerId: input.primaryCustomerId, requestedAmount: input.requestedAmount }),
      ],
    );

    return { loanPackageId, packageNumber, status: "DRAFT" };
  });
}

export async function listLoanPackages(operator: LoanPackageOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const search = query.trim();
    const result = await client.query(
      `SELECT l.loan_package_id, l.package_number, l.primary_customer_id,
              l.loan_type, l.purpose, l.status, l.requested_amount,
              l.approved_amount, l.currency_code, l.interest_rate,
              l.term_months, l.payment_frequency, l.payment_type,
              l.balloon_payment, l.risk_score, l.created_at, l.updated_at,
              p.display_name AS customer_name,
              COALESCE(c.collateral_count, 0)::int AS collateral_count,
              COALESCE(c.total_collateral_value, 0)::numeric AS total_collateral_value,
              CASE WHEN COALESCE(c.total_collateral_value, 0) > 0
                   THEN ROUND((l.requested_amount / c.total_collateral_value) * 100, 2)
                   ELSE NULL END AS requested_ltv
       FROM loan_packages l
       JOIN customer_profiles p
         ON p.institution_key = l.institution_key AND p.customer_id = l.primary_customer_id
       LEFT JOIN (
         SELECT pc.institution_key, pc.loan_package_id, COUNT(*) AS collateral_count,
                SUM(COALESCE(pc.pledged_value, fc.amount)) AS total_collateral_value
         FROM loan_package_collateral pc
         JOIN filing_office_collateral fc
           ON fc.institution_key = pc.institution_key AND fc.collateral_id = pc.collateral_id
         WHERE pc.status = 'ACTIVE'
         GROUP BY pc.institution_key, pc.loan_package_id
       ) c ON c.institution_key = l.institution_key AND c.loan_package_id = l.loan_package_id
       WHERE l.institution_key = $1
         AND ($2 = '' OR to_tsvector('english',
              coalesce(l.package_number, '') || ' ' || coalesce(l.loan_type, '') || ' ' ||
              coalesce(l.purpose, '') || ' ' || coalesce(p.display_name, '')
            ) @@ plainto_tsquery('english', $2))
       ORDER BY l.updated_at DESC
       LIMIT 200`,
      [operator.institutionKey, search],
    );
    return result.rows;
  });
}

export async function listLoanPackageOptions(operator: LoanPackageOperator) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const [customers, collateral, documents] = await Promise.all([
      client.query(
        `SELECT customer_id, display_name, customer_type, status
         FROM customer_profiles WHERE institution_key = $1 AND status <> 'ARCHIVED'
         ORDER BY display_name ASC LIMIT 500`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT collateral_id, customer_id, title, asset_type, amount AS valuation, currency_code, repository_status
         FROM filing_office_collateral
         WHERE institution_key = $1 AND asset_type IS NOT NULL AND repository_status IN ('PENDING','ACTIVE')
         ORDER BY updated_at DESC LIMIT 500`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT document_id, title, document_type, status, current_version
         FROM repository_documents WHERE institution_key = $1 AND status = 'ACTIVE'
         ORDER BY updated_at DESC LIMIT 500`,
        [operator.institutionKey],
      ),
    ]);
    return { customers: customers.rows, collateral: collateral.rows, documents: documents.rows };
  });
}