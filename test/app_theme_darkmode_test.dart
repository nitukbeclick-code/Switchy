import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/theme/app_theme.dart';

// Pins the dark-mode keystone: AppTheme.of(context) resolves the palette from
// the ambient Theme brightness, so the same ffTheme.* token call flips between
// the light and dark values. Light values stay byte-identical to before.

Future<AppTheme> _resolve(WidgetTester tester, ThemeMode mode) async {
  late AppTheme t;
  await tester.pumpWidget(MaterialApp(
    theme: AppTheme.lightThemeData(),
    darkTheme: AppTheme.darkThemeData(),
    themeMode: mode,
    home: Builder(builder: (c) {
      t = AppTheme.of(c);
      return const SizedBox.shrink();
    }),
  ));
  // Settle the theme transition so a second pump (light→dark over reused
  // elements) captures the final brightness, not the in-flight one.
  await tester.pumpAndSettle();
  return t;
}

void main() {
  testWidgets('light theme → light tokens (unchanged)', (tester) async {
    final t = await _resolve(tester, ThemeMode.light);
    expect(t.dark, isFalse);
    expect(t.background, const Color(0xFFF5F7F8));
    expect(t.secondaryBackground, const Color(0xFFFFFFFF));
    expect(t.primaryText, const Color(0xFF0B0F14));
    expect(t.brandAccent, const Color(0xFF4F46E5)); // indigo unchanged in light
    expect(t.saving, const Color(0xFFF59E0B)); // amber unchanged in light
  });

  testWidgets('dark theme → inverted surfaces + lifted accents', (tester) async {
    final t = await _resolve(tester, ThemeMode.dark);
    expect(t.dark, isTrue);
    expect(t.background, const Color(0xFF0B0F14)); // glass-white → near-black
    expect(t.secondaryBackground, const Color(0xFF161C24)); // white card → dark surface
    expect(t.primaryText, const Color(0xFFF5F7F8)); // ink text → near-white
    expect(t.brandAccent, const Color(0xFF6366F1)); // indigo lifts for dark contrast
    expect(t.saving, const Color(0xFFFBBF24)); // amber lifts
  });

  testWidgets('text styles invert their colour with brightness', (tester) async {
    final light = await _resolve(tester, ThemeMode.light);
    final dark = await _resolve(tester, ThemeMode.dark);
    expect(light.titleLarge.color, const Color(0xFF0B0F14));
    expect(dark.titleLarge.color, const Color(0xFFF5F7F8));
    // font face/size preserved across the flip
    expect(dark.titleLarge.fontSize, light.titleLarge.fontSize);
    expect(dark.titleLarge.fontFamily, light.titleLarge.fontFamily);
  });
}
