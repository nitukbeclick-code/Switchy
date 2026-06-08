import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Central design tokens for the חוסך app.
///
/// This is hand-authored, idiomatic Flutter — no FlutterFlow runtime,
/// no code generation. Colors live in [AppColors]; the [AppTheme] facade
/// exposes both the palette and the type scale through a single accessor
/// (`AppTheme.of(context)`) so widgets can read tokens ergonomically.
class AppColors {
  const AppColors._();

  // Brand
  static const Color primary = Color(0xFF15603E);
  static const Color secondary = Color(0xFFC9EC4B);
  static const Color tertiary = Color(0xFF1E7A4E);

  // Surfaces
  static const Color background = Color(0xFFF4F0E8);
  static const Color secondaryBackground = Color(0xFFFEFCF8);

  // Text
  static const Color primaryText = Color(0xFF1A1816);
  static const Color secondaryText = Color(0xFF6B6760);

  // Lines & borders
  static const Color alternate = Color(0xFFE5E0D5);
  static const Color lineColor = Color(0xFFE0DBD0);

  // Status
  static const Color error = Color(0xFFC5533B);
  static const Color warning = Color(0xFFE07034);
  static const Color success = Color(0xFF15603E);
  static const Color info = Color(0xFF3B82F6);

  // Surface tints
  static const Color accent1 = Color(0xFFE8F5EE);
  static const Color accent2 = Color(0xFFFFF8E7);
  static const Color accent3 = Color(0xFFFFECE6);
  static const Color accent4 = Color(0xFFEEF6FF);
}

/// Ergonomic accessor over [AppColors] and the type scale.
///
/// Kept as a lightweight singleton — the design system is static, so there is
/// no per-context state to thread. Call sites use `AppTheme.of(context)` for
/// readability and so a future theming change has a single seam to hook into.
class AppTheme {
  const AppTheme._();
  static const AppTheme _instance = AppTheme._();
  static AppTheme of(BuildContext context) => _instance;

  // Palette
  Color get primary => AppColors.primary;
  Color get secondary => AppColors.secondary;
  Color get tertiary => AppColors.tertiary;
  Color get background => AppColors.background;
  Color get secondaryBackground => AppColors.secondaryBackground;
  Color get primaryText => AppColors.primaryText;
  Color get secondaryText => AppColors.secondaryText;
  Color get alternate => AppColors.alternate;
  Color get lineColor => AppColors.lineColor;
  Color get error => AppColors.error;
  Color get warning => AppColors.warning;
  Color get success => AppColors.success;
  Color get info => AppColors.info;
  Color get white => Colors.white;
  Color get accent1 => AppColors.accent1;
  Color get accent2 => AppColors.accent2;
  Color get accent3 => AppColors.accent3;
  Color get accent4 => AppColors.accent4;

  // Display — Rubik, tight tracking for big numerals & hero headings
  TextStyle get displayLarge => GoogleFonts.rubik(fontSize: 52, fontWeight: FontWeight.w800, letterSpacing: -0.04, color: AppColors.primaryText);
  TextStyle get displayMedium => GoogleFonts.rubik(fontSize: 40, fontWeight: FontWeight.w800, letterSpacing: -0.03, color: AppColors.primaryText);
  TextStyle get displaySmall => GoogleFonts.rubik(fontSize: 32, fontWeight: FontWeight.w800, letterSpacing: -0.02, color: AppColors.primaryText);

  // Headlines
  TextStyle get headlineLarge => GoogleFonts.rubik(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.02, color: AppColors.primaryText);
  TextStyle get headlineMedium => GoogleFonts.rubik(fontSize: 24, fontWeight: FontWeight.w700, letterSpacing: -0.01, color: AppColors.primaryText);
  TextStyle get headlineSmall => GoogleFonts.rubik(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.01, color: AppColors.primaryText);

  // Titles
  TextStyle get titleLarge => GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.primaryText);
  TextStyle get titleMedium => GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.primaryText);
  TextStyle get titleSmall => GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.primaryText);

  // Body — Assistant, the Hebrew-first reading face
  TextStyle get bodyLarge => GoogleFonts.assistant(fontSize: 16, fontWeight: FontWeight.w500, color: AppColors.primaryText);
  TextStyle get bodyMedium => GoogleFonts.assistant(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.primaryText);
  TextStyle get bodySmall => GoogleFonts.assistant(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.secondaryText);

  // Labels
  TextStyle get labelLarge => GoogleFonts.assistant(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.primaryText);
  TextStyle get labelMedium => GoogleFonts.assistant(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.secondaryText);
  TextStyle get labelSmall => GoogleFonts.assistant(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.secondaryText);
}
