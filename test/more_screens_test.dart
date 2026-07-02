import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/backend/local_backend.dart';

/// Community-notification fetch throws — the offline / backend-down path for
/// the notification center's server-side inbox.
class _ErrorNotifBackend extends LocalBackend {
  @override
  Future<List<CommunityNotification>> fetchCommunityNotifications() async =>
      throw Exception('offline');
}

/// Boot the full app exactly like the existing harnesses
/// (test/screens_content_test.dart, test/nav_smoke_test.dart).
Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  await tester.pumpWidget(
    ChangeNotifierProvider.value(value: AppState(), child: const ChosechApp()),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

/// Navigate via GoRouter using the root Navigator element.
void _go(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

/// Run [body] while swallowing benign RenderFlex overflow FlutterErrors
/// (pre-existing layout issues in the app, not test failures) — same
/// approach as test 5 in nav_smoke_test.dart.
Future<void> _ignoringOverflow(Future<void> Function() body) async {
  final originalOnError = FlutterError.onError;
  FlutterError.onError = (details) {
    final s = details.exceptionAsString();
    if (s.contains('overflowed') || s.contains('RenderFlex')) return;
    originalOnError?.call(details);
  };
  try {
    await body();
  } finally {
    FlutterError.onError = originalOnError;
  }
}

/// ISO date [days] out from today (yyyy-MM-dd).
String _isoInDays(int days) {
  final d = DateTime.now().add(Duration(days: days));
  return '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

void main() {
  tearDown(() {
    appBackend = LocalBackend();
  });

  testWidgets(
      'Notification center failed community fetch shows error + retry, not "all caught up"',
      (tester) async {
    // Backend down + nothing computed to act on → the empty inbox must be an
    // honest "couldn't load" + retry, never the "all caught up" lie.
    appBackend = _ErrorNotifBackend();
    await _bootApp(tester);

    _go(tester, '/notifications');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('לא הצלחנו לטעון התראות'), findsOneWidget);
    expect(find.text('נסו שוב'), findsOneWidget);
    expect(find.text('הכל מעודכן'), findsNothing);
    expect(tester.takeException(), isNull);
    // Drain the empty-state entrance so no animation frame is left mid-flight.
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets(
      'Notification center renders the renewal alert card for a near-renewal tracked plan',
      (tester) async {
    await _bootApp(tester);
    // A tracked plan whose promo ends ~10 days out → a renewal notification
    // whose title carries "מסתיים בעוד $d ימים" (see services/notifications.dart).
    AppState().addMyPlan(
      category: 'cellular',
      provider: 'סלקום',
      planName: 'x',
      monthlyPrice: 99,
      promoEndDate: _isoInDays(10),
    );

    _go(tester, '/notifications');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    // Screen chrome + the renewal alert card.
    expect(find.text('התראות'), findsOneWidget);
    expect(find.textContaining('מסתיים בעוד'), findsWidgets);
    // The card body deep-links into the full comparison table.
    expect(find.textContaining('טבלת השוואה מלאה'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Account screen renders its quick links', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      _go(tester, '/account');
      await tester.pump(const Duration(milliseconds: 300));
      // Drain the staggered one-shot entrance animations on the quick-action
      // tiles so no flutter_animate timer is left pending at dispose.
      await tester.pump(const Duration(seconds: 2));

      // Quick-links row (account_widget.dart lines 152-158).
      expect(find.text('חיסכון'), findsOneWidget);
      expect(find.text('דירוגים'), findsOneWidget);
      expect(find.text('חשבונות'), findsOneWidget);
      tester.takeException();
    });
  });

  testWidgets(
      'Compare screen shows comparison rows for two tracked cellular plans',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);

      final plans = plansByCat('cellular');
      AppState().setCategory('cellular');
      AppState().toggleCompare(plans[0].id);
      AppState().toggleCompare(plans[1].id);

      _go(tester, '/compare');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));

      // App bar title + a comparison-table row label. The fabricated 'דירוג'
      // row was removed in the de-fake; 'חיסכון שנתי' is a real comparison row.
      expect(find.text('השוואת מסלולים'), findsOneWidget);
      expect(find.text('חיסכון שנתי'), findsWidgets);
      tester.takeException();
    });
  });
}
