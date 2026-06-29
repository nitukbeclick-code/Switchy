import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../app_state.dart';
import '../../services/support_ticket_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// A single issue category the user can pick when opening a new ticket. The
/// [seed] is prepended to their free-text message so the support agent (and any
/// human picking the ticket up) gets the context up front.
class _IssueType {
  const _IssueType({
    required this.id,
    required this.label,
    required this.icon,
    required this.seed,
  });
  final String id;
  final String label;
  final IconData icon;
  final String seed;
}

const List<_IssueType> _issueTypes = [
  _IssueType(
    id: 'plan',
    label: 'התוכנית שלי',
    icon: Icons.sim_card_rounded,
    seed: 'שאלה על התוכנית שלי',
  ),
  _IssueType(
    id: 'billing',
    label: 'חיוב וחשבונית',
    icon: Icons.receipt_long_rounded,
    seed: 'שאלה על חיוב או חשבונית',
  ),
  _IssueType(
    id: 'switch',
    label: 'מעבר ספק',
    icon: Icons.swap_horiz_rounded,
    seed: 'שאלה על מעבר ספק',
  ),
  _IssueType(
    id: 'technical',
    label: 'תקלה טכנית',
    icon: Icons.build_rounded,
    seed: 'דיווח על תקלה טכנית',
  ),
  _IssueType(
    id: 'other',
    label: 'אחר',
    icon: Icons.help_outline_rounded,
    seed: 'פנייה כללית',
  ),
];

class SupportTicketWidget extends StatefulWidget {
  /// Either an existing ticket id, or the sentinel `'new'` (also accepts an
  /// empty value) to open the in-page compose flow.
  final String ticketId;

  const SupportTicketWidget({
    super.key,
    required this.ticketId,
  });

  @override
  State<SupportTicketWidget> createState() => _SupportTicketWidgetState();
}

class _SupportTicketWidgetState extends State<SupportTicketWidget> {
  SupportTicketService? _service;
  StreamSubscription<List<SupportMessage>>? _messagesSubscription;
  StreamSubscription<SupportTicket>? _ticketSubscription;

  final _inputCtrl = TextEditingController();
  final _composeCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  /// The resolved real ticket id, once we either received one or created one via
  /// [SupportTicketService.createOrOpenTicket]. Null while still composing.
  String? _resolvedTicketId;

  bool _isTyping = false;
  bool _isOpening = false; // creating the ticket from the compose flow
  String? _selectedIssueId;
  List<SupportMessage> _messages = [];
  SupportTicket? _ticket;
  String? _error;

  final List<String> _quickReplies = [
    'חבר אותי לנציג אנושי',
    'מתי מחדשת התוכנית שלי?',
    'יש לי עסקאות טובות יותר?',
    'איך אני משנה את התוכנית שלי?',
  ];

  /// True until the user has actually opened/loaded a real ticket — i.e. we are
  /// showing the issue-type picker + first-message compose form.
  bool get _isComposing => _resolvedTicketId == null;

  @override
  void initState() {
    super.initState();
    final initial = widget.ticketId.trim();
    // Only an existing, real ticket id binds the live streams. The `'new'`
    // sentinel (or an empty value) drops us into the compose flow instead — we
    // must NOT stream against a non-existent id (it never resolves and the user
    // could never start a conversation).
    if (initial.isNotEmpty && initial != 'new') {
      _resolvedTicketId = initial;
      _bindStreams(initial);
    }
  }

  void _bindStreams(String ticketId) {
    _service ??= SupportTicketService(Supabase.instance.client);
    _messagesSubscription = _service!.messageStream(ticketId).listen(
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
          setState(() => _error = 'אירעה שגיאה בטעינת ההודעות. נסו שוב.');
        }
      },
    );

    _ticketSubscription = _service!.ticketStream(ticketId).listen(
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
    _composeCtrl.dispose();
    _scrollCtrl.dispose();
    _messagesSubscription?.cancel();
    _ticketSubscription?.cancel();
    super.dispose();
  }

  /// Opens (or re-opens) a ticket from the compose flow: create/find the ticket,
  /// send the composed first message, then bind the live streams so the page
  /// becomes the normal chat view.
  Future<void> _openTicket() async {
    if (_isOpening) return;
    final text = _composeCtrl.text.trim();
    if (text.isEmpty) {
      setState(() => _error = 'כתבו לנו במה נוכל לעזור לפני השליחה.');
      return;
    }

    setState(() {
      _isOpening = true;
      _error = null;
    });

    try {
      final appState = Provider.of<AppState>(context, listen: false);
      final userId = appState.userId;
      if (userId == null || userId.isEmpty) {
        throw Exception('not-logged-in');
      }

      final service = _service ??= SupportTicketService(Supabase.instance.client);
      final ticketId = await service.createOrOpenTicket(userId);

      // Prefix the chosen issue type so the agent/human has context.
      final issue = _selectedIssueId == null
          ? null
          : _issueTypes.firstWhere((t) => t.id == _selectedIssueId);
      final composed = issue == null ? text : '[${issue.seed}] $text';

      // Remember the open ticket so the FAB can deep-link straight back to it.
      appState.setSupportTicketId(ticketId);

      // Switch into chat mode + bind streams BEFORE awaiting the send, so the
      // user immediately sees their conversation surface.
      if (!mounted) return;
      setState(() {
        _resolvedTicketId = ticketId;
        _isTyping = true;
      });
      _bindStreams(ticketId);

      await service.sendMessage(ticketId, userId, composed);
    } catch (e) {
      if (mounted) {
        final msg = e.toString().contains('not-logged-in')
            ? 'צריך להתחבר כדי לפתוח פנייה לתמיכה.'
            : 'לא הצלחנו לפתוח את הפנייה. נסו שוב בעוד רגע.';
        setState(() {
          _error = msg;
          // Roll back into compose mode if we never managed to bind a ticket.
          if (_messagesSubscription == null) _resolvedTicketId = null;
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isOpening = false;
          _isTyping = false;
        });
      }
    }
  }

  Future<void> _sendMessage(String text) async {
    if (text.trim().isEmpty || _isTyping) return;
    final ticketId = _resolvedTicketId;
    if (ticketId == null || _ticket == null) return;

    _inputCtrl.clear();

    setState(() => _isTyping = true);
    _scrollToBottom();

    try {
      final appState = Provider.of<AppState>(context, listen: false);
      final userId = appState.userId;
      if (userId == null) throw Exception('User not logged in');

      final result = await _service!.sendMessage(ticketId, userId, text);

      if (result['escalated'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('הפנייה שלכם הועברה לנציג אנושי'),
              duration: Duration(seconds: 3),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'לא הצלחנו לשלוח את ההודעה. נסו שוב.');
      }
    } finally {
      if (mounted) {
        setState(() => _isTyping = false);
      }
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

  /// Maps a raw ticket status to friendly Hebrew copy + a colour + an icon, so
  /// the status banner reads at a glance instead of leaking the DB enum.
  ({String label, String detail, IconData icon, Color color}) _statusMeta(AppTheme theme) {
    switch (_ticket?.status) {
      case 'human_assigned':
        return (
          label: 'מחובר/ת לנציג אנושי',
          detail: 'נציג מטעמנו עונה לך כעת',
          icon: Icons.headset_mic_rounded,
          color: theme.brandAccent,
        );
      case 'resolved':
        return (
          label: 'הפנייה נסגרה',
          detail: 'אפשר לכתוב שוב כדי לפתוח שיחה חדשה',
          icon: Icons.check_circle_rounded,
          color: theme.success,
        );
      case 'open':
        return (
          label: 'הפנייה נפתחה',
          detail: 'מתחילים — כתבו לנו במה אפשר לעזור',
          icon: Icons.mark_chat_unread_rounded,
          color: theme.secondaryText,
        );
      case 'agent_active':
      default:
        return (
          label: 'עוזר חכם זמין',
          detail: 'מענה מיידי 24/7 • אפשר תמיד לבקש נציג אנושי',
          icon: Icons.bolt_rounded,
          color: theme.brandAccent,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.of(context);
    final isEscalated = _ticket?.status == 'human_assigned';

    return Scaffold(
      backgroundColor: theme.background,
      appBar: AppBar(
        // Inherit the themed app-bar (ink on light, darkSurface on dark) so the
        // header is correct in both modes instead of forcing white-on-ink.
        title: Text(_isComposing ? 'פתיחת פנייה' : 'תמיכה'),
        elevation: 0,
        actions: [
          if (isEscalated)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 12),
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: theme.brandAccentTint,
                    borderRadius: BorderRadius.circular(theme.radiusPill),
                    border: Border.all(color: theme.brandAccent.withValues(alpha: 0.30)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.headset_mic_rounded, size: 13, color: theme.brandAccentText),
                      const SizedBox(width: 5),
                      Text(
                        'מחובר לנציג',
                        style: theme.labelSmall.copyWith(
                            color: theme.brandAccentText, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
      body: _isComposing ? _buildComposeFlow(theme) : _buildChatView(theme, isEscalated),
    );
  }

  // ── Compose flow (open a new ticket) ────────────────────────────────────────

  Widget _buildComposeFlow(AppTheme theme) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          // Intro header.
          Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  gradient: theme.accentGradient,
                  borderRadius: BorderRadius.circular(theme.radiusMd),
                  boxShadow: theme.shadowAccent,
                ),
                child: const Icon(Icons.support_agent_rounded, size: 28, color: Colors.white),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('איך אפשר לעזור?',
                        style: theme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(
                      'מענה מיידי 24/7 — ותמיד אפשר לעבור לנציג אנושי.',
                      style: theme.bodySmall.copyWith(color: theme.secondaryText, height: 1.35),
                    ),
                  ],
                ),
              ),
            ],
          ).animate().fadeIn(duration: 300.ms).slideY(begin: -0.08, end: 0),

          const SizedBox(height: 22),

          // Issue-type picker.
          Text('על מה הפנייה?',
              style: theme.titleSmall.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (var i = 0; i < _issueTypes.length; i++)
                _buildIssueChip(theme, _issueTypes[i], i),
            ],
          ),

          const SizedBox(height: 22),

          // Free-text first message.
          Text('פרטו בקצרה',
              style: theme.titleSmall.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          TextField(
            controller: _composeCtrl,
            textDirection: TextDirection.rtl,
            minLines: 4,
            maxLines: 8,
            textInputAction: TextInputAction.newline,
            enabled: !_isOpening,
            onChanged: (_) {
              // Clear a stale validation error as soon as the user types.
              if (_error != null) setState(() => _error = null);
            },
            decoration: InputDecoration(
              hintText: 'כתבו כאן את השאלה או הבעיה...',
              hintTextDirection: TextDirection.rtl,
              filled: true,
              fillColor: theme.cardSurface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(theme.radiusMd),
                borderSide: BorderSide(color: theme.alternate.withValues(alpha: 0.12)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(theme.radiusMd),
                borderSide: BorderSide(color: theme.alternate.withValues(alpha: 0.12)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(theme.radiusMd),
                borderSide: BorderSide(color: theme.brandAccent, width: 1.5),
              ),
              contentPadding: const EdgeInsets.all(16),
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: 12),
            _buildErrorBox(theme, _error!),
          ],

          const SizedBox(height: 20),

          // Submit.
          Semantics(
            button: true,
            label: 'פתיחת פנייה ושליחה',
            child: SizedBox(
              width: double.infinity,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: _isOpening ? null : theme.accentGradient,
                  color: _isOpening ? theme.alternate.withValues(alpha: 0.2) : null,
                  borderRadius: BorderRadius.circular(theme.radiusPill),
                  boxShadow: _isOpening ? null : theme.shadowAccent,
                ),
                child: TextButton.icon(
                  onPressed: _isOpening ? null : _openTicket,
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    foregroundColor: Colors.white,
                    disabledForegroundColor: Colors.white.withValues(alpha: 0.7),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(theme.radiusPill),
                    ),
                  ),
                  icon: _isOpening
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.send_rounded, size: 18),
                  label: Text(
                    _isOpening ? 'פותח/ת פנייה...' : 'פתחו פנייה',
                    style: theme.labelLarge.copyWith(
                        color: Colors.white, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildIssueChip(AppTheme theme, _IssueType issue, int index) {
    final selected = _selectedIssueId == issue.id;
    return Semantics(
      button: true,
      selected: selected,
      container: true,
      // Collapse the inner Text/Icon into a single labelled button node so the
      // a11y tree exposes exactly the issue label (no duplicate child node).
      excludeSemantics: true,
      label: issue.label,
      child: GestureDetector(
        onTap: _isOpening
            ? null
            : () => setState(() => _selectedIssueId = selected ? null : issue.id),
        child: AnimatedContainer(
          duration: theme.motionFast,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: selected
                ? theme.brandAccent.withValues(alpha: 0.12)
                : theme.cardSurface,
            borderRadius: BorderRadius.circular(theme.radiusPill),
            border: Border.all(
              color: selected
                  ? theme.brandAccent
                  : theme.alternate.withValues(alpha: 0.18),
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(issue.icon,
                  size: 16,
                  color: selected ? theme.brandAccent : theme.secondaryText),
              const SizedBox(width: 6),
              Text(
                issue.label,
                style: theme.labelSmall.copyWith(
                  color: selected ? theme.brandAccent : theme.primaryText,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    ).animate().fadeIn(delay: (index * 40).ms, duration: 260.ms).slideY(begin: 0.1, end: 0);
  }

  Widget _buildErrorBox(AppTheme theme, String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(theme.radiusSm),
        border: Border.all(color: theme.error.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline_rounded, size: 18, color: theme.error),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message, style: theme.bodySmall.copyWith(color: theme.error)),
          ),
        ],
      ),
    );
  }

  // ── Chat view (existing ticket) ─────────────────────────────────────────────

  Widget _buildChatView(AppTheme theme, bool isEscalated) {
    return Column(
      children: [
        _buildStatusBanner(theme),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: _buildErrorBox(theme, _error!),
          ),
        Expanded(
          child: _messages.isEmpty
              ? _buildEmptyState(theme)
              : ListView.builder(
                  controller: _scrollCtrl,
                  padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
                  itemCount: _messages.length + (_isTyping ? 1 : 0),
                  itemBuilder: (context, index) {
                    if (index == _messages.length) {
                      return _buildTypingIndicator(theme);
                    }
                    // Emil: only the newest bubble plays the entrance, so the
                    // thread doesn't re-animate the whole history on each rebuild
                    // (a new message should land crisply, not the past redraw).
                    final isNewest = index == _messages.length - 1;
                    return _buildMessageBubble(
                      _messages[index],
                      theme,
                      animateIn: isNewest,
                    );
                  },
                ),
        ),
        if (_shouldShowQuickReplies()) _buildQuickReplies(theme),
        _buildInputArea(theme, isEscalated),
      ],
    );
  }

  /// A compact status strip under the app bar: friendly label + sub-line + an
  /// SLA hint, so the user always knows who is answering and what to expect.
  Widget _buildStatusBanner(AppTheme theme) {
    final s = _statusMeta(theme);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: s.color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(theme.radiusLg),
        border: Border.all(color: s.color.withValues(alpha: 0.25)),
        boxShadow: theme.shadowXs,
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: s.color.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(theme.radiusMd),
            ),
            child: Icon(s.icon, size: 20, color: s.color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.label, style: theme.titleSmall.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(s.detail, style: theme.labelSmall.copyWith(color: theme.secondaryText)),
              ],
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: -0.1, end: 0);
  }

  Widget _buildEmptyState(AppTheme theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                gradient: theme.accentGradient,
                shape: BoxShape.circle,
                boxShadow: theme.shadowAccent,
              ),
              child: const Icon(Icons.support_agent_rounded, size: 40, color: Colors.white),
            ).animate().scale(
                  begin: const Offset(0.7, 0.7),
                  end: const Offset(1, 1),
                  duration: theme.motionSlow,
                  curve: theme.spring,
                ),
            const SizedBox(height: 20),
            Text(
              'ברוכים הבאים לתמיכה',
              style: theme.titleMedium,
              textAlign: TextAlign.center,
            ).animate().fadeIn(delay: 120.ms, duration: 300.ms),
            const SizedBox(height: 8),
            Text(
              'שאלו אותי כל דבר על התוכניות או החשבון שלכם.\nמענה מיידי 24/7 — ותמיד אפשר לעבור לנציג אנושי.',
              textAlign: TextAlign.center,
              style: theme.bodySmall.copyWith(color: theme.secondaryText, height: 1.4),
            ).animate().fadeIn(delay: 200.ms, duration: 300.ms),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageBubble(SupportMessage msg, AppTheme theme,
      {bool animateIn = false}) {
    final isUser = msg.role == 'user';
    final isHuman = msg.role == 'human';

    final TextColorPair colors = isUser
        ? TextColorPair(null, Colors.white, theme.accentGradient)
        : isHuman
            ? TextColorPair(theme.brandAccent.withValues(alpha: 0.10), theme.primaryText, null)
            : TextColorPair(theme.cardSurface, theme.primaryText, null);

    final alignment = isUser ? Alignment.centerRight : Alignment.centerLeft;
    final borderRadius = isUser
        ? BorderRadius.only(
            topLeft: Radius.circular(theme.radiusLg),
            topRight: const Radius.circular(4),
            bottomLeft: Radius.circular(theme.radiusLg),
            bottomRight: Radius.circular(theme.radiusLg),
          )
        : BorderRadius.only(
            topLeft: const Radius.circular(4),
            topRight: Radius.circular(theme.radiusLg),
            bottomLeft: Radius.circular(theme.radiusLg),
            bottomRight: Radius.circular(theme.radiusLg),
          );

    // Emil: a new message enters crisp — ease-out, opacity + a small
    // direction-aware slide (user from the trailing edge, agent from the
    // leading edge). Reduced motion keeps the fade and drops the transform.
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final bubble = Align(
      alignment: alignment,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(
          crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            if (isHuman)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.headset_mic_rounded, size: 12, color: theme.brandAccent),
                    const SizedBox(width: 4),
                    Text(
                      'נציג אנושי',
                      style: theme.labelSmall.copyWith(
                        color: theme.brandAccent,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.78,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: colors.background,
                gradient: colors.gradient,
                borderRadius: borderRadius,
                border: isUser
                    ? null
                    : Border.all(color: theme.alternate.withValues(alpha: 0.08)),
                boxShadow: isUser ? theme.shadowAccent : theme.shadowSoft,
              ),
              child: Text(
                msg.messageText,
                style: theme.bodyMedium.copyWith(color: colors.text, height: 1.35),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                _formatTime(msg.createdAt),
                style: theme.labelSmall.copyWith(
                  color: theme.secondaryText,
                  fontSize: 10,
                ),
              ),
            ),
          ],
        ),
      ),
    );

    if (!animateIn) return bubble;
    final entrance = bubble.animate().fadeIn(
          duration: theme.motionFast,
          curve: theme.easeOut,
        );
    // Reduced motion: keep the fade, drop the directional slide.
    return reduceMotion
        ? entrance
        : entrance.slideX(
            begin: isUser ? 0.06 : -0.06,
            end: 0,
            duration: theme.motionFast,
            curve: theme.easeOut,
          );
  }

  Widget _buildTypingIndicator(AppTheme theme) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(
            color: theme.cardSurface,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(4),
              topRight: Radius.circular(16),
              bottomLeft: Radius.circular(16),
              bottomRight: Radius.circular(16),
            ),
            border: Border.all(color: theme.alternate.withValues(alpha: 0.08)),
            boxShadow: theme.shadowSoft,
          ),
          child: _TypingDots(color: theme.brandAccent),
        ),
      ),
    );
  }

  Widget _buildQuickReplies(AppTheme theme) {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        itemCount: _quickReplies.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final reply = _quickReplies[i];
          return Semantics(
            button: true,
            label: reply,
            child: ActionChip(
              label: Text(reply),
              onPressed: () => _sendMessage(reply),
              backgroundColor: theme.brandAccent.withValues(alpha: 0.08),
              side: BorderSide(color: theme.brandAccent.withValues(alpha: 0.25)),
              labelStyle: theme.labelSmall.copyWith(
                color: theme.brandAccent,
                fontWeight: FontWeight.w700,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(theme.radiusPill),
              ),
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              visualDensity: VisualDensity.compact,
            ),
          );
        },
      ),
    );
  }

  Widget _buildInputArea(AppTheme theme, bool isEscalated) {
    final canSend = !_isTyping;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: theme.secondaryBackground,
        border: Border(
          top: BorderSide(color: theme.alternate.withValues(alpha: 0.08)),
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
                textInputAction: TextInputAction.send,
                onSubmitted: canSend ? (v) => _sendMessage(v) : null,
                decoration: InputDecoration(
                  hintText: 'כתבו הודעה...',
                  hintTextDirection: TextDirection.rtl,
                  filled: true,
                  fillColor: theme.background,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(theme.radiusPill),
                    borderSide: BorderSide(color: theme.alternate.withValues(alpha: 0.12)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(theme.radiusPill),
                    borderSide: BorderSide(color: theme.alternate.withValues(alpha: 0.12)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(theme.radiusPill),
                    borderSide: BorderSide(color: theme.brandAccent, width: 1.5),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                ),
                maxLines: null,
              ),
            ),
            const SizedBox(width: 8),
            Semantics(
              button: true,
              label: 'שליחת הודעה',
              child: AnimatedContainer(
                duration: theme.motionFast,
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  gradient: canSend ? theme.accentGradient : null,
                  color: canSend ? null : theme.alternate.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                  boxShadow: canSend ? theme.shadowAccent : null,
                ),
                child: IconButton(
                  tooltip: 'שליחה',
                  onPressed: canSend ? () => _sendMessage(_inputCtrl.text) : null,
                  icon: const Icon(Icons.send_rounded),
                  color: Colors.white,
                  disabledColor: Colors.white.withValues(alpha: 0.6),
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

/// Small value object pairing a bubble's optional fill, optional gradient, and
/// text colour so the bubble builder stays declarative.
class TextColorPair {
  const TextColorPair(this.background, this.text, this.gradient);
  final Color? background;
  final Color text;
  final Gradient? gradient;
}

/// Three softly pulsing dots used as the assistant "typing…" indicator.
/// Self-contained so the page's [State] keeps no animation wiring.
class _TypingDots extends StatefulWidget {
  const _TypingDots({required this.color});
  final Color color;

  @override
  State<_TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<_TypingDots> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 800))..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'מקליד…',
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (context, _) {
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(3, (i) {
              final phase = (_ctrl.value - i * 0.18) % 1.0;
              final t = (1 - (phase * 2 - 1).abs()).clamp(0.0, 1.0);
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2.5),
                child: Transform.translate(
                  offset: Offset(0, -2.5 * t),
                  child: Container(
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(
                      color: widget.color.withValues(alpha: 0.4 + 0.6 * t),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              );
            }),
          );
        },
      ),
    );
  }
}
