import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart';
import 'dart:convert';

/// Telegram Bot integration for sending notifications via Telegram.
///
/// Messages are sent to users who have connected their Telegram account
/// to the app. Requires TELEGRAM_BOT_TOKEN environment variable set.
class TelegramService {
  TelegramService._();

  // Get from environment at build time: --dart-define TELEGRAM_BOT_TOKEN=...
  static const String _botToken = String.fromEnvironment('TELEGRAM_BOT_TOKEN');
  static const String _apiBase = 'https://api.telegram.org/bot';

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

  /// Send meeting confirmation message.
  static Future<bool> sendMeetingConfirmed({
    required String chatId,
    required String repName,
    required String meetingTime,
    required String joinUrl,
  }) async {
    final message = '''
<b>✅ Meeting Confirmed!</b>

<b>Rep:</b> $repName
<b>Time:</b> $meetingTime

<a href="$joinUrl">📞 Join Meeting</a>
'''.trim();

    return sendMessage(chatId: chatId, message: message, parseHtml: true);
  }

  /// Send renewal reminder message.
  static Future<bool> sendRenewalReminder({
    required String chatId,
    required String planName,
    required String providerName,
    required int daysUntilRenewal,
    required String currentPrice,
    required String deepLink,
  }) async {
    final daysText =
        daysUntilRenewal == 1 ? '1 day' : '$daysUntilRenewal days';
    final message = '''
<b>⏰ Plan Renewing Soon</b>

<b>Plan:</b> $planName @ $providerName
<b>Renews in:</b> $daysText
<b>Current price:</b> $currentPrice/month

<a href="$deepLink">💰 See Better Alternatives</a>
'''.trim();

    return sendMessage(chatId: chatId, message: message, parseHtml: true);
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
  }) async {
    final message = '''
<b>🎉 Better Deal Found!</b>

<b>Current:</b> $currentPlan @ $currentProvider
💰 $currentPrice/month

<b>Better:</b> $betterPlan @ $betterProvider
💰 $betterPrice/month

<b>Save:</b> <u>$monthlySavings/month</u>

<a href="$deepLink">Switch Now</a>
'''.trim();

    return sendMessage(chatId: chatId, message: message, parseHtml: true);
  }

  /// Send meeting reminder (15 minutes before).
  static Future<bool> sendMeetingReminder({
    required String chatId,
    required String repName,
    required String joinUrl,
  }) async {
    final message = '''
<b>⏲️ Meeting in 15 minutes!</b>

<b>Rep:</b> $repName
<a href="$joinUrl">📞 Join Meeting</a>
'''.trim();

    return sendMessage(chatId: chatId, message: message, parseHtml: true);
  }

  /// Send savings summary message.
  static Future<bool> sendSavingsSummary({
    required String chatId,
    required String totalMonthlySavings,
    required String totalYearlySavings,
    required int alternativesCount,
    required String deepLink,
  }) async {
    final message = '''
<b>💰 Your Savings Summary</b>

<b>Monthly:</b> <u>$totalMonthlySavings</u>
<b>Yearly:</b> <u>$totalYearlySavings</u>
<b>Alternatives:</b> $alternativesCount plans

<a href="$deepLink">View Details</a>
'''.trim();

    return sendMessage(chatId: chatId, message: message, parseHtml: true);
  }

  /// Send generic notification (for any custom message).
  static Future<bool> sendNotification({
    required String chatId,
    required String title,
    required String body,
    String? buttonText,
    String? buttonUrl,
  }) async {
    var message = '<b>$title</b>\n\n$body';

    if (buttonText != null && buttonUrl != null) {
      message += '\n\n<a href="$buttonUrl">$buttonText</a>';
    }

    return sendMessage(chatId: chatId, message: message, parseHtml: true);
  }

  /// Test the bot connection (call from a debug/settings screen).
  static Future<bool> testConnection(String chatId) async {
    return sendNotification(
      chatId: chatId,
      title: '✅ Telegram Connected!',
      body: 'You will now receive notifications via Telegram.',
    );
  }
}
