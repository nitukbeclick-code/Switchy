import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _ctrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  final List<_Msg> _messages = [
    _Msg(isRep: true, text: 'שלום! אני דנה, הנציגה שלכם. איך אפשר לעזור?', time: '14:22'),
    _Msg(isRep: false, text: 'שלום דנה, יש לי שאלה על מסלול גולן שהגשתי', time: '14:23'),
    _Msg(isRep: true, text: 'בטח! ראיתי את הבקשה שלכם. הכל מתקדם יפה. אנחנו ממתינים לאישור מגולן טלקום — בד"כ לוקח 2-4 שעות. האם יש משהו נוסף?', time: '14:24'),
    _Msg(isRep: false, text: 'מה קורה עם מספר הטלפון שלי? הוא יישמר?', time: '14:25'),
    _Msg(isRep: true, text: 'כן בהחלט! המספר שלכם נשמר (portability). בתהליך המעבר תקבלו SMS אחד לאישור — פשוט ענו "כן" ותוך 24 שעות המעבר יושלם.', time: '14:25'),
  ];

  final _quickReplies = [
    'מתי יסתיים המעבר?',
    'יש עמלת ניתוק?',
    'הייתה בעיה',
    'תודה!',
  ];

  @override
  void dispose() {
    _ctrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _send(String text) {
    if (text.trim().isEmpty) return;
    setState(() {
      _messages.add(_Msg(isRep: false, text: text, time: _now()));
    });
    _ctrl.clear();
    _scrollToBottom();
    // Auto-reply
    Future.delayed(const Duration(milliseconds: 1200), () {
      if (mounted) {
        setState(() {
          _messages.add(_Msg(
            isRep: true,
            text: 'קיבלתי! אבדוק ואחזור אליכם בהקדם.',
            time: _now(),
          ));
        });
        _scrollToBottom();
      }
    });
  }

  String _now() {
    final now = DateTime.now();
    return '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      body: Column(
        children: [
          _buildHeader(context),
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (ctx, i) => _buildMsg(_messages[i]),
            ),
          ),
          _buildQuickReplies(),
          _buildInput(),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final statusH = MediaQuery.of(context).padding.top;
    return Container(
      color: AppColors.green,
      padding: EdgeInsets.fromLTRB(16, statusH + 12, 16, 16),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.pop(),
            child: const Icon(Icons.arrow_back_ios_rounded,
                color: Colors.white, size: 20),
          ),
          const SizedBox(width: 12),
          Container(
            width: 38,
            height: 38,
            decoration: const BoxDecoration(
              color: AppColors.lime,
              shape: BoxShape.circle,
            ),
            child: const Center(
              child: Text(
                'ד',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppColors.greenDark,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'דנה',
                  style: TextStyle(
                    fontFamily: 'Rubik',
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'נציגת מעבר • מחוברת',
                  style: TextStyle(fontSize: 12, color: Colors.white70),
                ),
              ],
            ),
          ),
          const Icon(Icons.phone_rounded, color: Colors.white, size: 22),
        ],
      ),
    );
  }

  Widget _buildMsg(_Msg msg) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment:
            msg.isRep ? MainAxisAlignment.start : MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (msg.isRep) ...[
            Container(
              width: 30,
              height: 30,
              margin: const EdgeInsets.only(left: 8),
              decoration: const BoxDecoration(
                color: AppColors.green,
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Text(
                  'ד',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment: msg.isRep
                  ? CrossAxisAlignment.start
                  : CrossAxisAlignment.end,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: msg.isRep ? AppColors.card : AppColors.green,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: Radius.circular(msg.isRep ? 4 : 16),
                      bottomRight: Radius.circular(msg.isRep ? 16 : 4),
                    ),
                    border: msg.isRep
                        ? Border.all(color: AppColors.border)
                        : null,
                  ),
                  child: Text(
                    msg.text,
                    style: TextStyle(
                      fontSize: 14,
                      color: msg.isRep ? AppColors.ink : Colors.white,
                      height: 1.5,
                    ),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  msg.time,
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickReplies() {
    return Container(
      height: 40,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: _quickReplies.map((r) {
          return GestureDetector(
            onTap: () => _send(r),
            child: Container(
              margin: const EdgeInsets.only(left: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.border),
              ),
              child: Text(
                r,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.ink,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildInput() {
    return Container(
      padding: EdgeInsets.fromLTRB(
          16, 8, 16, MediaQuery.of(context).padding.bottom + 8),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _ctrl,
              textDirection: TextDirection.rtl,
              decoration: InputDecoration(
                hintText: 'הקלידו הודעה...',
                hintTextDirection: TextDirection.rtl,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
              ),
              onSubmitted: _send,
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => _send(_ctrl.text),
            child: Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                color: AppColors.green,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.send_rounded,
                  color: Colors.white, size: 20),
            ),
          ),
        ],
      ),
    );
  }
}

class _Msg {
  final bool isRep;
  final String text;
  final String time;
  const _Msg({required this.isRep, required this.text, required this.time});
}
