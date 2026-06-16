import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/services/advisor_engine.dart';

/// Convenience: respond with a default (empty) context unless one is supplied.
AdvisorReply ask(String text, {AdvisorContext? context}) =>
    AdvisorEngine.respondTo(text, context: context ?? const AdvisorContext());

void main() {
  // The buildUserContext group below reads a live AppState (bills, quiz,
  // tracked + watched plans), which is backed by SharedPreferences. The binding
  // + mock prefs + a fresh singleton per test keep those cases isolated; the
  // pure respondTo() tests above ignore all of this.
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

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
    test('provider rating reports an honest no-data state (reviews == 0)', () {
      final r = ask('מה הדירוג של פרטנר');
      expect(r.intent, AdvisorIntent.rating);
      expect(r.detectedProvider, 'פרטנר');
      // No catalogue plan has real reviews, so the advisor must NOT print a
      // fabricated 0.0★ rating — it shows the honest "no ratings yet" message.
      expect(AdvisorProviderRating.fromCatalogue('פרטנר').reviewCount, 0);
      expect(r.text, contains('אין עדיין דירוגים'));
      expect(r.text, contains('פרטנר'));
      expect(r.text, isNot(contains('★')));
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
    // Every catalogue plan ships with reviews == 0, so its `rating` field is a
    // fabricated placeholder. An honest catalogue rating must therefore report
    // no data for every provider until a real review exists — never average a
    // placeholder into a star, and never invent the per-dimension sub-scores.
    test('an unrated provider reports no data: 0 stars, 0 reviews, no sub-scores', () {
      final r = AdvisorProviderRating.fromCatalogue('פרטנר');
      // No plan has real reviews → nothing to average → 0 stars.
      expect(plansByProvider('פרטנר'), isNotEmpty);
      expect(plansByProvider('פרטנר').every((p) => p.reviews == 0), isTrue);
      expect(r.stars, 0);
      expect(r.reviewCount, 0);
      // Sub-scores are zeroed, not seeded from provider.codeUnits.
      for (final k in AdvisorProviderRating.subKeys) {
        expect(r.sub[k], 0, reason: k);
      }
    });

    test('agrees with the provider profile: no data ⇒ 0 stars / 0 reviews', () {
      // The advisor fallback must mirror the honest single-source-of-truth
      // (ProviderRatings.forProvider): with every plan unrated, the provider
      // has no data, so the advisor reports exactly what the profile would —
      // 0 stars and 0 reviews. (Asserted directly rather than importing
      // ProviderRatings, which drags in AppState/SharedPreferences.)
      final advisor = AdvisorProviderRating.fromCatalogue('סלקום');
      expect(plansByProvider('סלקום'), isNotEmpty);
      expect(plansByProvider('סלקום').every((p) => p.reviews == 0), isTrue);
      expect(advisor.stars, 0);
      expect(advisor.reviewCount, 0);
    });

    test('an unknown provider has zero stars and no invented sub-scores', () {
      final r = AdvisorProviderRating.fromCatalogue('לא-קיים');
      expect(r.stars, 0);
      expect(r.reviewCount, 0);
      for (final k in AdvisorProviderRating.subKeys) {
        expect(r.sub[k], 0, reason: k);
      }
    });
  });

  group('buildUserContext', () {
    // A future-dated promo so daysUntilRenewal is a stable positive number,
    // independent of when the suite runs.
    String futureDate(int daysAhead) {
      final d = DateTime.now().add(Duration(days: daysAhead));
      return '${d.year.toString().padLeft(4, '0')}-'
          '${d.month.toString().padLeft(2, '0')}-'
          '${d.day.toString().padLeft(2, '0')}';
    }

    test('a fresh, emptied profile reports "not set" on every line', () {
      final s = AppState();
      s.resetAllBills();
      final ctx = AdvisorEngine.buildUserContext(s);

      // Bills: no non-zero category → the explicit "not defined" line, no ₪.
      expect(ctx, contains('חשבונות נוכחיים: לא הוגדרו עדיין'));
      expect(ctx, isNot(contains('₪')));
      // Quiz not completed, no tracked plans.
      expect(ctx, contains('שאלון העדפות: לא הושלם עדיין'));
      expect(ctx, contains('תוכניות עקובות: אין'));
      // No watched plans → that optional line is omitted entirely.
      expect(ctx, isNot(contains('מסלולים במעקב מחיר')));
    });

    test('multi-category bills render with their Hebrew labels and ₪ amounts',
        () {
      final s = AppState();
      s.resetAllBills();
      s.setCurrentBill('cellular', 119);
      s.setCurrentBill('internet', 140);
      s.setCurrentBill('tv', 130);
      final ctx = AdvisorEngine.buildUserContext(s);

      expect(ctx, contains('חשבונות נוכחיים:'));
      expect(ctx, contains('סלולר ₪119'));
      expect(ctx, contains('אינטרנט ₪140'));
      expect(ctx, contains('טלוויזיה ₪130'));
      // A zeroed category must NOT appear.
      expect(ctx, isNot(contains('חו"ל ₪')));
      expect(ctx, isNot(contains('לא הוגדרו עדיין')));
    });

    test('a completed quiz surfaces category, budget, priority, needs & lines',
        () {
      final s = AppState();
      s.setQuizCompleted(true);
      s.setQuizCat('internet');
      s.setQuizBudget(180);
      s.setQuizPriority('speed');
      s.setQuizLines(3);
      s.setQuizNeeds(wants5G: true, wantsAbroad: false, wantsNoCommit: true);
      final ctx = AdvisorEngine.buildUserContext(s);

      expect(ctx, isNot(contains('שאלון העדפות: לא הושלם')));
      expect(ctx, contains('מחפש: אינטרנט'));
      expect(ctx, contains('תקציב עד ₪180'));
      expect(ctx, contains('עדיפות: מהירות'));
      // Needs join the wanted ones only (5G + nocommit), abroad omitted.
      expect(ctx, contains('5G'));
      expect(ctx, contains('ללא התחייבות'));
      expect(ctx, isNot(contains('עדיפויות: חו"ל')));
      // quizLines > 1 emits its own line.
      expect(ctx, contains('מספר קווים: 3'));
    });

    test('a single-line quiz omits the "מספר קווים" line', () {
      final s = AppState();
      s.setQuizCompleted(true);
      s.setQuizCat('cellular');
      s.setQuizLines(1);
      final ctx = AdvisorEngine.buildUserContext(s);
      expect(ctx, contains('מחפש: סלולר'));
      expect(ctx, isNot(contains('מספר קווים')));
    });

    test('tracked plans (renewal radar) list provider, plan & renewal countdown',
        () {
      final s = AppState();
      s.addMyPlan(
        category: 'cellular',
        provider: 'גולן טלקום',
        planName: 'אנלימיטד',
        monthlyPrice: 39,
        promoEndDate: futureDate(30),
      );
      final ctx = AdvisorEngine.buildUserContext(s);

      expect(ctx, isNot(contains('תוכניות עקובות: אין')));
      expect(ctx, contains('תוכניות עקובות:'));
      expect(ctx, contains('גולן טלקום — אנלימיטד ₪39/סלולר'));
      // Future promo → a "renews in N days" note.
      expect(ctx, contains('מתחדש בעוד 30 ימים'));
    });

    test('a tracked plan without a promo date omits the renewal note', () {
      final s = AppState();
      s.addMyPlan(
        category: 'tv',
        provider: 'yes',
        planName: 'בסיס',
        monthlyPrice: 99,
      );
      final ctx = AdvisorEngine.buildUserContext(s);
      expect(ctx, contains('yes — בסיס ₪99/טלוויזיה'));
      expect(ctx, isNot(contains('מתחדש בעוד')));
    });

    test('the watched-plans count line appears only when something is watched',
        () {
      final s = AppState();
      final first = allPlans.first.id;
      final second = allPlans[1].id;
      s.toggleWatch(first);
      s.toggleWatch(second);
      final ctx = AdvisorEngine.buildUserContext(s);
      expect(ctx, contains('מסלולים במעקב מחיר: 2'));
    });
  });

  group('generateContextualReply', () {
    // Two representative contexts: one with real bills (a ₪ figure and no
    // "not defined" marker) and one empty — exactly what buildUserContext emits.
    const withBills = 'חשבונות נוכחיים: סלולר ₪119, אינטרנט ₪140\n'
        'שאלון העדפות: לא הושלם עדיין\n'
        'תוכניות עקובות: אין';
    const empty = 'חשבונות נוכחיים: לא הוגדרו עדיין\n'
        'שאלון העדפות: לא הושלם עדיין\n'
        'תוכניות עקובות: אין';

    test('a savings question with bills echoes the profile and offers a calc',
        () {
      final reply =
          AdvisorEngine.generateContextualReply('כמה אני חוסך?', withBills);
      expect(reply, contains('לפי הפרופיל שלך'));
      expect(reply, contains('₪119'));
      expect(reply, contains('כמה אני חוסך'));
    });

    test('a savings question with no bills nudges to set the bills first', () {
      final reply =
          AdvisorEngine.generateContextualReply('כמה אפשר לחסוך?', empty);
      expect(reply, contains('צריך קודם להגדיר את החשבונות'));
      expect(reply, contains('החשבונות שלי'));
      expect(reply, isNot(contains('לפי הפרופיל שלך')));
    });

    test('a profile question renders the full context block', () {
      final reply = AdvisorEngine.generateContextualReply(
          'מה יש לי בפרופיל', withBills);
      expect(reply, contains('הנה הפרופיל שלך'));
      expect(reply, contains('₪119'));
      expect(reply, contains('מה הכי משתלם לי'));
    });

    test('an unmatched message with bills falls back to a profile-aware prompt',
        () {
      final reply =
          AdvisorEngine.generateContextualReply('בלהבלה לורם', withBills);
      expect(reply, contains('ראיתי את הפרופיל שלך'));
      expect(reply, contains('מה הכי משתלם לי?'));
    });

    test('an unmatched message with no bills falls back to the generic help',
        () {
      final reply =
          AdvisorEngine.generateContextualReply('בלהבלה לורם', empty);
      expect(reply, contains('לא הצלחתי להבין בדיוק'));
      expect(reply, isNot(contains('ראיתי את הפרופיל שלך')));
    });
  });
}
