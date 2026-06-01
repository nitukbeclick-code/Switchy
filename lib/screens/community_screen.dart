import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme.dart';

class CommunityScreen extends StatefulWidget {
  const CommunityScreen({super.key});

  @override
  State<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends State<CommunityScreen> {
  String _channel = 'all';
  final _msgCtrl = TextEditingController();

  final _channels = [
    ('all', 'הכל'),
    ('recs', 'המלצות'),
    ('cellular', 'סלולר'),
    ('internet', 'אינטרנט'),
    ('tv', 'טלוויזיה'),
    ('help', 'עזרה בניתוק'),
  ];

  final _messages = [
    _CommunityMsg(
      author: 'מאיה כ.',
      avatar: 'מ',
      avatarColor: Color(0xFF15603E),
      badge: 'חבר קהילה',
      channel: 'cellular',
      channelLabel: 'סלולר',
      text: 'עברתי לגולן טלקום השבוע — מדהים! אותה קליטה בדיוק כמו פלאפון ובפחות מחצי המחיר. ממש ממליצה!',
      likes: 47,
      replies: 12,
      time: 'לפני 2 שעות',
      planName: 'גולן 50GB 5G',
      planPrice: '₪39',
    ),
    _CommunityMsg(
      author: 'יוסי ד.',
      avatar: 'י',
      avatarColor: Color(0xFF2255CC),
      badge: 'מוודא',
      channel: 'internet',
      channelLabel: 'אינטרנט',
      text: 'שאלה: האם פרטנר גיגה באמת מגיע ל-1000 מגה? הבטיחו לי אבל אני מקבל בערך 400.',
      likes: 8,
      replies: 23,
      time: 'לפני 4 שעות',
    ),
    _CommunityMsg(
      author: 'צוות חוסך',
      avatar: 'ח',
      avatarColor: Color(0xFF15603E),
      badge: 'צוות',
      channel: 'all',
      channelLabel: 'כללי',
      text: '🎉 עדכון: הוספנו 15 מסלולים חדשים לקטגוריית חו"ל! כולל eSIM לאירופה מ-₪12 בלבד.',
      likes: 103,
      replies: 34,
      time: 'לפני 6 שעות',
    ),
    _CommunityMsg(
      author: 'רחל מ.',
      avatar: 'ר',
      avatarColor: Color(0xFFCC2244),
      badge: 'חבר קהילה',
      channel: 'help',
      channelLabel: 'עזרה בניתוק',
      text: 'ניסיתי לנתק מסלקום ואמרו לי שצריך להמתין 30 יום. מה עושים? חוסך אמרו שזה אמור להיות מיידי...',
      likes: 5,
      replies: 18,
      time: 'לפני 8 שעות',
    ),
    _CommunityMsg(
      author: 'דניאל ש.',
      avatar: 'ד',
      avatarColor: Color(0xFF6B35C8),
      badge: 'מוודא',
      channel: 'tv',
      channelLabel: 'טלוויזיה',
      text: 'פרטנר TV פצצה! 100+ ערוצים, VOD מצוין, עד 4 מסכים במקביל. הרבה יותר טוב מyes לפי דעתי.',
      likes: 29,
      replies: 7,
      time: 'אתמול',
      planName: 'פרטנר TV 100+',
      planPrice: '₪89',
    ),
    _CommunityMsg(
      author: 'נועה א.',
      avatar: 'נ',
      avatarColor: Color(0xFFE07034),
      badge: 'חבר קהילה',
      channel: 'cellular',
      channelLabel: 'סלולר',
      text: 'שאלה לקהילה: מי עבר מפלאפון ל-019? חוששת מירידה בקליטה בצפון הארץ...',
      likes: 14,
      replies: 31,
      time: 'אתמול',
    ),
  ];

  @override
  void dispose() {
    _msgCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _channel == 'all'
        ? _messages
        : _messages.where((m) => m.channel == _channel).toList();

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: Column(
        children: [
          _buildHeader(context),
          _buildChannels(),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              itemCount: filtered.length,
              itemBuilder: (ctx, i) => _buildMsgCard(filtered[i]),
            ),
          ),
          _buildComposer(),
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
          const Expanded(
            child: Text(
              'קהילה',
              style: TextStyle(
                fontFamily: 'Rubik',
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: AppColors.lime,
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.circle, color: AppColors.green, size: 8),
                SizedBox(width: 5),
                Text(
                  '247 מחוברים',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.greenDark,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChannels() {
    return Container(
      height: 44,
      color: AppColors.green,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
        children: _channels.map((ch) {
          final active = _channel == ch.$1;
          return GestureDetector(
            onTap: () => setState(() => _channel = ch.$1),
            child: Container(
              margin: const EdgeInsets.only(left: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              decoration: BoxDecoration(
                color: active ? AppColors.lime : Colors.white.withOpacity(0.2),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                ch.$2,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: active ? AppColors.greenDark : Colors.white,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildMsgCard(_CommunityMsg msg) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
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
                  color: msg.avatarColor,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    msg.avatar,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
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
                        Text(
                          msg.author,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppColors.ink,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: msg.badge == 'צוות'
                                ? AppColors.green.withOpacity(0.15)
                                : msg.badge == 'מוודא'
                                    ? AppColors.blueLight
                                    : AppColors.paper,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            msg.badge,
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: msg.badge == 'צוות'
                                  ? AppColors.green
                                  : msg.badge == 'מוודא'
                                      ? const Color(0xFF1A3A7A)
                                      : AppColors.inkMuted,
                            ),
                          ),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: AppColors.green.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            msg.channelLabel,
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: AppColors.green,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          msg.time,
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.inkMuted,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            msg.text,
            style: const TextStyle(
              fontSize: 14,
              color: AppColors.ink,
              height: 1.5,
            ),
          ),
          if (msg.planName != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.green.withOpacity(0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                    color: AppColors.green.withOpacity(0.2)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.phone_android_rounded,
                      size: 14, color: AppColors.green),
                  const SizedBox(width: 6),
                  Text(
                    msg.planName!,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: AppColors.green,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    msg.planPrice ?? '',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: AppColors.green,
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              _actionButton(Icons.favorite_outline_rounded,
                  '${msg.likes}', () {}),
              const SizedBox(width: 16),
              _actionButton(Icons.chat_bubble_outline_rounded,
                  '${msg.replies}', () {}),
              const Spacer(),
              _actionButton(Icons.share_outlined, 'שתף', () {}),
            ],
          ),
        ],
      ),
    );
  }

  Widget _actionButton(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: AppColors.inkMuted),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.inkMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildComposer() {
    return Container(
      padding: EdgeInsets.fromLTRB(
          16, 10, 16, MediaQuery.of(context).padding.bottom + 10),
      decoration: BoxDecoration(
        color: Colors.white,
        border: const Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _msgCtrl,
              textDirection: TextDirection.rtl,
              decoration: InputDecoration(
                hintText: 'כתבו הודעה...',
                hintTextDirection: TextDirection.rtl,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () {
              if (_msgCtrl.text.trim().isNotEmpty) {
                _msgCtrl.clear();
              }
            },
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

class _CommunityMsg {
  final String author;
  final String avatar;
  final Color avatarColor;
  final String badge;
  final String channel;
  final String channelLabel;
  final String text;
  final int likes;
  final int replies;
  final String time;
  final String? planName;
  final String? planPrice;

  const _CommunityMsg({
    required this.author,
    required this.avatar,
    required this.avatarColor,
    required this.badge,
    required this.channel,
    required this.channelLabel,
    required this.text,
    required this.likes,
    required this.replies,
    required this.time,
    this.planName,
    this.planPrice,
  });
}
