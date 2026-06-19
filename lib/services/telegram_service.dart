import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// Telegram Bot integration for sending notifications via Telegram.
///
/// Messages are sent to users who have connected their Telegram account
/// to the app. Requires TELEGRAM_BOT_TOKEN environment variable set.
///
/// Each message body is produced by a pure, network-free `build*Body` method
/// (Hebrew copy, every interpolated value HTML-escaped) so it can be unit
/// tested without hitting the Telegram API — see
/// test/telegram_service_test.dart. The `send*` wrappers just build + ship.
class TelegramService {
  TelegramService._();

  // Get from environment at build time: --dart-define TELEGRAM_BOT_TOKEN=...
  static const String _botToken = String.fromEnvironment('TELEGRAM_BOT_TOKEN');
  static const String _apiBase = 'https://api.telegram.org/bot';

  /// HTML-escape an interpolated value so a stray `<`, `>` or `&` in a
  /// provider / plan / rep name can't break Telegram's HTML parse_mode.
  /// `&` is replaced first so the entities it introduces aren't re-escaped.
  static String _esc(String s) => s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');

  /// Send a text message to a Telegram chat.
  /// Returns true if successful, false otherwise.
  static Future<bool> sendMessage({
    required String chatId,
    required String message,
    bool parseHtml = true,
  }) async {
    if (_botToken.isEmpty) {
      debugPrint('⚠️ Telegram: Bot token not configured');
      return false;
    }

    try {
      final response = await http.post(
        Uri.parse('$_apiBase$_botToken/sendMessage'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'chat_id': chatId,
          'text': message,
          'parse_mode': parseHtml ? 'HTML' : 'Markdown',
        }),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        debugPrint('✅ Telegram message sent to $chatId');
        return true;
      } else {
        debugPrint('❌ Telegram error: ${response.statusCode} ${response.body}');
        return false;
      }
    } catch (e) {
      debugPrint('❌ Telegram error: $e');
      return false;
    }
  }

  // ── Pure message builders (network-free, HTML-escaped, Hebrew) ────────────

  /// Body for a confirmed meeting.
  static String buildMeetingConfirmedBody({
    required String repName,
    required String meetingTime,
    required String joinUrl,
  }) {
    return '''
<b>✅ הפגישה אושרה!</b>

<b>נציג:</b> ${_esc(repName)}
<b>מועד:</b> ${_esc(meetingTime)}

<a href="${_esc(joinUrl)}">📞 הצטרפות לפגישה</a>
'''
        .trim();
  }

  /// Body for an upcoming-renewal reminder. Pluralizes the day count
  /// (1 → "יום אחד", N → "N ימים"); `priceUnit` defaults to "חודש".
  static String buildRenewalReminderBody({
    required String planName,
    required String providerName,
    required int daysUntilRenewal,
    required String currentPrice,
    required String deepLink,
    String priceUnit = 'חודש',
  }) {
    final daysText =
        daysUntilRenewal == 1 ? 'יום אחד' : '$daysUntilRenewal ימים';
    return '''
<b>⏰ המסלול שלך מתחדש בקרוב</b>

<b>מסלול:</b> ${_esc(planName)} @ ${_esc(providerName)}
<b>מתחדש בעוד:</b> $daysText
<b>מחיר נוכחי:</b> ${_esc(currentPrice)}/${_esc(priceUnit)}

<a href="${_esc(deepLink)}">💰 לעסקאות משתלמות יותר</a>
'''
        .trim();
  }

  /// Body for a "found a better deal" alert. The price unit is applied to the
  /// current price, the better price and the savings; defaults to "חודש".
  static String buildBetterDealAlertBody({
    required String currentPlan,
    required String currentProvider,
    required String currentPrice,
    required String betterPlan,
    required String betterProvider,
    required String betterPrice,
    required String monthlySavings,
    required String deepLink,
    String priceUnit = 'חודש',
  }) {
    final unit = _esc(priceUnit);
    return '''
<b>🎉 נמצאה עסקה משתלמת יותר!</b>

<b>נוכחי:</b> ${_esc(currentPlan)} @ ${_esc(currentProvider)}
💰 ${_esc(currentPrice)}/$unit

<b>משתלם יותר:</b> ${_esc(betterPlan)} @ ${_esc(betterProvider)}
💰 ${_esc(betterPrice)}/$unit

<b>חיסכון:</b> <u>${_esc(monthlySavings)}/$unit</u>

<a href="${_esc(deepLink)}">להחלפה עכשיו</a>
'''
        .trim();
  }

  /// Body for a 15-minutes-before meeting reminder.
  static String buildMeetingReminderBody({
    required String repName,
    required String joinUrl,
  }) {
    return '''
<b>⏲️ פגישה בעוד 15 דקות!</b>

<b>נציג:</b> ${_esc(repName)}
<a href="${_esc(joinUrl)}">📞 הצטרפות לפגישה</a>
'''
        .trim();
  }

  /// Body for a savings summary.
  static String buildSavingsSummaryBody({
    required String totalMonthlySavings,
    required String totalYearlySavings,
    required int alternativesCount,
    required String deepLink,
  }) {
    return '''
<b>💰 סיכום החיסכון שלך</b>

<b>חודשי:</b> <u>${_esc(totalMonthlySavings)}</u>
<b>שנתי:</b> <u>${_esc(totalYearlySavings)}</u>
<b>חלופות:</b> $alternativesCount מסלולים

<a href="${_esc(deepLink)}">לצפייה בפרטים</a>
'''
        .trim();
  }

  /// Body for a generic notification. The link button is appended only when
  /// BOTH `buttonText` and `buttonUrl` are non-null.
  static String buildNotificationBody({
    required String title,
    required String body,
    String? buttonText,
    String? buttonUrl,
  }) {
    var message = '<b>${_esc(title)}</b>\n\n${_esc(body)}';
    if (buttonText != null && buttonUrl != null) {
      message += '\n\n<a href="${_esc(buttonUrl)}">${_esc(buttonText)}</a>';
    }
    return message;
  }

  // ── Senders (build the body, then ship it) ────────────────────────────────

  /// Send meeting confirmation message.
  static Future<bool> sendMeetingConfirmed({
    required String chatId,
    required String repName,
    required String meetingTime,
    required String joinUrl,
  }) {
    return sendMessage(
      chatId: chatId,
      message: buildMeetingConfirmedBody(
        repName: repName,
        meetingTime: meetingTime,
        joinUrl: joinUrl,
      ),
    );
  }

  /// Send renewal reminder message.
  static Future<bool> sendRenewalReminder({
    required String chatId,
    required String planName,
    required String providerName,
    required int daysUntilRenewal,
    required String currentPrice,
    required String deepLink,
    String priceUnit = 'חודש',
  }) {
    return sendMessage(
      chatId: chatId,
      message: buildRenewalReminderBody(
        planName: planName,
        providerName: providerName,
        daysUntilRenewal: daysUntilRenewal,
        currentPrice: currentPrice,
        deepLink: deepLink,
        priceUnit: priceUnit,
      ),
    );
  }

  /// Send better deal alert message.
  static Future<bool> sendBetterDealAlert({
    required String chatId,
    required String currentPlan,
    required String currentProvider,
    required String currentPrice,
    required String betterPlan,
    required String betterProvider,
    required String betterPrice,
    required String monthlySavings,
    required String deepLink,
    String priceUnit = 'חודש',
  }) {
    return sendMessage(
      chatId: chatId,
      message: buildBetterDealAlertBody(
        currentPlan: currentPlan,
        currentProvider: currentProvider,
        currentPrice: currentPrice,
        betterPlan: betterPlan,
        betterProvider: betterProvider,
        betterPrice: betterPrice,
        monthlySavings: monthlySavings,
        deepLink: deepLink,
        priceUnit: priceUnit,
      ),
    );
  }

  /// Send meeting reminder (15 minutes before).
  static Future<bool> sendMeetingReminder({
    required String chatId,
    required String repName,
    required String joinUrl,
  }) {
    return sendMessage(
      chatId: chatId,
      message: buildMeetingReminderBody(repName: repName, joinUrl: joinUrl),
    );
  }

  /// Send savings summary message.
  static Future<bool> sendSavingsSummary({
    required String chatId,
    required String totalMonthlySavings,
    required String totalYearlySavings,
    required int alternativesCount,
    required String deepLink,
  }) {
    return sendMessage(
      chatId: chatId,
      message: buildSavingsSummaryBody(
        totalMonthlySavings: totalMonthlySavings,
        totalYearlySavings: totalYearlySavings,
        alternativesCount: alternativesCount,
        deepLink: deepLink,
      ),
    );
  }

  /// Send generic notification (for any custom message).
  static Future<bool> sendNotification({
    required String chatId,
    required String title,
    required String body,
    String? buttonText,
    String? buttonUrl,
  }) {
    return sendMessage(
      chatId: chatId,
      message: buildNotificationBody(
        title: title,
        body: body,
        buttonText: buttonText,
        buttonUrl: buttonUrl,
      ),
    );
  }

  /// Test the bot connection (call from a debug/settings screen).
  static Future<bool> testConnection(String chatId) {
    return sendNotification(
      chatId: chatId,
      title: '✅ Telegram מחובר!',
      body: 'מעכשיו תקבל/י התראות דרך Telegram.',
    );
  }
}
