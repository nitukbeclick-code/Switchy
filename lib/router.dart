import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'core/feature_flags.dart';
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
// One Navigator per bottom-nav tab so each tab keeps its OWN back-stack and
// scroll position (true native tab behaviour). The branch order here is the
// tab order in [_ScaffoldWithNav._tabs]: home, compare, community, tracker,
// account.
final _homeNavKey = GlobalKey<NavigatorState>(debugLabel: 'home');
final _compareNavKey = GlobalKey<NavigatorState>(debugLabel: 'compare');
final _communityNavKey = GlobalKey<NavigatorState>(debugLabel: 'community');
final _trackerNavKey = GlobalKey<NavigatorState>(debugLabel: 'tracker');
final _accountNavKey = GlobalKey<NavigatorState>(debugLabel: 'account');

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
    // Mandatory auth gate (feature-flagged, defaults OFF). When the owner flips
    // [kAuthGateRequired] on — once OAuth / email-OTP providers are configured —
    // a visitor who isn't a REAL (non-anonymous) account is forced to `/auth`
    // and can't reach `/home` or skip onboarding as a guest. `/auth` itself
    // (and `/website`, the public marketing surface) stay reachable so the gate
    // doesn't trap the very screen that lets them register. While the flag is
    // OFF this block is inert and the redirect below is unchanged.
    if (kAuthGateRequired &&
        !appState.isRegistered &&
        state.uri.path != '/auth' &&
        state.uri.path != '/website') {
      return '/auth';
    }
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
    // Per-tab back-stacks: one navigator branch per bottom-nav tab, so switching
    // tabs preserves each tab's own navigation stack + scroll position (native
    // tab behaviour). [_ScaffoldWithNav] hosts the shared bottom nav and renders
    // the active branch via the [StatefulNavigationShell]. Routes are grouped
    // into the branch whose tab they belong to (mirroring _ScaffoldWithNav's
    // _activeIndex), but every route stays reachable by its exact path from
    // anywhere — `context.goNamed`/`pushNamed` and `context.go('/path')` are
    // unchanged, and absolute-path navigation auto-switches to the owning branch.
    StatefulShellRoute.indexedStack(
      builder: (ctx, state, navigationShell) =>
          _ScaffoldWithNav(navigationShell: navigationShell),
      branches: [
        // ── Branch 0 — Home tab ──────────────────────────────────────────────
        StatefulShellBranch(
          navigatorKey: _homeNavKey,
          routes: [
            GoRoute(path: '/home', name: 'Home', builder: (_, __) => const HomeWidget()),
            GoRoute(path: '/quiz', name: 'Quiz', builder: (_, __) => const QuizWidget()),
            GoRoute(path: '/results', name: 'Results', builder: (_, __) => const ResultsWidget()),
            GoRoute(path: '/search', name: 'Search', builder: (_, __) => const SearchWidget()),
            GoRoute(path: '/savings', name: 'Savings', builder: (_, __) => const SavingsWidget()),
            GoRoute(path: '/electricity', name: 'Electricity', builder: (_, __) => const ElectricityWidget()),
            GoRoute(path: '/plan/:planId', name: 'PlanDetail', builder: (_, s) => PlanDetailWidget(planId: s.pathParameters['planId']!)),
            GoRoute(path: '/availability', name: 'Availability', builder: (_, __) => const AvailabilityWidget()),
            GoRoute(path: '/switch-calc', name: 'SwitchCalc', builder: (_, __) => const SwitchCalcWidget()),
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
        // ── Branch 1 — Compare tab ───────────────────────────────────────────
        StatefulShellBranch(
          navigatorKey: _compareNavKey,
          routes: [
            GoRoute(path: '/compare', name: 'Compare', builder: (_, __) => const CompareWidget()),
          ],
        ),
        // ── Branch 2 — Community tab ─────────────────────────────────────────
        StatefulShellBranch(
          navigatorKey: _communityNavKey,
          routes: [
            GoRoute(path: '/community', name: 'Community', builder: (_, __) => const CommunityWidget()),
            GoRoute(path: '/advisor', name: 'AIAdvisor', builder: (_, __) => const AIAdvisorWidget()),
            GoRoute(path: '/deals', name: 'Deals', builder: (_, __) => const DealsWidget()),
          ],
        ),
        // ── Branch 3 — Tracker ("המעבר") tab ─────────────────────────────────
        StatefulShellBranch(
          navigatorKey: _trackerNavKey,
          routes: [
            GoRoute(path: '/tracker', name: 'Tracker', builder: (_, __) => const TrackerWidget()),
            GoRoute(path: '/lead/:planId', name: 'Lead', builder: (_, s) => LeadWidget(planId: s.pathParameters['planId']!, source: s.uri.queryParameters['source'] ?? 'form')),
            GoRoute(path: '/success', name: 'Success', builder: (_, __) => const SuccessWidget()),
            GoRoute(path: '/chat', name: 'Chat', builder: (_, __) => const ChatWidget()),
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
          ],
        ),
        // ── Branch 4 — Account ("אישי") tab ──────────────────────────────────
        StatefulShellBranch(
          navigatorKey: _accountNavKey,
          routes: [
            GoRoute(path: '/account', name: 'Account', builder: (_, __) => const AccountWidget()),
            GoRoute(path: '/profile', name: 'Profile', builder: (_, __) => const ProfileWidget()),
            GoRoute(path: '/bills', name: 'Bills', builder: (_, __) => const BillsWidget()),
            GoRoute(path: '/ratings', name: 'Ratings', builder: (_, __) => const RatingsWidget()),
          ],
        ),
      ],
    ),
  ],
  );
}

class _ScaffoldWithNav extends StatelessWidget {
  const _ScaffoldWithNav({required this.navigationShell});

  /// Drives the per-tab back-stacks: holds one Navigator per branch in an
  /// IndexedStack, exposes the active tab via [currentIndex] and switches tabs
  /// (preserving each branch's stack + scroll) via [goBranch].
  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);

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
        body: navigationShell,
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
              child: _BottomNavBar(
                navigationShell: navigationShell,
                compareCount: compareCount,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The bottom-nav row + the single *travelling* selection pill.
///
/// Motion craft (Emil): tab-switching is a HIGH-FREQUENCY action, so the content
/// swap stays instant and the chrome stays snappy. The selection indicator is a
/// SINGLE pill that *slides* between tab slots (spatial continuity — you read it
/// as one object moving, the clip-path-style continuous feel) rather than a
/// per-tab background that fades in/out in place. It travels in the fast band
/// ([motionFast]) under [easeOut] — entering/settling motion is always ease-out,
/// never ease-in — so the active state lands crisply without ever feeling
/// sluggish. The icon + label colour and the label weight crossfade on the same
/// fast cadence. Press gives a subtle [pressScale] squeeze for tactile feedback.
/// All transform/position motion is dropped under reduced-motion; colour stays.
class _BottomNavBar extends StatelessWidget {
  const _BottomNavBar({
    required this.navigationShell,
    required this.compareCount,
  });

  final StatefulNavigationShell navigationShell;
  final int compareCount;

  // Tab order MUST match the branch order in [createRouter]'s
  // StatefulShellRoute (home, compare, community, tracker, account) — the index
  // is what drives [navigationShell.goBranch] / [currentIndex].
  static const _tabs = [
    _Tab(icon: Icons.home_rounded, label: 'בית'),
    _Tab(icon: Icons.bar_chart_rounded, label: 'השוואה'),
    _Tab(icon: Icons.people_rounded, label: 'קהילה'),
    _Tab(icon: Icons.sync_alt_rounded, label: 'המעבר'),
    _Tab(icon: Icons.person_rounded, label: 'אישי'),
  ];

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final idx = navigationShell.currentIndex;
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    // Travelling pill: instant under reduced-motion (no transform animation),
    // otherwise a snappy slide in the fast band. Map the active index to a
    // [-1, 1] Alignment.x across the n equal slots; RTL is handled by the
    // ambient Directionality so the pill tracks the visually-active tab.
    final pillAlignX = _tabs.length == 1
        ? 0.0
        : (idx / (_tabs.length - 1)) * 2 - 1;

    return SizedBox(
      height: 64,
      child: Stack(
        children: [
          // ── The single travelling selection pill (behind the row) ──────────
          // It SLIDES between slots so the eye follows one continuous object
          // instead of a fade swap. The AnimatedAlign fills the whole bar and
          // its child is exactly one slot wide ([widthFactor] 1/n), so an
          // Alignment.x of (idx/(n-1))*2-1 centres that slot-box precisely over
          // the active tab for ANY bar width. The visible pill is inset within
          // the slot-box so it reads as a soft 56px-wide pill. Directionality is
          // resolved so RTL tracks the visually-active tab.
          Positioned.fill(
            child: IgnorePointer(
              child: AnimatedAlign(
                duration: reduceMotion ? Duration.zero : ffTheme.motionFast,
                curve: ffTheme.easeOut,
                alignment: AlignmentDirectional(pillAlignX, 0)
                    .resolve(Directionality.of(context)),
                child: FractionallySizedBox(
                  widthFactor: 1 / _tabs.length,
                  child: Center(
                    child: Container(
                      width: 56,
                      height: 32,
                      decoration: BoxDecoration(
                        color: ffTheme.brandAccent.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          // ── The tappable tab row (icons + labels) on top of the pill ───────
          Row(
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
                  child: _NavTabButton(
                    onTap: () {
                      // Tactile confirm on tab change — the tabs were silent,
                      // a classic webview tell; every native bar buzzes here.
                      HapticFeedback.selectionClick();
                      // Switch branch, preserving its stack + scroll. Re-tapping
                      // the active tab pops it back to that branch's root route
                      // (initialLocation: true) — standard native tab behaviour.
                      navigationShell.goBranch(i, initialLocation: i == idx);
                    },
                    reduceMotion: reduceMotion,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // Icon sits OVER the travelling pill (no per-tab
                        // background of its own now) — only its tint crossfades
                        // on the fast cadence as the pill arrives/leaves.
                        SizedBox(
                          height: 32,
                          child: Center(
                            child: Stack(
                              clipBehavior: Clip.none,
                              children: [
                                // Genuine tint crossfade as the pill arrives /
                                // leaves — Icon colour isn't tweened by a plain
                                // AnimatedContainer, so drive it through a colour
                                // tween on the same fast cadence (instant under
                                // reduced-motion, which keeps the colour change
                                // but drops the in-between animation).
                                TweenAnimationBuilder<Color?>(
                                  duration: reduceMotion
                                      ? Duration.zero
                                      : ffTheme.motionFast,
                                  curve: ffTheme.easeOut,
                                  tween: ColorTween(
                                    end: active
                                        ? ffTheme.brandAccent
                                        : ffTheme.secondaryText,
                                  ),
                                  builder: (_, color, __) => Icon(
                                    tab.icon,
                                    size: 24,
                                    color: color,
                                  ),
                                ),
                                if (isCompare && compareCount > 0)
                                  PositionedDirectional(
                                    top: -5,
                                    end: -8,
                                    child: Container(
                                      width: 18,
                                      height: 18,
                                      decoration: BoxDecoration(
                                        color: ffTheme.secondary,
                                        shape: BoxShape.circle,
                                      ),
                                      child: Center(
                                        child: Text(
                                          '$compareCount',
                                          style: TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w800,
                                            color: ffTheme.primary,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 2),
                        AnimatedDefaultTextStyle(
                          duration:
                              reduceMotion ? Duration.zero : ffTheme.motionFast,
                          curve: ffTheme.easeOut,
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight:
                                active ? FontWeight.w700 : FontWeight.w500,
                            color: active
                                ? ffTheme.brandAccent
                                : ffTheme.secondaryText,
                          ),
                          child: Text(tab.label),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}

/// A single tappable nav slot. Adds Emil's subtle press squeeze ([pressScale])
/// on the way down — tactile feedback for a high-frequency control — then
/// settles back on release. Both legs use [easeOut] (pressing in and releasing
/// are each "settling" motion, never ease-in). The squeeze is dropped under
/// reduced-motion. Keeps haptics at the call-site so it fires exactly once.
class _NavTabButton extends StatefulWidget {
  const _NavTabButton({
    required this.child,
    required this.onTap,
    required this.reduceMotion,
  });

  final Widget child;
  final VoidCallback onTap;
  final bool reduceMotion;

  @override
  State<_NavTabButton> createState() => _NavTabButtonState();
}

class _NavTabButtonState extends State<_NavTabButton> {
  bool _down = false;

  void _set(bool v) {
    if (_down != v) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final pressedScale = widget.reduceMotion ? 1.0 : t.pressScale;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.onTap,
      onTapDown: (_) => _set(true),
      onTapUp: (_) => _set(false),
      onTapCancel: () => _set(false),
      child: AnimatedScale(
        scale: _down ? pressedScale : 1.0,
        duration: _down ? t.motionPress : t.motionMedium,
        curve: t.easeOut,
        child: widget.child,
      ),
    );
  }
}

class _Tab { final IconData icon; final String label; const _Tab({required this.icon, required this.label}); }
