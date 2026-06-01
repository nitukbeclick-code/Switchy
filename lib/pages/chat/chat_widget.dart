import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../app_state.dart';

class ChatWidget extends StatefulWidget {
  const ChatWidget({super.key});

  @override
  State<ChatWidget> createState() => _ChatWidgetState();
}

class _ChatWidgetState extends State<ChatWidget> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  bool _isTyping = false;

  late List<_Msg> _messages;

  @override
  void initState() {
    super.initState();
    final appState = FFAppState();
    final name = appState.isLoggedIn ? appState.firstName : '';
    final greeting = name.isNotEmpty ? 'שלום $name! ' : 'שלום! ';
    _messages = [
      _Msg(text: '${greeting}אני דנה, הנציגה שלכם 😊\nאני כאן לעזור בכל שאלה לגבי תהליך המעבר.\nאיך אפשר לעזור?', isUser: false, time: DateTime.now().subtract(const Duration(minutes: 3))),
      _Msg(text: 'הבקשה שלכם התקבלה ואנחנו בודקים זמינות בספק. תוך 24 שעות נחזור אליכם עם תאריך מעבר מוצע.', isUser: false, time: DateTime.now().subtract(const Duration(minutes: 1))),
    ];
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _send(String text) async {
    if (text.trim().isEmpty) return;
    _inputCtrl.clear();
    setState(() {
      _messages.add(_Msg(text: text, isUser: true, time: DateTime.now()));
      _isTyping = true;
    });
    _scrollToBottom();

    await Future.delayed(Duration(milliseconds: 1200 + (text.length * 15).clamp(0, 1000)));

    final lower = text.toLowerCase();
    final String reply;
    if (lower.contains('סטטוס') || lower.contains('מצב') || lower.contains('איפה') || lower.contains('מה קורה')) {
      reply = 'הסטטוס הנוכחי: הבקשה בטיפול ✅\nאנחנו בשלב אישור המסלול מול הספק.\nצפי השלמה: 24-48 שעות נוספות.';
    } else if (lower.contains('מתי') || lower.contains('כמה זמן') || lower.contains('זמן')) {
      reply = 'תהליך הניוד לוקח בדרך כלל 1-3 ימי עסקים לאחר האישור. 📅\nהמספר שלכם יישמר לאורך כל התהליך — לא תצטרכו לשנות כלום.';
    } else if (lower.contains('ביטול') || lower.contains('לבטל') || lower.contains('לא רוצ')) {
      reply = 'מבין. אפשר לבטל את הבקשה בכל שלב לפני השלמת הניוד ☎️\nנציג שלנו ייצור קשר לאישור. האם להעביר את הבקשה?';
    } else if (lower.contains('מחיר') || lower.contains('עלות') || lower.contains('כסף') || lower.contains('תשלום')) {
      reply = 'המחיר שסוכם איתכם נשאר קבוע 💰\nאין עמלות נסתרות ואין עלויות ניוד — הכל כולל.\nאם יש שינוי במחיר, ניידע אתכם מראש בהחלט.';
    } else if (lower.contains('תודה') || lower.contains('תנקס') || lower.contains('מעולה') || lower.contains('כייף')) {
      reply = 'בשמחה! 🙏 תמיד כאן לעזור.\nיש עוד שאלות? אפשר לכתוב בכל עת.';
    } else if (lower.contains('שלום') || lower.contains('היי') || lower.contains('ערב טוב') || lower.contains('בוקר טוב')) {
      reply = 'שלום! 😊 כיף לשמוע מכם.\nאיך אפשר לעזור היום?';
    } else if (lower.contains('ניוד') || lower.contains('מספר') || lower.contains('לנייד')) {
      reply = 'ניוד המספר שלכם יתבצע ביום המעבר 📱\nהמספר יישמר בדיוק כמו שהוא — ללא שינויים.\nבמהלך הניוד ייתכן הפסקה קצרה של עד שעה.';
    } else {
      reply = 'הבנתי. אני בודקת ומחזירה לכם תשובה בהקדם 🔍\nאם זה דחוף, אפשר גם לפנות לשירות הלקוחות שלנו ישירות.';
    }

    if (mounted) {
      setState(() {
        _isTyping = false;
        _messages.add(_Msg(text: reply, isUser: false, time: DateTime.now()));
      });
    }
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(_scrollCtrl.position.maxScrollExtent, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

    final quickReplies = ['מה הסטטוס?', 'מתי הניוד?', 'שאלה על מחיר', 'תודה!'];

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        title: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
              child: Center(child: Text('ד', style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700, color: ffTheme.primary))),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('דנה', style: GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                Row(
                  children: [
                    Container(width: 7, height: 7, decoration: const BoxDecoration(color: Colors.green, shape: BoxShape.circle)),
                    const SizedBox(width: 4),
                    Text('מחוברת', style: GoogleFonts.assistant(fontSize: 11, color: Colors.white70)),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length + (_isTyping ? 1 : 0),
              itemBuilder: (ctx, i) {
                if (i == _messages.length && _isTyping) {
                  return _buildTyping(ffTheme);
                }
                final msg = _messages[i];
                return _buildBubble(msg, ffTheme);
              },
            ),
          ),

          // Quick replies
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              children: quickReplies.map((q) => GestureDetector(
                onTap: () => _send(q),
                child: Container(
                  margin: const EdgeInsets.only(left: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: ffTheme.alternate),
                  ),
                  child: Text(q, style: ffTheme.labelSmall),
                ),
              )).toList(),
            ),
          ),

          Container(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: ffTheme.alternate)),
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _inputCtrl,
                      decoration: InputDecoration(
                        hintText: 'כתוב הודעה...',
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.alternate)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.alternate)),
                        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.primary)),
                        filled: true,
                        fillColor: ffTheme.background,
                      ),
                      onSubmitted: _send,
                      textInputAction: TextInputAction.send,
                    ),
                  ),
                  const SizedBox(width: 10),
                  GestureDetector(
                    onTap: () => _send(_inputCtrl.text),
                    child: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(color: ffTheme.primary, shape: BoxShape.circle),
                      child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _timeLabel(DateTime t) {
    final now = DateTime.now();
    final diff = now.difference(t);
    if (diff.inMinutes < 1) return 'עכשיו';
    if (diff.inMinutes < 60) return 'לפני ${diff.inMinutes} דקות';
    return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }

  Widget _buildBubble(_Msg msg, FlutterFlowTheme ffTheme) {
    final isUser = msg.isUser;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: isUser ? CrossAxisAlignment.start : CrossAxisAlignment.end,
        children: [
          Row(
            mainAxisAlignment: isUser ? MainAxisAlignment.start : MainAxisAlignment.end,
            children: [
              Container(
                constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: isUser ? ffTheme.primary : Colors.white,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(18),
                    topRight: const Radius.circular(18),
                    bottomLeft: isUser ? const Radius.circular(18) : const Radius.circular(4),
                    bottomRight: isUser ? const Radius.circular(4) : const Radius.circular(18),
                  ),
                  border: isUser ? null : Border.all(color: ffTheme.alternate),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 6)],
                ),
                child: Text(msg.text, style: ffTheme.bodyMedium.override(color: isUser ? Colors.white : ffTheme.primaryText, lineHeight: 1.5)),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 3, right: 4, left: 4),
            child: Text(_timeLabel(msg.time), style: ffTheme.labelSmall.override(color: ffTheme.secondaryText.withOpacity(0.6))),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.1, end: 0);
  }

  Widget _buildTyping(FlutterFlowTheme ffTheme) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: ffTheme.alternate),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) => Container(
                width: 7,
                height: 7,
                margin: EdgeInsets.only(left: i > 0 ? 4 : 0),
                decoration: BoxDecoration(color: ffTheme.secondaryText, shape: BoxShape.circle),
              ).animate(onPlay: (c) => c.repeat())
                .fadeIn(delay: (i * 200).ms, duration: 300.ms)
                .then().fadeOut(duration: 300.ms)),
            ),
          ),
        ],
      ),
    );
  }
}

class _Msg {
  final String text;
  final bool isUser;
  final DateTime time;
  const _Msg({required this.text, required this.isUser, required this.time});
}
