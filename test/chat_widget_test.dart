import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/core/contact.dart';
import 'package:chosech/pages/chat/chat_widget.dart';
import 'package:chosech/pages/callback/callback_widget.dart';

/// Widget tests for the honest team channel (lib/pages/chat/chat_widget.dart):
/// a contact-card screen for "צוות הליווי" that replaced the old simulated
/// "דנה" chat. The tests assert the truth-only contract — the team header with
/// NO fabricated agent, a real WhatsApp CTA, a phone tile with an a11y label,
/// and a callback tile that routes to the real human-callback flow. Boots the
/// full app through GoRouter like the other harnesses.

Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  // A taller-than-default surface so every tile sits on screen (no off-screen
  // taps); reset (in-test) when this test ends.
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
  testWidgets('Team channel renders the honest contact card — no mocked agent',
      (tester) async {
    await _ignoringOverflow(() async {
      final handle = tester.ensureSemantics();
      await _bootApp(tester);
      _go(tester, '/chat');
      // Four bounded pumps: the page transition plus the staggered entrance
      // fades must fully finish before the faded subtrees re-enter the
      // semantics tree (FadeTransition drops semantics at opacity 0).
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 700));
      }

      expect(find.byType(ChatWidget), findsOneWidget);
      // The team header is present (app-bar title + header card).
      expect(find.textContaining('צוות הליווי'), findsWidgets);
      // The primary WhatsApp CTA exposes its labelled button semantics.
      expect(find.bySemanticsLabel('דברו איתנו בוואטסאפ'), findsWidgets);
      // The honesty line — a truthful commitment, not an invented SLA.
      expect(find.textContaining('בשעות הפעילות'), findsOneWidget);

      // TRUTH-ONLY: the fabricated agent persona is gone — no "דנה", and no
      // fake presence status.
      expect(find.textContaining('דנה'), findsNothing);
      expect(find.textContaining('מחוברת'), findsNothing);

      expect(tester.takeException(), isNull);
      handle.dispose();
    });
  });

  testWidgets('Callback tile routes to the real human-callback flow',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/chat');
      // Four bounded pumps: the page transition plus the staggered entrance
      // fades must fully finish before the faded subtrees re-enter the
      // semantics tree (FadeTransition drops semantics at opacity 0).
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 700));
      }

      final callbackTile = find.text('תיאום שיחה חוזרת');
      expect(callbackTile, findsOneWidget);
      await tester.ensureVisible(callbackTile);
      await tester.pump();
      await tester.tap(callbackTile);
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      // We land on the real human callback flow — not a dead-end.
      expect(find.byType(CallbackWidget), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('Phone tile exposes a labelled button with the real number',
      (tester) async {
    await _ignoringOverflow(() async {
      final handle = tester.ensureSemantics();
      await _bootApp(tester);
      _go(tester, '/chat');
      // Four bounded pumps: the page transition plus the staggered entrance
      // fades must fully finish before the faded subtrees re-enter the
      // semantics tree (FadeTransition drops semantics at opacity 0).
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 700));
      }

      // The phone tile is one labelled Semantics button carrying the real
      // support number (children excluded, so screen readers hear it once).
      final phoneTile =
          find.bySemanticsLabel('התקשרו אלינו: $kSupportPhoneDisplay');
      expect(phoneTile, findsOneWidget);
      final semantics = tester.getSemantics(phoneTile);
      expect(semantics.flagsCollection.isButton, isTrue);

      expect(tester.takeException(), isNull);
      handle.dispose();
    });
  });
}
