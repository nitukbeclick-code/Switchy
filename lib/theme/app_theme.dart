import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

// Shared radius constants used by both ThemeData builders.
const double _radiusMd = 16;
const double _radiusLg = 20;
const double _radiusXl = 28;

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

  // Refined accent system — colour used with intent over the ink/glass base.
  // brandAccent (indigo) = ACTION: primary CTAs, active states, links, focus.
  // saving (amber) = VALUE: savings figures, "best value", win states.
  // Provider/carrier brand colours are separate and never use these.
  static const Color brandAccent = Color(0xFF4F46E5); // indigo 600
  static const Color brandAccentDark = Color(0xFF3730A3); // indigo 800 (gradient depth)
  static const Color brandAccentTint = Color(0xFFEEF0FB); // light indigo surface
  static const Color saving = Color(0xFFF59E0B); // amber 500
  static const Color savingDark = Color(0xFFD97706); // amber 600
}

/// Ergonomic accessor over [AppColors] and the type scale.
///
/// Kept as a lightweight singleton — the design system is static, so there is
/// no per-context state to thread. Call sites use `AppTheme.of(context)` for
/// readability and so a future theming change has a single seam to hook into.
class AppTheme {
  const AppTheme._(this.dark);

  /// Whether this instance resolves dark-mode token values. Set by [of] from the
  /// ambient [Theme]'s brightness, so a single seam (`AppTheme.of(context).*`)
  /// drives every widget token in both themes — no per-call-site `if (dark)`.
  final bool dark;

  static const AppTheme _light = AppTheme._(false);
  static const AppTheme _dark = AppTheme._(true);

  /// Resolves the palette for the ambient brightness. MaterialApp's
  /// `themeMode`/`darkTheme` already flip [Theme]'s brightness; this makes the
  /// app's own widget tokens follow suit.
  static AppTheme of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? _dark : _light;

  // Palette — surface/text/border tokens flip; accents lift slightly on dark.
  // Ink CTA fills route through AppButton's gradient, so `primary` maps to the
  // on-surface ink (near-white on dark) for its text/icon/border roles.
  Color get primary => dark ? const Color(0xFFF5F7F8) : AppColors.primary;
  Color get secondary => dark ? const Color(0xFF2A3442) : AppColors.secondary;
  Color get tertiary => dark ? const Color(0xFF9AA5B1) : AppColors.tertiary;
  Color get background => dark ? const Color(0xFF0B0F14) : AppColors.background;
  Color get secondaryBackground => dark ? const Color(0xFF161C24) : AppColors.secondaryBackground;
  Color get primaryText => dark ? const Color(0xFFF5F7F8) : AppColors.primaryText;
  Color get secondaryText => dark ? const Color(0xFF9AA5B1) : AppColors.secondaryText;
  Color get alternate => dark ? const Color(0xFF2E3845) : AppColors.alternate;
  Color get lineColor => dark ? const Color(0xFF232B36) : AppColors.lineColor;
  Color get error => dark ? const Color(0xFFF87171) : AppColors.error;
  Color get warning => dark ? const Color(0xFFFBBF24) : AppColors.warning;
  Color get success => dark ? const Color(0xFFF5F7F8) : AppColors.success;
  Color get info => dark ? const Color(0xFF9AA5B1) : AppColors.info;
  Color get white => Colors.white;
  Color get primaryDark => AppColors.primaryDark;
  Color get sage => dark ? const Color(0xFF8A95A3) : AppColors.sage;
  Color get mint => dark ? const Color(0xFF1A2030) : AppColors.mint;
  Color get accent1 => dark ? const Color(0xFF1A2030) : AppColors.accent1;
  Color get accent2 => dark ? const Color(0xFF1C2332) : AppColors.accent2;
  Color get accent3 => dark ? const Color(0xFF1A2030) : AppColors.accent3;
  Color get accent4 => dark ? const Color(0xFF1C2230) : AppColors.accent4;

  // Accent system — indigo (action) + amber (value) lift for dark contrast.
  Color get brandAccent => dark ? const Color(0xFF6366F1) : AppColors.brandAccent;
  Color get brandAccentTint => dark ? const Color(0xFF1E2138) : AppColors.brandAccentTint;
  Color get saving => dark ? const Color(0xFFFBBF24) : AppColors.saving;
  Color get savingDark => dark ? const Color(0xFFF59E0B) : AppColors.savingDark;

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

  /// An indigo glow under the accent (CTA) gradient so it reads tappable.
  List<BoxShadow> get shadowAccent => const [
        BoxShadow(color: Color(0x4D4F46E5), blurRadius: 22, offset: Offset(0, 8)),
        BoxShadow(color: Color(0x263730A3), blurRadius: 6, offset: Offset(0, 2)),
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
        color: (tint ?? (dark ? const Color(0xFF161C24) : Colors.white))
            .withValues(alpha: dark ? 0.86 : alpha),
        borderRadius: BorderRadius.circular(radius ?? radiusLg),
        border: Border.all(
            color: dark ? const Color(0xFF2E3845) : Colors.white.withValues(alpha: 0.55)),
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

  /// The indigo ACTION gradient — primary CTAs. The single splash of colour
  /// that guides the eye through the conversion flow over the ink/glass base.
  LinearGradient get accentGradient => const LinearGradient(
        colors: [AppColors.brandAccent, AppColors.brandAccentDark],
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
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
  LinearGradient get surfaceWash => dark
      ? const LinearGradient(
          colors: [Color(0xFF0E131A), Color(0xFF0B0F14)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        )
      : const LinearGradient(
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
  // Each getter is byte-identical in light; in dark it overrides only the color
  // to the brightness-aware on-surface token (the font face stays memoized).
  TextStyle get displayLarge => dark ? _displayLarge.copyWith(color: primaryText) : _displayLarge;
  TextStyle get displayMedium => dark ? _displayMedium.copyWith(color: primaryText) : _displayMedium;
  TextStyle get displaySmall => dark ? _displaySmall.copyWith(color: primaryText) : _displaySmall;

  // Headlines
  static final TextStyle _headlineLarge = GoogleFonts.rubik(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.02, color: AppColors.primaryText);
  static final TextStyle _headlineMedium = GoogleFonts.rubik(fontSize: 24, fontWeight: FontWeight.w700, letterSpacing: -0.01, color: AppColors.primaryText);
  static final TextStyle _headlineSmall = GoogleFonts.rubik(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.01, color: AppColors.primaryText);
  TextStyle get headlineLarge => dark ? _headlineLarge.copyWith(color: primaryText) : _headlineLarge;
  TextStyle get headlineMedium => dark ? _headlineMedium.copyWith(color: primaryText) : _headlineMedium;
  TextStyle get headlineSmall => dark ? _headlineSmall.copyWith(color: primaryText) : _headlineSmall;

  // Titles
  static final TextStyle _titleLarge = GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.primaryText);
  static final TextStyle _titleMedium = GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.primaryText);
  static final TextStyle _titleSmall = GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.primaryText);
  TextStyle get titleLarge => dark ? _titleLarge.copyWith(color: primaryText) : _titleLarge;
  TextStyle get titleMedium => dark ? _titleMedium.copyWith(color: primaryText) : _titleMedium;
  TextStyle get titleSmall => dark ? _titleSmall.copyWith(color: primaryText) : _titleSmall;

  // Body — Assistant, the Hebrew-first reading face
  static final TextStyle _bodyLarge = GoogleFonts.assistant(fontSize: 16, fontWeight: FontWeight.w500, color: AppColors.primaryText);
  static final TextStyle _bodyMedium = GoogleFonts.assistant(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.primaryText);
  static final TextStyle _bodySmall = GoogleFonts.assistant(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.secondaryText);
  TextStyle get bodyLarge => dark ? _bodyLarge.copyWith(color: primaryText) : _bodyLarge;
  TextStyle get bodyMedium => dark ? _bodyMedium.copyWith(color: primaryText) : _bodyMedium;
  TextStyle get bodySmall => dark ? _bodySmall.copyWith(color: secondaryText) : _bodySmall;

  // Labels
  static final TextStyle _labelLarge = GoogleFonts.assistant(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.primaryText);
  static final TextStyle _labelMedium = GoogleFonts.assistant(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.secondaryText);
  static final TextStyle _labelSmall = GoogleFonts.assistant(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.secondaryText);
  TextStyle get labelLarge => dark ? _labelLarge.copyWith(color: primaryText) : _labelLarge;
  TextStyle get labelMedium => dark ? _labelMedium.copyWith(color: secondaryText) : _labelMedium;
  TextStyle get labelSmall => dark ? _labelSmall.copyWith(color: secondaryText) : _labelSmall;

  // ── ThemeData factories ─────────────────────────────────────────────────────
  // These produce MaterialApp theme/darkTheme values.  Widget-level tokens
  // (AppTheme.of(context).*) remain the single source of truth for colours and
  // text styles inside widgets; these factories only set the Material defaults
  // so that system widgets (dialogs, snackbars, inputs) inherit sensible values.

  /// Dark theme — ink #0B0F14 background, glass-white surfaces, indigo accent.
  static ThemeData darkThemeData() {
    const Color bg = Color(0xFF0B0F14);
    const Color surface = Color(0xFF161C24);
    const Color onSurface = Color(0xFFF5F7F8);
    const Color border = Color(0xFF222A35);
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      fontFamily: GoogleFonts.assistant().fontFamily,
    );
    return base.copyWith(
      colorScheme: const ColorScheme.dark(
        primary: AppColors.brandAccent,
        secondary: AppColors.saving,
        surface: surface,
        onSurface: onSurface,
        error: AppColors.error,
      ),
      scaffoldBackgroundColor: bg,
      canvasColor: bg,
      textTheme: GoogleFonts.assistantTextTheme(base.textTheme.apply(bodyColor: onSurface, displayColor: onSurface)),
      appBarTheme: AppBarTheme(
        backgroundColor: bg,
        foregroundColor: onSurface,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700, color: onSurface),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(_radiusLg),
          side: const BorderSide(color: border),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(_radiusXl)),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(_radiusXl)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: surface,
        contentTextStyle: GoogleFonts.assistant(color: onSurface),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(_radiusMd)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radiusMd),
          borderSide: const BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radiusMd),
          borderSide: const BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radiusMd),
          borderSide: const BorderSide(color: AppColors.brandAccent, width: 1.5),
        ),
      ),
      dividerTheme: const DividerThemeData(color: border, thickness: 1),
      iconTheme: const IconThemeData(color: onSurface),
    );
  }

  /// Light theme — glass-white #F5F7F8 background, white cards, indigo accent.
  static ThemeData lightThemeData() {
    const Color bg = Color(0xFFF5F7F8);
    const Color surface = Color(0xFFFFFFFF);
    const Color onSurface = Color(0xFF0B0F14);
    const Color border = Color(0xFFD1D5DB);
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      fontFamily: GoogleFonts.assistant().fontFamily,
    );
    return base.copyWith(
      colorScheme: const ColorScheme.light(
        primary: AppColors.brandAccent,
        secondary: AppColors.saving,
        surface: surface,
        onSurface: onSurface,
        error: AppColors.error,
      ),
      scaffoldBackgroundColor: bg,
      canvasColor: bg,
      textTheme: GoogleFonts.assistantTextTheme(base.textTheme.apply(bodyColor: onSurface, displayColor: onSurface)),
      appBarTheme: AppBarTheme(
        backgroundColor: bg,
        foregroundColor: onSurface,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700, color: onSurface),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(_radiusLg),
          side: const BorderSide(color: border),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(_radiusXl)),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(_radiusXl)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: surface,
        contentTextStyle: GoogleFonts.assistant(color: onSurface),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(_radiusMd)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radiusMd),
          borderSide: const BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radiusMd),
          borderSide: const BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radiusMd),
          borderSide: const BorderSide(color: AppColors.brandAccent, width: 1.5),
        ),
      ),
      dividerTheme: const DividerThemeData(color: border, thickness: 1),
      iconTheme: const IconThemeData(color: onSurface),
    );
  }
}
