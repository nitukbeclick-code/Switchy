import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../widgets/pressable.dart';

class ChatWidget extends StatefulWidget {
  const ChatWidget({super.key});

  @override
  State<ChatWidget> createState() => _ChatWidgetState();
}

class _ChatWidgetState extends State<ChatWidget> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  bool _isTyping = false;
  final bool _agentOnline = true;

  late List<_Msg> _messages;
  Plan? _contextPlan;

  // Quick replies that adapt to context
  List<String> _quickReplies = ['מה הסטטוס?', 'מתי הניוד?', 'שאלה על מחיר', 'תודה!'];

  @override
  void initState() {
    super.initState();
    final appState = AppState();
    _contextPlan = appState.leadPlanId != null ? planById(appState.leadPlanId!) : null;

    final history = appState.chatHistory;
    if (history.isNotEmpty) {
      _messages = history.map((m) => _Msg(
        text: m['text'] as String,
        isUser: m['isUser'] as bool,
        time: DateTime.tryParse(m['ts'] as String? ?? '') ?? DateTime.now(),
        isRead: m['isRead'] as bool? ?? true,
      )).toList();
    } else {
      final name = appState.isLoggedIn ? appState.firstName : '';
      final greeting = name.isNotEmpty ? 'שלום $name! ' : 'שלום! ';
      final planLine = _contextPlan != null
          ? '\nראיתי שהתעניינת ב${_contextPlan!.provider} – ${_contextPlan!.plan}. אני כאן לכל שאלה!'
          : '';
      final seed1 = _Msg(
        text: '$greetingאני דנה, הנציגה שלכם 😊\nאני כאן לעזור בכל שאלה לגבי תהליך המעבר.$planLine',
        isUser: false,
        time: DateTime.now().subtract(const Duration(minutes: 2)),
        isRead: true,
      );
      final seed2 = _Msg(
        text: 'הבקשה שלכם התקבלה ואנחנו בודקים זמינות בספק. תוך 24 שעות נחזור אליכם עם תאריך מעבר מוצע.',
        isUser: false,
        time: DateTime.now().subtract(const Duration(minutes: 1)),
        isRead: true,
      );
      _messages = [seed1, seed2];
      // Persist after the first frame — notifying listeners synchronously here
      // would mark the AppState provider dirty during the build phase.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        appState.addChatMessage(text: seed1.text, isUser: false, isRead: true);
        appState.addChatMessage(text: seed2.text, isUser: false, isRead: true);
      });
    }
  }

  void _resetToSeed() {
    final appState = AppState();
    appState.clearChatHistory();
    final name = appState.isLoggedIn ? appState.firstName : '';
    final greeting = name.isNotEmpty ? 'שלום $name! ' : 'שלום! ';
    final planLine = _contextPlan != null
        ? '\nראיתי שהתעניינת ב${_contextPlan!.provider} – ${_contextPlan!.plan}. אני כאן לכל שאלה!'
        : '';
    final seed1 = _Msg(
      text: '$greetingאני דנה, הנציגה שלכם 😊\nאני כאן לעזור בכל שאלה לגבי תהליך המעבר.$planLine',
      isUser: false,
      time: DateTime.now().subtract(const Duration(minutes: 2)),
      isRead: true,
    );
    final seed2 = _Msg(
      text: 'הבקשה שלכם התקבלה ואנחנו בודקים זמינות בספק. תוך 24 שעות נחזור אליכם עם תאריך מעבר מוצע.',
      isUser: false,
      time: DateTime.now().subtract(const Duration(minutes: 1)),
      isRead: true,
    );
    setState(() {
      _messages = [seed1, seed2];
      _quickReplies = ['מה הסטטוס?', 'מתי הניוד?', 'שאלה על מחיר', 'תודה!'];
    });
    appState.addChatMessage(text: seed1.text, isUser: false, isRead: true);
    appState.addChatMessage(text: seed2.text, isUser: false, isRead: true);
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _send(String text) async {
    if (text.trim().isEmpty || _isTyping) return;
    _inputCtrl.clear();
    AppState().addChatMessage(text: text, isUser: true, isRead: false);
    setState(() {
      _messages.add(_Msg(text: text, isUser: true, time: DateTime.now(), isRead: false));
      _isTyping = true;
    });
    _scrollToBottom();

    // Simulate read receipt after short delay
    await Future.delayed(const Duration(milliseconds: 800));
    if (mounted) {
      setState(() {
        final last = _messages.lastWhere((m) => m.isUser);
        final idx = _messages.lastIndexWhere((m) => m.isUser);
        _messages[idx] = _Msg(text: last.text, isUser: true, time: last.time, isRead: true);
      });
    }

    await Future.delayed(Duration(milliseconds: 400 + (text.length * 15).clamp(0, 800)));

    final lower = text.toLowerCase();
    final String reply;
    List<String> nextReplies = ['מה הסטטוס?', 'מתי הניוד?', 'שאלה על מחיר', 'תודה!'];

    if (lower.contains('סטטוס') || lower.contains('מצב') || lower.contains('איפה') || lower.contains('מה קורה')) {
      reply = 'הסטטוס הנוכחי: הבקשה בטיפול ✅\nאנחנו בשלב אישור המסלול מול הספק.\nצפי השלמה: 24-48 שעות נוספות.';
      nextReplies = ['ספר לי יותר', 'מתי הניוד?', 'יש עיכוב?', 'תודה!'];
    } else if (lower.contains('מתי') || lower.contains('כמה זמן') || lower.contains('זמן')) {
      reply = 'תהליך הניוד לוקח בדרך כלל 1-3 ימי עסקים לאחר האישור. 📅\nהמספר שלכם יישמר לאורך כל התהליך — לא תצטרכו לשנות כלום.';
      nextReplies = ['מה הסטטוס?', 'שאלה על מחיר', 'צור קשר בדחיפות', 'תודה!'];
    } else if (lower.contains('ביטול') || lower.contains('לבטל') || lower.contains('לא רוצ')) {
      reply = 'מבין. אפשר לבטל את הבקשה בכל שלב לפני השלמת הניוד ☎️\nנציג שלנו ייצור קשר לאישור. האם להעביר את הבקשה?';
      nextReplies = ['כן, בטלו', 'לא, המשיכו', 'שאלה על מחיר', 'תודה!'];
    } else if (lower.contains('מחיר') || lower.contains('עלות') || lower.contains('כסף') || lower.contains('תשלום')) {
      reply = 'המחיר שסוכם איתכם נשאר קבוע 💰\nאין עמלות נסתרות ואין עלויות ניוד — הכל כולל.\nאם יש שינוי במחיר, ניידע אתכם מראש בהחלט.';
      nextReplies = ['מה הסטטוס?', 'מתי הניוד?', 'אפשר להוזיל?', 'תודה!'];
    } else if (lower.contains('תודה') || lower.contains('תנקס') || lower.contains('מעולה') || lower.contains('כייף') || lower == '😊') {
      reply = 'בשמחה! 🙏 תמיד כאן לעזור.\nיש עוד שאלות? אפשר לכתוב בכל עת.';
      nextReplies = ['מה הסטטוס?', 'מתי הניוד?', 'שאלה על מחיר', '😊'];
    } else if (lower.contains('שלום') || lower.contains('היי') || lower.contains('ערב טוב') || lower.contains('בוקר טוב')) {
      reply = 'שלום! 😊 כיף לשמוע מכם.\nאיך אפשר לעזור היום?';
    } else if (lower.contains('ניוד') || lower.contains('מספר') || lower.contains('לנייד')) {
      reply = 'ניוד המספר שלכם יתבצע ביום המעבר 📱\nהמספר יישמר בדיוק כמו שהוא — ללא שינויים.\nבמהלך הניוד ייתכן הפסקה קצרה של עד שעה.';
      nextReplies = ['מה קורה בזמן ההפסקה?', 'מה הסטטוס?', 'מתי הניוד?', 'תודה!'];
    } else if (lower.contains('מה קורה בזמן') || lower.contains('הפסקה')) {
      reply = 'בזמן הניוד יש הפסקה קצרה של כ-15–60 דקות ⏳\nבמהלכה לא ניתן לבצע שיחות וצרכי אינטרנט.\nהפסקה זו אוטומטית ולא דורשת כלום מצדכם.';
      nextReplies = ['מה הסטטוס?', 'מתי הניוד?', 'תודה!'];
    } else if (lower.contains('כיסוי') || lower.contains('אנטנה') || lower.contains('קליטה') || lower.contains('בדוק זמינות')) {
      reply = 'כיסוי הרשת תלוי באזור המגורים שלכם 📶\nאם יש לכם ספק חדש, הכיסוי בדרך כלל זהה לספק הקודם. מומלץ לבדוק בעמוד הבדיקה שלנו.';
      nextReplies = ['מה הסטטוס?', 'שאלה על מחיר', 'תודה!'];
    } else if (lower.contains('דחוף') || lower.contains('חירום') || lower.contains('דחופ')) {
      reply = 'הבנתי, נטפל בזה בדחיפות! 🚨\nמספר הטלפון שלנו: 1-800-555-0123\nאפשר להגיע גם בוואטסאפ — נחזור תוך דקות.';
      nextReplies = ['התקשרו אליי', 'שלחו וואטסאפ', 'תודה!'];
    } else if (lower.contains('התקשרו אליי') || lower.contains('להתקשר') || lower.contains('שיחה')) {
      reply = 'בוודאי! 📞 נציג יחזור אליכם תוך 10 דקות.\nאם לא קיבלתם שיחה, אפשר ליצור קשר ישירות:\n1-800-555-0123 (ראשון–שישי, 8:00–21:00)';
      nextReplies = ['מה הסטטוס?', 'שלחו וואטסאפ', 'תודה!'];
    } else if (lower.contains('וואטסאפ') || lower.contains('ווצאפ') || lower.contains('שלחו הודעה')) {
      reply = 'נציג ישלח לכם וואטסאפ עוד מעט 💬\nמספר השירות: 050-555-0123\nזמן תגובה ממוצע: 5 דקות בשעות פעילות.';
      nextReplies = ['מה הסטטוס?', 'מתי הניוד?', 'תודה!'];
    } else if (lower.contains('אפשר להוזיל') || lower.contains('הנחה') || lower.contains('זול יותר') || lower.contains('להוריד מחיר')) {
      reply = 'בהחלט שווה לבדוק! 💰\nלפעמים יש מבצעים שלא מופיעים באתר.\nהנציג שלנו יכול לבדוק עם הספק על הנחות נוספות — רוצים שנבדוק?';
      nextReplies = ['כן, תבדקו', 'מה הסטטוס?', 'שאלה על מחיר', 'תודה!'];
    } else if (lower == 'כן, תבדקו' || lower.contains('כן בדקו') || lower.contains('כן תבדקו')) {
      reply = 'מעולה! 🔍 נבדוק עבורכם מה הכי טוב שאפשר לקבל.\nנציג יחזור אליכם עם תשובה תוך שעה.';
      nextReplies = ['מה הסטטוס?', 'תודה!'];
    } else if (lower.contains('כן, בטלו') || lower.contains('לבטל הכל') || lower.contains('רוצה לבטל')) {
      reply = 'מבין, אין בעיה 🙏\nהבקשה לביטול התקבלה. נציג שלנו יאשר את הביטול תוך 24 שעות ויוודא שאין חיובים.\nתוכלו לחזור ולהצטרף בכל עת!';
      nextReplies = ['תודה!', 'רגע, לא לבטל'];
    } else if (lower.contains('לא, המשיכו') || lower.contains('רגע, לא לבטל') || lower.contains('לא לבטל')) {
      reply = 'מצוין! 😊 ממשיכים כרגיל.\nתהליך המעבר ממשיך כמתוכנן. נדאג לכם!';
      nextReplies = ['מה הסטטוס?', 'מתי הניוד?', 'תודה!'];
    } else if (lower.contains('ספר לי יותר') || lower.contains('עוד מידע') || lower.contains('פרטים נוספים')) {
      reply = 'כמובן! 📋 הנה מה שקורה כרגע:\n• הבקשה שלכם בטיפול פעיל\n• נציג מול הספק כרגע\n• תוך 24–48 שעות נחזור עם תאריך מוצע\nכל שאלה — כאן בשבילכם!';
      nextReplies = ['מה הסטטוס?', 'מתי הניוד?', 'יש עיכוב?', 'תודה!'];
    } else if (lower.contains('יש עיכוב') || lower.contains('עיכוב') || lower.contains('מתעכב')) {
      reply = 'לא חייב להיות עיכוב! ✅\nאם הצפי השתנה, נעדכן אתכם מיד. כרגע הכל מתקדם בזמן.\nיש משהו ספציפי שמדאיג אתכם?';
      nextReplies = ['מה הסטטוס?', 'מתי הניוד?', 'צור קשר בדחיפות', 'תודה!'];
    } else if (lower.contains('צור קשר בדחיפות') || lower.contains('דחיפות') || lower.contains('מהר')) {
      reply = 'מבין, נזדרז! 🚀\nמחבר אתכם לנציג הזמין כרגע — תוך דקות תוכלו לדבר ישירות.\nאו להתקשר ישירות: 1-800-555-0123';
      nextReplies = ['התקשרו אליי', 'שלחו וואטסאפ', 'תודה!'];
    } else {
      reply = 'הבנתי. אני בודקת ומחזירה לכם תשובה בהקדם 🔍\nאם זה דחוף, אפשר גם לפנות לשירות הלקוחות שלנו ישירות.';
    }

    if (mounted) {
      AppState().addChatMessage(text: reply, isUser: false, isRead: true);
      setState(() {
        _isTyping = false;
        _messages.add(_Msg(text: reply, isUser: false, time: DateTime.now(), isRead: true));
        _quickReplies = nextReplies;
      });
    }
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
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
    final ffTheme = AppTheme.of(context);
    Provider.of<AppState>(context, listen: false);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: _buildAppBar(ffTheme, context),
      body: Column(
        children: [
          // Plan context banner
          if (_contextPlan != null) _buildPlanBanner(ffTheme, context),

          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: _messages.length + (_isTyping ? 1 : 0),
              itemBuilder: (ctx, i) {
                if (i == _messages.length && _isTyping) return _buildTyping(ffTheme);

                final msg = _messages[i];
                final prevIsUser = i > 0 ? _messages[i - 1].isUser : null;
                final showDate = i == 0 || !_sameDay(_messages[i - 1].time, msg.time);
                return Column(
                  children: [
                    if (showDate) _buildDateDivider(msg.time, ffTheme),
                    _buildBubble(msg, ffTheme, showAvatar: prevIsUser != msg.isUser || prevIsUser == null),
                  ],
                );
              },
            ),
          ),

          // Quick replies
          _buildQuickReplies(ffTheme),

          // Input bar
          _buildInputBar(ffTheme),
        ],
      ),
    );
  }

  PreferredSizeWidget _buildAppBar(AppTheme ffTheme, BuildContext context) {
    return AppBar(
      backgroundColor: ffTheme.brandAccent,
      foregroundColor: Colors.white,
      elevation: 0,
      flexibleSpace: Container(
        decoration: BoxDecoration(gradient: ffTheme.accentGradient),
      ),
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_ios_rounded, color: Colors.white, size: 20),
        tooltip: 'חזרה',
        onPressed: () => context.safePop(),
      ),
      titleSpacing: 0,
      title: Row(
        children: [
          ExcludeSemantics(
            child: Stack(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                  child: Center(child: Text('ד', style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w800, color: ffTheme.brandAccent))),
                ),
                if (_agentOnline)
                  Positioned(
                    bottom: 1,
                    right: 1,
                    child: Container(
                      width: 11,
                      height: 11,
                      decoration: BoxDecoration(
                        color: ffTheme.brandAccent,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 1.5),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('דנה – חוסך', style: GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
              Row(
                children: [
                  Text(_agentOnline ? 'מחוברת' : 'לא מחוברת', style: GoogleFonts.assistant(fontSize: 11, color: Colors.white70)),
                ],
              ),
            ],
          ),
        ],
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.delete_sweep_rounded, color: Colors.white),
          tooltip: 'נקה שיחה',
          onPressed: () async {
            final confirmed = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                title: const Text('נקה שיחה', textDirection: TextDirection.rtl),
                content: const Text('לנקות את השיחה?', textDirection: TextDirection.rtl),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('ביטול')),
                  TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('נקה')),
                ],
              ),
            );
            if (confirmed == true) _resetToSeed();
          },
        ),
        IconButton(
          icon: const Icon(Icons.track_changes_rounded, color: Colors.white),
          tooltip: 'מעקב תהליך',
          onPressed: () => context.pushNamed('Tracker'),
        ),
      ],
    );
  }

  Widget _buildPlanBanner(AppTheme ffTheme, BuildContext context) {
    final plan = _contextPlan!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: ffTheme.brandAccentTint,
        border: Border(bottom: BorderSide(color: ffTheme.brandAccent.withValues(alpha: 0.15))),
      ),
      child: Row(
        children: [
          LogoWidget(provider: plan.provider, size: 32),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(plan.provider, style: ffTheme.labelLarge.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
                Text(plan.plan, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText), maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: ffTheme.brandAccent, borderRadius: BorderRadius.circular(20)),
            child: Text('₪${plan.priceText}/${priceUnitShort(plan)}', style: ffTheme.labelSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  Widget _buildDateDivider(DateTime time, AppTheme ffTheme) {
    final now = DateTime.now();
    final diff = now.difference(time).inDays;
    final label = diff == 0 ? 'היום' : diff == 1 ? 'אתמול' : '${time.day}/${time.month}/${time.year}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Expanded(child: Divider(color: ffTheme.lineColor)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(label, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
          ),
          Expanded(child: Divider(color: ffTheme.lineColor)),
        ],
      ),
    );
  }

  Widget _buildQuickReplies(AppTheme ffTheme) {
    return SizedBox(
      height: 46,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        itemCount: _quickReplies.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (ctx, i) => Semantics(
          button: true,
          label: _quickReplies[i],
          child: Pressable(
            onTap: () => _send(_quickReplies[i]),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: ffTheme.brandAccentTint,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.28)),
              ),
              child: Text(_quickReplies[i], style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildInputBar(AppTheme ffTheme) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: ffTheme.secondaryBackground,
        border: Border(top: BorderSide(color: ffTheme.alternate)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _inputCtrl,
                textDirection: TextDirection.rtl,
                decoration: InputDecoration(
                  hintText: 'כתוב הודעה...',
                  hintTextDirection: TextDirection.rtl,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.alternate)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.alternate)),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.brandAccent, width: 1.5)),
                  filled: true,
                  fillColor: ffTheme.background,
                ),
                onSubmitted: _send,
                textInputAction: TextInputAction.send,
              ),
            ),
            const SizedBox(width: 8),
            Semantics(
              button: true,
              label: 'שלח הודעה',
              child: Pressable(
                onTap: () => _send(_inputCtrl.text),
                child: Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    gradient: ffTheme.accentGradient,
                    shape: BoxShape.circle,
                    boxShadow: ffTheme.shadowAccent,
                  ),
                  child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  String _timeLabel(DateTime t) {
    final now = DateTime.now();
    final diff = now.difference(t);
    if (diff.inMinutes < 1) return 'עכשיו';
    if (diff.inMinutes < 60) return 'לפני ${diff.inMinutes} דקות';
    return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }

  Widget _buildBubble(_Msg msg, AppTheme ffTheme, {required bool showAvatar}) {
    final isUser = msg.isUser;
    return Padding(
      padding: EdgeInsetsDirectional.only(
        bottom: 4,
        start: isUser ? 0 : 48,
        end: isUser ? 48 : 0,
      ),
      child: Column(
        crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (!isUser && showAvatar) ...[
                ExcludeSemantics(
                  child: Container(
                    width: 30,
                    height: 30,
                    margin: const EdgeInsetsDirectional.only(end: 8, bottom: 2),
                    decoration: BoxDecoration(color: ffTheme.brandAccentTint, shape: BoxShape.circle),
                    child: Center(child: Text('ד', style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w800, color: ffTheme.brandAccent))),
                  ),
                ),
              ] else if (!isUser) ...[
                const SizedBox(width: 38),
              ],
              Flexible(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    gradient: isUser ? ffTheme.accentGradient : null,
                    color: isUser ? null : ffTheme.secondaryBackground,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(18),
                      topRight: const Radius.circular(18),
                      bottomLeft: isUser ? const Radius.circular(18) : const Radius.circular(4),
                      bottomRight: isUser ? const Radius.circular(4) : const Radius.circular(18),
                    ),
                    boxShadow: isUser ? ffTheme.shadowAccent : ffTheme.shadowSoft,
                  ),
                  child: Text(
                    msg.text,
                    style: ffTheme.bodyMedium.copyWith(
                      color: isUser ? Colors.white : ffTheme.primaryText,
                      height: 1.5,
                    ),
                    textDirection: TextDirection.rtl,
                  ),
                ),
              ),
            ],
          ),
          Padding(
            padding: EdgeInsetsDirectional.only(top: 3, start: isUser ? 4 : 38, end: isUser ? 0 : 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
              children: [
                Text(_timeLabel(msg.time), style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontSize: 11)),
                if (isUser) ...[
                  const SizedBox(width: 4),
                  Icon(
                    msg.isRead ? Icons.done_all_rounded : Icons.done_rounded,
                    size: 14,
                    color: msg.isRead ? ffTheme.brandAccent : ffTheme.secondaryText,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 250.ms).slideY(begin: 0.08, end: 0);
  }

  Widget _buildTyping(AppTheme ffTheme) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          ExcludeSemantics(
            child: Container(
              width: 30,
              height: 30,
              margin: const EdgeInsetsDirectional.only(end: 8, bottom: 2),
              decoration: BoxDecoration(color: ffTheme.brandAccentTint, shape: BoxShape.circle),
              child: Center(child: Text('ד', style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w800, color: ffTheme.brandAccent))),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: ffTheme.secondaryBackground,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(18),
                topRight: Radius.circular(18),
                bottomRight: Radius.circular(18),
                bottomLeft: Radius.circular(4),
              ),
              boxShadow: ffTheme.shadowSoft,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) => Container(
                width: 7, height: 7,
                margin: EdgeInsetsDirectional.only(start: i > 0 ? 4 : 0),
                decoration: BoxDecoration(color: ffTheme.secondaryText.withValues(alpha: 0.5), shape: BoxShape.circle),
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
  final bool isRead;
  const _Msg({required this.text, required this.isUser, required this.time, this.isRead = false});
}
