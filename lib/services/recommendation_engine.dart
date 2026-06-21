import '../app_state.dart';
import '../models.dart';
import '../data.dart';

/// What the user is optimising for. Mirrors the quiz priorities.
enum MatchPriority { price, speed, coverage, service, flexibility }

MatchPriority priorityFromId(String id) {
  switch (id) {
    case 'speed':
      return MatchPriority.speed;
    case 'coverage':
      return MatchPriority.coverage;
    case 'service':
      return MatchPriority.service;
    case 'flexibility':
    case 'nocommit':
      return MatchPriority.flexibility;
    case 'price':
    default:
      return MatchPriority.price;
  }
}

/// A snapshot of the user's needs, fed to the engine to score plans.
class MatchProfile {
  const MatchProfile({
    required this.category,
    this.currentBill = 0,
    this.budget = 0,
    this.priority = MatchPriority.price,
    this.lines = 1,
    this.wants5G = false,
    this.wantsAbroad = false,
    this.wantsNoCommit = false,
  });

  final String category;
  final int currentBill; // current monthly spend (per-package for abroad); 0 = unknown
  final int budget; // desired monthly ceiling; 0 = no ceiling
  final MatchPriority priority;
  final int lines;
  final bool wants5G;
  final bool wantsAbroad;
  final bool wantsNoCommit;

  /// The canonical way to build a profile for [category] from [appState] — the
  /// quiz-budget gating rule (budget applies only when the quiz was completed
  /// for this same category) lives here, not copy-pasted across screens.
  factory MatchProfile.fromAppState(AppState appState, String category) =>
      MatchProfile(
        category: category,
        currentBill: appState.currentBill(category),
        budget: (appState.quizCompleted && appState.quizCat == category)
            ? appState.quizBudget
            : 0,
        priority: priorityFromId(appState.quizPriority),
        lines: appState.quizLines,
        wants5G: appState.wants5G,
        wantsAbroad: appState.wantsAbroad,
        wantsNoCommit: appState.wantsNoCommit,
      );
}

/// A scored plan: the match score (0–100), the concrete annual saving, and
/// human-readable Hebrew reasons/caveats that explain *why* it was ranked here.
class PlanMatch {
  const PlanMatch({
    required this.plan,
    required this.score,
    required this.annualSaving,
    required this.reasons,
    required this.caveats,
  });

  final Plan plan;
  final double score; // 0..100
  final int annualSaving; // ₪/year vs current bill, clamped at 0
  final List<String> reasons;
  final List<String> caveats;

  int get scorePct => score.round().clamp(0, 100);

  /// Short Hebrew label for the score band.
  String get label {
    if (score >= 85) return 'התאמה מושלמת';
    if (score >= 70) return 'התאמה מצוינת';
    if (score >= 55) return 'התאמה טובה';
    return 'התאמה סבירה';
  }
}

/// The app's recommendation "brain": an explainable, deterministic scoring
/// engine over the plan catalogue. No network, no API keys — it ranks plans
/// for a [MatchProfile] using weighted sub-scores and produces the reasons a
/// human advisor would give.
class RecommendationEngine {
  const RecommendationEngine._();

  /// Rank every plan in the profile's category, best match first.
  static List<PlanMatch> rank(MatchProfile profile, {int? limit}) {
    final plans = plansByCat(profile.category);
    final matches = plans.map((p) => scorePlan(p, profile)).toList()
      ..sort((a, b) {
        final byScore = b.score.compareTo(a.score);
        if (byScore != 0) return byScore;
        final bySave = b.annualSaving.compareTo(a.annualSaving);
        if (bySave != 0) return bySave;
        return a.plan.price.compareTo(b.plan.price);
      });
    if (limit != null && matches.length > limit) {
      return matches.sublist(0, limit);
    }
    return matches;
  }

  /// The single best plan for the profile, or null if the category is empty.
  static PlanMatch? bestMatch(MatchProfile profile) {
    final ranked = rank(profile, limit: 1);
    return ranked.isEmpty ? null : ranked.first;
  }

  /// Score one plan against the profile.
  static PlanMatch scorePlan(Plan plan, MatchProfile profile) {
    final abroad = profile.category == 'abroad';
    final saving = profile.currentBill > 0 ? planSaveYear(plan, profile.currentBill) : 0;

    // ── Sub-scores, each 0..1 ────────────────────────────────────────────────
    final priceScore = _priceScore(plan, profile);
    final savingScore = _savingScore(saving, profile);
    final ratingScore = _ratingSignal(plan);
    final speedScore = _speedScore(plan);
    final coverageScore = _coverageScore(plan);
    final flexScore = plan.noCommit ? 1.0 : 0.45;

    // ── Weights, tuned by the user's stated priority ─────────────────────────
    final w = _weights(profile.priority);
    var score = (w.price * priceScore +
            w.saving * savingScore +
            w.rating * ratingScore +
            w.speed * speedScore +
            w.coverage * coverageScore +
            w.flex * flexScore) *
        100;

    // ── Needs-met bonuses (additive) ─────────────────────────────────────────
    if (profile.wants5G && plan.is5G) score += 6;
    if (profile.wantsAbroad && plan.hasAbroad) score += 6;
    if (profile.wantsNoCommit && plan.noCommit) score += 5;
    // Penalise blowing the budget.
    if (profile.budget > 0 && plan.price > profile.budget) {
      final over = (plan.price - profile.budget) / profile.budget;
      score -= (over * 40).clamp(0, 35);
    }

    final reasons = <String>[];
    final caveats = <String>[];

    if (saving > 0) reasons.add('חוסך ₪$saving בשנה');
    if (profile.budget > 0 && plan.price <= profile.budget) reasons.add('בתוך התקציב שלך');
    // No rating-based reason: plan.rating is a placeholder (reviews == 0), so a
    // "מדורג X★" claim would be fabricated social proof.
    if (plan.is5G) reasons.add('5G מהיר');
    if (_isGigFiber(plan)) reasons.add('סיב אופטי במהירות גיגה');
    if (plan.noCommit) reasons.add('ללא התחייבות — ביטול בכל עת');
    if (plan.hasAbroad && !abroad) reasons.add('כולל גלישה בחו״ל');
    if (plan.isFixed) reasons.add('מחיר קבוע — ללא עליות');

    if (plan.hasPromo) caveats.add('מחיר מבצע — עולה ל-₪${plan.afterText} בהמשך');
    if (!plan.noCommit && plan.term != null && plan.term! > 0) {
      caveats.add('התחייבות ל-${plan.term} חודשים');
    }
    if (profile.budget > 0 && plan.price > profile.budget) {
      caveats.add('₪${plan.price - profile.budget} מעל התקציב');
    }

    return PlanMatch(
      plan: plan,
      score: score.clamp(0, 100).toDouble(),
      annualSaving: saving,
      reasons: reasons,
      caveats: caveats,
    );
  }

  // ── Sub-score helpers ──────────────────────────────────────────────────────

  static double _priceScore(Plan plan, MatchProfile profile) {
    if (profile.budget > 0) {
      if (plan.price <= profile.budget) {
        // Reward headroom under budget, up to ~40% under.
        final under = (profile.budget - plan.price) / profile.budget;
        return (0.7 + under).clamp(0.0, 1.0);
      }
      final over = (plan.price - profile.budget) / profile.budget;
      return (0.7 - over).clamp(0.0, 0.7);
    }
    if (profile.currentBill > 0) {
      if (plan.price >= profile.currentBill) return 0.3;
      final cut = (profile.currentBill - plan.price) / profile.currentBill;
      return (0.5 + cut).clamp(0.0, 1.0);
    }
    // No budget and no bill: cheaper-is-better on an absolute curve.
    return (1 - (plan.price / 400)).clamp(0.1, 1.0);
  }

  static double _savingScore(int saving, MatchProfile profile) {
    if (saving <= 0 || profile.currentBill <= 0) return 0.0;
    final yearlyBill = profile.currentBill * 12;
    if (yearlyBill <= 0) return 0.0;
    return (saving / yearlyBill).clamp(0.0, 1.0);
  }

  static double _speedScore(Plan plan) {
    if (plan.is5G) return 1.0;
    switch (plan.net) {
      case 'fiber':
        return _isGigFiber(plan) ? 1.0 : 0.82;
      case '5g':
      case '5G':
        return 1.0;
      case '4G':
      case 'lte':
      case 'LTE':
        return 0.62;
      case 'cable':
        return 0.6;
      case 'esim':
      case 'eSIM':
        return 0.7;
      case 'adsl':
        return 0.32;
      case 'satellite':
        return 0.45;
      default:
        return 0.6;
    }
  }

  static double _coverageScore(Plan plan) {
    final base = switch (plan.net) {
      'fiber' || '5g' || '5G' => 0.95,
      '4G' || 'cable' => 0.75,
      'lte' || 'LTE' => 0.7,
      'esim' || 'eSIM' => 0.72,
      'satellite' => 0.7,
      'adsl' => 0.45,
      'streaming' => 0.6,
      _ => 0.7,
    };
    // Blend in the provider rating as a real-world coverage/reliability proxy.
    return (base * 0.7 + _ratingSignal(plan) * 0.3).clamp(0.0, 1.0);
  }

  /// Honest rating signal on a 0..1 scale. A plan's `rating` field is only a
  /// real signal once at least one review backs it (`reviews > 0`); until then
  /// it is a fabricated placeholder, so we return a NEUTRAL midpoint (0.6) that
  /// neither rewards nor penalises the plan. This keeps ratings out of today's
  /// ranking while leaving the path wired for a future real-review pipeline.
  static double _ratingSignal(Plan plan) {
    if (plan.reviews > 0) return (plan.rating / 5).clamp(0.0, 1.0);
    return 0.6;
  }

  static bool _isGigFiber(Plan plan) {
    if (plan.net != 'fiber') return false;
    final hay = '${plan.plan} ${plan.feats.join(' ')}';
    return hay.contains('1000') ||
        hay.contains('2000') ||
        hay.contains('2500') ||
        hay.contains('5000') ||
        hay.contains('גיגה') ||
        hay.contains('1,000Mb') ||
        hay.contains('2,000Mb');
  }

  static _Weights _weights(MatchPriority priority) {
    // Base weights sum to 1.0.
    var w = const _Weights(price: 0.30, saving: 0.24, rating: 0.16, speed: 0.12, coverage: 0.10, flex: 0.08);
    switch (priority) {
      case MatchPriority.price:
        w = const _Weights(price: 0.34, saving: 0.34, rating: 0.12, speed: 0.08, coverage: 0.06, flex: 0.06);
      case MatchPriority.speed:
        w = const _Weights(price: 0.20, saving: 0.16, rating: 0.14, speed: 0.34, coverage: 0.10, flex: 0.06);
      case MatchPriority.coverage:
        w = const _Weights(price: 0.20, saving: 0.16, rating: 0.16, speed: 0.12, coverage: 0.30, flex: 0.06);
      case MatchPriority.service:
        w = const _Weights(price: 0.20, saving: 0.18, rating: 0.36, speed: 0.10, coverage: 0.10, flex: 0.06);
      case MatchPriority.flexibility:
        w = const _Weights(price: 0.24, saving: 0.20, rating: 0.14, speed: 0.08, coverage: 0.06, flex: 0.28);
    }
    return w;
  }
}

class _Weights {
  const _Weights({
    required this.price,
    required this.saving,
    required this.rating,
    required this.speed,
    required this.coverage,
    required this.flex,
  });
  final double price, saving, rating, speed, coverage, flex;
}
