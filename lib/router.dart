import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'theme/app_theme.dart';
import 'widgets/glass_panel.dart';
import 'pages/onboarding/onboarding_widget.dart';
import 'pages/auth/auth_widget.dart';
import 'pages/auth/biometric_gate_widget.dart';
import 'services/auth_service.dart';
import 'pages/home/home_widget.dart';
import 'pages/quiz/quiz_widget.dart';
import 'pages/results/results_widget.dart';
import 'pages/search/search_widget.dart';
import 'pages/savings/savings_widget.dart';
import 'pages/electricity/electricity_widget.dart';
import 'pages/plan_detail/plan_detail_widget.dart';
import 'pages/compare/compare_widget.dart';
import 'pages/lead/lead_widget.dart';
import 'pages/success/success_widget.dart';
import 'pages/tracker/tracker_widget.dart';
import 'pages/account/account_widget.dart';
import 'pages/community/community_widget.dart';
import 'pages/ai_advisor/ai_advisor_widget.dart';
import 'pages/deals/deals_widget.dart';
import 'pages/profile/profile_widget.dart';
import 'pages/bills/bills_widget.dart';
import 'pages/ratings/ratings_widget.dart';
import 'pages/chat/chat_widget.dart';
import 'pages/availability/availability_widget.dart';
import 'pages/switch_calc/switch_calc_widget.dart';
import 'pages/callback/callback_widget.dart';
import 'pages/meeting/meeting_widget.dart';
import 'pages/website/website_widget.dart';
import 'pages/porting/porting_widget.dart';
import 'pages/settings/settings_widget.dart';
import 'pages/matches/matches_widget.dart';
import 'pages/renewal/renewal_widget.dart';
import 'pages/renewal_report/renewal_report_widget.dart';
import 'pages/notifications/notification_center_widget.dart';
import 'pages/provider/provider_widget.dart';
import 'pages/support_ticket/support_ticket_widget.dart';
import 'pages/recap/annual_recap_widget.dart';
import 'pages/crm/crm_widget.dart';
import 'pages/analytics/analytics_widget.dart';
import 'pages/wallet/wallet_widget.dart';
import 'pages/referral/referral_widget.dart';
import 'pages/negotiate/negotiate_widget.dart';
import 'pages/switch_kit/switch_kit_widget.dart';
import 'pages/switch_kit/street_price_widget.dart';

final _rootNavKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _shellNavKey = GlobalKey<NavigatorState>(debugLabel: 'shell');

/// The current app's router, set by [ChosechApp] at construction. Exposed so
/// non-widget code — the auth-state listener in `main.dart` — can navigate (e.g.
/// land Home after an OAuth redirect completes). Null before the app is built
/// (e.g. early in tests); callers must null-check.
GoRouter? appRouterInstance;

GoRouter createRouter() {
  // Returning users skip onboarding — but only on the app's *first* navigation
  // (cold start). Later explicit navigations to /onboarding (e.g. right after
  // logout) must actually land there, otherwise logout appears to do nothing.
  var initialRedirectHandled = false;
  return GoRouter(
  navigatorKey: _rootNavKey,
  initialLocation: '/onboarding',
  redirect: (context, state) {
    // Biometric cold-start gate — a real user who armed Face ID must unlock
    // before reaching any screen. Always false on web (mobile-only surface).
    if (AuthService.instance.needsBiometricUnlock && state.uri.path != '/lock') {
      return '/lock';
    }
    final appState = Provider.of<AppState>(context, listen: false);
    // Admin-only CRM + analytics — a non-admin who deep-links to either bounces
    // home. The edge function re-checks authoritatively; this is just the UI gate.
    if ((state.uri.path == '/crm' || state.uri.path == '/analytics') &&
        !appState.isAdmin) {
      return '/home';
    }
    final isOnboarding = state.uri.path == '/onboarding';
    final isFirstNavigation = !initialRedirectHandled;
    initialRedirectHandled = true;
    if (isOnboarding &&
        isFirstNavigation &&
        (appState.isLoggedIn || appState.quizCompleted || appState.seenOnboarding)) {
      return '/home';
    }
    return null;
  },
  routes: [
    GoRoute(path: '/onboarding', name: 'Onboarding', parentNavigatorKey: _rootNavKey, builder: (_, __) => const OnboardingWidget()),
    GoRoute(path: '/auth', name: 'Auth', parentNavigatorKey: _rootNavKey, builder: (_, __) => const AuthWidget()),
    GoRoute(path: '/lock', name: 'Lock', parentNavigatorKey: _rootNavKey, builder: (_, __) => const BiometricGateWidget()),
    GoRoute(path: '/website', name: 'Website', parentNavigatorKey: _rootNavKey, builder: (_, __) => const WebsiteWidget()),
    ShellRoute(
      navigatorKey: _shellNavKey,
      builder: (ctx, state, child) => _ScaffoldWithNav(location: state.uri.path, child: child),
      routes: [
        GoRoute(path: '/home', name: 'Home', builder: (_, __) => const HomeWidget()),
        GoRoute(path: '/quiz', name: 'Quiz', builder: (_, __) => const QuizWidget()),
        GoRoute(path: '/results', name: 'Results', builder: (_, __) => const ResultsWidget()),
        GoRoute(path: '/search', name: 'Search', builder: (_, __) => const SearchWidget()),
        GoRoute(path: '/savings', name: 'Savings', builder: (_, __) => const SavingsWidget()),
        GoRoute(path: '/electricity', name: 'Electricity', builder: (_, __) => const ElectricityWidget()),
        GoRoute(path: '/plan/:planId', name: 'PlanDetail', builder: (_, s) => PlanDetailWidget(planId: s.pathParameters['planId']!)),
        GoRoute(path: '/compare', name: 'Compare', builder: (_, __) => const CompareWidget()),
        GoRoute(path: '/lead/:planId', name: 'Lead', builder: (_, s) => LeadWidget(planId: s.pathParameters['planId']!, source: s.uri.queryParameters['source'] ?? 'form')),
        GoRoute(path: '/success', name: 'Success', builder: (_, __) => const SuccessWidget()),
        GoRoute(path: '/tracker', name: 'Tracker', builder: (_, __) => const TrackerWidget()),
        GoRoute(path: '/account', name: 'Account', builder: (_, __) => const AccountWidget()),
        GoRoute(path: '/community', name: 'Community', builder: (_, __) => const CommunityWidget()),
        GoRoute(path: '/advisor', name: 'AIAdvisor', builder: (_, __) => const AIAdvisorWidget()),
        GoRoute(path: '/deals', name: 'Deals', builder: (_, __) => const DealsWidget()),
        GoRoute(path: '/profile', name: 'Profile', builder: (_, __) => const ProfileWidget()),
        GoRoute(path: '/bills', name: 'Bills', builder: (_, __) => const BillsWidget()),
        GoRoute(path: '/ratings', name: 'Ratings', builder: (_, __) => const RatingsWidget()),
        GoRoute(path: '/chat', name: 'Chat', builder: (_, __) => const ChatWidget()),
        GoRoute(path: '/availability', name: 'Availability', builder: (_, __) => const AvailabilityWidget()),
        GoRoute(path: '/switch-calc', name: 'SwitchCalc', builder: (_, __) => const SwitchCalcWidget()),
        GoRoute(path: '/callback', name: 'Callback', builder: (_, __) => const CallbackWidget()),
        GoRoute(
          path: '/meeting',
          name: 'Meeting',
          builder: (_, s) => MeetingWidget(
            provider: s.uri.queryParameters['provider'],
            planId: s.uri.queryParameters['planId'],
            source: s.uri.queryParameters['source'] ?? 'form',
          ),
        ),
        GoRoute(path: '/porting', name: 'Porting', builder: (_, __) => const PortingWidget()),
        GoRoute(path: '/settings', name: 'Settings', builder: (_, __) => const SettingsWidget()),
        GoRoute(path: '/matches', name: 'Matches', builder: (_, __) => const MatchesWidget()),
        GoRoute(path: '/renewal', name: 'Renewal', builder: (_, __) => const RenewalWidget()),
        GoRoute(path: '/renewal-report/:trackedId', name: 'RenewalReport', builder: (_, s) => RenewalReportWidget(trackedId: s.pathParameters['trackedId']!)),
        GoRoute(path: '/notifications', name: 'Notifications', builder: (_, __) => const NotificationCenterWidget()),
        GoRoute(path: '/provider/:name', name: 'Provider', builder: (_, s) => ProviderWidget(providerName: s.pathParameters['name']!)),
        GoRoute(path: '/support-ticket/:ticketId', name: 'support-ticket', builder: (_, s) => SupportTicketWidget(ticketId: s.pathParameters['ticketId']!)),
        GoRoute(path: '/recap', name: 'AnnualRecap', builder: (_, __) => const AnnualRecapWidget()),
        GoRoute(path: '/wallet', name: 'Wallet', builder: (_, __) => const WalletWidget()),
        GoRoute(path: '/referral', name: 'Referral', builder: (_, __) => const ReferralWidget()),
        GoRoute(
          path: '/negotiate',
          name: 'Negotiate',
          builder: (_, s) => NegotiateWidget(
            initialCategory: s.uri.queryParameters['category'],
            initialProvider: s.uri.queryParameters['provider'],
          ),
        ),
        GoRoute(
          path: '/switch-kit',
          name: 'SwitchKit',
          builder: (_, s) => SwitchKitWidget(
            initialProvider: s.uri.queryParameters['provider'],
            initialCategory: s.uri.queryParameters['category'],
            trackedId: s.uri.queryParameters['trackedId'],
          ),
        ),
        GoRoute(
          path: '/street-price',
          name: 'StreetPrice',
          builder: (_, s) => StreetPriceWidget(
            initialProvider: s.uri.queryParameters['provider'],
            initialCategory: s.uri.queryParameters['category'],
          ),
        ),
        GoRoute(path: '/crm', name: 'Crm', builder: (_, __) => const CrmWidget()),
        GoRoute(path: '/analytics', name: 'Analytics', builder: (_, __) => const AnalyticsWidget()),
      ],
    ),
  ],
  );
}

class _ScaffoldWithNav extends StatelessWidget {
  const _ScaffoldWithNav({required this.child, required this.location});
  final Widget child;
  final String location;

  static const _tabs = [
    _Tab(icon: Icons.home_rounded, label: 'בית', route: '/home'),
    _Tab(icon: Icons.bar_chart_rounded, label: 'השוואה', route: '/compare'),
    _Tab(icon: Icons.people_rounded, label: 'קהילה', route: '/community'),
    _Tab(icon: Icons.sync_alt_rounded, label: 'המעבר', route: '/tracker'),
    _Tab(icon: Icons.person_rounded, label: 'אישי', route: '/account'),
  ];

  int get _activeIndex {
    if (location.startsWith('/compare')) return 1;
    if (location.startsWith('/community')) return 2;
    if (location.startsWith('/tracker') || location.startsWith('/lead') || location.startsWith('/success') || location.startsWith('/porting') || location.startsWith('/chat') || location.startsWith('/callback') || location.startsWith('/meeting')) return 3;
    if (location.startsWith('/account') || location.startsWith('/profile') || location.startsWith('/bills') || location.startsWith('/ratings')) return 4;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final idx = _activeIndex;

    // Subscribe ONLY to the compare-count slice so the shell (and its bottom
    // nav / compare badge) rebuilds when plans are added/removed from the
    // compare tray — not on every unrelated AppState notify (search keystroke,
    // bill tap, etc.). The Selector recomputes the int and only rebuilds its
    // child when that int changes.
    return Selector<AppState, int>(
      selector: (_, appState) => appState.comparePlans.length,
      builder: (context, compareCount, _) => Scaffold(
      // Let page content scroll *under* the frosted nav bar so it reads as glass.
      extendBody: true,
      body: child,
      bottomNavigationBar: GlassPanel(
        // Flat top edge — only the top hairline frames it against scrolled content.
        borderRadius: BorderRadius.zero,
        border: false,
        alpha: 0.7,
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: ffTheme.alternate, width: 1)),
          ),
          child: SafeArea(
          top: false,
          child: SizedBox(
            height: 64,
            child: Row(
              children: List.generate(_tabs.length, (i) {
                final tab = _tabs[i];
                final active = i == idx;
                final isCompare = i == 1;
                return Expanded(
                  child: Semantics(
                    button: true,
                    selected: active,
                    label: isCompare && compareCount > 0
                        ? '${tab.label}, $compareCount בהשוואה'
                        : tab.label,
                    excludeSemantics: true,
                    child: InkWell(
                    onTap: () => context.go(tab.route),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Stack(clipBehavior: Clip.none, children: [
                          Icon(tab.icon, size: 26, color: active ? ffTheme.brandAccent : ffTheme.secondaryText),
                          if (isCompare && compareCount > 0)
                            PositionedDirectional(
                              top: -5, end: -8,
                              child: Container(
                                width: 18, height: 18,
                                decoration: BoxDecoration(color: ffTheme.secondary, shape: BoxShape.circle),
                                child: Center(child: Text('$compareCount', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: ffTheme.primary))),
                              ),
                            ),
                        ]),
                        const SizedBox(height: 3),
                        Text(tab.label, style: TextStyle(fontSize: 10.5, fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: active ? ffTheme.brandAccent : ffTheme.secondaryText)),
                      ],
                    ),
                  ),
                  ),
                );
              }),
            ),
          ),
        ),
        ),
      ),
      ),
    );
  }
}

class _Tab { final IconData icon; final String label; final String route; const _Tab({required this.icon, required this.label, required this.route}); }
