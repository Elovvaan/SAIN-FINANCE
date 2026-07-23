"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type NotificationRecord = {
  notificationId: string;
  notificationType: string;
  category: string;
  title: string;
  message: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  status: "UNREAD" | "READ" | "ARCHIVED";
  actionUrl?: string;
  createdAt: string;
};

type Props = { workspace: "worker" | "employer" };

export function NotificationCenter({ workspace }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const unread = useMemo(() => items.filter((item) => item.status === "UNREAD").length, [items]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/platform/notifications?limit=50", { cache: "no-store" });
      if (!response.ok) throw new Error("NOTIFICATIONS_UNAVAILABLE");
      const body = await response.json();
      setItems(Array.isArray(body.notifications) ? body.notifications : []);
    } catch {
      setError("Notifications could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function act(path: string, notificationIds?: string[]) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(notificationIds ? { notificationIds } : {}),
    });
    if (!response.ok) throw new Error("NOTIFICATION_ACTION_FAILED");
    await load();
  }

  async function openNotification(item: NotificationRecord) {
    if (item.status === "UNREAD") await act("/api/platform/notifications/read", [item.notificationId]);
    if (item.actionUrl) window.location.assign(item.actionUrl);
  }

  return (
    <div style={{ position: "fixed", right: 24, top: 20, zIndex: 60 }}>
      <button
        type="button"
        aria-label={`${workspace} notifications`}
        onClick={() => { setOpen((value) => !value); if (!open) void load(); }}
        style={{ position: "relative", width: 44, height: 44, borderRadius: 999, border: "1px solid #cbd5e1", background: "white", cursor: "pointer", fontSize: 20, boxShadow: "0 8px 24px rgba(15,23,42,.12)" }}
      >
        🔔
        {unread > 0 && <span style={{ position: "absolute", right: -4, top: -5, minWidth: 20, height: 20, padding: "0 5px", borderRadius: 999, background: "#b91c1c", color: "white", fontSize: 11, lineHeight: "20px", fontWeight: 700 }}>{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <section aria-label="Notification center" style={{ position: "absolute", right: 0, top: 54, width: "min(420px, calc(100vw - 32px))", maxHeight: "72vh", overflow: "hidden", borderRadius: 16, border: "1px solid #dbe3ec", background: "white", boxShadow: "0 24px 60px rgba(15,23,42,.2)" }}>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottom: "1px solid #e2e8f0" }}>
            <div><strong>Notifications</strong><div style={{ fontSize: 12, color: "#64748b" }}>{unread} unread</div></div>
            <button type="button" disabled={!unread} onClick={() => void act("/api/platform/notifications/read-all")} style={{ border: 0, background: "transparent", color: "#1d4ed8", cursor: unread ? "pointer" : "default" }}>Mark all read</button>
          </header>

          <div style={{ maxHeight: "calc(72vh - 72px)", overflowY: "auto" }}>
            {loading && items.length === 0 && <p style={{ padding: 20 }}>Loading…</p>}
            {error && <p style={{ padding: 20, color: "#b91c1c" }}>{error}</p>}
            {!loading && !error && items.length === 0 && <p style={{ padding: 20, color: "#64748b" }}>No notifications yet.</p>}
            {items.map((item) => (
              <article key={item.notificationId} style={{ padding: 16, borderBottom: "1px solid #eef2f7", background: item.status === "UNREAD" ? "#eff6ff" : "white" }}>
                <button type="button" onClick={() => void openNotification(item)} style={{ display: "block", width: "100%", padding: 0, border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><strong>{item.title}</strong><span style={{ fontSize: 11, color: item.priority === "CRITICAL" ? "#b91c1c" : "#64748b" }}>{item.priority}</span></div>
                  <p style={{ margin: "6px 0", color: "#334155", lineHeight: 1.4 }}>{item.message}</p>
                  <small style={{ color: "#64748b" }}>{new Date(item.createdAt).toLocaleString()}</small>
                </button>
                <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                  {item.status === "UNREAD" && <button type="button" onClick={() => void act("/api/platform/notifications/read", [item.notificationId])} style={{ border: 0, background: "transparent", color: "#1d4ed8", padding: 0, cursor: "pointer" }}>Mark read</button>}
                  <button type="button" onClick={() => void act("/api/platform/notifications/archive", [item.notificationId])} style={{ border: 0, background: "transparent", color: "#64748b", padding: 0, cursor: "pointer" }}>Archive</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
