import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import '../theme/app_theme.dart';

/// A single action row in an [AppSheet.actions] sheet.
///
/// Renders as a >=56dp tappable row: a leading [icon], a [label], and a
/// disclosure chevron. A [destructive] action (delete, sign-out, …) paints its
/// icon + label in [AppTheme.error] so it reads as a heavier choice. Tapping a
/// row fires [onTap] (after a selection haptic) and pops the sheet.
class AppSheetAction {
  const AppSheetAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.destructive = false,
  });

  /// The leading glyph for the row (use a rounded Material icon to match).
  final IconData icon;

  /// The Hebrew action label, read in the row's body.
  final String label;

  /// Fired when the row is tapped, after the sheet has been dismissed.
  final VoidCallback onTap;

  /// When true the row reads in [AppTheme.error] — for a removing/irreversible
  /// action (delete, leave, sign out) the user should think twice about.
  final bool destructive;
}

/// The app's standard bottom sheet — one rounded, frosted-glass surface for
/// every modal sheet, replacing ad-hoc [showModalBottomSheet] bodies and the
/// `Material` [AlertDialog] / [PopupMenuButton] pair.
///
/// Two entry points:
///
/// * [AppSheet.show] presents an arbitrary [child] under an optional [title] —
///   a composer, a detail panel, a confirm body, anything. It scrolls by
///   default (`isScrollControlled: true`) so a tall child or the keyboard never
///   clips the content.
/// * [AppSheet.actions] renders a column of tappable [AppSheetAction] rows — the
///   "…" overflow / context-menu replacement. Each row pops the sheet and
///   returns the tapped action, so the caller can also await which one ran.
///
/// Both share the same chrome: a 36x4 rounded drag-handle at the top, the
/// rounded top corners from [BottomSheetThemeData] (set in
/// `AppTheme._buildTheme`), the [AppTheme.cardSurface] fill, a [SafeArea], and
/// consistent padding. Copy stays Hebrew/RTL — the sheet inherits the app's RTL
/// [Directionality], so no per-call direction handling is needed.
///
/// ## Example — replacing an `AlertDialog` confirm
///
/// ```dart
/// // Before: an AlertDialog with two TextButtons.
/// // After: a sheet whose body is the question + a primary/secondary pair.
/// final confirmed = await AppSheet.show<bool>(
///   context,
///   title: 'מחיקת פוסט',
///   child: Column(
///     mainAxisSize: MainAxisSize.min,
///     crossAxisAlignment: CrossAxisAlignment.stretch,
///     children: [
///       Text('למחוק את הפוסט? לא ניתן לשחזר.',
///           style: AppTheme.of(context).bodyMedium),
///       const SizedBox(height: 16),
///       AppButton(
///         text: 'מחק',
///         color: AppTheme.of(context).error,
///         onPressed: () async => Navigator.pop(context, true),
///       ),
///       const SizedBox(height: 8),
///       AppButton.secondary(
///         text: 'ביטול',
///         onPressed: () async => Navigator.pop(context, false),
///       ),
///     ],
///   ),
/// );
/// if (confirmed == true) deletePost();
/// ```
///
/// ## Example — replacing a `PopupMenuButton`
///
/// ```dart
/// // Before: an IconButton + PopupMenuButton<String> with a switch on the
/// // selected value. After: a single actions sheet; the tapped action runs
/// // its own onTap, so there is no value to switch on.
/// IconButton(
///   icon: const Icon(Icons.more_horiz_rounded),
///   tooltip: 'פעולות',
///   onPressed: () => AppSheet.actions(
///     context,
///     title: 'פעולות על הפוסט',
///     actions: [
///       AppSheetAction(
///         icon: Icons.share_rounded,
///         label: 'שיתוף',
///         onTap: () => sharePost(post),
///       ),
///       AppSheetAction(
///         icon: Icons.flag_rounded,
///         label: 'דיווח',
///         onTap: () => reportPost(post),
///       ),
///       AppSheetAction(
///         icon: Icons.delete_outline_rounded,
///         label: 'מחיקה',
///         destructive: true,
///         onTap: () => deletePost(post),
///       ),
///     ],
///   ),
/// );
/// ```
class AppSheet {
  const AppSheet._();

  /// Presents [child] in the app's standard bottom sheet under an optional
  /// [title].
  ///
  /// Returns whatever value the child pops the sheet with (via
  /// `Navigator.pop(context, value)`), or `null` if it is dismissed by a
  /// barrier tap / back gesture. [scrollable] maps to
  /// [showModalBottomSheet]'s `isScrollControlled` (default true) so tall
  /// children and the keyboard get the full height.
  static Future<T?> show<T>(
    BuildContext context, {
    String? title,
    required Widget child,
    bool scrollable = true,
  }) {
    final t = AppTheme.of(context);
    return showModalBottomSheet<T>(
      context: context,
      isScrollControlled: scrollable,
      useSafeArea: true,
      backgroundColor: t.cardSurface,
      // Rounded top corners come from the app's BottomSheetThemeData; we name
      // it explicitly so the shape is right even when this is shown from a
      // context whose Theme doesn't carry our bottomSheetTheme.
      shape: Theme.of(context).bottomSheetTheme.shape ??
          RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(t.radiusXl)),
          ),
      builder: (ctx) => _SheetShell(title: title, child: child),
    );
  }

  /// Presents a column of tappable [actions] in the app's standard bottom
  /// sheet under an optional [title] — the [PopupMenuButton] / context-menu
  /// replacement.
  ///
  /// Each row is >=56dp tall (comfortable touch target), fires a selection
  /// haptic, pops the sheet, then runs the action's `onTap`. The future
  /// completes with the [AppSheetAction] that was tapped (so the caller can
  /// also branch on the result), or `null` if the sheet was dismissed without
  /// a choice. [destructive] rows read in [AppTheme.error].
  static Future<T?> actions<T>(
    BuildContext context, {
    String? title,
    required List<AppSheetAction> actions,
  }) {
    return show<T>(
      context,
      title: title,
      // The rows are short; let the sheet hug its content instead of expanding.
      scrollable: false,
      child: _ActionList(actions: actions),
    );
  }
}

/// Shared chrome for every [AppSheet]: drag-handle, optional title, then the
/// caller's [child], all inside a [SafeArea] with consistent padding.
class _SheetShell extends StatelessWidget {
  const _SheetShell({required this.child, this.title});

  final String? title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return SafeArea(
      top: false,
      child: Padding(
        // Lift the body above the on-screen keyboard when one is present, so a
        // text field inside [child] is never hidden behind it.
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 36x4 rounded drag-handle — the universal "grab to dismiss" tell.
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: t.alternate,
                    borderRadius: BorderRadius.circular(t.radiusPill),
                  ),
                ),
              ),
              if (title != null) ...[
                const SizedBox(height: 16),
                Text(title!, style: t.titleLarge),
              ],
              const SizedBox(height: 16),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

/// The body of [AppSheet.actions] — a column of [AppSheetAction] rows.
class _ActionList extends StatelessWidget {
  const _ActionList({required this.actions});

  final List<AppSheetAction> actions;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final action in actions) _ActionRow(action: action),
      ],
    );
  }
}

/// A single >=56dp action row: leading icon, label, trailing chevron.
///
/// Tapping fires a selection haptic, pops the sheet returning [action], then
/// runs the action's `onTap` — popping first so any navigation the callback
/// performs starts from the host route, not from inside the sheet.
class _ActionRow extends StatelessWidget {
  const _ActionRow({required this.action});

  final AppSheetAction action;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final color = action.destructive ? t.error : t.primaryText;
    return Semantics(
      button: true,
      label: action.label,
      child: InkWell(
        onTap: () {
          HapticFeedback.selectionClick();
          Navigator.pop(context, action);
          action.onTap();
        },
        borderRadius: BorderRadius.circular(t.radiusMd),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
            child: Row(
              children: [
                Icon(action.icon, size: 22, color: color),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    action.label,
                    style: t.bodyLarge.copyWith(
                      color: color,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                // Leading-side chevron (RTL-correct): in an RTL layout
                // Icons.chevron_left points toward the trailing/forward edge.
                Icon(Icons.chevron_left, size: 22, color: t.secondaryText),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
