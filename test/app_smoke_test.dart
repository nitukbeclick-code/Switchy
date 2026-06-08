import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';

/// Boots the full application widget tree (MaterialApp.router + the whole
/// go_router graph + Provider<AppState>) and asserts it builds without throwing.
/// Uses a fixed pump (not pumpAndSettle) because the app has repeating
/// animations that never settle.
void main() {
  testWidgets('app boots to a screen without exceptions', (tester) async {
    // Avoid network font fetches in the test sandbox.
    GoogleFonts.config.allowRuntimeFetching = false;
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
    await AppState().initializePersistedState();

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: AppState(),
        child: const ChosechApp(),
      ),
    );
    await tester.pump(const Duration(milliseconds: 150));

    expect(tester.takeException(), isNull);
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
