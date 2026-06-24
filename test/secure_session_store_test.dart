import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/secure_session_store.dart';

/// In-memory fake of [FlutterSecureStorage]. The real plugin needs a platform
/// channel (unavailable in the test VM), so we override only the three methods
/// [SecureSessionStore] actually delegates to and assert the store maps the
/// Supabase [LocalStorage] contract onto the single secure key. `noSuchMethod`
/// catches anything else so an accidental new dependency surfaces loudly.
class _FakeSecureStorage implements FlutterSecureStorage {
  final Map<String, String> store = {};

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async =>
      store[key];

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (value == null) {
      store.remove(key);
    } else {
      store[key] = value;
    }
  }

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    store.remove(key);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  const key = 'supabase.auth.session';
  late _FakeSecureStorage fake;
  late SecureSessionStore subject;

  setUp(() {
    fake = _FakeSecureStorage();
    subject = SecureSessionStore(storage: fake);
  });

  test('initialize is a no-op and does not throw', () async {
    await expectLater(subject.initialize(), completes);
  });

  group('empty store', () {
    test('reports no access token and null accessToken', () async {
      expect(await subject.hasAccessToken(), isFalse);
      expect(await subject.accessToken(), isNull);
    });
  });

  group('persistSession', () {
    test('writes under the secure session key and round-trips', () async {
      await subject.persistSession('jwt-token-123');

      // Stored under the documented key, in the secure backend only.
      expect(fake.store[key], 'jwt-token-123');
      expect(await subject.hasAccessToken(), isTrue);
      expect(await subject.accessToken(), 'jwt-token-123');
    });
  });

  group('removePersistedSession', () {
    test('clears the persisted token so the store reads empty again', () async {
      await subject.persistSession('jwt-token-123');
      expect(await subject.hasAccessToken(), isTrue);

      await subject.removePersistedSession();

      expect(fake.store.containsKey(key), isFalse);
      expect(await subject.hasAccessToken(), isFalse);
      expect(await subject.accessToken(), isNull);
    });
  });

  test('default constructor builds a store without touching the platform',
      () {
    // Constructing with the real (lazy) FlutterSecureStorage must not require a
    // platform channel — only method calls would. Guards the mobile-only path.
    expect(SecureSessionStore(), isA<SecureSessionStore>());
  });
}
