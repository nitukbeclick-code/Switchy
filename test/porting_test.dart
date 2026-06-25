import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:chosech/app_state.dart';
import 'package:chosech/pages/porting/porting_widget.dart';

/// Pumps [PortingWidget] inside the minimal ambient it needs: a [MaterialApp]
/// (for the [Theme] that `AppTheme.of` reads and for the [Navigator]) and a
/// [Provider]<[AppState]> (the page reads the singleton in `initState` and
/// `Provider.of<AppState>` in `build`). RTL mirrors the live app shell.
Future<void> _pumpPorting(WidgetTester tester) async {
  await tester.pumpWidget(
    // AppState is a ChangeNotifier, so it must be provided via
    // ChangeNotifierProvider — a plain Provider rejects Listenables.
    ChangeNotifierProvider<AppState>.value(
      value: AppState(),
      child: const MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: PortingWidget(),
        ),
      ),
    ),
  );
  // Settle the entry one-shot animations (fadeIn/slideY) before asserting.
  await tester.pumpAndSettle();
}

void main() {
  setUp(AppState.reset);
  tearDown(AppState.reset);

  testWidgets('renders the porting form: title, fields, providers and CTA',
      (tester) async {
    await _pumpPorting(tester);

    // App-bar title + the "how it works" timeline heading.
    expect(find.text('בקשת ניוד מספר'), findsOneWidget);
    expect(find.text('כיצד עובד הניוד?'), findsOneWidget);

    // Section labels for the two inputs and the current-provider picker.
    expect(find.text('מספר לניוד'), findsOneWidget);
    expect(find.text('מספר תעודת זהות'), findsOneWidget);
    expect(find.text('ספק נוכחי'), findsOneWidget);

    // The full provider catalogue renders as selectable chips.
    for (final provider in const [
      'פלאפון',
      'סלקום',
      'פרטנר',
      'גולן טלקום',
      'רמי לוי',
      'הוט מובייל',
      'אחר',
    ]) {
      expect(find.text(provider), findsOneWidget,
          reason: 'missing provider chip: $provider');
    }

    // POA consent copy + the primary submit CTA label.
    expect(
      find.text('אני מסכים/ה לייפוי כוח לביצוע הניוד בשמי'),
      findsOneWidget,
    );
    expect(find.text('שלח בקשת ניוד'), findsOneWidget);
  });

  testWidgets('back control exposes the Hebrew "חזרה" semantics label',
      (tester) async {
    await _pumpPorting(tester);

    // The icon-only back button carries an accessible label via its tooltip.
    expect(find.bySemanticsLabel('חזרה'), findsOneWidget);
  });

  testWidgets('POA checkbox toggles the check mark on tap', (tester) async {
    await _pumpPorting(tester);

    // Unchecked initially — the check glyph is absent.
    expect(find.byIcon(Icons.check_rounded), findsNothing);

    // The POA row sits below the fold of the 800x600 test viewport, so scroll
    // it on-screen before tapping — otherwise the tap lands on empty space.
    final poaRow = find.text('אני מסכים/ה לייפוי כוח לביצוע הניוד בשמי');
    await tester.ensureVisible(poaRow);
    await tester.pumpAndSettle();

    // Tapping the consent row flips the checkbox on (pure setState, no backend).
    await tester.tap(poaRow);
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.check_rounded), findsOneWidget);

    // Tapping again clears it.
    await tester.ensureVisible(poaRow);
    await tester.pumpAndSettle();
    await tester.tap(poaRow);
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.check_rounded), findsNothing);
  });
}
