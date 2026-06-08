import 'package:flutter/material.dart';

class Category {
  const Category({required this.id, required this.name, required this.icon, required this.currentBill, required this.color, required this.planCount, required this.description});
  final String id;
  final String name;
  final String icon;
  final int currentBill;
  final Color color;
  final int planCount;
  final String description;
}

class Plan {
  const Plan({
    required this.id,
    required this.cat,
    required this.provider,
    required this.net,
    required this.plan,
    required this.price,
    this.after,
    this.term,
    this.intro,
    this.rating = 4.0,
    this.reviews = 0,
    this.flags = const [],
    this.feats = const [],
    this.fine,
    this.highlight = false,
    // ── Rich real-world detail (all optional, backward compatible) ──────────
    this.specs = const {},
    this.fineLines = const [],
    this.fees = const {},
    this.terms = const [],
    this.eligibility,
    this.notes,
    this.sourceUrl,
    this.updatedAt,
  });
  final String id;
  final String cat;
  final String provider;
  final String net;
  final String plan;
  final int price;
  final int? after;
  final int? term;
  final String? intro;
  final double rating;
  final int reviews;
  final List<String> flags;
  final List<String> feats;
  final String? fine;
  final bool highlight;

  /// Structured key specs as label → value (e.g. 'נתונים' → '100GB',
  /// 'דקות' → 'ללא הגבלה', 'מהירות' → '1000Mb'). Drives the quick-spec grid.
  final Map<String, String> specs;

  /// Fine-print bullets (the "אותיות קטנות"): each a single clause.
  final List<String> fineLines;

  /// Fees as label → value (e.g. 'דמי ניתוק' → '₪0', 'התקנה' → '₪149').
  final Map<String, String> fees;

  /// Commitment / contract terms, as bullets.
  final List<String> terms;

  /// Who the plan is for (e.g. 'ללקוחות חדשים בלבד').
  final String? eligibility;

  /// Free-text additional info.
  final String? notes;

  /// Link to the provider/source page the data was taken from.
  final String? sourceUrl;

  /// When this data was last verified (ISO date string).
  final String? updatedAt;

  bool get hasPromo => after != null && after! > price;
  bool get noCommit => term == null || term == 0;
  bool get is5G => flags.contains('5g');
  bool get hasAbroad => flags.contains('abroad');
  bool get isFixed => flags.contains('fixed');

  /// All fine-print clauses, combining the legacy [fine] string and [fineLines].
  List<String> get allFinePrint => [
        if (fine != null && fine!.trim().isNotEmpty) fine!.trim(),
        ...fineLines,
      ];

  /// True when there's any extra detail worth an expandable "more info" section.
  bool get hasExtraInfo =>
      specs.isNotEmpty ||
      fees.isNotEmpty ||
      terms.isNotEmpty ||
      allFinePrint.isNotEmpty ||
      (eligibility != null && eligibility!.trim().isNotEmpty) ||
      (notes != null && notes!.trim().isNotEmpty);

  String get commitmentLabel => noCommit ? 'ללא התחייבות' : 'התחייבות $term חודשים';
  String get netLabel {
    switch (net) {
      case 'fiber': return 'סיב אופטי';
      case 'cable': return 'כבלים';
      case 'adsl': return 'ADSL';
      case 'satellite': return 'לוויין';
      case '4G': return '4G';
      case '5g': case '5G': return '5G';
      case 'lte': case 'LTE': return 'LTE';
      case 'esim': case 'eSIM': return 'eSIM';
      case 'streaming': return 'סטרימינג';
      case 'international': return 'בינלאומי';
      default: return net.toUpperCase();
    }
  }
}

class ChatMessage {
  const ChatMessage({required this.text, required this.isUser, this.planId, required this.timestamp});
  final String text;
  final bool isUser;
  final String? planId;
  final DateTime timestamp;
}

class CommunityPost {
  const CommunityPost({required this.id, required this.author, required this.avatar, required this.channel, required this.text, required this.likes, required this.replies, required this.timestamp, this.planId, this.isVerified = false, this.isTeam = false});
  final String id;
  final String author;
  final String avatar;
  final String channel;
  final String text;
  final int likes;
  final int replies;
  final DateTime timestamp;
  final String? planId;
  final bool isVerified;
  final bool isTeam;
}
