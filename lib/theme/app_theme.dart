import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Central design tokens for the Switchy AI app.
///
/// This is hand-authored, idiomatic Flutter — no FlutterFlow runtime,
/// no code generation. Colors live in [AppColors]; the [AppTheme] facade
/// exposes both the palette and the type scale through a single accessor
/// (`AppTheme.of(context)`) so widgets can read tokens ergonomically.
class AppColors {
  const AppColors._();

  // Brand — "white glass & black ink": a formal, editorial base of ink black
  // for text/structure/borders, true black for depth, slate + grey neutrals.
  // Colour is carried by a disciplined two-accent system layered on top —
  // green = ACTION, amber = VALUE (see the accent block below); the ink/glass
  // base stays monochrome so those accents read clearly.
  static const Color primary = Color(0xFF111827); // ink black — text, structure, borders
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
  static const Color success = Color(0xFF111827); // neutral ink base; the green ACTION accent (brandAccent) carries positive emphasis
  static const Color info = Color(0xFF374151);

  // Surface tints — neutral grey washes for tinted cards/chips (no color).
  static const Color accent1 = Color(0xFFF0F2F4);
  static const Color accent2 = Color(0xFFF2F4F6);
  static const Color accent3 = Color(0xFFEEF0F3);
  static const Color accent4 = Color(0xFFF0F3F5);
  static const Color mint = Color(0xFFF0F2F4); // alias for accent1, semantic

  // Refined accent system — colour used with intent over the ink/glass base.
  // brandAccent (green) = ACTION: primary CTAs, active states, links, focus.
  // Matches the Switchy logo. saving (amber) = VALUE: savings figures,
  // "best value", win states. Provider/carrier brand colours are separate and
  // never use these.
  static const Color brandAccent = Color(0xFF16A34A); // green 600
  static const Color brandAccentDark = Color(0xFF15803D); // green 700 (gradient depth)
  static const Color brandAccentTint = Color(0xFFDCFCE7); // light green surface
  // AA-safe ink for green TEXT/links on light glass. The fill hue (#16A34A)
  // only reaches ~3:1 as small text — green 700 clears 4.5:1 on white, the
  // tint chip, and the glass bg while still reading as the same brand green.
  static const Color brandAccentText = Color(0xFF15803D); // green 700 — small-text/link
  static const Color saving = Color(0xFFF59E0B); // amber 500
  static const Color savingDark = Color(0xFFD97706); // amber 600
  // AA-safe ink for amber VALUE TEXT on light glass. Amber 500/600 fail 4.5:1
  // as normal text; amber 800 clears it while keeping the warm "value" read.
  static const Color savingText = Color(0xFF92400E); // amber 800 — small savings text
  // The ink read out ON the amber VALUE fill (savings pills, "best value"
  // badges). A deep amber-brown that clears AA on the amber surface in BOTH
  // themes (amber is a fixed-hue accent), so it never needs a dark variant.
  // The canonical "ink-on-amber" pair — use everywhere a chip/badge fills with
  // [saving] and prints text/icons on top, instead of re-declaring the literal.
  static const Color onSaving = Color(0xFF3A2900);

  // ── Dark variant ──────────────────────────────────────────────────────────
  // NOT a colour flip — a cohesive night theme. Deep blue-ink surfaces, slate
  // cards, off-white ink, and accents lifted so green/amber stay vivid on dark.
  // Brand identity is preserved: the SAME green/amber, just at a brighter tint
  // that holds contrast against the dark surface.
  static const Color darkBackground = Color(0xFF0F1419); // app canvas
  static const Color darkSurface = Color(0xFF141A23); // raised scaffolds/sheets
  static const Color darkCard = Color(0xFF1A1F2B); // slate card surface
  static const Color darkCardHi = Color(0xFF222A38); // hover/raised card
  static const Color darkPrimaryText = Color(0xFFF0F2F4); // off-white ink
  static const Color darkSecondaryText = Color(0xFF9BA6B4); // muted slate ink
  static const Color darkBorder = Color(0xFF2A3442); // hairline on dark
  static const Color darkLine = Color(0xFF232C38); // subtle inner divider
  // Accents lifted for dark: brighter green/amber keep AA contrast on slate.
  static const Color darkBrandAccent = Color(0xFF4ADE80); // green 400
  static const Color darkBrandAccentDark = Color(0xFF22C55E); // green 500
  static const Color darkBrandAccentTint = Color(0xFF14301F); // deep green wash
  static const Color darkSaving = Color(0xFFFBBF24); // amber 400
  static const Color darkSavingDark = Color(0xFFF59E0B); // amber 500
  // Surface tints on dark — faint slate washes for tinted chips/cards.
  static const Color darkAccent1 = Color(0xFF1C2330);
  static const Color darkError = Color(0xFFF87171); // red 400, lifted
  static const Color darkWarning = Color(0xFFFBBF24);
}

/// Ergonomic accessor over [AppColors] and the type scale.
///
/// Kept as a lightweight singleton — the design system is static, so there is
/// no per-context state to thread. Call sites use `AppTheme.of(context)` for
/// readability and so a future theming change has a single seam to hook into.
class AppTheme {
  const AppTheme._({this.dark = false});
  static const AppTheme _light = AppTheme._();
  static const AppTheme _dark = AppTheme._(dark: true);

  /// Whether this accessor resolves the dark token set. Driven off the ambient
  /// [Theme] brightness so `AppTheme.of(context)` follows the live theme mode
  /// without any call-site change.
  final bool dark;

  static AppTheme of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? _dark : _light;

  /// The light accessor, regardless of ambient brightness — for the few
  /// surfaces that stay light in both modes (e.g. a permanently-dark hero needs
  /// light-on-dark text either way).
  static const AppTheme light = _light;
  static const AppTheme darkTokens = _dark;

  // ── Capability gate — real frosted glass vs. solid fallback ────────────────
  /// True on platforms where a live [BackdropFilter] blur is cheap enough to
  /// use on a few high-value surfaces (iOS, web, desktop, modern Android).
  /// False on platforms where blur is GPU-expensive, so glass surfaces fall
  /// back to a SOLID translucent fill. A cheap static heuristic — NEVER blur a
  /// long scrolling list regardless of this flag.
  static bool get realGlass {
    if (kIsWeb) return true;
    switch (defaultTargetPlatform) {
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
      case TargetPlatform.windows:
      case TargetPlatform.linux:
        return true;
      case TargetPlatform.android:
        // Android blur is acceptable on modern hardware; we can't read the SDK
        // level cheaply here, so default to true and let callers keep blur off
        // scrolling lists. Weak devices still get a correct (if blurred) result.
        return true;
      case TargetPlatform.fuchsia:
        return false;
    }
  }

  // Palette — each colour resolves its light/dark token off [dark].
  Color get primary => dark ? AppColors.darkPrimaryText : AppColors.primary;
  Color get secondary => dark ? AppColors.darkCardHi : AppColors.secondary;
  Color get tertiary => dark ? AppColors.darkSecondaryText : AppColors.tertiary;
  Color get background => dark ? AppColors.darkBackground : AppColors.background;
  Color get secondaryBackground =>
      dark ? AppColors.darkCard : AppColors.secondaryBackground;
  Color get primaryText =>
      dark ? AppColors.darkPrimaryText : AppColors.primaryText;
  Color get secondaryText =>
      dark ? AppColors.darkSecondaryText : AppColors.secondaryText;
  Color get alternate => dark ? AppColors.darkBorder : AppColors.alternate;
  Color get lineColor => dark ? AppColors.darkLine : AppColors.lineColor;
  Color get error => dark ? AppColors.darkError : AppColors.error;
  Color get warning => dark ? AppColors.darkWarning : AppColors.warning;
  Color get success => dark ? AppColors.darkBrandAccent : AppColors.success;
  Color get info => dark ? AppColors.darkSecondaryText : AppColors.info;
  Color get white => Colors.white;
  Color get primaryDark => dark ? Colors.black : AppColors.primaryDark;
  Color get sage => dark ? AppColors.darkSecondaryText : AppColors.sage;
  Color get mint => dark ? AppColors.darkAccent1 : AppColors.mint;
  Color get accent1 => dark ? AppColors.darkAccent1 : AppColors.accent1;
  Color get accent2 => dark ? AppColors.darkAccent1 : AppColors.accent2;
  Color get accent3 => dark ? AppColors.darkAccent1 : AppColors.accent3;
  Color get accent4 => dark ? AppColors.darkAccent1 : AppColors.accent4;

  /// The card surface for the active theme — white on light, slate on dark.
  Color get cardSurface =>
      dark ? AppColors.darkCard : AppColors.secondaryBackground;

  // Accent system — same brand hues, lifted on dark so they stay vivid.
  Color get brandAccent =>
      dark ? AppColors.darkBrandAccent : AppColors.brandAccent;
  Color get brandAccentDark =>
      dark ? AppColors.darkBrandAccentDark : AppColors.brandAccentDark;
  Color get brandAccentTint =>
      dark ? AppColors.darkBrandAccentTint : AppColors.brandAccentTint;
  Color get saving => dark ? AppColors.darkSaving : AppColors.saving;
  Color get savingDark => dark ? AppColors.darkSavingDark : AppColors.savingDark;

  /// AA-safe green for small accent TEXT/links on glass. On dark the lifted
  /// green 400 already clears 4.5:1, so it reuses [brandAccent]; on light it
  /// drops to green 700 so links/labels read at ≥4.5:1 (the fill hue is too
  /// light as small text). Use this for green TEXT, not for fills/borders/icons.
  Color get brandAccentText =>
      dark ? AppColors.darkBrandAccent : AppColors.brandAccentText;

  /// AA-safe amber for small VALUE TEXT (savings figures, "best value") on
  /// glass. On dark the lifted amber 400 clears AA; on light it drops to amber
  /// 800 so small savings text reads at ≥4.5:1. Large display numerals can keep
  /// [saving]/[savingDark] (≥3:1 at 18px+ bold).
  Color get savingText => dark ? AppColors.darkSaving : AppColors.savingText;

  /// The ink read out ON the amber VALUE fill (savings pills, "best value"
  /// badges). Amber is a fixed-hue accent in both themes, so this deep-amber ink
  /// is theme-independent — use it wherever a chip fills with [saving].
  Color get onSaving => AppColors.onSaving;

  // ── Spacing scale — one shared rhythm for gaps, padding, insets ────────────
  // Use these instead of ad-hoc magic numbers so vertical/horizontal rhythm
  // stays consistent across screens (matches the site's 4/8/12/16/24/32/48).
  double get space4 => 4;
  double get space8 => 8;
  double get space12 => 12;
  double get space16 => 16;
  double get space24 => 24;
  double get space32 => 32;
  double get space48 => 48;

  // ── Opacity tokens — shared interaction-state alphas ───────────────────────
  /// Hover veil strength (web/desktop pointer hover).
  double get hoverOpacity => 0.08;
  /// Pressed/active veil strength.
  double get pressOpacity => 0.14;
  /// Disabled-content opacity.
  double get disabledOpacity => 0.55;

  // ── Focus ring — one shared keyboard-focus treatment ───────────────────────
  // Keyboard/desktop/web users get a visible green ACTION ring on focusable
  // controls (taps don't trigger it — only true keyboard/directional focus).
  // Centralised so every interactive surface adopts the SAME focus tell instead
  // of each widget improvising. The ring is the brand green so focus reads as
  // "this is the live control" — matching links/active-nav.
  /// The colour of the keyboard-focus ring (brand green, AA-strong on glass).
  Color get focusRing => brandAccent;
  /// Stroke width of the focus ring.
  double get focusRingWidth => 2.5;
  /// Gap between a control's own edge and its focus ring, so the ring reads as
  /// a halo rather than crowding the border.
  double get focusRingGap => 2;

  /// A ready-made focus halo: a rounded [Border] in [focusRing] plus a soft
  /// green glow, sized to sit just outside a control with the given [radius].
  /// Paint this in a wrapping box that is [focusRingGap] larger on every side.
  BoxDecoration focusRingDecoration({double? radius}) => BoxDecoration(
        borderRadius: BorderRadius.circular((radius ?? radiusMd) + focusRingGap),
        border: Border.all(color: focusRing, width: focusRingWidth),
        boxShadow: [
          BoxShadow(
            color: focusRing.withValues(alpha: dark ? 0.35 : 0.28),
            blurRadius: 10,
            spreadRadius: 0,
          ),
        ],
      );

  // ── Elevation — soft, layered, cool ink-tinted shadows (not flat black) ─────
  // Every shadow is now 2-layer (a wide AMBIENT diffuse + a tight KEY contact)
  // to match the site's depth. On dark the tint shifts to a deep blue-black so
  // shadows read as recessed slate, never muddy grey.
  /// The faintest lift — a near-flush contact shadow for inline chips, pills,
  /// inputs and other surfaces that should read as raised by a hair, not float.
  /// One tight layer; cheaper than [shadowSoft] for very frequently-painted bits.
  List<BoxShadow> get shadowXs => dark
      ? const [
          BoxShadow(color: Color(0x33060A12), blurRadius: 8, offset: Offset(0, 2)),
        ]
      : const [
          BoxShadow(color: Color(0x0A0F1B22), blurRadius: 8, offset: Offset(0, 2)),
        ];

  /// Subtle lift for chips, list rows, low-emphasis surfaces.
  List<BoxShadow> get shadowSoft => dark
      ? const [
          BoxShadow(color: Color(0x40060A12), blurRadius: 16, offset: Offset(0, 5)),
          BoxShadow(color: Color(0x26060A12), blurRadius: 4, offset: Offset(0, 1)),
        ]
      : const [
          BoxShadow(color: Color(0x0F0F1B22), blurRadius: 14, offset: Offset(0, 4)),
          BoxShadow(color: Color(0x080F1B22), blurRadius: 3, offset: Offset(0, 1)),
        ];

  /// The medium step between [shadowSoft] and [shadowCard] — for grouped bento
  /// cards and resting interactive surfaces that want a touch more presence than
  /// a list row but shouldn't read as a hero. Two-layer ambient + key contact.
  List<BoxShadow> get shadowMd => dark
      ? const [
          BoxShadow(color: Color(0x4D060A12), blurRadius: 20, offset: Offset(0, 7)),
          BoxShadow(color: Color(0x2E060A12), blurRadius: 5, offset: Offset(0, 2)),
        ]
      : const [
          BoxShadow(color: Color(0x120F1B22), blurRadius: 18, offset: Offset(0, 6)),
          BoxShadow(color: Color(0x090F1B22), blurRadius: 4, offset: Offset(0, 2)),
        ];

  /// The default card shadow — gentle, cool, two-layer.
  List<BoxShadow> get shadowCard => dark
      ? const [
          BoxShadow(color: Color(0x59060A12), blurRadius: 28, offset: Offset(0, 10)),
          BoxShadow(color: Color(0x33060A12), blurRadius: 6, offset: Offset(0, 2)),
        ]
      : const [
          BoxShadow(color: Color(0x140F1B22), blurRadius: 24, offset: Offset(0, 8)),
          BoxShadow(color: Color(0x0A0F1B22), blurRadius: 6, offset: Offset(0, 2)),
        ];

  /// Pronounced lift for heroes, FABs, modals.
  List<BoxShadow> get shadowLifted => dark
      ? const [
          BoxShadow(color: Color(0x66060A12), blurRadius: 44, offset: Offset(0, 18)),
          BoxShadow(color: Color(0x3D060A12), blurRadius: 10, offset: Offset(0, 4)),
        ]
      : const [
          BoxShadow(color: Color(0x1F0F1B22), blurRadius: 40, offset: Offset(0, 16)),
          BoxShadow(color: Color(0x0F0F1B22), blurRadius: 10, offset: Offset(0, 4)),
        ];

  /// A soft ink shadow under the primary (black) CTA so it reads "tap me".
  List<BoxShadow> get shadowPrimary => const [
        BoxShadow(color: Color(0x26111827), blurRadius: 20, offset: Offset(0, 8)),
      ];

  /// A green glow under the accent (CTA) gradient so it reads tappable.
  List<BoxShadow> get shadowAccent => const [
        BoxShadow(color: Color(0x4D16A34A), blurRadius: 22, offset: Offset(0, 8)),
        BoxShadow(color: Color(0x2615803D), blurRadius: 6, offset: Offset(0, 2)),
      ];

  /// A soft, diffuse, neutral shadow for frosted-glass surfaces.
  List<BoxShadow> get shadowGlass => dark
      ? const [
          BoxShadow(color: Color(0x4D060A12), blurRadius: 32, offset: Offset(0, 12)),
        ]
      : const [
          BoxShadow(color: Color(0x12000000), blurRadius: 30, offset: Offset(0, 10)),
        ];

  /// The 1px white glass-glint highlight tucked along the TOP edge of a card —
  /// the signature dimensional tell that catches light like real glass. On dark
  /// it's a faint cool highlight; on light a soft white. Layer this as the FIRST
  /// gradient stop of a surface, or use [glassGlintBorder] for a top-only edge.
  Color get glassGlint => dark
      ? Colors.white.withValues(alpha: 0.06)
      : Colors.white.withValues(alpha: 0.9);

  /// A subtle inner top-edge highlight, rendered as a thin gradient overlay.
  /// Paint this over a card to give it the 1px glass glint without a second
  /// Border (which would draw on all four sides).
  Gradient get glassGlintOverlay => LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          dark
              ? Colors.white.withValues(alpha: 0.07)
              : Colors.white.withValues(alpha: 0.75),
          Colors.white.withValues(alpha: 0),
        ],
        stops: const [0, 0.06],
      );

  /// The "soft glass" look for cards without live blur (performant): a
  /// translucent fill, a hairline border, a 1px top glass-glint, and
  /// [shadowGlass]. Use this for list cards; reserve real [BackdropFilter] blur
  /// (see [GlassPanel]) for a few high-value surfaces (bottom nav, sticky
  /// headers, modals, hero overlays).
  BoxDecoration glassDecoration({double? alpha, Color? tint, double? radius}) {
    final a = alpha ?? (dark ? 0.72 : 0.66);
    final base = (tint ?? (dark ? AppColors.darkCard : Colors.white));
    final fill = base.withValues(alpha: a);
    // Glass-glint: a brighter sliver along the TOP edge picks up light (bright
    // white on light, faint cool on dark), fading into the flat fill below — the
    // signature dimensional tell. Expressed as the fill's own vertical gradient
    // so a uniform [borderRadius] hairline still encloses the card cleanly
    // ([BoxDecoration] forbids a non-uniform-coloured border with a radius).
    return BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Color.alphaBlend(glassGlint.withValues(alpha: glassGlint.a * 0.5), fill),
          fill,
        ],
        stops: const [0, 0.08],
      ),
      borderRadius: BorderRadius.circular(radius ?? radiusLg),
      border: Border.all(
        color: dark
            ? AppColors.darkBorder.withValues(alpha: 0.9)
            : Colors.white.withValues(alpha: 0.55),
      ),
      boxShadow: shadowGlass,
    );
  }

  /// The premium-2026 **card** surface — an OPAQUE rounded card with a soft
  /// ink-tinted shadow, a low-opacity hairline border (never harsh black) and
  /// the 1px top glass-glint. Unlike [glassDecoration] (translucent, for
  /// list/overlay cards) this is a solid surface for the everyday grouped card.
  ///
  /// Pass [elevated] for a touch more presence ([shadowMd] instead of
  /// [shadowSoft]); [radius] defaults to [radiusLg] (20). Use [bentoDecoration]
  /// for the larger-radius bento grouping; this is the standard card.
  BoxDecoration cardDecoration({
    double? radius,
    Color? color,
    bool elevated = false,
    Color? borderColor,
  }) {
    final r = radius ?? radiusLg;
    final fill = color ?? cardSurface;
    return BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Color.alphaBlend(glassGlint.withValues(alpha: glassGlint.a * 0.4), fill),
          fill,
        ],
        stops: const [0, 0.07],
      ),
      borderRadius: BorderRadius.circular(r),
      border: Border.all(
        // A low-opacity ink hairline — structure without a harsh black edge.
        color: borderColor ??
            (dark
                ? AppColors.darkBorder.withValues(alpha: 0.7)
                : AppColors.primary.withValues(alpha: 0.06)),
      ),
      boxShadow: elevated ? shadowMd : shadowSoft,
    );
  }

  /// The premium-2026 **bento** surface — a generously-rounded grouped card
  /// ([radiusCard] = 24) with [shadowMd], a low-opacity ink hairline and the top
  /// glass-glint. Use for the big grouped data tiles (a savings tile, a stat
  /// cluster, a section block) that anchor a bento layout; reach for
  /// [cardDecoration] for ordinary list/content cards.
  BoxDecoration bentoDecoration({
    double? radius,
    Color? color,
    Color? borderColor,
  }) =>
      cardDecoration(
        radius: radius ?? radiusCard,
        color: color,
        elevated: true,
        borderColor: borderColor,
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

  /// The green ACTION gradient — primary CTAs. The single splash of colour
  /// that guides the eye through the conversion flow over the ink/glass base.
  /// Lifted on dark so the CTA stays vivid against slate surfaces.
  LinearGradient get accentGradient => LinearGradient(
        colors: dark
            ? const [AppColors.darkBrandAccent, AppColors.darkBrandAccentDark]
            : const [AppColors.brandAccent, AppColors.brandAccentDark],
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
      );

  // ── Radii — one friendly, generous rounding scale ───────────────────────────
  double get radiusXs => 10; // small chips/flags
  double get radiusSm => 12;
  double get radiusMd => 16;
  double get radiusLg => 20;
  double get radiusCard => 24; // the canonical premium-2026 card/bento corner
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
  /// backgrounds off flat white (or, on dark, off flat slate) without
  /// introducing any colour.
  LinearGradient get surfaceWash => dark
      ? const LinearGradient(
          colors: [Color(0xFF131922), Color(0xFF0E1218)],
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
  // On dark, each cached style is re-coloured ONCE to the off-white / muted
  // dark ink — the call sites still read e.g. `titleLarge.copyWith(...)`
  // unchanged, they just resolve the right colour for the active theme.
  TextStyle _ink(TextStyle s) => dark ? s.copyWith(color: AppColors.darkPrimaryText) : s;
  TextStyle _muted(TextStyle s) => dark ? s.copyWith(color: AppColors.darkSecondaryText) : s;

  static final TextStyle _displayLarge = GoogleFonts.rubik(fontSize: 58, fontWeight: FontWeight.w900, letterSpacing: -0.05, height: 1.02, color: AppColors.primaryText);
  static final TextStyle _displayMedium = GoogleFonts.rubik(fontSize: 44, fontWeight: FontWeight.w900, letterSpacing: -0.04, height: 1.03, color: AppColors.primaryText);
  static final TextStyle _displaySmall = GoogleFonts.rubik(fontSize: 35, fontWeight: FontWeight.w900, letterSpacing: -0.03, height: 1.05, color: AppColors.primaryText);
  TextStyle get displayLarge => _ink(_displayLarge);
  TextStyle get displayMedium => _ink(_displayMedium);
  TextStyle get displaySmall => _ink(_displaySmall);

  // Headlines
  static final TextStyle _headlineLarge = GoogleFonts.rubik(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.02, color: AppColors.primaryText);
  static final TextStyle _headlineMedium = GoogleFonts.rubik(fontSize: 24, fontWeight: FontWeight.w700, letterSpacing: -0.01, color: AppColors.primaryText);
  static final TextStyle _headlineSmall = GoogleFonts.rubik(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.01, color: AppColors.primaryText);
  TextStyle get headlineLarge => _ink(_headlineLarge);
  TextStyle get headlineMedium => _ink(_headlineMedium);
  TextStyle get headlineSmall => _ink(_headlineSmall);

  // Titles
  static final TextStyle _titleLarge = GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.primaryText);
  static final TextStyle _titleMedium = GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.primaryText);
  static final TextStyle _titleSmall = GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.primaryText);
  TextStyle get titleLarge => _ink(_titleLarge);
  TextStyle get titleMedium => _ink(_titleMedium);
  TextStyle get titleSmall => _ink(_titleSmall);

  // Body — Assistant, the Hebrew-first reading face
  static final TextStyle _bodyLarge = GoogleFonts.assistant(fontSize: 16, fontWeight: FontWeight.w500, color: AppColors.primaryText);
  static final TextStyle _bodyMedium = GoogleFonts.assistant(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.primaryText);
  static final TextStyle _bodySmall = GoogleFonts.assistant(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.secondaryText);
  TextStyle get bodyLarge => _ink(_bodyLarge);
  TextStyle get bodyMedium => _ink(_bodyMedium);
  TextStyle get bodySmall => _muted(_bodySmall);

  // Labels
  static final TextStyle _labelLarge = GoogleFonts.assistant(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.primaryText);
  static final TextStyle _labelMedium = GoogleFonts.assistant(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.secondaryText);
  static final TextStyle _labelSmall = GoogleFonts.assistant(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.secondaryText);
  TextStyle get labelLarge => _ink(_labelLarge);
  TextStyle get labelMedium => _muted(_labelMedium);
  TextStyle get labelSmall => _muted(_labelSmall);

  // ── ThemeData — light + dark, exposed for MaterialApp.router ────────────────
  /// The light [ThemeData]. Built off the shared tokens so Material widgets
  /// (dialogs, snackbars, inputs, app bars) match the hand-authored surfaces.
  static ThemeData lightTheme() => _buildTheme(_light, Brightness.light);

  /// The cohesive dark [ThemeData] — deep slate surfaces, off-white ink, lifted
  /// green/amber accents. Not a colour flip; a designed night theme.
  static ThemeData darkTheme() => _buildTheme(_dark, Brightness.dark);

  static ThemeData _buildTheme(AppTheme t, Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      fontFamily: GoogleFonts.assistant().fontFamily,
    );
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.brandAccent,
      brightness: brightness,
      surface: t.cardSurface,
      primary: t.brandAccent,
      error: t.error,
    );
    return base.copyWith(
      colorScheme: scheme,
      scaffoldBackgroundColor: t.background,
      canvasColor: t.background,
      dividerColor: t.lineColor,
      textTheme: GoogleFonts.assistantTextTheme(base.textTheme).apply(
        bodyColor: t.primaryText,
        displayColor: t.primaryText,
      ),
      iconTheme: IconThemeData(color: t.primaryText),
      appBarTheme: AppBarTheme(
        backgroundColor: isDark ? AppColors.darkSurface : AppColors.primary,
        foregroundColor: isDark ? t.primaryText : Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.rubik(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: isDark ? t.primaryText : Colors.white,
        ),
      ),
      // Native page motion app-wide: every pushed MaterialPage now slides in
      // (iOS-style + RTL-aware, with edge swipe-back on iOS) instead of swapping
      // with no motion — the single biggest fix for the "feels like a website"
      // tell. go_router builds each route as a MaterialPage, so this themes all
      // ~40 routes at once with zero per-route changes.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.android: ZoomPageTransitionsBuilder(),
          TargetPlatform.fuchsia: ZoomPageTransitionsBuilder(),
          TargetPlatform.linux: CupertinoPageTransitionsBuilder(),
          TargetPlatform.windows: CupertinoPageTransitionsBuilder(),
        },
      ),
      cardTheme: CardThemeData(
        color: t.cardSurface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(t.radiusLg)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: t.cardSurface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(t.radiusXl)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: t.cardSurface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(t.radiusXl)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isDark ? AppColors.darkCardHi : null,
        contentTextStyle: isDark ? TextStyle(color: t.primaryText) : null,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(t.radiusMd)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? AppColors.darkCard : AppColors.secondaryBackground,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(t.radiusMd), borderSide: BorderSide(color: t.alternate)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(t.radiusMd), borderSide: BorderSide(color: t.alternate)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(t.radiusMd), borderSide: BorderSide(color: t.brandAccent, width: 1.5)),
      ),
    );
  }
}
