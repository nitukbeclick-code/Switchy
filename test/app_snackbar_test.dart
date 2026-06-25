import 'package:chosech/theme/app_theme.dart';
import 'package:chosech/widgets/app_snackbar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Pumps a single button that, when tapped, fires [onTap] with a live
/// [BuildContext] that has a [ScaffoldMessenger] ancestor. The light
/// [AppTheme] tokens resolve because [AppTheme.of] follows the ambient theme.
Future<void> _pumpHarness(
  WidgetTester tester,
  void Function(BuildContext context) onTap,
) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () => onTap(context),
              child: const Text('show'),
            ),
          ),
        ),
      ),
    ),
  );
}

void main() {
  group('AppSnackBar', () {
    testWidgets('info shows the Hebrew message with no background color',
        (tester) async {
      await _pumpHarness(tester, (c) => AppSnackBar.info(c, 'הודעה'));
      await tester.tap(find.text('show'));
      await tester.pump(); // start the snackbar animation

      expect(find.text('הודעה'), findsOneWidget);
      final snack = tester.widget<SnackBar>(find.byType(SnackBar));
      expect(snack.backgroundColor, isNull); // neutral / theme default
      expect(snack.behavior, SnackBarBehavior.floating);
    });

    testWidgets('error uses AppTheme.error as the background', (tester) async {
      late Color expected;
      await _pumpHarness(tester, (c) {
        expected = AppTheme.of(c).error;
        AppSnackBar.error(c, 'שגיאה');
      });
      await tester.tap(find.text('show'));
      await tester.pump();

      expect(find.text('שגיאה'), findsOneWidget);
      final snack = tester.widget<SnackBar>(find.byType(SnackBar));
      expect(snack.backgroundColor, expected);
    });

    testWidgets('success uses AppTheme.success as the background',
        (tester) async {
      late Color expected;
      await _pumpHarness(tester, (c) {
        expected = AppTheme.of(c).success;
        AppSnackBar.success(c, 'הצלחה');
      });
      await tester.tap(find.text('show'));
      await tester.pump();

      final snack = tester.widget<SnackBar>(find.byType(SnackBar));
      expect(snack.backgroundColor, expected);
    });

    testWidgets('a passed SnackBarAction is forwarded to the SnackBar',
        (tester) async {
      final action = SnackBarAction(label: 'ביטול', onPressed: () {});
      await _pumpHarness(
        tester,
        (c) => AppSnackBar.info(c, 'עם פעולה', action: action),
      );
      await tester.tap(find.text('show'));
      await tester.pump();

      final snack = tester.widget<SnackBar>(find.byType(SnackBar));
      expect(snack.action, same(action));
      expect(find.text('ביטול'), findsOneWidget);
    });
  });
}
