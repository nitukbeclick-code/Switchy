// crm-api action: revealContact — the ONE path that returns raw contact PII.
//
// Every list/thread/detail read masks phone + email (crm_logic.ts shapes and the
// inline DTOs go through _shared/pii.ts). This action un-masks exactly ONE record,
// on an explicit operator click, and writes a `crm_pii_reveal` row to the
// security-audit trail per call — actor uid + kind + id, NEVER the revealed value.
// That turns bulk raw-PII exposure from the default into a deliberate, logged act.
//
// kind ∈ lead | contact | conversation | meeting | member
//   lead         → leads.phone + leads.email
//   contact      → whatsapp_contacts.wa_phone
//   conversation → resolve to its contact, then as above
//   meeting      → meetings.phone + meetings.email
//   member       → profiles.email for a CRM member (ADMIN-ONLY — staff identity,
//                  and only an admin manages the roster in the first place)

import { fetchRows } from "../_shared/db.ts";
import { isUuidish, s } from "./crm_logic.ts";
import { err, json, logAudit, q, type Row } from "./helpers.ts";

const KINDS = new Set(["lead", "contact", "conversation", "meeting", "member"]);

export async function actRevealContact(
  b: Row,
  actorUid: string,
  isAdmin: boolean,
): Promise<Response> {
  const kind = s(b.kind).trim();
  const id = s(b.id).trim();
  if (!id || !KINDS.has(kind)) return err("בקשת חשיפה לא תקינה", 400, "bad_request");
  if (!isUuidish(id)) return err("מזהה לא תקין", 400, "bad_request");
  if (kind === "member" && !isAdmin) return err("אין הרשאה לפעולה זו", 403, "forbidden");

  let phone = "";
  let email: string | null = null;

  if (kind === "lead") {
    const rows = await fetchRows<Row>(`/rest/v1/leads?id=eq.${q(id)}&limit=1&select=phone,email`);
    if (rows === null) return err("שגיאה בטעינה", 502, "db_error");
    if (!rows.length) return err("לא נמצא", 404, "not_found");
    phone = s(rows[0].phone);
    email = s(rows[0].email) || null;
  } else if (kind === "meeting") {
    const rows = await fetchRows<Row>(
      `/rest/v1/meetings?id=eq.${q(id)}&limit=1&select=phone,email`,
    );
    if (rows === null) return err("שגיאה בטעינה", 502, "db_error");
    if (!rows.length) return err("לא נמצא", 404, "not_found");
    phone = s(rows[0].phone);
    email = s(rows[0].email) || null;
  } else if (kind === "member") {
    const rows = await fetchRows<Row>(`/rest/v1/profiles?id=eq.${q(id)}&limit=1&select=email`);
    if (rows === null) return err("שגיאה בטעינה", 502, "db_error");
    if (!rows.length) return err("לא נמצא", 404, "not_found");
    email = s(rows[0].email) || null;
  } else {
    // contact | conversation → resolve to a whatsapp_contacts row (phone only).
    let contactId = id;
    if (kind === "conversation") {
      const cr = await fetchRows<Row>(
        `/rest/v1/whatsapp_conversations?id=eq.${q(id)}&limit=1&select=contact_id`,
      );
      if (cr === null) return err("שגיאה בטעינה", 502, "db_error");
      if (!cr.length) return err("לא נמצא", 404, "not_found");
      contactId = s(cr[0].contact_id);
      if (!contactId) return err("אין איש קשר לשיחה", 404, "not_found");
    }
    const rows = await fetchRows<Row>(
      `/rest/v1/whatsapp_contacts?id=eq.${q(contactId)}&limit=1&select=wa_phone`,
    );
    if (rows === null) return err("שגיאה בטעינה", 502, "db_error");
    if (!rows.length) return err("לא נמצא", 404, "not_found");
    phone = s(rows[0].wa_phone);
  }

  // Reg.13: WHO revealed WHICH record. The value itself is deliberately absent.
  await logAudit(actorUid, "crm_pii_reveal", { kind, id });
  return json({ phone: phone || null, email });
}
