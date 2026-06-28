import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// A reusable collapsing sliver header for full-screen feature pages.
///
/// `AppSliverHeader` is the single, shared "big title that shrinks as you
/// scroll" surface, distilled from the hand-rolled [SliverAppBar]s in
/// `profile_widget.dart` and `provider_widget.dart` so every detail/feature
/// screen gets the same brand-correct, RTL-safe header without re-deriving it.
///
/// It renders a `SliverAppBar(pinned: true)` whose expanded background is the
/// premium ink gradient ([AppTheme.brandGradient]) when [gradient] is true,
/// or a flat premium ink surface ([AppTheme.primary]) otherwise. As the user
/// scrolls, the [FlexibleSpaceBar] title smoothly collapses from the large
/// expanded heading into the compact pinned bar.
///
/// The back affordance is left to the framework: with [showBack] true the
/// `automaticallyImplyLeading` machinery draws the platform back button, which
/// is already mirrored correctly under the app's RTL [Directionality] (it points
/// to the trailing/right edge and pops on tap). Title type comes from the
/// ambient `appBarTheme` (Rubik, set in `app_theme.dart`).
///
/// An optional [flexibleChild] (e.g. a hero saving figure, an avatar, a stat
/// row) is layered above the gradient, centred in the safe area, so callers can
/// enrich the expanded state without rebuilding the whole header.
///
/// Honours reduced-motion: when the platform requests disabled animations
/// (`MediaQuery.disableAnimations`), the title stays fixed at the start instead
/// of sliding between the expanded and collapsed positions.
///
/// {@tool snippet}
/// Use it as the first sliver of a [CustomScrollView]:
///
/// ```dart
/// CustomScrollView(
///   slivers: [
///     AppSliverHeader(
///       title: 'דוח חידוש',
///       subtitle: 'החבילה שלך מתחדשת בקרוב',
///       expandedHeight: 196,
///       actions: [
///         IconButton(
///           icon: const Icon(Icons.share_rounded),
///           tooltip: 'שיתוף',
///           onPressed: _share,
///         ),
///       ],
///       flexibleChild: Text(
///         '₪540',
///         style: AppTheme.light.displaySmall.copyWith(color: Colors.white),
///       ),
///     ),
///     SliverList(/* page content */),
///   ],
/// )
/// ```
/// {@end-tool}
class AppSliverHeader extends StatelessWidget {
  /// The page heading. Shown large in the expanded state and collapsed into the
  /// compact pinned bar on scroll. Rendered in Rubik via the `appBarTheme`.
  final String title;

  /// Optional secondary line shown under the [title] in the expanded state only
  /// (it fades out as the header collapses). Use for a short, supportive caption.
  final String? subtitle;

  /// The fully-expanded height of the header, in logical pixels. Defaults to
  /// 168 — enough room for the title, an optional [subtitle] and a compact
  /// [flexibleChild]; raise it for taller hero content.
  final double expandedHeight;

  /// Optional trailing actions (e.g. share, edit). Placed on the leading-text
  /// side under RTL, exactly like a standard [AppBar].
  final List<Widget>? actions;

  /// Whether to show the platform back affordance. When true the framework's
  /// `automaticallyImplyLeading` draws an RTL-correct back button that pops the
  /// route; set false on a root tab where there is nothing to pop.
  final bool showBack;

  /// Optional widget layered above the background in the expanded state — a hero
  /// figure, avatar or stat row. Centred horizontally within the safe area,
  /// below the title block.
  final Widget? flexibleChild;

  /// Whether the expanded background uses the premium ink [AppTheme.brandGradient]
  /// (the default, a subtle charcoal depth) or a flat premium ink surface
  /// ([AppTheme.primary]) when false.
  final bool gradient;

  const AppSliverHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.expandedHeight = 168,
    this.actions,
    this.showBack = true,
    this.flexibleChild,
    this.gradient = true,
  });

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    // Reduced-motion: pin the collapsing title to the start so it doesn't slide
    // between the expanded and collapsed anchors during the scroll.
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    // Always light-on-dark: the background is the saturated green wash or the
    // ink surface in BOTH themes, so foreground content reads white either way
    // (mirrors the permanently-dark heroes that use AppTheme.light tokens).
    const onHeader = Colors.white;

    return SliverAppBar(
      pinned: true,
      expandedHeight: expandedHeight,
      automaticallyImplyLeading: showBack,
      // The flat surface colour the pinned bar settles on once collapsed; it
      // matches the bottom of the expanded ink gradient so the transition is
      // seamless. Always the premium ink (no more saturated-green hero bar).
      backgroundColor: ffTheme.primary,
      foregroundColor: onHeader,
      elevation: 0,
      actions: actions,
      flexibleSpace: FlexibleSpaceBar(
        // Start-anchored title: under RTL this hugs the right edge, and at the
        // start the framework skips the slide tween so reduced-motion is honoured.
        titlePadding: const EdgeInsetsDirectional.only(
          start: 16,
          bottom: 14,
          end: 16,
        ),
        expandedTitleScale: 1.6,
        collapseMode:
            reduceMotion ? CollapseMode.none : CollapseMode.parallax,
        title: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          // Title style comes from the appBarTheme (Rubik); only the colour is
          // forced white so it reads on the coloured/ink background.
          style: const TextStyle(color: onHeader),
        ),
        background: _HeaderBackground(
          ffTheme: ffTheme,
          gradient: gradient,
          subtitle: subtitle,
          flexibleChild: flexibleChild,
          onHeader: onHeader,
          // Leave headroom so the centred content clears the collapsed title bar.
          bottomReserve: kToolbarHeight + 8,
        ),
      ),
    );
  }
}

/// The expanded-state backdrop: the brand wash (or ink surface) with the optional
/// [subtitle] and [flexibleChild] layered above it inside the safe area.
class _HeaderBackground extends StatelessWidget {
  final AppTheme ffTheme;
  final bool gradient;
  final String? subtitle;
  final Widget? flexibleChild;
  final Color onHeader;
  final double bottomReserve;

  const _HeaderBackground({
    required this.ffTheme,
    required this.gradient,
    required this.subtitle,
    required this.flexibleChild,
    required this.onHeader,
    required this.bottomReserve,
  });

  @override
  Widget build(BuildContext context) {
    final hasContent = subtitle != null || flexibleChild != null;
    return DecoratedBox(
      decoration: BoxDecoration(
        // Premium ink hero (charcoal) — the bank-grade replacement for the old
        // saturated-green ACTION wash. Green now lives only on CTAs/accents.
        gradient: gradient ? ffTheme.brandGradient : null,
        color: gradient ? null : ffTheme.primary,
      ),
      child: SafeArea(
        bottom: false,
        // Reserve the collapsed bar's height at the bottom so centred hero
        // content never sits under the pinned title once it docks.
        child: Padding(
          padding: EdgeInsetsDirectional.only(
            start: 16,
            end: 16,
            bottom: bottomReserve,
          ),
          child: hasContent
              ? Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    if (subtitle != null)
                      Text(
                        subtitle!,
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: ffTheme.bodyMedium.copyWith(
                          color: onHeader.withValues(alpha: 0.82),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    if (subtitle != null && flexibleChild != null)
                      const SizedBox(height: 12),
                    if (flexibleChild != null) flexibleChild!,
                  ],
                )
              : const SizedBox.shrink(),
        ),
      ),
    );
  }
}
