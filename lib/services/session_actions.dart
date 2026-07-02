import '../app_state.dart';
import 'auth_service.dart';
import 'backend/local_backend.dart' show appBackend;

/// Shared session actions — the ONE place that sequences "end this identity"
/// correctly, so Profile / Settings / account-deletion can't each invent a
/// slightly different (and slightly broken) logout.
///
/// Scope discipline (why global vs local):
/// * [signOutCompletely] uses GLOBAL scope — the account still exists, so the
///   refresh token must be revoked server-side too (protects a shared/lost
///   device or an exfiltrated token).
/// * [deleteAccountCompletely] uses LOCAL scope — the auth user was just
///   deleted, so a global revoke round-trip authenticates as a user that no
///   longer exists and the server rejects it with 403. Local scope only clears
///   this device's session, which is all that's left to clear.
///
/// Neither function navigates: callers own routing (e.g. Profile goes to
/// Onboarding after the awaited sign-out, guarded by `context.mounted`).

/// Signs out everywhere (server-side token revoke + biometric-gate clear) and
/// THEN clears AppState's identity mirror. Both halves are fail-soft, so the
/// local logout always lands even when the network call doesn't.
Future<void> signOutCompletely(AppState appState) async {
  await AuthService.instance.signOut();
  appState.logout();
}

/// Deletes the account server-side, then tears the local session down in the
/// only order that works for a now-nonexistent user: local sign-out (a global
/// revoke would 403 — see above), re-arm the anonymous device identity so
/// RLS-scoped features keep working, and finally wipe the local state.
/// Returns false — with NOTHING torn down — when the server deletion fails,
/// so the caller can keep the signed-in session and surface the error.
Future<bool> deleteAccountCompletely(AppState appState) async {
  final ok =
      await appBackend.deleteAccount(advisorSessionId: appState.advisorSessionId);
  if (!ok) return false;
  await AuthService.instance.signOutLocal();
  await AuthService.instance.ensureAnonymousSession();
  await appState.wipeForAccountDeletion();
  return true;
}
