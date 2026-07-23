import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type CustomerRepositoryOperator = {
  institutionKey: string;
  userId: string;
};

export type CreateCustomerInput = {
  operator: CustomerRepositoryOperator;
  customerType: "INDIVIDUAL" | "BUSINESS";
  status?: "PROSPECT" | "ACTIVE" | "INACTIVE" | "DECLINED" | "ARCHIVED";
  displayName: string;
  legalName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  businessName?: string;
  email?: string;
  phone?: string;
  taxIdLast4?: string;
  dateOfBirth?: string;
  formationDate?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateRegion?: string;
  postalCode?: string;
  countryCode?: string;
  notes?: string;
};

function optional(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

export async function createCustomer(input: CreateCustomerInput) {
  if (!input.displayName.trim()) throw new Error("CUSTOMER_DISPLAY_NAME_REQUIRED");
  if (!['INDIVIDUAL', 'BUSINESS'].includes(input.customerType)) throw new Error("CUSTOMER_TYPE_INVALID");
  if (input.taxIdLast4 && !/^\d{4}$/.test(input.taxIdLast4.trim())) throw new Error("CUSTOMER_TAX_ID_LAST4_INVALID");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const customerId = randomUUID();
    const status = input.status || "PROSPECT";
    const result = await client.query(
      `INSERT INTO customer_profiles (
         customer_id, institution_key, customer_type, status, display_name,
         legal_name, first_name, middle_name, last_name, business_name,
         email, phone, tax_id_last4, date_of_birth, formation_date,
         address_line1, address_line2, city, state_region, postal_code,
         country_code, notes, created_by, updated_by
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14::date, $15::date,
         $16, $17, $18, $19, $20,
         $21, $22, $23, $23
       ) RETURNING *`,
      [
        customerId,
        input.operator.institutionKey,
        input.customerType,
        status,
        input.displayName.trim(),
        optional(input.legalName),
        optional(input.firstName),
        optional(input.middleName),
        optional(input.lastName),
        optional(input.businessName),
        optional(input.email),
        optional(input.phone),
        optional(input.taxIdLast4),
        optional(input.dateOfBirth),
        optional(input.formationDate),
        optional(input.addressLine1),
        optional(input.addressLine2),
        optional(input.city),
        optional(input.stateRegion),
        optional(input.postalCode),
        optional(input.countryCode) || "US",
        optional(input.notes),
        input.operator.userId,
      ],
    );

    await client.query(
      `INSERT INTO customer_events (
         event_id, institution_key, customer_id, event_type, actor_user_id, event_data
       ) VALUES ($1, $2, $3, 'CUSTOMER_CREATED', $4, $5::jsonb)`,
      [
        randomUUID(),
        input.operator.institutionKey,
        customerId,
        input.operator.userId,
        JSON.stringify({ customerType: input.customerType, status }),
      ],
    );

    return result.rows[0];
  });
}

export async function listCustomers(operator: CustomerRepositoryOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const search = query.trim();
    const result = await client.query(
      `SELECT customer_id, customer_type, status, display_name, legal_name,
              first_name, middle_name, last_name, business_name,
              email, phone, tax_id_last4, date_of_birth, formation_date,
              address_line1, address_line2, city, state_region, postal_code,
              country_code, notes, created_at, updated_at
       FROM customer_profiles
       WHERE institution_key = $1
         AND ($2 = '' OR to_tsvector('english',
              coalesce(display_name, '') || ' ' ||
              coalesce(legal_name, '') || ' ' ||
              coalesce(business_name, '') || ' ' ||
              coalesce(email, '') || ' ' ||
              coalesce(phone, '')
            ) @@ plainto_tsquery('english', $2))
       ORDER BY updated_at DESC
       LIMIT 250`,
      [operator.institutionKey, search],
    );
    return result.rows;
  });
}
