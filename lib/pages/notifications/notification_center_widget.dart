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

class NotificationCenterWidget extends StatefulWidget {
  const NotificationCenterWidget({super.key});

  @override
  State<NotificationCenterWidget> createState() => _NotificationCenterWidgetState();
}

class _NotificationCenterWidgetState extends State<NotificationCenterWidget> {
  // Community notifications are persisted server-side, so they're fetched once
  // when the center opens and merged with the on-the-fly computed alerts.
  List<AppNotification> _community = const [];

  @override
  void initState() {
    super.initState();
    _loadCommunity();
  }

  Future<void> _loadCommunity() async {
    final items = await fetchCommunityNotifications();
    // Opening the center counts as seeing them — clear the unread state.
    appBackend.markCommunityNotificationsRead().catchError((_) {});
    if (!mounted) return;
    setState(() => _community = items);
  }

  void _dismissAll(AppState appState, List<AppNotification> notifs) {
    for (final n in notifs) {
      appState.dismissNotification(n.id);
    }
    setState(() {});
  }

  void _dismiss(AppState appState, String id) {
    appState.dismissNotification(id);
    setState(() {});
  }

  void _onTap(BuildContext context, AppState appState, AppNotification n) {
    HapticFeedback.lightImpact();
    if (n.planId != null) {
      context.pushNamed('PlanDetail', pathParameters: {'planId': n.planId!});
    } else if (n.routeName != null) {
      if (n.category != null) {
        appState.setCategory(n.category!);
      }
      context.pushNamed(n.routeName!, pathParameters: n.pathParameters ?? const {});
    }
  }

  (IconData, Color) _kindStyle(AppTheme ffTheme, NotifKind kind) {
    return switch (kind) {
      NotifKind.renewal => (Icons.alarm_rounded, ffTheme.warning),
      NotifKind.betterDeal => (Icons.lightbulb_rounded, ffTheme.primary),
      NotifKind.savings => (Icons.trending_down_rounded, ffTheme.success),
      NotifKind.meeting => (Icons.videocam_rounded, ffTheme.brandAccent),
      NotifKind.community => (Icons.forum_rounded, ffTheme.brandAccent),
      NotifKind.info => (Icons.info_rounded, ffTheme.info),
    };
  }

  /// Hebrew relative time for community notifications.
  String _timeAgo(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 1) return 'הרגע';
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
    ]..sort((a, b) => b.priority.compareTo(a.priority));

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
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
          ? const EmptyState(
              icon: Icons.notifications_none_rounded,
              headline: 'הכל מעודכן',
              subtitle: 'אין התראות חדשות כרגע',
            )
          : ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              itemCount: notifs.length,
              itemBuilder: (context, i) {
                final n = notifs[i];
                final (icon, iconColor) = _kindStyle(ffTheme, n.kind);
                return _NotifCard(
                  notification: n,
                  icon: icon,
                  iconColor: iconColor,
                  ffTheme: ffTheme,
                  timeLabel: n.createdAt == null ? null : _timeAgo(n.createdAt!),
                  onTap: () => _onTap(context, appState, n),
                  onDismiss: () => _dismiss(appState, n.id),
                  delay: (i * 60).ms,
                );
              },
            ),
    );
  }
}

class _NotifCard extends StatelessWidget {
  const _NotifCard({
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(15),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(15),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: ffTheme.alternate),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: iconColor.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
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
                IconButton(
                  icon: Icon(Icons.close_rounded, size: 18, color: ffTheme.secondaryText),
                  tooltip: 'הסר',
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                  onPressed: onDismiss,
                ),
              ],
            ),
          ),
        ),
      ),
    )
        .animate(delay: delay)
        .fadeIn(duration: 280.ms, curve: Curves.easeOut)
        .slideY(begin: 0.05, end: 0, duration: 280.ms, curve: Curves.easeOut);
  }
}
