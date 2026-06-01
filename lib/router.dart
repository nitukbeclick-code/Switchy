import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'state.dart';
import 'screens/onboarding_screen.dart';
import 'screens/auth_screen.dart';
import 'screens/home_screen.dart';
import 'screens/quiz_screen.dart';
import 'screens/results_screen.dart';
import 'screens/plan_detail_screen.dart';
import 'screens/compare_screen.dart';
import 'screens/lead_screen.dart';
import 'screens/success_screen.dart';
import 'screens/tracker_screen.dart';
import 'screens/account_screen.dart';
import 'screens/community_screen.dart';
import 'screens/ai_advisor_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/bills_screen.dart';
import 'screens/ratings_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/availability_screen.dart';
import 'screens/switch_calc_screen.dart';
import 'screens/callback_screen.dart';
import 'screens/website_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

GoRouter createRouter(AppState appState) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/onboarding',
    routes: [
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      GoRoute(
        path: '/auth',
        builder: (context, state) => const AuthScreen(),
      ),
      GoRoute(
        path: '/website',
        builder: (context, state) => const WebsiteScreen(),
      ),
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) {
          return ScaffoldWithNav(child: child);
        },
        routes: [
          GoRoute(
            path: '/home',
            builder: (context, state) => const HomeScreen(),
          ),
          GoRoute(
            path: '/quiz',
            builder: (context, state) => const QuizScreen(),
          ),
          GoRoute(
            path: '/results',
            builder: (context, state) => const ResultsScreen(),
          ),
          GoRoute(
            path: '/plan/:id',
            builder: (context, state) {
              final id = state.pathParameters['id']!;
              return PlanDetailScreen(planId: id);
            },
          ),
          GoRoute(
            path: '/compare',
            builder: (context, state) => const CompareScreen(),
          ),
          GoRoute(
            path: '/lead/:planId',
            builder: (context, state) {
              final planId = state.pathParameters['planId']!;
              return LeadScreen(planId: planId);
            },
          ),
          GoRoute(
            path: '/success',
            builder: (context, state) => const SuccessScreen(),
          ),
          GoRoute(
            path: '/tracker',
            builder: (context, state) => const TrackerScreen(),
          ),
          GoRoute(
            path: '/account',
            builder: (context, state) => const AccountScreen(),
          ),
          GoRoute(
            path: '/community',
            builder: (context, state) => const CommunityScreen(),
          ),
          GoRoute(
            path: '/advisor',
            builder: (context, state) => const AIAdvisorScreen(),
          ),
          GoRoute(
            path: '/profile',
            builder: (context, state) => const ProfileScreen(),
          ),
          GoRoute(
            path: '/bills',
            builder: (context, state) => const BillsScreen(),
          ),
          GoRoute(
            path: '/ratings',
            builder: (context, state) => const RatingsScreen(),
          ),
          GoRoute(
            path: '/chat',
            builder: (context, state) => const ChatScreen(),
          ),
          GoRoute(
            path: '/availability',
            builder: (context, state) => const AvailabilityScreen(),
          ),
          GoRoute(
            path: '/switch-calc',
            builder: (context, state) => const SwitchCalcScreen(),
          ),
          GoRoute(
            path: '/callback',
            builder: (context, state) => const CallbackScreen(),
          ),
        ],
      ),
    ],
  );
}

class ScaffoldWithNav extends StatelessWidget {
  final Widget child;
  const ScaffoldWithNav({super.key, required this.child});

  static const _tabs = [
    _NavTab(icon: Icons.home_rounded, label: 'בית', route: '/home'),
    _NavTab(
        icon: Icons.compare_arrows_rounded,
        label: 'השוואה',
        route: '/compare'),
    _NavTab(
        icon: Icons.people_rounded, label: 'קהילה', route: '/community'),
    _NavTab(
        icon: Icons.swap_horiz_rounded, label: 'המעבר', route: '/tracker'),
    _NavTab(icon: Icons.person_rounded, label: 'אישי', route: '/account'),
  ];

  int _currentIndex(BuildContext context) {
    final loc = GoRouterState.of(context).uri.toString();
    if (loc.startsWith('/compare')) return 1;
    if (loc.startsWith('/community')) return 2;
    if (loc.startsWith('/tracker')) return 3;
    if (loc.startsWith('/account') ||
        loc.startsWith('/profile') ||
        loc.startsWith('/bills') ||
        loc.startsWith('/ratings')) return 4;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final idx = _currentIndex(context);
    final appState = context.watch<AppState>();

    return Scaffold(
      body: child,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border(
            top: BorderSide(color: const Color(0xFFE5E0D5), width: 1),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.06),
              blurRadius: 12,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: SafeArea(
          child: SizedBox(
            height: 62,
            child: Row(
              children: List.generate(_tabs.length, (i) {
                final tab = _tabs[i];
                final active = i == idx;
                final isCompare = i == 1;
                final compareCount = appState.comparePlans.length;

                return Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => context.go(tab.route),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Icon(
                              tab.icon,
                              size: 24,
                              color: active
                                  ? const Color(0xFF15603E)
                                  : const Color(0xFF6B6760),
                            ),
                            if (isCompare && compareCount > 0)
                              Positioned(
                                top: -4,
                                right: -6,
                                child: Container(
                                  width: 16,
                                  height: 16,
                                  decoration: const BoxDecoration(
                                    color: Color(0xFFC9EC4B),
                                    shape: BoxShape.circle,
                                  ),
                                  child: Center(
                                    child: Text(
                                      '$compareCount',
                                      style: const TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w800,
                                        color: Color(0xFF15603E),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          tab.label,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight:
                                active ? FontWeight.w700 : FontWeight.w500,
                            color: active
                                ? const Color(0xFF15603E)
                                : const Color(0xFF6B6760),
                          ),
                        ),
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

class _NavTab {
  final IconData icon;
  final String label;
  final String route;
  const _NavTab(
      {required this.icon, required this.label, required this.route});
}
