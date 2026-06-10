import '../models.dart';
import '../data.dart';
import 'recommendation_engine.dart';

/// The user/app context the advisor needs to answer, lifted out of `AppState`
/// so the engine stays pure and unit-testable. The widget populates this from
/// the live `AppState`; tests construct it directly.
///
/// Everything here is plain data — no Flutter, no `BuildContext`, no `AppState`.
class AdvisorContext {
  const AdvisorContext({
    this.bills = const {},
    this.selectedCat = 'cellular',
    this.watchedPlanIds = const [],
    this.quizCompleted = false,
    this.quizCat = '',
    this.quizBudget = 0,
    this.quizPriority = 'price',
    this.quizLines = 1,
    this.wants5G = false,
    this.wantsAbroad = false,
    this.wantsNoCommit = false,
    this.savings = const [],
    this.ratingLookup,
  });

  /// Current monthly bill per category id ('cellular' → 119, …). Missing = 0.
  final Map<String, int> bills;

  /// The category the user last browsed — the recommend-intent fallback.
  final String selectedCat;

  /// Plan ids the user is tracking (🔔), most-recent-first.
  final List<String> watchedPlanIds;

  // ── Quiz / preference signals, fed into the recommendation profile ─────────
  final bool quizCompleted;
  final String quizCat;
  final int quizBudget;
  final String quizPriority;
  final int quizLines;
  final bool wants5G;
  final bool wantsAbroad;
  final bool wantsNoCommit;

  /// Per-category saving opportunities (already computed against [bills]),
  /// mirroring `computeSavings(appState).categories`. Used by the
  /// "how much can I save" branch so the advisor never contradicts the
  /// savings dashboard.
  final List<AdvisorSaving> savings;

  /// Resolve a provider's aggregate rating for the rating-intent branch.
  /// Injected so the engine stays free of `AppState` (which `ProviderRatings`
  /// reaches into for the user's own review). When null, the engine falls back
  /// to a pure, catalogue-only rating via [AdvisorProviderRating.fromCatalogue].
  final AdvisorProviderRating Function(String provider)? ratingLookup;

  int billFor(String cat) => bills[cat] ?? 0;

  /// Provider rating used by the rating branch — the injected lookup if present,
  /// otherwise the pure catalogue-only fallback.
  AdvisorProviderRating ratingFor(String provider) =>
      (ratingLookup ?? AdvisorProviderRating.fromCatalogue)(provider);
}

/// A provider's aggregate rating as the advisor needs it — a dependency-free
/// mirror of `ProviderRating`. The widget can build these from
/// `ProviderRatings.forProvider` (which blends in the user's own review);
/// tests and the pure fallback use [fromCatalogue] (catalogue data only).
class AdvisorProviderRating {
  const AdvisorProviderRating({
    required this.provider,
    required this.stars,
    required this.reviewCount,
    required this.sub,
  });

  final String provider;
  final double stars; // 0..5 average across the provider's plans
  final int reviewCount; // total catalogue reviews
  final Map<String, double> sub; // price/service/coverage/speed, each 0..5

  /// Ordered rating dimensions and their Hebrew labels (mirrors ProviderRatings).
  static const subKeys = ['price', 'service', 'coverage', 'speed'];
  static const subLabels = {
    'price': 'מחיר',
    'service': 'שירות',
    'coverage': 'כיסוי',
    'speed': 'מהירות',
  };

  /// Pure, catalogue-only rating for [provider]. Honest by construction: a
  /// plan's `rating` is only a real signal when it carries real reviews
  /// (`reviews > 0`); a plan with `reviews == 0` is unrated and its rating is a
  /// placeholder that must never be averaged in or fabricated into a star.
  ///
  /// Mirrors `ProviderRatings.forProvider` (catalogue-only, no user review):
  /// the star average is weighted by each plan's real review count, and when no
  /// plan is really rated every figure is 0 / "no data" — including the
  /// sub-scores, which are never invented (we have no real per-dimension data
  /// in the catalogue, only the user's own review handled by `ProviderRatings`).
  static AdvisorProviderRating fromCatalogue(String provider) {
    final rated = plansByProvider(provider).where((p) => p.reviews > 0).toList();
    final reviews = rated.fold<int>(0, (s, p) => s + p.reviews);
    final stars = reviews <= 0
        ? 0.0
        : rated.fold<double>(0, (s, p) => s + p.rating * p.reviews) / reviews;

    return AdvisorProviderRating(
      provider: provider,
      stars: stars,
      reviewCount: reviews,
      // No real per-dimension data in the catalogue — never fabricate sub-scores.
      sub: {for (final k in subKeys) k: 0.0},
    );
  }
}

/// A single category's saving opportunity, as the advisor needs it. A thin,
/// dependency-free mirror of `CategorySaving` so the engine doesn't import
/// `AppState`-bound code.
class AdvisorSaving {
  const AdvisorSaving({
    required this.categoryId,
    required this.annualSaving,
    required this.bestProvider,
  });

  final String categoryId;
  final int annualSaving;
  final String? bestProvider;

  bool get hasOpportunity => annualSaving > 0 && bestProvider != null;
}

/// The user's high-level goal, as classified from their message.
enum AdvisorIntent {
  rating,
  recommend,
  plans,
  greeting,
  thanks,
  price,
  currentBill,
  savings,
  watchlist,
  purchase,
  unknown,
}

/// A structured advisor answer: the Hebrew reply text plus the full set of
/// signals that produced it (so the UI can render plan cards, deep-link, track
/// views, and so tests can assert on the classification — not just the prose).
class AdvisorReply {
  const AdvisorReply({
    required this.text,
    required this.intent,
    required this.category,
    this.planIds = const [],
    this.detectedProvider,
    this.detectedProvider2,
    this.isComparison = false,
    this.sort = 'match',
    this.filters = const [],
    this.budgetHint,
  });

  /// The Hebrew reply to show in the chat bubble.
  final String text;

  /// What the engine decided the user wanted.
  final AdvisorIntent intent;

  /// The category the answer is about (drives the "ראה הכל" deep-link + bill).
  final String category;

  /// Plan ids to render as cards under the reply (≤4).
  final List<String> planIds;

  /// First/second providers detected in the text (for provider/compare flows).
  final String? detectedProvider;
  final String? detectedProvider2;

  /// True when the user asked to compare two providers.
  final bool isComparison;

  /// 'match' (default) or 'price'.
  final String sort;

  /// Detected feature filters ('5g', 'nocommit', 'fiber', '1g', 'sport',
  /// 'netflix') in detection order.
  final List<String> filters;

  /// Budget ceiling extracted from the text (₪/שקל/"פחות מ-"), or null.
  final int? budgetHint;
}

/// The AI-advisor "brain": a pure, deterministic Hebrew NLU + recommendation
/// layer. Given the user's free text and an [AdvisorContext], it classifies
/// intent, detects providers/category/filters/budget, runs the plan-filtering
/// pipeline, and builds the Hebrew reply — with no Flutter, no async, no
/// `AppState`. The widget calls [respondTo] and renders the result.
class AdvisorEngine {
  const AdvisorEngine._();

  /// Provider aliases (lowercased keys) → canonical catalogue provider name.
  /// Order matters: detection walks this map in insertion order.
  static const Map<String, String> providerNames = {
    'פלאפון': 'פלאפון', 'golan': 'גולן טלקום', 'גולן': 'גולן טלקום',
    'סלקום': 'סלקום', 'cellcom': 'סלקום',
    'פרטנר': 'פרטנר', 'partner': 'פרטנר',
    'הוט': 'הוט מובייל', 'hot': 'הוט מובייל',
    'רמי לוי': 'רמי לוי', 'rami': 'רמי לוי',
    'xphone': 'Xphone',
    'ויקום': 'ויקום', 'vcom': 'ויקום',
    '019': '019 מובייל',
    'וואלה': 'וואלה מובייל',
    'yes': 'yes', 'יס': 'yes',
    'בזק': 'בזק', 'bezeq': 'בזק',
    'airalo': 'Airalo eSIM',
    'freetv': 'FreeTV', 'פריtv': 'FreeTV',
  };

  /// Classify [userText] against [context] and build the Hebrew reply.
  ///
  /// Pure: no side effects, no I/O. The caller is responsible for persisting
  /// messages, tracking plan views, and the typing delay.
  static AdvisorReply respondTo(String userText, {required AdvisorContext context}) {
    final lower = userText.toLowerCase();

    String cat = 'cellular';
    String sort = 'match';
    final List<String> filters = [];

    // ── Provider detection ───────────────────────────────────────────────────
    // Order detected providers by where they appear in the text (the first one
    // named is the primary), not by the alias-map iteration order — so
    // "פרטנר או סלקום" reads as a פרטנר→סלקום comparison, matching how a person
    // would read it. Multiple aliases for the same provider collapse to the
    // earliest match.
    final providerPos = <String, int>{};
    for (final entry in providerNames.entries) {
      final pos = lower.indexOf(entry.key);
      if (pos < 0) continue;
      final cur = providerPos[entry.value];
      if (cur == null || pos < cur) providerPos[entry.value] = pos;
    }
    final orderedProviders = providerPos.keys.toList()
      ..sort((a, b) => providerPos[a]!.compareTo(providerPos[b]!));
    final String? detectedProvider =
        orderedProviders.isNotEmpty ? orderedProviders[0] : null;
    final String? detectedProvider2 =
        orderedProviders.length >= 2 ? orderedProviders[1] : null;

    // ── Comparison detection ─────────────────────────────────────────────────
    final isComparison = lower.contains('עדיף') ||
        lower.contains('השוואה') ||
        lower.contains('לעומת') ||
        lower.contains('השווה');

    // ── Category detection — extended Hebrew keyword set ──────────────────────
    // catMentioned: whether the user actually named a category. Used below to
    // decide if this is a plan-browse query at all — without it, a bare "שלום"
    // would default to cellular and always surface plans, shadowing the
    // greeting/thanks/price/bill/savings/watchlist branches.
    bool catMentioned = false;
    if (lower.contains('אינטרנט') ||
        lower.contains('internet') ||
        lower.contains('סיב') ||
        lower.contains('רשת בית') ||
        lower.contains('ברודבנד') ||
        lower.contains('ראוטר') ||
        lower.contains('mb') ||
        lower.contains('gb אינטרנט')) {
      cat = 'internet';
      catMentioned = true;
    } else if (lower.contains('טלוויזיה') ||
        lower.contains('tv') ||
        lower.contains('ערוצים') ||
        lower.contains('כבלים') ||
        lower.contains('לוויין') ||
        lower.contains('yes') ||
        lower.contains('נטפליקס') ||
        lower.contains('ספורט')) {
      cat = 'tv';
      catMentioned = true;
    } else if (lower.contains('חו"ל') ||
        lower.contains('חול') ||
        lower.contains('abroad') ||
        lower.contains('נסיעה') ||
        lower.contains('טיול') ||
        lower.contains('esim') ||
        lower.contains('eSIM') ||
        lower.contains('אירופה') ||
        lower.contains('אמריקה') ||
        lower.contains('רואמינג')) {
      cat = 'abroad';
      catMentioned = true;
    } else if ((lower.contains('חבילה') &&
            (lower.contains('משולב') ||
                lower.contains('הכל') ||
                lower.contains('ביתי') ||
                lower.contains('כולל הכל'))) ||
        lower.contains('triple') ||
        lower.contains('פקיג') ||
        lower.contains('טריפל')) {
      cat = 'triple';
      catMentioned = true;
    } else if (lower.contains('סלולר') ||
        lower.contains('cellular') ||
        lower.contains('פלאפון') ||
        lower.contains('סים') ||
        lower.contains('sim')) {
      cat = 'cellular';
      catMentioned = true;
    }

    // ── Sort & filter detection — extended ───────────────────────────────────
    if (lower.contains('זול') ||
        lower.contains('מחיר נמוך') ||
        lower.contains('הכי פחות') ||
        lower.contains('בזול') ||
        lower.contains('תקציב') ||
        lower.contains('חסכוני') ||
        lower.contains('משתלם') ||
        lower.contains('פחות כסף')) {
      sort = 'price';
    }
    if (lower.contains('5g') || lower.contains('חמישה ג') || lower.contains('הכי מהיר')) {
      filters.add('5g');
    }
    if (lower.contains('ללא התחייבות') ||
        lower.contains('בלי התחייבות') ||
        lower.contains('גמישות') ||
        lower.contains('חופשי') ||
        lower.contains('לא מחויב') ||
        lower.contains('אפשר לצאת')) {
      filters.add('nocommit');
    }
    if (lower.contains('סיב אופטי') || lower.contains('fiber') || lower.contains('סיב')) {
      filters.add('fiber');
    }
    if ((lower.contains('1000') || lower.contains('גיגה')) && cat == 'internet') {
      filters.add('1g');
    }
    if (lower.contains('ספורט') && cat == 'tv') filters.add('sport');
    if ((lower.contains('נטפליקס') || lower.contains('netflix')) &&
        (cat == 'tv' || cat == 'triple')) {
      filters.add('netflix');
    }

    // ── Budget extraction — number preceded by ₪ or followed by ₪/שקל ─────────
    final budgetMatch =
        RegExp(r'₪\s?(\d+)|(\d+)\s?₪|(\d+)\s?שקל|פחות\s?מ\s?-?\s?(\d+)')
            .firstMatch(lower);
    int? budgetHint;
    if (budgetMatch != null) {
      for (int i = 1; i <= budgetMatch.groupCount; i++) {
        final g = budgetMatch.group(i);
        if (g != null) {
          budgetHint = int.tryParse(g);
          break;
        }
      }
    }

    // ── Multi-stage plan filtering pipeline ──────────────────────────────────
    var plans = plansByCat(cat);
    if (filters.contains('5g')) plans = plans.where((p) => p.is5G).toList();
    if (filters.contains('nocommit')) plans = plans.where((p) => p.noCommit).toList();
    if (filters.contains('fiber')) plans = plans.where((p) => p.net == 'fiber').toList();
    if (filters.contains('1g')) {
      plans = plans.where((p) => p.plan.contains('1000') || p.plan.contains('גיגה')).toList();
    }
    if (filters.contains('sport')) {
      final f = plans.where((p) => p.feats.any((feat) => feat.contains('ספורט'))).toList();
      if (f.isNotEmpty) plans = f;
    }
    if (filters.contains('netflix')) {
      final f = plans.where((p) => p.feats.any((feat) => feat.contains('Netflix'))).toList();
      if (f.isNotEmpty) plans = f;
    }
    if (budgetHint != null) {
      final budgetFiltered = plans.where((p) => p.price <= budgetHint!).toList();
      if (budgetFiltered.isNotEmpty) plans = budgetFiltered;
    }

    // Provider filter
    if (isComparison && detectedProvider != null && detectedProvider2 != null) {
      plans = plans
          .where((p) => p.provider == detectedProvider || p.provider == detectedProvider2)
          .toList();
    } else if (detectedProvider != null) {
      final provFiltered = plans.where((p) => p.provider == detectedProvider).toList();
      if (provFiltered.isNotEmpty) plans = provFiltered;
    }

    // A plan-browse query only when the user gave a concrete signal — a named
    // category, provider, filter, price sort, budget, or an explicit "show
    // plans". Otherwise the message is conversational (greeting/thanks/price/
    // bill/savings/watchlist) and must reach those branches instead of being
    // answered with the default-cellular plan list.
    final hasPlanSignal = catMentioned ||
        detectedProvider != null ||
        filters.isNotEmpty ||
        sort == 'price' ||
        budgetHint != null ||
        // explicit browse verbs only — NOT bare "מסלול"/"חבילה", which also
        // appear in watchlist/savings questions handled by later branches
        lower.contains('הצג') ||
        lower.contains('תראה') ||
        lower.contains('תציג');

    // A purchase intent ("רוצה להצטרף") is a conversion signal — surface the
    // lead CTA, don't just dump a plan list — so it must win over the browse
    // branch even when a category was named.
    final isPurchaseSignal = lower.contains('רוצה לעבור') ||
        lower.contains('להצטרף') ||
        lower.contains('מצטרף') ||
        lower.contains('מצטרפת') ||
        lower.contains('תרשום') ||
        lower.contains('איך עוברים') ||
        lower.contains('איך עובר') ||
        lower.contains('איך עוברת') ||
        lower.contains('בפנים') ||
        lower.contains('רוצה להצטרף') ||
        lower.contains('רוצה להתחיל') ||
        lower.contains('מעוניין') ||
        lower.contains('מעוניינת') ||
        lower.contains('סגור עסקה');

    List<Plan> topPlans = [];
    if (hasPlanSignal && !isPurchaseSignal && plans.isNotEmpty) {
      if (sort == 'price') {
        plans.sort((a, b) => a.price.compareTo(b.price));
      } else {
        plans.sort((a, b) {
          if (a.highlight != b.highlight) return a.highlight ? -1 : 1;
          return a.price.compareTo(b.price);
        });
      }
      topPlans = plans.take(isComparison ? 4 : 3).toList();
    }

    // ── Intent classification ────────────────────────────────────────────────
    final isGreeting = lower.contains('שלום') ||
        lower.contains('היי') ||
        lower.contains('hi') ||
        lower.contains('hello') ||
        lower.contains('הי') ||
        lower.contains('מה שלום') ||
        lower.contains('בוקר') ||
        lower.contains('ערב');
    final isThanks = lower.contains('תודה') ||
        lower.contains('תנקס') ||
        lower.contains('thanks') ||
        lower.contains('כייף') ||
        lower.contains('סבבה');

    final isRecommendIntent = lower.contains('מה כדאי') ||
        lower.contains('המלצה') ||
        lower.contains('הכי משתלם') ||
        lower.contains('מה הכי טוב') ||
        lower.contains('תמליץ') ||
        lower.contains('מה הכי') ||
        lower.contains('מה כדאי לי') ||
        lower.contains('recommend') ||
        lower.contains('הכי טוב לי') ||
        lower.contains('מה הכי משתלם') ||
        lower.contains('✨ מה הכי משתלם');

    final isRatingIntent = lower.contains('דירוג') ||
        lower.contains('ביקורות') ||
        lower.contains('הכי מדורג') ||
        lower.contains('ספק הכי טוב') ||
        lower.contains('ספק מומלץ');

    // ── Reply-building branches (mirrors _send order exactly) ─────────────────
    final String reply;
    AdvisorIntent intent;

    if (isRatingIntent) {
      intent = AdvisorIntent.rating;
      if (detectedProvider != null) {
        final r = context.ratingFor(detectedProvider);
        if (r.reviewCount == 0) {
          // Honest no-data state — no fabricated 0.0★, mirroring the provider profile.
          reply =
              'אין עדיין דירוגים ל$detectedProvider — היו הראשונים לדרג! '
              'רוצה לראות את המסלולים של $detectedProvider? כתבו את שמו.';
        } else {
          final subs = AdvisorProviderRating.subKeys
              .map((k) =>
                  '• ${AdvisorProviderRating.subLabels[k]}: ${r.sub[k]!.toStringAsFixed(1)}★')
              .join('\n');
          reply =
              '⭐ דירוג $detectedProvider: ${r.stars.toStringAsFixed(1)}★ (${r.reviewCount} ביקורות)\n\n$subs\n\nרוצה לראות את המסלולים של $detectedProvider? כתבו את שמו.';
        }
      } else {
        final ranked = allProviders
            .map((p) => (name: p, stars: context.ratingFor(p).stars))
            .where((e) => e.stars > 0)
            .toList()
          ..sort((a, b) => b.stars.compareTo(a.stars));
        final top =
            ranked.take(3).map((e) => '• ${e.name} — ${e.stars.toStringAsFixed(1)}★').join('\n');
        reply = '🏆 הספקים המדורגים ביותר:\n\n$top\n\nרוצה דירוג של ספק מסוים? כתבו את שמו.';
      }
    } else if (isRecommendIntent && detectedProvider == null) {
      intent = AdvisorIntent.recommend;
      // Determine category from text, fall back to selected
      String recCat = context.selectedCat;
      if (lower.contains('אינטרנט') || lower.contains('internet')) {
        recCat = 'internet';
      } else if (lower.contains('טלוויזיה') || lower.contains('tv')) {
        recCat = 'tv';
      } else if (lower.contains('חו"ל') || lower.contains('חול') || lower.contains('abroad')) {
        recCat = 'abroad';
      } else if (lower.contains('משולב') || lower.contains('triple')) {
        recCat = 'triple';
      } else if (lower.contains('סלולר') ||
          lower.contains('cellular') ||
          lower.contains('פלאפון')) {
        recCat = 'cellular';
      }
      cat = recCat;

      final profile = _profileFor(recCat, context);
      // Score the category once; reuse for both the top pick and the alternative.
      final ranked = RecommendationEngine.rank(profile, limit: 2);
      final best = ranked.isEmpty ? null : ranked.first;
      if (best != null) {
        final unit = priceUnitLabel(best.plan);
        final catName = categoryById(recCat)?.name ?? recCat;
        final labelLine = '${best.label} — ${best.scorePct}%';
        final topReasons = best.reasons.take(3).map((r) => '• $r').join('\n');
        final savingLine = best.annualSaving > 0 ? '\n💰 חיסכון שנתי: ₪${best.annualSaving}' : '';
        final promoNote =
            best.plan.hasPromo ? '\n⚡ מחיר מבצע! לאחר המבצע: ₪${best.plan.after}/$unit' : '';

        // Alternative plan (reuses the ranking computed above)
        String altLine = '';
        if (ranked.length >= 2) {
          final alt = ranked[1];
          final altUnit = priceUnitLabel(alt.plan);
          altLine =
              '\n\n🥈 אלטרנטיבה: ${alt.plan.provider} — ${alt.plan.plan} ₪${alt.plan.price}/$altUnit (${alt.label})';
        }

        reply = '✨ הממליץ החכם שלי בקטגורית $catName:\n\n'
            '🏆 ${best.plan.provider} — ${best.plan.plan}\n'
            '₪${best.plan.price}/$unit\n'
            '$labelLine\n'
            '$topReasons'
            '$savingLine'
            '$promoNote'
            '$altLine\n\n'
            'רוצה לראות פרטים? כתבו "הצג מסלול"';

        topPlans = [best.plan];
      } else {
        reply =
            'לא מצאתי מסלולים בקטגוריה הנבחרת. נסו לציין קטגוריה: סלולר, אינטרנט, טלוויזיה, חו"ל.';
      }
    } else if (topPlans.isNotEmpty) {
      intent = AdvisorIntent.plans;
      final currentBill = context.billFor(cat);
      final best = topPlans.first;
      final saveYear = ((currentBill - best.price) * 12).clamp(0, 999999);
      final catName = categoryById(cat)?.name ?? cat;
      final unit = priceUnitShort(best);
      final promoNote = best.hasPromo ? '\n⚡ מחיר מבצע! לאחר המבצע: ₪${best.after}/$unit' : '';
      final commitNote =
          best.noCommit ? '\n✅ ללא התחייבות' : '\n📅 התחייבות ${best.term} חודשים';
      final savingsLine = saveYear > 0 ? '\n💰 חיסכון שנתי צפוי: ₪$saveYear' : '';
      final multiNote = topPlans.length > 1
          ? '\n\nמצאתי ${topPlans.length} מסלולים — הנה הכי טוב:'
          : '\nמצאתי מסלול מעולה עבורך:';
      final planLine = '${best.plan} — ₪${best.price}/$unit';

      final replyPrefix = isComparison && detectedProvider != null && detectedProvider2 != null
          ? 'השוואה: $detectedProvider מול $detectedProvider2:'
          : detectedProvider != null
              ? 'מסלולי $detectedProvider:'
              : 'בקטגורית $catName:';

      reply = '$replyPrefix$multiNote\n$planLine$promoNote$commitNote$savingsLine';
    } else if (isGreeting) {
      intent = AdvisorIntent.greeting;
      reply =
          'שלום! 🤖 אני חוסך AI — יועץ התקשורת החכם שלכם.\n\nאספר לי מה מחפשים ואמצא את המסלול הכי משתלם:\n\n📱 סלולר  🌐 אינטרנט  📺 טלוויזיה  ✈️ חו"ל';
    } else if (isThanks) {
      intent = AdvisorIntent.thanks;
      reply =
          'בשמחה! 🙌 תמיד פה לעזור.\n\nאחרי שתחליטו, אפשר לסיים את המעבר כולל ניוד מספר ישירות דרך חוסך — בקלות ובלי עמלות נסתרות.';
    } else if (lower.contains('כמה') &&
        (lower.contains('עולה') || lower.contains('עלות') || lower.contains('מחיר'))) {
      intent = AdvisorIntent.price;
      int minPrice(String c) =>
          plansByCat(c).map((p) => p.price).fold(9999, (a, b) => a < b ? a : b);
      reply =
          'אפשר לכוון אותך! 😊\n\nאיזה שירות אתם מחפשים?\n• 📱 סלולר — מ-₪${minPrice('cellular')}/חודש\n• 🌐 אינטרנט — מ-₪${minPrice('internet')}/חודש (מבצע)\n• 📺 טלוויזיה — מ-₪${minPrice('tv')}/חודש\n• 🏠 חבילה משולבת — מ-₪${minPrice('triple')}/חודש\n• ✈️ חו"ל — מ-₪${minPrice('abroad')}/חבילה\n\nספרו לי עם איזו קטגוריה ואמצא את הכי זול!';
    } else if (lower.contains('חשבון') ||
        lower.contains('כמה אני משלם') ||
        lower.contains('כמה משלם') ||
        lower.contains('המחיר שלי') ||
        lower.contains('נוכחי')) {
      intent = AdvisorIntent.currentBill;
      final bills =
          ['cellular', 'internet', 'tv', 'triple', 'abroad'].where((c) => context.billFor(c) > 0);
      if (bills.isEmpty) {
        reply =
            'לא הגדרת עדיין את החשבונות שלך.\nעבור לדף "החשבונות שלי" ↓ כדי להכניס כמה אתה משלם — ואמצא כמה תוכל לחסוך! 💡';
      } else {
        final names = {
          'cellular': 'סלולר',
          'internet': 'אינטרנט',
          'tv': 'טלוויזיה',
          'triple': 'חבילה משולבת',
          'abroad': 'חו"ל'
        };
        final lines = bills.map((c) => '• ${names[c]}: ₪${context.billFor(c)}').join('\n');
        reply = 'החשבונות השמורים שלך:\n$lines\n\nרוצה לבדוק כמה תחסוך בכל קטגוריה? אמור לי!';
      }
    } else if (lower.contains('כמה אחסוך') ||
        lower.contains('חיסכון שלי') ||
        lower.contains('כמה חוסך') ||
        lower.contains('כמה אפשר לחסוך')) {
      intent = AdvisorIntent.savings;
      // Reuse the precomputed savings so the advisor never contradicts the
      // home hero / savings dashboard / bills.
      const names = {
        'cellular': 'סלולר',
        'internet': 'אינטרנט',
        'tv': 'טלוויזיה',
        'triple': 'חבילה משולבת',
        'abroad': 'חו"ל'
      };
      final savings = <String>[];
      for (final cs in context.savings) {
        if (cs.annualSaving > 0 && cs.bestProvider != null) {
          savings.add('• ${names[cs.categoryId]}: ₪${cs.annualSaving}/שנה עם ${cs.bestProvider}');
        }
      }
      if (savings.isEmpty) {
        reply = 'לא הגדרת חשבונות עדיין. עבור ל"החשבונות שלי" כדי להכניס כמה אתה משלם.';
      } else {
        reply = '💰 פוטנציאל החיסכון שלך:\n\n${savings.join('\n')}\n\nרוצה לראות פרטים על מסלול מסוים?';
      }
    } else if (lower.contains('רשימת מעקב') ||
        lower.contains('מעקב שלי') ||
        lower.contains('שמרתי') ||
        lower.contains('מסלולים שמרתי')) {
      intent = AdvisorIntent.watchlist;
      final watched = context.watchedPlanIds;
      if (watched.isEmpty) {
        reply =
            'אין לך מסלולים במעקב עדיין.\nכנס לדף פרטי מסלול ולחץ על 🔔 כדי לעקוב אחרי עדכוני מחיר!';
      } else {
        final wplans = watched.map((id) => planById(id)).whereType<Plan>().take(5).toList();
        final lines = wplans.map((p) => '• ${p.provider} — ${p.plan} ₪${p.price}').join('\n');
        reply = '🔔 מסלולים במעקב שלך:\n\n$lines\n\nרוצה שאמצא משהו יותר זול באחת הקטגוריות?';
      }
    } else if (isPurchaseSignal) {
      intent = AdvisorIntent.purchase;
      final profile = _profileFor(cat, context);
      final ranked = RecommendationEngine.rank(profile, limit: 1);
      final best = ranked.isEmpty ? null : ranked.first;
      if (best != null) {
        topPlans = [best.plan];
        final unit = priceUnitLabel(best.plan);
        reply = '🎉 מעולה! אמצא לך את העסקה הכי טובה.\n\n'
            '🏆 ממליץ על ${best.plan.provider} — ${best.plan.plan} ₪${best.plan.price}/$unit\n\n'
            'לחץ "דבר עם נציג" למטה — שירות חינמי, ניוד מהיר! 👇';
      } else {
        reply =
            '😊 מעולה! אשמח לעזור לך לעבור.\nלאיזה קטגוריה אתה מחפש? סלולר, אינטרנט, טלוויזיה או חו"ל?';
      }
    } else {
      intent = AdvisorIntent.unknown;
      reply =
          'לא הצלחתי להבין בדיוק. נסו לכתוב למשל:\n\n• "מצא סלולר זול ללא התחייבות"\n• "אינטרנט גיגה בזול"\n• "חבילת חו"ל לאירופה"\n• "5G בפחות מ-₪60"\n• "כמה אני חוסך"';
    }

    return AdvisorReply(
      text: reply,
      intent: intent,
      category: cat,
      planIds: topPlans.map((p) => p.id).toList(),
      detectedProvider: detectedProvider,
      detectedProvider2: detectedProvider2,
      isComparison: isComparison,
      sort: sort,
      filters: filters,
      budgetHint: budgetHint,
    );
  }

  /// Build a [MatchProfile] for [cat] from the advisor context — mirrors the
  /// widget's `_profileFor`.
  static MatchProfile _profileFor(String cat, AdvisorContext ctx) => MatchProfile(
        category: cat,
        currentBill: ctx.billFor(cat),
        budget: (ctx.quizCompleted && ctx.quizCat == cat) ? ctx.quizBudget : 0,
        priority: priorityFromId(ctx.quizPriority),
        lines: ctx.quizLines,
        wants5G: ctx.wants5G,
        wantsAbroad: ctx.wantsAbroad,
        wantsNoCommit: ctx.wantsNoCommit,
      );
}
