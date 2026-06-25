// Shared types for the Chosech Telegram bot edge functions.

export type Lead = {
  id?: string;
  user_id?: string | null;
  name?: string;
  phone?: string;
  email?: string | null;
  provider?: string | null;
  plan_id?: string | null;
  callback_time?: string | null;
  status?: string;
  source?: string | null;
  notes?: string | null;
  notified_at?: string | null;
  claimed_by?: string | null;
  claimed_by_tg_id?: number | null;
  claimed_at?: string | null;
  contacted_at?: string | null;
  nudged_at?: string | null;
  callback_pinged_at?: string | null;
  actual_saving?: number | null;
  created_at?: string;
};

// public.meetings — Zoom video-consultation bookings; mirrors leads. starts_at
// is the server-computed Israel-time instant for meeting_date + slot.
// (Consent timestamps exist on the table but the bot never reads them.)
export type MeetingRow = {
  id?: string;
  user_id?: string | null;
  name?: string;
  phone?: string;
  email?: string | null;
  provider?: string | null;
  plan_id?: string | null;
  meeting_date?: string;        // YYYY-MM-DD
  slot?: string;                // HH:MM
  starts_at?: string;           // timestamptz
  status?: string;              // pending | confirmed | no_rep | cancelled | expired | completed
  join_url?: string | null;
  zoom_meeting_id?: string | null;
  gcal_event_id?: string | null;
  notes?: string | null;
  source?: string | null;
  notified_at?: string | null;
  claimed_by?: string | null;
  claimed_by_tg_id?: number | null;
  claimed_at?: string | null;
  confirmed_at?: string | null;
  reminded_rep_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type RenewalRow = {
  id: string;
  user_id: string | null;
  provider: string;
  plan_name: string;
  monthly_price: number;
  promo_end_date: string;
  category: string;
  name: string | null;
  phone: string | null;
  email: string | null;
};

export type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };
export type TgChat = { id: number | string; type?: string; title?: string };
export type TgInlineButton = { text: string; callback_data?: string; url?: string };
export type TgInlineKeyboard = { inline_keyboard: TgInlineButton[][] };
export type TgMessage = {
  message_id: number;
  chat?: TgChat;
  from?: TgUser;
  text?: string;
  reply_markup?: TgInlineKeyboard;
  reply_to_message?: TgMessage;
};
export type TgCallbackQuery = { id: string; from?: TgUser; data?: string; message?: TgMessage };
export type TgUpdate = { update_id?: number; message?: TgMessage; callback_query?: TgCallbackQuery };

export type TgResult = { ok: boolean; error?: string; result?: unknown };

export type TriageResult = {
  line: string;   // one-line Hebrew summary ('' when AI is unavailable)
  score: number;  // 1-5 purchase-intent estimate, 0 = unknown
  draft: string;  // suggested WhatsApp opener ('' falls back to a template)
};

export type Cfg = {
  tgToken: string;
  tgChat: string;
  resend: string;
  resendFrom: string;
  notifyEmail: string;
  openai: string;
  anthropic: string;
  gemini: string;
  webhookSecret: string;
  zoomAccountId: string;
  zoomClientId: string;
  zoomClientSecret: string;
  zoomHostEmail: string; // '' = use the token's own user (/users/me)
  googleServiceAccount: string; // base64 of the service-account JSON ('' = off)
  googleCalendarId: string;     // target calendar id ('' = off)
  googleSpreadsheetId: string;  // lead-log spreadsheet id ('' = off)
  sentryDsn?: string;           // Sentry DSN for error/message capture ('' = dark/no-op; optional so existing Cfg literals stay valid)
  allowedUserIds: number[]; // empty = anyone in the team chat may act
  src: Record<string, string>;
};
