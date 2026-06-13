import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_theme.dart';

class DigitalAgentFab extends StatefulWidget {
  final String? ticketId;
  final int unreadCount;

  const DigitalAgentFab({
    Key? key,
    this.ticketId,
    this.unreadCount = 0,
  }) : super(key: key);

  @override
  State<DigitalAgentFab> createState() => _DigitalAgentFabState();
}

class _DigitalAgentFabState extends State<DigitalAgentFab> {
  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.of(context);

    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(left: 16.0),
        child: FloatingActionButton(
          heroTag: 'digital-agent-fab',
          backgroundColor: theme.primary,
          tooltip: 'פנייה לתמיכה',
          onPressed: () => _openAgentChat(context),
          child: Stack(
            alignment: Alignment.center,
            children: [
              const Icon(Icons.support_agent, color: Colors.white, size: 24),
              if (widget.unreadCount > 0)
                Positioned(
                  top: 0,
                  right: 0,
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
        ),
      ),
    );
  }

  void _openAgentChat(BuildContext context) {
    final userId = Supabase.instance.client.auth.currentUser?.id;

    if (userId == null || userId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('יש להתחבר כדי לפנות לתמיכה')),
      );
      return;
    }

    context.pushNamed(
      'support-ticket',
      pathParameters: {'ticketId': widget.ticketId ?? 'new'},
    );
  }
}
