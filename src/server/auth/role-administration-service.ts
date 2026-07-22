import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type RoleAssignmentInput = {
  institutionKey: string;
  targetUserId: string;
  roleCode: string;
  actorUserId: string;
  actorEmail: string;
  sessionId: string;
  effectiveAt?: string;
  expiresAt?: string;
};

export type RoleRevocationInput = {
  institutionKey: string;
  userRoleId: string;
  actorUserId: string;
  actorEmail: string;
  sessionId: string;
  reason: string;
};

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("INVALID_DATE");
  return parsed;
}

async function assertInstitutionAdministrator(
  client: { query: Function },
  institutionKey: string,
  actorUserId: string,
) {
  const result = await client.query(
    `SELECT 1
     FROM user_roles
     JOIN roles ON roles.role_id = user_roles.role_id
     WHERE user_roles.institution_key = $1
       AND user_roles.user_id = $2
       AND user_roles.status = 'ACTIVE'
       AND user_roles.effective_at <= NOW()
       AND (user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())
       AND roles.role_code = 'INSTITUTION_ADMIN'
       AND roles.status = 'ACTIVE'
     LIMIT 1`,
    [institutionKey, actorUserId],
  );
  if (!result.rows.length) throw new Error("ROLE_ADMIN_REQUIRED");
}

export async function assignUserRole(input: RoleAssignmentInput) {
  const effectiveAt = parseDate(input.effectiveAt, new Date());
  const expiresAt = input.expiresAt ? parseDate(input.expiresAt, new Date()) : undefined;
  if (expiresAt && expiresAt <= effectiveAt) throw new Error("INVALID_ROLE_EXPIRY");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    await assertInstitutionAdministrator(client, input.institutionKey, input.actorUserId);

    const userResult = await client.query(
      `SELECT user_id, email, status
       FROM users
       WHERE institution_key = $1 AND user_id = $2
       FOR UPDATE`,
      [input.institutionKey, input.targetUserId],
    );
    const user = userResult.rows[0];
    if (!user) throw new Error("USER_NOT_FOUND");
    if (!['PENDING', 'ACTIVE'].includes(user.status)) throw new Error("USER_NOT_ASSIGNABLE");

    const roleResult = await client.query(
      `SELECT role_id, role_code
       FROM roles
       WHERE role_code = $1
         AND status = 'ACTIVE'
         AND (institution_key IS NULL OR institution_key = $2)
       ORDER BY institution_key NULLS LAST
       LIMIT 1`,
      [input.roleCode, input.institutionKey],
    );
    const role = roleResult.rows[0];
    if (!role) throw new Error("ROLE_NOT_FOUND");

    const duplicate = await client.query(
      `SELECT user_role_id
       FROM user_roles
       WHERE institution_key = $1
         AND user_id = $2
         AND role_id = $3
         AND status IN ('PENDING', 'ACTIVE')
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [input.institutionKey, input.targetUserId, role.role_id],
    );
    if (duplicate.rows.length) throw new Error("ROLE_ALREADY_ASSIGNED");

    const userRoleId = randomUUID();
    await client.query(
      `INSERT INTO user_roles (
         user_role_id, institution_key, user_id, role_id, status,
         effective_at, expires_at, assigned_by
       ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7)`,
      [
        userRoleId,
        input.institutionKey,
        input.targetUserId,
        role.role_id,
        effectiveAt.toISOString(),
        expiresAt?.toISOString() ?? null,
        input.actorUserId,
      ],
    );

    const permissions = await client.query(
      `SELECT permissions.permission_code
       FROM role_permissions
       JOIN permissions ON permissions.permission_id = role_permissions.permission_id
       WHERE role_permissions.role_id = $1 AND permissions.status = 'ACTIVE'`,
      [role.role_id],
    );

    const authorityGrantIds: string[] = [];
    for (const row of permissions.rows) {
      const authorityGrantId = randomUUID();
      authorityGrantIds.push(authorityGrantId);
      await client.query(
        `INSERT INTO authority_grants (
           authority_grant_id, institution_key, actor_id, user_id, scope,
           status, effective_at, expires_at, granted_by, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $8, $9::jsonb)`,
        [
          authorityGrantId,
          input.institutionKey,
          user.email,
          input.targetUserId,
          row.permission_code,
          effectiveAt.toISOString(),
          expiresAt?.toISOString() ?? null,
          input.actorEmail,
          JSON.stringify({ source: 'ROLE_ASSIGNMENT', userRoleId, roleCode: role.role_code }),
        ],
      );
      await client.query(
        `INSERT INTO user_role_authority_grants (user_role_id, authority_grant_id)
         VALUES ($1, $2)`,
        [userRoleId, authorityGrantId],
      );
    }

    await client.query(
      `INSERT INTO role_assignment_events (
         role_assignment_event_id, institution_key, user_role_id, user_id,
         role_id, event_type, actor_user_id, session_id, previous_status,
         resulting_status, effective_at, expires_at, metadata
       ) VALUES ($1, $2, $3, $4, $5, 'ASSIGNED', $6, $7, NULL, 'ACTIVE', $8, $9, $10::jsonb)`,
      [
        randomUUID(),
        input.institutionKey,
        userRoleId,
        input.targetUserId,
        role.role_id,
        input.actorUserId,
        input.sessionId,
        effectiveAt.toISOString(),
        expiresAt?.toISOString() ?? null,
        JSON.stringify({ roleCode: role.role_code, authorityGrantIds }),
      ],
    );

    return {
      userRoleId,
      userId: input.targetUserId,
      roleCode: role.role_code,
      status: 'ACTIVE',
      effectiveAt: effectiveAt.toISOString(),
      expiresAt: expiresAt?.toISOString(),
      authorityGrantIds,
    };
  });
}

export async function revokeUserRole(input: RoleRevocationInput) {
  if (!input.reason.trim()) throw new Error("REVOCATION_REASON_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    await assertInstitutionAdministrator(client, input.institutionKey, input.actorUserId);

    const roleResult = await client.query(
      `SELECT user_roles.user_role_id, user_roles.user_id, user_roles.role_id,
              user_roles.status, roles.role_code
       FROM user_roles
       JOIN roles ON roles.role_id = user_roles.role_id
       WHERE user_roles.institution_key = $1 AND user_roles.user_role_id = $2
       FOR UPDATE`,
      [input.institutionKey, input.userRoleId],
    );
    const assignment = roleResult.rows[0];
    if (!assignment) throw new Error("USER_ROLE_NOT_FOUND");
    if (assignment.status !== 'ACTIVE') throw new Error("USER_ROLE_NOT_ACTIVE");

    await client.query(
      `UPDATE user_roles
       SET status = 'REVOKED', revoked_at = NOW(), revoked_by = $2,
           revoke_reason = $3, updated_at = NOW()
       WHERE user_role_id = $1`,
      [input.userRoleId, input.actorUserId, input.reason.trim()],
    );

    await client.query(
      `UPDATE authority_grants
       SET status = 'REVOKED', revoked_at = NOW(), revoked_by = $2,
           revoke_reason = $3, updated_at = NOW()
       WHERE authority_grant_id IN (
         SELECT authority_grant_id
         FROM user_role_authority_grants
         WHERE user_role_id = $1
       ) AND status = 'ACTIVE'`,
      [input.userRoleId, input.actorEmail, input.reason.trim()],
    );

    await client.query(
      `INSERT INTO role_assignment_events (
         role_assignment_event_id, institution_key, user_role_id, user_id,
         role_id, event_type, actor_user_id, session_id, previous_status,
         resulting_status, reason, metadata
       ) VALUES ($1, $2, $3, $4, $5, 'REVOKED', $6, $7, 'ACTIVE', 'REVOKED', $8, $9::jsonb)`,
      [
        randomUUID(), input.institutionKey, input.userRoleId, assignment.user_id,
        assignment.role_id, input.actorUserId, input.sessionId,
        input.reason.trim(), JSON.stringify({ roleCode: assignment.role_code }),
      ],
    );

    return { userRoleId: input.userRoleId, status: 'REVOKED' };
  });
}
