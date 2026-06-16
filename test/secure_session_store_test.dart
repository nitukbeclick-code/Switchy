import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/secure_session_store.dart';

// Tests the Supabase LocalStorage adapter that keeps the auth session in the
// platform secure enclave (Keychain / Keystore) instead of plaintext.
//
// IMPORTANT — what this class actually is:
//   SecureSessionStore is a thin, OPAQUE persistence adapter. It stores, reads
//   and deletes the Supabase session STRING verbatim under a single key. It does
//   NOT parse the session, has no notion of "token expiry", and never validates
//   the payload — expiry/refresh is owned by supabase_flutter, not by this
//   store. So there is no expiry branch to exercise here; instead we pin the
//   honest contract: an expired session JSON still round-trips byte-for-byte
//   because the store treats it as opaque (see the "expired session" test).
//
// Backing store: we inject the package's official in-memory test platform via
//   FlutterSecureStorage.setMockInitialValues(...). That installs
//   TestFlutterSecureStoragePlatform (a plain Map), so NO platform method
//   channel is touched and the class's real read/write/delete code runs end to
//   end against a fake — no mockito/mocktail needed, none are in pubspec.
//
// The storage key is private to the class, so every assertion goes through the
// public LocalStorage surface (persistSession / accessToken / hasAccessToken /
// removePersistedSession) rather than poking the raw map by key.

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Fresh in-memory secure store before each test; the same backing map is
  // shared with the SUT so persisted writes are observable on read-back.
  late Map<String, String> backing;
  late SecureSessionStore store;

  setUp(() {
    backing = <String, String>{};
    FlutterSecureStorage.setMockInitialValues(backing);
    store = SecureSessionStore();
  });

  group('round-trip persistence', () {
    test('persistSession then accessToken returns the same string', () async {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';

      await store.persistSession(token);

      expect(await store.accessToken(), token);
    });

    test('hasAccessToken flips to true once a session is persisted', () async {
      expect(await store.hasAccessToken(), isFalse);

      await store.persistSession('a-session-string');

      expect(await store.hasAccessToken(), isTrue);
    });

    test('persistSession overwrites a previously stored session', () async {
      await store.persistSession('first');
      await store.persistSession('second');

      expect(await store.accessToken(), 'second');
    });

    test('round-trips a full session JSON payload unchanged', () async {
      // The real Supabase payload is a JSON blob, not a bare token. Verify the
      // adapter preserves it exactly (no escaping/normalisation drift).
      final session = jsonEncode({
        'access_token': 'abc.def.ghi',
        'refresh_token': 'r-123',
        'expires_at': 9999999999,
        'token_type': 'bearer',
      });

      await store.persistSession(session);

      final read = await store.accessToken();
      expect(read, session);
      expect(jsonDecode(read!)['refresh_token'], 'r-123');
    });
  });

  group('expired session is stored opaquely, never auto-invalidated', () {
    // There is no expiry logic in this class — it must NOT silently drop a
    // session it considers "expired", because deciding that is Supabase's job.
    // We assert the store hands the (already expired) blob back verbatim so the
    // upstream refresh flow can run; the store inventing expiry would be a bug.
    test('an expired session JSON still reads back and is reported present',
        () async {
      final expired = jsonEncode({
        'access_token': 'expired.jwt.token',
        'refresh_token': 'r-expired',
        // A timestamp well in the past — the store does not look at this field.
        'expires_at': 1000000000, // 2001-09-09
      });

      await store.persistSession(expired);

      expect(await store.hasAccessToken(), isTrue,
          reason: 'store must not pre-judge expiry; that is Supabase\'s call');
      expect(await store.accessToken(), expired);
    });
  });

  group('sign-out / clear removes the session', () {
    test('removePersistedSession deletes a stored session', () async {
      await store.persistSession('to-be-cleared');
      expect(await store.hasAccessToken(), isTrue);

      await store.removePersistedSession();

      expect(await store.hasAccessToken(), isFalse);
      expect(await store.accessToken(), isNull);
    });

    test('removePersistedSession on an empty store is a safe no-op', () async {
      // Idempotent sign-out: clearing when nothing is stored must not throw.
      await store.removePersistedSession();

      expect(await store.accessToken(), isNull);
      expect(await store.hasAccessToken(), isFalse);
    });
  });

  group('missing session returns null without throwing', () {
    test('accessToken is null when nothing was ever persisted', () async {
      expect(await store.accessToken(), isNull);
    });

    test('hasAccessToken is false on a fresh store', () async {
      expect(await store.hasAccessToken(), isFalse);
    });

    test('initialize() completes cleanly (no migration side effects)',
        () async {
      // The adapter intentionally no-ops initialize(); calling it must not
      // throw or resurrect a session.
      await store.initialize();

      expect(await store.accessToken(), isNull);
    });
  });
}
