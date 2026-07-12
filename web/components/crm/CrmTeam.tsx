"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmTeam> — the "צוות והרשאות" (Team & roles) admin surface (C.2). Lists the
// graded CRM members (crm_members) and lets an admin grant / change / revoke a
// role. Every read + write goes through crm-api (service_role, admin-gated): the
// browser NEVER touches crm_members directly. The server is the authority — it
// re-checks admin, validates the role, refuses a self-change, and audits every
// change (security_audit_log). This tab is cosmetic gating; the API enforces.
//
// Roles: viewer (read-only CRM) · rep (operate leads/conversations). "admin" is
// NOT assignable here — it comes from profiles.is_admin and outranks both.
// Revoking (ביטול) is a two-step inline confirm so access removal never happens
// on a single mis-click; the pending confirmation expires after 5 seconds.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { type CrmMember, type CrmRole, fetchMembers, setCrmMemberRole } from "@/lib/crm-admin";
import { BTN_GHOST, BTN_PRIMARY, isUuid, NoticeCard, when } from "./ui";

const ROLE_LABEL: Record<string, string> = { viewer: "צופה", rep: "נציג" };

function RoleBadge({ role }: { role: string }) {
  const isRep = role === "rep";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        isRep ? "bg-accent/10 text-accent-text" : "bg-border/60 text-muted"
      }`}
    >
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-2xl border border-border bg-surface" />
      ))}
    </div>
  );
}

export default function CrmTeam() {
  const [members, setMembers] = useState<CrmMember[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // uid currently being mutated (row-level busy), or "__grant__" for the form.
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // uid whose revoke is awaiting the second, confirming click (two-step ביטול).
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  // Grant-form fields.
  const [newUid, setNewUid] = useState("");
  const [newRole, setNewRole] = useState<CrmRole>("viewer");

  // Fetch the roster. Loading/error resets are event-driven: the useState
  // initializers cover the mount load, and every later load starts from an
  // event (retry / grant / changeRole) via `reload` — so the mount effect never
  // sets state synchronously (react-hooks/set-state-in-effect): state only
  // lands in the .then continuation.
  const load = useCallback(
    () =>
      fetchMembers().then((res) => {
        if (res) setMembers(res.members);
        else setError(true);
        setLoading(false);
      }),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    await load();
  }, [load]);

  const grant = useCallback(async () => {
    const uid = newUid.trim();
    // Client-side UUID validation: a mistyped uid fails fast with a specific
    // message instead of a server round-trip and a generic failure.
    if (!isUuid(uid)) {
      setNotice("מזהה המשתמש אינו UUID תקין (8-4-4-4-12 ספרות הקסדצימליות).");
      return;
    }
    setBusy("__grant__");
    setNotice(null);
    const ok = await setCrmMemberRole(uid, newRole);
    setBusy(null);
    if (ok) {
      setNewUid("");
      setNotice("התפקיד הוענק.");
      await reload();
    } else {
      setNotice("הענקת התפקיד נכשלה — ודאו שה-uid תקין ושאינו שלכם.");
    }
  }, [newUid, newRole, reload]);

  const changeRole = useCallback(
    async (uid: string, role: CrmRole | "none") => {
      setConfirmRevoke(null);
      setBusy(uid);
      setNotice(null);
      const ok = await setCrmMemberRole(uid, role);
      setBusy(null);
      if (ok) await reload();
      else setNotice("עדכון ההרשאה נכשל.");
    },
    [reload],
  );

  // A pending revoke confirmation quietly expires if the admin does nothing.
  useEffect(() => {
    if (!confirmRevoke) return;
    const t = setTimeout(() => setConfirmRevoke(null), 5000);
    return () => clearTimeout(t);
  }, [confirmRevoke]);

  return (
    <div className="space-y-4">
      {/* Security boundary — always shown, before any data. */}
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 text-sm text-foreground">
        <p className="font-semibold text-ink">הרשאות צוות</p>
        <p className="mt-1 text-muted">
          <strong>צופה</strong> — צפייה בלבד (סקירה, לידים, שיחות, פגישות, אנליטיקס).{" "}
          <strong>נציג</strong> — צפייה + טיפול בלידים ושיחות (סטטוס, הערות, שיוך, מענה,
          השתלטות). <strong>מנהל</strong> (is_admin) גובר על שניהם וכולל את הפיד לשיתוף +
          ניהול ההרשאות — ואינו ניתן להענקה כאן. כל שינוי נרשם ביומן, והשרת אוכף את
          ההרשאות בכל פעולה (התצוגה כאן היא נוחות בלבד).
        </p>
      </div>

      {/* Grant a role. */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <p className="mb-3 text-sm font-semibold text-ink">הענקת הרשאה</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted" htmlFor="team-uid">
            מזהה משתמש (uid)
            <input
              id="team-uid"
              type="text"
              value={newUid}
              onChange={(e) => setNewUid(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              dir="ltr"
              className="min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted" htmlFor="team-role">
            תפקיד
            <select
              id="team-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as CrmRole)}
              className="min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            >
              <option value="viewer">צופה</option>
              <option value="rep">נציג</option>
            </select>
          </label>
          <button
            type="button"
            onClick={grant}
            disabled={!newUid.trim() || busy === "__grant__"}
            className={BTN_PRIMARY}
          >
            {busy === "__grant__" ? "מעניק…" : "הענק"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          את ה-uid אפשר למצוא בפרופיל המשתמש (Supabase Auth). אי אפשר להעניק הרשאה לעצמך.
        </p>
      </div>

      {/* Always-mounted live region so grant/role-change outcomes are announced
          to screen readers even when the card pops in after an async write. */}
      <div role="status" aria-live="polite">
        {notice && <NoticeCard>{notice}</NoticeCard>}
      </div>

      {loading ? (
        <Skeleton />
      ) : error || !members ? (
        <NoticeCard
          action={
            <button type="button" onClick={() => void reload()} className={BTN_GHOST}>
              נסו שוב
            </button>
          }
        >
          לא הצלחנו לטעון את חברי הצוות.
        </NoticeCard>
      ) : members.length === 0 ? (
        <NoticeCard>אין עדיין חברי צוות עם תפקיד מדורג. מנהלים (is_admin) לא מוצגים כאן.</NoticeCard>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">חבר/ה</th>
                <th scope="col" className="px-4 py-2 font-medium">תפקיד</th>
                <th scope="col" className="px-4 py-2 font-medium">הוענק</th>
                <th scope="col" className="px-4 py-2 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const rowBusy = busy === m.uid;
                return (
                  <tr key={m.uid} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium text-ink">{m.name || "—"}</div>
                      {m.email && <div className="text-xs text-muted" dir="ltr">{m.email}</div>}
                      <div className="text-[10px] text-muted/70" dir="ltr">{m.uid}</div>
                    </td>
                    <td className="px-4 py-2"><RoleBadge role={m.role} /></td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{when(m.grantedAt) || "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {(["viewer", "rep"] as CrmRole[])
                          .filter((r) => r !== m.role)
                          .map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => void changeRole(m.uid, r)}
                              disabled={rowBusy}
                              className={`${BTN_GHOST} min-h-9 px-2.5 py-1 text-xs`}
                            >
                              → {ROLE_LABEL[r]}
                            </button>
                          ))}
                        {confirmRevoke === m.uid ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void changeRole(m.uid, "none")}
                              disabled={rowBusy}
                              className={`${BTN_GHOST} min-h-9 border-danger/60 bg-danger/10 px-2.5 py-1 text-xs text-danger-text`}
                            >
                              {rowBusy ? "…" : "לאשר ביטול?"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRevoke(null)}
                              disabled={rowBusy}
                              className={`${BTN_GHOST} min-h-9 px-2.5 py-1 text-xs`}
                            >
                              חזרה
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRevoke(m.uid)}
                            disabled={rowBusy}
                            className={`${BTN_GHOST} min-h-9 border-danger/40 px-2.5 py-1 text-xs text-danger-text`}
                          >
                            {rowBusy ? "…" : "ביטול"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
