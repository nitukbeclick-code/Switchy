import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../app_state.dart';
import '../../services/support_ticket_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SupportTicketWidget extends StatefulWidget {
  final String ticketId;

  const SupportTicketWidget({
    Key? key,
    required this.ticketId,
  }) : super(key: key);

  @override
  State<SupportTicketWidget> createState() => _SupportTicketWidgetState();
}

class _SupportTicketWidgetState extends State<SupportTicketWidget> {
  late SupportTicketService _service;
  StreamSubscription<List<SupportMessage>>? _messagesSubscription;
  StreamSubscription<SupportTicket>? _ticketSubscription;

  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  bool _isLoading = true;
  bool _isTyping = false;
  List<SupportMessage> _messages = [];
  SupportTicket? _ticket;
  String? _error;
  String? _ticketId;

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
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) {
      setState(() {
        _error = 'יש להתחבר כדי לפנות לתמיכה';
        _isLoading = false;
      });
      return;
    }

    var ticketId = widget.ticketId;
    if (ticketId == 'new') {
      try {
        ticketId = await _service.createOrOpenTicket(userId);
        if (mounted) {
          Provider.of<AppState>(context, listen: false).setSupportTicketId(ticketId);
        }
      } catch (e) {
        if (mounted) {
          setState(() {
            _error = 'שגיאה ביצירת הפנייה: $e';
            _isLoading = false;
          });
        }
        return;
      }
    }

    if (!mounted) return;
    setState(() {
      _ticketId = ticketId;
      _isLoading = false;
    });
    _loadTicket(ticketId);
  }

  void _loadTicket(String ticketId) {
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
          setState(() => _error = 'שגיאה בטעינת ההודעות: $e');
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
    if (text.trim().isEmpty || _isTyping || _isLoading) return;
    final ticketId = _ticketId;
    if (ticketId == null) return;

    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) {
      setState(() => _error = 'יש להתחבר כדי לפנות לתמיכה');
      return;
    }

    _inputCtrl.clear();

    setState(() => _isTyping = true);
    _scrollToBottom();

    try {
      final result = await _service.sendMessage(ticketId, userId, text);

      if (result['escalated'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('הפנייה שלך הועברה לנציג אנושי, הוא יחזור אליך בקרוב'),
              duration: Duration(seconds: 3),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'שליחת ההודעה נכשלה: $e');
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
                  'מחוברים לנציג',
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
              padding: const EdgeInsets.all(12),
              color: Colors.red.shade100,
              child: Text(
                _error!,
                textDirection: TextDirection.rtl,
                style: TextStyle(color: Colors.red.shade900),
              ),
            ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
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

  Widget _buildEmptyState(AppTheme theme) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.support_agent,
            size: 48,
            color: theme.primary.withOpacity(0.3),
          ),
          const SizedBox(height: 16),
          Text(
            'ברוכים הבאים לתמיכה',
            style: theme.titleMedium,
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              'שאלו אותנו כל דבר על המסלולים או החשבון שלכם',
              textAlign: TextAlign.center,
              style: theme.bodySmall.copyWith(
                color: theme.secondary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageBubble(SupportMessage msg, AppTheme theme) {
    final isUser = msg.role == 'user';
    final isHuman = msg.role == 'human';

    Color bgColor;
    Color textColor;
    Alignment alignment;
    BorderRadiusGeometry borderRadius;

    if (isUser) {
      bgColor = theme.primary;
      textColor = Colors.white;
      alignment = Alignment.centerLeft;
      borderRadius = const BorderRadius.only(
        topLeft: Radius.circular(12),
        topRight: Radius.circular(4),
        bottomLeft: Radius.circular(12),
        bottomRight: Radius.circular(12),
      );
    } else {
      bgColor = isHuman ? theme.saving.withOpacity(0.2) : Colors.grey.shade200;
      textColor = Colors.black87;
      alignment = Alignment.centerRight;
      borderRadius = const BorderRadius.only(
        topLeft: Radius.circular(12),
        topRight: Radius.circular(4),
        bottomLeft: Radius.circular(12),
        bottomRight: Radius.circular(12),
      );
    }

    return Align(
      alignment: alignment,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: isUser ? CrossAxisAlignment.start : CrossAxisAlignment.end,
          children: [
            Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.75,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: bgColor,
                borderRadius: borderRadius,
              ),
              child: Text(
                msg.messageText,
                textDirection: TextDirection.rtl,
                style: theme.bodyMedium.copyWith(color: textColor),
              ),
            ),
            if (isHuman)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  'תמיכה אנושית',
                  style: theme.labelSmall.copyWith(
                    color: theme.saving,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                _formatTime(msg.createdAt),
                style: theme.labelSmall.copyWith(
                  color: Colors.grey.shade600,
                  fontSize: 10,
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
      alignment: Alignment.centerRight,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.grey.shade200,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(
              3,
              (i) => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: ScaleTransition(
                  scale: Tween<double>(begin: 0.8, end: 1.2)
                      .animate(
                        CurvedAnimation(
                          parent: AlwaysStoppedAnimation(
                            (DateTime.now().millisecondsSinceEpoch % 600) / 600,
                          ),
                          curve: Curves.easeInOut,
                        ),
                      ),
                  child: Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade600,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildQuickReplies(AppTheme theme) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: _quickReplies.map((reply) {
            return Padding(
              padding: const EdgeInsets.only(left: 8),
              child: InputChip(
                label: Text(reply, style: theme.labelSmall),
                onPressed: () => _sendMessage(reply),
                backgroundColor: theme.primary.withOpacity(0.1),
                labelStyle: theme.labelSmall.copyWith(color: theme.primary),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildInputArea(AppTheme theme, bool isEscalated) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        border: Border(
          top: BorderSide(color: Colors.grey.shade300),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _inputCtrl,
              enabled: !_isLoading,
              textDirection: TextDirection.rtl,
              decoration: InputDecoration(
                hintText: 'כתבו הודעה...',
                hintTextDirection: TextDirection.rtl,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
              maxLines: null,
              onSubmitted: _sendMessage,
            ),
          ),
          const SizedBox(width: 8),
          FloatingActionButton(
            mini: true,
            backgroundColor: theme.primary,
            tooltip: 'שליחה',
            onPressed: _isTyping || _isLoading ? null : () => _sendMessage(_inputCtrl.text),
            child: const Icon(Icons.send, color: Colors.white),
          ),
        ],
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

    return '${time.hour}:${time.minute.toString().padLeft(2, '0')} • $dateStr';
  }
}
