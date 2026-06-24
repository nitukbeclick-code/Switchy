import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/switch_kit.dart';

void main() {
  group('switchServiceForCategory', () {
    test('cellular and abroad are portable (cellular) exits', () {
      expect(switchServiceForCategory('cellular'), SwitchService.cellular);
      expect(switchServiceForCategory('abroad'), SwitchService.cellular);
    });

    test('internet / tv / triple are fixed disconnects', () {
      expect(switchServiceForCategory('internet'), SwitchService.fixed);
      expect(switchServiceForCategory('tv'), SwitchService.fixed);
      expect(switchServiceForCategory('triple'), SwitchService.fixed);
    });
  });

  group('switchKitOfficialUrl', () {
    test('resolves a verified provider to its REAL official site', () {
      expect(switchKitOfficialUrl('פרטנר'), 'https://www.partner.co.il');
      expect(switchKitOfficialUrl('סלקום'), 'https://www.cellcom.co.il');
    });

    test('loose-matches a catalogue label to its base entry', () {
      // 'גולן טלקום' is the exact key; a bare 'גולן' must still resolve.
      expect(switchKitOfficialUrl('גולן'), 'https://www.golantelecom.co.il');
    });

    test('returns null (never fabricates) for an unknown provider', () {
      expect(switchKitOfficialUrl('אחר'), isNull);
      expect(switchKitOfficialUrl('ספק דמיוני'), isNull);
    });
  });

  group('buildSwitchSteps', () {
    test('a cellular kit includes the number-porting step, not a disconnect', () {
      final steps = buildSwitchSteps(
          providerName: 'פרטנר', service: SwitchService.cellular);
      final ids = steps.map((s) => s.id).toList();
      expect(ids, contains('port_number'));
      expect(ids, isNot(contains('notice')));
    });

    test('a fixed kit includes the written-notice step, not porting', () {
      final steps = buildSwitchSteps(
          providerName: 'בזק', service: SwitchService.fixed);
      final ids = steps.map((s) => s.id).toList();
      expect(ids, contains('notice'));
      expect(ids, isNot(contains('port_number')));
    });

    test('always carries the review-and-send-yourself step (never auto-send)', () {
      for (final svc in SwitchService.values) {
        final steps = buildSwitchSteps(providerName: 'סלקום', service: svc);
        expect(steps.map((s) => s.id), contains('send_letter'));
      }
    });
  });

  group('buildSwitchLetter', () {
    test('a cellular letter frames it as porting, with placeholders not fabricated PII', () {
      final letter = buildSwitchLetter(
        providerName: 'פרטנר',
        service: SwitchService.cellular,
        commitment: CommitmentStatus.none,
      );
      expect(letter, contains('ניוד מספר'));
      expect(letter, contains('מסלקת הניוד'));
      // We never invent the user's identity — placeholders remain.
      expect(letter, contains('[שם מלא]'));
      expect(letter, contains('[מספר טלפון]'));
    });

    test('commitment status changes the penalty clause honestly (no invented number)', () {
      final none = buildSwitchLetter(
          providerName: 'בזק',
          service: SwitchService.fixed,
          commitment: CommitmentStatus.none);
      expect(none, contains('ללא התחייבות'));

      final committed = buildSwitchLetter(
          providerName: 'בזק',
          service: SwitchService.fixed,
          commitment: CommitmentStatus.committed);
      expect(committed, contains('יתרת תקופת ההתחייבות'));
      // No fabricated shekel amount anywhere in the committed letter.
      expect(RegExp(r'₪\s*\d').hasMatch(committed), isFalse);
    });
  });

  group('buildSwitchKit', () {
    test('resolves a real official URL for a known provider', () {
      final kit = buildSwitchKit(providerName: 'סלקום', category: 'cellular');
      expect(kit.officialUrl, 'https://www.cellcom.co.il');
      expect(kit.service, SwitchService.cellular);
      expect(kit.disclaimer, switchKitDisclaimer);
      expect(kit.steps, isNotEmpty);
      expect(kit.rights, isNotEmpty);
    });

    test('leaves officialUrl null for an unverified provider (no fabrication)', () {
      final kit = buildSwitchKit(providerName: 'אחר', category: 'internet');
      expect(kit.officialUrl, isNull);
    });

    test('an explicit officialUrl overrides the lookup', () {
      final kit = buildSwitchKit(
        providerName: 'פרטנר',
        category: 'cellular',
        officialUrl: 'https://example.test',
      );
      expect(kit.officialUrl, 'https://example.test');
    });

    test('the disclaimer states it is not legal advice and not auto-sent', () {
      final kit = buildSwitchKit(providerName: 'פלאפון', category: 'cellular');
      expect(kit.disclaimer, contains('לא ייעוץ משפטי'));
      expect(kit.disclaimer, contains('בעצמכם'));
    });
  });

  group('SwitchProgress', () {
    SwitchProgress make({Set<String> done = const {}}) =>
        SwitchProgress(stepIds: const ['a', 'b', 'c'], doneIds: done);

    test('counts only ids that belong to the current kit (drops stale ids)', () {
      final p = SwitchProgress(
        stepIds: const ['a', 'b'],
        doneIds: const {'a', 'zzz_old'},
      );
      expect(p.completed, 1);
      expect(p.doneIds, {'a'});
    });

    test('fraction / percent track completion', () {
      expect(make().fraction, 0);
      expect(make(done: {'a'}).percent, 33);
      expect(make(done: {'a', 'b', 'c'}).percent, 100);
    });

    test('isComplete only when every step is done', () {
      expect(make(done: {'a', 'b'}).isComplete, isFalse);
      expect(make(done: {'a', 'b', 'c'}).isComplete, isTrue);
      // An empty checklist is never "complete".
      expect(SwitchProgress(stepIds: const [], doneIds: const {}).isComplete,
          isFalse);
    });

    test('nextStepId points at the first unfinished step, null when done', () {
      expect(make().nextStepId, 'a');
      expect(make(done: {'a'}).nextStepId, 'b');
      expect(make(done: {'a', 'b', 'c'}).nextStepId, isNull);
    });

    test('toggle flips a step and is a no-op for an unknown id', () {
      final p = make(done: {'a'});
      expect(p.toggle('b').doneIds, {'a', 'b'});
      expect(p.toggle('a').doneIds, isEmpty);
      expect(p.toggle('unknown').doneIds, {'a'});
    });

    test('cleared empties the done set', () {
      expect(make(done: {'a', 'b'}).cleared().doneIds, isEmpty);
    });
  });
}
