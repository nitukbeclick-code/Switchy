import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';

import '../../app_state.dart';
import '../../core/nav.dart';
import '../../services/backend/local_backend.dart';
import '../../services/notifications.dart';
import '../../theme/app_theme.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/refreshable_scroll.dart';

class NotificationCenterWidget extends StatefulWidget {
  const NotificationCenterWidget({super.key});

  @override
  State<NotificationCenterWidget> createState() => _NotificationCenterWidgetState();
}

class _NotificationCenterWidgetState extends State<NotificationCenterWidget> {
  // Community notifications are persisted server-side, so they're fetched once
  // when the center opens and merged with the on-the-fly computed alerts.
  List<AppNotification> _community = const [];

  // The community fetch is in-flight until the first load completes. While it
  // runs AND no computed alerts exist we show a spinner rather than the "all
  // caught up" empty state — otherwise the empty state would flash and then be
  // replaced the moment a server-side reply/mention lands.
  bool _loadingCommunity = true;

  // Swipe-to-dismiss is staged locally first: an id lands here the moment its
  // card is swiped (or its X is tapped) so it disappears from the list, but the
  // commit to AppState.dismissNotification — which persists and is NOT
  // reversible — is deferred until the undo SnackBar closes. Until then the
  // dismissal is purely local, so a server-side community item is never
  // irrecoverably deleted; it's just hidden among the retained set and an Undo
  // brings it right back.
  final Set<String> _pendingDismiss = {};

  @override
  void initState() {
    super.initState();
    _loadCommunity();
  }

  Future<void> _loadCommunity() async {
    // [fetchCommunityNotifications] already degrades a backend failure to an
    // empty list, but guard with try/finally so any unexpected throw still
    // clears the in-flight flag — the spinner must never hang forever, and the
    // computed alerts (+ the honest "all caught up" state) always get to show.
    List<AppNotification> items = const [];
    try {
      items = await fetchCommunityNotifications();
      // Opening the center counts as seeing them — clear the unread state.
      appBackend.markCommunityNotificationsRead().catchError((_) {});
    } catch (_) {
      // Degrade silently to the computed alerts; nothing fabricated.
    } finally {
      if (mounted) {
        setState(() {
          _community = items;
          _loadingCommunity = false;
        });
      }
    }
  }

  void _dismissAll(AppState appState, List<AppNotification> notifs) {
    for (final n in notifs) {
      appState.dismissNotification(n.id);
    }
    setState(() {
      _pendingDismiss.clear();
    });
  }

  /// Stage [n] as dismissed locally and offer an Undo. The dismissal is only
  /// committed to AppState (persisted, irreversible) once the SnackBar closes
  /// without an undo — so swiping a server-side community item away never
  /// irrecoverably deletes it; it's retained and restorable until then.
  void _dismiss(AppState appState, AppNotification n) {
    HapticFeedback.mediumImpact();
    setState(() {
      _pendingDismiss.add(n.id);
    });

    final messenger = ScaffoldMessenger.of(context);
    final ffTheme = AppTheme.of(context);
    messenger.clearSnackBars();
    messenger
        .showSnackBar(
          SnackBar(
            content: const Text('ההתראה הוסרה'),
            duration: const Duration(seconds: 4),
            behavior: SnackBarBehavior.floating,
            action: SnackBarAction(
              label: 'ביטול',
              textColor: ffTheme.brandAccent,
              onPressed: () {
                // Pure local restore — the commit below never ran, so nothing
                // to undo server-side: just un-stage it.
                if (mounted) {
                  setState(() => _pendingDismiss.remove(n.id));
                }
              },
            ),
          ),
        )
        .closed
        .then((reason) {
      // Closed without an explicit undo → commit the dismissal for real.
      if (reason != SnackBarClosedReason.action &&
          _pendingDismiss.contains(n.id)) {
        appState.dismissNotification(n.id);
        if (mounted) {
          setState(() => _pendingDismiss.remove(n.id));
        }
      }
    });
  }

  void _onTap(BuildContext context, AppState appState, AppNotification n) {
    HapticFeedback.lightImpact();
    // Honor the notification's category context regardless of which branch it
    // takes — the savings notif carries BOTH a planId and a category, so the
    // global comparison context should follow it into the plan, not be dropped.
    if (n.category != null) {
      appState.setCategory(n.category!);
    }
    if (n.planId != null) {
      // betterDeal/savings carry a planId (not pathParameters) so the center
      // always lands the user on a concrete plan detail — never a dead-end.
      context.pushNamed('PlanDetail', pathParameters: {'planId': n.planId!});
    } else if (n.routeName != null) {
      context.pushNamed(n.routeName!, pathParameters: n.pathParameters ?? const {});
    }
  }

  (IconData, Color) _kindStyle(AppTheme ffTheme, NotifKind kind) {
    return switch (kind) {
      // Amber = VALUE for both money-opportunity kinds: a "better deal" and a
      // concrete savings figure are the screen's value moments, so they share
      // the amber tell. Amber is fixed-hue, so it stays vivid against the
      // tinted badge in BOTH light and dark (the theme-aware ink `primary` /
      // `success` would dim to off-white/green on dark here).
      NotifKind.renewal => (Icons.alarm_rounded, ffTheme.warning),
      NotifKind.betterDeal => (Icons.lightbulb_rounded, ffTheme.saving),
      NotifKind.savings => (Icons.trending_down_rounded, ffTheme.saving),
      // Green = ACTION: a live meeting / community reply is something to open.
      NotifKind.meeting => (Icons.videocam_rounded, ffTheme.brandAccent),
      NotifKind.community => (Icons.forum_rounded, ffTheme.brandAccent),
      NotifKind.info => (Icons.info_rounded, ffTheme.info),
    };
  }

  /// Hebrew relative time for community notifications. Clamps a (clock-skewed)
  /// future timestamp to "הרגע" rather than rendering "לפני -3 דקות".
  String _timeAgo(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.isNegative || diff.inMinutes < 1) return 'הרגע';
    if (diff.inMinutes == 1) return 'לפני דקה';
    if (diff.inMinutes < 60) return 'לפני ${diff.inMinutes} דקות';
    if (diff.inHours == 1) return 'לפני שעה';
    if (diff.inHours < 24) return 'לפני ${diff.inHours} שעות';
    if (diff.inDays == 1) return 'אתמול';
    return 'לפני ${diff.inDays} ימים';
  }

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    final ffTheme = AppTheme.of(context);
    final notifs = [
      ...computeNotifications(appState),
      ..._community.where((n) => !appState.isNotificationDismissed(n.id)),
    ]
        // A locally-staged swipe hides the card immediately, before the
        // AppState commit lands — filter it here so the undo window doesn't
        // leave a ghost row.
        .where((n) => !_pendingDismiss.contains(n.id))
        .toList()
      ..sort((a, b) => b.priority.compareTo(a.priority));

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.cardSurface,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: ffTheme.primaryText, size: 20),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: Text(
          'התראות',
          style: ffTheme.titleMedium,
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: ffTheme.alternate),
        ),
        actions: [
          if (notifs.isNotEmpty)
            TextButton(
              onPressed: () => _dismissAll(appState, notifs),
              child: Text(
                'נקה הכל',
                style: ffTheme.bodyMedium.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w600),
              ),
            ),
        ],
      ),
      body: notifs.isEmpty
          // Still waiting on the community fetch and nothing computed yet —
          // a spinner avoids flashing the "all caught up" state then replacing
          // it the instant a stored reply/mention arrives.
          ? _loadingCommunity
              ? Center(
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    valueColor: AlwaysStoppedAnimation(ffTheme.brandAccent),
                  ),
                )
              // Wrap the empty state in a pull-to-refresh too, so an idle inbox
              // can still be pulled to re-check for fresh community items. The
              // RefreshableScroll's AlwaysScrollableScrollPhysics lets the
              // short, single-child content over-drag to fire the gesture.
              : RefreshableScroll(
                  onRefresh: _loadCommunity,
                  slivers: [
                    SliverFillRemaining(
                      hasScrollBody: false,
                      child: EmptyState(
                        icon: Icons.notifications_none_rounded,
                        headline: 'הכל מעודכן',
                        subtitle: 'אין התראות חדשות כרגע. נעדכן אתכם כשמבצע מסתיים או כשנמצא לכם עסקה זולה יותר.',
                        // Never dead-end: an idle inbox still routes to the core
                        // flow — a fresh comparison — so the screen always has
                        // somewhere to go.
                        ctaLabel: 'השוואת מסלולים',
                        onCtaTap: () async => context.goNamed('Results'),
                      ),
                    ),
                  ],
                )
          // Pull-to-refresh re-runs the community load; AlwaysScrollableScroll
          // physics (inside RefreshableScroll) guarantees the gesture fires even
          // when the list is short.
          : RefreshableScroll(
              onRefresh: _loadCommunity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              slivers: [
                SliverList.builder(
                  itemCount: notifs.length,
                  itemBuilder: (context, i) {
                    final n = notifs[i];
                    final (icon, iconColor) = _kindStyle(ffTheme, n.kind);
                    return _NotifCard(
                      // Keyed so Dismissible removal animates the right row and
                      // the list reconciles correctly after a swipe.
                      key: ValueKey(n.id),
                      notification: n,
                      icon: icon,
                      iconColor: iconColor,
                      ffTheme: ffTheme,
                      timeLabel: n.createdAt == null ? null : _timeAgo(n.createdAt!),
                      onTap: () => _onTap(context, appState, n),
                      onDismiss: () => _dismiss(appState, n),
                      // Emil: list reveals stagger in the 30–80ms band. 40ms per
                      // row reads as a brisk cascade without the inbox feeling
                      // slow to settle.
                      delay: (i.clamp(0, 8) * 40).ms,
                    );
                  },
                ),
              ],
            ),
    );
  }
}

class _NotifCard extends StatelessWidget {
  const _NotifCard({
    super.key,
    required this.notification,
    required this.icon,
    required this.iconColor,
    required this.ffTheme,
    required this.onTap,
    required this.onDismiss,
    required this.delay,
    this.timeLabel,
  });

  final AppNotification notification;
  final IconData icon;
  final Color iconColor;
  final AppTheme ffTheme;
  final VoidCallback onTap;
  final VoidCallback onDismiss;
  final Duration delay;
  final String? timeLabel; // relative time, shown for stored (community) notifs

  @override
  Widget build(BuildContext context) {
    // Emil: reduced-motion KEEPS the fade-in but DROPS the 8px slide transform,
    // so users who asked for less movement still get a clean entrance with no
    // translation. Captured once here and branched at the end of build.
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final card = Padding(
      padding: const EdgeInsets.only(bottom: 12),
      // Swipe end→start (RTL: left) to dismiss. The dismissal is staged locally
      // with an undo SnackBar (see [_dismiss]) — it never irrecoverably deletes
      // a server-side community item. confirmDismiss runs the handler then
      // returns false so the row leaves via the list's own filter+animation,
      // keeping a single source of truth for whether the card is gone.
      child: Dismissible(
        key: ValueKey('dismiss-${notification.id}'),
        direction: DismissDirection.endToStart,
        background: _DismissBackground(ffTheme: ffTheme),
        confirmDismiss: (_) async {
          onDismiss();
          return false;
        },
        // The whole card is tappable (deep-links into a plan/route), so announce
        // it as a button to screen readers with the notification's title + body —
        // the inner texts are otherwise read as inert labels with no affordance.
        child: Semantics(
          button: true,
          label: '${notification.title}. ${notification.body}',
          child: Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(ffTheme.radiusLg),
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(ffTheme.radiusLg),
              child: Container(
                decoration: ffTheme.cardDecoration(radius: ffTheme.radiusLg),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: iconColor.withValues(alpha: 0.12),
                        shape: BoxShape.circle,
                        border: Border.all(color: iconColor.withValues(alpha: 0.18)),
                      ),
                      child: Icon(icon, size: 22, color: iconColor),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (notification.unread) ...[
                                Padding(
                                  padding: const EdgeInsets.only(top: 6),
                                  child: Container(
                                    width: 8,
                                    height: 8,
                                    decoration: BoxDecoration(
                                      color: ffTheme.brandAccent,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 6),
                              ],
                              Expanded(
                                child: Text(
                                  notification.title,
                                  style: ffTheme.titleSmall,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            notification.body,
                            style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (timeLabel != null) ...[
                            const SizedBox(height: 4),
                            Text(
                              timeLabel!,
                              style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(width: 4),
                    // Raised to >= kMinTapTarget so the retained X clears the
                    // 48px minimum touch target.
                    IconButton(
                      icon: Icon(Icons.close_rounded, size: 18, color: ffTheme.secondaryText),
                      tooltip: 'הסר',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: kMinTapTarget,
                        minHeight: kMinTapTarget,
                      ),
                      onPressed: onDismiss,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );

    if (reduceMotion) {
      return card.animate(delay: delay).fadeIn(duration: 280.ms);
    }
    return card
        .animate(delay: delay)
        .fadeIn(duration: 280.ms, curve: Curves.easeOut)
        .slideY(begin: 0.05, end: 0, duration: 280.ms, curve: Curves.easeOut);
  }
}

/// The colored delete background revealed as a card is swiped end→start. Uses
/// the semantic [error] hue (the destructive-action red) — distinct from the
/// brand accents, which are reserved for action/value, not deletion.
class _DismissBackground extends StatelessWidget {
  const _DismissBackground({required this.ffTheme});

  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        decoration: BoxDecoration(
          color: ffTheme.error.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(ffTheme.radiusLg),
          border: Border.all(color: ffTheme.error.withValues(alpha: 0.20)),
        ),
        // end→start reveal: align the affordance to the start edge (RTL: right)
        // so it trails the swiped-away card.
        alignment: AlignmentDirectional.centerStart,
        padding: const EdgeInsetsDirectional.only(start: 24),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.delete_outline_rounded, color: ffTheme.error, size: 22),
            const SizedBox(width: 8),
            Text(
              'הסרה',
              style: ffTheme.labelMedium.copyWith(
                color: ffTheme.error,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
