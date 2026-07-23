import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type CollateralRepositoryOperator = {
  institutionKey: string;
  userId: string;
};

export type CreateCollateralInput = {
  operator: CollateralRepositoryOperator;
  customerId: string;
  assetType: string;
  title: string;
  description?: string;
  identifier?: string;
  valuation: number;
  currencyCode?: string;
  ownershipStatus?: string;
  repositoryStatus?: string;
  addressLine1?: string;
  city?: string;
  stateRegion?: string;
  postalCode?: string;
  county?: string;
  details?: Record<string, unknown>;
};

const assetTypes = new Set(["REAL_ESTATE", "VEHICLE", "EQUIPMENT", "SECURITIES", "PRECIOUS_METALS", "INTELLECTUAL_PROPERTY", "OTHER"]);
const ownershipStatuses = new Set(["UNVERIFIED", "OWNED", "LEASED", "JOINTLY_OWNED", "THIRD_PARTY"]);
const repositoryStatuses = new Set(["PENDING", "ACTIVE", "RELEASED", "LIQUIDATED", "ARCHIVED"]);

export async function createCollateral(input: CreateCollateralInput) {
  if (!input.customerId) throw new Error("COLLATERAL_CUSTOMER_REQUIRED");
  if (!assetTypes.has(input.assetType)) throw new Error("COLLATERAL_ASSET_TYPE_INVALID");
  if (!input.title.trim()) throw new Error("COLLATERAL_TITLE_REQUIRED");
  if (!Number.isFinite(input.valuation) || input.valuation <= 0) throw new Error("COLLATERAL_VALUATION_INVALID");

  const ownershipStatus = input.ownershipStatus || "UNVERIFIED";
  const repositoryStatus = input.repositoryStatus || "PENDING";
  if (!ownershipStatuses.has(ownershipStatus)) throw new Error("COLLATERAL_OWNERSHIP_STATUS_INVALID");
  if (!repositoryStatuses.has(repositoryStatus)) throw new Error("COLLATERAL_STATUS_INVALID");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const customer = await client.query(
      `SELECT customer_id FROM customer_profiles WHERE institution_key = $1 AND customer_id = $2 LIMIT 1`,
      [input.operator.institutionKey, input.customerId],
    );
    if (!customer.rows[0]) throw new Error("CUSTOMER_NOT_FOUND");

    const orderResult = await client.query<{ next_order: number }>(
      `SELECT COALESCE(MAX(collateral_order), -1) + 1 AS next_order
       FROM filing_office_collateral
       WHERE institution_key = $1`,
      [input.operator.institutionKey],
    );

    const collateralId = randomUUID();
    const collateralOrder = Number(orderResult.rows[0]?.next_order || 0);
    const description = input.description?.trim() || input.title.trim();
    const details = input.details || {};

    await client.query(
      `INSERT INTO filing_office_collateral (
         institution_key, collateral_id, collateral_order, institution_id,
         description, amount, status, electronic, credit_card_receivable,
         third_party_custodian, created_at, collateral_data, updated_at,
         customer_id, asset_type, title, identifier, currency_code,
         ownership_status, repository_status, address_line1, city,
         state_region, postal_code, county, details, created_by, updated_by
       ) VALUES (
         $1, $2, $3, $1, $4, $5, 'PLEDGED', FALSE, FALSE, FALSE,
         NOW(), $6::jsonb, NOW(), $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19::jsonb, $20, $20
       )`,
      [
        input.operator.institutionKey,
        collateralId,
        collateralOrder,
        description,
        input.valuation,
        JSON.stringify({ source: "operator-collateral-repository", ...details }),
        input.customerId,
        input.assetType,
        input.title.trim(),
        input.identifier?.trim() || null,
        (input.currencyCode || "USD").toUpperCase(),
        ownershipStatus,
        repositoryStatus,
        input.addressLine1?.trim() || null,
        input.city?.trim() || null,
        input.stateRegion?.trim() || null,
        input.postalCode?.trim() || null,
        input.county?.trim() || null,
        JSON.stringify(details),
        input.operator.userId,
      ],
    );

    await client.query(
      `INSERT INTO collateral_events (
         collateral_event_id, institution_key, collateral_id, event_type,
         actor_id, resulting_status, amount, occurred_at, event_data
       ) VALUES ($1, $2, $3, 'CREATED', $4, $5, $6, NOW(), $7::jsonb)`,
      [randomUUID(), input.operator.institutionKey, collateralId, input.operator.userId, repositoryStatus, input.valuation, JSON.stringify({ assetType: input.assetType, customerId: input.customerId })],
    );

    return { collateralId, collateralOrder, repositoryStatus };
  });
}

export async function listCollateral(operator: CollateralRepositoryOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const search = query.trim();
    const result = await client.query(
      `SELECT c.collateral_id, c.customer_id, c.asset_type, c.title, c.description,
              c.identifier, c.amount AS valuation, c.currency_code,
              c.ownership_status, c.repository_status, c.address_line1,
              c.city, c.state_region, c.postal_code, c.county, c.details,
              c.created_at, c.updated_at, p.display_name AS customer_name
       FROM filing_office_collateral c
       LEFT JOIN customer_profiles p
         ON p.institution_key = c.institution_key AND p.customer_id = c.customer_id
       WHERE c.institution_key = $1
         AND c.asset_type IS NOT NULL
         AND ($2 = '' OR to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.description, '') || ' ' || coalesce(c.identifier, '') || ' ' || coalesce(c.county, '') || ' ' || coalesce(p.display_name, '')) @@ plainto_tsquery('english', $2))
       ORDER BY c.updated_at DESC
       LIMIT 200`,
      [operator.institutionKey, search],
    );
    return result.rows;
  });
}

export async function listCollateralCustomers(operator: CollateralRepositoryOperator) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const result = await client.query(
      `SELECT customer_id, display_name, customer_type, status
       FROM customer_profiles
       WHERE institution_key = $1 AND status <> 'ARCHIVED'
       ORDER BY display_name ASC
       LIMIT 500`,
      [operator.institutionKey],
    );
    return result.rows;
  });
}
