import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/telegram_service.dart';

/// Tests for [TelegramService]'s pure, network-free surface:
///   - the message body builders output Hebrew copy,
///   - every interpolated value is HTML-escaped (so a stray `<`/`&` in a
///     provider/plan name cannot break Telegram's HTML parser),
///   - the renewal reminder pluralizes days correctly (1 → יום, N → ימים),
///   - the generic notification appends the link button only when BOTH
///     buttonText and buttonUrl are non-null,
///   - sendMessage returns false (no throw) when the bot token is empty.
///
/// The real Telegram API is never called: the bot token is empty in tests
/// (no --dart-define), so the only sender we exercise short-circuits to false.
void main() {
  group('buildMeetingConfirmedBody', () {
    test('outputs Hebrew copy', () {
      final body = TelegramService.buildMeetingConfirmedBody(
        repName: 'דנה',
        meetingTime: 'מחר 10:00',
        joinUrl: 'https://meet.example/abc',
      );
      expect(body, contains('הפגישה אושרה'));
      expect(body, contains('נציג:'));
      expect(body, contains('מועד:'));
      expect(body, contains('הצטרפות לפגישה'));
    });

    test('HTML-escapes interpolated values', () {
      final body = TelegramService.buildMeetingConfirmedBody(
        repName: 'A < B & C',
        meetingTime: 'time',
        joinUrl: 'https://x?a=1&b=2',
      );
      expect(body, contains('A &lt; B &amp; C'));
      // raw, unescaped sequences must not survive in the interpolated value
      expect(body, isNot(contains('A < B & C')));
      // the joinUrl ampersand is escaped too
      expect(body, contains('https://x?a=1&amp;b=2'));
    });
  });

  group('buildRenewalReminderBody', () {
    test('outputs Hebrew copy with price unit suffix', () {
      final body = TelegramService.buildRenewalReminderBody(
        planName: 'מסלול בסיס',
        providerName: 'ספק',
        daysUntilRenewal: 5,
        currentPrice: '₪49',
        deepLink: 'app://renewal',
        priceUnit: 'חודש',
      );
      expect(body, contains('המסלול שלך מתחדש בקרוב'));
      expect(body, contains('מסלול:'));
      expect(body, contains('מתחדש בעוד:'));
      expect(body, contains('מחיר נוכחי:'));
      expect(body, contains('₪49/חודש'));
    });

    test('pluralizes 1 day as "יום אחד"', () {
      final body = TelegramService.buildRenewalReminderBody(
        planName: 'p',
        providerName: 'q',
        daysUntilRenewal: 1,
        currentPrice: '₪10',
        deepLink: 'app://x',
      );
      expect(body, contains('יום אחד'));
      expect(body, isNot(contains('1 ימים')));
    });

    test('pluralizes N days as "N ימים"', () {
      final body = TelegramService.buildRenewalReminderBody(
        planName: 'p',
        providerName: 'q',
        daysUntilRenewal: 7,
        currentPrice: '₪10',
        deepLink: 'app://x',
      );
      expect(body, contains('7 ימים'));
      expect(body, isNot(contains('יום אחד')));
    });

    test('defaults the price unit to "חודש"', () {
      final body = TelegramService.buildRenewalReminderBody(
        planName: 'p',
        providerName: 'q',
        daysUntilRenewal: 3,
        currentPrice: '₪20',
        deepLink: 'app://x',
      );
      expect(body, contains('₪20/חודש'));
    });

    test('HTML-escapes plan and provider names', () {
      final body = TelegramService.buildRenewalReminderBody(
        planName: 'Plan <b>X</b>',
        providerName: 'Bezeq & Co',
        daysUntilRenewal: 2,
        currentPrice: '₪30',
        deepLink: 'app://x',
      );
      expect(body, contains('Plan &lt;b&gt;X&lt;/b&gt;'));
      expect(body, contains('Bezeq &amp; Co'));
      expect(body, isNot(contains('Bezeq & Co')));
    });
  });

  group('buildBetterDealAlertBody', () {
    test('outputs Hebrew copy and applies the price unit', () {
      final body = TelegramService.buildBetterDealAlertBody(
        currentPlan: 'מסלול נוכחי',
        currentProvider: 'ספק א',
        currentPrice: '₪80',
        betterPlan: 'מסלול חדש',
        betterProvider: 'ספק ב',
        betterPrice: '₪50',
        monthlySavings: '₪30',
        deepLink: 'app://switch',
        priceUnit: 'חבילה',
      );
      expect(body, contains('נמצאה עסקה משתלמת יותר'));
      expect(body, contains('נוכחי:'));
      expect(body, contains('משתלם יותר:'));
      expect(body, contains('חיסכון:'));
      expect(body, contains('₪80/חבילה'));
      expect(body, contains('₪50/חבילה'));
      expect(body, contains('₪30/חבילה'));
    });

    test('HTML-escapes interpolated values', () {
      final body = TelegramService.buildBetterDealAlertBody(
        currentPlan: 'A & B',
        currentProvider: 'X < Y',
        currentPrice: '₪80',
        betterPlan: 'C & D',
        betterProvider: 'Z > W',
        betterPrice: '₪50',
        monthlySavings: '₪30',
        deepLink: 'app://switch',
      );
      expect(body, contains('A &amp; B'));
      expect(body, contains('X &lt; Y'));
      expect(body, contains('C &amp; D'));
      expect(body, contains('Z &gt; W'));
    });
  });

  group('buildMeetingReminderBody', () {
    test('outputs Hebrew copy and escapes the rep name', () {
      final body = TelegramService.buildMeetingReminderBody(
        repName: 'דנה & יוסי',
        joinUrl: 'https://meet/x',
      );
      expect(body, contains('פגישה בעוד 15 דקות'));
      expect(body, contains('נציג:'));
      expect(body, contains('הצטרפות לפגישה'));
      expect(body, contains('דנה &amp; יוסי'));
    });
  });

  group('buildSavingsSummaryBody', () {
    test('outputs Hebrew copy and shows the alternatives count', () {
      final body = TelegramService.buildSavingsSummaryBody(
        totalMonthlySavings: '₪40',
        totalYearlySavings: '₪480',
        alternativesCount: 3,
        deepLink: 'app://savings',
      );
      expect(body, contains('סיכום החיסכון שלך'));
      expect(body, contains('חודשי:'));
      expect(body, contains('שנתי:'));
      expect(body, contains('3 מסלולים'));
      expect(body, contains('לצפייה בפרטים'));
    });

    test('HTML-escapes the savings figures', () {
      final body = TelegramService.buildSavingsSummaryBody(
        totalMonthlySavings: '<40>',
        totalYearlySavings: 'a&b',
        alternativesCount: 1,
        deepLink: 'app://savings',
      );
      expect(body, contains('&lt;40&gt;'));
      expect(body, contains('a&amp;b'));
    });
  });

  group('buildNotificationBody', () {
    test('escapes title and body, no button block when both link parts null',
        () {
      final body = TelegramService.buildNotificationBody(
        title: 'כותרת & עוד',
        body: 'גוף < ההודעה',
      );
      expect(body, contains('כותרת &amp; עוד'));
      expect(body, contains('גוף &lt; ההודעה'));
      expect(body, isNot(contains('<a href=')));
    });

    test('appends the button block only when BOTH text and url are non-null',
        () {
      final body = TelegramService.buildNotificationBody(
        title: 'כותרת',
        body: 'גוף',
        buttonText: 'פתח',
        buttonUrl: 'https://x?a=1&b=2',
      );
      expect(body, contains('<a href="https://x?a=1&amp;b=2">פתח</a>'));
    });

    test('omits the button block when only buttonText is provided', () {
      final body = TelegramService.buildNotificationBody(
        title: 'כותרת',
        body: 'גוף',
        buttonText: 'פתח',
      );
      expect(body, isNot(contains('<a href=')));
    });

    test('omits the button block when only buttonUrl is provided', () {
      final body = TelegramService.buildNotificationBody(
        title: 'כותרת',
        body: 'גוף',
        buttonUrl: 'https://x',
      );
      expect(body, isNot(contains('<a href=')));
    });
  });

  group('sendMessage', () {
    test('returns false (no throw) when the bot token is empty', () async {
      // In tests there is no --dart-define TELEGRAM_BOT_TOKEN, so the token is
      // empty and sendMessage short-circuits before any network call.
      final ok = await TelegramService.sendMessage(
        chatId: '123',
        message: 'שלום',
      );
      expect(ok, isFalse);
    });

    test('senders short-circuit to false with an empty token', () async {
      final ok = await TelegramService.sendNotification(
        chatId: '123',
        title: 'כותרת',
        body: 'גוף',
      );
      expect(ok, isFalse);
    });
  });
}
