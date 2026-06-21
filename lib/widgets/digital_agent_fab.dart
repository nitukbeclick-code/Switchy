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

class _DigitalAgentFabState extends State<DigitalAgentFab>
    with SingleTickerProviderStateMixin {
  // A gentle pulse on the unread badge to draw the eye to new messages.
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.of(context);

    final unread = widget.unreadCount;
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    // Run the pulse only while there's something unread to call attention to.
    if (unread > 0 && !reduceMotion) {
      if (!_pulse.isAnimating) _pulse.repeat(reverse: true);
    } else if (_pulse.isAnimating) {
      _pulse.stop();
    }
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(left: 16.0),
        // The FAB is an ACTION affordance → it wears the green ACTION gradient
        // and glow over a transparent FAB, instead of a flat ink fill.
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: theme.accentGradient,
            boxShadow: theme.shadowAccent,
          ),
          child: FloatingActionButton(
            heroTag: 'digital-agent-fab',
            backgroundColor: Colors.transparent,
            elevation: 0,
            focusElevation: 0,
            hoverElevation: 0,
            highlightElevation: 0,
            tooltip: unread > 0
                ? 'נציג דיגיטלי — $unread הודעות חדשות'
                : 'נציג דיגיטלי',
            onPressed: () => _openAgentChat(context),
            child: Stack(
              alignment: Alignment.center,
              children: [
                const Icon(Icons.support_agent, color: Colors.white, size: 24),
                if (unread > 0)
                  Positioned(
                    top: 0,
                    right: 0,
                    child: ScaleTransition(
                      // 1.0 → ~1.18 gentle pulse; rests at 1.0 when paused.
                      scale: Tween(begin: 1.0, end: 1.18).animate(
                        CurvedAnimation(parent: _pulse, curve: Curves.easeInOut),
                      ),
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: theme.saving, // Amber VALUE accent for the badge
                          shape: BoxShape.circle,
                          // A ring so the badge stays legible on the green FAB.
                          border: Border.all(color: Colors.white, width: 1.5),
                        ),
                        constraints:
                            const BoxConstraints(minWidth: 18, minHeight: 18),
                        child: Text(
                          unread > 9 ? '9+' : '$unread',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            height: 1.0,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _openAgentChat(BuildContext context) {
    final userId = Supabase.instance.client.auth.currentUser?.id;

    if (userId == null || userId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please log in first')),
      );
      return;
    }

    context.pushNamed(
      'support-ticket',
      pathParameters: {'ticketId': widget.ticketId ?? 'new'},
    );
  }
}
