import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
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

// Sort options for the feed.
enum _FeedSort { newest, popular, rated }

class _CommunityWidgetState extends State<CommunityWidget> {
  final _searchCtrl = TextEditingController();
  final _quickPostCtrl = TextEditingController();
  late List<CommunityPost> _posts;
  String _activeChannel = 'הכל';
  String _searchQuery = '';
  _FeedSort _feedSort = _FeedSort.newest;
  bool _showBookmarksOnly = false;
  // Active topic filter (null = כולם)
  String? _topicFilter;
  // Author filter — shows only posts by this author name (null = כולם)
  String? _authorFilter;
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

  Future<void> _loadFromBackend() async {
    try {
      final remote = await appBackend.fetchPosts();
      if (!mounted) return;
      if (remote.isNotEmpty) {
        final remoteIds = remote.map((p) => p.id).toSet();
        final seedOnly = communityPosts.where((p) => !remoteIds.contains(p.id)).toList();
        setState(() => _posts = [...remote, ...seedOnly]);
      }
    } catch (_) {/* offline — seeds/local stay */} finally {
      if (mounted && !_firstLoadDone) setState(() => _firstLoadDone = true);
    }
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _quickPostCtrl.dispose();
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

  int _channelCount(String ch) =>
      ch == 'הכל' ? _posts.length : _posts.where((p) => p.channel == ch).length;

  // Topic filter chips: maps display label → channel values they match.
  static const _topicLabels = ['סלולר', 'אינטרנט', 'טלוויזיה', 'כללי'];
  static const _topicChannels = {
    'סלולר': ['סלולר'],
    'אינטרנט': ['אינטרנט'],
    'טלוויזיה': ['טלוויזיה'],
    'כללי': ['המלצות', 'עזרה בניתוק', 'חו"ל', 'חבילה משולבת'],
  };

  List<CommunityPost> get _filtered {
    final appState = AppState();
    var base = _activeChannel == 'הכל'
        ? _posts
        : _posts.where((p) => p.channel == _activeChannel).toList();
    if (_showBookmarksOnly) {
      base = base.where((p) => appState.isBookmarked(p.id)).toList();
    }
    // Apply topic filter (independent of channel chips)
    if (_topicFilter != null) {
      final allowed = _topicChannels[_topicFilter!] ?? const <String>[];
      base = base.where((p) => allowed.contains(p.channel)).toList();
    }
    // Apply author filter
    if (_authorFilter != null) {
      base = base.where((p) => p.author == _authorFilter).toList();
    }
    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      base = base.where((p) =>
          p.text.toLowerCase().contains(q) ||
          p.author.toLowerCase().contains(q) ||
          p.channel.toLowerCase().contains(q)).toList();
    }
    switch (_feedSort) {
      case _FeedSort.popular:
        return List.from(base)..sort((a, b) => b.likes.compareTo(a.likes));
      case _FeedSort.rated:
        // "rated" = posts with most replies (community engagement proxy)
        return List.from(base)..sort((a, b) => b.replies.compareTo(a.replies));
      case _FeedSort.newest:
        return base;
    }
  }

  /// Posts pinned at the top of the feed: top-2 by likes or the newest
  /// team post. Returns at most 2 unique posts.
  List<CommunityPost> get _featuredPosts {
    if (_posts.isEmpty) return const [];
    // Team posts always feature first
    final teamPosts = _posts.where((p) => p.isTeam).take(1).toList();
    // Top liked non-team post
    final byLikes = [..._posts]
      ..sort((a, b) => b.likes.compareTo(a.likes));
    final topLiked = byLikes.where((p) => !p.isTeam && p.likes >= 5).take(1).toList();
    final featured = <CommunityPost>[];
    for (final p in [...teamPosts, ...topLiked]) {
      if (!featured.any((f) => f.id == p.id)) featured.add(p);
      if (featured.length >= 2) break;
    }
    return featured;
  }

  /// Whether the current user is a verified customer (completed switch or
  /// active tracked plan at a late stage).
  bool _isCurrentUserVerified(AppState appState) {
    if (!appState.isLoggedIn) return false;
    return appState.myPlans.isNotEmpty || appState.trackerStep >= 3;
  }

  // ── Feed actions ───────────────────────────────────────────────────────────────

  void _submitQuickPost(BuildContext context, AppState appState, AppTheme ffTheme) {
    final text = _quickPostCtrl.text.trim();
    if (text.isEmpty) return;
    if (!appState.isLoggedIn) {
      AppSnackBar.info(context, 'יש להתחבר כדי לפרסם פוסט',
          action: SnackBarAction(label: 'כניסה', onPressed: () => context.pushNamed('Auth')));
      return;
    }
    HapticFeedback.lightImpact();
    final id = DateTime.now().millisecondsSinceEpoch.toString();
    final author = appState.firstName;
    final avatar = appState.firstName.isNotEmpty ? appState.firstName[0] : 'א';
    const channel = 'המלצות';
    appState.addCommunityPost(
      id: id, author: author, avatar: avatar, channel: channel, text: text,
    );
    setState(() {
      _posts.insert(0, CommunityPost(
        id: id, author: author, avatar: avatar, channel: channel, text: text,
        likes: 0, replies: 0, timestamp: DateTime.now(),
      ));
      _quickPostCtrl.clear();
    });
    AppSnackBar.success(context, 'הפוסט פורסם בהצלחה!');
    appBackend.createPost(PostInput(
      author: author, avatar: avatar, channel: channel, text: text,
    )).then((_) {}).catchError((_) {
      if (context.mounted) AppSnackBar.error(context, 'הפרסום נכשל, נסו שוב');
    });
  }

  Future<void> _refreshFeed() async {
    HapticFeedback.mediumImpact();
    await _loadFromBackend();
    if (mounted) setState(() {});
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

  // ── Report Post ────────────────────────────────────────────────────────────────

  void _showReportSheet(BuildContext context, CommunityPost post) {
    final ffTheme = AppTheme.of(context);
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
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
            Text('דווח על פוסט', style: ffTheme.titleLarge),
            const SizedBox(height: 4),
            Text('מדוע אתה מדווח על פוסט זה?', style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
            const SizedBox(height: 16),
            for (final entry in [
              ('spam', 'ספאם'),
              ('inappropriate', 'לא הולם'),
              ('misinformation', 'מידע שגוי'),
            ])
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                leading: Icon(Icons.flag_outlined, color: ffTheme.error, size: 20),
                title: Text(entry.$2, style: ffTheme.bodyMedium),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                onTap: () async {
                  Navigator.pop(ctx);
                  try {
                    await appBackend.reportPost(post.id, entry.$1);
                  } catch (_) {}
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('הדיווח נשלח, תודה')),
                    );
                  }
                },
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  // ── Edit Post ──────────────────────────────────────────────────────────────────

  void _showEditComposer(BuildContext context, AppState appState, AppTheme ffTheme, CommunityPost post) {
    final ctrl = TextEditingController(text: post.text);
    final String selectedChannel = post.channel;
    final String? pendingType = post.mediaType;
    final String? pendingData = post.mediaData;
    final int? pendingDur = post.mediaDurationMs;
    // Resolve the attached plan if any
    Plan? attachedPlan;
    if (post.planId != null) {
      try {
        attachedPlan = allPlans.firstWhere((p) => p.id == post.planId);
      } catch (_) {}
    }

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
                    Text('ערוך פוסט', style: ffTheme.titleLarge),
                    const Spacer(),
                    TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: Text('ביטול', style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
                    ),
                  ],
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
                const SizedBox(height: 8),
                // Plan attachment chip
                if (attachedPlan != null)
                  Builder(builder: (_) {
                    final plan = attachedPlan!;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Chip(
                        avatar: CircleAvatar(
                          backgroundColor: ffTheme.primary,
                          child: Text(
                            plan.provider.isNotEmpty ? plan.provider[0] : '?',
                            style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                          ),
                        ),
                        label: Text('${plan.plan} • ₪${plan.price}', style: ffTheme.labelSmall),
                        deleteIcon: const Icon(Icons.close, size: 14),
                        onDeleted: () => setSheet(() => attachedPlan = null),
                      ),
                    );
                  }),
                // Attach plan button
                GestureDetector(
                  onTap: () async {
                    final plan = await _showPlanPickerSheet(context, ffTheme);
                    if (plan != null) setSheet(() => attachedPlan = plan);
                  },
                  child: Chip(
                    avatar: Icon(Icons.attach_file_rounded, size: 14, color: ffTheme.primary),
                    label: Text('צרף תוכנית', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary)),
                    backgroundColor: ffTheme.accent1,
                    side: BorderSide(color: ffTheme.primary.withValues(alpha: 0.2)),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      final text = ctrl.text.trim();
                      if (text.isEmpty && pendingData == null) return;
                      HapticFeedback.lightImpact();
                      Navigator.pop(ctx);
                      try {
                        await appBackend.deletePost(post.id);
                        final author = appState.firstName;
                        final avatar = appState.firstName.isNotEmpty ? appState.firstName[0] : 'א';
                        final newPost = await appBackend.createPost(PostInput(
                          author: author,
                          avatar: avatar,
                          channel: selectedChannel,
                          text: text,
                          mediaType: pendingType,
                          media: pendingData,
                          mediaDurationMs: pendingDur,
                          planId: attachedPlan?.id,
                        ));
                        setState(() {
                          _posts.removeWhere((p) => p.id == post.id);
                          _posts.insert(0, newPost);
                        });
                      } catch (_) {
                        await _loadFromBackend();
                      }
                    },
                    icon: const Icon(Icons.check_rounded, size: 18),
                    label: const Text('שמור שינויים'),
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

  // ── Plan picker bottom sheet ────────────────────────────────────────────────────

  Future<Plan?> _showPlanPickerSheet(BuildContext context, AppTheme ffTheme) async {
    final searchCtrl = TextEditingController();
    Plan? result;
    await showModalBottomSheet<Plan>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          final query = searchCtrl.text.toLowerCase();
          final filtered = allPlans.where((p) =>
            query.isEmpty ||
            p.plan.toLowerCase().contains(query) ||
            p.provider.toLowerCase().contains(query)
          ).toList();
          return Container(
            height: MediaQuery.of(ctx).size.height * 0.75,
            decoration: BoxDecoration(
              color: ffTheme.background,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: ffTheme.alternate, borderRadius: BorderRadius.circular(2)))),
                      const SizedBox(height: 14),
                      Text('בחר תוכנית לצרף', style: ffTheme.titleLarge),
                      const SizedBox(height: 12),
                      TextField(
                        controller: searchCtrl,
                        textDirection: TextDirection.rtl,
                        autofocus: true,
                        onChanged: (_) => setSheet(() {}),
                        decoration: InputDecoration(
                          hintText: 'חפש תוכנית או ספק...',
                          hintTextDirection: TextDirection.rtl,
                          prefixIcon: Icon(Icons.search_rounded, color: ffTheme.secondaryText, size: 18),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          filled: true,
                          fillColor: Colors.white,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: ffTheme.alternate)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: ffTheme.alternate)),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: ffTheme.primary)),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final plan = filtered[i];
                      return ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        leading: CircleAvatar(
                          backgroundColor: ffTheme.primary,
                          radius: 16,
                          child: Text(
                            plan.provider.isNotEmpty ? plan.provider[0] : '?',
                            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
                          ),
                        ),
                        title: Text(plan.plan, style: ffTheme.labelMedium),
                        subtitle: Text('${plan.provider} • ₪${plan.price}', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        onTap: () {
                          result = plan;
                          Navigator.pop(ctx);
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
    searchCtrl.dispose();
    return result;
  }

  // ── Author mini-profile bottom sheet ──────────────────────────────────────────

  void _showAuthorProfile(BuildContext context, CommunityPost post, AppTheme ffTheme) {
    final authorPostCount = _posts.where((p) => p.author == post.author).length;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: BoxDecoration(
          color: ffTheme.background,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Semantics(
                  button: true,
                  label: 'סגור',
                  child: GestureDetector(
                    onTap: () => Navigator.pop(ctx),
                    child: Icon(Icons.close_rounded, color: ffTheme.secondaryText, size: 22),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            CircleAvatar(
              radius: 32,
              backgroundColor: ffTheme.primary,
              child: Text(
                post.avatar,
                style: GoogleFonts.rubik(fontSize: 24, fontWeight: FontWeight.w800, color: Colors.white),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(post.author, style: ffTheme.titleLarge),
                if (post.isVerified) ...[
                  const SizedBox(width: 6),
                  Icon(Icons.verified_rounded, size: 18, color: ffTheme.info),
                ],
              ],
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _StatPill(value: '$authorPostCount', label: 'פוסטים', color: ffTheme.primary),
                if (post.isVerified) ...[
                  const SizedBox(width: 20),
                  _StatPill(value: 'מאומת', label: 'סטטוס', color: ffTheme.info),
                ],
              ],
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(ctx);
                  setState(() {
                    _authorFilter = post.author;
                    _visibleCount = _feedPageSize;
                  });
                },
                icon: Icon(Icons.filter_list_rounded, size: 16, color: ffTheme.primary),
                label: Text(
                  'ראה את כל הפוסטים של ${post.author}',
                  style: ffTheme.bodyMedium.copyWith(color: ffTheme.primary),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: ffTheme.primary,
                  side: BorderSide(color: ffTheme.primary),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
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
                        ? const EmptyState(
                            icon: Icons.chat_bubble_outline_rounded,
                            headline: 'אין תגובות עדיין',
                            subtitle: 'היה הראשון לענות!',
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
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, -4))],
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
    Plan? attachedPlan;

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

                // Plan attachment row
                Row(
                  children: [
                    // Attach plan chip/button
                    GestureDetector(
                      onTap: () async {
                        final plan = await _showPlanPickerSheet(context, ffTheme);
                        if (plan != null) setSheet(() => attachedPlan = plan);
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: attachedPlan != null ? ffTheme.accent1 : Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: attachedPlan != null ? ffTheme.primary : ffTheme.alternate),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.attach_file_rounded, size: 14, color: ffTheme.primary),
                            const SizedBox(width: 5),
                            Text('צרף תוכנית 📎', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary)),
                          ],
                        ),
                      ),
                    ),
                    if (attachedPlan != null) ...[
                      const SizedBox(width: 8),
                      Expanded(
                        child: Chip(
                          avatar: CircleAvatar(
                            backgroundColor: ffTheme.primary,
                            child: Text(
                              attachedPlan!.provider.isNotEmpty ? attachedPlan!.provider[0] : '?',
                              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                            ),
                          ),
                          label: Text(
                            '${attachedPlan!.plan} • ₪${attachedPlan!.price}',
                            style: ffTheme.labelSmall,
                            overflow: TextOverflow.ellipsis,
                          ),
                          deleteIcon: const Icon(Icons.close, size: 14),
                          onDeleted: () => setSheet(() => attachedPlan = null),
                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 8),

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
                          planId: attachedPlan?.id,
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
                        planId: attachedPlan?.id,
                      )).ignore();
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
    // Compute the filtered+sorted feed once per build — the getter does a
    // filter+sort pass and is read in several places below.
    final filtered = _filtered;

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
            Text('שתפו חוויות, טיפים ועצות חיסכון', style: GoogleFonts.assistant(fontSize: 11, color: Colors.white70)),
          ],
        ),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 16, top: 8, bottom: 8),
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
                    color: const Color(0xFFF0F2F4),
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
                  onTap: () => setState(() {
                    _activeChannel = ch;
                    _visibleCount = _feedPageSize;
                  }),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsetsDirectional.only(end: 8),
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

          // Sort chips + bookmarks + search
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Row 1: 3-chip sort bar + bookmark toggle
                Row(
                  children: [
                    _SortChipBar(
                      current: _feedSort,
                      ffTheme: ffTheme,
                      onSelect: (s) => setState(() {
                        _feedSort = s;
                        _visibleCount = _feedPageSize;
                      }),
                    ),
                    const SizedBox(width: 8),
                    Tooltip(
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
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: _showBookmarksOnly ? ffTheme.warning.withValues(alpha: 0.12) : ffTheme.background,
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
                // Row 2: topic filter chips
                const SizedBox(height: 8),
                SizedBox(
                  height: 32,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: _topicLabels.map((topic) {
                      final active = _topicFilter == topic;
                      return Padding(
                        padding: const EdgeInsetsDirectional.only(start: 6),
                        child: Semantics(
                          button: true,
                          selected: active,
                          label: 'סנן לפי $topic',
                          child: GestureDetector(
                            onTap: () => setState(() {
                              _topicFilter = active ? null : topic;
                              _visibleCount = _feedPageSize;
                            }),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 180),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                              decoration: BoxDecoration(
                                color: active ? AppColors.brandAccent : Colors.white,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: active ? AppColors.brandAccent : ffTheme.alternate),
                              ),
                              child: Text(topic,
                                  style: ffTheme.labelSmall.copyWith(
                                    color: active ? Colors.white : ffTheme.secondaryText,
                                    fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                                  )),
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 280.ms),

          // Author filter banner
          if (_authorFilter != null)
            Container(
              margin: const EdgeInsets.fromLTRB(16, 6, 16, 0),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.brandAccent.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.brandAccent.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.person_rounded, size: 14, color: AppColors.brandAccent),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'מציג פוסטים של: $_authorFilter',
                      style: AppTheme.of(context).labelSmall.copyWith(color: AppColors.brandAccent, fontWeight: FontWeight.w600),
                    ),
                  ),
                  GestureDetector(
                    onTap: () => setState(() { _authorFilter = null; _visibleCount = _feedPageSize; }),
                    child: const Icon(Icons.close_rounded, size: 16, color: AppColors.brandAccent),
                  ),
                ],
              ),
            ).animate().fadeIn(duration: 200.ms),

          // Quick-post section
          _QuickPostSection(
            ctrl: _quickPostCtrl,
            ffTheme: ffTheme,
            isVerified: _isCurrentUserVerified(appState),
            onSubmit: () => _submitQuickPost(context, appState, ffTheme),
          ).animate().fadeIn(duration: 320.ms),

          // Hot deal banner
          ..._posts.where((p) => p.isTeam && p.planId != null).take(1).map((p) =>
            GestureDetector(
              onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': p.planId!}),
              child: Container(
                margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [ffTheme.primaryDark, ffTheme.primary]),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.local_fire_department_rounded, size: 22, color: Colors.white),
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
            child: filtered.isEmpty
                ? (_showBookmarksOnly
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.bookmark_border_rounded, size: 56, color: ffTheme.alternate),
                            const SizedBox(height: 16),
                            Text('אין פוסטים שמורים',
                                style: ffTheme.titleSmall.copyWith(color: ffTheme.secondaryText), textAlign: TextAlign.center),
                            const SizedBox(height: 8),
                            Text('סמנו פוסטים בסימנייה כדי לשמור אותם לכאן',
                                style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText), textAlign: TextAlign.center),
                            const SizedBox(height: 16),
                            OutlinedButton(
                              onPressed: () => setState(() {
                                _showBookmarksOnly = false;
                                _visibleCount = _feedPageSize;
                              }),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: ffTheme.primary,
                                side: BorderSide(color: ffTheme.primary),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              child: const Text('הצג את כל הפוסטים'),
                            ),
                          ],
                        ),
                      )
                    : _searchQuery.isNotEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.search_off_rounded, size: 56, color: ffTheme.alternate),
                                const SizedBox(height: 16),
                                Text('אין תוצאות עבור "$_searchQuery"',
                                    style: ffTheme.titleSmall.copyWith(color: ffTheme.secondaryText), textAlign: TextAlign.center),
                              ],
                            ),
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
                      // The window starts with featured posts (if any), then
                      // the regular feed. We prepend them without duplicating in
                      // the main list (the builder offsets by featuredCount).
                      itemCount: () {
                        final featured = _featuredPosts;
                        final feedCount = math.min(_visibleCount, filtered.length);
                        return (featured.isNotEmpty ? 1 : 0) + feedCount;
                      }(),
                      itemBuilder: (context, i) {
                        final featured = _featuredPosts;
                        // Slot 0 = featured section header+cards (when any exist)
                        if (featured.isNotEmpty && i == 0) {
                          return _FeaturedPostsSection(
                            posts: featured,
                            ffTheme: ffTheme,
                            isVerified: _isCurrentUserVerified(appState),
                            onReply: (p) => _showReplies(context, p, ffTheme),
                          ).animate().fadeIn(duration: 400.ms);
                        }
                        final feedIndex = featured.isNotEmpty ? i - 1 : i;
                        final post = filtered[feedIndex];
                        final isVerified = _isCurrentUserVerified(appState) &&
                            appState.isOwnPost(post.id);
                        return _PostCard(
                          post: post,
                          ffTheme: ffTheme,
                          bookmarked: appState.isBookmarked(post.id),
                          isOwn: appState.isOwnPost(post.id),
                          isCurrentUserVerified: isVerified,
                          replyCount: _replyData.containsKey(post.id) ? _replyData[post.id]!.length : post.replies,
                          onBookmark: (id) {
                            HapticFeedback.selectionClick();
                            appBackend.setBookmark(id, !appState.isBookmarked(id)).catchError((_) {});
                            appState.toggleBookmark(id);
                            setState(() {});
                          },
                          onReply: () => _showReplies(context, post, ffTheme),
                          onDelete: () => _confirmDelete(context, post, appState, ffTheme),
                          onReport: () => _showReportSheet(context, post),
                          onEdit: () => _showEditComposer(context, appState, ffTheme, post),
                          onAuthorTap: () => _showAuthorProfile(context, post, ffTheme),
                        ).animate(delay: (feedIndex * 50).ms).fadeIn(duration: 350.ms).slideY(begin: 0.05, end: 0);
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
    this.isCurrentUserVerified = false,
    this.onDelete,
    this.onReport,
    this.onEdit,
    this.onAuthorTap,
  });
  final CommunityPost post;
  final AppTheme ffTheme;
  final bool bookmarked;
  final int replyCount;
  final ValueChanged<String> onBookmark;
  final VoidCallback onReply;
  final bool isOwn;
  final bool isCurrentUserVerified;
  final VoidCallback? onDelete;
  final VoidCallback? onReport;
  final VoidCallback? onEdit;
  final VoidCallback? onAuthorTap;

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
          color: isTrending ? ffTheme.warning.withValues(alpha: 0.5) : ffTheme.alternate,
          width: isTrending ? 1.5 : 1,
        ),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 8, offset: const Offset(0, 2))],
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
                      color: ffTheme.warning.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
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
                    Semantics(
                      button: true,
                      label: 'פרופיל של ${post.author}',
                      child: GestureDetector(
                        onTap: widget.onAuthorTap,
                        child: Container(
                          width: 38, height: 38,
                          decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
                          child: Center(child: Text(post.avatar, style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: ffTheme.primary))),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Semantics(
                                button: true,
                                label: 'פרופיל של ${post.author}',
                                child: GestureDetector(
                                  onTap: widget.onAuthorTap,
                                  child: Text(post.author, style: ffTheme.labelLarge, overflow: TextOverflow.ellipsis),
                                ),
                              ),
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
                              // "לקוח מאומת" badge for own posts when the user
                              // is a verified customer (has tracked plans or
                              // completed the switch flow).
                              if (widget.isCurrentUserVerified) ...[
                                const SizedBox(width: 5),
                                _VerifiedBadge(ffTheme: ffTheme),
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
                    // Overflow menu — own posts: edit+delete; others: report
                    SizedBox(
                      height: 28,
                      width: 28,
                      child: PopupMenuButton<String>(
                        padding: EdgeInsets.zero,
                        tooltip: 'אפשרויות',
                        icon: Icon(Icons.more_vert_rounded, size: 18, color: ffTheme.secondaryText),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        onSelected: (v) {
                          if (v == 'delete') widget.onDelete?.call();
                          if (v == 'report') widget.onReport?.call();
                          if (v == 'edit') widget.onEdit?.call();
                        },
                        itemBuilder: (_) {
                          final canEdit = widget.isOwn &&
                              DateTime.now().difference(post.timestamp).inMinutes < 10;
                          return [
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
                            if (canEdit && widget.onEdit != null)
                              PopupMenuItem<String>(
                                value: 'edit',
                                child: Row(
                                  children: [
                                    Icon(Icons.edit_outlined, size: 18, color: ffTheme.primary),
                                    const SizedBox(width: 8),
                                    Text('ערוך פוסט', style: ffTheme.bodyMedium.copyWith(color: ffTheme.primary)),
                                  ],
                                ),
                              ),
                            if (!widget.isOwn)
                              PopupMenuItem<String>(
                                value: 'report',
                                child: Row(
                                  children: [
                                    Icon(Icons.flag_outlined, size: 18, color: ffTheme.secondaryText),
                                    const SizedBox(width: 8),
                                    Text('דווח על פוסט', style: ffTheme.bodyMedium),
                                  ],
                                ),
                              ),
                          ];
                        },
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

                // Plan chip (tagged plan)
                if (post.planId != null) ...[
                  const SizedBox(height: 10),
                  Builder(builder: (ctx) {
                    Plan? taggedPlan;
                    try {
                      taggedPlan = allPlans.firstWhere((p) => p.id == post.planId);
                    } catch (_) {}
                    return GestureDetector(
                      onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': post.planId!}),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: ffTheme.accent1,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: ffTheme.primary.withValues(alpha: 0.25)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (taggedPlan != null)
                              CircleAvatar(
                                radius: 10,
                                backgroundColor: ffTheme.primary,
                                child: Text(
                                  taggedPlan.provider.isNotEmpty ? taggedPlan.provider[0] : '?',
                                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
                                ),
                              )
                            else
                              Icon(Icons.link_rounded, size: 14, color: ffTheme.primary),
                            const SizedBox(width: 6),
                            Text(
                              taggedPlan != null
                                  ? '${taggedPlan.plan} • ₪${taggedPlan.price}'
                                  : 'צפה בחבילה',
                              style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(width: 4),
                            Icon(Icons.open_in_new_rounded, size: 10, color: ffTheme.primary.withValues(alpha: 0.7)),
                          ],
                        ),
                      ),
                    );
                  }),
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
                    Share.share('${post.author}:\n${post.text}\n\nמתוך אפליקציית חוסך');
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
        behavior: HitTestBehavior.opaque,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
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

// ── Sort chip bar ─────────────────────────────────────────────────────────────

class _SortChipBar extends StatelessWidget {
  const _SortChipBar({required this.current, required this.ffTheme, required this.onSelect});
  final _FeedSort current;
  final AppTheme ffTheme;
  final ValueChanged<_FeedSort> onSelect;

  static const List<_FeedSort> _sortValues = [
    _FeedSort.newest,
    _FeedSort.popular,
    _FeedSort.rated,
  ];
  static const List<String> _sortLabels = ['חדש', 'פופולרי', 'מדורג'];
  static const List<IconData> _sortIcons = [
    Icons.access_time_rounded,
    Icons.local_fire_department_rounded,
    Icons.star_rounded,
  ];

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(_sortValues.length, (i) {
        final sort = _sortValues[i];
        final label = _sortLabels[i];
        final icon = _sortIcons[i];
        final active = current == sort;
        return Padding(
          padding: const EdgeInsets.only(left: 5),
          child: Semantics(
            button: true,
            selected: active,
            label: 'מיין לפי $label',
            child: GestureDetector(
              onTap: () => onSelect(sort),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: active ? AppColors.brandAccent : ffTheme.background,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: active ? AppColors.brandAccent : ffTheme.alternate),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 12,
                        color: active ? Colors.white : ffTheme.secondaryText),
                    const SizedBox(width: 4),
                    Text(label,
                        style: ffTheme.labelSmall.copyWith(
                          color: active ? Colors.white : ffTheme.secondaryText,
                          fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                        )),
                  ],
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}

// ── Quick-post section ────────────────────────────────────────────────────────

class _QuickPostSection extends StatefulWidget {
  const _QuickPostSection({
    required this.ctrl,
    required this.ffTheme,
    required this.isVerified,
    required this.onSubmit,
  });
  final TextEditingController ctrl;
  final AppTheme ffTheme;
  final bool isVerified;
  final VoidCallback onSubmit;

  @override
  State<_QuickPostSection> createState() => _QuickPostSectionState();
}

class _QuickPostSectionState extends State<_QuickPostSection> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final t = widget.ffTheme;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _focused ? AppColors.brandAccent : t.alternate),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.edit_note_rounded, size: 18, color: AppColors.brandAccent),
              const SizedBox(width: 8),
              Text('שתף את החוויה שלך עם הקהילה',
                  style: t.labelMedium.copyWith(color: t.primaryText, fontWeight: FontWeight.w700)),
              if (widget.isVerified) ...[
                const Spacer(),
                _VerifiedBadge(ffTheme: t),
              ],
            ],
          ),
          const SizedBox(height: 10),
          Focus(
            onFocusChange: (f) => setState(() => _focused = f),
            child: TextField(
              controller: widget.ctrl,
              maxLines: 2,
              minLines: 1,
              textDirection: TextDirection.rtl,
              decoration: InputDecoration(
                hintText: 'מה על דעתך? טיפ, ביקורת, שאלה...',
                hintTextDirection: TextDirection.rtl,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                filled: true,
                fillColor: t.background,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: t.alternate)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: t.alternate)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.brandAccent, width: 1.5)),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: ElevatedButton.icon(
              onPressed: widget.onSubmit,
              icon: const Icon(Icons.send_rounded, size: 16),
              label: const Text('פרסם'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.brandAccent,
                foregroundColor: Colors.white,
                elevation: 0,
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                textStyle: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Featured posts section ────────────────────────────────────────────────────

class _FeaturedPostsSection extends StatelessWidget {
  const _FeaturedPostsSection({
    required this.posts,
    required this.ffTheme,
    required this.isVerified,
    required this.onReply,
  });
  final List<CommunityPost> posts;
  final AppTheme ffTheme;
  final bool isVerified;
  final ValueChanged<CommunityPost> onReply;

  @override
  Widget build(BuildContext context) {
    final t = ffTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            children: [
              const Icon(Icons.push_pin_rounded, size: 14, color: AppColors.saving),
              const SizedBox(width: 6),
              Text('פוסטים מומלצים',
                  style: t.labelMedium.copyWith(color: t.secondaryText, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
        ...posts.map((post) => _FeaturedCard(post: post, ffTheme: t, onReply: () => onReply(post))),
        const SizedBox(height: 4),
        Divider(color: t.alternate, height: 20),
      ],
    );
  }
}

class _FeaturedCard extends StatelessWidget {
  const _FeaturedCard({required this.post, required this.ffTheme, required this.onReply});
  final CommunityPost post;
  final AppTheme ffTheme;
  final VoidCallback onReply;

  @override
  Widget build(BuildContext context) {
    final t = ffTheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.saving.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.saving.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // "מומלץ" amber badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.saving.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('מומלץ', style: t.labelSmall.copyWith(color: AppColors.saving, fontWeight: FontWeight.w700, fontSize: 10)),
                    const SizedBox(width: 3),
                    const Text('✨', style: TextStyle(fontSize: 10)),
                  ],
                ),
              ),
              const Spacer(),
              // Channel badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(color: t.background, borderRadius: BorderRadius.circular(8)),
                child: Text(post.channel, style: t.labelSmall.copyWith(color: t.secondaryText, fontSize: 10)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 30, height: 30,
                decoration: BoxDecoration(color: t.accent1, shape: BoxShape.circle),
                child: Center(child: Text(post.avatar, style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w700, color: t.primary))),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(post.author, style: t.labelMedium),
                    const SizedBox(height: 4),
                    Text(post.text, style: t.bodySmall.copyWith(height: 1.4), maxLines: 2, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.favorite_rounded, size: 13, color: Colors.red.shade400),
              const SizedBox(width: 4),
              Text('${post.likes}', style: t.labelSmall.copyWith(color: t.secondaryText)),
              const SizedBox(width: 12),
              Semantics(
                button: true,
                label: 'הגב לפוסט מומלץ',
                child: GestureDetector(
                  onTap: onReply,
                  child: Row(
                    children: [
                      Icon(Icons.chat_bubble_outline_rounded, size: 13, color: t.primary),
                      const SizedBox(width: 4),
                      Text('${post.replies}', style: t.labelSmall.copyWith(color: t.primary)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Verified customer badge ───────────────────────────────────────────────────

class _VerifiedBadge extends StatelessWidget {
  const _VerifiedBadge({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'לקוח מאומת',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: AppColors.brandAccent.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: AppColors.brandAccent.withValues(alpha: 0.4)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle_outline_rounded, size: 10, color: AppColors.brandAccent),
            const SizedBox(width: 3),
            Text('לקוח מאומת',
                style: ffTheme.labelSmall.copyWith(
                  color: AppColors.brandAccent,
                  fontWeight: FontWeight.w700,
                  fontSize: 9,
                )),
          ],
        ),
      ),
    );
  }
}

// ── Data ──────────────────────────────────────────────────────────────────────

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
                    Text(_timeAgo(reply.time), style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText.withValues(alpha: 0.65), fontSize: 10)),
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
