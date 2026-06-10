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

  // Brand — "white glass & black ink": a formal, editorial monochrome. Ink
  // black for CTAs/accents, true black for depth, slate + grey neutrals. NO
  // green/teal — the look is sharp, official, high-contrast.
  static const Color primary = Color(0xFF111827); // ink black — CTAs, key accents, borders
  static const Color primaryDark = Color(0xFF000000); // true black — gradient depth
  static const Color tertiary = Color(0xFF374151); // slate grey
  static const Color secondary = Color(0xFFE5E7EB); // light-grey highlight (badges/chips)
  static const Color sage = Color(0xFF6B7280); // muted grey for icons/accents

  // Surfaces — cool glass white; pure-white card surface.
  static const Color background = Color(0xFFF5F7F8);
  static const Color secondaryBackground = Color(0xFFFFFFFF);

  // Text — near-black ink on glass white.
  static const Color primaryText = Color(0xFF0B0F14);
  static const Color secondaryText = Color(0xFF4B5563);

  // Lines & borders — crisp, formal dark borders + a subtle inner hairline.
  static const Color alternate = Color(0xFF222A35); // formal near-black border
  static const Color lineColor = Color(0xFFE4E8EC); // subtle inner divider

  // Status (kept functional — errors/warnings still need their semantic hue)
  static const Color error = Color(0xFFDC2626);
  static const Color warning = Color(0xFFB45309);
  static const Color success = Color(0xFF111827); // formal: success reads as ink, not green
  static const Color info = Color(0xFF374151);

  // Surface tints — neutral grey washes for tinted cards/chips (no color).
  static const Color accent1 = Color(0xFFF0F2F4);
  static const Color accent2 = Color(0xFFF2F4F6);
  static const Color accent3 = Color(0xFFEEF0F3);
  static const Color accent4 = Color(0xFFF0F3F5);
  static const Color mint = Color(0xFFF0F2F4); // alias for accent1, semantic
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

  /// A soft ink shadow under the primary (black) CTA so it reads "tap me".
  List<BoxShadow> get shadowPrimary => const [
        BoxShadow(color: Color(0x26111827), blurRadius: 20, offset: Offset(0, 8)),
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

  /// An ink→slate wash for lighter hero surfaces.
  LinearGradient get freshGradient => const LinearGradient(
        colors: [AppColors.primary, AppColors.tertiary],
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
      );

  /// A subtle slate→grey accent, for highlight ribbons and badges.
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

  // ── Motion — one shared vocabulary of durations + curves ────────────────────
  // Centralised so every screen animates with the same cadence: quick for taps,
  // medium for reveals, slow for hero/page transitions. [spring] gives a subtle
  // overshoot for tactile press/scale; [emphasized] is the smooth decel curve.
  Duration get motionFast => const Duration(milliseconds: 180);
  Duration get motionMedium => const Duration(milliseconds: 320);
  Duration get motionSlow => const Duration(milliseconds: 560);
  Curve get easeOut => const Cubic(0.22, 1, 0.36, 1); // matches the site --ease
  Curve get spring => const Cubic(0.34, 1.56, 0.64, 1); // gentle overshoot
  Curve get emphasized => Curves.easeOutCubic;
  /// The scale a surface shrinks to while pressed (tactile feedback).
  double get pressScale => 0.97;

  /// A faint top-to-bottom glass wash for full-screen scaffolds — lifts plain
  /// backgrounds off flat white without introducing any colour.
  LinearGradient get surfaceWash => const LinearGradient(
        colors: [Color(0xFFF7F9FA), Color(0xFFF1F4F6)],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      );

  // Type scale — each style resolves its GoogleFonts face exactly once and is
  // then cached. The getters previously called GoogleFonts.rubik()/assistant()
  // on *every* access, so a hot screen re-allocated dozens of identical styles
  // per build; memoizing keeps the call sites unchanged while removing that
  // per-build allocation churn. Call sites still read e.g.
  // `AppTheme.of(context).titleLarge.copyWith(...)`.

  // Display — Rubik, heavy weight + tight tracking for big numerals & hero
  // headings (the brand's "exaggerated minimalism": oversized, confident type).
  static final TextStyle _displayLarge = GoogleFonts.rubik(fontSize: 58, fontWeight: FontWeight.w900, letterSpacing: -0.05, height: 1.02, color: AppColors.primaryText);
  static final TextStyle _displayMedium = GoogleFonts.rubik(fontSize: 44, fontWeight: FontWeight.w900, letterSpacing: -0.04, height: 1.03, color: AppColors.primaryText);
  static final TextStyle _displaySmall = GoogleFonts.rubik(fontSize: 35, fontWeight: FontWeight.w900, letterSpacing: -0.03, height: 1.05, color: AppColors.primaryText);
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
