import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/pages/community/community_widget.dart';

/// Channel-string tests for the community feed.
///
/// `community_posts.channel` is a plain TEXT column with no constraint, and
/// every surface filters it with an exact string compare. The Hebrew label IS
/// the key, so a single divergent codepoint partitions the community silently:
/// posts filed from the app land in a channel the web's filter never matches,
/// and the feed just says "אין עדיין פוסטים בערוץ הזה". Nothing errors.
///
/// That is precisely what shipped — the app spelled abroad 'חו"ל' with an ASCII
/// quote (U+0022) while web/lib/community.ts wrote 'חו״ל' with the Hebrew
/// GERSHAYIM (U+05F4). The two are near-indistinguishable on screen.
///
/// So these tests compare RUNES, not strings, and they build the "wrong"
/// spelling from explicit codepoints rather than pasting it. A test that
/// pasted the label, or that only asserted rendered text, would have passed
/// with the wrong quote in place — which is why the bug survived this long.
void main() {
  /// Renders a string as its codepoints, e.g. "U+05D7 U+05D5 U+05F4 U+05DC".
  String cps(String s) => s.runes
      .map((r) => 'U+${r.toRadixString(16).toUpperCase().padLeft(4, '0')}')
      .join(' ');

  /// The abroad channel, spelled canonically: ח ו ״ ל.
  final abroadCanonical =
      String.fromCharCodes([0x05D7, 0x05D5, 0x05F4, 0x05DC]);

  // ── The regression itself ──────────────────────────────────────────────────

  group('canonical channel codepoints', () {
    test('the abroad channel uses GERSHAYIM U+05F4, never an ASCII quote', () {
      final abroad = kCommunityChannels.firstWhere((c) => c.startsWith('חו'));
      expect(abroad.runes.toList(), abroadCanonical.runes.toList(),
          reason: 'abroad channel is ${cps(abroad)}, '
              'expected ${cps(abroadCanonical)}');
    });

    test('no channel string contains an ASCII quote or apostrophe', () {
      // U+0022 is the exact look-alike that split the community; U+0027 is the
      // other one (the Hebrew geresh ׳ is U+05F3).
      for (final ch in kCommunityChannels) {
        expect(ch.runes.contains(0x0022), isFalse,
            reason: 'channel "$ch" (${cps(ch)}) contains ASCII quote U+0022');
        expect(ch.runes.contains(0x0027), isFalse,
            reason: 'channel "$ch" (${cps(ch)}) contains ASCII apostrophe U+0027');
      }
    });

    test('the "all" sentinel is not a storable channel', () {
      expect(kCommunityChannels.contains(kAllChannel), isFalse);
      expect(kAllChannel.runes.toList(), [0x05D4, 0x05DB, 0x05DC]); // ה כ ל
    });
  });

  // ── Parity with the web, which is the source of truth ──────────────────────

  group('parity with web/lib/community.ts CHANNELS', () {
    /// Pulls the CHANNELS array out of the TypeScript source. Read from disk on
    /// purpose: a test that restated the labels inline could drift in lockstep
    /// with the code it is supposed to pin.
    List<String> webChannels() {
      final f = File('web/lib/community.ts');
      expect(f.existsSync(), isTrue,
          reason: 'web/lib/community.ts is the source of truth for channel '
              'spellings and must exist');
      final src = f.readAsStringSync();
      final block = RegExp(r'export const CHANNELS\s*=\s*\[(.*?)\]')
          .firstMatch(src.replaceAll('\n', ''));
      expect(block, isNotNull,
          reason: 'could not locate `export const CHANNELS = [...]`');
      return RegExp('"([^"]*)"')
          .allMatches(block!.group(1)!)
          .map((m) => m.group(1)!)
          .toList();
    }

    String webAllChannel() {
      final src = File('web/lib/community.ts').readAsStringSync();
      final m = RegExp('export const ALL_CHANNEL\\s*=\\s*"([^"]*)"').firstMatch(src);
      expect(m, isNotNull, reason: 'could not locate ALL_CHANNEL');
      return m!.group(1)!;
    }

    test('the parse found a real, non-empty list (guards a vacuous test)', () {
      final web = webChannels();
      expect(web, isNotEmpty);
      expect(web.length, greaterThanOrEqualTo(5));
    });

    test('kCommunityChannels matches CHANNELS rune for rune, in order', () {
      final web = webChannels();

      expect(kCommunityChannels.length, web.length,
          reason: 'channel count drifted: app has ${kCommunityChannels.length}, '
              'web has ${web.length}');

      for (var i = 0; i < web.length; i++) {
        // Codepoints, not strings — this is the assertion a quote swap must
        // not survive.
        expect(kCommunityChannels[i].runes.toList(), web[i].runes.toList(),
            reason: 'channel #$i: app ${cps(kCommunityChannels[i])} '
                'vs web ${cps(web[i])}');
      }
    });

    test('ALL_CHANNEL matches rune for rune', () {
      final web = webAllChannel();
      expect(kAllChannel.runes.toList(), web.runes.toList(),
          reason: 'app ${cps(kAllChannel)} vs web ${cps(web)}');
    });
  });

  // ── The repair table for rows already written the old way ──────────────────

  group('legacy variant repair', () {
    test('the spelling this app used to WRITE folds onto the canonical one', () {
      // Built from codepoints so this test cannot be "fixed" by pasting the
      // canonical spelling over it.
      final shipped = String.fromCharCodes([0x05D7, 0x05D5, 0x0022, 0x05DC]);
      expect(shipped, isNot(abroadCanonical),
          reason: 'the two spellings must genuinely differ, '
              'else this test proves nothing');
      expect(canonicalChannel(shipped).runes.toList(),
          abroadCanonical.runes.toList());
    });

    test('the unpunctuated spelling folds too', () {
      final bare = String.fromCharCodes([0x05D7, 0x05D5, 0x05DC]); // חול
      expect(canonicalChannel(bare).runes.toList(), abroadCanonical.runes.toList());
    });

    test('canonical channels are fixed points of the fold', () {
      for (final ch in kCommunityChannels) {
        expect(canonicalChannel(ch), ch);
      }
      expect(canonicalChannel(kAllChannel), kAllChannel);
    });

    test('an unknown channel passes through unchanged, never guessed at', () {
      expect(canonicalChannel('ערוץ שלא קיים'), 'ערוץ שלא קיים');
    });

    test('every legacy variant maps to a real channel and is not itself one', () {
      for (final entry in kLegacyChannelVariants.entries) {
        expect(kCommunityChannels.contains(entry.value), isTrue,
            reason: '"${entry.key}" folds to "${entry.value}", not a channel');
        // A variant that was ALSO canonical would make the fold a silent no-op
        // hiding a real divergence.
        expect(kCommunityChannels.contains(entry.key), isFalse,
            reason: '"${entry.key}" is both a variant and a canonical channel');
      }
    });
  });

  // ── The shared list, once the other surfaces adopt it ──────────────────────

  group('shared/community-channels.json', () {
    final f = File('shared/community-channels.json');

    test('matches kCommunityChannels rune for rune', () {
      final j = jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
      final shared = (j['channels'] as List).cast<String>();
      expect(kCommunityChannels.length, shared.length);
      for (var i = 0; i < shared.length; i++) {
        expect(kCommunityChannels[i].runes.toList(), shared[i].runes.toList(),
            reason: 'channel #$i: app ${cps(kCommunityChannels[i])} '
                'vs shared ${cps(shared[i])}');
      }
      expect(kAllChannel.runes.toList(),
          (j['all_channel'] as String).runes.toList());
    });

    test('its legacy_variants fold the same way this file does', () {
      final j = jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
      final variants = (j['legacy_variants'] as Map).cast<String, dynamic>();
      expect(variants, isNotEmpty);
      for (final e in variants.entries) {
        expect(canonicalChannel(e.key).runes.toList(),
            (e.value as String).runes.toList(),
            reason: '${cps(e.key)} should fold to ${cps(e.value as String)}');
      }
    });
    // The shared list is owned by a sibling lane. Until it lands these two are
    // skipped rather than failing this lane; the web-parity group above is the
    // hard gate either way, and it pins the same spellings.
  }, skip: File('shared/community-channels.json').existsSync()
      ? false
      : 'shared/community-channels.json not present yet');

  // ── Search folds BOTH sides ────────────────────────────────────────────────
  // The feed filter, the highlights tally and the post chip all folded through
  // canonicalChannel; SEARCH compared the raw column, so the two abroad
  // spellings returned different result sets — a member typing the spelling
  // this very app shipped until today found nothing.
  group('channel search is spelling-blind', () {
    const shipped = 'חו"ל'; // U+0022 — what the app used to write
    const canonical = 'חו״ל'; // U+05F4 — the canonical spelling

    // The comparison the widget performs, both sides folded.
    bool matches(String storedChannel, String query) => canonicalChannel(storedChannel)
        .toLowerCase()
        .contains(canonicalChannel(query).toLowerCase());

    test('either spelling of the query finds either spelling of the post', () {
      for (final stored in [shipped, canonical]) {
        for (final typed in [shipped, canonical]) {
          expect(matches(stored, typed), isTrue,
              reason: 'stored ${cps(stored)} should match query ${cps(typed)}');
        }
      }
    });

    test('folding only ONE side would still miss — the bug this replaced', () {
      // Raw stored value vs folded query: a post kept under the ASCII spelling
      // is invisible to the canonical query. Pinning the old behaviour as WRONG
      // so nobody "simplifies" the fold back to one side.
      final oneSided =
          shipped.toLowerCase().contains(canonicalChannel(canonical).toLowerCase());
      expect(oneSided, isFalse);
    });
  });
}
