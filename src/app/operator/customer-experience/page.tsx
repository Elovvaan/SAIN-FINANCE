"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Summary = {
  active_profiles?: number;
  open_requests?: number;
  unread_notifications?: number;
  open_conversations?: number;
  urgent_items?: number;
};

type Profile = {
  portal_profile_id: string;
  portal_role: string;
  display_name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  last_login_at?: string | null;
};

type RequestItem = {
  portal_request_id: string;
  request_type: string;
  title: string;
  status: string;
  priority: string;
  display_name: string;
  portal_role: string;
  created_at: string;
};

type Conversation = {
  portal_conversation_id: string;
  subject: string;
  conversation_type: string;
  status: string;
  message_count: number;
  updated_at: string;
};

type Notification = {
  portal_notification_id: string;
  notification_type: string;
  title: string;
  body: string;
  priority: string;
  status: string;
  display_name: string;
  portal_role: string;
  created_at: string;
};

type Workspace = {
  summary: Summary;
  profiles: Profile[];
  requests: RequestItem[];
  conversations: Conversation[];
  notifications: Notification[];
};

const roles = ["BORROWER","BROKER","REALTOR","BUILDER","ATTORNEY_TITLE","INVESTOR"];
const requestTypes = ["DOCUMENT","DRAW","INSPECTION","PAYMENT","CLOSING","SUBMISSION","SUPPORT","OTHER"];

export default function CustomerExperiencePage() {
  const [workspace, setWorkspace] = useState<Workspace>({ summary: {}, profiles: [], requests: [], conversations: [], notifications: [] });
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    const response = await fetch(`/api/operator/customer-experience?q=${encodeURIComponent(query)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "CUSTOMER_EXPERIENCE_UNAVAILABLE");
    setWorkspace(data as Workspace);
  }

  useEffect(() => { void load().catch((value) => setError(value instanceof Error ? value.message : "CUSTOMER_EXPERIENCE_UNAVAILABLE")); }, []);

  async function submit(entityType: string, form: HTMLFormElement) {
    setBusy(true);
    setError("");
    try {
      const values = Object.fromEntries(new FormData(form).entries());
      const response = await fetch("/api/operator/customer-experience", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityType, ...values }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "CUSTOMER_EXPERIENCE_UNAVAILABLE");
      form.reset();
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "CUSTOMER_EXPERIENCE_UNAVAILABLE");
    } finally {
      setBusy(false);
    }
  }

  async function action(itemType: string, itemId: string, actionName: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/operator/customer-experience", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemType, itemId, action: actionName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "CUSTOMER_EXPERIENCE_UNAVAILABLE");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "CUSTOMER_EXPERIENCE_UNAVAILABLE");
    } finally {
      setBusy(false);
    }
  }

  const profileOptions = useMemo(() => workspace.profiles.map((profile) => ({ value: profile.portal_profile_id, label: `${profile.display_name} · ${profile.portal_role}` })), [workspace.profiles]);
  const cards: Array<[string, number]> = [
    ["Active profiles", Number(workspace.summary.active_profiles || 0)],
    ["Open requests", Number(workspace.summary.open_requests || 0)],
    ["Unread notices", Number(workspace.summary.unread_notifications || 0)],
    ["Open conversations", Number(workspace.summary.open_conversations || 0)],
    ["Urgent items", Number(workspace.summary.urgent_items || 0)],
  ];

  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <header>
        <p style={{ margin: 0, opacity: 0.7 }}>SAIN Finance · Phase 14</p>
        <h1 style={{ marginBottom: 8 }}>Customer Experience Platform</h1>
        <p style={{ margin: 0 }}>Unified borrower, broker, realtor, builder, attorney/title, and investor operations.</p>
      </header>

      {error ? <div role="alert" style={{ padding: 12, border: "1px solid currentColor" }}>{error}</div> : null}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        {cards.map(([label, value]) => <article key={label} style={{ padding: 16, border: "1px solid #d0d0d0", borderRadius: 8 }}><small>{label}</small><h2>{value}</h2></article>)}
      </section>

      <section style={{ display: "flex", gap: 8 }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search profiles" style={{ flex: 1, padding: 10 }} />
        <button disabled={busy} onClick={() => void load().catch((value) => setError(value instanceof Error ? value.message : "CUSTOMER_EXPERIENCE_UNAVAILABLE"))}>Search</button>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void submit("PROFILE", event.currentTarget); }} style={{ display: "grid", gap: 8, padding: 16, border: "1px solid #d0d0d0", borderRadius: 8 }}>
          <h2>Create portal profile</h2>
          <select name="portalRole" defaultValue="BORROWER">{roles.map((role) => <option key={role}>{role}</option>)}</select>
          <input name="displayName" placeholder="Display name" required />
          <input name="email" type="email" placeholder="Email" />
          <input name="phone" placeholder="Phone" />
          <button disabled={busy}>Create profile</button>
        </form>

        <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void submit("REQUEST", event.currentTarget); }} style={{ display: "grid", gap: 8, padding: 16, border: "1px solid #d0d0d0", borderRadius: 8 }}>
          <h2>Create portal request</h2>
          <select name="portalProfileId" required defaultValue=""><option value="" disabled>Select profile</option>{profileOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <select name="requestType" defaultValue="DOCUMENT">{requestTypes.map((type) => <option key={type}>{type}</option>)}</select>
          <input name="title" placeholder="Request title" required />
          <textarea name="description" placeholder="Description" />
          <select name="priority" defaultValue="NORMAL"><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select>
          <button disabled={busy}>Submit request</button>
        </form>

        <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void submit("CONVERSATION", event.currentTarget); }} style={{ display: "grid", gap: 8, padding: 16, border: "1px solid #d0d0d0", borderRadius: 8 }}>
          <h2>Start conversation</h2>
          <input name="subject" placeholder="Subject" required />
          <input name="conversationType" placeholder="Conversation type" defaultValue="GENERAL" />
          <textarea name="openingMessage" placeholder="Opening message" />
          <button disabled={busy}>Create conversation</button>
        </form>

        <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void submit("NOTIFICATION", event.currentTarget); }} style={{ display: "grid", gap: 8, padding: 16, border: "1px solid #d0d0d0", borderRadius: 8 }}>
          <h2>Send notification</h2>
          <select name="portalProfileId" required defaultValue=""><option value="" disabled>Select profile</option>{profileOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <input name="notificationType" placeholder="Notification type" defaultValue="GENERAL" />
          <input name="title" placeholder="Title" required />
          <textarea name="body" placeholder="Message" required />
          <select name="priority" defaultValue="NORMAL"><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select>
          <button disabled={busy}>Send notification</button>
        </form>
      </section>

      <section><h2>Portal profiles</h2><div style={{ display: "grid", gap: 8 }}>{workspace.profiles.map((profile) => <article key={profile.portal_profile_id} style={{ padding: 12, border: "1px solid #d0d0d0", borderRadius: 8 }}><strong>{profile.display_name}</strong> · {profile.portal_role} · {profile.status}<div>{profile.email || "No email"}</div><div style={{ display: "flex", gap: 8, marginTop: 8 }}><button disabled={busy} onClick={() => void action("PROFILE",profile.portal_profile_id,"ACTIVATE")}>Activate</button><button disabled={busy} onClick={() => void action("PROFILE",profile.portal_profile_id,"SUSPEND")}>Suspend</button><button disabled={busy} onClick={() => void action("PROFILE",profile.portal_profile_id,"DISABLE")}>Disable</button></div></article>)}</div></section>

      <section><h2>Requests</h2><div style={{ display: "grid", gap: 8 }}>{workspace.requests.map((item) => <article key={item.portal_request_id} style={{ padding: 12, border: "1px solid #d0d0d0", borderRadius: 8 }}><strong>{item.title}</strong><div>{item.display_name} · {item.portal_role} · {item.request_type} · {item.priority} · {item.status}</div><div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}><button disabled={busy} onClick={() => void action("REQUEST",item.portal_request_id,"REVIEW")}>Review</button><button disabled={busy} onClick={() => void action("REQUEST",item.portal_request_id,"APPROVE")}>Approve</button><button disabled={busy} onClick={() => void action("REQUEST",item.portal_request_id,"REJECT")}>Reject</button><button disabled={busy} onClick={() => void action("REQUEST",item.portal_request_id,"COMPLETE")}>Complete</button></div></article>)}</div></section>

      <section><h2>Conversations</h2><div style={{ display: "grid", gap: 8 }}>{workspace.conversations.map((item) => <article key={item.portal_conversation_id} style={{ padding: 12, border: "1px solid #d0d0d0", borderRadius: 8 }}><strong>{item.subject}</strong><div>{item.conversation_type} · {item.message_count} messages · {item.status}</div><div style={{ display: "flex", gap: 8, marginTop: 8 }}><button disabled={busy} onClick={() => void action("CONVERSATION",item.portal_conversation_id,"OPEN")}>Open</button><button disabled={busy} onClick={() => void action("CONVERSATION",item.portal_conversation_id,"CLOSE")}>Close</button><button disabled={busy} onClick={() => void action("CONVERSATION",item.portal_conversation_id,"ARCHIVE")}>Archive</button></div></article>)}</div></section>

      <section><h2>Notifications</h2><div style={{ display: "grid", gap: 8 }}>{workspace.notifications.map((item) => <article key={item.portal_notification_id} style={{ padding: 12, border: "1px solid #d0d0d0", borderRadius: 8 }}><strong>{item.title}</strong><div>{item.display_name} · {item.portal_role} · {item.priority} · {item.status}</div><p>{item.body}</p><div style={{ display: "flex", gap: 8 }}><button disabled={busy} onClick={() => void action("NOTIFICATION",item.portal_notification_id,"READ")}>Mark read</button><button disabled={busy} onClick={() => void action("NOTIFICATION",item.portal_notification_id,"DISMISS")}>Dismiss</button></div></article>)}</div></section>
    </main>
  );
}
