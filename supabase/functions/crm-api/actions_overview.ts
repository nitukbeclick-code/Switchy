// crm-api actions: the dashboard — pipeline overview + speed-to-lead metrics.

import { fetchRows } from "../_shared/db.ts";
// Speed-to-lead metrics reuse the SAME shared sources as the Telegram digest/nudge
// so the CRM never drifts from the team's push alerts: the first-response median
// (medianMinutes) and the response-SLA window (SLA_HOURS). Both are pure/side-
// effect-free (lead-digest/lib.ts is explicitly safe to import in isolation).
import { medianMinutes } from "../_shared/digests.ts";
import { SLA_HOURS } from "../lead-digest/lib.ts";
import { contactName, s, snippet } from "./crm_logic.ts";
import { contactsById, countRows, json, lastMessages, q, type Row } from "./helpers.ts";

// overview {} → pipeline counts (over leads) + up to 12 recent conversations.
export async function actOverview(): Promise<Response> {
  const statuses = ["new", "contacted", "won", "lost"] as const;
  const pipeline: Record<string, number> = { new: 0, contacted: 0, won: 0, lost: 0 };
  // Count leads per status — one head request each (cheap, exact via
  // Content-Range), fanned out in parallel so it's a single round-trip wall-time.
  const counts = await Promise.all(
    statuses.map((st) => countRows(`/rest/v1/leads?status=eq.${q(st)}&select=id`)),
  );
  statuses.forEach((st, i) => (pipeline[st] = counts[i]));

  const convs = await fetchRows<Row>(
    `/rest/v1/whatsapp_conversations?order=last_message_at.desc.nullslast,created_at.desc&limit=12&select=id,contact_id,status,last_message_at`,
  );
  if (convs === null) return json({ error: "שגיאה בטעינת הנתונים" }, 502);

  const convIds = convs.map((c) => s(c.id)).filter(Boolean);
  const contactIds = convs.map((c) => s(c.contact_id)).filter(Boolean);
  const [snips, contacts] = await Promise.all([
    lastMessages(convIds),
    contactsById(contactIds),
  ]);

  const recent = convs.map((c) => {
    const cid = s(c.id);
    const contact = contacts.get(s(c.contact_id)) ?? {};
    const last = snips.get(cid);
    return {
      conversationId: cid,
      contactId: s(c.contact_id),
      name: contactName(contact),
      phone: s(contact.wa_phone),
      status: s(c.status),
      lastSnippet: snippet(last?.body),
      lastAt: last?.at || s(c.last_message_at) || null,
    };
  });

  return json({ pipeline, recent });
}

// slaMetrics {} → speed-to-lead health for the dashboard. Three real figures:
//   • medianResponseMinutes — median (created_at → contacted_at) over the last 200
//     contacted leads (median, not mean, so one very late reply can't skew it —
//     matches the weekly report's medianContactMinutes).
//   • uncontacted — leads still `new` with no contacted_at (awaiting first touch).
//   • breaching — those uncontacted MORE than SLA_HOURS (the single most actionable
//     number; identical threshold to the Telegram stale-lead nudge).
// Nothing is fabricated: no contacted leads → median null; empty queue → 0.
export async function actSlaMetrics(): Promise<Response> {
  const nowMs = Date.now();
  const slaCutoff = q(new Date(nowMs - SLA_HOURS * 3_600_000).toISOString());
  const [uncontacted, breaching, oldestRows, contactedRows] = await Promise.all([
    countRows(`/rest/v1/leads?status=eq.new&contacted_at=is.null&select=id`),
    countRows(`/rest/v1/leads?status=eq.new&contacted_at=is.null&created_at=lt.${slaCutoff}&select=id`),
    fetchRows<Row>(`/rest/v1/leads?status=eq.new&contacted_at=is.null&order=created_at.asc&limit=1&select=created_at`),
    fetchRows<Row>(`/rest/v1/leads?contacted_at=not.is.null&order=contacted_at.desc&limit=200&select=created_at,contacted_at`),
  ]);
  const oldestUncontactedAt = oldestRows && oldestRows.length ? (s(oldestRows[0].created_at) || null) : null;
  const medianResponseMinutes = contactedRows
    ? medianMinutes(contactedRows.map((r) => ({ created_at: s(r.created_at), contacted_at: s(r.contacted_at) })))
    : null;
  return json({
    sla: {
      slaHours: SLA_HOURS,
      uncontacted,
      breaching,
      oldestUncontactedAt,
      medianResponseMinutes,
      responseSampleSize: contactedRows?.length ?? 0,
    },
  });
}
