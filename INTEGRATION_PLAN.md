# Telegram Bot + Zoom Integration Plan

## Overview

**Goal:** Send Telegram notifications for:
1. Zoom meeting confirmations (when rep accepts)
2. Renewal reminders
3. Better deal alerts
4. Meeting 15-min warnings

---

## Phase 1: Telegram Bot Setup (TODAY)

### 1.1 Create Telegram Bot
1. Open Telegram → search for `@BotFather`
2. Send `/newbot`
3. Choose name: **ChosechBot** (or similar)
4. Choose username: **chosech_bot** (or **chosech_helper_bot**)
5. Copy the **API Token** → save to `.env`

Example token: `123456:ABCdefGHIjklMNOpqrsTUVwxyz`

### 1.2 Get Chat ID (for testing)
1. Send any message to your bot in Telegram
2. Call: `https://api.telegram.org/bot[TOKEN]/getUpdates`
3. Find `"chat":{"id":XXXXX}` → save this ID

---

## Phase 2: Backend Telegram Service

### 2.1 Create `lib/services/telegram_service.dart`

```dart
// Sends messages via Telegram Bot API
class TelegramService {
  static const _apiBase = 'https://api.telegram.org/bot';
  
  /// Send message to a user's Telegram chat
  static Future<bool> sendMessage({
    required String chatId,
    required String message,
    bool parseHtml = true,
  }) async {
    // Implementation with error handling
  }
  
  /// Send meeting confirmation
  static Future<void> sendMeetingConfirmed({
    required String chatId,
    required String repName,
    required String meetingTime,
    required String joinUrl,
  }) async {
    // Implementation
  }
  
  /// Send renewal reminder
  static Future<void> sendRenewalReminder({
    required String chatId,
    required String planName,
    required int daysUntilRenewal,
  }) async {
    // Implementation
  }
}
```

### 2.2 Store User Telegram Chat ID

Add to database schema (Supabase):
```sql
-- profiles table (extend existing)
ALTER TABLE profiles ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE profiles ADD COLUMN telegram_enabled BOOLEAN DEFAULT false;
```

---

## Phase 3: Connect Zoom → Telegram

### 3.1 Update `lib/services/meeting_sync.dart`

When meeting status changes to `confirmed`:
```dart
// In MeetingSync.apply()
if (m.status == 'confirmed') {
  await TelegramService.sendMeetingConfirmed(
    chatId: AppState().userTelegramChatId,
    repName: m.repName,
    meetingTime: m.startTime,
    joinUrl: m.joinUrl,
  );
}
```

### 3.2 Update `lib/services/notifications.dart`

Add Telegram notifications alongside push notifications:
```dart
void computeNotifications(AppState state) {
  // ... existing notification logic ...
  
  // Send to Telegram if enabled
  if (state.telegramEnabled) {
    TelegramService.sendMessage(
      chatId: state.userTelegramChatId,
      message: notificationText,
    );
  }
}
```

---

## Phase 4: User Setup Flow

### 4.1 Add Telegram Connect Button
Location: Settings screen → "Notifications" section

UI: "Connect to Telegram" button
- Generates unique link: `t.me/chosech_bot?start=user_[USER_ID]`
- User taps → Bot confirms connection
- Bot stores their chat_id in database

### 4.2 Webhook Handler (Supabase Edge Function)

```typescript
// supabase/functions/telegram-webhook/index.ts
// Receives Telegram bot updates
// Stores chat_id when user sends /start command
```

---

## Phase 5: Messages to Send

### 5.1 Zoom Meeting Confirmed
```
✅ Meeting Confirmed!
Rep: [Rep Name]
Date: [Date & Time]
📞 Join: [Link]
```

### 5.2 Renewal Reminder
```
⏰ Plan Renewing Soon
Plan: [Plan Name]
Days left: [X]
💰 Save [Y]₪ with alternatives
```

### 5.3 Better Deal Alert
```
🎉 Better Deal Found!
Current: [Current Plan] @ [Price]₪
Better: [New Plan] @ [New Price]₪
Save: [Savings]₪/month
```

### 5.4 Meeting 15-Min Warning
```
⏲️ Meeting in 15 minutes
Rep: [Name]
📞 Join: [Link]
```

---

## Implementation Roadmap

| Phase | Task | Status |
|-------|------|--------|
| 1 | Create Telegram Bot (@BotFather) | TODO |
| 2 | Create TelegramService class | TODO |
| 2 | Add telegram_chat_id to database | TODO |
| 3 | Update MeetingSync for notifications | TODO |
| 3 | Update notifications.dart | TODO |
| 4 | Create "Connect Telegram" UI button | TODO |
| 4 | Telegram webhook handler (Edge Function) | TODO |
| 5 | Test all message types | TODO |
| 5 | Deploy & verify | TODO |

---

## Testing Checklist

- [ ] Bot receives `/start` command
- [ ] Chat ID stored in database
- [ ] Meeting confirmation sends to Telegram
- [ ] Renewal reminder sends to Telegram
- [ ] 15-min warning before meeting
- [ ] User can disable Telegram notifications
- [ ] Handles network errors gracefully

---

## Environment Variables

Add to `dart_define.json`:
```json
{
  "TELEGRAM_BOT_TOKEN": "123456:ABCdefGHIjklMNOpqrsTUVwxyz"
}
```

Add to `.env` (git-ignored):
```
TELEGRAM_BOT_TOKEN=123456:ABCdefGHIjklMNOpqrsTUVwxyz
```

---

## Security Notes

- ✅ Bot token stored in `.env` (not in code)
- ✅ Chat IDs stored per-user (encrypted at rest in Supabase)
- ✅ Users must explicitly opt-in ("Connect Telegram")
- ✅ Can disable anytime in Settings
- ✅ No personal data shared with Telegram (only IDs)

---

## References

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [BotFather Guide](https://core.telegram.org/bots#6-botfather)
- [Webhook Integration](https://core.telegram.org/bots/webhooks)
