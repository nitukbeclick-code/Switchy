"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmCallBrief> — a grounded, pre-call rep brief for a lead: the parsed need,
// the REAL recommended catalogue plans, talking points, likely objections with
// honest answers, and the mandatory §7b/§30A compliance reminders. Reads the
// existing rep-brief edge function (admin-gated). Everything is grounded — the
// plans/savings are real catalogue figures, never invented; the optional AI
// narrative only rephrases the SAME deterministic brief.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { fetchRepBrief, type RepBriefResult } from "@/lib/crm-admin";
import { BTN_GHOST } from "./ui";

const he = (n: number) => n.toLocaleString("he-IL");

export default function CrmCallBrief({ leadId }: { leadId: string }) {
  const [data, setData] = useState<RepBriefResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const b = await fetchRepBrief(leadId);
    if (b) setData(b);
    else setError(true);
    setLoading(false);
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = useCallback(async () => {
    if (!data?.brief) return;
    try {
      await navigator.clipboard.writeText(data.brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }, [data]);

  if (loading) return <p className="text-xs text-muted">מכין תדריך…</p>;
  if (error || !data) {
    return (
      <div className="text-xs">
        <p className="text-muted">לא הצלחנו להכין תדריך.</p>
        <button type="button" onClick={() => void load()} className={`${BTN_GHOST} mt-2`}>
          נסו שוב
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted">
        {data.need.categoryHe}
        {data.need.budget > 0 ? ` · תקציב ₪${he(data.need.budget)}` : ""}
        {data.need.provider ? ` · ספק נוכחי: ${data.need.provider}` : ""}
        {data.need.abroad ? " · מתעניין בחו״ל" : ""}
      </p>

      {data.plans.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-ink">מסלולים מומלצים</p>
          <ul className="space-y-1">
            {data.plans.map((p, i) => (
              <li key={i} className="text-xs text-foreground">
                {p.provider} · {p.name} — ₪{he(p.price)}
                {p.unitLabel}
                {p.annualSaving > 0 ? <span className="text-value-text"> · חיסכון ₪{he(p.annualSaving)}/שנה</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.talkingPoints.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-ink">נקודות לשיחה</p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-foreground">
            {data.talkingPoints.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {data.objections.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-ink">התנגדויות ותשובות</p>
          <ul className="space-y-1.5">
            {data.objections.map((o, i) => (
              <li key={i} className="text-xs">
                <p className="font-medium text-foreground">”{o.objection}“</p>
                <p className="text-muted">→ {o.answer}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.compliance.length > 0 && (
        <div className="rounded-xl border border-value/40 bg-value/5 p-2">
          <p className="mb-1 text-xs font-semibold text-value-text">חובה לומר (ציות)</p>
          <ul className="space-y-1 text-xs text-foreground">
            {data.compliance.map((c, i) => (
              <li key={i}>
                <span className="font-medium">{c.law}:</span> {c.mustSay}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" onClick={() => void copy()} className={`${BTN_GHOST} w-full`}>
        {copied ? "הועתק ✓" : "העתק תדריך מלא"}
      </button>
    </div>
  );
}
