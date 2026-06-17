import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_theme.dart';

class DigitalAgentFab extends StatefulWidget {
  final String? ticketId;
  final int unreadCount;

  const DigitalAgentFab({
    super.key,
    this.ticketId,
    this.unreadCount = 0,
  });

  @override
  State<DigitalAgentFab> createState() => _DigitalAgentFabState();
}

class _DigitalAgentFabState extends State<DigitalAgentFab> {
  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.of(context);

    // Returns a bare FloatingActionButton so it sits correctly in a host
    // Scaffold's floatingActionButton slot (positioned via the Scaffold's
    // floatingActionButtonLocation).
    return FloatingActionButton(
      heroTag: 'digital-agent-fab',
      backgroundColor: AppColors.primary,
      tooltip: 'עוזר דיגיטלי',
      onPressed: () => _openAgentChat(context),
      child: Stack(
        alignment: Alignment.center,
        children: [
          const Icon(Icons.support_agent, color: Colors.white, size: 24),
          if (widget.unreadCount > 0)
            PositionedDirectional(
              top: 0,
              end: 0,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: theme.saving, // Amber accent for notifications
                  shape: BoxShape.circle,
                ),
                constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                child: Text(
                  widget.unreadCount > 9 ? '9+' : '${widget.unreadCount}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _openAgentChat(BuildContext context) {
    final userId = Supabase.instance.client.auth.currentUser?.id;

    if (userId == null || userId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('יש להתחבר תחילה')),
      );
      return;
    }

    context.pushNamed(
      'support-ticket',
      pathParameters: {'ticketId': widget.ticketId ?? 'new'},
    );
  }
}
