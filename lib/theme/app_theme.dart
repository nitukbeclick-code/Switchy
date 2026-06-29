import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Minimum interactive touch-target size (dp), enforced on small controls app-wide.
const double kMinTapTarget = 48.0;

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
  // GEIST neutrals — monochrome, border-defined. `primary` = near-black ink
  // (Geist neutral-950) for text + flat black hero surfaces; structure is carried
  // by 1px gray hairlines, not dark borders.
  static const Color primary = Color(0xFF0A0A0A); // near-black ink / flat black surface
  static const Color primaryDark = Color(0xFF000000); // true black
  static const Color tertiary = Color(0xFF737373); // neutral-600 grey
  static const Color secondary = Color(0xFFF5F5F5); // neutral-100 chip surface
  static const Color sage = Color(0xFF737373); // neutral-600 muted grey (AA: 4.7:1)

  // Surfaces — Geist: near-white canvas, pure-white card (separated by 1px border).
  static const Color background = Color(0xFFFAFAFA); // neutral-50 canvas
  static const Color secondaryBackground = Color(0xFFFFFFFF); // white card

  // Text — Geist neutral-900 ink on near-white.
  static const Color primaryText = Color(0xFF171717); // neutral-900
  static const Color secondaryText = Color(0xFF525252); // neutral-700 (AA 7:1)

  // Lines & borders — Geist 1px gray hairlines (NOT dark). `alternate` = the
  // emphasis/input border; `lineColor` = the default hairline + dividers.
  static const Color alternate = Color(0xFFE1E1E1); // neutral-300 border (inputs/emphasis)
  static const Color lineColor = Color(0xFFEAEAEA); // neutral-200 hairline/divider

  // Status (kept functional — errors/warnings still need their semantic hue)
  static const Color error = Color(0xFFDC2626);
  static const Color warning = Color(0xFFB45309);
  static const Color success = Color(0xFF111827); // neutral ink base; the green ACTION accent (brandAccent) carries positive emphasis
  static const Color info = Color(0xFF374151);

  // Surface tints — neutral grey washes for tinted cards/chips (no color).
  static const Color accent1 = Color(0xFFF5F5F5); // neutral-100 tint surface
  static const Color accent2 = Color(0xFFFAFAFA); // neutral-50
  static const Color accent3 = Color(0xFFF5F5F5); // neutral-100
  static const Color accent4 = Color(0xFFFAFAFA); // neutral-50
  static const Color mint = Color(0xFFF5F5F5); // alias for accent1, semantic

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

  /// GEIST: cards are border-defined — only a whisper of shadow remains.
  List<BoxShadow> get shadowCard => dark
      ? const [BoxShadow(color: Color(0x33000000), blurRadius: 10, offset: Offset(0, 2))]
      : const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 1))];

  /// Modest lift for sheets / modals / FABs (still restrained, single layer).
  List<BoxShadow> get shadowLifted => dark
      ? const [BoxShadow(color: Color(0x4D000000), blurRadius: 18, offset: Offset(0, 5))]
      : const [BoxShadow(color: Color(0x14000000), blurRadius: 14, offset: Offset(0, 4))];

  /// A soft ink shadow under the primary (black) CTA so it reads "tap me".
  // GEIST: primary/accent CTAs are FLAT — no drop shadow, no glow.
  List<BoxShadow> get shadowPrimary => const [];

  List<BoxShadow> get shadowAccent => const [];

  /// The "live" green ACTION glow — a 1px accent-tinted ring hugging the edge
  /// plus a soft accent-coloured drop — the Flutter mirror of the site's
  /// `--glow-accent`. Use on the surface a primary CTA wants to feel energised
  /// (the green button, an active "best match" tile). Theme-aware: on dark the
  /// hue lifts to the brighter green and the alphas rise a touch so the glow
  /// still reads against slate. The ring is the `0 0 0 1px` layer
  /// (spread 1, blur 0); the soft drop is the `0 8px 28px` layer.
  List<BoxShadow> get glowAccent => const []; // GEIST: no glow

  /// The "live" amber VALUE glow — the same 1px ring + soft drop as
  /// [glowAccent], tinted to the amber VALUE accent. The Flutter mirror of the
  /// site's `--glow-value`; reach for it on a "best value"/savings surface that
  /// should glow warm. Theme-aware (lifts to amber 400 on dark).
  List<BoxShadow> get glowValue => const []; // GEIST: no glow

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
    // GEIST: a flat surface defined by a 1px hairline border — no blur, no glint
    // gradient, no drop shadow. `alpha` is kept for API compatibility but a solid
    // fill reads cleaner and crisper on the near-white canvas.
    final fill = tint ?? cardSurface;
    return BoxDecoration(
      color: fill,
      borderRadius: BorderRadius.circular(radius ?? radiusLg),
      border: Border.all(color: dark ? AppColors.darkBorder : lineColor),
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
    // GEIST card: solid fill + 1px hairline border, FLAT. `elevated` adds only a
    // whisper of shadow (sheets/popovers); resting cards are border-defined, no
    // shadow — structure comes from the hairline, not float.
    return BoxDecoration(
      color: color ?? cardSurface,
      borderRadius: BorderRadius.circular(radius ?? radiusLg),
      border: Border.all(color: borderColor ?? (dark ? AppColors.darkBorder : lineColor)),
      boxShadow: elevated ? shadowSoft : null,
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
  // GEIST: gradients are now FLAT solids (two identical stops) so callers that
  // paint a `gradient:` get a crisp solid fill, not a wash. The ink hero is flat
  // near-black (white foreground stays valid + is authentically Geist).
  LinearGradient get brandGradient => LinearGradient(
        colors: dark ? const [Color(0xFF141414), Color(0xFF141414)] : const [AppColors.primary, AppColors.primary],
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
      );

  /// Flat near-black surface (was an ink→slate wash).
  LinearGradient get freshGradient => LinearGradient(
        colors: dark ? const [Color(0xFF141414), Color(0xFF141414)] : const [AppColors.primary, AppColors.primary],
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
      );

  /// A flat neutral chip surface (was a slate→grey ribbon).
  LinearGradient get limeGradient => const LinearGradient(
        colors: [AppColors.secondary, AppColors.secondary],
        begin: Alignment.centerRight,
        end: Alignment.centerLeft,
      );

  /// The green ACTION fill — primary CTAs. Flat solid green (the single accent),
  /// lifted on dark so the CTA stays vivid.
  LinearGradient get accentGradient => LinearGradient(
        colors: dark
            ? const [AppColors.darkBrandAccent, AppColors.darkBrandAccent]
            : const [AppColors.brandAccent, AppColors.brandAccent],
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
      );

  // ── Radii — one friendly, generous rounding scale ───────────────────────────
  // Tightened to a crisp, professional rounding (bank-grade). The old 20-24
  // corners read soft/playful; 10-16 reads considered + serious while still
  // friendly. One change here re-corners every card/sheet/button app-wide.
  double get radiusXs => 6; // GEIST: chips/tags/small buttons
  double get radiusSm => 8;
  double get radiusMd => 8; // default button/input
  double get radiusLg => 10; // cards
  double get radiusCard => 12; // large containers/bento
  double get radiusXl => 12; // sheets/modals (Geist never exceeds 12 for content)
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

  // ── Emil-tier motion tokens ─────────────────────────────────────────────────
  // The press/feedback/morph vocabulary, named by PURPOSE so each surface
  // animates with the right curve+duration band instead of improvising:
  //   • press feedback   100-160ms  ease-out   ([motionPress] + [easeOut])
  //   • tooltip          125-200ms
  //   • dropdown/popover 150-250ms  origin-aware
  //   • modal / drawer   200-500ms  ([motionDrawer] + [easeDrawer])
  // UI motion stays < 300ms so nothing feels sluggish. These are ADDITIVE —
  // [motionFast]/[motionMedium]/[spring] keep their existing values so no
  // call-site outside the shared primitives shifts.

  /// Press-down feedback band (100-160ms). Tighter than [motionFast] so a tap's
  /// scale-down lands inside Emil's high-frequency press window — pair with
  /// [easeOut] (entering/settling motion is always ease-out, never ease-in).
  Duration get motionPress => const Duration(milliseconds: 130);

  /// Tooltip / micro-feedback band (~150ms).
  Duration get motionTooltip => const Duration(milliseconds: 150);

  /// Drawer / bottom-sheet entrance band (200-500ms). Long enough to read as a
  /// surface sliding up under [easeDrawer], short enough to never drag.
  Duration get motionDrawer => const Duration(milliseconds: 320);

  /// The site's `--ease-in-out` — for elements that MOVE or MORPH between two
  /// states (a thumb sliding, a card reflowing). Never use ease-in for UI.
  Curve get easeInOut => const Cubic(0.77, 0, 0.175, 1);

  /// The site's `--ease-drawer` — the signature decelerating curve for sheets
  /// and drawers that translate in from an edge. Calmer tail than [easeOut].
  Curve get easeDrawer => const Cubic(0.32, 0.72, 0, 1);

  /// A subtle, physically-grounded spring for drawer / sheet entrances and
  /// drag-driven surfaces (Emil's `{duration: 0.5, bounce: 0.2}`). Low bounce so
  /// the surface settles with a hair of life, never a cartoonish wobble. Use for
  /// [AnimatedScale]/`SpringSimulation`-style entrances where a [Curve] alone
  /// would feel mechanical; keep [spring] for the existing overshoot call-sites.
  SpringDescription get drawerSpring => SpringDescription.withDampingRatio(
        mass: 1,
        stiffness: 380,
        ratio: 0.82, // ≈ bounce 0.18 — within Emil's 0.1-0.3 alive band
      );

  /// A faint top-to-bottom glass wash for full-screen scaffolds — lifts plain
  /// backgrounds off flat white (or, on dark, off flat slate) without
  /// introducing any colour.
  LinearGradient get surfaceWash => dark
      ? const LinearGradient(
          colors: [Color(0xFF0A0A0A), Color(0xFF0A0A0A)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        )
      : const LinearGradient(
          colors: [AppColors.background, AppColors.background],
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

  // Display — dialled DOWN from the old 35-58px / w900 "exaggerated" scale to a
  // restrained 26-40px / w700. Big numerals still read as the hero, but
  // considered, not shouting (the #1 fix for the "loud/childish" feel).
  static final TextStyle _displayLarge = GoogleFonts.rubik(fontSize: 40, fontWeight: FontWeight.w700, letterSpacing: -0.02, height: 1.04, color: AppColors.primaryText);
  static final TextStyle _displayMedium = GoogleFonts.rubik(fontSize: 32, fontWeight: FontWeight.w700, letterSpacing: -0.02, height: 1.05, color: AppColors.primaryText);
  static final TextStyle _displaySmall = GoogleFonts.rubik(fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -0.015, height: 1.07, color: AppColors.primaryText);
  TextStyle get displayLarge => _ink(_displayLarge);
  TextStyle get displayMedium => _ink(_displayMedium);
  TextStyle get displaySmall => _ink(_displaySmall);

  // Headlines
  static final TextStyle _headlineLarge = GoogleFonts.rubik(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.01, color: AppColors.primaryText);
  static final TextStyle _headlineMedium = GoogleFonts.rubik(fontSize: 19, fontWeight: FontWeight.w600, letterSpacing: -0.005, color: AppColors.primaryText);
  static final TextStyle _headlineSmall = GoogleFonts.rubik(fontSize: 17, fontWeight: FontWeight.w600, letterSpacing: 0, color: AppColors.primaryText);
  TextStyle get headlineLarge => _ink(_headlineLarge);
  TextStyle get headlineMedium => _ink(_headlineMedium);
  TextStyle get headlineSmall => _ink(_headlineSmall);

  // Titles
  static final TextStyle _titleLarge = GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.primaryText);
  static final TextStyle _titleMedium = GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.primaryText);
  static final TextStyle _titleSmall = GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.primaryText);
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
        // Clean light/surface app bar with ink text — the bank-grade replacement
        // for the old solid ink-black bar (which read heavy + "app-y"). Surface
        // on both themes; dark ink foreground on light.
        backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
        foregroundColor: t.primaryText,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: GoogleFonts.rubik(
          fontSize: 17,
          fontWeight: FontWeight.w700,
          color: t.primaryText,
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
