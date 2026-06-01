import 'package:flutter/material.dart';
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
  final _composerCtrl = TextEditingController();
  late List<CommunityPost> _posts;
  String _activeChannel = 'הכל';

  final _channels = ['הכל', 'המלצות', 'סלולר', 'אינטרנט', 'עזרה בניתוק'];
  bool _sortByPopular = false;

  @override
  void initState() {
    super.initState();
    _posts = List.from(communityPosts);
  }

  @override
  void dispose() {
    _composerCtrl.dispose();
    super.dispose();
  }

  List<CommunityPost> get _filtered {
    final base = _activeChannel == 'הכל' ? _posts : _posts.where((p) => p.channel == _activeChannel).toList();
    if (_sortByPopular) {
      return List.from(base)..sort((a, b) => b.likes.compareTo(a.likes));
    }
    return base;
  }

  void _send() {
    final text = _composerCtrl.text.trim();
    if (text.isEmpty) return;
    final appState = Provider.of<FFAppState>(context, listen: false);
    setState(() {
      _posts.insert(0, CommunityPost(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        author: appState.isLoggedIn ? appState.firstName : 'אנונימי',
        avatar: appState.isLoggedIn && appState.firstName.isNotEmpty ? appState.firstName[0] : 'א',
        channel: _activeChannel == 'הכל' ? 'המלצות' : _activeChannel,
        text: text,
        likes: 0,
        replies: 0,
        timestamp: DateTime.now(),
      ));
      _composerCtrl.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: const Text('קהילה'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
      ),
      body: Column(
        children: [
          // Channel chips
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              children: _channels.map((ch) {
                final active = _activeChannel == ch;
                return GestureDetector(
                  onTap: () => setState(() => _activeChannel = ch),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.only(left: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: active ? ffTheme.primary : Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
                    ),
                    child: Text(ch, style: ffTheme.labelMedium.override(color: active ? Colors.white : ffTheme.primaryText)),
                  ),
                );
              }).toList(),
            ),
          ),

          // Members online + sort toggle
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
            child: Row(
              children: [
                Container(width: 8, height: 8, decoration: const BoxDecoration(color: Colors.green, shape: BoxShape.circle)),
                const SizedBox(width: 6),
                Text('847 חברים מחוברים', style: ffTheme.labelSmall.override(color: Colors.green, fontWeight: FontWeight.w600)),
                const Spacer(),
                GestureDetector(
                  onTap: () => setState(() => _sortByPopular = !_sortByPopular),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
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
              ],
            ),
          ),

          // Hot deal banner (from team posts with planId)
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
                      Text('אין פוסטים בערוץ זה עדיין', style: ffTheme.titleSmall.override(color: ffTheme.secondaryText)),
                      const SizedBox(height: 8),
                      Text('היה הראשון לשתף!', style: ffTheme.bodySmall.override(color: ffTheme.secondaryText)),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                  itemCount: _filtered.length,
                  itemBuilder: (context, i) => _PostCard(post: _filtered[i], ffTheme: ffTheme)
                      .animate(delay: (i * 50).ms).fadeIn(duration: 350.ms).slideY(begin: 0.05, end: 0),
                ),
          ),

          // Composer
          Container(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: ffTheme.alternate)),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, -4))],
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _composerCtrl,
                      decoration: InputDecoration(
                        hintText: 'שתפו את הקהילה...',
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.alternate)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.alternate)),
                        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.primary)),
                        filled: true,
                        fillColor: ffTheme.background,
                      ),
                      maxLines: 2,
                      minLines: 1,
                    ),
                  ),
                  const SizedBox(width: 10),
                  GestureDetector(
                    onTap: _send,
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
}

class _PostCard extends StatefulWidget {
  const _PostCard({required this.post, required this.ffTheme});
  final CommunityPost post;
  final FlutterFlowTheme ffTheme;

  @override
  State<_PostCard> createState() => _PostCardState();
}

class _PostCardState extends State<_PostCard> {
  bool _liked = false;

  String _timeAgo(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 60) return 'לפני ${diff.inMinutes} דקות';
    if (diff.inHours < 24) return 'לפני ${diff.inHours} שעות';
    return 'לפני ${diff.inDays} ימים';
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = widget.ffTheme;
    final post = widget.post;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 8)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(post.avatar, style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: ffTheme.primary)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(post.author, style: ffTheme.labelLarge),
                        if (post.isTeam) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: ffTheme.primary,
                              borderRadius: BorderRadius.circular(6),
                            ),
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
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: ffTheme.background,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(post.channel, style: ffTheme.labelSmall.override(color: ffTheme.secondaryText)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(post.text, style: ffTheme.bodyMedium),
          const SizedBox(height: 10),
          Row(
            children: [
              GestureDetector(
                onTap: () => setState(() => _liked = !_liked),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: _liked ? Colors.red.withOpacity(0.08) : Colors.transparent,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    children: [
                      Icon(_liked ? Icons.favorite_rounded : Icons.favorite_border_rounded, size: 15, color: _liked ? Colors.red : ffTheme.secondaryText),
                      const SizedBox(width: 4),
                      Text('${post.likes + (_liked ? 1 : 0)}', style: ffTheme.labelSmall.override(color: _liked ? Colors.red : ffTheme.secondaryText)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Row(
                children: [
                  Icon(Icons.chat_bubble_outline_rounded, size: 15, color: ffTheme.secondaryText),
                  const SizedBox(width: 4),
                  Text('${post.replies}', style: ffTheme.labelSmall),
                ],
              ),
              if (post.planId != null) ...[
                const Spacer(),
                GestureDetector(
                  onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': post.planId!}),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: ffTheme.accent1,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: ffTheme.primary.withOpacity(0.2)),
                    ),
                    child: Text('צפה בחבילה', style: ffTheme.labelSmall.override(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
