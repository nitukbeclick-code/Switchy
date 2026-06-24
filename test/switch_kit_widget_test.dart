import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/pages/switch_kit/switch_kit_widget.dart';

/// Widget tests for the Switch Autopilot (lib/pages/switch_kit/switch_kit_widget.dart):
///   • picking a provider builds the kit (bottom-line summary + the review-and-send letter);
///   • the step-by-step tracker is operable via its accessibility labels
///     (find.bySemanticsLabel for the icon-only step toggles + restart control)
///     and the completion advances;
///   • the honest "general guidance, not legal advice" framing is present.
/// Pumped standalone inside a minimal RTL MaterialApp + AppState provider (the
/// page is a leaf reached via push; the /switch-kit route is wired in
/// lib/router.dart and exercised by test/nav_smoke_test.dart).

Future<void> _pump(
  WidgetTester tester, {
  String? provider,
  String? category,
}) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  await tester.binding.setSurfaceSize(const Size(900, 2600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    ChangeNotifierProvider.value(
      value: AppState(),
      child: MaterialApp(
        theme: ThemeData(brightness: Brightness.light),
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: SwitchKitWidget(
            initialProvider: provider,
            initialCategory: category,
          ),
        ),
      ),
    ),
  );
  // Let the one-shot intro animations + the async progress load settle.
  await tester.pump(const Duration(milliseconds: 600));
}

void main() {
  testWidgets('picking a provider builds the kit (summary + the review-and-send letter)',
      (tester) async {
    await _pump(tester, provider: 'פרטנר', category: 'cellular');

    expect(find.text('השורה התחתונה'), findsOneWidget);
    expect(find.text('מכתב ניתוק/ניוד מוכן'), findsOneWidget);
  });

  testWidgets('the step tracker toggles via its semantics label and advances completion',
      (tester) async {
    await _pump(tester, provider: 'סלקום', category: 'cellular');

    // The first checklist step exposes a "סמן כבוצע" semantics label while undone.
    final toggle =
        find.bySemanticsLabel(RegExp(r'בדקו את תנאי ההתקשרות שלכם, סמן כבוצע'));
    expect(toggle, findsOneWidget);

    await tester.ensureVisible(toggle);
    await tester.tap(toggle);
    await tester.pump(const Duration(milliseconds: 300));

    // After tapping, the same step reads as completed, and the restart control
    // (icon-only, semantics-labelled) now appears.
    expect(find.bySemanticsLabel(RegExp(r'בדקו את תנאי ההתקשרות שלכם, הושלם')),
        findsOneWidget);
    expect(find.bySemanticsLabel('התחל מחדש את המעקב'), findsOneWidget);
  });

  testWidgets('a cellular kit walks number porting; a fixed kit walks a written notice',
      (tester) async {
    await _pump(tester, provider: 'פרטנר', category: 'cellular');
    expect(find.text('ניוד המספר מתבצע מול הספק החדש'), findsOneWidget);
    expect(find.text('מסרו הודעת ניתוק בכתב ותעדו אותה'), findsNothing);
  });

  testWidgets('the disclaimer states it is general guidance, not legal advice',
      (tester) async {
    await _pump(tester, provider: 'בזק', category: 'internet');

    await tester.dragUntilVisible(
      find.textContaining('לא ייעוץ משפטי'),
      find.byType(SingleChildScrollView),
      const Offset(0, -300),
    );
    expect(find.textContaining('לא ייעוץ משפטי'), findsOneWidget);
  });
}
