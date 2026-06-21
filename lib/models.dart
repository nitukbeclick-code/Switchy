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
    this.priceExact,
    this.after,
    this.term,
    this.intro,
    this.rating = 4.0,
    this.reviews = 0,
    this.flags = const [],
    this.feats = const [],
    this.fine,
    this.highlight = false,
    this.kind = 'regular',
    this.priceUnit,
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

  /// The rounded whole-shekel price — kept as an int for sorting/back-compat.
  /// Display uses [priceText] and money math uses [priceValue], both of which
  /// honor [priceExact] when present.
  final int price;

  /// The exact advertised price when it isn't a whole shekel (e.g. 69.9 for a
  /// plan marketed as "₪69.90"). Israeli telecom prices almost always end in
  /// .90; rounding them in the headline makes every plan look more expensive.
  final double? priceExact;
  final int? after;
  final int? term;
  final String? intro;
  final double rating;
  final int reviews;
  final List<String> flags;
  final List<String> feats;
  final String? fine;
  final bool highlight;

  /// Plan subtype: 'regular' (default), 'dataonly' (SIM דאטה לטאבלט/IoT) or
  /// 'kosher' (מסלול כשר). Non-regular plans are not a substitute for a regular
  /// line, so they never compete for the hot deal and are pushed to the end of
  /// savings-based sorts — but they still appear in the full results list.
  final String kind;

  /// Pricing unit: 'month' | 'package' | 'day' | 'minute'. When null the
  /// category default applies — abroad plans are per-package, everything else
  /// is monthly (this preserves the historical 'לחבילה'/'לחודש' behavior).
  final String? priceUnit;

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

  /// The price for money math (savings, comparisons) — exact when known.
  double get priceValue => priceExact ?? price.toDouble();

  /// The price as shown to the user: '69.90' when fractional, '70' when whole.
  /// Use everywhere a plan's headline price is rendered (with the ₪ prefix).
  String get priceText {
    final v = priceValue;
    return v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);
  }

  /// True for ordinary subscriber plans — the only kind that competes on
  /// "savings vs. your current bill" (see [kind]).
  bool get isRegular => kind == 'regular';

  /// The effective pricing unit, including the per-category default:
  /// abroad → 'package', everything else → 'month'.
  String get unit => priceUnit ?? (cat == 'abroad' ? 'package' : 'month');

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

/// A telecom plan the user currently holds — the basis of the renewal radar.
/// We track the promo-end date so we can proactively alert the user ~3 weeks
/// before their price jumps and re-compare the whole market for them.
class TrackedPlan {
  const TrackedPlan({
    required this.id,
    required this.category,
    required this.provider,
    required this.planName,
    required this.monthlyPrice,
    this.promoEndDate,
    this.joinedViaUs = false,
  });

  final String id;
  final String category; // cellular / internet / tv / triple / abroad
  final String provider;
  final String planName;
  final int monthlyPrice;
  final String? promoEndDate; // ISO 'yyyy-MM-dd', or null if unknown
  final bool joinedViaUs;

  DateTime? get promoEnd => promoEndDate == null ? null : DateTime.tryParse(promoEndDate!);

  /// Whole days until the promo ends (negative if already passed, null if unknown).
  int? get daysUntilRenewal {
    final end = promoEnd;
    if (end == null) return null;
    final today = DateTime.now();
    return DateTime(end.year, end.month, end.day)
        .difference(DateTime(today.year, today.month, today.day))
        .inDays;
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'category': category,
        'provider': provider,
        'planName': planName,
        'monthlyPrice': monthlyPrice,
        'promoEndDate': promoEndDate,
        'joinedViaUs': joinedViaUs,
      };

  factory TrackedPlan.fromJson(Map<String, dynamic> j) => TrackedPlan(
        id: j['id'] as String,
        category: j['category'] as String,
        provider: j['provider'] as String,
        planName: j['planName'] as String,
        monthlyPrice: (j['monthlyPrice'] as num).toInt(),
        promoEndDate: j['promoEndDate'] as String?,
        joinedViaUs: j['joinedViaUs'] as bool? ?? false,
      );
}

class ChatMessage {
  const ChatMessage({required this.text, required this.isUser, this.planId, required this.timestamp});
  final String text;
  final bool isUser;
  final String? planId;
  final DateTime timestamp;
}

/// The kind of attachment on a community post / reply / chat message.
enum MediaKind { image, video, audio }

MediaKind? mediaKindFromString(String? s) {
  switch (s) {
    case 'image':
      return MediaKind.image;
    case 'video':
      return MediaKind.video;
    case 'audio':
      return MediaKind.audio;
    default:
      return null;
  }
}

extension MediaKindX on MediaKind {
  String get id => name; // 'image' | 'video' | 'audio'
}

class CommunityPost {
  const CommunityPost({
    required this.id,
    required this.author,
    required this.avatar,
    required this.channel,
    required this.text,
    required this.likes,
    required this.replies,
    required this.timestamp,
    this.planId,
    this.isVerified = false,
    this.isTeam = false,
    this.isFlagged = false,
    // ── Rich media (WhatsApp-style attachments) ──────────────────────────────
    this.mediaType,
    this.mediaData,
    this.mediaDurationMs,
  });
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

  /// True when a moderator flagged the post (`community_posts.is_flagged`);
  /// the feed hides or placeholders it.
  final bool isFlagged;

  /// 'image' | 'video' | 'audio' (null = text-only).
  final String? mediaType;

  /// For image/audio: a base64 data-URI. For video: a file path/URI.
  final String? mediaData;

  /// Audio length in milliseconds (voice messages).
  final int? mediaDurationMs;

  MediaKind? get media => mediaType == null || mediaData == null ? null : mediaKindFromString(mediaType);
  bool get hasMedia => media != null;
}
