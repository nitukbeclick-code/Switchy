import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';

import '../../app_state.dart';
import '../../core/nav.dart';
import '../../services/notifications.dart';
import '../../theme/app_theme.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/pressable.dart';

class NotificationCenterWidget extends StatefulWidget {
  const NotificationCenterWidget({super.key});

  @override
  State<NotificationCenterWidget> createState() => _NotificationCenterWidgetState();
}

class _NotificationCenterWidgetState extends State<NotificationCenterWidget> {
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
      NotifKind.info => (Icons.info_rounded, ffTheme.info),
      NotifKind.communityReply => (Icons.forum_rounded, ffTheme.brandAccent),
      NotifKind.communityLike => (Icons.favorite_rounded, ffTheme.saving),
      NotifKind.priceTarget => (Icons.flag_rounded, ffTheme.brandAccent),
    };
  }

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    final ffTheme = AppTheme.of(context);
    final notifs = computeNotifications(appState);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.secondaryBackground,
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
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              itemCount: notifs.length,
              itemBuilder: (context, i) {
                final n = notifs[i];
                final (icon, iconColor) = _kindStyle(ffTheme, n.kind);
                return _NotifCard(
                  notification: n,
                  icon: icon,
                  iconColor: iconColor,
                  ffTheme: ffTheme,
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
  });

  final AppNotification notification;
  final IconData icon;
  final Color iconColor;
  final AppTheme ffTheme;
  final VoidCallback onTap;
  final VoidCallback onDismiss;
  final Duration delay;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Pressable(
        onTap: onTap,
        child: Container(
          decoration: ffTheme.glassDecoration(radius: ffTheme.radiusMd),
          padding: const EdgeInsetsDirectional.fromSTEB(14, 14, 8, 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
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
                    Text(
                      notification.title,
                      style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w700),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      notification.body,
                      style: ffTheme.bodySmall.copyWith(
                        color: ffTheme.secondaryText,
                        height: 1.35,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 4),
              IconButton(
                icon: Icon(Icons.close_rounded, size: 18, color: ffTheme.secondaryText),
                tooltip: 'הסר',
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                onPressed: onDismiss,
              ),
            ],
          ),
        ),
      ),
    )
        .animate(delay: delay)
        .fadeIn(duration: 280.ms, curve: Curves.easeOut)
        .slideY(begin: 0.06, end: 0, duration: 280.ms, curve: Curves.easeOut);
  }
}
