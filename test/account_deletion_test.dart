import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/pages/settings/settings_widget.dart'
    show kDeleteAccountSummaryGuest, kDeleteAccountSummaryLoggedIn;
import 'package:chosech/services/backend/backend.dart'
    show BookedMeeting, MeetingStatus;
import 'package:chosech/services/backend/local_backend.dart' show LocalBackend;

/// Account deletion — the LOCAL half of the flow:
///  * [AppState.wipeForAccountDeletion] resets the full persisted inventory to
///    its pristine defaults, clears SharedPreferences, and preserves ONLY the
///    theme mode (a device display preference, not personal data);
///  * a dirty write queued just before the wipe can never resurrect data;
///  * [LocalBackend.deleteAccount] reports success (nothing server-side
///    offline — the local wipe is the whole deletion);
///  * the settings delete row opens the confirm sheet (guest copy variant in
///    the Supabase-less test harness) and cancel is a strict no-op.
/// The widget harness boots the full app through GoRouter exactly like
/// test/availability_test.dart / test/settings_test.dart.
Future<void> _bootApp(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  await AppState().initializePersistedState();
  await tester.pumpWidget(
    ChangeNotifierProvider.value(value: AppState(), child: const ChosechApp()),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

/// Navigate via GoRouter using the root Navigator element.
void _go(WidgetTester tester, String path) {
  final ctx = tester.element(find.byType(Navigator).first);
  ctx.go(path);
}

/// Run [body] while swallowing benign RenderFlex overflow FlutterErrors — the
/// settings list is tall and can overflow in the test viewport; that is a
/// pre-existing layout artefact, not a test failure (same approach as
/// test/settings_test.dart and test/availability_test.dart).
Future<void> _ignoringOverflow(Future<void> Function() body) async {
  final originalOnError = FlutterError.onError;
  FlutterError.onError = (details) {
    final s = details.exceptionAsString();
    if (s.contains('overflowed') || s.contains('RenderFlex')) return;
    originalOnError?.call(details);
  };
  try {
    await body();
  } finally {
    FlutterError.onError = originalOnError;
  }
}

void main() {
  group('AppState.wipeForAccountDeletion', () {
    setUp(() {
      TestWidgetsFlutterBinding.ensureInitialized();
      SharedPreferences.setMockInitialValues({});
      AppState.reset();
    });

    test('resets the persisted inventory in place but preserves themeMode',
        () async {
      final s = AppState();
      await s.initializePersistedState();

      // Populate a representative slice of every persisted domain.
      s.login(name: 'דנה לוי', phone: '0521234567', email: 'dana@example.com');
      s.addSavings(480);
      s.setCategory('internet');
      s.setCurrentBill('cellular', 45); // personalizes the category
      s.setQuizCompleted(true);
      s.setQuizNeeds(wants5G: true, wantsAbroad: false, wantsNoCommit: true);
      s.saveQuizDraft(const QuizDraft(
        step: 2,
        cat: 'internet',
        lines: 2,
        priority: 'speed',
        extraFilter: null,
        budget: 100,
        currentBill: 120,
      ));
      s.submitLead(
        name: 'דנה',
        phone: '0521234567',
        provider: 'פרטנר',
        planId: 'no-such-plan',
      ); // also sets trackerStep = 1
      s.setLastNotifiedLeadStep(1);
      s.setBookedMeeting(BookedMeeting(
        id: 'm-1',
        status: MeetingStatus.pending,
        meetingDate: '2026-07-10',
        slot: '10:00',
        startsAt: DateTime.utc(2026, 7, 10, 7),
        createdAt: DateTime.now(),
      ));
      s.setUserTelegramChatId('12345');
      s.setSupportTicketId('tkt-1');
      s.toggleWatch('plan-1'); // stamps the §30A opt-in too
      s.addRecentSearch('סיב אופטי');
      s.viewPlan('plan-2');
      s.addReview(
          provider: 'פרטנר', overall: 4, subRatings: const {}, text: 'סבבה');
      s.addCommunityPost(
          id: 'post-1', author: 'דנה', avatar: '', channel: 'הכל', text: 'שלום');
      s.toggleLike('post-1');
      s.toggleBookmark('post-1');
      s.addCommunityReply(
          postId: 'post-1', author: 'דנה', avatar: '', text: 'תגובה');
      s.addAdvisorMessage(text: 'שלום', isUser: true);
      s.setAdvisorSessionId('sess-1');
      s.addMyPlan(
          category: 'cellular',
          provider: 'פרטנר',
          planName: 'חבילה',
          monthlyPrice: 49);
      s.setRenewalReminders(true);
      s.dismissNotification('n-1');
      s.setPrefCommunityNotifs(true);
      s.markOnboardingSeen();
      s.setThemeMode(ThemeMode.dark); // the ONE field that must survive
      // Session-only (never persisted, still personal) state.
      s.toggleCompare('plan-1');
      s.setIsAdmin(true);
      s.setSearch('חיפוש');
      s.toggleFilter('5G');
      s.setLeadLost(true);
      await s.flushPersistence(); // everything above is on disk now

      await s.wipeForAccountDeletion();

      // Auth mirror + savings + category.
      expect(s.isLoggedIn, isFalse);
      expect(s.userName, isEmpty);
      expect(s.userPhone, isEmpty);
      expect(s.userEmail, isEmpty);
      expect(s.totalSavings, 0);
      expect(s.selectedCat, 'cellular');
      // Bills back to the demo seeds, nothing personalized.
      expect(s.currentBill('cellular'), 119);
      expect(s.currentBill('internet'), 140);
      expect(s.billsPersonalized, isFalse);
      expect(s.personalizedCats, isEmpty);
      // Quiz + needs + resume draft.
      expect(s.quizCompleted, isFalse);
      expect(s.wants5G, isFalse);
      expect(s.wantsNoCommit, isFalse);
      expect(s.quizDraft, isNull);
      // Lead + tracker + meeting.
      expect(s.leadName, isNull);
      expect(s.leadPlanId, isNull);
      expect(s.trackerStep, 0);
      expect(s.lastNotifiedLeadStep, 0);
      expect(s.bookedMeeting, isNull);
      // Telegram + support ticket.
      expect(s.userTelegramChatId, isEmpty);
      expect(s.telegramEnabled, isFalse);
      expect(s.supportTicketId, isNull);
      // Watchlist + the §30A consent stamp die with the account.
      expect(s.watchedPlans, isEmpty);
      expect(s.hasWatchConsent, isFalse);
      // Browsing traces + reviews + community mirrors.
      expect(s.recentSearches, isEmpty);
      expect(s.recentlyViewed, isEmpty);
      expect(s.userReviews, isEmpty);
      expect(s.communityPosts, isEmpty);
      expect(s.hasLiked('post-1'), isFalse);
      expect(s.isBookmarked('post-1'), isFalse);
      expect(s.repliesFor('post-1'), isEmpty);
      // Advisor conversation + edge session.
      expect(s.advisorHistory, isEmpty);
      expect(s.advisorSessionId, isNull);
      // Renewal radar + notification state + prefs.
      expect(s.myPlans, isEmpty);
      expect(s.renewalReminders, isFalse);
      expect(s.isNotificationDismissed('n-1'), isFalse);
      expect(s.prefCommunityNotifs, isFalse);
      // Onboarding restarts from scratch.
      expect(s.seenOnboarding, isFalse);
      // Session-only state resets too.
      expect(s.comparePlans, isEmpty);
      expect(s.isAdmin, isFalse);
      expect(s.searchQuery, isEmpty);
      expect(s.activeFilters, isEmpty);
      expect(s.leadLost, isFalse);
      // The ONE survivor: the device display preference.
      expect(s.themeMode, ThemeMode.dark);

      // Storage holds NOTHING but the theme mode.
      final p = await SharedPreferences.getInstance();
      expect(p.getKeys(), {'themeMode'});
      expect(p.getString('themeMode'), 'dark');

      // A cold start reads back the pristine state + the kept theme.
      AppState.reset();
      final fresh = AppState();
      await fresh.initializePersistedState();
      expect(fresh.isLoggedIn, isFalse);
      expect(fresh.seenOnboarding, isFalse);
      expect(fresh.totalSavings, 0);
      expect(fresh.themeMode, ThemeMode.dark);
    });

    test('a dirty write queued just before the wipe cannot resurrect data',
        () async {
      final s = AppState();
      await s.initializePersistedState();

      // Mark state dirty (this schedules the microtask-debounced flush)...
      s.addSavings(999);
      // ...and wipe IMMEDIATELY, before the debounce had a chance to run.
      await s.wipeForAccountDeletion();

      // Pump the debounce: let the queued microtask and any stragglers drain.
      await Future<void>.delayed(Duration.zero);
      await s.flushPersistence();

      // The queued write was neutralized — nothing came back from memory.
      final p = await SharedPreferences.getInstance();
      expect(p.getInt('totalSavings'), isNull);
      expect(p.getKeys(), {'themeMode'});
      expect(s.totalSavings, 0);
    });
  });

  group('Backend.deleteAccount', () {
    test('LocalBackend reports success — the local wipe is the whole deletion',
        () async {
      expect(await LocalBackend().deleteAccount(), isTrue);
      expect(
          await LocalBackend().deleteAccount(advisorSessionId: 'sess-1'), isTrue);
    });
  });

  group('Settings — account deletion sheet', () {
    test('the two sheet copy variants are distinct, truthful summaries', () {
      expect(kDeleteAccountSummaryLoggedIn,
          isNot(equals(kDeleteAccountSummaryGuest)));
      // The registered-account variant names permanence + the legal keeps.
      expect(kDeleteAccountSummaryLoggedIn, contains('לצמיתות'));
      expect(kDeleteAccountSummaryLoggedIn, contains('לפי דין'));
      expect(kDeleteAccountSummaryLoggedIn, contains('הפעולה אינה הפיכה'));
      // The guest variant is honest about the anonymous device identity.
      expect(kDeleteAccountSummaryGuest, contains('הזהות האנונימית'));
      expect(kDeleteAccountSummaryGuest, contains('הפעולה אינה הפיכה'));
    });

    testWidgets(
        'the delete row opens the confirm sheet (guest copy) and cancel is a no-op',
        (tester) async {
      await _ignoringOverflow(() async {
        await _bootApp(tester);
        final appState = AppState();
        appState.setCurrentBill('cellular', 77); // sentinel — must survive cancel

        _go(tester, '/settings');
        await tester.pump(const Duration(milliseconds: 300));
        await tester.pump(const Duration(milliseconds: 400));

        final row = find.text('מחיקת חשבון ונתונים');
        await tester.ensureVisible(row);
        await tester.pump(const Duration(milliseconds: 200));
        await tester.tap(row);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));

        // The sheet is open: the title now appears twice (row + sheet header)…
        expect(find.text('מחיקת חשבון ונתונים'), findsNWidgets(2));
        // …with the GUEST copy (no Supabase in tests → no real account)…
        expect(find.text(kDeleteAccountSummaryGuest), findsOneWidget);
        expect(find.text(kDeleteAccountSummaryLoggedIn), findsNothing);
        // …the hold-to-confirm CTA, the policy link, and cancel.
        expect(find.text('מחק חשבון'), findsOneWidget);
        expect(find.text('למדיניות המחיקה המלאה'), findsOneWidget);
        expect(find.text('ביטול'), findsOneWidget);

        // Cancel: the sheet closes and NOTHING changed.
        await tester.tap(find.text('ביטול'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.text(kDeleteAccountSummaryGuest), findsNothing);
        expect(find.text('הגדרות'), findsOneWidget); // still on settings
        expect(appState.currentBill('cellular'), 77); // no wipe ran
        expect(appState.isLoggedIn, isFalse);

        await tester.pumpAndSettle();
        tester.takeException();
      });
    });
  });
}
