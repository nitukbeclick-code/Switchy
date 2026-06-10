import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// A Supabase [LocalStorage] backed by the platform secure enclave — the iOS
/// Keychain / Android Keystore-encrypted store — instead of plaintext
/// SharedPreferences (XML/plist).
///
/// The Supabase refresh+access token is long-lived, so keeping it off plaintext
/// disk protects it on a lost or rooted device. Used on MOBILE ONLY: `main.dart`
/// passes this to `Supabase.initialize` behind a `kIsWeb` guard, so web keeps the
/// default storage (where Content-Security-Policy is the real mitigation) and the
/// `flutter build web` gate is unaffected.
///
/// Note: replacing the default storage skips supabase_flutter's one-time
/// migration of any pre-existing plaintext session, so an already-signed-in
/// device re-authenticates once after this lands — acceptable pre-launch.
class SecureSessionStore extends LocalStorage {
  SecureSessionStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              // Android uses Keystore-backed ciphers by default (the old
              // encryptedSharedPreferences flag is deprecated/auto-migrated).
              // iOS: Keychain, readable only after first unlock and never
              // synced/restored to another device.
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
            );

  final FlutterSecureStorage _storage;
  static const _key = 'supabase.auth.session';

  @override
  Future<void> initialize() async {}

  @override
  Future<bool> hasAccessToken() async => (await _storage.read(key: _key)) != null;

  @override
  Future<String?> accessToken() => _storage.read(key: _key);

  @override
  Future<void> removePersistedSession() => _storage.delete(key: _key);

  @override
  Future<void> persistSession(String persistSessionString) =>
      _storage.write(key: _key, value: persistSessionString);
}
