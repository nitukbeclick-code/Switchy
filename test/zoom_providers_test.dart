import 'package:flutter_test/flutter_test.dart';

import 'package:chosech/core/zoom_providers.dart';
import 'package:chosech/services/backend/local_backend.dart';

/// Pure-logic tests for the Zoom-booking provider gate
/// (`lib/core/zoom_providers.dart`): the const compiled fallback, the
/// once-per-session live hydration, and the never-cache-the-fallback rule.
/// Backend behaviour is faked by subclassing [LocalBackend].

/// A backend whose provider-capabilities read is scripted per test.
class _ZoomBackend extends LocalBackend {
  _ZoomBackend(this.live);
  Set<String> live;
  int fetches = 0;

  @override
  Future<Set<String>> fetchZoomSupportedProviders() async {
    fetches++;
    return live;
  }
}

/// A backend whose provider-capabilities read always fails.
class _ThrowingZoomBackend extends LocalBackend {
  @override
  Future<Set<String>> fetchZoomSupportedProviders() async =>
      throw StateError('capabilities read failed');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    resetZoomProviderCacheForTest();
    appBackend = LocalBackend();
  });

  tearDown(() {
    resetZoomProviderCacheForTest();
    appBackend = LocalBackend();
  });

  group('providerSupportsZoom (compiled fallback)', () {
    test('a null or blank provider is never supported', () {
      expect(providerSupportsZoom(null), isFalse);
      expect(providerSupportsZoom(''), isFalse);
      expect(providerSupportsZoom('   '), isFalse);
    });

    test('matches the const fallback before any hydration', () {
      expect(providerSupportsZoom('בזק'), isTrue);
      expect(providerSupportsZoom('פרטנר'), isTrue);
      expect(providerSupportsZoom('019 מובייל'), isFalse);
      expect(providerSupportsZoom('Airalo eSIM'), isFalse);
    });

    test('trims surrounding whitespace before matching', () {
      expect(providerSupportsZoom('  בזק  '), isTrue);
    });
  });

  group('zoomSupportedProviders (live hydration)', () {
    test('a successful fetch is cached and flips the synchronous gate',
        () async {
      final backend = _ZoomBackend({'ספק חדש'});
      appBackend = backend;

      final live = await zoomSupportedProviders();
      expect(live, {'ספק חדש'});

      // The gate now honors the LIVE set, not the compiled fallback.
      expect(providerSupportsZoom('ספק חדש'), isTrue);
      expect(providerSupportsZoom('בזק'), isFalse);

      // Cached for the session — no second fetch.
      await zoomSupportedProviders();
      expect(backend.fetches, 1);
    });

    test('concurrent callers share a single in-flight fetch', () async {
      final backend = _ZoomBackend({'ספק חדש'});
      appBackend = backend;

      final results = await Future.wait(
          [zoomSupportedProviders(), zoomSupportedProviders()]);
      expect(backend.fetches, 1);
      expect(results[0], results[1]);
    });

    test('an empty read falls back to the const set and is NOT cached',
        () async {
      final backend = _ZoomBackend(<String>{});
      appBackend = backend;

      expect(await zoomSupportedProviders(), kZoomSupportedProviders);
      expect(providerSupportsZoom('בזק'), isTrue); // still the fallback

      // The fallback was not cached, so a later call retries and can pick up
      // the real table once it responds.
      backend.live = {'ספק חדש'};
      expect(await zoomSupportedProviders(), {'ספק חדש'});
      expect(backend.fetches, 2);
      expect(providerSupportsZoom('ספק חדש'), isTrue);
    });

    test('a failed read falls back to the const set and can retry later',
        () async {
      appBackend = _ThrowingZoomBackend();
      expect(await zoomSupportedProviders(), kZoomSupportedProviders);

      // Later attempt with a healthy backend hydrates the live set.
      appBackend = _ZoomBackend({'ספק חדש'});
      expect(await zoomSupportedProviders(), {'ספק חדש'});
    });

    test('resetZoomProviderCacheForTest clears the session cache', () async {
      appBackend = _ZoomBackend({'ספק חדש'});
      await zoomSupportedProviders();
      expect(providerSupportsZoom('ספק חדש'), isTrue);

      resetZoomProviderCacheForTest();
      expect(providerSupportsZoom('ספק חדש'), isFalse); // fallback again
      expect(providerSupportsZoom('בזק'), isTrue);
    });
  });
}
