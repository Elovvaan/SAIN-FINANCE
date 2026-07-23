import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "@/server/finance/postgres-database";

type NotificationPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

type PublishNotificationInput = {
  institutionKey: string;
  recipientUserId: string;
  actorUserId?: string;
  notificationType: string;
  category: string;
  title: string;
  message: string;
  priority?: NotificationPriority;
  relatedEntityType?: string;
  relatedEntityId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
};

export type NotificationRecord = {
  notificationId: string;
  notificationType: string;
  category: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  status: "UNREAD" | "READ" | "ARCHIVED";
  relatedEntityType?: string;
  relatedEntityId?: string;
  actionUrl?: string;
  readAt?: string;
  archivedAt?: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export class NotificationService {
  static async publish(input: PublishNotificationInput) {
    const database = new PostgresDatabase();
    return database.transaction(async (client) => {
      const notificationId = randomUUID();
      await client.query(
        `INSERT INTO notifications (
           notification_id, institution_key, recipient_user_id, actor_user_id,
           notification_type, category, title, message, priority, status,
           related_entity_type, related_entity_id, action_url, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'UNREAD',$10,$11,$12,$13::jsonb)`,
        [
          notificationId,
          input.institutionKey,
          input.recipientUserId,
          input.actorUserId ?? null,
          input.notificationType,
          input.category,
          input.title,
          input.message,
          input.priority ?? "NORMAL",
          input.relatedEntityType ?? null,
          input.relatedEntityId ?? null,
          input.actionUrl ?? null,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
      await client.query(
        `INSERT INTO notification_delivery_attempts (
           notification_delivery_attempt_id, institution_key, notification_id,
           channel, status, delivered_at, metadata
         ) VALUES ($1,$2,$3,'IN_APP','DELIVERED',NOW(),'{}'::jsonb)`,
        [randomUUID(), input.institutionKey, notificationId],
      );
      await client.query(
        `INSERT INTO notification_events (
           notification_event_id, institution_key, notification_id, user_id,
           event_type, resulting_status, event_data
         ) VALUES ($1,$2,$3,$4,'CREATED','UNREAD','{}'::jsonb)`,
        [randomUUID(), input.institutionKey, notificationId, input.actorUserId ?? input.recipientUserId],
      );
      return notificationId;
    });
  }

  static async list(institutionKey: string, userId: string, limit = 50): Promise<NotificationRecord[]> {
    const database = new PostgresDatabase();
    return database.transaction(async (client) => {
      const result = await client.query<{
        notification_id: string;
        notification_type: string;
        category: string;
        title: string;
        message: string;
        priority: NotificationPriority;
        status: "UNREAD" | "READ" | "ARCHIVED";
        related_entity_type: string | null;
        related_entity_id: string | null;
        action_url: string | null;
        read_at: Date | string | null;
        archived_at: Date | string | null;
        created_at: Date | string;
        metadata: Record<string, unknown>;
      }>(
        `SELECT notification_id, notification_type, category, title, message,
                priority, status, related_entity_type, related_entity_id,
                action_url, read_at, archived_at, created_at, metadata
         FROM notifications
         WHERE institution_key = $1 AND recipient_user_id = $2 AND status <> 'ARCHIVED'
         ORDER BY created_at DESC
         LIMIT $3`,
        [institutionKey, userId, Math.min(Math.max(limit, 1), 100)],
      );
      return result.rows.map((row) => ({
        notificationId: row.notification_id,
        notificationType: row.notification_type,
        category: row.category,
        title: row.title,
        message: row.message,
        priority: row.priority,
        status: row.status,
        relatedEntityType: row.related_entity_type ?? undefined,
        relatedEntityId: row.related_entity_id ?? undefined,
        actionUrl: row.action_url ?? undefined,
        readAt: row.read_at ? new Date(row.read_at).toISOString() : undefined,
        archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : undefined,
        createdAt: new Date(row.created_at).toISOString(),
        metadata: row.metadata ?? {},
      }));
    });
  }

  static async unreadCount(institutionKey: string, userId: string) {
    const database = new PostgresDatabase();
    return database.transaction(async (client) => {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM notifications
         WHERE institution_key = $1 AND recipient_user_id = $2 AND status = 'UNREAD'`,
        [institutionKey, userId],
      );
      return Number(result.rows[0]?.count ?? 0);
    });
  }

  static async markRead(institutionKey: string, userId: string, notificationIds: string[]) {
    if (!notificationIds.length) return 0;
    const database = new PostgresDatabase();
    return database.transaction(async (client) => {
      const result = await client.query<{ notification_id: string }>(
        `UPDATE notifications
         SET status = 'READ', read_at = COALESCE(read_at, NOW())
         WHERE institution_key = $1 AND recipient_user_id = $2
           AND notification_id = ANY($3::uuid[]) AND status = 'UNREAD'
         RETURNING notification_id`,
        [institutionKey, userId, notificationIds],
      );
      for (const row of result.rows) {
        await client.query(
          `INSERT INTO notification_events (
             notification_event_id, institution_key, notification_id, user_id,
             event_type, previous_status, resulting_status, event_data
           ) VALUES ($1,$2,$3,$4,'READ','UNREAD','READ','{}'::jsonb)`,
          [randomUUID(), institutionKey, row.notification_id, userId],
        );
      }
      return result.rowCount;
    });
  }

  static async markAllRead(institutionKey: string, userId: string) {
    const database = new PostgresDatabase();
    return database.transaction(async (client) => {
      const result = await client.query<{ notification_id: string }>(
        `UPDATE notifications SET status = 'READ', read_at = COALESCE(read_at, NOW())
         WHERE institution_key = $1 AND recipient_user_id = $2 AND status = 'UNREAD'
         RETURNING notification_id`,
        [institutionKey, userId],
      );
      for (const row of result.rows) {
        await client.query(
          `INSERT INTO notification_events (
             notification_event_id, institution_key, notification_id, user_id,
             event_type, previous_status, resulting_status, event_data
           ) VALUES ($1,$2,$3,$4,'READ','UNREAD','READ','{}'::jsonb)`,
          [randomUUID(), institutionKey, row.notification_id, userId],
        );
      }
      return result.rowCount;
    });
  }

  static async archive(institutionKey: string, userId: string, notificationIds: string[]) {
    if (!notificationIds.length) return 0;
    const database = new PostgresDatabase();
    return database.transaction(async (client) => {
      const result = await client.query<{ notification_id: string; previous_status: string }>(
        `UPDATE notifications
         SET status = 'ARCHIVED', archived_at = COALESCE(archived_at, NOW())
         WHERE institution_key = $1 AND recipient_user_id = $2
           AND notification_id = ANY($3::uuid[]) AND status <> 'ARCHIVED'
         RETURNING notification_id, CASE WHEN read_at IS NULL THEN 'UNREAD' ELSE 'READ' END AS previous_status`,
        [institutionKey, userId, notificationIds],
      );
      for (const row of result.rows) {
        await client.query(
          `INSERT INTO notification_events (
             notification_event_id, institution_key, notification_id, user_id,
             event_type, previous_status, resulting_status, event_data
           ) VALUES ($1,$2,$3,$4,'ARCHIVED',$5,'ARCHIVED','{}'::jsonb)`,
          [randomUUID(), institutionKey, row.notification_id, userId, row.previous_status],
        );
      }
      return result.rowCount;
    });
  }

  static async updatePreferences(
    institutionKey: string,
    userId: string,
    preferences: Array<{
      category: string;
      inAppEnabled?: boolean;
      emailEnabled?: boolean;
      smsEnabled?: boolean;
      pushEnabled?: boolean;
      webhookEnabled?: boolean;
    }>,
  ) {
    const database = new PostgresDatabase();
    return database.transaction(async (client) => {
      for (const preference of preferences) {
        await client.query(
          `INSERT INTO notification_preferences (
             notification_preference_id, institution_key, user_id, category,
             in_app_enabled, email_enabled, sms_enabled, push_enabled, webhook_enabled
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (institution_key, user_id, category)
           DO UPDATE SET in_app_enabled = EXCLUDED.in_app_enabled,
                         email_enabled = EXCLUDED.email_enabled,
                         sms_enabled = EXCLUDED.sms_enabled,
                         push_enabled = EXCLUDED.push_enabled,
                         webhook_enabled = EXCLUDED.webhook_enabled,
                         updated_at = NOW()`,
          [
            randomUUID(), institutionKey, userId, preference.category,
            preference.inAppEnabled ?? true, preference.emailEnabled ?? false,
            preference.smsEnabled ?? false, preference.pushEnabled ?? false,
            preference.webhookEnabled ?? false,
          ],
        );
      }
      return preferences.length;
    });
  }
}
