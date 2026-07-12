# תוכנית שדרוג — קהילה + CRM (יולי 2026)

> נוצר ע"י צי מיפוי של 9 סוכנים + סינתזה. גלים = שיפור-על-הקיים בלבד, קבצים זרים בין גל לגל.

## מה יש לנו עד כה — מפת מצב (קהילה + CRM)

**1. קהילה — צד לקוח (web/components/community, 14 קומפוננטות):**
- פיד מלא (CommunityFeed): ערוצים, חיפוש debounced, trending, אינסוף-גלילה, Realtime עם באפר "N פוסטים חדשים", AuthModal אחד לכל הפעולות המגודרות; hydration באצווה (5 בקשות לעמוד) דרך ReactionHydrationContext.
- PostCard/PostComposer/Replies/ReactionBar: לייק/סימנייה/ריאקציות אופטימיים, best-answer עם orderByAccepted, מדיה (תמונות/וידאו/הקלטת קול עם cap 5 דק' בקומפוזר), @אזכורים (MentionTextarea), שיתוף WhatsApp+copy.
- פעמון התראות (polling 60ש'), פרופילים ציבוריים + עורך (כולל opt-in לדייג'סט §30A), דשבורד מודרציה (/community/admin) שעובר אך ורק דרך edge fn community-admin עם ConfirmDanger דו-שלבי.
- כל הדאטה דרך web/lib/community.ts (Supabase browser + RLS). פערים עיקריים: חיפוש עוקף block-list, כשל רשת נראה כמו פיד ריק, N+1 בפרופיל ובריאקציות-תגובה, מחיקה בקליק אחד, דיווח בלי סיבה, כמעט אפס בדיקות קומפוננטה.

**2. קהילה — משטחים ציבוריים/SEO:**
- /community (הפיד) noindex בכוונה; /community/post/[id] — הפרמלינק הציבורי היחיד, SSR עם anon key, QAPage JSON-LD אמין, אינדוקס רק לשאלות שנענו; /community/questions — hub של 50 שאלות שנענו; sitemap פולט עד 500 פרמלינקים.
- פערים: 4 שאילתות במקום 2 בפרמלינק, clip() משוכפל, אין BreadcrumbList/ItemList, פוסטים 51–500 יתומים מקישורים פנימיים, reply_count ב-view סופר גם תגובות מסומנות (אי-התאמה מול שער האינדוקס), og:type תמיד website.

**3. קהילה — שכבת נתונים (Supabase):**
- טבלאות community_posts/replies/likes/bookmarks/reactions/blocks/reports/notifications/post_media; view קנוני community_feed (6 הגדרות היסטוריות עם באנרים); RLS select using(true) (תוכן מסומן קריא טכנית מה-API — הסתרה בצד לקוח בלבד); טריגרי DEFINER להתראות + is_notifiable (§30A).
- Edge functions: community-moderate (היוריסטיקה+LLM, fail-open, נבדק היטב — 16 בדיקות), community-notify (אזכורים+טלגרם, 17 בדיקות), community-admin (סמכות מודרציה, 13 בדיקות), community-digest (אימייל שבועי opt-in עם HMAC unsubscribe, 14 בדיקות — אבל שאילתת ה-unread מנפחת URL של עד 2000 UUID).

**4. CRM — קונסולת web (web/components/crm, 13 קומפוננטות):**
- CrmConsole עם 8 טאבים (?tab= ב-URL), גייט is_admin קוסמטי; דשבורד KPI+SLA, טבלת לידים עם bulk דו-שלבי + CSV, מגירת ליד (סטטוס/claim/הערות/won-flow/CallBrief מבוסס §7b/§30A), אינבוקס WhatsApp עם takeover/handback, אנשי קשר, פגישות Zoom, פיד sellable מבוקר-audit, ניהול תפקידים, אנליטיקס.
- הכל דרך web/lib/crm-admin.ts → crm-api (server-authority, הדפדפן לא נוגע בטבלאות לידים). פערים: shape-guards רק ל-3 fetchers, כל כשל קורס ל-null גנרי, פילטרים אובדים בכל מעבר טאב, בדיקות רק ל-ui.tsx.

**5. CRM — crm-api (edge, הסמכות היחידה ל-PII של לידים):**
- 23 actions ב-POST יחיד; requireCrmAccess (admin/viewer/rep, fail-closed) + canDo לכל action; DTO shapers עם allowlist (נבדקים היטב — source_ip/join_url לעולם לא דולפים); audit ל-security_audit_log על כל כתיבה + כל צפייה ב-sellable.
- פערים: 6 מוטציות PATCH לא בודקות row-count (ok:true + audit פנטום על id לא קיים), takeover משתמע ב-sendReply לא נבדק (הבוט יכול להמשיך לענות מעל נציג), lastMessages בלי limit, getThread בלי limit, contacted_at לא נחתם מה-CRM, אפס בדיקות ברמת handler/HTTP.

**6. CRM — מודל נתונים:**
- leads עם טריגרי rate-limit + re-stamp של הסכמות; meetings עם OTP וגארד DST; whatsapp_contacts/conversations/messages (service-role בלבד); crm_events (Realtime לקונסולה); crm_members (viewer/rep); security_audit_log; פיד sellable מגודר consent_share_at. פילטרים שמורים — לא קיימים (state בזיכרון בלבד).

**7. צינור לידים (בוטים → CRM):**
- קליטה: WhatsApp bot (handoff+agent), בוט טלגרם ציבורי, site-ai-chat, LeadForm→/api/lead (service-role), אתר סטטי→anon+RLS. הפצה: notify-lead כרטיס טלגרם + sweep. זרימת סטטוס: כפתורי טלגרם + crm-api, עם lead_events + audit.
- פערים: ה-webhook קורא רק entry[0].changes[0] (batch של Meta נזרק), receipts של Meta לא נקלטים, source קורס ל-'web'/'advisor' (ייחוס ערוצים אובד), פעולות rep מטלגרם לא כותבות crm_events.

**8. כיסוי בדיקות:**
- חזק: edge fns קהילתיים, lead-export, crm_logic/crm_roles הטהורים, ליבות web (csv/batch/date-range/use-focus-trap/community-render/share/seo/schema).
- חור: crm-api handlers וה-gate על החוט, web/lib/crm-admin.ts, web/lib/community.ts (toReplyTree/אגרגציית ריאקציות), וכל 27 קומפוננטות הקהילה+CRM — כמעט ללא בדיקת קומפוננטה אחת.

## גלי הביצוע

### גל 1 — הקשחת crm-api (סמכות השרת ללידים)
**מטרה:** לסגור את פערי האמת בשכבת הסמכות: אין יותר ok:true + audit פנטום על id לא קיים, הבוט לא עונה מעל נציג, כשלי DB לא מוצגים כאפסים, קריאות PII מבוקרות, וכיסוי בדיקות ברמת ה-gate וה-handlers. ללא שינוי סכמה וללא שינוי חוזה כלפי קליינטים (שדות אדיטיביים בלבד).

- patchCount+404 בשש המוטציות העיוורות: setLeadStatus/setLeadNote/recordSaving/claimLead (supabase/functions/crm-api/actions_leads.ts), setContactStatus (supabase/functions/crm-api/actions_conversations.ts), setMeetingStatus (supabase/functions/crm-api/actions_meetings.ts) — שימוש ב-patchCount הקיים ב-supabase/functions/_shared/db.ts; כתיבת lead_events/audit רק כש-count>0
- בדיקת תוצאת ה-PATCH של ה-takeover המשתמע ב-actSendReply + דגל takeoverApplied בתשובה (supabase/functions/crm-api/actions_conversations.ts) — סוגר את המצב שבו הבוט ממשיך לענות מעל נציג
- חיתוך lastMessages עם limit מחושב (supabase/functions/crm-api/helpers.ts) + חתימת contacted_at רק-אם-null כשסטטוס עובר ל-contacted (supabase/functions/crm-api/actions_leads.ts) — פריטי ה-KPI של speed-to-lead מפסיקים לאבד לידים שטופלו מהקונסולה
- כשלים כנים: countRows מחזיר null→502/degraded במקום 0 (supabase/functions/crm-api/helpers.ts, actions_overview.ts); כשל קריאת events→502 ולא טיימליין ריק (actions_leads.ts, actions_meetings.ts); כשל profiles ב-listMembers מדווח (actions_members.ts)
- ולידציית קלט: isUuidish + Math.floor ב-clampLimit + sort לא חוקי→400 + איחוד cap ההערות ל-MAX_NOTE_LEN (supabase/functions/crm-api/crm_logic.ts + כל קבצי ה-actions)
- audit לקריאות עתירות-PII: crm_lead_view/crm_meeting_view/crm_thread_view דרך logAudit הקיים, ids בלבד (actions_leads.ts, actions_meetings.ts, actions_conversations.ts, helpers.ts)
- cap+truncated:true ל-getThread (300 אחרונות) במקום קריאת שיחה שלמה (supabase/functions/crm-api/actions_conversations.ts)
- השלמת שובל האירועים: old_status + שם actor אמיתי במקום 'CRM' + crm_events לשינוי סטטוס איש-קשר (actions_leads.ts, actions_meetings.ts, actions_conversations.ts)
- limit/offset+hasMore לרשימות (listLeads/listContacts/listMeetings/listMembers) במקום 200 קשיח — אדיטיבי, ברירת מחדל ללא שינוי (crm_logic.ts + actions_*)
- צורת שגיאה אחידה {error,code} + תרגום ה-405 לעברית (supabase/functions/crm-api/helpers.ts, index.ts)
- Promise.all לשתי קריאות התפקיד ב-requireCrmAccess (supabase/functions/_shared/admin.ts)
- ספירות contacts/meetings ב-actOverview באותו דפוס countRows מקבילי (supabase/functions/crm-api/actions_overview.ts)
- בדיקות gate על החוט: 401/403 split, viewer→403 על כתיבה בלי שום קריאת DB, 405/400/unknown-action/500 (supabase/functions/tests/crm_api_gate_test.ts חדש); בדיקות גוף handlers: clamp של recordSaving, סטטוס לא חוקי→400 בלי PATCH, re-filter של isSellable + audit ב-sellable, חיפוש שלא מאונטרפל ל-URL (supabase/functions/tests/crm_api_actions_test.ts חדש); הרחבת supabase/functions/tests/crm_api_test.ts ל-countRows/lastMessages/err()

**קבצים (13):** `supabase/functions/crm-api/index.ts` · `supabase/functions/crm-api/helpers.ts` · `supabase/functions/crm-api/crm_logic.ts` · `supabase/functions/crm-api/actions_leads.ts` · `supabase/functions/crm-api/actions_conversations.ts` · `supabase/functions/crm-api/actions_meetings.ts` · `supabase/functions/crm-api/actions_overview.ts` · `supabase/functions/crm-api/actions_members.ts` · `supabase/functions/_shared/db.ts` · `supabase/functions/_shared/admin.ts` · `supabase/functions/tests/crm_api_test.ts` · `supabase/functions/tests/crm_api_gate_test.ts` · `supabase/functions/tests/crm_api_actions_test.ts`
**שערים:** deno test על supabase/functions/tests — כל הקבצים ירוקים כולל שני קבצי הבדיקה החדשים; אין שינוי בשמות/צורת שדות קיימים בתשובות (אדיטיבי בלבד); אין נגיעה במחירים/קליטת לידים/הסכמות

### גל 2 — אמינות צינור הלידים והבוטים
**מטרה:** לעצור אובדן שקט של הודעות/לידים/דייג'סטים ולהפוך כשלי pipeline לנצפים — בלי לשנות שום התנהגות מול לקוח, בלי סכמה, ובלי לגעת בהסכמות.

- עיבוד כל entry/change ב-batch של Meta במקום entry[0].changes[0] בלבד, עם dedup ה-wamid כרשת ביטחון (supabase/functions/whatsapp-webhook/index.ts) + בדיקת payload דו-entry (supabase/functions/tests/whatsapp_webhook_test.ts)
- קליטת value.statuses (delivered/read/failed) לעדכון whatsapp_messages.status לפי wamid, fail-soft פר receipt (supabase/functions/whatsapp-webhook/index.ts + בדיקות)
- דייג'סט קהילה: chunking של שאילתת ה-unread (100-150 uuid לבקשה) במקום URL של 74KB, ו-cursor על מזהי הנמענים מעבר ל-2000 — מתקן under-send שקט מלא (supabase/functions/community-digest/index.ts, supabase/functions/community-digest/lib.ts, supabase/functions/tests/community_digest_test.ts)
- crm_events parity: כתיבת אירועי takeover/handback/relayed-reply גם מהנתיב הטלגרמי כדי שפיד הפעילות בקונסולה יהיה שלם (supabase/functions/telegram-webhook/index.ts, supabase/functions/notify-lead/callbacks.ts, supabase/functions/tests/whatsapp_relay_repside_test.ts)
- מוני כשל pipeline (handoff_lead_insert_failed, voice_transcription_failed ב-24 שעות) ב-?action=health ובקונסולת notify-lead (supabase/functions/notify-lead/index.ts, supabase/functions/notify-lead/console.ts, supabase/functions/tests/notify_lead_test.ts)
- טלמטריה למצב 'backend parked' באתר הסטטי: track('lead_form_error',{reason:'not_configured'}) + console.warn כש-window.CHOSECH_SUPABASE חסר — חוויית המבקר לא משתנה (site/script.js)
- optimistic concurrency ל-ai_state: PATCH מותנה updated_at + ויתור שקט על save שהפסיד מרוץ (supabase/functions/_shared/session.ts, supabase/functions/whatsapp-webhook/agent_runner.ts, supabase/functions/tests/session_test.ts)
- בדיקה אחת עם DB-stub עובד ל-community-moderate שמאמתת את ה-PATCH האמיתי (URL סקופ id מקודד + body של is_flagged/moderation_note) — בדיקה בלבד (supabase/functions/tests/community_moderate_test.ts)
- drift-heal של schema.sql: שיקוף עמודות confirmation_emailed_at/reminded_user_at/email_verified_at ו-policy meetings_select_by_jwt_email מקבצי הדלתא — שינוי קובץ רפו בלבד, אפס DDL חי (supabase/schema.sql, supabase/meetings-user-emails-2026-07.sql, supabase/meeting-email-otp-2026-06.sql)

**קבצים (19):** `supabase/functions/whatsapp-webhook/index.ts` · `supabase/functions/whatsapp-webhook/agent_runner.ts` · `supabase/functions/_shared/session.ts` · `supabase/functions/telegram-webhook/index.ts` · `supabase/functions/notify-lead/index.ts` · `supabase/functions/notify-lead/callbacks.ts` · `supabase/functions/notify-lead/console.ts` · `supabase/functions/community-digest/index.ts` · `supabase/functions/community-digest/lib.ts` · `supabase/functions/tests/whatsapp_webhook_test.ts` · `supabase/functions/tests/whatsapp_relay_repside_test.ts` · `supabase/functions/tests/notify_lead_test.ts` · `supabase/functions/tests/community_digest_test.ts` · `supabase/functions/tests/community_moderate_test.ts` · `supabase/functions/tests/session_test.ts` · `site/script.js` · `supabase/schema.sql` · `supabase/meetings-user-emails-2026-07.sql` · `supabase/meeting-email-otp-2026-06.sql`
**שערים:** deno test מלא ירוק; אף הודעה יוצאת חדשה ללקוחות; שינויי schema.sql הם שיקוף תיעודי בלבד (אין הרצת DDL); site/script.js — שינוי טלמטריה בלבד, זרימת הליד והצגת התודה ללא שינוי

### גל 3 — קהילה: נכונות client, מודרציה ובדיקות
**מטרה:** לתקן את באגי העקביות והכנות בפיד (block-list, כשל≠ריק, N+1), להקשיח מחיקה/דיווח/מודרציה, ולהניח לראשונה בדיקות קומפוננטה על המשטח הקהילתי — בכיבוד מלא של גייטינג ההתחברות וכללי ה-noindex.

- סינון block-list בתוצאות חיפוש — אותו Set שכבר משמש את ה-INSERT handler (web/components/community/CommunityFeed.tsx)
- הבחנת כשל-טעינה מפיד ריק: fetchFeed מחזיר {rows,error} + כרטיס retry; ובאותה נגיעה דחיפת פילטרי flagged/blocked לשאילתת PostgREST כדי שעמודים לא יתקצרו ויסמנו סוף-פיד כוזב, ו-bound ל-fetchMyBookmarkedPosts (web/lib/community.ts, web/components/community/CommunityFeed.tsx)
- ביטול ה-N+1: hydration באצווה ב-ProfileView (Promise.all + ReactionHydrationContext.Provider) ואצווה לריאקציות-תגובה פר-thread (web/components/community/ProfileView.tsx, web/components/community/Replies.tsx, web/components/community/ReactionBar.tsx)
- ConfirmDanger משותף חדש (web/components/community/ConfirmDanger.tsx) למחיקת פוסט/תגובה בשני שלבים + הודעת כשל גלויה במחיקת תגובה (web/components/community/PostCard.tsx, web/components/community/Replies.tsx, web/components/community/AdminModeration.tsx)
- דיווח עם סיבה: preset עברי + טקסט חופשי אל body הקיים של reportContent + חסימת דיווח כפול בסשן (web/components/community/PostCard.tsx, web/lib/community.ts)
- תיקוני נכונות קטנים: שגיאות ב-text-danger-text במקום accent, עדכון reply_count חי דרך onReplyCountChange (web/components/community/Replies.tsx, web/components/community/PostCard.tsx)
- voice-cap parity: hook הקלטה משותף עם טיימר ו-auto-stop של MAX_VOICE_MS גם ל-ReplyComposer (web/components/community/Replies.tsx, web/components/community/PostComposer.tsx)
- פעמון: השהיית polling בטאב מוסתר + refresh-on-focus + markAllNotificationsRead כעדכון אחד is('read_at',null) (web/components/community/NotificationsBell.tsx, web/lib/community.ts)
- מודרציה: קישור 'פתיחת הפוסט' מדוחות, skeleton, כפתור refresh, nonce ל-aria-live; והעשרת התור בצד השרת ב-reportCount/authorBanned בשתי קריאות service-role חסומות (web/components/community/AdminModeration.tsx, supabase/functions/community-admin/index.ts, supabase/functions/tests/community_admin_test.ts)
- קומפוזר: draft autosave ל-sessionStorage (prefill מנצח) + הודעה לא-חוסמת על כשל גלריה חלקי (web/components/community/PostComposer.tsx)
- מדיה: aspect-ratio נגד CLS, onError fallback 'המדיה אינה זמינה', navigator.share תחילה + aria-live ל'הועתק' (web/components/community/MediaGallery.tsx, web/components/community/MediaView.tsx, web/components/community/ShareBar.tsx)
- a11y: aria-controls+פוקוס ב-overflow menu, חצים RTL ב-tablist של הפרופיל, flip ל-listbox של האזכורים (web/components/community/PostCard.tsx, web/components/community/ProfileView.tsx, web/components/community/MentionTextarea.tsx)
- סטטיסטיקות פרופיל כנות ('50+') + pager 'טעינת פוסטים ישנים יותר' בדפוס ה-cursor הקיים (web/components/community/ProfileView.tsx, web/lib/community.ts)
- avatar downscale בדפדפן (canvas→256px) לפני העלאה + שמירת avatar_url:null במקום '' (web/components/community/ProfileEditor.tsx, web/lib/media-upload.ts)
- בדיקות: toReplyTree (קידום יתומים) + אגרגציית fetchReactions (web/lib/__tests__/community-tree.test.ts חדש); פריטת MENTION_RE web↔edge ו-FEED_COLS↔community_feed כקריאת fixtures (web/lib/__tests__/community-contract.test.ts חדש); ReactionBar applyDelta+revert+tri-state hydration, Replies accepted-flow, NotificationsBell relativeTime+trap, AdminModeration armed-confirm, PostCard לייק אופטימיסטי+guest, CommunityFeed batching invariants (web/components/community/__tests__/ReactionBar.test.tsx, Replies.test.tsx, NotificationsBell.test.tsx, AdminModeration.test.tsx, PostCard.test.tsx, CommunityFeed.hydration.test.tsx — כולם חדשים)

**קבצים (27):** `web/lib/community.ts` · `web/lib/community-admin.ts` · `web/lib/media-upload.ts` · `web/components/community/CommunityFeed.tsx` · `web/components/community/PostCard.tsx` · `web/components/community/PostComposer.tsx` · `web/components/community/Replies.tsx` · `web/components/community/ReactionBar.tsx` · `web/components/community/NotificationsBell.tsx` · `web/components/community/AdminModeration.tsx` · `web/components/community/ProfileView.tsx` · `web/components/community/ProfileEditor.tsx` · `web/components/community/MentionTextarea.tsx` · `web/components/community/MediaGallery.tsx` · `web/components/community/MediaView.tsx` · `web/components/community/ShareBar.tsx` · `web/components/community/ConfirmDanger.tsx` · `supabase/functions/community-admin/index.ts` · `supabase/functions/tests/community_admin_test.ts` · `web/lib/__tests__/community-tree.test.ts` · `web/lib/__tests__/community-contract.test.ts` · `web/components/community/__tests__/ReactionBar.test.tsx` · `web/components/community/__tests__/Replies.test.tsx` · `web/components/community/__tests__/NotificationsBell.test.tsx` · `web/components/community/__tests__/AdminModeration.test.tsx` · `web/components/community/__tests__/PostCard.test.tsx` · `web/components/community/__tests__/CommunityFeed.hydration.test.tsx`
**שערים:** cd web && vitest run ירוק (כולל כל קבצי הבדיקה החדשים) + next build; מודרציה ממשיכה לעבור אך ורק דרך community-admin edge fn; אין שינוי RLS/סכמה; הפיד נשאר login-gated ו-noindex; deno test ל-community_admin_test.ts

### גל 4 — קונסולת CRM: חוזה client מוקשח + UX טריאז' + בדיקות
**מטרה:** להפוך כל drift-חוזה לקריסה→הודעה מסודרת, לתת לנציגים כלי טריאז' אמיתיים (SLA, bulk-claim, undo, ניווט, פילטרים שנשמרים), ולפרוט את החוזים העדינים בבדיקות. הכל בצד הדפדפן, דרך crm-api בלבד.

- shape-guards לכל fetcher בדפוס הקיים (repLeaderboard/thread/leadDetail/meetingDetail/sla/רשימות) + helper hasArray (web/lib/crm-admin.ts)
- חשיפת {status,message} מהשרת דרך תוצאה טיפוסית: הודעת השרת בעברית ב-NoticeCard, בלי retry על 401/403 (web/lib/crm-admin.ts, web/components/crm/ui.tsx, CrmDashboard.tsx, CrmLeads.tsx, CrmLeadDrawer.tsx, CrmInbox.tsx)
- תיקון טון כשל בשתי המגירות (text-danger) + טיימליין עם גיל יחסי, StatusPill ל-old→new וגוון פר-סוג אירוע (web/components/crm/CrmLeadDrawer.tsx, CrmMeetingDrawer.tsx, ui.tsx)
- loadSeq race-guards ל-CrmMeetings ול-CrmAnalytics + חיפוש client-side בפגישות (web/components/crm/CrmMeetings.tsx, CrmAnalytics.tsx)
- צ'יפ גיל/SLA-breach על שורות לידים חדשים מ-createdAt+fetchCrmSla הקיימים (web/components/crm/CrmLeads.tsx, ui.tsx)
- bulk 'שייך אליי' דרך claimCrmLead+runChunked + undo חד-פעמי משחזור סטטוסים שנלכדו לפני apply (web/components/crm/CrmLeads.tsx)
- סנכרון back/forward של ?tab= (effect על searchParams) + שיקוף פילטרי הרשימות ל-URL כך שישרדו ריענון ומעבר טאב (web/components/crm/CrmConsole.tsx, CrmLeads.tsx, CrmMeetings.tsx, CrmContacts.tsx, CrmInbox.tsx)
- אינבוקס: StatusPill+intent על שורות הרשימה וה-thread, כפתור 'פרטי הליד' שפותח CrmLeadDrawer מה-thread, takeover עם שם נציג, autoscroll רק כשקרובים לתחתית, חיפוש debounced (web/components/crm/CrmInbox.tsx, CrmLeadDrawer.tsx)
- דשבורד כמשגר בוקר: KPI וכרטיסי שיחות קליקביליים אל ?tab= + רצועת 'פגישות היום' מ-listMeetings הקיים שפותחת את מגירת הפגישה (web/components/crm/CrmDashboard.tsx, CrmConsole.tsx, CrmMeetingDrawer.tsx)
- אנליטיקס: sparklines מ-MetricEventSeries.days שכבר בזיכרון, יחסי המרה בין שלבים, hoist ל-reduce, מיון עמודות בליברבורד (web/components/crm/CrmAnalytics.tsx)
- CSV: עמודת id + סיומת '-partial' כשחלון 200 מלא + ייצוא זהה ל-contacts ול-meetings (web/components/crm/CrmLeads.tsx, CrmContacts.tsx, CrmMeetings.tsx, web/lib/csv.ts) — בלי לגעת ב-CrmSellableLeads
- חבילת a11y: role=status ל-CrmTeam, aria-live ל'הועתק' ב-CrmCallBrief, שנה ב-when() כשהתאריך לא השנה, ולידציית UUID בטופס הגרנט (web/components/crm/CrmTeam.tsx, CrmCallBrief.tsx, ui.tsx, web/components/crm/__tests__/crm-ui.test.tsx)
- prev/next בין לידים במגירה (key={selectedId} remount) + ניווט מקלדת בטבלת הלידים (חצים/Enter/Space/'/') (web/components/crm/CrmLeads.tsx, CrmLeadDrawer.tsx)
- widen של lead-status ל-string בחוט + isLeadStatus/isMeetingStatus narrowing, dedupe promises in-flight לקריאות בלבד (listSellableLeads מוחרג — קריאה מבוקרת), ותיקון הערת האבטחה בכותרת ל-requireCrmAccess (web/lib/crm-admin.ts, CrmLeadDrawer.tsx, CrmLeads.tsx)
- בדיקות: חוזה crmPost (אין סשן→null בלי רשת, non-2xx→null, guards, headers, elision של payload) ב-web/lib/__tests__/crm-admin.test.ts חדש; פריטת אוצר-מילים מול crm_logic.ts ביבוא ישיר ב-web/lib/__tests__/crm-parity.test.ts חדש; CrmLeads bulk דו-שלבי+partial-failure+CSV ב-web/components/crm/__tests__/CrmLeads.test.tsx חדש; CrmLeadDrawer focus-trap+ולידציית won+draft הערה ב-web/components/crm/__tests__/CrmLeadDrawer.test.tsx חדש

**קבצים (19):** `web/lib/crm-admin.ts` · `web/lib/csv.ts` · `web/components/crm/CrmConsole.tsx` · `web/components/crm/CrmDashboard.tsx` · `web/components/crm/CrmLeads.tsx` · `web/components/crm/CrmLeadDrawer.tsx` · `web/components/crm/CrmCallBrief.tsx` · `web/components/crm/CrmInbox.tsx` · `web/components/crm/CrmContacts.tsx` · `web/components/crm/CrmMeetings.tsx` · `web/components/crm/CrmMeetingDrawer.tsx` · `web/components/crm/CrmTeam.tsx` · `web/components/crm/CrmAnalytics.tsx` · `web/components/crm/ui.tsx` · `web/components/crm/__tests__/crm-ui.test.tsx` · `web/components/crm/__tests__/CrmLeads.test.tsx` · `web/components/crm/__tests__/CrmLeadDrawer.test.tsx` · `web/lib/__tests__/crm-admin.test.ts` · `web/lib/__tests__/crm-parity.test.ts`
**שערים:** cd web && vitest run + next build ירוקים; כל הדאטה ממשיכה לזרום אך ורק דרך crm-api/admin-metrics/rep-brief (אפס גישת PostgREST ישירה); גייט ה-is_admin בקונסולה נשאר כמות שהוא (פתיחה ל-viewer/rep = החלטת בעלים); ייצוא sellable לא נגוע

### גל 5 — משטחי הקהילה הציבוריים (SEO/JSON-LD)
**מטרה:** לחזק את אשכול ה-Q&A המאונדקס: פחות שאילתות, structured data מלא, קישוריות פנימית שסוגרת את פער 50-מול-500, ופריטת כללי האינדוקס בבדיקות — בלי לחשוף שום תוכן מגודר ובלי לגעת בכלל answered-only/noindex.

- React cache() ל-fetchPost/fetchReplies בפרמלינק וגזירת 'answered' מהרשימה — 4→2 שאילתות ומטא-דאטה עקבי עם הגוף (web/app/community/post/[id]/page.tsx)
- חילוץ buildQaSchema + החלטת robots-answered ל-web/lib/community-schema.ts חדש, ו-clip/heDate ל-web/lib/community-render.tsx — עם בדיקות שמקבעות acceptedAnswer/suggestedAnswer/answerCount ואת שער האינדוקס (web/lib/__tests__/community-schema.test.ts חדש, web/lib/__tests__/community-render.test.ts)
- BreadcrumbList JSON-LD בפרמלינק דרך breadcrumbSchema הקיים + פריטה ב-web/lib/__tests__/schema.test.ts (web/app/community/post/[id]/page.tsx, web/lib/schema.ts)
- בלוק 'שאלות דומות בקהילה' בפרמלינק — שאילתת anon אחת על community_feed, answered+non-flagged בלבד, עדיפות ל-provider_slug זהה (web/app/community/post/[id]/page.tsx)
- og:type article + article:published_time/modified_time כהרחבה אופציונלית ל-pageMetadata + פריטה (web/lib/seo.ts, web/app/community/post/[id]/page.tsx, web/lib/__tests__/seo.test.ts)
- hub השאלות: צ'יפי סינון ערוץ כקישורים, פאגינציית before-cursor 'לשאלות ישנות יותר', <time> על כל שורה, ו-ItemList JSON-LD רזה — סוגר את יתמות פוסטים 51-500 (web/app/community/questions/page.tsx, web/lib/schema.ts)
- sitemap lastModified = max(created_at, edited_at) (web/app/sitemap.ts)
- threading של תגובות בפרמלינק: הוספת parent_reply_id ל-select ורנדור מוזח עם toReplyTree (יבוא בלבד מ-web/lib/community.ts, ללא שינוי בו); ה-JSON-LD נשאר שטוח (web/app/community/post/[id]/page.tsx)
- עמוד הפרופיל הציבורי עובר ל-pageMetadata לעקביות canonical/OG — נשאר noindex (web/app/community/profile/[id]/page.tsx)

**קבצים (12):** `web/app/community/post/[id]/page.tsx` · `web/app/community/questions/page.tsx` · `web/app/community/profile/[id]/page.tsx` · `web/app/sitemap.ts` · `web/lib/seo.ts` · `web/lib/schema.ts` · `web/lib/community-render.tsx` · `web/lib/community-schema.ts` · `web/lib/__tests__/seo.test.ts` · `web/lib/__tests__/schema.test.ts` · `web/lib/__tests__/community-render.test.ts` · `web/lib/__tests__/community-schema.test.ts`
**שערים:** cd web && vitest run + next build; אינווריאנטים: /community נשאר noindex, פרמלינק מאונדקס רק כשיש תגובה לא-מסומנת (הבדיקה החדשה מקבעת זאת), רק תוכן answered+non-flagged מוצג/מקושר; אין שינוי ב-view או ב-RLS (איחוד reply_count = החלטת בעלים נפרדת)

### גל 6 — Flutter: חסימת קריאת הפיד באפליקציה
**מטרה:** לעצור את ההורדה הבלתי-חסומה של כל community_feed בכל refresh/אירוע Realtime באפליקציה, וליישר את חוזה ה-flagged מול ה-web.

- fetchPosts: הוספת .limit(50), פילטר .or('is_flagged.eq.false,user_id.eq.<uid>') (בעלים עדיין רואה פוסט שלו שבבדיקה), ופרמטר before ל-load-older בדפוס ה-cursor של ה-web (lib/services/backend/supabase_backend.dart)
- עדכון חתימת החוזה ב-backend.dart בהתאם + עדכון הקוראים הקיימים בלי שינוי התנהגות UI (lib/services/backend/backend.dart)

**קבצים (2):** `lib/services/backend/supabase_backend.dart` · `lib/services/backend/backend.dart`
**שערים:** flutter analyze → No issues found; flutter test — כל הבדיקות עוברות (המונה רק עולה); flutter build web --no-pub → ✓ Built build/web; שינוי שאילתה בלבד — אין שינוי RLS/סכמה

## דורש החלטת-בעלים (לא בוצע — ממתין לאישור פרטני)

1. מיון 'פופולריים' אמיתי בצד שרת בפיד הקהילה — משנה את סמנטיקת הדירוג שחברים רואים (חלון זמן? דעיכה?) — החלטת מוצר
2. deep-link מהתראה אל התגובה הספציפית (#reply-id) — נוגע בהתנהגות עמוד הפרמלינק הציבורי היחיד שמאונדקס
3. איחוד שער 'נענתה': reply_count ב-community_feed סופר גם תגובות מסומנות — התיקון הנקי הוא שינוי view ב-DB שמשפיע גם על הספירות בפיד
4. בלוק 'שאלות מהקהילה על הספק' בעמודי /providers/[slug] — שינוי בעמוד רגיש-המרות + תלות Supabase ראנטיים חדשה בו
5. תמונת OG דינמית פר-פוסט — משטח רנדור ציבורי חדש שמקבע UGC בתמונות משותפות (השלכות מודרציה/קאשינג)
6. טריגר DB חדש לניקוי אובייקטי storage של post_media במחיקת פוסט — DDL, וכיום תמונות של פוסטים שנמחקו נשארות ב-bucket הציבורי
7. הקשחת RLS כך שתוכן מסומן (is_flagged) לא ייקרא ישירות מה-API ע"י anon — שינוי policy עם blast radius על Flutter/Realtime
8. ג'וב pg_cron לניקוי community_notifications ישנות שנקראו — DDL חדש של cron
9. מיגרציה קנונית אחת ל-whitelist הרשאות UPDATE על profiles — הרצה חוזרת של קובץ ישן תשבור בשקט את ה-grant של הסכמת הדייג'סט (§30A-adjacent)
10. אינדקס pg_trgm ל-fallback של חיפוש הקהילה — extension + index חדשים
11. דדופ התראות לייק לפי user_id במקום שם תצוגה — דורש עמודת actor_id חדשה בטבלת ההתראות
12. פתיחת קונסולת ה-CRM לתפקידי viewer/rep שהשרת כבר מאשר — מרחיב מי רואה מסכי PII של לידים בדפדפן (+ action 'whoami' חדש)
13. חסימת צ'יפ 'נסגר בהצלחה' במגירת הליד מאחורי זרימת רישום החיסכון — מדיניות איך נרשמים חסכונות שמזינים את הליברבורד
14. הצגת ה-narrative של ה-AI ב-CrmCallBrief — ניסוח AI לצד תסריט הציות המחייב §7b/§30A, צריך אישור על אופן ההצגה והתיוג
15. צ'יפי סינון סטטוס בפיד ה-sellable — כל שינוי במשטח ה-§7b המבוקר דורש חתימת בעלים
16. קאש TTL קצר בזיכרון ל-DTO של לידים בין טאבים — שינוי תנוחת החזקת PII בדפדפן מעבר לחיי קומפוננטה
17. פאגינציה אמיתית + חיפוש שרת ל-listLeads מעבר לחלון 200 — שינוי חוזה ה-API על נתיב הלידים
18. listSellableLeads: דחיית סטטוס לא חוקי ב-400 במקום הרחבה שקטה לכל הסטטוסים — שינוי התנהגות במשטח ההסכמות
19. recordSaving: דחיית סכום מעל התקרה במקום clamp שקט ל-₪100,000 — כלל רישום נתוני חיסכון (וגם האם 100K היא התקרה הנכונה)
20. חתימת claimed_by_tg_id בשיוך ליד מה-CRM — דורש מיפוי uid→Telegram שלא קיים (סכמה או קונבנציה חדשה), אחרת /myleads לא רואה שיוכים מהקונסולה
21. crm_events.kind: הסרת NOT NULL בגארד — בסדר-הרצה מסוים כל פיד הפעילות מת בשקט; לוודא מה רץ בפרוד לפני ALTER
22. אינדקסים חדשים: leads(status,created_at), whatsapp_conversations(status,last_message_at), meetings(status,starts_at) — CREATE INDEX ידני ע"י הבעלים
23. הרחבת policy הקריאה של crm_events גם ל-crm_members — החלטת מודל גישה לזרם ה-Realtime (כיום viewer/rep מקבלים כלום)
24. CHECK constraints ל-leads.status ו-meetings.status — DDL על שתי הטבלאות הרגישות ביותר
25. העברת source האמיתי מ-LeadForm דרך /api/lead במקום 'web' קשיח — משנה מה נכתב בקליטת ליד ומעצב מחדש את funnel המקורות שהעסק מדווח עליו
26. תיוג ערוץ ללידים שנקלטו ע"י סוכנים (site/app/telegram במקום 'advisor' אחיד) — מרחיב את סט ערכי source וכל הצרכנים שלו
27. סמנטיקת takeover לתשובת rep דרך בוט הטלגרם הפנימי — משנה מתי הבוט מדבר מול לקוח (מראה takeover משתמע? רק חותמת? להשאיר?)
