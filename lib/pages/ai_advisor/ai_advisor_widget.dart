import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/plan_card/plan_card_widget.dart';
import '../../services/recommendation_engine.dart';
import '../../services/savings_summary.dart';
import '../../services/provider_ratings.dart';
import '../../services/backend/local_backend.dart';

class AIAdvisorWidget extends StatefulWidget {
  const AIAdvisorWidget({super.key});

  @override
  State<AIAdvisorWidget> createState() => _AIAdvisorWidgetState();
}

class _AIAdvisorWidgetState extends State<AIAdvisorWidget> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  bool _isTyping = false;
  late List<_ChatMsg> _messages;

  static const _providerNames = {
    'פלאפון': 'פלאפון', 'golan': 'גולן טלקום', 'גולן': 'גולן טלקום',
    'סלקום': 'סלקום', 'cellcom': 'סלקום',
    'פרטנר': 'פרטנר', 'partner': 'פרטנר',
    'הוט': 'הוט מובייל', 'hot': 'הוט מובייל',
    'רמי לוי': 'רמי לוי', 'rami': 'רמי לוי',
    'xphone': 'Xphone',
    'ויקום': 'ויקום', 'vcom': 'ויקום',
    '019': '019 מובייל',
    'וואלה': 'וואלה מובייל',
    'yes': 'yes', 'יס': 'yes',
    'בזק': 'בזק', 'bezeq': 'בזק',
    'airalo': 'Airalo eSIM',
    'freetv': 'FreeTV', 'פריtv': 'FreeTV',
  };

  List<_ChatMsg> _buildSeed() {
    final appState = AppState();
    final String greeting;
    if (appState.isLoggedIn && appState.firstName.isNotEmpty && appState.firstName != 'אורח') {
      greeting = 'שלום ${appState.firstName}! אני חוסך AI 🤖\nיועץ התקשורת החכם שלך.\n\nמה מחפשים?';
    } else {
      greeting = 'שלום! אני חוסך AI 🤖\nיועץ התקשורת החכם שלך.\n\nמה מחפשים?';
    }
    return [_ChatMsg(text: greeting, isUser: false, time: DateTime.now())];
  }

  @override
  void initState() {
    super.initState();
    final appState = AppState();
    final history = appState.advisorHistory;
    if (history.isNotEmpty) {
      _messages = history.map((m) => _ChatMsg(
        text: m['text'] as String,
        isUser: m['isUser'] as bool,
        time: DateTime.tryParse(m['ts'] as String? ?? '') ?? DateTime.now(),
      )).toList();
    } else {
      _messages = _buildSeed();
      appState.addAdvisorMessage(text: _messages.first.text, isUser: false);
    }
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _send(String text) async {
    if (text.trim().isEmpty || _isTyping) return;
    _inputCtrl.clear();
    final appState = Provider.of<AppState>(context, listen: false);
    appState.addAdvisorMessage(text: text, isUser: true);
    setState(() {
      _messages.add(_ChatMsg(text: text, isUser: true, time: DateTime.now()));
      _isTyping = true;
    });
    _scrollToBottom();

    final typingDelay = 800 + (text.length * 12).clamp(0, 800);
    await Future.delayed(Duration(milliseconds: typingDelay));

    final lower = text.toLowerCase();
    String cat = 'cellular';
    String sort = 'match';
    final List<String> filters = [];

    // Provider detection
    String? detectedProvider;
    String? detectedProvider2;
    for (final entry in _providerNames.entries) {
      if (lower.contains(entry.key)) {
        if (detectedProvider == null) {
          detectedProvider = entry.value;
        } else if (entry.value != detectedProvider) {
          detectedProvider2 = entry.value;
          break;
        }
      }
    }

    // Comparison detection
    final isComparison = lower.contains('עדיף') || lower.contains('השוואה') || lower.contains('לעומת') || lower.contains('השווה');

    // Category detection — extended Hebrew keyword set
    if (lower.contains('אינטרנט') || lower.contains('internet') || lower.contains('סיב') || lower.contains('רשת בית') || lower.contains('ברודבנד') || lower.contains('ראוטר') || lower.contains('mb') || lower.contains('gb אינטרנט')) {
      cat = 'internet';
    } else if (lower.contains('טלוויזיה') || lower.contains('tv') || lower.contains('ערוצים') || lower.contains('כבלים') || lower.contains('לוויין') || lower.contains('yes') || lower.contains('נטפליקס') || lower.contains('ספורט')) {
      cat = 'tv';
    } else if (lower.contains('חו"ל') || lower.contains('חול') || lower.contains('abroad') || lower.contains('נסיעה') || lower.contains('טיול') || lower.contains('esim') || lower.contains('eSIM') || lower.contains('אירופה') || lower.contains('אמריקה') || lower.contains('רואמינג')) {
      cat = 'abroad';
    } else if ((lower.contains('חבילה') && (lower.contains('משולב') || lower.contains('הכל') || lower.contains('ביתי') || lower.contains('כולל הכל'))) || lower.contains('triple') || lower.contains('פקיג') || lower.contains('טריפל')) {
      cat = 'triple';
    }

    // Sort & filter detection — extended
    if (lower.contains('זול') || lower.contains('מחיר נמוך') || lower.contains('הכי פחות') || lower.contains('בזול') || lower.contains('תקציב') || lower.contains('חסכוני') || lower.contains('משתלם') || lower.contains('פחות כסף')) sort = 'price';
    if (lower.contains('5g') || lower.contains('חמישה ג') || lower.contains('הכי מהיר')) filters.add('5g');
    if (lower.contains('ללא התחייבות') || lower.contains('בלי התחייבות') || lower.contains('גמישות') || lower.contains('חופשי') || lower.contains('לא מחויב') || lower.contains('אפשר לצאת')) filters.add('nocommit');
    if (lower.contains('סיב אופטי') || lower.contains('fiber') || lower.contains('סיב')) filters.add('fiber');
    if ((lower.contains('1000') || lower.contains('גיגה')) && cat == 'internet') filters.add('1g');
    if (lower.contains('ספורט') && cat == 'tv') filters.add('sport');
    if ((lower.contains('נטפליקס') || lower.contains('netflix')) && (cat == 'tv' || cat == 'triple')) filters.add('netflix');

    // Budget extraction — find any number preceded by ₪ or followed by ₪/שקל
    final budgetMatch = RegExp(r'₪\s?(\d+)|(\d+)\s?₪|(\d+)\s?שקל|פחות\s?מ\s?-?\s?(\d+)').firstMatch(lower);
    int? budgetHint;
    if (budgetMatch != null) {
      for (int i = 1; i <= budgetMatch.groupCount; i++) {
        final g = budgetMatch.group(i);
        if (g != null) { budgetHint = int.tryParse(g); break; }
      }
    }

    // Find top matching plans (up to 3)
    var plans = plansByCat(cat);
    if (filters.contains('5g')) plans = plans.where((p) => p.is5G).toList();
    if (filters.contains('nocommit')) plans = plans.where((p) => p.noCommit).toList();
    if (filters.contains('fiber')) plans = plans.where((p) => p.net == 'fiber').toList();
    if (filters.contains('1g')) plans = plans.where((p) => p.plan.contains('1000') || p.plan.contains('גיגה')).toList();
    if (filters.contains('sport')) { final f = plans.where((p) => p.feats.any((feat) => feat.contains('ספורט'))).toList(); if (f.isNotEmpty) plans = f; }
    if (filters.contains('netflix')) { final f = plans.where((p) => p.feats.any((feat) => feat.contains('Netflix'))).toList(); if (f.isNotEmpty) plans = f; }
    if (budgetHint != null) {
      final budgetFiltered = plans.where((p) => p.price <= budgetHint!).toList();
      if (budgetFiltered.isNotEmpty) plans = budgetFiltered;
    }

    // Provider filter
    if (isComparison && detectedProvider != null && detectedProvider2 != null) {
      plans = plans.where((p) => p.provider == detectedProvider || p.provider == detectedProvider2).toList();
    } else if (detectedProvider != null) {
      final provFiltered = plans.where((p) => p.provider == detectedProvider).toList();
      if (provFiltered.isNotEmpty) plans = provFiltered;
    }

    List<Plan> topPlans = [];
    if (plans.isNotEmpty) {
      if (sort == 'price') {
        plans.sort((a, b) => a.price.compareTo(b.price));
      } else {
        plans.sort((a, b) {
          if (a.highlight != b.highlight) return a.highlight ? -1 : 1;
          return b.rating.compareTo(a.rating);
        });
      }
      topPlans = plans.take(isComparison ? 4 : 3).toList();
    }

    // Build reply text
    String reply;
    final isGreeting = lower.contains('שלום') || lower.contains('היי') || lower.contains('hi') || lower.contains('hello') || lower.contains('הי') || lower.contains('מה שלום') || lower.contains('בוקר') || lower.contains('ערב');
    final isThanks = lower.contains('תודה') || lower.contains('תנקס') || lower.contains('thanks') || lower.contains('כייף') || lower.contains('סבבה');

    // Recommendation intent — "what's best for me / recommend"
    final isRecommendIntent = lower.contains('מה כדאי') || lower.contains('המלצה') || lower.contains('הכי משתלם') || lower.contains('מה הכי טוב') || lower.contains('תמליץ') || lower.contains('מה הכי') || lower.contains('מה כדאי לי') || lower.contains('recommend') || lower.contains('הכי טוב לי') || lower.contains('מה הכי משתלם') || lower.contains('✨ מה הכי משתלם');

    // Rating intent — "how is provider X rated / which provider is best rated"
    final isRatingIntent = lower.contains('דירוג') ||
        lower.contains('ביקורות') ||
        lower.contains('הכי מדורג') ||
        lower.contains('ספק הכי טוב') ||
        lower.contains('ספק מומלץ');

    // Purchase intent — user wants to act, not just browse
    final isPurchaseIntent = lower.contains('רוצה לעבור') || lower.contains('להצטרף') ||
        lower.contains('מצטרף') || lower.contains('מצטרפת') || lower.contains('תרשום') ||
        lower.contains('איך עוברים') || lower.contains('איך עובר') || lower.contains('איך עוברת') ||
        lower.contains('בפנים') || lower.contains('רוצה להצטרף') || lower.contains('רוצה להתחיל') ||
        lower.contains('מעוניין') || lower.contains('מעוניינת') || lower.contains('סגור עסקה');

    if (isRatingIntent) {
      if (detectedProvider != null) {
        final r = ProviderRatings.forProvider(detectedProvider);
        final subs = ProviderRatings.subKeys
            .map((k) => '• ${ProviderRatings.subLabels[k]}: ${r.sub[k]!.toStringAsFixed(1)}★')
            .join('\n');
        reply = '⭐ דירוג $detectedProvider: ${r.stars.toStringAsFixed(1)}★ (${r.reviewCount} ביקורות)\n\n$subs\n\nרוצה לראות את המסלולים של $detectedProvider? כתבו את שמו.';
      } else {
        final ranked = allProviders
            .map((p) => (name: p, stars: ProviderRatings.averageStars(p)))
            .where((e) => e.stars > 0)
            .toList()
          ..sort((a, b) => b.stars.compareTo(a.stars));
        final top = ranked.take(3).map((e) => '• ${e.name} — ${e.stars.toStringAsFixed(1)}★').join('\n');
        reply = '🏆 הספקים המדורגים ביותר:\n\n$top\n\nרוצה דירוג של ספק מסוים? כתבו את שמו.';
      }
    } else if (isRecommendIntent && detectedProvider == null) {
      // Determine category from text, fall back to selected
      String recCat = appState.selectedCat;
      if (lower.contains('אינטרנט') || lower.contains('internet')) {
        recCat = 'internet';
      } else if (lower.contains('טלוויזיה') || lower.contains('tv')) {
        recCat = 'tv';
      } else if (lower.contains('חו"ל') || lower.contains('חול') || lower.contains('abroad')) {
        recCat = 'abroad';
      } else if (lower.contains('משולב') || lower.contains('triple')) {
        recCat = 'triple';
      } else if (lower.contains('סלולר') || lower.contains('cellular') || lower.contains('פלאפון')) {
        recCat = 'cellular';
      }
      cat = recCat;

      final profile = _profileFor(recCat);
      // Score the category once; reuse for both the top pick and the alternative.
      final ranked = RecommendationEngine.rank(profile, limit: 2);
      final best = ranked.isEmpty ? null : ranked.first;
      if (best != null) {
        final unit = recCat == 'abroad' ? 'לחבילה' : 'לחודש';
        final catName = categoryById(recCat)?.name ?? recCat;
        final labelLine = '${best.label} — ${best.scorePct}%';
        final topReasons = best.reasons.take(3).map((r) => '• $r').join('\n');
        final savingLine = best.annualSaving > 0 ? '\n💰 חיסכון שנתי: ₪${best.annualSaving}' : '';
        final promoNote = best.plan.hasPromo ? '\n⚡ מחיר מבצע! לאחר המבצע: ₪${best.plan.after}/$unit' : '';

        // Alternative plan (reuses the ranking computed above)
        String altLine = '';
        if (ranked.length >= 2) {
          final alt = ranked[1];
          final altUnit = recCat == 'abroad' ? 'לחבילה' : 'לחודש';
          altLine = '\n\n🥈 אלטרנטיבה: ${alt.plan.provider} — ${alt.plan.plan} ₪${alt.plan.price}/$altUnit (${alt.label})';
        }

        reply = '✨ הממליץ החכם שלי בקטגורית $catName:\n\n'
            '🏆 ${best.plan.provider} — ${best.plan.plan}\n'
            '₪${best.plan.price}/$unit\n'
            '$labelLine\n'
            '$topReasons'
            '$savingLine'
            '$promoNote'
            '$altLine\n\n'
            'רוצה לראות פרטים? כתבו "הצג מסלול"';

        topPlans = [best.plan];
      } else {
        reply = 'לא מצאתי מסלולים בקטגוריה הנבחרת. נסו לציין קטגוריה: סלולר, אינטרנט, טלוויזיה, חו"ל.';
      }
    } else if (topPlans.isNotEmpty) {
      final currentBill = appState.currentBill(cat);
      final best = topPlans.first;
      final saveYear = ((currentBill - best.price) * 12).clamp(0, 999999);
      final catName = categoryById(cat)?.name ?? cat;
      final unit = best.cat == 'abroad' ? 'חבילה' : 'חודש';
      final promoNote = best.hasPromo ? '\n⚡ מחיר מבצע! לאחר המבצע: ₪${best.after}/$unit' : '';
      final commitNote = best.noCommit ? '\n✅ ללא התחייבות' : '\n📅 התחייבות ${best.term} חודשים';
      final savingsLine = saveYear > 0 ? '\n💰 חיסכון שנתי צפוי: ₪$saveYear' : '';
      final multiNote = topPlans.length > 1 ? '\n\nמצאתי ${topPlans.length} מסלולים — הנה הכי טוב:' : '\nמצאתי מסלול מעולה עבורך:';
      final planLine = '${best.plan} — ₪${best.price}/$unit';

      final replyPrefix = isComparison && detectedProvider != null && detectedProvider2 != null
          ? 'השוואה: $detectedProvider מול $detectedProvider2:'
          : detectedProvider != null
              ? 'מסלולי $detectedProvider:'
              : 'בקטגורית $catName:';

      reply = '$replyPrefix$multiNote\n$planLine$promoNote$commitNote$savingsLine';
    } else if (isGreeting) {
      reply = 'שלום! 🤖 אני חוסך AI — יועץ התקשורת החכם שלכם.\n\nאספר לי מה מחפשים ואמצא את המסלול הכי משתלם:\n\n📱 סלולר  🌐 אינטרנט  📺 טלוויזיה  ✈️ חו"ל';
    } else if (isThanks) {
      reply = 'בשמחה! 🙌 תמיד פה לעזור.\n\nאחרי שתחליטו, אפשר לסיים את המעבר כולל ניוד מספר ישירות דרך חוסך — בקלות ובלי עמלות נסתרות.';
    } else if (lower.contains('כמה') && (lower.contains('עולה') || lower.contains('עלות') || lower.contains('מחיר'))) {
      int minPrice(String c) => plansByCat(c).map((p) => p.price).fold(9999, (a, b) => a < b ? a : b);
      reply = 'אפשר לכוון אותך! 😊\n\nאיזה שירות אתם מחפשים?\n• 📱 סלולר — מ-₪${minPrice('cellular')}/חודש\n• 🌐 אינטרנט — מ-₪${minPrice('internet')}/חודש (מבצע)\n• 📺 טלוויזיה — מ-₪${minPrice('tv')}/חודש\n• 🏠 חבילה משולבת — מ-₪${minPrice('triple')}/חודש\n• ✈️ חו"ל — מ-₪${minPrice('abroad')}/חבילה\n\nספרו לי עם איזו קטגוריה ואמצא את הכי זול!';
    } else if (lower.contains('חשבון') || lower.contains('כמה אני משלם') || lower.contains('כמה משלם') || lower.contains('המחיר שלי') || lower.contains('נוכחי')) {
      final bills = ['cellular', 'internet', 'tv', 'triple', 'abroad'].where((c) => appState.currentBill(c) > 0);
      if (bills.isEmpty) {
        reply = 'לא הגדרת עדיין את החשבונות שלך.\nעבור לדף "החשבונות שלי" ↓ כדי להכניס כמה אתה משלם — ואמצא כמה תוכל לחסוך! 💡';
      } else {
        final names = {'cellular': 'סלולר', 'internet': 'אינטרנט', 'tv': 'טלוויזיה', 'triple': 'חבילה משולבת', 'abroad': 'חו"ל'};
        final lines = bills.map((c) => '• ${names[c]}: ₪${appState.currentBill(c)}').join('\n');
        reply = 'החשבונות השמורים שלך:\n$lines\n\nרוצה לבדוק כמה תחסוך בכל קטגוריה? אמור לי!';
      }
    } else if (lower.contains('כמה אחסוך') || lower.contains('חיסכון שלי') || lower.contains('כמה חוסך') || lower.contains('כמה אפשר לחסוך')) {
      // Use the same engine as the home hero / savings dashboard / bills, so the
      // advisor's answer never contradicts those screens.
      const names = {'cellular': 'סלולר', 'internet': 'אינטרנט', 'tv': 'טלוויזיה', 'triple': 'חבילה משולבת', 'abroad': 'חו"ל'};
      final savings = <String>[];
      for (final cs in computeSavings(appState).categories) {
        if (cs.annualSaving > 0 && cs.best != null) {
          savings.add('• ${names[cs.categoryId]}: ₪${cs.annualSaving}/שנה עם ${cs.best!.plan.provider}');
        }
      }
      if (savings.isEmpty) {
        reply = 'לא הגדרת חשבונות עדיין. עבור ל"החשבונות שלי" כדי להכניס כמה אתה משלם.';
      } else {
        reply = '💰 פוטנציאל החיסכון שלך:\n\n${savings.join('\n')}\n\nרוצה לראות פרטים על מסלול מסוים?';
      }
    } else if (lower.contains('רשימת מעקב') || lower.contains('מעקב שלי') || lower.contains('שמרתי') || lower.contains('מסלולים שמרתי')) {
      final watched = appState.watchedPlans;
      if (watched.isEmpty) {
        reply = 'אין לך מסלולים במעקב עדיין.\nכנס לדף פרטי מסלול ולחץ על 🔔 כדי לעקוב אחרי עדכוני מחיר!';
      } else {
        final plans = watched.map((id) => planById(id)).whereType<Plan>().take(5).toList();
        final lines = plans.map((p) => '• ${p.provider} — ${p.plan} ₪${p.price}').join('\n');
        reply = '🔔 מסלולים במעקב שלך:\n\n$lines\n\nרוצה שאמצא משהו יותר זול באחת הקטגוריות?';
      }
    } else if (isPurchaseIntent) {
      final profile = _profileFor(cat);
      final ranked = RecommendationEngine.rank(profile, limit: 1);
      final best = ranked.isEmpty ? null : ranked.first;
      if (best != null) {
        topPlans = [best.plan];
        final unit = cat == 'abroad' ? 'לחבילה' : 'לחודש';
        reply = '🎉 מעולה! אמצא לך את העסקה הכי טובה.\n\n'
            '🏆 ממליץ על ${best.plan.provider} — ${best.plan.plan} ₪${best.plan.price}/$unit\n\n'
            'לחץ "דבר עם נציג" למטה — שירות חינמי, ניוד מהיר! 👇';
      } else {
        reply = '😊 מעולה! אשמח לעזור לך לעבור.\nלאיזה קטגוריה אתה מחפש? סלולר, אינטרנט, טלוויזיה או חו"ל?';
      }
    } else {
      reply = 'לא הצלחתי להבין בדיוק. נסו לכתוב למשל:\n\n• "מצא סלולר זול ללא התחייבות"\n• "אינטרנט גיגה בזול"\n• "חבילת חו"ל לאירופה"\n• "5G בפחות מ-₪60"\n• "כמה אני חוסך"';
    }

    if (mounted) {
      appState.addAdvisorMessage(text: reply, isUser: false);
      setState(() {
        _isTyping = false;
        _messages.add(_ChatMsg(text: reply, isUser: false, time: DateTime.now(), planIds: topPlans.map((p) => p.id).toList(), cat: cat));
      });
      for (final p in topPlans) {
        appBackend.trackPlanView(planId: p.id, provider: p.provider, category: p.cat).catchError((_) {});
      }
    }
    _scrollToBottom();
  }

  MatchProfile _profileFor(String cat) => MatchProfile(
    category: cat,
    currentBill: AppState().currentBill(cat),
    budget: (AppState().quizCompleted && AppState().quizCat == cat) ? AppState().quizBudget : 0,
    priority: priorityFromId(AppState().quizPriority),
    lines: AppState().quizLines,
    wants5G: AppState().wants5G,
    wantsAbroad: AppState().wantsAbroad,
    wantsNoCommit: AppState().wantsNoCommit,
  );

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context, listen: false);

    final quickStarts = [
      '✨ מה הכי משתלם לי?',
      '📱 סלולר הכי זול',
      '🌐 אינטרנט 1000Mb',
      '✅ ללא התחייבות',
      '📶 5G מהיר',
      '✈️ חבילת חו"ל',
      '💰 פחות מ-₪50',
      '📺 טלוויזיה + ספורט',
      '🏠 חבילה משולבת',
      '🤝 רוצה להצטרף!',
      '💳 כמה אני משלם?',
      '💰 כמה אחסוך?',
    ];

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        flexibleSpace: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [ffTheme.primary, ffTheme.tertiary]),
          ),
        ),
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: ffTheme.secondary,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Center(child: Text('✦', style: TextStyle(fontSize: 16))),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('חוסך AI', style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(color: Color(0xFF4CAF50), shape: BoxShape.circle),
                    ).animate(onPlay: (c) => c.repeat(reverse: true))
                      .scale(begin: const Offset(1, 1), end: const Offset(1.3, 1.3), duration: 800.ms),
                    const SizedBox(width: 4),
                    Text('מחובר עכשיו', style: GoogleFonts.assistant(fontSize: 11, color: Colors.white70)),
                  ],
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_sweep_rounded),
            tooltip: 'נקה שיחה',
            onPressed: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: Text('נקה שיחה', style: AppTheme.of(context).titleMedium),
                  content: Text('לנקות את השיחה?', style: AppTheme.of(context).bodyMedium),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('ביטול')),
                    TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('נקה')),
                  ],
                ),
              );
              if (confirmed == true && mounted) {
                final appState = AppState();
                appState.clearAdvisorHistory();
                final seed = _buildSeed();
                appState.addAdvisorMessage(text: seed.first.text, isUser: false);
                setState(() { _messages = seed; });
              }
            },
          ),
        ],
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length + (_isTyping ? 1 : 0),
              itemBuilder: (ctx, i) {
                if (i == _messages.length && _isTyping) {
                  return _TypingBubble(ffTheme: ffTheme);
                }
                final msg = _messages[i];
                return _MessageBubble(msg: msg, ffTheme: ffTheme, bill: appState.currentBill(msg.cat));
              },
            ),
          ),

          // Quick start chips (when only greeting)
          if (_messages.length == 1)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  mainAxisSpacing: 6,
                  crossAxisSpacing: 6,
                  childAspectRatio: 2.6,
                ),
                itemCount: quickStarts.length,
                itemBuilder: (ctx, i) {
                  final q = quickStarts[i];
                  return GestureDetector(
                    onTap: () => _send(q),
                    child: Container(
                      alignment: Alignment.center,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: ffTheme.alternate),
                        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 4, offset: const Offset(0, 1))],
                      ),
                      child: Text(q, style: ffTheme.labelMedium, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                  );
                },
              ),
            ).animate().fadeIn(duration: 500.ms),

          // Input bar
          Container(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: ffTheme.alternate)),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, -4))],
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _inputCtrl,
                      textDirection: TextDirection.rtl,
                      decoration: InputDecoration(
                        hintText: 'שאל על מסלולי תקשורת...',
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.alternate)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.alternate)),
                        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
                        filled: true,
                        fillColor: ffTheme.background,
                      ),
                      onSubmitted: _send,
                      textInputAction: TextInputAction.send,
                    ),
                  ),
                  const SizedBox(width: 10),
                  GestureDetector(
                    onTap: () => _send(_inputCtrl.text),
                    child: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: ffTheme.primary,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatMsg {
  final String text;
  final bool isUser;
  final DateTime time;
  final List<String> planIds;
  final String cat;
  const _ChatMsg({required this.text, required this.isUser, required this.time, this.planIds = const [], this.cat = 'cellular'});
  String? get planId => planIds.isNotEmpty ? planIds.first : null;
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.msg, required this.ffTheme, required this.bill});
  final _ChatMsg msg;
  final AppTheme ffTheme;
  final int bill;

  @override
  Widget build(BuildContext context) {
    final plans = msg.planIds.map((id) => planById(id)).whereType<Plan>().toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: msg.isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: msg.isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
            children: [
              if (!msg.isUser) ...[
                Container(
                  constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(18),
                      topRight: Radius.circular(18),
                      bottomLeft: Radius.circular(4),
                      bottomRight: Radius.circular(18),
                    ),
                  ),
                  child: Text(msg.text, style: ffTheme.bodyMedium.copyWith(height: 1.5), textDirection: TextDirection.rtl),
                ),
              ] else ...[
                Container(
                  constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: ffTheme.primary,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(18),
                      topRight: Radius.circular(18),
                      bottomLeft: Radius.circular(18),
                      bottomRight: Radius.circular(4),
                    ),
                  ),
                  child: Text(msg.text, style: ffTheme.bodyMedium.copyWith(color: Colors.white, height: 1.5), textDirection: TextDirection.rtl),
                ),
              ],
            ],
          ),
          if (plans.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...plans.asMap().entries.map((e) => Padding(
              padding: EdgeInsets.only(bottom: e.key < plans.length - 1 ? 8 : 0),
              child: PlanCardWidget(plan: e.value, currentBill: bill, showCompare: false),
            )),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                GestureDetector(
                  onTap: () {
                    Provider.of<AppState>(context, listen: false).setCategory(msg.cat);
                    context.pushNamed('Results');
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: ffTheme.primary.withOpacity(0.3)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('ראה הכל', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w600)),
                        const SizedBox(width: 4),
                        Icon(Icons.arrow_back_ios_rounded, size: 11, color: ffTheme.primary),
                      ],
                    ),
                  ),
                ),
                if (msg.planId != null) ...[
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () => context.pushNamed('Lead', pathParameters: {'planId': msg.planId!}, queryParameters: {'source': 'advisor'}),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                      decoration: BoxDecoration(
                        color: ffTheme.primary,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.phone_forwarded_rounded, size: 13, color: Colors.white),
                          const SizedBox(width: 5),
                          Text('דבר עם נציג', style: ffTheme.labelSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: ffTheme.accent1,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) => Container(
                width: 8,
                height: 8,
                margin: EdgeInsets.only(left: i > 0 ? 4 : 0),
                decoration: BoxDecoration(color: ffTheme.primary, shape: BoxShape.circle),
              ).animate(onPlay: (c) => c.repeat())
                .fadeIn(delay: (i * 200).ms, duration: 300.ms)
                .then()
                .fadeOut(duration: 300.ms)),
            ),
          ),
        ],
      ),
    );
  }
}
