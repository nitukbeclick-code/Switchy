import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/pages/lead/lead_widget.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/backend/local_backend.dart';

/// Widget tests for the lead form (lib/pages/lead/lead_widget.dart): that it
/// renders for a real plan, that the WhatsApp alternative is always present, and
/// — the focus of this surface — that a failed submit raises a PERSISTENT
/// recovery panel (retry CTA + WhatsApp + request-a-callback) rather than a
/// transient snackbar the user can miss. Boots the full app through GoRouter
/// exactly like the other harnesses (test/nav_smoke_test.dart, bills test).

/// A backend whose [submitLead] always throws — used to drive the lead form's
/// failure-recovery path deterministically.
class _FailingBackend extends LocalBackend {
  @override
  Future<void> submitLead(LeadInput lead) async {
    throw Exception('network down');
  }
}

Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  // A tall surface so the long form + recovery panel fit without off-screen
  // taps; reset (in-test) when this test ends.
  await tester.binding.setSurfaceSize(const Size(900, 2600));
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

/// Swallow benign RenderFlex overflow errors — the tall form can overflow the
/// test viewport; that is a pre-existing layout artefact, not a test failure
/// (same approach as test/bills_widget_test.dart).
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

String _planId() => plansByCat('cellular').first.id;

void main() {
  final originalBackend = appBackend;
  tearDown(() {
    appBackend = originalBackend;
  });

  testWidgets('Lead form renders for a real plan with a WhatsApp alternative',
      (tester) async {
    await _ignoringOverflow(() async {
      await _bootApp(tester);
      _go(tester, '/lead/${_planId()}');
      // Past the route transition + the longest flutter_animate delay (~340ms).
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      expect(find.byType(LeadWidget), findsOneWidget);
      // The honest availability banner and the primary CTA copy are present.
      expect(find.textContaining('נחזור אליכם'), findsWidgets);
      // WhatsApp is always offered as an alternative to leaving details.
      expect(find.textContaining('וואטסאפ'), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('A failed submit raises the persistent recovery panel',
      (tester) async {
    await _ignoringOverflow(() async {
      appBackend = _FailingBackend();
      await _bootApp(tester);
      _go(tester, '/lead/${_planId()}');
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      // Fill name + phone (the two required fields).
      final fields = find.byType(TextFormField);
      expect(fields, findsWidgets);
      await tester.enterText(fields.at(0), 'ישראל ישראלי');
      await tester.enterText(fields.at(1), '0501234567');
      await tester.pump();

      // Accept the two mandatory consents (terms + privacy = first two boxes).
      final boxes = find.byType(Checkbox);
      expect(boxes, findsNWidgets(3));
      await tester.ensureVisible(boxes.at(0));
      await tester.tap(boxes.at(0));
      await tester.pump();
      await tester.ensureVisible(boxes.at(1));
      await tester.tap(boxes.at(1));
      await tester.pump();

      // Submit — scroll the CTA into view first, then tap.
      final submit = find.textContaining('המלצה אישית');
      await tester.ensureVisible(submit);
      await tester.pump();
      await tester.tap(submit);
      // Let the (failing) submit settle + the recovery panel animate in.
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));

      // The persistent recovery panel is now shown: an explicit failure note,
      // a request-a-callback fallback, and the CTA flips to "retry".
      expect(find.textContaining('הפנייה לא נשלחה'), findsOneWidget);
      expect(find.text('בקשו שנחזור אליכם'), findsOneWidget);
      expect(find.textContaining('נסו שוב'), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  });
}
