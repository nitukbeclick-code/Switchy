import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/models.dart';

/// Unit tests for the category-aware display helpers on [Plan]
/// (`categoryFields()` + `perksList()`) — the Dart mirror of the web
/// `web/lib/plan-display.ts` `planFieldsForCategory` / `perks`.
///
/// Plans are constructed inline (never read from the catalogue) so these tests
/// pin the helpers' behaviour independently of the data, exactly like
/// data_test.dart. Truth-only is the headline contract: present fields are
/// included, absent ones are omitted — nothing fabricated.
void main() {
  // Convenience builder with sane required defaults.
  Plan plan({
    required String cat,
    Map<String, String> specs = const {},
    Map<String, String> fees = const {},
    List<String> feats = const [],
    List<String> flags = const [],
    List<String> fineLines = const [],
    String? notes,
  }) =>
      Plan(
        id: 't',
        cat: cat,
        provider: 'x',
        net: '4G',
        plan: 'p',
        price: 50,
        specs: specs,
        fees: fees,
        feats: feats,
        flags: flags,
        fineLines: fineLines,
        notes: notes,
      );

  List<String> labels(Plan p) => p.categoryFields().map((f) => f.label).toList();
  String? valueOf(Plan p, String label) {
    for (final f in p.categoryFields()) {
      if (f.label == label) return f.value;
    }
    return null;
  }

  // ── categoryFields: per-category ordering + presence ────────────────────────

  group('categoryFields — cellular', () {
    test('ordered דמי חיבור, נפח, דקות/SMS, חו״ל when all present', () {
      final p = plan(
        cat: 'cellular',
        fees: {'דמי חיבור': 'אין'},
        specs: {'נתונים': '100GB', 'דקות': 'ללא הגבלה', 'SMS': '1000', 'חו"ל': '✓'},
        flags: ['abroad'],
      );
      expect(labels(p), ['דמי חיבור', 'נפח', 'דקות/SMS', 'חו״ל']);
      expect(valueOf(p, 'דמי חיבור'), 'אין');
      expect(valueOf(p, 'נפח'), '100GB');
    });

    test('דקות/SMS combines דקות + SMS with a · separator', () {
      final p = plan(
        cat: 'cellular',
        specs: {'נתונים': '50GB', 'דקות': '300 דק׳', 'SMS': '5,000'},
      );
      expect(valueOf(p, 'דקות/SMS'), '300 דק׳ · 5,000 SMS');
    });

    test('דקות/SMS shows just דקות when SMS absent', () {
      final p = plan(cat: 'cellular', specs: {'דקות': 'ללא הגבלה'});
      expect(valueOf(p, 'דקות/SMS'), 'ללא הגבלה');
    });

    test('חו״ל only renders when the plan bundles abroad (hasAbroad flag)', () {
      final without = plan(cat: 'cellular', specs: {'נתונים': '20GB'});
      expect(labels(without).contains('חו״ל'), isFalse);

      final withFlag = plan(cat: 'cellular', flags: ['abroad']);
      expect(valueOf(withFlag, 'חו״ל'), '✓'); // tick when no explicit value

      final withValue =
          plan(cat: 'cellular', flags: ['abroad'], specs: {'חו"ל': '5GB'});
      expect(valueOf(withValue, 'חו״ל'), '5GB'); // explicit value preferred
    });

    test('absent fields are omitted (truth-only)', () {
      final p = plan(cat: 'cellular', specs: {'נתונים': '10GB'});
      expect(labels(p), ['נפח']); // no fee, no minutes, no abroad
    });
  });

  group('categoryFields — internet', () {
    test('ordered מהירות, נתב, מגדיל טווח, התקנה when all present', () {
      final p = plan(
        cat: 'internet',
        specs: {'מהירות': 'עד 1000/100'},
        fees: {'נתב': '+₪21.9/ח׳', 'מגדיל טווח': 'כלול', 'התקנה': 'נחושת ₪49'},
      );
      expect(labels(p), ['מהירות', 'נתב', 'מגדיל טווח', 'התקנה']);
      expect(valueOf(p, 'נתב'), '+₪21.9/ח׳');
      expect(valueOf(p, 'התקנה'), 'נחושת ₪49');
    });

    test('reads נתב from specs when it lives there (both-map reader)', () {
      // Real fiber plans store נתב in specs, not fees.
      final p = plan(
        cat: 'internet',
        specs: {'מהירות': 'עד 600/100', 'נתב': 'מגדיל טווח + נקודת רשת כלולים'},
      );
      expect(valueOf(p, 'נתב'), 'מגדיל טווח + נקודת רשת כלולים');
    });

    test('alt-keys: ראוטר→נתב, מרחיב טווח→מגדיל טווח, חיבור→התקנה', () {
      final p = plan(
        cat: 'internet',
        fees: {'ראוטר': '₪19/ח׳', 'מרחיב טווח': 'כלול', 'חיבור': '₪99'},
      );
      expect(valueOf(p, 'נתב'), '₪19/ח׳');
      expect(valueOf(p, 'מגדיל טווח'), 'כלול');
      expect(valueOf(p, 'התקנה'), '₪99');
    });

    test('omits absent equipment (truth-only)', () {
      final p = plan(cat: 'internet', specs: {'מהירות': 'עד 100/100'});
      expect(labels(p), ['מהירות']);
    });
  });

  group('categoryFields — tv / triple', () {
    test('tv: ordered ממיר, נתב, התקנה', () {
      final p = plan(
        cat: 'tv',
        fees: {'ממיר': 'ממיר 1', 'נתב': 'כלול', 'התקנה': 'מהיום להיום'},
      );
      expect(labels(p), ['ממיר', 'נתב', 'התקנה']);
      expect(valueOf(p, 'ממיר'), 'ממיר 1');
    });

    test('ממיר alt-key ממירים resolves (incl. from specs)', () {
      final p = plan(cat: 'triple', specs: {'ממירים': '2'});
      expect(valueOf(p, 'ממיר'), '2');
    });

    test('triple omits absent rows', () {
      final p = plan(cat: 'triple', fees: {'התקנה': 'חינם'});
      expect(labels(p), ['התקנה']);
    });
  });

  group('categoryFields — abroad', () {
    test('ordered נפח, תוקף', () {
      final p = plan(cat: 'abroad', specs: {'נתונים': '10GB', 'תוקף': '30 ימים'});
      expect(labels(p), ['נפח', 'תוקף']);
      expect(valueOf(p, 'נפח'), '10GB');
      expect(valueOf(p, 'תוקף'), '30 ימים');
    });

    test('alt-keys נפח→נתונים and ימים→תוקף', () {
      final p = plan(cat: 'abroad', specs: {'נפח': '5GB', 'ימים': '14'});
      expect(valueOf(p, 'נפח'), '5GB');
      expect(valueOf(p, 'תוקף'), '14');
    });

    test('omits absent (no fabricated rows)', () {
      final p = plan(cat: 'abroad', specs: {'נתונים': '3GB'});
      expect(labels(p), ['נפח']);
    });
  });

  test('blank/whitespace values are treated as absent', () {
    final p = plan(cat: 'internet', specs: {'מהירות': '   '}, fees: {'נתב': ''});
    expect(p.categoryFields(), isEmpty);
  });

  // ── perksList ───────────────────────────────────────────────────────────────

  group('perksList', () {
    test('drops raw spec-noise feats, keeps qualitative perks', () {
      final p = plan(
        cat: 'cellular',
        feats: ['5G', '1500GB גלישה', '300 דק׳', '1000 SMS', 'נתיב מהיר',
            'שירות תיקונים מורחב'],
      );
      // Noise (5G, *GB*, *דק*, *SMS*, leading-digit) filtered out.
      expect(p.perksList(), ['נתיב מהיר', 'שירות תיקונים מורחב']);
    });

    test('de-duplicates while preserving order', () {
      final p = plan(cat: 'cellular', feats: ['נטפליקס', 'נטפליקס', 'HBO']);
      expect(p.perksList(), ['נטפליקס', 'HBO']);
    });

    test('falls back to fineLines when no feats survive the filter', () {
      final p = plan(
        cat: 'cellular',
        feats: ['5G', '100GB גלישה'], // all noise
        fineLines: ['חריגה 49 אג׳/דק׳', 'מחיר רשמי'],
      );
      expect(p.perksList(), ['חריגה 49 אג׳/דק׳', 'מחיר רשמי']);
    });

    test('falls back to notes when no feats and no fineLines', () {
      final p = plan(cat: 'cellular', feats: ['5G'], notes: 'מבצע לחודש ראשון');
      expect(p.perksList(), ['מבצע לחודש ראשון']);
    });

    test('returns empty when nothing qualitative exists', () {
      final p = plan(cat: 'cellular', feats: ['5G', '50GB גלישה']);
      expect(p.perksList(), isEmpty);
    });

    test('a feat that merely contains a noise token (not at start) survives', () {
      // "כולל" doesn't match the noise regex; "גלישה חופשית" has no GB/דק/SMS.
      final p = plan(cat: 'internet', feats: ['גלישה חופשית באפליקציות']);
      expect(p.perksList(), ['גלישה חופשית באפליקציות']);
    });
  });
}
