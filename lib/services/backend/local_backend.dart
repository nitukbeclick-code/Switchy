import '../../models.dart';
import 'backend.dart';

/// On-device [Backend] — the default. Single-user (this device), in-memory plus
/// whatever the caller persists. It mirrors the server semantics so swapping in
/// the Supabase implementation later changes behaviour as little as possible:
/// reviews are unique per provider, tracked plans are newest-first, etc.
class LocalBackend implements Backend {
  final List<LeadInput> _leads = [];
  final List<TrackedPlan> _tracked = [];
  final Map<String, ReviewInput> _reviewByProvider = {}; // unique per provider

  // Exposed for inspection/tests; not part of the Backend contract.
  List<LeadInput> get submittedLeads => List.unmodifiable(_leads);

  @override
  Future<void> submitLead(LeadInput lead) async {
    _leads.add(lead);
  }

  @override
  Future<List<TrackedPlan>> fetchTrackedPlans() async =>
      List.unmodifiable(_tracked);

  @override
  Future<void> addTrackedPlan(TrackedPlan plan) async {
    _tracked.removeWhere((p) => p.id == plan.id);
    _tracked.insert(0, plan); // newest first, like the server's created_at desc
  }

  @override
  Future<void> removeTrackedPlan(String id) async {
    _tracked.removeWhere((p) => p.id == id);
  }

  @override
  Future<void> upsertReview(ReviewInput review) async {
    _reviewByProvider[review.provider] = review; // unique(user, provider)
  }

  @override
  Future<List<ReviewInput>> reviewsForProvider(String provider) async {
    final r = _reviewByProvider[provider];
    return r == null ? const [] : [r];
  }
}

/// The backend the app talks to. Flip this one line to `SupabaseBackend()` once
/// `supabase_flutter` is wired (see `supabase_backend.dart.example`).
Backend appBackend = LocalBackend();
