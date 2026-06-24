import '../data.dart';
import '../models.dart' show Plan;

/// A GROUNDED retention/negotiation script for a user who wants to STAY with
/// their current provider but pay less. The Dart mirror of the agent's
/// `suggest_retention_offer` tool (supabase/functions/_shared/tools.ts): it
/// gives the user honest leverage for a retention call — "competitor X offers
/// plan Y for ₪Z; can you match it?" — built only from REAL catalogue plans.
///
/// HONESTY (ABSOLUTE):
///   • Every figure is a real catalogue plan ([marketBest] / [sameProviderBest]).
///     Nothing is invented; if the category has no plans there is no script.
///   • The script is "ask for a match" leverage, NEVER a promise that the
///     provider will agree — the decision is theirs. The copy says so.
class NegotiationScript {
  const NegotiationScript({
    required this.category,
    required this.marketBest,
    required this.sameProviderBest,
    required this.provider,
  });

  /// The category the script is for.
  final String category;

  /// The cheapest REAL regular plan in the category — the benchmark to negotiate
  /// against. Null only when the category has no regular plans at all.
  final Plan? marketBest;

  /// The user's OWN provider's cheapest plan in the category, if we have one —
  /// lets the script say "even your own cheaper plan is X". Null when the user
  /// gave no provider or we carry none for them.
  final Plan? sameProviderBest;

  /// The user's current provider (as they entered it), or empty.
  final String provider;

  /// True when there is a real benchmark to negotiate against.
  bool get hasLeverage => marketBest != null;

  /// The ordered Hebrew talking points for the call. Empty when [hasLeverage] is
  /// false (the UI then shows an honest "no data" state). Each line is grounded
  /// in a real plan; the closing line frames it as a starting point, not a
  /// promise.
  List<String> get talkingPoints {
    final best = marketBest;
    if (best == null) return const [];
    final out = <String>[];
    final pUnit = priceUnitShort(best);
    final sameLine = sameProviderBest;

    if (provider.isNotEmpty) {
      if (sameLine != null) {
        out.add(
            'אצל ${sameLine.provider} עצמם המסלול הזול הוא "${sameLine.plan}" ב-₪${sameLine.priceText}/${priceUnitShort(sameLine)} — '
            'תגידו: "אני משלם/ת יותר מהמסלול הזול שלכם עצמכם, אפשר ליישר קו?"');
      }
      out.add(
          'ציינו הצעה אמיתית מהשוק: "${best.provider} מציעים את \'${best.plan}\' ב-₪${best.priceText}/$pUnit. '
          'אתם יכולים להשוות או להתקרב? אחרת אני שוקל/ת לעבור."');
    } else {
      out.add(
          'ציינו הצעה אמיתית מהשוק: "${best.provider} מציעים את \'${best.plan}\' ב-₪${best.priceText}/$pUnit — '
          'אתם יכולים להשוות?"');
    }
    out.add(
        'בקשו לדבר עם מחלקת שימור (לא שירות לקוחות רגיל) — שם נמצאות ההצעות הטובות.');
    out.add(
        'אם אין שיפור, ציינו שאתם יודעים שניתן לנייד מספר בקלות ולעבור — זה הקלף החזק ביותר.');
    return out;
  }

  /// The honest one-line disclaimer the UI pins under the script.
  static const String disclaimer =
      'זו נקודת פתיחה אמיתית למיקוח — לא הבטחה. ההחלטה אם להוזיל היא של הספק.';
}

/// Build a grounded [NegotiationScript] for [category], optionally tailored to
/// the user's current [provider]. Pure — reads only the bundled catalogue.
/// Mirrors `suggest_retention_offer`: pick the cheapest REAL regular plan as the
/// market benchmark, and (when a provider is given) that provider's own cheapest
/// plan in the category.
NegotiationScript buildNegotiationScript(String category, {String provider = ''}) {
  // Cheapest real regular plan in the category — the market benchmark.
  final regular = plansByCat(category).where((p) => p.isRegular).toList()
    ..sort((a, b) => a.priceValue.compareTo(b.priceValue));
  final marketBest = regular.isEmpty ? null : regular.first;

  Plan? sameBest;
  final prov = provider.trim();
  if (prov.isNotEmpty) {
    final own = plansByProvider(prov)
        .where((p) => p.cat == category && p.isRegular)
        .toList()
      ..sort((a, b) => a.priceValue.compareTo(b.priceValue));
    sameBest = own.isEmpty ? null : own.first;
  }

  return NegotiationScript(
    category: category,
    marketBest: marketBest,
    sameProviderBest: sameBest,
    provider: prov,
  );
}
