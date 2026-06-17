import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../app_state.dart';
import '../../services/support_ticket_service.dart';
import '../../widgets/pressable.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SupportTicketWidget extends StatefulWidget {
  final String ticketId;

  const SupportTicketWidget({
    super.key,
    required this.ticketId,
  });

  @override
  State<SupportTicketWidget> createState() => _SupportTicketWidgetState();
}

class _SupportTicketWidgetState extends State<SupportTicketWidget> {
  late SupportTicketService _service;
  StreamSubscription<List<SupportMessage>>? _messagesSubscription;
  StreamSubscription<SupportTicket>? _ticketSubscription;

  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  bool _initializing = true;
  String? _resolvedTicketId;
  bool _isTyping = false;
  List<SupportMessage> _messages = [];
  SupportTicket? _ticket;
  String? _error;

  final List<String> _quickReplies = [
    'חבר אותי לנציג אנושי',
    'מתי מחדשת התוכנית שלי?',
    'יש לי עסקאות טובות יותר?',
    'איך אני משנה את התוכנית שלי?',
  ];

  @override
  void initState() {
    super.initState();
    _service = SupportTicketService(Supabase.instance.client);
    _init();
  }

  Future<void> _init() async {
    // Tickets are RLS-scoped to the Supabase auth uid (anonymous users have one
    // too), so that's the identity we create/open and message against.
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null || userId.isEmpty) {
      if (mounted) {
        setState(() {
          _error = 'יש להתחבר כדי לפתוח צ׳אט תמיכה.';
          _initializing = false;
        });
      }
      return;
    }
    try {
      // 'new' is the placeholder the FAB passes — resolve it to a real open
      // ticket; an explicit id is used as-is.
      final id = widget.ticketId == 'new'
          ? await _service.createOrOpenTicket(userId)
          : widget.ticketId;
      if (!mounted) return;
      _resolvedTicketId = id;
      Provider.of<AppState>(context, listen: false).setSupportTicketId(id);
      _subscribe(id);
      setState(() => _initializing = false);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'שירות התמיכה אינו זמין כעת. נסו שוב מאוחר יותר.';
        _initializing = false;
      });
    }
  }

  void _subscribe(String ticketId) {
    _messagesSubscription = _service.messageStream(ticketId).listen(
      (messages) {
        if (mounted) {
          setState(() {
            _messages = messages;
            _error = null;
          });
          _scrollToBottom();
        }
      },
      onError: (e) {
        if (mounted) {
          setState(() => _error = 'שגיאה בטעינת ההודעות.');
        }
      },
    );

    _ticketSubscription = _service.ticketStream(ticketId).listen(
      (ticket) {
        if (mounted) {
          setState(() => _ticket = ticket);
        }
      },
      onError: (e) {
        debugPrint('Ticket stream error: $e');
      },
    );
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    _messagesSubscription?.cancel();
    _ticketSubscription?.cancel();
    super.dispose();
  }

  Future<void> _sendMessage(String text) async {
    if (text.trim().isEmpty || _isTyping || _initializing) return;
    final ticketId = _resolvedTicketId;
    if (ticketId == null) return;

    _inputCtrl.clear();

    setState(() => _isTyping = true);
    _scrollToBottom();

    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null || userId.isEmpty) throw Exception('not signed in');

      final result = await _service.sendMessage(ticketId, userId, text);

      if (result['escalated'] == true && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('הבקשה הועברה לטיפול נציג אנושי'),
            duration: Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'שליחת ההודעה נכשלה. נסו שוב.');
      }
    } finally {
      if (mounted) {
        setState(() => _isTyping = false);
      }
    }
  }

  /// Escalate the conversation to a human rep (the dedicated quick-reply chip).
  Future<void> _escalate() async {
    final ticketId = _resolvedTicketId;
    if (ticketId == null || _isTyping) return;
    setState(() => _isTyping = true);
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null || userId.isEmpty) throw Exception('not signed in');
      await _service.escalateToHuman(ticketId, userId, '');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('מעבירים אתכם לנציג אנושי…'),
            duration: Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _error = 'המעבר לנציג נכשל. נסו שוב.');
    } finally {
      if (mounted) setState(() => _isTyping = false);
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  bool _shouldShowQuickReplies() {
    return _ticket?.status != 'human_assigned' && !_isTyping;
  }

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.of(context);
    final isEscalated = _ticket?.status == 'human_assigned';

    return Scaffold(
      appBar: AppBar(
        title: const Text('תמיכה'),
        backgroundColor: theme.primary,
        elevation: 0,
        actions: [
          if (isEscalated)
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Center(
                child: Text(
                  'מחובר/ת לנציג',
                  style: theme.labelSmall.copyWith(color: Colors.white),
                ),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          if (_error != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: theme.error.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(theme.radiusMd),
                border: Border.all(color: theme.error.withValues(alpha: 0.25)),
              ),
              child: Row(
                children: [
                  Icon(Icons.error_outline_rounded, size: 18, color: theme.error),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _error!,
                      style: theme.bodySmall.copyWith(
                        color: theme.error,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          Expanded(
            child: _initializing
                ? _buildInitLoading(theme)
                : _messages.isEmpty
                ? _buildEmptyState(theme)
                : ListView.builder(
                    controller: _scrollCtrl,
                    padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
                    itemCount: _messages.length + (_isTyping ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == _messages.length) {
                        return _buildTypingIndicator(theme);
                      }
                      return _buildMessageBubble(_messages[index], theme);
                    },
                  ),
          ),
          if (_shouldShowQuickReplies())
            _buildQuickReplies(theme),
          _buildInputArea(theme, isEscalated),
        ],
      ),
    );
  }

  Widget _buildInitLoading(AppTheme theme) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 28,
            height: 28,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              valueColor: AlwaysStoppedAnimation(theme.primary),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'מתחברים לתמיכה…',
            style: theme.bodySmall.copyWith(color: theme.secondaryText),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(AppTheme theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                color: theme.accent1,
                shape: BoxShape.circle,
                border: Border.all(color: theme.alternate.withValues(alpha: 0.4)),
                boxShadow: theme.shadowGlass,
              ),
              child: Icon(
                Icons.support_agent_rounded,
                size: 40,
                color: theme.primary,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'שלום, איך אפשר לעזור?',
              textAlign: TextAlign.center,
              style: theme.titleLarge.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 280),
              child: Text(
                'שאלו אותי כל דבר על המסלולים או החשבון שלכם',
                textAlign: TextAlign.center,
                style: theme.bodyMedium.copyWith(
                  color: theme.secondaryText,
                  height: 1.45,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageBubble(SupportMessage msg, AppTheme theme) {
    final isUser = msg.role == 'user';
    final isHuman = msg.role == 'human';

    final Color bgColor;
    final Color textColor;
    final Color? borderColor;
    final Alignment alignment;
    final BorderRadiusGeometry borderRadius;

    if (isUser) {
      bgColor = theme.primary;
      textColor = Colors.white;
      borderColor = null;
      alignment = Alignment.centerRight;
      borderRadius = const BorderRadius.only(
        topLeft: Radius.circular(18),
        topRight: Radius.circular(4),
        bottomLeft: Radius.circular(18),
        bottomRight: Radius.circular(18),
      );
    } else {
      // Human-rep replies get the amber VALUE tint so a real person reads as
      // special; the AI assistant sits on a clean white glass card.
      bgColor = isHuman ? theme.saving.withValues(alpha: 0.12) : Colors.white;
      textColor = theme.primaryText;
      borderColor = isHuman ? theme.saving.withValues(alpha: 0.35) : null;
      alignment = Alignment.centerLeft;
      borderRadius = const BorderRadius.only(
        topLeft: Radius.circular(4),
        topRight: Radius.circular(18),
        bottomLeft: Radius.circular(18),
        bottomRight: Radius.circular(18),
      );
    }

    return Align(
      alignment: alignment,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(
          crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            if (isHuman)
              Padding(
                padding: const EdgeInsetsDirectional.only(bottom: 4, start: 2),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.verified_user_rounded, size: 13, color: theme.savingDark),
                    const SizedBox(width: 4),
                    Text(
                      'נציג אנושי',
                      style: theme.labelSmall.copyWith(
                        color: theme.savingDark,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.75,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: bgColor,
                borderRadius: borderRadius,
                border: borderColor != null ? Border.all(color: borderColor) : null,
                boxShadow: isUser ? null : theme.shadowSoft,
              ),
              child: Text(
                msg.messageText,
                style: theme.bodyMedium.copyWith(color: textColor, height: 1.45),
              ),
            ),
            Padding(
              padding: const EdgeInsetsDirectional.only(top: 4, start: 4, end: 4),
              child: Text(
                _formatTime(msg.createdAt),
                style: theme.labelSmall.copyWith(
                  color: theme.secondaryText.withValues(alpha: 0.8),
                  fontSize: 11,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTypingIndicator(AppTheme theme) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(4),
              topRight: Radius.circular(18),
              bottomLeft: Radius.circular(18),
              bottomRight: Radius.circular(18),
            ),
            boxShadow: theme.shadowSoft,
          ),
          child: _TypingDots(color: theme.secondaryText.withValues(alpha: 0.6)),
        ),
      ),
    );
  }

  Widget _buildQuickReplies(AppTheme theme) {
    return SizedBox(
      height: 48,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        itemCount: _quickReplies.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final reply = _quickReplies[i];
          // The hand-off-to-human chip is a special VALUE outcome → amber.
          final isEscalation = reply == 'חבר אותי לנציג אנושי';
          final accent = isEscalation ? theme.savingDark : theme.primary;
          return Semantics(
            button: true,
            label: 'תשובה מהירה: $reply',
            child: Pressable(
              onTap: () => isEscalation ? _escalate() : _sendMessage(reply),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(theme.radiusPill),
                  border: Border.all(color: accent.withValues(alpha: 0.25)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (isEscalation) ...[
                      Icon(Icons.headset_mic_rounded, size: 14, color: accent),
                      const SizedBox(width: 6),
                    ],
                    Text(
                      reply,
                      style: theme.labelSmall.copyWith(
                        color: accent,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildInputArea(AppTheme theme, bool isEscalated) {
    final disabled = _isTyping;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          top: BorderSide(color: theme.alternate.withValues(alpha: 0.6)),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _inputCtrl,
                enabled: !isEscalated || _ticket?.status == 'human_assigned',
                textDirection: TextDirection.rtl,
                style: theme.bodyMedium.copyWith(color: theme.primaryText),
                decoration: InputDecoration(
                  hintText: 'הקלידו הודעה...',
                  hintTextDirection: TextDirection.rtl,
                  hintStyle: theme.bodyMedium.copyWith(color: theme.secondaryText),
                  filled: true,
                  fillColor: theme.accent1,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(theme.radiusXl),
                    borderSide: BorderSide(color: theme.alternate.withValues(alpha: 0.6)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(theme.radiusXl),
                    borderSide: BorderSide(color: theme.alternate.withValues(alpha: 0.6)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(theme.radiusXl),
                    borderSide: BorderSide(color: theme.primary, width: 1.5),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                maxLines: null,
                minLines: 1,
              ),
            ),
            const SizedBox(width: 8),
            Semantics(
              button: true,
              label: 'שלח הודעה',
              child: Opacity(
                opacity: disabled ? 0.4 : 1.0,
                child: Pressable(
                  onTap: disabled ? null : () => _sendMessage(_inputCtrl.text),
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: theme.primary,
                      shape: BoxShape.circle,
                      boxShadow: disabled ? null : theme.shadowPrimary,
                    ),
                    child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final msgDate = DateTime(time.year, time.month, time.day);

    String dateStr;
    if (msgDate == today) {
      dateStr = 'היום';
    } else if (msgDate == yesterday) {
      dateStr = 'אתמול';
    } else {
      dateStr = '${time.day}/${time.month}';
    }

    final hh = time.hour.toString().padLeft(2, '0');
    final mm = time.minute.toString().padLeft(2, '0');
    return '$hh:$mm • $dateStr';
  }
}

/// Three softly pulsing dots — the "agent is typing" affordance. A single
/// shared controller drives a staggered fade per dot; honours the platform's
/// reduced-motion setting by holding the dots steady instead of looping.
class _TypingDots extends StatefulWidget {
  const _TypingDots({required this.color});

  final Color color;

  @override
  State<_TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<_TypingDots>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduceMotion) {
      _ctrl.stop();
    } else if (!_ctrl.isAnimating) {
      _ctrl.repeat();
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(3, (i) {
        return Padding(
          padding: EdgeInsetsDirectional.only(start: i == 0 ? 0 : 4),
          child: AnimatedBuilder(
            animation: _ctrl,
            builder: (context, _) {
              // Each dot peaks a third of a cycle after the previous one.
              final phase = (_ctrl.value - i * 0.2) % 1.0;
              final t = (1 - (phase * 2 - 1).abs()).clamp(0.0, 1.0);
              final opacity = 0.35 + 0.55 * t;
              return Opacity(
                opacity: opacity,
                child: Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: widget.color,
                    shape: BoxShape.circle,
                  ),
                ),
              );
            },
          ),
        );
      }),
    );
  }
}
