// Telegram customer-bot human-handoff copy shared across the two halves of the
// hand-back contract (ai_sessions.bot_enabled + relay_team_chat_id — see
// supabase/telegram-handoff-2026-06.sql). Pure constants, no imports.

// The notice the CUSTOMER gets when a rep ENDS a takeover (hand-back to the
// bot). Two surfaces speak with this one voice and must never drift:
//   • notify-lead/callbacks.ts handleTgHandback — the team side, sending over
//     the USER bot when a rep presses the hand-back button;
//   • telegram-user-webhook/lib.ts — re-exports it alongside the rest of the
//     public bot's customer-facing replies (HANDOFF_ACK_REPLY & co).
// Hebrew, the bot's default audience.
export const HANDOFF_ENDED_REPLY =
  "השיחה עם הנציג הסתיימה ✅ חזרתי לענות אוטומטית — אפשר להמשיך לשאול אותי כל דבר על המסלולים והמחירים.";
