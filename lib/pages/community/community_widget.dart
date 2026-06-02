import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';

class CommunityWidget extends StatefulWidget {
  const CommunityWidget({super.key});

  @override
  State<CommunityWidget> createState() => _CommunityWidgetState();
}

class _CommunityWidgetState extends State<CommunityWidget> {
  final _searchCtrl = TextEditingController();
  late List<CommunityPost> _posts;
  String _activeChannel = 'הכל';
  String _searchQuery = '';
  int _onlineCount = 847;
  bool _sortByPopular = false;
  final Set<String> _bookmarked = {};
  final Map<String, List<_Reply>> _replyData = {};

  static const _channels = ['הכל', 'המלצות', 'סלולר', 'אינטרנט', 'טלוויזיה', 'חו"ל', 'חבילה משולבת', 'עזרה בניתוק'];

  // Preset replies for key posts
  static final _mockReplies = <String, List<_Reply>>{
    '1': [
      _Reply(author: 'יוסי לוי', avatar: 'י', text: 'כמה שילמת דמי ניתוק?', time: _ago(hours: 1)),
      _Reply(author: 'מאיה כהן', avatar: 'מ', text: 'שום דבר! הייתי ללא התחייבות בפלאפון 😊', time: _ago(hours: 1, min: 30)),
      _Reply(author: 'שרית לוין', avatar: 'ש', text: 'גולן גדול ❤️ אני שם כבר 4 שנים', time: _ago(hours: 2)),
    ],
    '3': [
      _Reply(author: 'ניר שמחי', avatar: 'נ', text: 'פרטנר הרבה יותר טוב ב-5G בחיפה לפי החוויה שלי', time: _ago(hours: 9)),
      _Reply(author: 'הילה אוחיון', avatar: 'ה', text: 'אני בסלקום — כיסוי 5G מצוין בנמל חיפה', time: _ago(hours: 9, min: 30)),
      _Reply(author: 'בני זכריה', avatar: 'ב', text: 'תבדוק מפת כיסוי באתר של כל ספק לפני שאתה עובר', time: _ago(hours: 10)),
    ],
    '5': [
      _Reply(author: 'אורי פרידמן', avatar: 'א', text: 'מה הראוטר שנתנו לך?', time: _ago(hours: 25)),
      _Reply(author: 'דן שפירא', avatar: 'ד', text: 'Asus AX3000 — עובד מצוין, כיסוי טוב לדירה גדולה', time: _ago(hours: 26)),
    ],
    '7': [
      _Reply(author: 'לימור דוד', avatar: 'ל', text: 'גם לי הציעו מחיר שימור! בסוף עברתי בכל זאת 😂', time: _ago(days: 2, hours: 2)),
      _Reply(author: 'עמית בן-דוד', avatar: 'ע', text: 'סלקום עשו לי אותו דבר — הצעה של ₪49 אחרי 5 שנים', time: _ago(days: 2, hours: 3)),
    ],
    '10': [
      _Reply(author: 'מיכל ביטון', avatar: 'מ', text: 'וואו 3 שעות?! אצלי לקח 6 שעות אבל גם היה חלק', time: _ago(days: 4, hours: 2)),
      _Reply(author: 'נועה גרין', avatar: 'נ', text: 'אצלי לקח יום וחצי אבל אולי כי עברתי בסוף שבוע', time: _ago(days: 4, hours: 3)),
    ],
    '22': [
      _Reply(author: 'ברק כהן', avatar: 'ב', text: 'ה-FreeTV עובד על כל טלוויזיה חכמה? גם Samsung?', time: _ago(days: 4, hours: 3)),
      _Reply(author: 'שירה מנצ׳ר', avatar: 'ש', text: 'כן! Samsung, LG, פיירסטיק, כל דבר עם אנדרואיד. הורדה ישירה מ-Google Play', time: _ago(days: 4, hours: 4)),
      _Reply(author: 'לי עמר', avatar: 'ל', text: 'מה עם VOD? סרטים חדשים?', time: _ago(days: 4, hours: 5)),
    ],
    '26': [
      _Reply(author: 'אפרת נחמיאס', avatar: 'א', text: 'שמחתי לשמוע! הזמנתי בדיוק את אותה חבילה לנסיעה שלי', time: _ago(days: 1, hours: 4)),
      _Reply(author: 'גיל מירון', avatar: 'ג', text: 'תהנה! תזכור להפעיל את ה-eSIM לפני שממריאים', time: _ago(days: 1, hours: 5)),
      _Reply(author: 'ידידיה לב', avatar: 'י', text: 'כמה זמן לקח ההגדרה?', time: _ago(days: 1, hours: 6)),
    ],
    '28': [
      _Reply(author: 'שרה גולד', avatar: 'ש', text: 'אותו דבר בדיוק! שילמתי להוט ₪150 לשבועיים. לא שוב!', time: _ago(days: 10, hours: 2)),
      _Reply(author: 'אמנון כץ', avatar: 'א', text: 'הבעיה עם ₪/יום שלא מרגישים את הצטברות. בסוף הסכום מדהים', time: _ago(days: 10, hours: 3)),
      _Reply(author: 'ירון בן-אור', avatar: 'י', text: 'פרטנר גם ₪8 ליום — עדיין יקר לעומת Airalo', time: _ago(days: 10, hours: 4)),
    ],
    '33': [
      _Reply(author: 'צביה נחמן', avatar: 'צ', text: 'ניסיתי — פלאפון הציעו לי ₪49 אחרי שאמרתי שאני עובר לגולן 😂', time: _ago(days: 5, hours: 1)),
      _Reply(author: 'גבי מרקוס', avatar: 'ג', text: 'עבדתי! גם אני קיבלתי מחיר מיוחד. תודה על הטיפ!', time: _ago(days: 5, hours: 2)),
      _Reply(author: 'יפה שמש', avatar: 'י', text: 'מה אם לא מתגמשים? בכל זאת לעבור?', time: _ago(days: 5, hours: 3)),
    ],
    '34': [
      _Reply(author: 'חיים יוסף', avatar: 'ח', text: 'זה אמיתי?! ₪80 ל-3 קווים??', time: _ago(days: 6, hours: 2)),
      _Reply(author: 'מרים אזולאי', avatar: 'מ', text: 'כן! ₪26.67 לקו בממוצע. עשינו דרך חוסך ב-30 דקות', time: _ago(days: 6, hours: 3)),
      _Reply(author: 'תמר ששון', avatar: 'ת', text: 'הצטרפתי! חסכתי ₪1,200 לשנה על 2 קווים', time: _ago(days: 6, hours: 4)),
    ],
  };

  static DateTime _ago({int days = 0, int hours = 0, int min = 0}) =>
      DateTime.now().subtract(Duration(days: days, hours: hours, minutes: min));

  Timer? _onlineTimer;

  @override
  void initState() {
    super.initState();
    final appState = FFAppState();
    final persisted = appState.communityPosts.map((m) => CommunityPost(
      id: m['id'] as String,
      author: m['author'] as String,
      avatar: m['avatar'] as String,
      channel: m['channel'] as String,
      text: m['text'] as String,
      likes: 0,
      replies: 0,
      timestamp: DateTime.tryParse(m['ts'] as String? ?? '') ?? DateTime.now(),
    )).toList();
    _posts = [...persisted, ...communityPosts];
    _replyData.addAll(_mockReplies);
    _onlineTimer = Timer.periodic(const Duration(seconds: 12), (_) {
      if (mounted) setState(() => _onlineCount = 820 + (DateTime.now().millisecond % 41) - 20);
    });
    _searchCtrl.addListener(() => setState(() => _searchQuery = _searchCtrl.text));
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _onlineTimer?.cancel();
    super.dispose();
  }

  int _channelCount(String ch) =>
      ch == 'הכל' ? _posts.length : _posts.where((p) => p.channel == ch).length;

  List<CommunityPost> get _filtered {
    var base = _activeChannel == 'הכל'
        ? _posts
        : _posts.where((p) => p.channel == _activeChannel).toList();
    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      base = base.where((p) => p.text.toLowerCase().contains(q) || p.author.toLowerCase().contains(q)).toList();
    }
    if (_sortByPopular) return List.from(base)..sort((a, b) => b.likes.compareTo(a.likes));
    return base;
  }

  // ── Reply thread ─────────────────────────────────────────────────────────────

  void _showReplies(BuildContext context, CommunityPost post, FlutterFlowTheme ffTheme) {
    final replyCtrl = TextEditingController();
    _replyData.putIfAbsent(post.id, () => []);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          final replies = _replyData[post.id]!;
          return DraggableScrollableSheet(
            initialChildSize: 0.72,
            maxChildSize: 0.95,
            minChildSize: 0.4,
            expand: false,
            builder: (ctx, scrollCtrl) => Container(
              decoration: BoxDecoration(
                color: ffTheme.background,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
              ),
              child: Column(
                children: [
                  // Handle + header
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: ffTheme.alternate, borderRadius: BorderRadius.circular(2)))),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Text('תגובות', style: ffTheme.titleLarge),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(color: ffTheme.primary, borderRadius: BorderRadius.circular(10)),
                              child: Text('${replies.length}', style: ffTheme.labelSmall.override(color: Colors.white, fontWeight: FontWeight.w700)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Original post (mini)
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: ffTheme.primary.withOpacity(0.2)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 28, height: 28,
                              decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
                              child: Center(child: Text(post.avatar, style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w700, color: ffTheme.primary))),
                            ),
                            const SizedBox(width: 8),
                            Text(post.author, style: ffTheme.labelMedium),
                            if (post.isVerified) ...[
                              const SizedBox(width: 4),
                              Icon(Icons.verified_rounded, size: 13, color: ffTheme.info),
                            ],
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(post.text, style: ffTheme.bodySmall.override(lineHeight: 1.4), maxLines: 3, overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ),

                  Divider(height: 20, color: ffTheme.alternate),

                  // Reply list
                  Expanded(
                    child: replies.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.chat_bubble_outline_rounded, size: 52, color: ffTheme.alternate),
                                const SizedBox(height: 12),
                                Text('אין תגובות עדיין', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
                                const SizedBox(height: 4),
                                Text('היה הראשון לענות!', style: ffTheme.labelSmall),
                              ],
                            ),
                          )
                        : ListView.builder(
                            controller: scrollCtrl,
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                            itemCount: replies.length,
                            itemBuilder: (_, i) => _ReplyBubble(reply: replies[i], ffTheme: ffTheme)
                                .animate(delay: (i * 50).ms).fadeIn(duration: 250.ms).slideY(begin: 0.05),
                          ),
                  ),

                  // Reply input
                  Container(
                    padding: EdgeInsets.fromLTRB(16, 10, 16, MediaQuery.of(ctx).viewInsets.bottom + 16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border(top: BorderSide(color: ffTheme.alternate)),
                      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, -4))],
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: replyCtrl,
                            textDirection: TextDirection.rtl,
                            decoration: InputDecoration(
                              hintText: 'כתוב תגובה...',
                              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                              filled: true,
                              fillColor: ffTheme.background,
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.alternate)),
                              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.alternate)),
                              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.primary)),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        GestureDetector(
                          onTap: () {
                            final text = replyCtrl.text.trim();
                            if (text.isEmpty) return;
                            final appState = Provider.of<FFAppState>(ctx, listen: false);
                            final newReply = _Reply(
                              author: appState.isLoggedIn ? appState.firstName : 'אורח',
                              avatar: appState.isLoggedIn && appState.firstName.isNotEmpty ? appState.firstName[0] : 'א',
                              text: text,
                              time: DateTime.now(),
                            );
                            setSheet(() { replies.add(newReply); replyCtrl.clear(); });
                            setState(() {});
                          },
                          child: Container(
                            width: 44, height: 44,
                            decoration: BoxDecoration(color: ffTheme.primary, shape: BoxShape.circle),
                            child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    ).then((_) => replyCtrl.dispose());
  }

  // ── Composer modal ────────────────────────────────────────────────────────────

  void _showComposer(BuildContext context, FFAppState appState, FlutterFlowTheme ffTheme) {
    if (!appState.isLoggedIn) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: const Text('יש להתחבר כדי לפרסם פוסט'),
        action: SnackBarAction(label: 'כניסה', onPressed: () => context.pushNamed('Auth')),
        duration: const Duration(seconds: 3),
      ));
      return;
    }
    final ctrl = TextEditingController();
    String selectedChannel = _activeChannel == 'הכל' ? 'המלצות' : _activeChannel;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => AnimatedPadding(
          duration: const Duration(milliseconds: 100),
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
          child: Container(
            decoration: BoxDecoration(
              color: ffTheme.background,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            ),
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: ffTheme.alternate, borderRadius: BorderRadius.circular(2)))),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Text('פוסט חדש', style: ffTheme.titleLarge),
                    const Spacer(),
                    TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: Text('ביטול', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text('ערוץ', style: ffTheme.labelLarge),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8, runSpacing: 6,
                  children: _channels.where((c) => c != 'הכל').map((ch) {
                    final active = selectedChannel == ch;
                    return GestureDetector(
                      onTap: () => setSheet(() => selectedChannel = ch),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: active ? ffTheme.primary : Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
                        ),
                        child: Text(ch, style: ffTheme.labelSmall.override(color: active ? Colors.white : ffTheme.primaryText)),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 14),
                Text('תוכן', style: ffTheme.labelLarge),
                const SizedBox(height: 8),
                TextField(
                  controller: ctrl,
                  maxLines: 4,
                  minLines: 3,
                  autofocus: true,
                  textDirection: TextDirection.rtl,
                  decoration: InputDecoration(
                    hintText: 'שתפו חוויה, טיפ, שאלה...',
                    filled: true,
                    fillColor: Colors.white,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: ffTheme.alternate)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: ffTheme.alternate)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      final text = ctrl.text.trim();
                      if (text.isEmpty) return;
                      final id = DateTime.now().millisecondsSinceEpoch.toString();
                      final author = appState.isLoggedIn ? appState.firstName : 'אורח';
                      final avatar = appState.isLoggedIn && appState.firstName.isNotEmpty ? appState.firstName[0] : 'א';
                      appState.addCommunityPost(id: id, author: author, avatar: avatar, channel: selectedChannel, text: text);
                      setState(() {
                        _posts.insert(0, CommunityPost(
                          id: id,
                          author: author,
                          avatar: avatar,
                          channel: selectedChannel,
                          text: text,
                          likes: 0,
                          replies: 0,
                          timestamp: DateTime.now(),
                        ));
                      });
                      Navigator.pop(ctx);
                    },
                    icon: const Icon(Icons.send_rounded, size: 18),
                    label: const Text('פרסם'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: ffTheme.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      textStyle: GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w700),
                      elevation: 0,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ).then((_) => ctrl.dispose());
  }

  // ── Build ─────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context, listen: false);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        flexibleSpace: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [ffTheme.primary, ffTheme.tertiary]),
          ),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('קהילת חוסך', style: GoogleFonts.rubik(fontSize: 17, fontWeight: FontWeight.w800, color: Colors.white)),
            Row(
              children: [
                Container(width: 7, height: 7, decoration: const BoxDecoration(color: Color(0xFF4CAF50), shape: BoxShape.circle))
                    .animate(onPlay: (c) => c.repeat(reverse: true))
                    .scale(begin: const Offset(1, 1), end: const Offset(1.4, 1.4), duration: 1000.ms),
                const SizedBox(width: 5),
                Text('$_onlineCount מחוברים', style: GoogleFonts.assistant(fontSize: 11, color: Colors.white70)),
              ],
            ),
          ],
        ),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          Padding(
            padding: const EdgeInsets.only(left: 16, top: 8, bottom: 8),
            child: ElevatedButton.icon(
              onPressed: () => _showComposer(context, appState, ffTheme),
              icon: const Icon(Icons.edit_rounded, size: 14),
              label: const Text('פרסם'),
              style: ElevatedButton.styleFrom(
                backgroundColor: ffTheme.secondary,
                foregroundColor: ffTheme.primary,
                elevation: 0,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                textStyle: GoogleFonts.rubik(fontSize: 12, fontWeight: FontWeight.w700),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Stats strip
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            child: Row(
              children: [
                _StatPill(
                  value: '${_posts.length}',
                  label: 'פוסטים',
                  color: ffTheme.primary,
                ),
                Container(width: 1, height: 28, color: ffTheme.alternate, margin: const EdgeInsets.symmetric(horizontal: 16)),
                _StatPill(
                  value: '${_posts.where((p) => p.timestamp.isAfter(DateTime.now().subtract(const Duration(days: 1)))).length}',
                  label: 'היום',
                  color: ffTheme.primary,
                ),
                Container(width: 1, height: 28, color: ffTheme.alternate, margin: const EdgeInsets.symmetric(horizontal: 16)),
                _StatPill(
                  value: '${_posts.fold(0, (s, p) => s + p.likes)}',
                  label: 'לייקים',
                  color: Colors.red.shade400,
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE8F5EE),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.emoji_events_rounded, size: 14, color: ffTheme.primary),
                      const SizedBox(width: 4),
                      Text('קהילה פעילה', style: ffTheme.labelSmall.override(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 300.ms),

          // Channel chips with counts
          SizedBox(
            height: 46,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
              children: _channels.map((ch) {
                final active = _activeChannel == ch;
                final count = _channelCount(ch);
                return GestureDetector(
                  onTap: () => setState(() => _activeChannel = ch),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: active ? ffTheme.primary : Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(ch, style: ffTheme.labelMedium.override(color: active ? Colors.white : ffTheme.primaryText, fontWeight: active ? FontWeight.w700 : FontWeight.w500)),
                        if (!active) ...[
                          const SizedBox(width: 5),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(color: ffTheme.background, borderRadius: BorderRadius.circular(8)),
                            child: Text('$count', style: ffTheme.labelSmall.override(color: ffTheme.secondaryText, fontSize: 10)),
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),

          // Sort + search row
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
            child: Row(
              children: [
                GestureDetector(
                  onTap: () => setState(() => _sortByPopular = !_sortByPopular),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: _sortByPopular ? ffTheme.primary.withOpacity(0.1) : ffTheme.background,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: _sortByPopular ? ffTheme.primary : ffTheme.alternate),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(_sortByPopular ? Icons.local_fire_department_rounded : Icons.access_time_rounded, size: 13, color: _sortByPopular ? ffTheme.primary : ffTheme.secondaryText),
                        const SizedBox(width: 4),
                        Text(_sortByPopular ? 'פופולרי' : 'חדש', style: ffTheme.labelSmall.override(color: _sortByPopular ? ffTheme.primary : ffTheme.secondaryText, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _searchCtrl,
                    textDirection: TextDirection.rtl,
                    decoration: InputDecoration(
                      hintText: 'חיפוש בפוסטים...',
                      hintTextDirection: TextDirection.rtl,
                      prefixIcon: _searchQuery.isEmpty
                          ? Icon(Icons.search_rounded, color: ffTheme.secondaryText, size: 18)
                          : GestureDetector(
                              onTap: () { _searchCtrl.clear(); setState(() => _searchQuery = ''); },
                              child: Icon(Icons.close_rounded, color: ffTheme.secondaryText, size: 18),
                            ),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide(color: ffTheme.alternate)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide(color: ffTheme.alternate)),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide(color: ffTheme.primary)),
                    ),
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 280.ms),

          // Hot deal banner
          ..._posts.where((p) => p.isTeam && p.planId != null).take(1).map((p) =>
            GestureDetector(
              onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': p.planId!}),
              child: Container(
                margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [const Color(0xFF0E3A26), ffTheme.primary]),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  children: [
                    const Text('🔥', style: TextStyle(fontSize: 22)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('עסקת השבוע', style: ffTheme.labelSmall.override(color: ffTheme.secondary, fontWeight: FontWeight.w700)),
                          Text(p.text.length > 60 ? '${p.text.substring(0, 60)}...' : p.text, style: ffTheme.bodySmall.override(color: Colors.white70, lineHeight: 1.3)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(Icons.arrow_forward_ios_rounded, size: 14, color: Colors.white54),
                  ],
                ),
              ),
            ).animate().fadeIn(duration: 400.ms),
          ),

          // Posts list
          Expanded(
            child: _filtered.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.forum_outlined, size: 56, color: ffTheme.alternate)
                            .animate(onPlay: (c) => c.repeat(reverse: true))
                            .scale(begin: const Offset(1, 1), end: const Offset(1.05, 1.05), duration: 1400.ms, curve: Curves.easeInOut),
                        const SizedBox(height: 16),
                        Text(
                          _searchQuery.isNotEmpty ? 'אין תוצאות עבור "$_searchQuery"' : 'אין פוסטים בערוץ זה עדיין',
                          style: ffTheme.titleSmall.override(color: ffTheme.secondaryText),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        if (_searchQuery.isEmpty) ...[
                          Text('היה הראשון לשתף!', style: ffTheme.bodySmall.override(color: ffTheme.secondaryText)),
                          const SizedBox(height: 16),
                          ElevatedButton.icon(
                            onPressed: () => _showComposer(context, appState, ffTheme),
                            icon: const Icon(Icons.edit_rounded, size: 16),
                            label: const Text('פרסם פוסט'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: ffTheme.primary,
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              textStyle: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ],
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                    itemCount: _filtered.length,
                    itemBuilder: (context, i) {
                      final post = _filtered[i];
                      return _PostCard(
                        post: post,
                        ffTheme: ffTheme,
                        bookmarked: _bookmarked.contains(post.id),
                        replyCount: _replyData.containsKey(post.id) ? _replyData[post.id]!.length : post.replies,
                        onBookmark: (id) => setState(() => _bookmarked.contains(id) ? _bookmarked.remove(id) : _bookmarked.add(id)),
                        onReply: () => _showReplies(context, post, ffTheme),
                      ).animate(delay: (i * 50).ms).fadeIn(duration: 350.ms).slideY(begin: 0.05, end: 0);
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

// ── Post card ─────────────────────────────────────────────────────────────────

class _PostCard extends StatefulWidget {
  const _PostCard({
    required this.post,
    required this.ffTheme,
    required this.bookmarked,
    required this.replyCount,
    required this.onBookmark,
    required this.onReply,
  });
  final CommunityPost post;
  final FlutterFlowTheme ffTheme;
  final bool bookmarked;
  final int replyCount;
  final ValueChanged<String> onBookmark;
  final VoidCallback onReply;

  @override
  State<_PostCard> createState() => _PostCardState();
}

class _PostCardState extends State<_PostCard> {
  bool _bouncing = false;

  String _timeAgo(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inSeconds < 60) return 'עכשיו';
    if (diff.inMinutes == 1) return 'לפני דקה';
    if (diff.inMinutes < 60) return 'לפני ${diff.inMinutes} דקות';
    if (diff.inHours == 1) return 'לפני שעה';
    if (diff.inHours < 24) return 'לפני ${diff.inHours} שעות';
    if (diff.inDays == 1) return 'אתמול';
    return 'לפני ${diff.inDays} ימים';
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = widget.ffTheme;
    final post = widget.post;
    final isTrending = post.likes >= 15;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isTrending ? ffTheme.warning.withOpacity(0.5) : ffTheme.alternate,
          width: isTrending ? 1.5 : 1,
        ),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Trending badge
                if (isTrending) ...[
                  Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: ffTheme.warning.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text('🔥', style: TextStyle(fontSize: 11)),
                        const SizedBox(width: 4),
                        Text('טרנדינג', style: ffTheme.labelSmall.override(color: ffTheme.warning, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ],

                // Author row
                Row(
                  children: [
                    Container(
                      width: 38, height: 38,
                      decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
                      child: Center(child: Text(post.avatar, style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: ffTheme.primary))),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(child: Text(post.author, style: ffTheme.labelLarge, overflow: TextOverflow.ellipsis)),
                              if (post.isTeam) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(color: ffTheme.primary, borderRadius: BorderRadius.circular(6)),
                                  child: Text('צוות', style: GoogleFonts.rubik(fontSize: 9, fontWeight: FontWeight.w700, color: Colors.white)),
                                ),
                              ],
                              if (post.isVerified) ...[
                                const SizedBox(width: 4),
                                Icon(Icons.verified_rounded, size: 14, color: ffTheme.info),
                              ],
                            ],
                          ),
                          Text(_timeAgo(post.timestamp), style: ffTheme.labelSmall),
                        ],
                      ),
                    ),
                    // Channel badge
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(color: ffTheme.background, borderRadius: BorderRadius.circular(8)),
                      child: Text(post.channel, style: ffTheme.labelSmall.override(color: ffTheme.secondaryText, fontSize: 10)),
                    ),
                    const SizedBox(width: 4),
                    // Bookmark
                    GestureDetector(
                      onTap: () => widget.onBookmark(post.id),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.all(5),
                        decoration: BoxDecoration(
                          color: widget.bookmarked ? ffTheme.accent2 : Colors.transparent,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(
                          widget.bookmarked ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
                          size: 18,
                          color: widget.bookmarked ? ffTheme.warning : ffTheme.secondaryText,
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 10),
                // Post text
                Text(post.text, style: ffTheme.bodyMedium.override(lineHeight: 1.5)),

                // Plan chip
                if (post.planId != null) ...[
                  const SizedBox(height: 10),
                  GestureDetector(
                    onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': post.planId!}),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: ffTheme.accent1,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: ffTheme.primary.withOpacity(0.2)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.open_in_new_rounded, size: 12, color: ffTheme.primary),
                          const SizedBox(width: 6),
                          Text('צפה בחבילה', style: ffTheme.labelSmall.override(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),

          // Action bar
          Container(
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: ffTheme.alternate.withOpacity(0.5))),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Row(
              children: [
                // Like
                Builder(builder: (ctx) {
                  final appState = Provider.of<FFAppState>(ctx, listen: false);
                  final liked = appState.hasLiked(post.id);
                  return _ActionBtn(
                    icon: liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                    label: '${post.likes + (liked ? 1 : 0)}',
                    color: liked ? Colors.red : ffTheme.secondaryText,
                    scale: _bouncing ? 1.4 : 1.0,
                    onTap: () {
                      appState.toggleLike(post.id);
                      setState(() { _bouncing = true; });
                      Future.delayed(const Duration(milliseconds: 400), () { if (mounted) setState(() => _bouncing = false); });
                    },
                  );
                }),
                const SizedBox(width: 4),
                // Reply
                _ActionBtn(
                  icon: Icons.chat_bubble_outline_rounded,
                  label: '${widget.replyCount}',
                  color: ffTheme.primary.withOpacity(0.7),
                  onTap: widget.onReply,
                ),
                const Spacer(),
                // Share
                _ActionBtn(
                  icon: Icons.ios_share_rounded,
                  label: '',
                  color: ffTheme.secondaryText,
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: '${post.author}: ${post.text}'));
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: const Text('הפוסט הועתק ללוח'),
                      backgroundColor: ffTheme.primary,
                      behavior: SnackBarBehavior.floating,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      duration: const Duration(seconds: 2),
                    ));
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Helper widgets ────────────────────────────────────────────────────────────

class _ActionBtn extends StatelessWidget {
  const _ActionBtn({required this.icon, required this.label, required this.color, required this.onTap, this.scale = 1.0});
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  final double scale;

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedScale(
              scale: scale,
              duration: const Duration(milliseconds: 200),
              curve: Curves.elasticOut,
              child: Icon(icon, size: 17, color: color),
            ),
            if (label.isNotEmpty) ...[
              const SizedBox(width: 4),
              Text(label, style: ffTheme.labelSmall.override(color: color, fontWeight: FontWeight.w600)),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatPill extends StatelessWidget {
  const _StatPill({required this.value, required this.label, required this.color});
  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value, style: GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w800, color: color)),
        Text(label, style: ffTheme.labelSmall.override(color: ffTheme.secondaryText, fontSize: 10)),
      ],
    );
  }
}

class _Reply {
  final String author, avatar, text;
  final DateTime time;
  const _Reply({required this.author, required this.avatar, required this.text, required this.time});
}

class _ReplyBubble extends StatelessWidget {
  const _ReplyBubble({required this.reply, required this.ffTheme});
  final _Reply reply;
  final FlutterFlowTheme ffTheme;

  String _timeAgo(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 1) return 'עכשיו';
    if (diff.inMinutes < 60) return 'לפני ${diff.inMinutes} ד׳';
    if (diff.inHours < 24) return 'לפני ${diff.inHours} ש׳';
    return 'לפני ${diff.inDays} ימים';
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
            child: Center(child: Text(reply.avatar, style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w700, color: ffTheme.primary))),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(reply.author, style: ffTheme.labelMedium),
                    const SizedBox(width: 8),
                    Text(_timeAgo(reply.time), style: ffTheme.labelSmall.override(color: ffTheme.secondaryText.withOpacity(0.65), fontSize: 10)),
                  ],
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: ffTheme.background,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(14),
                      bottomLeft: Radius.circular(14),
                      bottomRight: Radius.circular(14),
                    ),
                    border: Border.all(color: ffTheme.alternate),
                  ),
                  child: Text(reply.text, style: ffTheme.bodySmall.override(lineHeight: 1.4)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
