// Weekly business report — data assembly (service-role reads) + formatting.

import type { Lead } from "./types.ts";
import { fetchRows, rpcRows } from "./db.ts";
import { buildWeekly, medianMinutes, type SourceStat } from "./digests.ts";

export async function buildWeeklyReport(now = new Date()): Promise<string> {
  const sevenAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const fourteenAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const enc = encodeURIComponent;
  const [thisWeek, lastWeek, bySource, topPlans, topProviders, hot] = await Promise.all([
    fetchRows<Lead>(`/rest/v1/leads?select=status,created_at,contacted_at&created_at=gte.${enc(sevenAgo)}&limit=1000`),
    fetchRows<Lead>(`/rest/v1/leads?select=status,created_at,contacted_at&created_at=gte.${enc(fourteenAgo)}&created_at=lt.${enc(sevenAgo)}&limit=1000`),
    fetchRows<SourceStat>("/rest/v1/leads_by_source?select=*"),
    fetchRows<{ plan_id: string; provider: string; view_count: number }>("/rest/v1/top_plans_30d?select=*&limit=3"),
    fetchRows<{ provider: string; view_count: number }>("/rest/v1/top_providers_30d?select=*&limit=3"),
    rpcRows("get_hot_browsers", {}),
  ]);
  // a failed query (null) must not render as confident zeros
  const anyFailed = [thisWeek, lastWeek, bySource, topPlans, topProviders, hot].some((x) => x === null);
  const report = buildWeekly({
    thisWeek: thisWeek ?? [],
    lastWeek: lastWeek ?? [],
    bySource: bySource ?? [],
    topPlans: topPlans ?? [],
    topProviders: topProviders ?? [],
    hotBrowsers: hot?.length ?? 0,
    medianContactMinutes: medianMinutes((thisWeek ?? []).filter((l) => l.contacted_at)),
  }, now);
  return anyFailed ? `⚠️ <i>חלק מהשאילתות נכשלו — הנתונים חלקיים.</i>\n\n${report}` : report;
}
