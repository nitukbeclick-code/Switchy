import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../widgets/media/community_media.dart';
import '../../services/media_service.dart';
import '../../services/backend/local_backend.dart';
import '../../services/backend/backend.dart';

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
  bool _showBookmarksOnly = false;
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
    final appState = AppState();
    final persisted = appState.communityPosts.map((m) => CommunityPost(
      id: m['id'] as String,
      author: m['author'] as String,
      avatar: m['avatar'] as String,
      channel: m['channel'] as String,
      text: m['text'] as String,
      likes: 0,
      replies: 0,
      timestamp: DateTime.tryParse(m['ts'] as String? ?? '') ?? DateTime.now(),
      mediaType: m['mediaType'] as String?,
      mediaData: m['mediaData'] as String?,
      mediaDurationMs: m['mediaDurationMs'] as int?,
    )).toList();
    _posts = [...persisted, ...communityPosts];
    _replyData.addAll(_mockReplies);
    // Merge persisted user replies on top of the seed conversation.
    appState.communityReplies.forEach((postId, raw) {
      final converted = raw.map((m) => _Reply(
        author: m['author'] as String? ?? 'אורח',
        avatar: m['avatar'] as String? ?? 'א',
        text: m['text'] as String? ?? '',
        time: DateTime.tryParse(m['ts'] as String? ?? '') ?? DateTime.now(),
        mediaType: m['mediaType'] as String?,
        mediaData: m['mediaData'] as String?,
        mediaDurationMs: m['mediaDurationMs'] as int?,
      )).toList();
      _replyData.putIfAbsent(postId, () => []).addAll(converted);
    });
    _onlineTimer = Timer.periodic(const Duration(seconds: 12), (_) {
      if (mounted) setState(() => _onlineCount = 820 + (DateTime.now().millisecond % 41) - 20);
    });
    _searchCtrl.addListener(() => setState(() => _searchQuery = _searchCtrl.text));
    _loadFromBackend().catchError((_) {});
  }

  Future<void> _loadFromBackend() async {
    try {
      final remote = await appBackend.fetchPosts();
      if (!mounted || remote.isEmpty) return;
      final remoteIds = remote.map((p) => p.id).toSet();
      final seedOnly = communityPosts.where((p) => !remoteIds.contains(p.id)).toList();
      setState(() => _posts = [...remote, ...seedOnly]);
    } catch (_) {}
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
    final appState = AppState();
    var base = _activeChannel == 'הכל'
        ? _posts
        : _posts.where((p) => p.channel == _activeChannel).toList();
    if (_showBookmarksOnly) {
      base = base.where((p) => appState.isBookmarked(p.id)).toList();
    }
    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      base = base.where((p) =>
          p.text.toLowerCase().contains(q) ||
          p.author.toLowerCase().contains(q) ||
          p.channel.toLowerCase().contains(q)).toList();
    }
    if (_sortByPopular) return List.from(base)..sort((a, b) => b.likes.compareTo(a.likes));
    return base;
  }

  // ── Feed actions ───────────────────────────────────────────────────────────────

  Future<void> _refreshFeed() async {
    HapticFeedback.mediumImpact();
    await _loadFromBackend();
    if (mounted) setState(() => _onlineCount = 820 + (DateTime.now().millisecond % 41) - 20);
  }

  void _confirmDelete(BuildContext context, CommunityPost post, AppState appState, AppTheme ffTheme) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('מחיקת פוסט', textAlign: TextAlign.center),
        content: const Text('למחוק את הפוסט? לא ניתן לשחזר.', textAlign: TextAlign.center),
        actionsAlignment: MainAxisAlignment.center,
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('ביטול')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              HapticFeedback.mediumImpact();
              appState.removeCommunityPost(post.id);
              setState(() => _posts.removeWhere((p) => p.id == post.id));
              appBackend.deletePost(post.id).catchError((_) {});
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: ffTheme.error,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('מחק'),
          ),
        ],
      ),
    );
  }

  void _submitReply({
    required BuildContext ctx,
    required StateSetter setSheet,
    required List<_Reply> replies,
    required TextEditingController replyCtrl,
    required String postId,
    required ScrollController scrollCtrl,
    String? pendingType,
    String? pendingData,
    int? pendingDur,
  }) {
    final text = replyCtrl.text.trim();
    if (text.isEmpty && pendingData == null) return;
    HapticFeedback.lightImpact();
    final appState = Provider.of<AppState>(ctx, listen: false);
    final author = appState.isLoggedIn ? appState.firstName : 'אורח';
    final avatar = appState.isLoggedIn && appState.firstName.isNotEmpty ? appState.firstName[0] : 'א';
    appState.addCommunityReply(
      postId: postId,
      author: author,
      avatar: avatar,
      text: text,
      mediaType: pendingType,
      mediaData: pendingData,
      mediaDurationMs: pendingDur,
    );
    setSheet(() {
      replies.add(_Reply(
        author: author,
        avatar: avatar,
        text: text,
        time: DateTime.now(),
        mediaType: pendingType,
        mediaData: pendingData,
        mediaDurationMs: pendingDur,
      ));
      replyCtrl.clear();
    });
    setState(() {});
    appBackend.addReply(ReplyInput(
      postId: postId,
      author: author,
      avatar: avatar,
      text: text,
      mediaType: pendingType,
      media: pendingData,
      mediaDurationMs: pendingDur,
    )).catchError((_) {});
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (scrollCtrl.hasClients) {
        scrollCtrl.animateTo(scrollCtrl.position.maxScrollExtent,
            duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      }
    });
  }

  // ── Reply thread ─────────────────────────────────────────────────────────────

  void _showReplies(BuildContext context, CommunityPost post, AppTheme ffTheme) async {
    _replyData.putIfAbsent(post.id, () => []);
    try {
      final remote = await appBackend.fetchReplies(post.id);
      if (remote.isNotEmpty && mounted) {
        final remoteReplies = remote.map((r) => _Reply(
          author: r.author, avatar: r.avatar, text: r.text,
          time: r.createdAt, mediaType: r.mediaType, mediaData: r.media,
          mediaDurationMs: r.mediaDurationMs,
        )).toList();
        _replyData[post.id] = [...remoteReplies, ...(_mockReplies[post.id] ?? [])];
      }
    } catch (_) {}
    if (!mounted) return;
    final replyCtrl = TextEditingController();
    String? replyPendingType;
    String? replyPendingData;
    int? replyPendingDur;

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
                              child: Text('${replies.length}', style: ffTheme.labelSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
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
                        Text(post.text, style: ffTheme.bodySmall.copyWith(height: 1.4), maxLines: 3, overflow: TextOverflow.ellipsis),
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
                                Text('אין תגובות עדיין', style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
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
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Pending attachment preview
                        if (replyPendingData != null) ...[
                          Stack(
                            children: [
                              if (replyPendingType == 'image')
                                MediaImageBubble(dataUri: replyPendingData!, maxHeight: 120)
                              else if (replyPendingType == 'video')
                                VideoMessageBubble(source: replyPendingData!, maxHeight: 160)
                              else
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                  decoration: BoxDecoration(
                                    color: ffTheme.accent1,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: ffTheme.primary.withOpacity(0.2)),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.mic, size: 16, color: ffTheme.primary),
                                      const SizedBox(width: 6),
                                      Text('הודעה קולית', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary)),
                                    ],
                                  ),
                                ),
                              Positioned(
                                top: 4,
                                left: 4,
                                child: GestureDetector(
                                  onTap: () => setSheet(() {
                                    replyPendingType = null;
                                    replyPendingData = null;
                                    replyPendingDur = null;
                                  }),
                                  child: Container(
                                    padding: const EdgeInsets.all(3),
                                    decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                                    child: const Icon(Icons.close, color: Colors.white, size: 14),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                        ],
                        Row(
                          children: [
                            // Image from gallery
                            IconButton(
                              icon: const Icon(Icons.image_outlined),
                              color: ffTheme.primary,
                              tooltip: 'צרף תמונה',
                              onPressed: () async {
                                final uri = await MediaService.pickImageDataUri();
                                if (uri != null) setSheet(() { replyPendingType = 'image'; replyPendingData = uri; replyPendingDur = null; });
                              },
                            ),
                            // Voice recorder
                            VoiceRecorderButton(
                              onRecorded: (source, durationMs) async {
                                final storable = await MediaService.persistableAudio(source);
                                setSheet(() { replyPendingType = 'audio'; replyPendingData = storable; replyPendingDur = durationMs; });
                              },
                            ),
                            // Video attach
                            IconButton(
                              icon: const Icon(Icons.videocam_rounded),
                              color: ffTheme.primary,
                              tooltip: 'וידאו',
                              onPressed: () async {
                                final v = await MediaService.pickVideoPath();
                                if (v != null) setSheet(() { replyPendingType = 'video'; replyPendingData = v; replyPendingDur = null; });
                              },
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: TextField(
                                controller: replyCtrl,
                                textDirection: TextDirection.rtl,
                                textInputAction: TextInputAction.send,
                                onSubmitted: (_) => _submitReply(
                                  ctx: ctx,
                                  setSheet: setSheet,
                                  replies: replies,
                                  replyCtrl: replyCtrl,
                                  postId: post.id,
                                  scrollCtrl: scrollCtrl,
                                  pendingType: replyPendingType,
                                  pendingData: replyPendingData,
                                  pendingDur: replyPendingDur,
                                ),
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
                            const SizedBox(width: 8),
                            Semantics(
                              button: true,
                              label: 'שלח תגובה',
                              child: GestureDetector(
                                onTap: () {
                                  _submitReply(
                                    ctx: ctx,
                                    setSheet: setSheet,
                                    replies: replies,
                                    replyCtrl: replyCtrl,
                                    postId: post.id,
                                    scrollCtrl: scrollCtrl,
                                    pendingType: replyPendingType,
                                    pendingData: replyPendingData,
                                    pendingDur: replyPendingDur,
                                  );
                                  setSheet(() { replyPendingType = null; replyPendingData = null; replyPendingDur = null; });
                                },
                                child: Container(
                                  width: 44, height: 44,
                                  decoration: BoxDecoration(color: ffTheme.primary, shape: BoxShape.circle),
                                  child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                                ),
                              ),
                            ),
                          ],
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

  void _showComposer(BuildContext context, AppState appState, AppTheme ffTheme) {
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
    String? pendingType;
    String? pendingData;
    int? pendingDur;

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
                      child: Text('ביטול', style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
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
                        child: Text(ch, style: ffTheme.labelSmall.copyWith(color: active ? Colors.white : ffTheme.primaryText)),
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
                  maxLength: 500,
                  autofocus: true,
                  textDirection: TextDirection.rtl,
                  onChanged: (_) => setSheet(() {}),
                  decoration: InputDecoration(
                    hintText: 'שתפו חוויה, טיפ, שאלה...',
                    filled: true,
                    fillColor: Colors.white,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: ffTheme.alternate)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: ffTheme.alternate)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
                  ),
                ),
                const SizedBox(height: 10),

                // Media attach row
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.image_outlined),
                      color: ffTheme.primary,
                      tooltip: 'תמונה מהגלריה',
                      onPressed: () async {
                        final uri = await MediaService.pickImageDataUri();
                        if (uri != null) setSheet(() { pendingType = 'image'; pendingData = uri; pendingDur = null; });
                      },
                    ),
                    IconButton(
                      icon: const Icon(Icons.camera_alt_outlined),
                      color: ffTheme.primary,
                      tooltip: 'צלם תמונה',
                      onPressed: () async {
                        final uri = await MediaService.pickImageDataUri(fromCamera: true);
                        if (uri != null) setSheet(() { pendingType = 'image'; pendingData = uri; pendingDur = null; });
                      },
                    ),
                    VoiceRecorderButton(
                      onRecorded: (source, durationMs) async {
                        final storable = await MediaService.persistableAudio(source);
                        setSheet(() { pendingType = 'audio'; pendingData = storable; pendingDur = durationMs; });
                      },
                    ),
                    IconButton(
                      icon: const Icon(Icons.videocam_rounded),
                      color: ffTheme.primary,
                      tooltip: 'וידאו',
                      onPressed: () async {
                        final v = await MediaService.pickVideoPath();
                        if (v != null) setSheet(() { pendingType = 'video'; pendingData = v; pendingDur = null; });
                      },
                    ),
                    if (pendingData != null) ...[
                      const SizedBox(width: 8),
                      Expanded(
                        child: Stack(
                          children: [
                            if (pendingType == 'image')
                              MediaImageBubble(dataUri: pendingData!, maxHeight: 100)
                            else if (pendingType == 'video')
                              VideoMessageBubble(source: pendingData!, maxHeight: 160)
                            else
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                decoration: BoxDecoration(
                                  color: ffTheme.accent1,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: ffTheme.primary.withOpacity(0.2)),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.mic, size: 16, color: ffTheme.primary),
                                    const SizedBox(width: 6),
                                    Text('הודעה קולית', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary)),
                                  ],
                                ),
                              ),
                            Positioned(
                              top: 4,
                              left: 4,
                              child: GestureDetector(
                                onTap: () => setSheet(() { pendingType = null; pendingData = null; pendingDur = null; }),
                                child: Container(
                                  padding: const EdgeInsets.all(3),
                                  decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                                  child: const Icon(Icons.close, color: Colors.white, size: 14),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      final text = ctrl.text.trim();
                      if (text.isEmpty && pendingData == null) return;
                      HapticFeedback.lightImpact();
                      final id = DateTime.now().millisecondsSinceEpoch.toString();
                      final author = appState.isLoggedIn ? appState.firstName : 'אורח';
                      final avatar = appState.isLoggedIn && appState.firstName.isNotEmpty ? appState.firstName[0] : 'א';
                      appState.addCommunityPost(
                        id: id, author: author, avatar: avatar, channel: selectedChannel, text: text,
                        mediaType: pendingType, mediaData: pendingData, mediaDurationMs: pendingDur,
                      );
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
                          mediaType: pendingType,
                          mediaData: pendingData,
                          mediaDurationMs: pendingDur,
                        ));
                      });
                      Navigator.pop(ctx);
                      appBackend.createPost(PostInput(
                        author: author,
                        avatar: avatar,
                        channel: selectedChannel,
                        text: text,
                        mediaType: pendingType,
                        media: pendingData,
                        mediaDurationMs: pendingDur,
                      )).catchError((_) {});
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
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context, listen: false);

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
                      Text('קהילה פעילה', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
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
                        Text(ch, style: ffTheme.labelMedium.copyWith(color: active ? Colors.white : ffTheme.primaryText, fontWeight: active ? FontWeight.w700 : FontWeight.w500)),
                        if (!active) ...[
                          const SizedBox(width: 5),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(color: ffTheme.background, borderRadius: BorderRadius.circular(8)),
                            child: Text('$count', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontSize: 10)),
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
                        Text(_sortByPopular ? 'פופולרי' : 'חדש', style: ffTheme.labelSmall.copyWith(color: _sortByPopular ? ffTheme.primary : ffTheme.secondaryText, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Tooltip(
                  message: 'פוסטים שמורים',
                  child: GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() => _showBookmarksOnly = !_showBookmarksOnly);
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: _showBookmarksOnly ? ffTheme.warning.withOpacity(0.12) : ffTheme.background,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: _showBookmarksOnly ? ffTheme.warning : ffTheme.alternate),
                      ),
                      child: Icon(
                        _showBookmarksOnly ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
                        size: 15,
                        color: _showBookmarksOnly ? ffTheme.warning : ffTheme.secondaryText,
                      ),
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
                          Text('עסקת השבוע', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondary, fontWeight: FontWeight.w700)),
                          Text(p.text.length > 60 ? '${p.text.substring(0, 60)}...' : p.text, style: ffTheme.bodySmall.copyWith(color: Colors.white70, height: 1.3)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Icon(Icons.arrow_forward_ios_rounded, size: 14, color: Colors.white54),
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
                        Icon(_showBookmarksOnly ? Icons.bookmark_border_rounded : Icons.forum_outlined, size: 56, color: ffTheme.alternate)
                            .animate(onPlay: (c) => c.repeat(reverse: true))
                            .scale(begin: const Offset(1, 1), end: const Offset(1.05, 1.05), duration: 1400.ms, curve: Curves.easeInOut),
                        const SizedBox(height: 16),
                        Text(
                          _showBookmarksOnly
                              ? 'אין פוסטים שמורים'
                              : _searchQuery.isNotEmpty
                                  ? 'אין תוצאות עבור "$_searchQuery"'
                                  : 'אין פוסטים בערוץ זה עדיין',
                          style: ffTheme.titleSmall.copyWith(color: ffTheme.secondaryText),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        if (_showBookmarksOnly) ...[
                          Text('סמנו 🔖 על פוסטים כדי לשמור אותם לכאן', style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText), textAlign: TextAlign.center),
                          const SizedBox(height: 16),
                          OutlinedButton(
                            onPressed: () => setState(() => _showBookmarksOnly = false),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: ffTheme.primary,
                              side: BorderSide(color: ffTheme.primary),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            child: const Text('הצג את כל הפוסטים'),
                          ),
                        ] else if (_searchQuery.isEmpty) ...[
                          Text('היה הראשון לשתף!', style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
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
                : RefreshIndicator(
                    onRefresh: _refreshFeed,
                    color: ffTheme.primary,
                    child: ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                      itemCount: _filtered.length,
                      itemBuilder: (context, i) {
                        final post = _filtered[i];
                        return _PostCard(
                          post: post,
                          ffTheme: ffTheme,
                          bookmarked: appState.isBookmarked(post.id),
                          isOwn: appState.isOwnPost(post.id),
                          replyCount: _replyData.containsKey(post.id) ? _replyData[post.id]!.length : post.replies,
                          onBookmark: (id) {
                            HapticFeedback.selectionClick();
                            appBackend.setBookmark(id, !appState.isBookmarked(id)).catchError((_) {});
                            appState.toggleBookmark(id);
                            setState(() {});
                          },
                          onReply: () => _showReplies(context, post, ffTheme),
                          onDelete: () => _confirmDelete(context, post, appState, ffTheme),
                        ).animate(delay: (i * 50).ms).fadeIn(duration: 350.ms).slideY(begin: 0.05, end: 0);
                      },
                    ),
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
    this.isOwn = false,
    this.onDelete,
  });
  final CommunityPost post;
  final AppTheme ffTheme;
  final bool bookmarked;
  final int replyCount;
  final ValueChanged<String> onBookmark;
  final VoidCallback onReply;
  final bool isOwn;
  final VoidCallback? onDelete;

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
                        Text('טרנדינג', style: ffTheme.labelSmall.copyWith(color: ffTheme.warning, fontWeight: FontWeight.w700)),
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
                      child: Text(post.channel, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontSize: 10)),
                    ),
                    const SizedBox(width: 4),
                    // Bookmark
                    Semantics(
                      button: true,
                      label: widget.bookmarked ? 'הסר מהשמורים' : 'שמור פוסט',
                      child: Tooltip(
                        message: widget.bookmarked ? 'הסר מהשמורים' : 'שמור',
                        child: GestureDetector(
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
                      ),
                    ),
                    // Own-post overflow menu
                    if (widget.isOwn && widget.onDelete != null)
                      SizedBox(
                        height: 28,
                        width: 28,
                        child: PopupMenuButton<String>(
                          padding: EdgeInsets.zero,
                          tooltip: 'אפשרויות',
                          icon: Icon(Icons.more_vert_rounded, size: 18, color: ffTheme.secondaryText),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          onSelected: (v) {
                            if (v == 'delete') widget.onDelete!();
                          },
                          itemBuilder: (_) => [
                            PopupMenuItem<String>(
                              value: 'delete',
                              child: Row(
                                children: [
                                  Icon(Icons.delete_outline_rounded, size: 18, color: ffTheme.error),
                                  const SizedBox(width: 8),
                                  Text('מחק פוסט', style: ffTheme.bodyMedium.copyWith(color: ffTheme.error)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),

                const SizedBox(height: 10),
                // Post text
                if (post.text.isNotEmpty)
                  Text(post.text, style: ffTheme.bodyMedium.copyWith(height: 1.5)),

                // Media
                if (post.hasMedia) ...[
                  const SizedBox(height: 10),
                  if (post.media == MediaKind.image)
                    MediaImageBubble(dataUri: post.mediaData!)
                  else if (post.media == MediaKind.audio)
                    VoiceMessageBubble(source: post.mediaData!, durationMs: post.mediaDurationMs)
                  else if (post.mediaType == 'video')
                    VideoMessageBubble(source: post.mediaData!),
                ],

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
                          Text('צפה בחבילה', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
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
                  final appState = Provider.of<AppState>(ctx, listen: false);
                  final liked = appState.hasLiked(post.id);
                  return _ActionBtn(
                    icon: liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                    label: '${post.likes + (liked ? 1 : 0)}',
                    color: liked ? Colors.red : ffTheme.secondaryText,
                    scale: _bouncing ? 1.4 : 1.0,
                    semanticLabel: liked ? 'בטל לייק' : 'אהבתי',
                    onTap: () {
                      HapticFeedback.selectionClick();
                      appBackend.setLike(post.id, !liked).catchError((_) {});
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
                  semanticLabel: 'הגב לפוסט',
                  onTap: widget.onReply,
                ),
                const Spacer(),
                // Share
                _ActionBtn(
                  icon: Icons.ios_share_rounded,
                  label: '',
                  color: ffTheme.secondaryText,
                  semanticLabel: 'שתף פוסט',
                  onTap: () {
                    HapticFeedback.selectionClick();
                    Share.share('${post.author}:\n${post.text}\n\nמתוך אפליקציית חוסך 💚');
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
  const _ActionBtn({required this.icon, required this.label, required this.color, required this.onTap, this.scale = 1.0, this.semanticLabel});
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  final double scale;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    return Semantics(
      button: true,
      label: semanticLabel,
      child: GestureDetector(
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
                Text(label, style: ffTheme.labelSmall.copyWith(color: color, fontWeight: FontWeight.w600)),
              ],
            ],
          ),
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
    final ffTheme = AppTheme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value, style: GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w800, color: color)),
        Text(label, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontSize: 10)),
      ],
    );
  }
}

class _Reply {
  final String author, avatar, text;
  final DateTime time;
  final String? mediaType;
  final String? mediaData;
  final int? mediaDurationMs;
  const _Reply({
    required this.author,
    required this.avatar,
    required this.text,
    required this.time,
    this.mediaType,
    this.mediaData,
    this.mediaDurationMs,
  });
}

class _ReplyBubble extends StatelessWidget {
  const _ReplyBubble({required this.reply, required this.ffTheme});
  final _Reply reply;
  final AppTheme ffTheme;

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
                    Text(_timeAgo(reply.time), style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText.withOpacity(0.65), fontSize: 10)),
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (reply.text.isNotEmpty)
                        Text(reply.text, style: ffTheme.bodySmall.copyWith(height: 1.4)),
                      if (reply.mediaData != null) ...[
                        if (reply.text.isNotEmpty) const SizedBox(height: 8),
                        if (reply.mediaType == 'image')
                          MediaImageBubble(dataUri: reply.mediaData!, maxHeight: 160)
                        else if (reply.mediaType == 'audio')
                          VoiceMessageBubble(source: reply.mediaData!, durationMs: reply.mediaDurationMs)
                        else if (reply.mediaType == 'video')
                          VideoMessageBubble(source: reply.mediaData!),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
