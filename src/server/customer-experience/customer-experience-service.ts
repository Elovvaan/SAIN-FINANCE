import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type CustomerExperienceOperator = { institutionKey: string; userId: string };

const portalRoles = new Set(["BORROWER","BROKER","REALTOR","BUILDER","ATTORNEY_TITLE","INVESTOR"]);
const requestTypes = new Set(["DOCUMENT","DRAW","INSPECTION","PAYMENT","CLOSING","SUBMISSION","SUPPORT","OTHER"]);

export async function listCustomerExperienceWorkspace(operator: CustomerExperienceOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const [profiles, requests, conversations, notifications, summary] = await Promise.all([
      client.query(
        `SELECT portal_profile_id,portal_role,display_name,email,phone,status,last_login_at,updated_at
         FROM portal_profiles
         WHERE institution_key=$1
           AND ($2='' OR to_tsvector('english',coalesce(display_name,'')||' '||coalesce(email,'')||' '||portal_role) @@ plainto_tsquery('english',$2))
         ORDER BY portal_role,display_name
         LIMIT 300`,
        [operator.institutionKey, query.trim()],
      ),
      client.query(
        `SELECT r.portal_request_id,r.request_type,r.title,r.status,r.priority,r.related_entity_type,r.related_entity_id,r.due_at,r.created_at,
                p.display_name,p.portal_role
         FROM portal_requests r
         JOIN portal_profiles p ON p.institution_key=r.institution_key AND p.portal_profile_id=r.portal_profile_id
         WHERE r.institution_key=$1
         ORDER BY CASE r.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,r.created_at DESC
         LIMIT 300`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT c.portal_conversation_id,c.subject,c.conversation_type,c.related_entity_type,c.related_entity_id,c.status,c.updated_at,
                COUNT(m.portal_message_id)::int AS message_count
         FROM portal_conversations c
         LEFT JOIN portal_messages m ON m.institution_key=c.institution_key AND m.portal_conversation_id=c.portal_conversation_id AND m.deleted_at IS NULL
         WHERE c.institution_key=$1
         GROUP BY c.portal_conversation_id
         ORDER BY c.updated_at DESC
         LIMIT 200`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT n.portal_notification_id,n.notification_type,n.title,n.body,n.priority,n.status,n.created_at,
                p.display_name,p.portal_role
         FROM portal_notifications n
         JOIN portal_profiles p ON p.institution_key=n.institution_key AND p.portal_profile_id=n.portal_profile_id
         WHERE n.institution_key=$1
         ORDER BY n.created_at DESC
         LIMIT 200`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM portal_profiles WHERE institution_key=$1 AND status='ACTIVE') AS active_profiles,
           (SELECT COUNT(*)::int FROM portal_requests WHERE institution_key=$1 AND status IN ('SUBMITTED','IN_REVIEW')) AS open_requests,
           (SELECT COUNT(*)::int FROM portal_notifications WHERE institution_key=$1 AND status='UNREAD') AS unread_notifications,
           (SELECT COUNT(*)::int FROM portal_conversations WHERE institution_key=$1 AND status='OPEN') AS open_conversations,
           (SELECT COUNT(*)::int FROM portal_requests WHERE institution_key=$1 AND priority='URGENT' AND status NOT IN ('COMPLETED','CANCELLED','REJECTED')) AS urgent_items`,
        [operator.institutionKey],
      ),
    ]);

    return {
      profiles: profiles.rows,
      requests: requests.rows,
      conversations: conversations.rows,
      notifications: notifications.rows,
      summary: summary.rows[0],
    };
  });
}

export async function createPortalProfile(input: {
  operator: CustomerExperienceOperator;
  portalRole: string;
  displayName: string;
  email?: string;
  phone?: string;
  partyId?: string;
  userId?: string;
}) {
  if (!portalRoles.has(input.portalRole)) throw new Error("PORTAL_ROLE_INVALID");
  if (!input.displayName.trim()) throw new Error("PORTAL_PROFILE_NAME_REQUIRED");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const portalProfileId = randomUUID();
    await client.query(
      `INSERT INTO portal_profiles
       (portal_profile_id,institution_key,party_id,user_id,portal_role,display_name,email,phone,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
      [portalProfileId,input.operator.institutionKey,input.partyId || null,input.userId || null,input.portalRole,input.displayName.trim(),input.email?.trim() || null,input.phone?.trim() || null,input.operator.userId],
    );
    await recordEvent(client,input.operator,"PORTAL_PROFILE",portalProfileId,"PORTAL_PROFILE_CREATED",{ portalRole: input.portalRole });
    return { portalProfileId, status: "ACTIVE" };
  });
}

export async function createPortalRequest(input: {
  operator: CustomerExperienceOperator;
  portalProfileId: string;
  requestType: string;
  title: string;
  description?: string;
  priority?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  payload?: Record<string, unknown>;
  dueAt?: string;
}) {
  if (!requestTypes.has(input.requestType)) throw new Error("PORTAL_REQUEST_TYPE_INVALID");
  if (!input.portalProfileId || !input.title.trim()) throw new Error("PORTAL_REQUEST_FIELDS_REQUIRED");
  const priority = input.priority || "NORMAL";
  if (!new Set(["LOW","NORMAL","HIGH","URGENT"]).has(priority)) throw new Error("PORTAL_PRIORITY_INVALID");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const profile = await client.query(
      `SELECT portal_profile_id FROM portal_profiles WHERE institution_key=$1 AND portal_profile_id=$2`,
      [input.operator.institutionKey,input.portalProfileId],
    );
    if (!profile.rows[0]) throw new Error("PORTAL_PROFILE_NOT_FOUND");

    const portalRequestId = randomUUID();
    await client.query(
      `INSERT INTO portal_requests
       (portal_request_id,institution_key,portal_profile_id,request_type,related_entity_type,related_entity_id,title,description,payload,priority,due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
      [portalRequestId,input.operator.institutionKey,input.portalProfileId,input.requestType,input.relatedEntityType?.trim() || null,input.relatedEntityId?.trim() || null,input.title.trim(),input.description?.trim() || null,JSON.stringify(input.payload || {}),priority,input.dueAt || null],
    );
    await recordEvent(client,input.operator,"PORTAL_REQUEST",portalRequestId,"PORTAL_REQUEST_SUBMITTED",{ requestType: input.requestType, priority });
    return { portalRequestId, status: "SUBMITTED" };
  });
}

export async function createPortalConversation(input: {
  operator: CustomerExperienceOperator;
  subject: string;
  conversationType?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  portalProfileIds?: string[];
  openingMessage?: string;
}) {
  if (!input.subject.trim()) throw new Error("PORTAL_CONVERSATION_SUBJECT_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const portalConversationId = randomUUID();
    await client.query(
      `INSERT INTO portal_conversations
       (portal_conversation_id,institution_key,subject,conversation_type,related_entity_type,related_entity_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [portalConversationId,input.operator.institutionKey,input.subject.trim(),input.conversationType?.trim() || "GENERAL",input.relatedEntityType?.trim() || null,input.relatedEntityId?.trim() || null,input.operator.userId],
    );
    await client.query(
      `INSERT INTO portal_conversation_participants
       (portal_conversation_id,institution_key,participant_type,participant_id)
       VALUES ($1,$2,'OPERATOR',$3)`,
      [portalConversationId,input.operator.institutionKey,input.operator.userId],
    );
    for (const portalProfileId of input.portalProfileIds || []) {
      await client.query(
        `INSERT INTO portal_conversation_participants
         (portal_conversation_id,institution_key,participant_type,participant_id)
         VALUES ($1,$2,'PORTAL_PROFILE',$3)
         ON CONFLICT DO NOTHING`,
        [portalConversationId,input.operator.institutionKey,portalProfileId],
      );
    }
    if (input.openingMessage?.trim()) {
      await client.query(
        `INSERT INTO portal_messages
         (portal_message_id,institution_key,portal_conversation_id,sender_type,sender_id,body)
         VALUES ($1,$2,$3,'OPERATOR',$4,$5)`,
        [randomUUID(),input.operator.institutionKey,portalConversationId,input.operator.userId,input.openingMessage.trim()],
      );
    }
    await recordEvent(client,input.operator,"PORTAL_CONVERSATION",portalConversationId,"PORTAL_CONVERSATION_CREATED",{});
    return { portalConversationId, status: "OPEN" };
  });
}

export async function createPortalNotification(input: {
  operator: CustomerExperienceOperator;
  portalProfileId: string;
  notificationType: string;
  title: string;
  body: string;
  priority?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!input.portalProfileId || !input.notificationType.trim() || !input.title.trim() || !input.body.trim()) throw new Error("PORTAL_NOTIFICATION_FIELDS_REQUIRED");
  const priority = input.priority || "NORMAL";
  if (!new Set(["LOW","NORMAL","HIGH","URGENT"]).has(priority)) throw new Error("PORTAL_PRIORITY_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const portalNotificationId = randomUUID();
    await client.query(
      `INSERT INTO portal_notifications
       (portal_notification_id,institution_key,portal_profile_id,notification_type,title,body,action_url,priority,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [portalNotificationId,input.operator.institutionKey,input.portalProfileId,input.notificationType.trim().toUpperCase(),input.title.trim(),input.body.trim(),input.actionUrl?.trim() || null,priority,JSON.stringify(input.metadata || {})],
    );
    await recordEvent(client,input.operator,"PORTAL_NOTIFICATION",portalNotificationId,"PORTAL_NOTIFICATION_CREATED",{ portalProfileId: input.portalProfileId });
    return { portalNotificationId, status: "UNREAD" };
  });
}

export async function updateCustomerExperienceItem(input: {
  operator: CustomerExperienceOperator;
  itemType: string;
  itemId: string;
  action: string;
}) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    if (input.itemType === "PROFILE") {
      const statusByAction: Record<string,string> = { ACTIVATE: "ACTIVE", SUSPEND: "SUSPENDED", DISABLE: "DISABLED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("PORTAL_ACTION_INVALID");
      const result = await client.query(
        `UPDATE portal_profiles SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND portal_profile_id=$2 RETURNING portal_profile_id`,
        [input.operator.institutionKey,input.itemId,status,input.operator.userId],
      );
      if (!result.rows[0]) throw new Error("PORTAL_PROFILE_NOT_FOUND");
      await recordEvent(client,input.operator,"PORTAL_PROFILE",input.itemId,`PORTAL_PROFILE_${status}`,{});
      return { status };
    }

    if (input.itemType === "REQUEST") {
      const statusByAction: Record<string,string> = { REVIEW: "IN_REVIEW", APPROVE: "APPROVED", REJECT: "REJECTED", COMPLETE: "COMPLETED", CANCEL: "CANCELLED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("PORTAL_ACTION_INVALID");
      const result = await client.query(
        `UPDATE portal_requests SET status=$3,resolved_at=CASE WHEN $3 IN ('REJECTED','COMPLETED','CANCELLED') THEN NOW() ELSE resolved_at END,updated_at=NOW()
         WHERE institution_key=$1 AND portal_request_id=$2 RETURNING portal_request_id`,
        [input.operator.institutionKey,input.itemId,status],
      );
      if (!result.rows[0]) throw new Error("PORTAL_REQUEST_NOT_FOUND");
      await recordEvent(client,input.operator,"PORTAL_REQUEST",input.itemId,`PORTAL_REQUEST_${status}`,{});
      return { status };
    }

    if (input.itemType === "CONVERSATION") {
      const statusByAction: Record<string,string> = { OPEN: "OPEN", CLOSE: "CLOSED", ARCHIVE: "ARCHIVED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("PORTAL_ACTION_INVALID");
      const result = await client.query(
        `UPDATE portal_conversations SET status=$3,updated_at=NOW() WHERE institution_key=$1 AND portal_conversation_id=$2 RETURNING portal_conversation_id`,
        [input.operator.institutionKey,input.itemId,status],
      );
      if (!result.rows[0]) throw new Error("PORTAL_CONVERSATION_NOT_FOUND");
      await recordEvent(client,input.operator,"PORTAL_CONVERSATION",input.itemId,`PORTAL_CONVERSATION_${status}`,{});
      return { status };
    }

    if (input.itemType === "NOTIFICATION") {
      const statusByAction: Record<string,string> = { READ: "READ", DISMISS: "DISMISSED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("PORTAL_ACTION_INVALID");
      const result = await client.query(
        `UPDATE portal_notifications
         SET status=$3,read_at=CASE WHEN $3='READ' THEN NOW() ELSE read_at END,dismissed_at=CASE WHEN $3='DISMISSED' THEN NOW() ELSE dismissed_at END
         WHERE institution_key=$1 AND portal_notification_id=$2 RETURNING portal_notification_id`,
        [input.operator.institutionKey,input.itemId,status],
      );
      if (!result.rows[0]) throw new Error("PORTAL_NOTIFICATION_NOT_FOUND");
      await recordEvent(client,input.operator,"PORTAL_NOTIFICATION",input.itemId,`PORTAL_NOTIFICATION_${status}`,{});
      return { status };
    }

    throw new Error("PORTAL_ITEM_TYPE_INVALID");
  });
}

async function recordEvent(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  operator: CustomerExperienceOperator,
  entityType: string,
  entityId: string,
  eventType: string,
  eventData: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO portal_events
     (portal_event_id,institution_key,actor_type,actor_id,entity_type,entity_id,event_type,event_data)
     VALUES ($1,$2,'OPERATOR',$3,$4,$5,$6,$7::jsonb)`,
    [randomUUID(),operator.institutionKey,operator.userId,entityType,entityId,eventType,JSON.stringify(eventData)],
  );
}
