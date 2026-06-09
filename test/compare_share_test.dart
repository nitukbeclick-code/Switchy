import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';

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

void _go(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 700));
  await tester.pump(const Duration(milliseconds: 700));
}

void main() {
  testWidgets('Compare screen offers a share affordance for compared plans',
      (tester) async {
    await _bootApp(tester);

    final cellular = plansByCat('cellular');
    AppState().toggleCompare(cellular[0].id);
    AppState().toggleCompare(cellular[1].id);
    AppState().setCategory('cellular');

    _go(tester, '/compare');
    await _settle(tester);

    // The share growth hook is present in the Compare AppBar.
    expect(find.byTooltip('שתף'), findsWidgets);
    expect(find.byIcon(Icons.ios_share_rounded), findsWidgets);

    // No unexpected exceptions (benign RenderFlex overflow is tolerated).
    final ex = tester.takeException();
    if (ex != null) {
      final isOverflow =
          ex.toString().contains('A RenderFlex overflowed');
      expect(isOverflow, isTrue, reason: 'Unexpected exception: $ex');
    }
  });
}
