import '../app_state.dart';

/// The "ארנק התקשורת" (Telecom Wallet) view-model: the user's OWN realized
/// savings plus an HONEST aggregate social-proof decision. Pure and testable —
/// no UI, no navigation, no I/O — so the honesty rule lives in one place the
/// widget renders but can't drift from.
///
/// E-E-A-T / HONESTY (ABSOLUTE — mirrors web/lib/wallet-stats.ts):
///   • [realizedSaving] is the user's OWN running total ([AppState.totalSavings])
///     — the ₪/year credited when they actually submitted a lead. It is "מבוסס
///     על המסלולים שבחרת", an estimate from their inputs, never a guarantee.
///   • The aggregate social-proof block ([showSocialProof]) is published ONLY
///     above a real member threshold ([kSocialProofMinMembers]). Below it — or
///     when we have no aggregate — we show NOTHING (the widget renders a neutral,
///     claim-free fallback). A tiny, non-representative sample is never paraded
///     as proof, and no "X users saved ₪Y" is ever fabricated.
class WalletSummary {
  const WalletSummary({
    required this.realizedSaving,
    required this.monthlyEquivalent,
    required this.aggregateMembers,
    required this.aggregateTypicalSaving,
  });

  /// The user's own credited annual saving so far (₪/year, ≥ 0).
  final int realizedSaving;

  /// The same figure expressed per-month (₪/month, ≥ 0) — a softer read for the
  /// headline. Floor of [realizedSaving] / 12.
  final int monthlyEquivalent;

  /// How many REAL members back the aggregate social proof. 0 ⇒ no aggregate
  /// available (e.g. offline / no signal), which never publishes.
  final int aggregateMembers;

  /// The typical (median) annual saving across those members (₪/year). Only
  /// meaningful — and only shown — when [showSocialProof] is true.
  final int aggregateTypicalSaving;

  /// True once the user has any realized saving worth celebrating.
  bool get hasRealizedSaving => realizedSaving > 0;

  /// The honesty gate: publish the aggregate proof ONLY above the threshold AND
  /// when there is a real typical figure. Otherwise the UI shows the neutral,
  /// claim-free fallback — never a fabricated number.
  bool get showSocialProof =>
      aggregateMembers >= kSocialProofMinMembers && aggregateTypicalSaving > 0;
}

/// Minimum number of REAL recorded savings before any aggregate social-proof
/// figure is shown. Below this the sample is too small to be representative, so
/// we publish NOTHING. Mirrors web/lib/wallet-stats.ts `SOCIAL_PROOF_MIN_MEMBERS`
/// — keep the two in lockstep so the app and site never over-claim differently.
const int kSocialProofMinMembers = 25;

/// Build the wallet view-model for [s]. [aggregateMembers]/[aggregateTypicalSaving]
/// are the REAL aggregate (e.g. fetched from `/wallet-stats`); they default to 0,
/// which keeps the social-proof block hidden until a genuine, above-threshold
/// aggregate is supplied. Pure — no AppState mutation, no clock.
WalletSummary computeWallet(
  AppState s, {
  int aggregateMembers = 0,
  int aggregateTypicalSaving = 0,
}) {
  final realized = s.totalSavings.clamp(0, 1 << 30);
  return WalletSummary(
    realizedSaving: realized,
    monthlyEquivalent: realized ~/ 12,
    aggregateMembers: aggregateMembers < 0 ? 0 : aggregateMembers,
    aggregateTypicalSaving:
        aggregateTypicalSaving < 0 ? 0 : aggregateTypicalSaving,
  );
}
