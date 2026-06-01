import 'dart:async';
import 'package:flutter/material.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/models.dart';
import 'chat_widget.dart';

class ChatModel extends FlutterFlowModel<ChatWidget> {
  final TextEditingController inputController = TextEditingController();
  final ScrollController scrollController = ScrollController();
  bool isTyping = false;
  List<ChatMessage> messages = [
    ChatMessage(
      text: 'שלום! אני דנה מצוות חוסך. איך אוכל לעזור לך?',
      isUser: false,
      timestamp: DateTime.now().subtract(const Duration(minutes: 5)),
    ),
    ChatMessage(
      text: 'שאלה לגבי המעבר שלי לגולן. מה הסטטוס?',
      isUser: true,
      timestamp: DateTime.now().subtract(const Duration(minutes: 4)),
    ),
    ChatMessage(
      text: 'ראיתי את הבקשה שלך! הכל מסודר — בדקתי עם ספקית הניוד ותהליך הניוד יחל בתוך 24 שעות. אנחנו כאן אם יש שאלות.',
      isUser: false,
      timestamp: DateTime.now().subtract(const Duration(minutes: 3)),
    ),
  ];

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {
    inputController.dispose();
    scrollController.dispose();
    super.dispose();
  }
}
