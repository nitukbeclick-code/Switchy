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
    this.afterExact,
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

  /// Exact post-promo price when it isn't a whole shekel (e.g. 59.9 for a plan
  /// that jumps to ₪59.90 after the promo). Mirrors [priceExact]; [after] stays
  /// the rounded int for sort/threshold logic, while display prefers this.
  final double? afterExact;

  /// The post-promo price for display: exact when known, else the rounded int.
  /// Null when there's no promo jump.
  String? get afterText {
    final v = afterExact ?? after?.toDouble();
    if (v == null) return null;
    return v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);
  }

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

  // ── Category-aware display fields (parity with web/lib/plan-display.ts) ──────
  //
  // The single source of truth, in Dart, for "which rich equipment/fee columns
  // does this plan's category show" — mirroring the web `planFieldsForCategory`
  // + `perks()` so the Flutter card/compare surfaces match the web/static sites.
  //
  // TRUTH-ONLY: every accessor reads ONLY what exists on the plan. A missing
  // field is OMITTED — nothing is fabricated. Pure + side-effect-free, so these
  // are safe to call in build() and trivially unit-testable.

  /// Read a value off [fees] (then [specs]) by Hebrew key, trying [key] then each
  /// of [alts] in order. Returns the first non-empty trimmed value, or null.
  ///
  /// Why both maps: the bundled catalogue places equipment keys inconsistently —
  /// `נתב` lives in `specs` on most fiber plans but in `fees` on others, and
  /// `ממיר`/`מגדיל טווח` likewise straddle both. The web `fee()`/`spec()` split
  /// reads one map each; in Dart we check `fees` first (the canonical home for a
  /// charge) then fall back to `specs`, so a real value is never dropped just
  /// because of where the catalogue stored it. Mirrors the web alt-key lookup.
  String? _field(String key, [List<String> alts = const []]) {
    for (final k in [key, ...alts]) {
      final f = fees[k];
      if (f != null && f.trim().isNotEmpty) return f.trim();
      final s = specs[k];
      if (s != null && s.trim().isNotEmpty) return s.trim();
    }
    return null;
  }

  /// Read a value ONLY from [specs] (the web `spec()` semantics) — used for the
  /// quantity columns (נפח / מהירות / דקות) that are never fees.
  String? _spec(String key, [List<String> alts = const []]) {
    for (final k in [key, ...alts]) {
      final v = specs[k];
      if (v != null && v.trim().isNotEmpty) return v.trim();
    }
    return null;
  }

  /// The cellular "דקות/SMS" cell — `דקות` + `SMS` combined, mirroring the web
  /// `minutesAndSms`. Null when neither is present.
  String? get _minutesAndSms {
    final mins = _spec('דקות');
    final sms = _spec('SMS');
    final parts = [
      if (mins != null) mins,
      if (sms != null) '$sms SMS',
    ];
    return parts.isEmpty ? null : parts.join(' · ');
  }

  /// The cellular "חו״ל" cell — only when the plan actually bundles abroad use,
  /// preferring an explicit spec value else a "✓". Mirrors the web `abroadValue`.
  String? get _abroadValue {
    if (!hasAbroad) return null;
    return _spec('חו"ל', ['חו״ל']) ?? '✓';
  }

  /// The ORDERED, category-aware rich fields PRESENT on this plan — the typed
  /// mirror of the web `planFieldsForCategory`. Each entry is a `(label, value)`
  /// record; the price + post-promo columns are handled separately by the views.
  ///
  /// - internet: מהירות, נתב, מגדיל טווח, התקנה
  /// - tv / triple: ממיר, נתב, התקנה
  /// - abroad: נפח, תוקף
  /// - cellular (default): דמי חיבור, נפח, דקות/SMS, חו״ל
  ///
  /// Only fields with a REAL value are included (truth-only).
  List<({String label, String value})> categoryFields() {
    final out = <({String label, String value})>[];
    void push(String label, String? value) {
      if (value != null && value.isNotEmpty) out.add((label: label, value: value));
    }

    switch (cat) {
      case 'internet':
        push('מהירות', _spec('מהירות', ['גלישה']));
        push('נתב', _field('נתב', ['ראוטר']));
        push('מגדיל טווח', _field('מגדיל טווח', ['מרחיב טווח']));
        push('התקנה', _field('התקנה', ['חיבור']));
        break;
      case 'tv':
      case 'triple':
        push('ממיר', _field('ממיר', ['ממירים']));
        push('נתב', _field('נתב', ['ראוטר']));
        push('התקנה', _field('התקנה', ['חיבור']));
        break;
      case 'abroad':
        push('נפח', _spec('נתונים', ['נפח']));
        push('תוקף', _spec('תוקף', ['ימים']));
        break;
      case 'cellular':
      default:
        push('דמי חיבור', _field('דמי חיבור'));
        push('נפח', _spec('נתונים', ['נפח']));
        push('דקות/SMS', _minutesAndSms);
        push('חו״ל', _abroadValue);
        break;
    }
    return out;
  }

  /// Tokens that are pure spec noise in [feats] — volume / minutes / SMS / speed
  /// / 5G — already shown in their own columns. Mirrors the web `PERK_NOISE`
  /// regex `/^\d|GB|דק|SMS|מגה|Mb|^5G$/i` (Dart needs explicit case-insensitive).
  static final RegExp _perkNoise =
      RegExp(r'^\d|GB|דק|SMS|מגה|Mb|^5G$', caseSensitive: false);

  /// The qualitative perks for a plan — the web/static "מידע נוסף". Built from
  /// [feats], dropping the raw spec tokens (see [_perkNoise]); when no feats
  /// survive, falls back to [fineLines], then a single-item [notes]. Ordered +
  /// de-duplicated (possibly empty). Never invents a perk.
  List<String> perksList() {
    String? clean(String s) {
      final t = s.trim();
      return t.isEmpty ? null : t;
    }

    List<String> dedupe(Iterable<String> items) {
      final seen = <String>{};
      final result = <String>[];
      for (final x in items) {
        if (seen.add(x)) result.add(x);
      }
      return result;
    }

    final keptFeats = [
      for (final f in feats)
        if (clean(f) case final t?)
          if (!_perkNoise.hasMatch(t)) t,
    ];
    if (keptFeats.isNotEmpty) return dedupe(keptFeats);

    final lines = [
      for (final l in fineLines)
        if (clean(l) case final t?) t,
    ];
    if (lines.isNotEmpty) return dedupe(lines);

    final n = notes?.trim();
    return (n != null && n.isNotEmpty) ? [n] : const [];
  }

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
