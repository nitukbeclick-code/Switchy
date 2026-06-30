import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_snackbar.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../widgets/media/community_media.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/skeleton.dart';
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
  bool _sortByPopular = false;
  bool _showBookmarksOnly = false;
  // Reply threads, keyed by post id. Populated only from real backend content
  // (and the user's own persisted replies) — no fabricated seed conversations.
  final Map<String, List<_Reply>> _replyData = {};

  // Feed windowing: build only the first [_visibleCount] posts and grow the
  // window as the user nears the bottom. For short feeds this is a no-op
  // (the window already covers every post); it only matters as content grows.
  static const _feedPageSize = 20;
  int _visibleCount = _feedPageSize;
  final _feedScrollCtrl = ScrollController();

  static const _channels = ['הכל', 'המלצות', 'סלולר', 'אינטרנט', 'טלוויזיה', 'חו"ל', 'חבילה משולבת', 'עזרה בניתוק'];

  StreamSubscription<void>? _changesSub;

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
    // Merge the user's own persisted replies (real, locally authored content).
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
    _searchCtrl.addListener(() => setState(() {
          _searchQuery = _searchCtrl.text;
          _visibleCount = _feedPageSize; // new query → reset the window
        }));
    _feedScrollCtrl.addListener(_maybeGrowFeed);
    _loadFromBackend().catchError((_) {});
    _changesSub = appBackend.communityChanges().listen(
      (_) => _loadFromBackend().catchError((_) {}),
    );
  }

  // Whether the FIRST remote fetch has settled — until then an empty feed
  // shows shimmer skeletons rather than the "no posts yet" empty state.
  bool _firstLoadDone = false;

  // Set when the most recent backend fetch threw. Used only to choose between
  // the honest "couldn't load" + retry state and the "no posts yet" empty state
  // when the feed has nothing to show — so an offline first load never silently
  // masquerades as an empty community.
  bool _loadFailed = false;

  Future<void> _loadFromBackend() async {
    try {
      final remote = await appBackend.fetchPosts();
      if (!mounted) return;
      if (remote.isNotEmpty) {
        final remoteIds = remote.map((p) => p.id).toSet();
        final seedOnly = communityPosts.where((p) => !remoteIds.contains(p.id)).toList();
        setState(() => _posts = [...remote, ...seedOnly]);
      }
      if (mounted) setState(() => _loadFailed = false);
    } catch (_) {
      // Offline — seeds/local stay. Flag the failure so an otherwise-empty feed
      // can offer a retry instead of an "empty community" lie.
      if (mounted) setState(() => _loadFailed = true);
    } finally {
      if (mounted && !_firstLoadDone) setState(() => _firstLoadDone = true);
    }
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _feedScrollCtrl.dispose();
    _changesSub?.cancel();
    super.dispose();
  }

  // Grow the visible window as the user approaches the end of the built list.
  void _maybeGrowFeed() {
    if (!_feedScrollCtrl.hasClients) return;
    final pos = _feedScrollCtrl.position;
    if (pos.pixels >= pos.maxScrollExtent - 400 && _visibleCount < _filtered.length) {
      setState(() => _visibleCount += _feedPageSize);
    }
  }

  int _channelCount(String ch) {
    final appState = AppState();
    final visible = _posts.where((p) => !p.isFlagged || appState.isOwnPost(p.id));
    return ch == 'הכל' ? visible.length : visible.where((p) => p.channel == ch).length;
  }

  List<CommunityPost> get _filtered {
    final appState = AppState();
    // Hide moderator-flagged posts from the feed. A user's OWN flagged post is
    // kept so they see a subtle "בבדיקת מנהל" placeholder instead of it silently
    // vanishing (the body is replaced in [_PostCard]).
    var base = _posts.where((p) => !p.isFlagged || appState.isOwnPost(p.id)).toList();
    if (_activeChannel != 'הכל') {
      base = base.where((p) => p.channel == _activeChannel).toList();
    }
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
    if (mounted) setState(() {});
  }

  void _confirmDelete(BuildContext context, CommunityPost post, AppState appState, AppTheme ffTheme) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusXl)),
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
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusLg)),
            ),
            child: const Text('מחק'),
          ),
        ],
      ),
    );
  }

  // ── Report content ───────────────────────────────────────────────────────────

  /// Opens a small bottom-sheet for reporting a post or reply. [targetType] is
  /// 'post' | 'reply'. On submit it calls [Backend.reportContent] (fire-and-
  /// forget) and toasts a thank-you. Own content can't reach here.
  void _showReportSheet(BuildContext context, AppTheme ffTheme, {required String targetType, required String targetId}) {
    const reasons = ['ספאם', 'הטרדה', 'תוכן לא הולם', 'אחר'];
    String? selectedReason;
    final noteCtrl = TextEditingController();

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
              borderRadius: BorderRadius.vertical(top: Radius.circular(ffTheme.radiusSheet)),
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
                    Icon(Icons.flag_rounded, size: 18, color: ffTheme.error),
                    const SizedBox(width: 8),
                    Text('דיווח על תוכן', style: ffTheme.titleLarge),
                    const Spacer(),
                    TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: Text('ביטול', style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text('מהי הסיבה לדיווח?', style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8, runSpacing: 8,
                  children: reasons.map((r) {
                    final active = selectedReason == r;
                    return GestureDetector(
                      onTap: () => setSheet(() => selectedReason = r),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        curve: ffTheme.easeInOut,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: active ? AppColors.primary : ffTheme.cardSurface,
                          borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                          border: Border.all(color: active ? AppColors.primary : ffTheme.alternate),
                        ),
                        child: Text(r, style: ffTheme.labelMedium.copyWith(color: active ? Colors.white : ffTheme.primaryText)),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: noteCtrl,
                  maxLines: 3,
                  minLines: 2,
                  maxLength: 300,
                  textDirection: TextDirection.rtl,
                  decoration: InputDecoration(
                    hintText: 'פרטים נוספים (לא חובה)...',
                    filled: true,
                    fillColor: ffTheme.cardSurface,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.alternate)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.alternate)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
                  ),
                ),
                const SizedBox(height: 6),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: selectedReason == null
                        ? null
                        : () {
                            HapticFeedback.lightImpact();
                            final note = noteCtrl.text.trim();
                            appBackend.reportContent(
                              targetType: targetType,
                              targetId: targetId,
                              reason: selectedReason!,
                              body: note.isEmpty ? null : note,
                            ).catchError((_) {});
                            Navigator.pop(ctx);
                            AppSnackBar.success(context, 'תודה, הדיווח התקבל');
                          },
                    icon: const Icon(Icons.send_rounded, size: 18),
                    label: const Text('שלח דיווח'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: ffTheme.error,
                      foregroundColor: Colors.white,
                      disabledBackgroundColor: ffTheme.alternate,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard)),
                      textStyle: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w700),
                      elevation: 0,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ).then((_) => noteCtrl.dispose());
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
    // Replies persist via RLS-protected inserts (user_id = auth.uid()), so an
    // anon reply would be optimistically shown then silently rejected by the DB
    // and vanish on refresh. Gate it the same way the post composer does.
    if (!appState.isLoggedIn) {
      AppSnackBar.info(ctx, 'יש להתחבר כדי להגיב',
          action: SnackBarAction(
              label: 'כניסה', onPressed: () => ctx.pushNamed('Auth')));
      return;
    }
    final author = appState.firstName;
    final avatar = appState.firstName.isNotEmpty ? appState.firstName[0] : 'א';
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
        // Drop moderator-flagged replies before they reach the thread UI.
        final remoteReplies = remote.where((r) => !r.isFlagged).map((r) => _Reply(
          id: r.id, author: r.author, avatar: r.avatar, text: r.text,
          time: r.createdAt, mediaType: r.mediaType, mediaData: r.media,
          mediaDurationMs: r.mediaDurationMs,
        )).toList();
        // Keep any locally authored replies for this post; replace the rest
        // with the live backend thread (no fabricated seed replies).
        final localOnly = (_replyData[post.id] ?? const <_Reply>[])
            .where((local) => !remoteReplies.any((r) =>
                r.author == local.author && r.text == local.text && r.time == local.time))
            .toList();
        _replyData[post.id] = [...remoteReplies, ...localOnly];
      }
    } catch (_) {}
    if (!context.mounted) return;
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
                borderRadius: BorderRadius.vertical(top: Radius.circular(ffTheme.radiusSheet)),
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
                              decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(ffTheme.radiusLg)),
                              child: Text('${replies.length}', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontWeight: FontWeight.w700)),
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
                      color: ffTheme.cardSurface,
                      borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                      border: Border.all(color: ffTheme.primary.withValues(alpha: 0.2)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 28, height: 28,
                              decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
                              child: Center(child: Text(post.avatar, style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w700, color: ffTheme.primary))),
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
                        ? const EmptyState(
                            icon: Icons.chat_bubble_outline_rounded,
                            headline: 'עדיין אין תגובות',
                            // Plural, calm voice — matches the feed's empty state
                            // ("היו הראשונים לשתף") instead of the old
                            // masculine-singular exclamatory nudge.
                            subtitle: 'היו הראשונים להגיב',
                          )
                        : ListView.builder(
                            controller: scrollCtrl,
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                            itemCount: replies.length,
                            itemBuilder: (_, i) {
                              final reply = replies[i];
                              final appState = AppState();
                              // Reportable only when it's a persisted backend reply
                              // (has an id) authored by someone other than the user.
                              final isOwnReply = appState.isLoggedIn && reply.author == appState.firstName;
                              final canReport = reply.id != null && !isOwnReply;
                              return _ReplyBubble(
                                reply: reply,
                                ffTheme: ffTheme,
                                onReport: canReport
                                    ? () => _showReportSheet(context, ffTheme, targetType: 'reply', targetId: reply.id!)
                                    : null,
                              ).animate(delay: (i * 50).ms).fadeIn(duration: 250.ms).slideY(begin: 0.05);
                            },
                          ),
                  ),

                  // Reply input
                  Container(
                    padding: EdgeInsets.fromLTRB(16, 10, 16, MediaQuery.of(ctx).viewInsets.bottom + 16),
                    decoration: BoxDecoration(
                      color: ffTheme.cardSurface,
                      border: Border(top: BorderSide(color: ffTheme.alternate)),
                      boxShadow: ffTheme.shadowSoft,
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
                                    borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                                    border: Border.all(color: ffTheme.primary.withValues(alpha: 0.2)),
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
                                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusPill), borderSide: BorderSide(color: ffTheme.alternate)),
                                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusPill), borderSide: BorderSide(color: ffTheme.alternate)),
                                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusPill), borderSide: BorderSide(color: ffTheme.primary)),
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
                                  decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
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
      AppSnackBar.info(context, 'יש להתחבר כדי לפרסם פוסט',
          action: SnackBarAction(
              label: 'כניסה', onPressed: () => context.pushNamed('Auth')));
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
              borderRadius: BorderRadius.vertical(top: Radius.circular(ffTheme.radiusSheet)),
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
                        curve: ffTheme.easeInOut,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: active ? AppColors.primary : ffTheme.cardSurface,
                          borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                          border: Border.all(color: active ? AppColors.primary : ffTheme.alternate),
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
                    fillColor: ffTheme.cardSurface,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.alternate)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.alternate)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
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
                                  borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                                  border: Border.all(color: ffTheme.primary.withValues(alpha: 0.2)),
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
                              child: Semantics(
                                button: true,
                                label: 'הסר צירוף',
                                child: GestureDetector(
                                  onTap: () => setSheet(() { pendingType = null; pendingData = null; pendingDur = null; }),
                                  child: Container(
                                    padding: const EdgeInsets.all(3),
                                    decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                                    child: const ExcludeSemantics(child: Icon(Icons.close, color: Colors.white, size: 14)),
                                  ),
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
                      )).ignore();
                    },
                    icon: const Icon(Icons.send_rounded, size: 18),
                    label: const Text('פרסם'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard)),
                      textStyle: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w700),
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
          // Fixed ink header (const tokens) so white title/subtitle keep their
          // contrast in BOTH themes.
          decoration: const BoxDecoration(
            color: AppColors.primary,
          ),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // App-bar title/subtitle on the fixed ink header — sourced from the
            // type scale, with white-on-ink colour as the only delta (the
            // subtitle keeps its lighter w400 via copyWith since the nearest
            // size token, labelSmall, is w600).
            Text('קהילת Switchy AI', style: ffTheme.headlineSmall.copyWith(fontWeight: FontWeight.w800, color: Colors.white)),
            Text('שתפו חוויות, טיפים ועצות חיסכון', style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w400, color: Colors.white70)),
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
                backgroundColor: AppColors.secondary,
                foregroundColor: AppColors.primary,
                elevation: 0,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                textStyle: ffTheme.titleSmall.copyWith(fontSize: 12, fontWeight: FontWeight.w700),
                // App-bar "publish" pill — full-round to preserve the pill look
                // (radius-20 on a short chip reads as a pill, not a 12 card).
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusPill)),
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Stats strip
          Container(
            color: ffTheme.cardSurface,
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
                  color: ffTheme.error,
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: BorderRadius.circular(ffTheme.radiusLg),
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
                  onTap: () => setState(() {
                    _activeChannel = ch;
                    _visibleCount = _feedPageSize;
                  }),
                  child: AnimatedContainer(
                    // Filter-chip select is a state MORPH → easeInOut.
                    duration: const Duration(milliseconds: 200),
                    curve: ffTheme.easeInOut,
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: active ? AppColors.primary : ffTheme.cardSurface,
                      borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                      border: Border.all(color: active ? AppColors.primary : ffTheme.alternate),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(ch, style: ffTheme.labelMedium.copyWith(color: active ? Colors.white : ffTheme.primaryText, fontWeight: active ? FontWeight.w700 : FontWeight.w500)),
                        if (!active) ...[
                          const SizedBox(width: 5),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(color: ffTheme.background, borderRadius: BorderRadius.circular(ffTheme.radiusSm)),
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
                  onTap: () => setState(() {
                    _sortByPopular = !_sortByPopular;
                    _visibleCount = _feedPageSize;
                  }),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    curve: ffTheme.easeInOut,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: _sortByPopular ? ffTheme.primary.withValues(alpha: 0.1) : ffTheme.background,
                      borderRadius: BorderRadius.circular(ffTheme.radiusCard),
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
                Semantics(
                  button: true,
                  toggled: _showBookmarksOnly,
                  label: 'פוסטים שמורים',
                  child: Tooltip(
                    message: 'פוסטים שמורים',
                    child: GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        setState(() {
                          _showBookmarksOnly = !_showBookmarksOnly;
                          _visibleCount = _feedPageSize;
                        });
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        curve: ffTheme.easeInOut,
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: _showBookmarksOnly ? ffTheme.warning.withValues(alpha: 0.12) : ffTheme.background,
                          borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                          border: Border.all(color: _showBookmarksOnly ? ffTheme.warning : ffTheme.alternate),
                        ),
                        child: ExcludeSemantics(
                          child: Icon(
                            _showBookmarksOnly ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
                            size: 15,
                            color: _showBookmarksOnly ? ffTheme.warning : ffTheme.secondaryText,
                          ),
                        ),
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
                          : Semantics(
                              button: true,
                              label: 'נקה חיפוש',
                              child: GestureDetector(
                                onTap: () { _searchCtrl.clear(); setState(() => _searchQuery = ''); },
                                child: Icon(Icons.close_rounded, color: ffTheme.secondaryText, size: 18),
                              ),
                            ),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      filled: true,
                      fillColor: ffTheme.cardSurface,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusPill), borderSide: BorderSide(color: ffTheme.alternate)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusPill), borderSide: BorderSide(color: ffTheme.alternate)),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusPill), borderSide: BorderSide(color: ffTheme.primary)),
                    ),
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 280.ms),

          // Hot deal banner
          ..._posts.where((p) => p.isTeam && p.planId != null).take(1).map((p) =>
            Semantics(
              button: true,
              label: 'עסקת השבוע — צפייה בחבילה',
              child: GestureDetector(
              onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': p.planId!}),
              child: Container(
                margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  // Fixed ink "deal of the week" banner — const ink gradient so
                  // the white content reads in both themes.
                  gradient: const LinearGradient(colors: [AppColors.primaryDark, AppColors.primary]),
                  borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                  boxShadow: ffTheme.shadowPrimary,
                ),
                child: Row(
                  children: [
                    const Icon(Icons.local_fire_department_rounded, size: 22, color: Colors.white),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('עסקת השבוע', style: ffTheme.labelSmall.copyWith(color: AppColors.secondary, fontWeight: FontWeight.w700)),
                          Text(p.text.length > 60 ? '${p.text.substring(0, 60)}...' : p.text, style: ffTheme.bodySmall.copyWith(color: Colors.white70, height: 1.3)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Icon(Icons.arrow_forward_ios_rounded, size: 14, color: Colors.white54),
                  ],
                ),
              ),
              ),
            ).animate().fadeIn(duration: 400.ms),
          ),

          // Posts list
          Expanded(
            child: _filtered.isEmpty
                ? (_showBookmarksOnly
                    ? EmptyState(
                        icon: Icons.bookmark_border_rounded,
                        headline: 'אין פוסטים שמורים',
                        subtitle: 'סמנו פוסטים בסימנייה כדי לשמור אותם לכאן',
                        ctaLabel: 'הצג את כל הפוסטים',
                        onCtaTap: () async => setState(() {
                          _showBookmarksOnly = false;
                          _visibleCount = _feedPageSize;
                        }),
                      )
                    : _searchQuery.isNotEmpty
                        ? EmptyState(
                            icon: Icons.search_off_rounded,
                            headline: 'אין תוצאות',
                            subtitle: 'לא נמצאו פוסטים עבור "$_searchQuery"',
                          )
                        : !_firstLoadDone
                            // First remote page still in flight — ghost cards,
                            // not a blank screen or a blocking spinner.
                            ? ListView(
                                padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                                children: const [
                                  SkeletonPostCard(),
                                  SkeletonPostCard(),
                                  SkeletonPostCard(),
                                ],
                              )
                            // First load finished but the fetch failed and there
                            // is genuinely nothing cached — be honest and offer a
                            // retry rather than implying the community is empty.
                            : _loadFailed
                                ? EmptyState(
                                    icon: Icons.cloud_off_rounded,
                                    headline: 'לא הצלחנו לטעון את הקהילה',
                                    subtitle: 'בדקו את החיבור לאינטרנט ונסו שוב.',
                                    ctaLabel: 'נסו שוב',
                                    onCtaTap: _refreshFeed,
                                  )
                                : EmptyState(
                                    icon: Icons.forum_outlined,
                                    headline: 'עדיין אין פוסטים',
                                    subtitle: 'היו הראשונים לשתף',
                                    ctaLabel: 'פרסם פוסט',
                                    onCtaTap: () async => _showComposer(context, appState, ffTheme),
                                  ))
                : RefreshIndicator(
                    onRefresh: _refreshFeed,
                    color: ffTheme.primary,
                    child: ListView.builder(
                      controller: _feedScrollCtrl,
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                      // Build only the current window; it grows as the user
                      // scrolls (see _maybeGrowFeed). For short feeds this equals
                      // _filtered.length, so behavior is unchanged.
                      itemCount: math.min(_visibleCount, _filtered.length),
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
                          onReport: () => _showReportSheet(context, ffTheme, targetType: 'post', targetId: post.id),
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
    this.onReport,
  });
  final CommunityPost post;
  final AppTheme ffTheme;
  final bool bookmarked;
  final int replyCount;
  final ValueChanged<String> onBookmark;
  final VoidCallback onReply;
  final bool isOwn;
  final VoidCallback? onDelete;
  final VoidCallback? onReport;

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
      decoration: isTrending
          // A trending post keeps its amber "win" hairline as the VALUE tell.
          ? ffTheme.cardDecoration(radius: ffTheme.radiusLg).copyWith(
              border: Border.all(
                color: ffTheme.warning.withValues(alpha: 0.5),
                width: 1.5,
              ),
            )
          : ffTheme.cardDecoration(radius: ffTheme.radiusLg),
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
                      color: ffTheme.warning.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.local_fire_department_rounded, size: 11, color: ffTheme.warning),
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
                      child: Center(child: Text(post.avatar, style: ffTheme.titleLarge.copyWith(fontSize: 16, color: ffTheme.primary))),
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
                                  decoration: BoxDecoration(color: ffTheme.brandAccent, borderRadius: BorderRadius.circular(ffTheme.radiusXs)),
                                  // Micro "team" badge — no token sits at 9px, so
                                  // the nearest Rubik token (titleSmall) carries
                                  // the face and the 9px / white delta rides via
                                  // copyWith.
                                  child: Text('צוות', style: ffTheme.titleSmall.copyWith(fontSize: 9, fontWeight: FontWeight.w700, color: Colors.white)),
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
                      decoration: BoxDecoration(color: ffTheme.background, borderRadius: BorderRadius.circular(ffTheme.radiusSm)),
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
                            curve: ffTheme.easeInOut,
                            padding: const EdgeInsets.all(5),
                            decoration: BoxDecoration(
                              color: widget.bookmarked ? ffTheme.accent2 : Colors.transparent,
                              borderRadius: BorderRadius.circular(ffTheme.radiusSm),
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
                    // Overflow menu: own post → delete; others' post → report.
                    if ((widget.isOwn && widget.onDelete != null) ||
                        (!widget.isOwn && widget.onReport != null))
                      SizedBox(
                        height: 28,
                        width: 28,
                        child: PopupMenuButton<String>(
                          padding: EdgeInsets.zero,
                          tooltip: 'אפשרויות',
                          icon: Icon(Icons.more_vert_rounded, size: 18, color: ffTheme.secondaryText),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusXl)),
                          onSelected: (v) {
                            if (v == 'delete') widget.onDelete?.call();
                            if (v == 'report') widget.onReport?.call();
                          },
                          itemBuilder: (_) => [
                            if (widget.isOwn && widget.onDelete != null)
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
                            if (!widget.isOwn && widget.onReport != null)
                              PopupMenuItem<String>(
                                value: 'report',
                                child: Row(
                                  children: [
                                    Icon(Icons.flag_outlined, size: 18, color: ffTheme.error),
                                    const SizedBox(width: 8),
                                    Text('⚑ דווח', style: ffTheme.bodyMedium.copyWith(color: ffTheme.error)),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                  ],
                ),

                const SizedBox(height: 10),
                // Flagged-own post: hide the body behind a moderation placeholder
                // instead of the content (others never reach here — it's filtered).
                if (post.isFlagged) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: ffTheme.warning.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                      border: Border.all(color: ffTheme.warning.withValues(alpha: 0.4)),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.visibility_off_rounded, size: 16, color: ffTheme.warning),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text('הפוסט בבדיקת מנהל', style: ffTheme.bodySmall.copyWith(color: ffTheme.warning, fontWeight: FontWeight.w600)),
                        ),
                      ],
                    ),
                  ),
                ] else ...[
                  // Post text
                  if (post.text.isNotEmpty)
                    Text(post.text, style: ffTheme.bodyMedium.copyWith(height: 1.5)),
                ],

                // Media (suppressed while a post is under moderation review)
                if (!post.isFlagged && post.hasMedia) ...[
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
                  Semantics(
                    button: true,
                    label: 'צפייה בחבילה',
                    child: GestureDetector(
                      onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': post.planId!}),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: ffTheme.accent1,
                          borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                          border: Border.all(color: ffTheme.primary.withValues(alpha: 0.2)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            ExcludeSemantics(child: Icon(Icons.open_in_new_rounded, size: 12, color: ffTheme.primary)),
                            const SizedBox(width: 6),
                            Text('צפה בחבילה', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                          ],
                        ),
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
              border: Border(top: BorderSide(color: ffTheme.alternate.withValues(alpha: 0.5))),
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
                    // A restrained confirmation pop on like — the heart is a
                    // HIGH-FREQUENCY tap, so the old scale(1.4) elasticOut bounce
                    // was gaudy; a subtle ~1.18 spring read as a single confident
                    // beat is the right amount of feedback for something seen on
                    // every row.
                    scale: _bouncing ? 1.18 : 1.0,
                    semanticLabel: liked ? 'בטל לייק' : 'אהבתי',
                    onTap: () {
                      HapticFeedback.selectionClick();
                      appBackend.setLike(post.id, !liked).catchError((_) {});
                      appState.toggleLike(post.id);
                      setState(() { _bouncing = true; });
                      Future.delayed(const Duration(milliseconds: 320), () { if (mounted) setState(() => _bouncing = false); });
                    },
                  );
                }),
                const SizedBox(width: 4),
                // Reply
                _ActionBtn(
                  icon: Icons.chat_bubble_outline_rounded,
                  label: '${widget.replyCount}',
                  color: ffTheme.primary.withValues(alpha: 0.7),
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
                    Share.share('${post.author}:\n${post.text}\n\nמתוך אפליקציית Switchy AI');
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
                duration: const Duration(milliseconds: 220),
                // A single gentle overshoot (the shared [spring]) instead of a
                // multi-wobble elasticOut — one confident beat, then settle.
                curve: ffTheme.spring,
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
        // Compact stat count — the numericLarge/Medium tokens (>=24px) are hero
        // sizes, far larger than this 15px pill, so it sources the nearest Rubik
        // title token and applies the heavier w800 + per-pill colour via copyWith.
        Text(value, style: ffTheme.titleLarge.copyWith(fontWeight: FontWeight.w800, color: color)),
        Text(label, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontSize: 10)),
      ],
    );
  }
}

class _Reply {
  final String? id; // backend reply id (null for locally authored, unsent replies)
  final String author, avatar, text;
  final DateTime time;
  final String? mediaType;
  final String? mediaData;
  final int? mediaDurationMs;
  const _Reply({
    this.id,
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
  const _ReplyBubble({required this.reply, required this.ffTheme, this.onReport});
  final _Reply reply;
  final AppTheme ffTheme;
  final VoidCallback? onReport;

  String _timeAgo(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 1) return 'עכשיו';
    if (diff.inMinutes < 60) return 'לפני ${diff.inMinutes} ד׳';
    if (diff.inHours < 24) return 'לפני ${diff.inHours} ש׳';
    return 'לפני ${diff.inDays} ימים';
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPress: onReport, // long-press a reply to report it
      child: Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
            child: Center(child: Text(reply.avatar, style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w700, color: ffTheme.primary))),
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
                    Text(_timeAgo(reply.time), style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText.withValues(alpha: 0.65), fontSize: 10)),
                    if (onReport != null) ...[
                      const Spacer(),
                      Semantics(
                        button: true,
                        label: 'דווח על תגובה',
                        child: GestureDetector(
                          onTap: onReport,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                            child: Icon(Icons.flag_outlined, size: 14, color: ffTheme.secondaryText.withValues(alpha: 0.7)),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: ffTheme.background,
                    borderRadius: BorderRadius.only(
                      topLeft: Radius.circular(ffTheme.radiusCard),
                      bottomLeft: Radius.circular(ffTheme.radiusCard),
                      bottomRight: Radius.circular(ffTheme.radiusCard),
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
      ),
    );
  }
}
