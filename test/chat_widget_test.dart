import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/pages/chat/chat_widget.dart';
import 'package:chosech/pages/callback/callback_widget.dart';

/// Widget tests for the support chat (lib/pages/chat/chat_widget.dart): that it
/// renders its seeded conversation, and — the focus of this surface — that the
/// recovery affordances exist: an "escalate to a human" hand-off that routes to
/// the real callback flow, and an "end chat" affordance. Boots the full app
/// through GoRouter like the other harnesses.
///
/// NOTE: the typing indicator uses a repeating flutter_animate animation, so we
/// never call pumpAndSettle here (it would never settle); bounded pumps only.

Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  // A taller-than-default surface so the escalate strip + input bar sit on
  // screen (no off-screen taps); reset (in-test) when this test ends.
  await tester.binding.setSurfaceSize(const Size(900, 1400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    ChangeNotifierProvider.value(value: AppState(), child: const ChosechApp()),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

void _go(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

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

void main() {
  testWidgets('Chat renders its seeded conversation and recovery affordances',
      (tester) async {
    await _ignoringOverflow(() async {
      final handle = tester.ensureSemantics();
      await _bootApp(tester);
      _go(tester, '/chat');
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      expect(find.byType(ChatWidget), findsOneWidget);
      // The seeded agent intro is present.
      expect(find.textContaining('דנה'), findsWidgets);

      // The persistent escalate-to-human strip is shown (visible copy).
      expect(find.textContaining('נציג אנושי'), findsWidgets);
      // The icon-only app-bar escalate control carries a tooltip a11y label.
      expect(find.byTooltip('דברו עם נציג אנושי'), findsOneWidget);

      expect(tester.takeException(), isNull);
      handle.dispose();
    });
  });

  testWidgets('Escalate-to-human routes to the callback flow', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/chat');
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      // Tap the in-conversation escalate strip ("דברו עם נציג").
      final escalate = find.text('דברו עם נציג');
      expect(escalate, findsOneWidget);
      await tester.ensureVisible(escalate);
      await tester.pump();
      await tester.tap(escalate);
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      // We land on the real human callback flow — not a dead-end.
      expect(find.byType(CallbackWidget), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('Overflow menu exposes an end-chat affordance', (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/chat');
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      // Open the "more options" menu (let it finish opening).
      await tester.tap(find.byIcon(Icons.more_vert_rounded));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));

      // The end-chat entry exists; selecting it opens a confirm dialog. Tap the
      // menu item's ListTile (its tappable region) rather than the inner Text.
      expect(find.text('סיים שיחה'), findsOneWidget);
      await tester.tap(find.widgetWithText(ListTile, 'סיים שיחה'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));
      expect(find.text('סיום שיחה'), findsOneWidget); // dialog title

      // Dismiss without leaving (keeps the test self-contained).
      await tester.tap(find.text('המשך שיחה'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byType(ChatWidget), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
