/// App-wide feature flags — compile-time constants that gate behaviour we want
/// to ship dark and flip on later (without a code change reaching every call
/// site). Keep these few, named for the behaviour they unlock, and defaulted to
/// the SAFE value so a fresh checkout behaves exactly as it does today.
library;

/// When true, registration is MANDATORY: a guest with only an anonymous Supabase
/// session (or no session) is forced to `/auth` and cannot reach `/home` or skip
/// onboarding as a guest. Defaults to FALSE so the app keeps allowing anonymous
/// use until the owner finishes the OAuth / email-OTP provider configuration in
/// the Supabase dashboard. Flip to true only once those providers are live.
///
/// "Registered" means a real, non-anonymous account — see
/// `AppState.isRegistered` (delegates to `AuthService.isRealUser`).
const bool kAuthGateRequired = false;
