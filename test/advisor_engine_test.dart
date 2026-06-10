import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';
import 'package:chosech/services/advisor_engine.dart';

/// Convenience: respond with a default (empty) context unless one is supplied.
AdvisorReply ask(String text, {AdvisorContext? context}) =>
    AdvisorEngine.respondTo(text, context: context ?? const AdvisorContext());

void main() {
  group('category keyword detection', () {
    test('internet keywords map to internet', () {
      for (final q in ['אינטרנט ביתי', 'רוצה סיב אופטי', 'ראוטר חדש', 'internet בבית', 'ברודבנד מהיר']) {
        expect(ask(q).category, 'internet', reason: q);
      }
    });

    test('tv keywords map to tv', () {
      for (final q in ['טלוויזיה עם ערוצים', 'חבילת כבלים', 'לוויין yes', 'נטפליקס וספורט']) {
        expect(ask(q).category, 'tv', reason: q);
      }
    });

    test('abroad keywords map to abroad', () {
      for (final q in ['חבילה לחו"ל', 'נסיעה לאירופה', 'esim לטיול', 'רואמינג באמריקה']) {
        expect(ask(q).category, 'abroad', reason: q);
      }
    });

    test('triple keywords map to triple', () {
      for (final q in ['חבילה משולבת לבית', 'triple כולל הכל', 'טריפל ביתי', 'פקיג מלא']) {
        expect(ask(q).category, 'triple', reason: q);
      }
    });

    test('a plain cellular ask defaults to cellular', () {
      expect(ask('מסלול סלולר טוב').category, 'cellular');
    });

    test('category precedence: internet wins over the tv/abroad branches', () {
      // 'אינטרנט' is checked first, so it dominates even if other words appear.
      expect(ask('אינטרנט עם ספורט').category, 'internet');
    });
  });

  group('sort & filter detection', () {
    test('cheap keywords set price sort', () {
      for (final q in ['סלולר זול', 'הכי משתלם', 'תקציב נמוך', 'חסכוני בבקשה']) {
        expect(ask(q).sort, 'price', reason: q);
      }
    });

    test('5g keyword adds the 5g filter', () {
      expect(ask('רוצה 5g מהיר').filters, contains('5g'));
    });

    test('no-commit phrases add the nocommit filter', () {
      for (final q in ['ללא התחייבות', 'בלי התחייבות', 'אפשר לצאת בכל רגע']) {
        expect(ask(q).filters, contains('nocommit'), reason: q);
      }
    });

    test('fiber keyword adds the fiber filter', () {
      expect(ask('אינטרנט סיב אופטי').filters, contains('fiber'));
    });

    test('1000/גיגה adds 1g only in the internet category', () {
      expect(ask('אינטרנט 1000').filters, contains('1g'));
      // Same number in a cellular ask must NOT add the internet-only 1g filter.
      expect(ask('סלולר 1000 דקות').filters, isNot(contains('1g')));
    });

    test('sport adds the sport filter only for tv', () {
      expect(ask('טלוויזיה עם ספורט').filters, contains('sport'));
    });

    test('netflix adds the netflix filter for tv/triple', () {
      expect(ask('טלוויזיה עם נטפליקס').filters, contains('netflix'));
      expect(ask('חבילה משולבת עם netflix').filters, contains('netflix'));
    });
  });

  group('budget regex extraction', () {
    test('"עד 50 שקל" extracts 50', () {
      expect(ask('סלולר עד 50 שקל').budgetHint, 50);
    });

    test('"₪50" (shekel prefix) extracts 50', () {
      expect(ask('משהו ב-₪50').budgetHint, 50);
    });

    test('"50₪" (shekel suffix) extracts 50', () {
      expect(ask('עד 50₪ בלבד').budgetHint, 50);
    });

    test('"פחות מ-60" extracts 60', () {
      expect(ask('5G בפחות מ-60').budgetHint, 60);
    });

    test('no number → null budget', () {
      expect(ask('סלולר זול').budgetHint, isNull);
    });
  });

  group('provider & comparison detection', () {
    test('a single provider alias is detected and canonicalised', () {
      expect(ask('מה יש בגולן').detectedProvider, 'גולן טלקום');
      expect(ask('hot mobile').detectedProvider, 'הוט מובייל');
    });

    test('two providers + a comparison word flag a comparison', () {
      final r = ask('עדיף פרטנר או סלקום');
      expect(r.isComparison, isTrue);
      expect(r.detectedProvider, 'פרטנר');
      expect(r.detectedProvider2, 'סלקום');
    });
  });

  group('intent classification', () {
    test('greeting', () {
      final r = ask('שלום');
      expect(r.intent, AdvisorIntent.greeting);
      expect(r.text, contains('חוסך AI'));
      expect(r.planIds, isEmpty);
    });

    test('thanks', () {
      final r = ask('תודה רבה');
      expect(r.intent, AdvisorIntent.thanks);
      expect(r.text, contains('בשמחה'));
    });

    test('recommend intent returns a recommended plan + reply', () {
      final r = ask('מה הכי משתלם לי בסלולר',
          context: const AdvisorContext(bills: {'cellular': 150}));
      expect(r.intent, AdvisorIntent.recommend);
      expect(r.category, 'cellular');
      expect(r.planIds, hasLength(1));
      expect(r.text, contains('הממליץ החכם'));
    });

    test('recommend intent falls back to the selected category', () {
      final r = ask('תמליץ לי',
          context: const AdvisorContext(selectedCat: 'internet'));
      expect(r.intent, AdvisorIntent.recommend);
      expect(r.category, 'internet');
    });

    test('purchase intent recommends and surfaces the lead CTA', () {
      final r = ask('רוצה להצטרף לסלולר');
      expect(r.intent, AdvisorIntent.purchase);
      expect(r.planIds, hasLength(1));
      expect(r.text, contains('דבר עם נציג'));
    });

    test('price intent asks which service', () {
      final r = ask('כמה זה עולה');
      expect(r.intent, AdvisorIntent.price);
      expect(r.text, contains('איזה שירות'));
    });

    test('plans intent: a feature ask returns up to 3 matching plans', () {
      final r = ask('סלולר זול ללא התחייבות');
      expect(r.intent, AdvisorIntent.plans);
      expect(r.planIds, isNotEmpty);
      expect(r.planIds.length, lessThanOrEqualTo(3));
    });

    test('no-match path returns the unknown fallback', () {
      final r = ask('אבגדהוזחט קשקוש לורם איפסום');
      expect(r.intent, AdvisorIntent.unknown);
      expect(r.text, contains('לא הצלחתי להבין'));
      expect(r.planIds, isEmpty);
    });
  });

  group('filter pipeline narrows correctly', () {
    test('5g filter yields only 5G plans', () {
      final r = ask('סלולר 5g');
      expect(r.planIds, isNotEmpty);
      for (final id in r.planIds) {
        expect(planById(id)!.is5G, isTrue);
      }
    });

    test('nocommit filter yields only no-commitment plans', () {
      final r = ask('סלולר ללא התחייבות');
      expect(r.planIds, isNotEmpty);
      for (final id in r.planIds) {
        expect(planById(id)!.noCommit, isTrue);
      }
    });

    test('budget filter excludes plans above the ceiling (when any fit)', () {
      // Pick a low ceiling that still has matches in cellular.
      const ceiling = 40;
      final hasCheap = plansByCat('cellular').any((p) => p.price <= ceiling);
      final r = ask('סלולר עד $ceiling שקל');
      expect(r.budgetHint, ceiling);
      if (hasCheap) {
        for (final id in r.planIds) {
          expect(planById(id)!.price, lessThanOrEqualTo(ceiling));
        }
      }
    });

    test('comparison narrows to the two named providers and returns up to 4', () {
      final r = ask('עדיף פרטנר או סלקום');
      expect(r.isComparison, isTrue);
      expect(r.planIds, isNotEmpty);
      expect(r.planIds.length, lessThanOrEqualTo(4));
      for (final id in r.planIds) {
        final prov = planById(id)!.provider;
        expect(prov == 'פרטנר' || prov == 'סלקום', isTrue, reason: prov);
      }
    });

    test('price sort returns the cheapest plan first', () {
      final r = ask('סלולר זול');
      expect(r.planIds, isNotEmpty);
      final prices = r.planIds.map((id) => planById(id)!.price).toList();
      for (var i = 0; i < prices.length - 1; i++) {
        expect(prices[i], lessThanOrEqualTo(prices[i + 1]));
      }
    });
  });

  group('rating intent', () {
    test('provider rating uses the pure catalogue fallback', () {
      final r = ask('מה הדירוג של פרטנר');
      expect(r.intent, AdvisorIntent.rating);
      expect(r.detectedProvider, 'פרטנר');
      final expected = AdvisorProviderRating.fromCatalogue('פרטנר');
      expect(r.text, contains(expected.stars.toStringAsFixed(1)));
      // All four Hebrew sub-labels appear.
      for (final label in AdvisorProviderRating.subLabels.values) {
        expect(r.text, contains(label));
      }
    });

    test('provider rating honours an injected lookup', () {
      const fakeStars = 4.9;
      final r = ask(
        'דירוג של פרטנר',
        context: AdvisorContext(
          ratingLookup: (p) => AdvisorProviderRating(
            provider: p,
            stars: fakeStars,
            reviewCount: 12345,
            sub: const {'price': 5, 'service': 5, 'coverage': 5, 'speed': 5},
          ),
        ),
      );
      expect(r.text, contains('4.9'));
      expect(r.text, contains('12345'));
    });

    test('leaderboard rating without a provider lists top providers', () {
      final r = ask('מי הספק הכי מדורג');
      expect(r.intent, AdvisorIntent.rating);
      expect(r.detectedProvider, isNull);
      expect(r.text, contains('המדורגים ביותר'));
    });
  });

  group('context-backed branches', () {
    test('current-bill branch lists saved bills', () {
      final r = ask('כמה אני משלם',
          context: const AdvisorContext(bills: {'cellular': 119, 'internet': 140}));
      expect(r.intent, AdvisorIntent.currentBill);
      expect(r.text, contains('119'));
      expect(r.text, contains('140'));
    });

    test('current-bill branch nudges to set bills when none saved', () {
      final r = ask('כמה אני משלם');
      expect(r.intent, AdvisorIntent.currentBill);
      expect(r.text, contains('לא הגדרת'));
    });

    test('savings branch reads precomputed opportunities from context', () {
      final r = ask('כמה אחסוך',
          context: const AdvisorContext(savings: [
            AdvisorSaving(categoryId: 'cellular', annualSaving: 960, bestProvider: 'גולן טלקום'),
          ]));
      expect(r.intent, AdvisorIntent.savings);
      expect(r.text, contains('960'));
      expect(r.text, contains('גולן טלקום'));
    });

    test('savings branch with no opportunities nudges to set bills', () {
      final r = ask('כמה אחסוך');
      expect(r.intent, AdvisorIntent.savings);
      expect(r.text, contains('לא הגדרת'));
    });

    test('watchlist branch lists watched plans', () {
      final firstId = allPlans.first.id;
      final r = ask('מסלולים שמרתי',
          context: AdvisorContext(watchedPlanIds: [firstId]));
      expect(r.intent, AdvisorIntent.watchlist);
      expect(r.text, contains(allPlans.first.provider));
    });

    test('watchlist branch when empty prompts to follow plans', () {
      final r = ask('רשימת מעקב שלי');
      expect(r.intent, AdvisorIntent.watchlist);
      expect(r.text, contains('אין לך מסלולים במעקב'));
    });
  });

  group('AdvisorProviderRating.fromCatalogue', () {
    test('averages real catalogue data; placeholder-only providers score 0', () {
      final r = AdvisorProviderRating.fromCatalogue('פרטנר');
      final plans = plansByProvider('פרטנר');
      final expected = plans.fold<double>(0, (s, p) => s + p.rating) / plans.length;
      expect(r.stars, closeTo(expected, 0.0001));
      expect(r.reviewCount, plans.fold<int>(0, (s, p) => s + p.reviews));
    });

    test('an unknown provider has zero stars', () {
      expect(AdvisorProviderRating.fromCatalogue('לא-קיים').stars, 0);
    });
  });
}
