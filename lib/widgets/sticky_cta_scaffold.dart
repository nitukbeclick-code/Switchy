import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// A [Scaffold] with a single, persistent call-to-action pinned to the bottom.
///
/// Use this for any full-screen flow whose primary action must stay reachable
/// while the form/content scrolls — a lead form, a checkout, a confirm step.
/// The [body] scrolls independently above a fixed action bar that hosts [cta]
/// (typically an [AppButton]). The bar:
///
/// * sits inside `SafeArea(top: false)` so it clears the home indicator / gesture
///   inset without padding the scrolling body,
/// * **rises above the on-screen keyboard** — `MediaQuery.viewInsets.bottom` is
///   added to its bottom padding, so the CTA never hides behind the IME,
/// * reads as a floating action bar over the content via a top hairline
///   ([AppTheme.lineColor]), the card surface fill ([AppTheme.cardSurface]) and
///   a soft upward [AppTheme.shadowGlass].
///
/// Layout is a `Column` of an [Expanded] body + the bar (not [Scaffold.bottomSheet]),
/// which keeps the body genuinely scrollable and the bar always laid out above
/// the keyboard inset in one measure pass.
///
/// ```dart
/// StickyCtaScaffold(
///   appBar: AppBar(title: const Text('השאירו פרטים')),
///   body: SingleChildScrollView(
///     padding: const EdgeInsets.all(20),
///     child: Column(children: [/* form fields … */]),
///   ),
///   cta: AppButton(
///     text: 'שליחה ←',
///     width: double.infinity,
///     onPressed: () async => _submit(),
///   ),
/// );
/// ```
class StickyCtaScaffold extends StatelessWidget {
  /// Creates a scaffold whose [cta] is pinned to the bottom over the scrolling
  /// [body].
  const StickyCtaScaffold({
    super.key,
    this.appBar,
    required this.body,
    required this.cta,
    this.ctaPadding,
  });

  /// The optional app bar, forwarded to the inner [Scaffold].
  final PreferredSizeWidget? appBar;

  /// The scrollable content. Should itself be a scroll view (e.g.
  /// [SingleChildScrollView] / [ListView]) — it is placed in an [Expanded] so it
  /// fills the space above the pinned CTA bar.
  final Widget body;

  /// The persistent action, pinned to the bottom (typically an `AppButton`).
  final Widget cta;

  /// Inner padding of the CTA bar around [cta]. Defaults to
  /// `EdgeInsets.fromLTRB(16, 10, 16, 10)`. The keyboard inset is added to the
  /// resolved bottom padding automatically — callers should not add it here.
  final EdgeInsetsGeometry? ctaPadding;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    // Lift the whole bar above the on-screen keyboard: when the IME is open,
    // viewInsets.bottom is its height; add it to the bar's bottom padding so the
    // CTA floats just above the keyboard instead of hiding behind it.
    final keyboardInset = MediaQuery.of(context).viewInsets.bottom;
    final basePadding =
        ctaPadding ?? const EdgeInsets.fromLTRB(16, 10, 16, 10);

    return Scaffold(
      appBar: appBar,
      // We own the keyboard inset on the CTA bar (see keyboardInset above), so
      // don't let the Scaffold also resize the body for the IME — that would
      // double-count the inset and pull the body up unexpectedly.
      resizeToAvoidBottomInset: false,
      body: Column(
        children: [
          // The scrolling content fills everything above the pinned bar.
          Expanded(child: body),
          // The persistent action bar: a top hairline + surface fill + soft
          // upward shadow read it as a floating bar over the scroll content.
          DecoratedBox(
            decoration: BoxDecoration(
              color: t.cardSurface,
              border: Border(top: BorderSide(color: t.lineColor)),
              boxShadow: t.shadowGlass,
            ),
            child: SafeArea(
              // The app bar already guards the top; only guard the bottom inset.
              top: false,
              child: Padding(
                // Add the keyboard height to the resolved bottom padding so the
                // CTA rises above the IME. Resolve the geometry to LTR-agnostic
                // insets, then re-pad the bottom.
                padding: basePadding
                    .resolve(Directionality.of(context))
                    .copyWith(
                      bottom: basePadding
                              .resolve(Directionality.of(context))
                              .bottom +
                          keyboardInset,
                    ),
                child: cta,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
