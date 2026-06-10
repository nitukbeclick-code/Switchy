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

  // Brand — "natural & fresh": the core green + a deep base for gradients/depth,
  // a brighter leaf green, the lime highlight, and a soft sage for organic accents.
  static const Color primary = Color(0xFF15603E);
  static const Color primaryDark = Color(0xFF0E3A26); // depth / gradient base
  static const Color tertiary = Color(0xFF1E8A57); // brighter leaf green
  static const Color secondary = Color(0xFFC9EC4B); // lime highlight
  static const Color sage = Color(0xFF4E8568); // muted green for icons/accents

  // Surfaces — warm cream stays; the card surface is a touch brighter for air.
  static const Color background = Color(0xFFF4F0E8);
  static const Color secondaryBackground = Color(0xFFFFFEFB);

  // Text — warm near-black on cream.
  static const Color primaryText = Color(0xFF1A1816);
  static const Color secondaryText = Color(0xFF6B6760);

  // Lines & borders — lighter, airier hairlines.
  static const Color alternate = Color(0xFFE8E3D8);
  static const Color lineColor = Color(0xFFEAE5DB);

  // Status
  static const Color error = Color(0xFFC5533B);
  static const Color warning = Color(0xFFE07034);
  static const Color success = Color(0xFF15603E);
  static const Color info = Color(0xFF3B82F6);

  // Surface tints — soft, airy washes for tinted cards/chips.
  static const Color accent1 = Color(0xFFE3F3E9); // fresh mint (green)
  static const Color accent2 = Color(0xFFFBF3E0); // warm sand
  static const Color accent3 = Color(0xFFFBEDE6); // soft peach
  static const Color accent4 = Color(0xFFE9F1F6); // calm sky
  static const Color mint = Color(0xFFE3F3E9); // alias for accent1, semantic
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
  Color get primaryDark => AppColors.primaryDark;
  Color get sage => AppColors.sage;
  Color get mint => AppColors.mint;
  Color get accent1 => AppColors.accent1;
  Color get accent2 => AppColors.accent2;
  Color get accent3 => AppColors.accent3;
  Color get accent4 => AppColors.accent4;

  // ── Elevation — soft, layered, green-tinted shadows (not flat black) ────────
  /// Subtle lift for chips, list rows, low-emphasis surfaces.
  List<BoxShadow> get shadowSoft => const [
        BoxShadow(color: Color(0x0F15603E), blurRadius: 14, offset: Offset(0, 4)),
      ];

  /// The default card shadow — gentle, warm, two-layer.
  List<BoxShadow> get shadowCard => const [
        BoxShadow(color: Color(0x140E3A26), blurRadius: 24, offset: Offset(0, 8)),
        BoxShadow(color: Color(0x0A0E3A26), blurRadius: 6, offset: Offset(0, 2)),
      ];

  /// Pronounced lift for heroes, FABs, modals.
  List<BoxShadow> get shadowLifted => const [
        BoxShadow(color: Color(0x1F0E3A26), blurRadius: 40, offset: Offset(0, 16)),
      ];

  /// A lime glow for the primary CTA so it reads "tap me".
  List<BoxShadow> get shadowPrimary => const [
        BoxShadow(color: Color(0x4015603E), blurRadius: 20, offset: Offset(0, 8)),
      ];

  // ── Gradients — the brand washes used on heroes, headers, primary CTAs ──────
  LinearGradient get brandGradient => const LinearGradient(
        colors: [AppColors.primaryDark, AppColors.primary],
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
      );

  /// A fresh green→leaf wash for lighter hero surfaces.
  LinearGradient get freshGradient => const LinearGradient(
        colors: [AppColors.primary, AppColors.tertiary],
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
      );

  /// The energetic green→lime accent, for highlight ribbons and badges.
  LinearGradient get limeGradient => const LinearGradient(
        colors: [AppColors.tertiary, AppColors.secondary],
        begin: Alignment.centerRight,
        end: Alignment.centerLeft,
      );

  // ── Radii — one friendly, generous rounding scale ───────────────────────────
  double get radiusXs => 10; // small chips/flags
  double get radiusSm => 12;
  double get radiusMd => 16;
  double get radiusLg => 20;
  double get radiusXl => 28;
  double get radiusPill => 999;

  // Type scale — each style resolves its GoogleFonts face exactly once and is
  // then cached. The getters previously called GoogleFonts.rubik()/assistant()
  // on *every* access, so a hot screen re-allocated dozens of identical styles
  // per build; memoizing keeps the call sites unchanged while removing that
  // per-build allocation churn. Call sites still read e.g.
  // `AppTheme.of(context).titleLarge.copyWith(...)`.

  // Display — Rubik, tight tracking for big numerals & hero headings
  static final TextStyle _displayLarge = GoogleFonts.rubik(fontSize: 52, fontWeight: FontWeight.w800, letterSpacing: -0.04, color: AppColors.primaryText);
  static final TextStyle _displayMedium = GoogleFonts.rubik(fontSize: 40, fontWeight: FontWeight.w800, letterSpacing: -0.03, color: AppColors.primaryText);
  static final TextStyle _displaySmall = GoogleFonts.rubik(fontSize: 32, fontWeight: FontWeight.w800, letterSpacing: -0.02, color: AppColors.primaryText);
  TextStyle get displayLarge => _displayLarge;
  TextStyle get displayMedium => _displayMedium;
  TextStyle get displaySmall => _displaySmall;

  // Headlines
  static final TextStyle _headlineLarge = GoogleFonts.rubik(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.02, color: AppColors.primaryText);
  static final TextStyle _headlineMedium = GoogleFonts.rubik(fontSize: 24, fontWeight: FontWeight.w700, letterSpacing: -0.01, color: AppColors.primaryText);
  static final TextStyle _headlineSmall = GoogleFonts.rubik(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.01, color: AppColors.primaryText);
  TextStyle get headlineLarge => _headlineLarge;
  TextStyle get headlineMedium => _headlineMedium;
  TextStyle get headlineSmall => _headlineSmall;

  // Titles
  static final TextStyle _titleLarge = GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.primaryText);
  static final TextStyle _titleMedium = GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.primaryText);
  static final TextStyle _titleSmall = GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.primaryText);
  TextStyle get titleLarge => _titleLarge;
  TextStyle get titleMedium => _titleMedium;
  TextStyle get titleSmall => _titleSmall;

  // Body — Assistant, the Hebrew-first reading face
  static final TextStyle _bodyLarge = GoogleFonts.assistant(fontSize: 16, fontWeight: FontWeight.w500, color: AppColors.primaryText);
  static final TextStyle _bodyMedium = GoogleFonts.assistant(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.primaryText);
  static final TextStyle _bodySmall = GoogleFonts.assistant(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.secondaryText);
  TextStyle get bodyLarge => _bodyLarge;
  TextStyle get bodyMedium => _bodyMedium;
  TextStyle get bodySmall => _bodySmall;

  // Labels
  static final TextStyle _labelLarge = GoogleFonts.assistant(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.primaryText);
  static final TextStyle _labelMedium = GoogleFonts.assistant(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.secondaryText);
  static final TextStyle _labelSmall = GoogleFonts.assistant(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.secondaryText);
  TextStyle get labelLarge => _labelLarge;
  TextStyle get labelMedium => _labelMedium;
  TextStyle get labelSmall => _labelSmall;
}
