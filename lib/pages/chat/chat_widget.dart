import 'package:flutter/material.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';

class ChatWidget extends StatefulWidget {
  const ChatWidget({super.key});

  @override
  State<ChatWidget> createState() => _ChatWidgetState();
}

class _ChatWidgetState extends State<ChatWidget> {
  final _ctrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final List<_Msg> _messages = [
    _Msg(text: 'שלום! אני נציג שירות חוסך. איך אוכל לעזור לך?', isUser: false),
  ];

  @override
  void dispose() {
    _ctrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _send() {
    if (_ctrl.text.trim().isEmpty) return;
    setState(() {
      _messages.add(_Msg(text: _ctrl.text.trim(), isUser: true));
    });
    _ctrl.clear();
    Future.delayed(const Duration(milliseconds: 1000), () {
      if (!mounted) return;
      setState(() {
        _messages.add(_Msg(text: 'קיבלתי את פנייתך. נציג יחזור אליך תוך 5 דקות. תוכל גם לפנות אלינו ב-03-1234567', isUser: false));
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: Row(
          children: [
            CircleAvatar(radius: 16, backgroundColor: ffTheme.accent1, child: Icon(Icons.support_agent_rounded, size: 18, color: ffTheme.primary)),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('שירות לקוחות'),
                Text('מחובר', style: TextStyle(fontSize: 11, color: Colors.white70)),
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
              itemCount: _messages.length,
              itemBuilder: (_, i) {
                final msg = _messages[i];
                return Align(
                  alignment: msg.isUser ? Alignment.centerLeft : Alignment.centerRight,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(12),
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
                    decoration: BoxDecoration(
                      color: msg.isUser ? ffTheme.primary : Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: msg.isUser ? null : Border.all(color: ffTheme.alternate),
                    ),
                    child: Text(msg.text, style: ffTheme.bodyMedium.override(color: msg.isUser ? Colors.white : ffTheme.primaryText)),
                  ),
                );
              },
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
                      controller: _ctrl,
                      decoration: InputDecoration(hintText: 'כתבו הודעה...'),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  CircleAvatar(
                    backgroundColor: ffTheme.primary,
                    child: IconButton(
                      icon: const Icon(Icons.send_rounded, color: Colors.white, size: 18),
                      onPressed: _send,
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
}

class _Msg {
  const _Msg({required this.text, required this.isUser});
  final String text;
  final bool isUser;
}
