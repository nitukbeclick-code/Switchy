import '../../models.dart';

/// Input for capturing a sales lead (maps to the `leads` table).
class LeadInput {
  const LeadInput({
    required this.name,
    required this.phone,
    this.email,
    this.provider,
    this.planId,
    this.callbackTime,
  });

  final String name;
  final String phone;
  final String? email;
  final String? provider;
  final String? planId;
  final String? callbackTime; // now / noon / evening / tomorrow

  Map<String, dynamic> toRow() => {
        'name': name,
        'phone': phone,
        'email': email,
        'provider': provider,
        'plan_id': planId,
        'callback_time': callbackTime,
      };
}

/// Input for a provider review — one per user per provider (maps to
/// `provider_reviews`, with the `unique(user_id, provider)` constraint).
class ReviewInput {
  const ReviewInput({
    required this.provider,
    required this.overall,
    required this.subRatings,
    this.text = '',
  });

  final String provider;
  final int overall; // 1..5
  final Map<String, int> subRatings; // price/service/coverage/speed → 0..5
  final String text;

  Map<String, dynamic> toRow() => {
        'provider': provider,
        'overall': overall,
        'price': subRatings['price'] ?? 0,
        'service': subRatings['service'] ?? 0,
        'coverage': subRatings['coverage'] ?? 0,
        'speed': subRatings['speed'] ?? 0,
        'body': text,
      };
}

/// The app's data backend — the seam between the UI and where shared data lives.
///
/// [LocalBackend] keeps everything on-device (today's behaviour). A
/// `SupabaseBackend` (see `supabase_backend.dart.example`) implements the *same*
/// contract against the tables in `supabase/schema.sql`, so moving to the server
/// is a one-line swap of [appBackend] — no screen has to change.
///
/// Scope here is the user-owned data with clean mappings (leads, tracked plans,
/// reviews); the community feed (posts/replies/media) is the next domain to add.
abstract interface class Backend {
  // ── Leads ──────────────────────────────────────────────────────────────────
  Future<void> submitLead(LeadInput lead);

  // ── Renewal radar — tracked plans ────────────────────────────────────────────
  Future<List<TrackedPlan>> fetchTrackedPlans();
  Future<void> addTrackedPlan(TrackedPlan plan);
  Future<void> removeTrackedPlan(String id);

  // ── Provider reviews ─────────────────────────────────────────────────────────
  Future<void> upsertReview(ReviewInput review);
  Future<List<ReviewInput>> reviewsForProvider(String provider);
}
