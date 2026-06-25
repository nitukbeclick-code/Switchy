import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// A pull-to-refresh sliver scaffold — the shared wrapper for any screen that
/// hosts a [CustomScrollView] of slivers and wants the standard Switchy
/// pull-to-refresh gesture.
///
/// It pairs a [RefreshIndicator] (themed to the brand green spinner on the card
/// surface, matching the conventions in `deals_widget.dart` /
/// `community_widget.dart`) with a [CustomScrollView] whose physics are
/// [AlwaysScrollableScrollPhysics] over [BouncingScrollPhysics]. The
/// always-scrollable physics are **required**: without them a screen whose
/// content is shorter than the viewport can't be over-dragged, so the refresh
/// gesture would never fire. The bouncing parent gives the iOS-style rubber-band
/// overscroll the rest of the app uses.
///
/// Pass your [slivers] straight through (e.g. `SliverList`, `SliverToBoxAdapter`,
/// `SliverPadding`); supply [padding] to inset the whole scroll view, and an
/// optional [controller] if the host needs to observe or drive scroll position.
///
/// ```dart
/// RefreshableScroll(
///   onRefresh: () => _reload(),
///   padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
///   slivers: [
///     SliverToBoxAdapter(child: _Header()),
///     SliverList.builder(
///       itemCount: items.length,
///       itemBuilder: (_, i) => _Row(items[i]),
///     ),
///   ],
/// )
/// ```
class RefreshableScroll extends StatelessWidget {
  /// Called when the user completes the pull-to-refresh gesture. The spinner
  /// stays visible until the returned future resolves.
  final Future<void> Function() onRefresh;

  /// The slivers rendered inside the [CustomScrollView] (e.g. [SliverList],
  /// [SliverToBoxAdapter], [SliverPadding]).
  final List<Widget> slivers;

  /// Optional controller to observe or drive the scroll position.
  final ScrollController? controller;

  /// Optional padding applied around the whole scroll view, via a wrapping
  /// [SliverPadding]. When null, the slivers fill edge-to-edge.
  final EdgeInsets? padding;

  /// Creates a pull-to-refresh sliver scaffold.
  const RefreshableScroll({
    super.key,
    required this.onRefresh,
    required this.slivers,
    this.controller,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    // When padding is given, inset every sliver inside a single SliverPadding so
    // the CustomScrollView itself stays full-bleed (the indicator and overscroll
    // glow read against the screen edge, not an inset gutter).
    final children = padding == null
        ? slivers
        : <Widget>[
            SliverPadding(
              padding: padding!,
              sliver: SliverMainAxisGroup(slivers: slivers),
            ),
          ];
    return RefreshIndicator(
      onRefresh: onRefresh,
      // Brand green spinner on the active card surface — matches the existing
      // pull-to-refresh treatments across the app.
      color: ffTheme.brandAccent,
      backgroundColor: ffTheme.cardSurface,
      child: CustomScrollView(
        controller: controller,
        // AlwaysScrollable is REQUIRED so the refresh fires even when the
        // content is shorter than the viewport; Bouncing gives the iOS-style
        // rubber-band overscroll the rest of the app uses.
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        slivers: children,
      ),
    );
  }
}
