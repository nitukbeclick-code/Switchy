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

  // Brand — "white glass & soft teal": a deep teal core + a darker base for
  // gradient depth, a brighter teal, a soft-aqua highlight (replaces the harsh
  // lime), and a muted teal-grey sage.
  static const Color primary = Color(0xFF0F766E); // deep teal — CTAs, key accents
  static const Color primaryDark = Color(0xFF134E4A); // depth / gradient base
  static const Color tertiary = Color(0xFF14B8A6); // brighter teal
  static const Color secondary = Color(0xFF5EEAD4); // soft aqua highlight
  static const Color sage = Color(0xFF5E8B84); // muted teal-grey for icons/accents

  // Surfaces — cool glass white (no longer warm cream); pure-white card surface.
  static const Color background = Color(0xFFF6F8F9);
  static const Color secondaryBackground = Color(0xFFFFFFFF);

  // Text — cool ink on glass white.
  static const Color primaryText = Color(0xFF0F1B22);
  static const Color secondaryText = Color(0xFF5A6670);

  // Lines & borders — cool, airy hairlines.
  static const Color alternate = Color(0xFFE4EAEE);
  static const Color lineColor = Color(0xFFE7EDF1);

  // Status
  static const Color error = Color(0xFFE5484D);
  static const Color warning = Color(0xFFE0850B);
  static const Color success = Color(0xFF0F766E);
  static const Color info = Color(0xFF3B82F6);

  // Surface tints — soft, airy washes for tinted cards/chips.
  static const Color accent1 = Color(0xFFDFF6F2); // soft teal tint
  static const Color accent2 = Color(0xFFEEF3F6); // cool neutral tint
  static const Color accent3 = Color(0xFFEFF4F7); // cool neutral tint
  static const Color accent4 = Color(0xFFE5F0F3); // soft sky tint
  static const Color mint = Color(0xFFDFF6F2); // alias for accent1, semantic
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

  // ── Elevation — soft, layered, cool ink-tinted shadows (not flat black) ─────
  /// Subtle lift for chips, list rows, low-emphasis surfaces.
  List<BoxShadow> get shadowSoft => const [
        BoxShadow(color: Color(0x0F0F1B22), blurRadius: 14, offset: Offset(0, 4)),
      ];

  /// The default card shadow — gentle, cool, two-layer.
  List<BoxShadow> get shadowCard => const [
        BoxShadow(color: Color(0x140F1B22), blurRadius: 24, offset: Offset(0, 8)),
        BoxShadow(color: Color(0x0A0F1B22), blurRadius: 6, offset: Offset(0, 2)),
      ];

  /// Pronounced lift for heroes, FABs, modals.
  List<BoxShadow> get shadowLifted => const [
        BoxShadow(color: Color(0x1F0F1B22), blurRadius: 40, offset: Offset(0, 16)),
      ];

  /// A teal glow for the primary CTA so it reads "tap me".
  List<BoxShadow> get shadowPrimary => const [
        BoxShadow(color: Color(0x330F766E), blurRadius: 20, offset: Offset(0, 8)),
      ];

  /// A soft, diffuse, neutral shadow for frosted-glass surfaces.
  List<BoxShadow> get shadowGlass => const [
        BoxShadow(color: Color(0x12000000), blurRadius: 30, offset: Offset(0, 10)),
      ];

  /// The "soft glass" look for cards without live blur (performant): a
  /// translucent white fill, a hairline border, and [shadowGlass]. Use this for
  /// list cards; reserve real [BackdropFilter] blur (see [GlassPanel]) for a few
  /// high-value surfaces (bottom nav, sticky headers, modals, hero overlays).
  BoxDecoration glassDecoration({double alpha = 0.66, Color? tint, double? radius}) =>
      BoxDecoration(
        color: (tint ?? Colors.white).withValues(alpha: alpha),
        borderRadius: BorderRadius.circular(radius ?? radiusLg),
        border: Border.all(color: Colors.white.withValues(alpha: 0.55)),
        boxShadow: shadowGlass,
      );

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
