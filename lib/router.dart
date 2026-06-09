import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'theme/app_theme.dart';
import 'pages/onboarding/onboarding_widget.dart';
import 'pages/auth/auth_widget.dart';
import 'pages/home/home_widget.dart';
import 'pages/quiz/quiz_widget.dart';
import 'pages/results/results_widget.dart';
import 'pages/search/search_widget.dart';
import 'pages/plan_detail/plan_detail_widget.dart';
import 'pages/compare/compare_widget.dart';
import 'pages/lead/lead_widget.dart';
import 'pages/success/success_widget.dart';
import 'pages/tracker/tracker_widget.dart';
import 'pages/account/account_widget.dart';
import 'pages/community/community_widget.dart';
import 'pages/ai_advisor/ai_advisor_widget.dart';
import 'pages/profile/profile_widget.dart';
import 'pages/bills/bills_widget.dart';
import 'pages/ratings/ratings_widget.dart';
import 'pages/chat/chat_widget.dart';
import 'pages/availability/availability_widget.dart';
import 'pages/switch_calc/switch_calc_widget.dart';
import 'pages/callback/callback_widget.dart';
import 'pages/website/website_widget.dart';
import 'pages/porting/porting_widget.dart';
import 'pages/settings/settings_widget.dart';
import 'pages/matches/matches_widget.dart';
import 'pages/renewal/renewal_widget.dart';
import 'pages/renewal_report/renewal_report_widget.dart';
import 'pages/notifications/notification_center_widget.dart';
import 'pages/provider/provider_widget.dart';

final _rootNavKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _shellNavKey = GlobalKey<NavigatorState>(debugLabel: 'shell');

GoRouter createRouter() => GoRouter(
  navigatorKey: _rootNavKey,
  initialLocation: '/onboarding',
  redirect: (context, state) {
    final appState = Provider.of<AppState>(context, listen: false);
    final isOnboarding = state.uri.path == '/onboarding';
    if (isOnboarding && (appState.isLoggedIn || appState.quizCompleted || appState.seenOnboarding)) {
      return '/home';
    }
    return null;
  },
  routes: [
    GoRoute(path: '/onboarding', name: 'Onboarding', parentNavigatorKey: _rootNavKey, builder: (_, __) => const OnboardingWidget()),
    GoRoute(path: '/auth', name: 'Auth', parentNavigatorKey: _rootNavKey, builder: (_, __) => const AuthWidget()),
    GoRoute(path: '/website', name: 'Website', parentNavigatorKey: _rootNavKey, builder: (_, __) => const WebsiteWidget()),
    ShellRoute(
      navigatorKey: _shellNavKey,
      builder: (ctx, state, child) => _ScaffoldWithNav(location: state.uri.path, child: child),
      routes: [
        GoRoute(path: '/home', name: 'Home', builder: (_, __) => const HomeWidget()),
        GoRoute(path: '/quiz', name: 'Quiz', builder: (_, __) => const QuizWidget()),
        GoRoute(path: '/results', name: 'Results', builder: (_, __) => const ResultsWidget()),
        GoRoute(path: '/search', name: 'Search', builder: (_, __) => const SearchWidget()),
        GoRoute(path: '/plan/:planId', name: 'PlanDetail', builder: (_, s) => PlanDetailWidget(planId: s.pathParameters['planId']!)),
        GoRoute(path: '/compare', name: 'Compare', builder: (_, __) => const CompareWidget()),
        GoRoute(path: '/lead/:planId', name: 'Lead', builder: (_, s) => LeadWidget(planId: s.pathParameters['planId']!)),
        GoRoute(path: '/success', name: 'Success', builder: (_, __) => const SuccessWidget()),
        GoRoute(path: '/tracker', name: 'Tracker', builder: (_, __) => const TrackerWidget()),
        GoRoute(path: '/account', name: 'Account', builder: (_, __) => const AccountWidget()),
        GoRoute(path: '/community', name: 'Community', builder: (_, __) => const CommunityWidget()),
        GoRoute(path: '/advisor', name: 'AIAdvisor', builder: (_, __) => const AIAdvisorWidget()),
        GoRoute(path: '/profile', name: 'Profile', builder: (_, __) => const ProfileWidget()),
        GoRoute(path: '/bills', name: 'Bills', builder: (_, __) => const BillsWidget()),
        GoRoute(path: '/ratings', name: 'Ratings', builder: (_, __) => const RatingsWidget()),
        GoRoute(path: '/chat', name: 'Chat', builder: (_, __) => const ChatWidget()),
        GoRoute(path: '/availability', name: 'Availability', builder: (_, __) => const AvailabilityWidget()),
        GoRoute(path: '/switch-calc', name: 'SwitchCalc', builder: (_, __) => const SwitchCalcWidget()),
        GoRoute(path: '/callback', name: 'Callback', builder: (_, __) => const CallbackWidget()),
        GoRoute(path: '/porting', name: 'Porting', builder: (_, __) => const PortingWidget()),
        GoRoute(path: '/settings', name: 'Settings', builder: (_, __) => const SettingsWidget()),
        GoRoute(path: '/matches', name: 'Matches', builder: (_, __) => const MatchesWidget()),
        GoRoute(path: '/renewal', name: 'Renewal', builder: (_, __) => const RenewalWidget()),
        GoRoute(path: '/renewal-report/:trackedId', name: 'RenewalReport', builder: (_, s) => RenewalReportWidget(trackedId: s.pathParameters['trackedId']!)),
        GoRoute(path: '/notifications', name: 'Notifications', builder: (_, __) => const NotificationCenterWidget()),
        GoRoute(path: '/provider/:name', name: 'Provider', builder: (_, s) => ProviderWidget(providerName: s.pathParameters['name']!)),
      ],
    ),
  ],
);

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
    if (location.startsWith('/tracker') || location.startsWith('/lead') || location.startsWith('/success') || location.startsWith('/porting') || location.startsWith('/chat') || location.startsWith('/callback')) return 3;
    if (location.startsWith('/account') || location.startsWith('/profile') || location.startsWith('/bills') || location.startsWith('/ratings')) return 4;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    final ffTheme = AppTheme.of(context);
    final idx = _activeIndex;

    return Scaffold(
      body: child,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: ffTheme.alternate, width: 1)),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 16, offset: const Offset(0, -4))],
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
                final compareCount = appState.comparePlans.length;
                return Expanded(
                  child: InkWell(
                    onTap: () => context.go(tab.route),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Stack(clipBehavior: Clip.none, children: [
                          Icon(tab.icon, size: 26, color: active ? ffTheme.primary : ffTheme.secondaryText),
                          if (isCompare && compareCount > 0)
                            Positioned(
                              top: -5, right: -8,
                              child: Container(
                                width: 18, height: 18,
                                decoration: BoxDecoration(color: ffTheme.secondary, shape: BoxShape.circle),
                                child: Center(child: Text('$compareCount', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: ffTheme.primary))),
                              ),
                            ),
                        ]),
                        const SizedBox(height: 3),
                        Text(tab.label, style: TextStyle(fontSize: 10.5, fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: active ? ffTheme.primary : ffTheme.secondaryText)),
                      ],
                    ),
                  ),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }
}

class _Tab { final IconData icon; final String label; final String route; const _Tab({required this.icon, required this.label, required this.route}); }
