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
// One Navigator per shell branch so each keeps its OWN back-stack and scroll
// position (true native tab behaviour). WAVE 4 slimmed the PRIMARY bottom-tab
// bar to a tight funnel — home, tracker(מעבר), account(אישי) — but every branch
// below stays a live, fully-reachable branch. Compare + Community are no longer
// top-level tabs; their branches still exist (so /compare and /community resolve
// and keep their own back-stacks) and are reached from in-page entry points:
//   • Compare   ← the floating compare-tray on Home (home_widget.dart → goNamed('Compare'))
//   • Community ← Home's community section (home_widget.dart) AND the Account
//                 screen's "קהילה" quick-link (account_widget.dart → goNamed('Community')).
// The branch ORDER here must match [_BranchIndex] (and the visible tabs come
// first so the travelling pill maps cleanly): home, tracker, account, then the
// two reachable-but-untabbed branches compare, community.
final _homeNavKey = GlobalKey<NavigatorState>(debugLabel: 'home');
final _trackerNavKey = GlobalKey<NavigatorState>(debugLabel: 'tracker');
final _accountNavKey = GlobalKey<NavigatorState>(debugLabel: 'account');
final _compareNavKey = GlobalKey<NavigatorState>(debugLabel: 'compare');
final _communityNavKey = GlobalKey<NavigatorState>(debugLabel: 'community');

/// Stable branch indices into the [StatefulShellRoute] below. The first three
/// (home/tracker/account) are the visible bottom-tab branches in RTL tab order;
/// the last two (compare/community) are reachable-but-untabbed branches. Keeping
/// these as named constants means the `_tabs` list, the selected-index logic and
/// the branch list can never drift out of sync.
class _BranchIndex {
  static const int home = 0;
  static const int tracker = 1;
  static const int account = 2;
  static const int compare = 3;
  static const int community = 4;
}

/// The current app's router, set by [ChosechApp] at construction. Exposed so
/// non-widget code — the auth-state listener in `main.dart` — can navigate (e.g.
/// land Home after an OAuth redirect completes). Null before the app is built
/// (e.g. early in tests); callers must null-check.
GoRouter? appRouterInstance;

GoRouter createRouter() {
  // Debug guard: the branch list below MUST stay in [_BranchIndex] order, since
  // the bottom nav drives goBranch()/currentIndex by those exact indices and the
  // two untabbed branches (compare/community) are reached purely by index. This
  // assert fails loudly in debug if anyone reorders the branches without updating
  // the indices (it also keeps the untabbed constants referenced — they are the
  // single source of truth for "which branch is Compare / Community").
  assert(
    _BranchIndex.home == 0 &&
        _BranchIndex.tracker == 1 &&
        _BranchIndex.account == 2 &&
        _BranchIndex.compare == 3 &&
        _BranchIndex.community == 4,
    'Branch indices must match the StatefulShellRoute branch order.',
  );
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
        // ── Branch 0 — Home tab (בית) ────────────────────────────────────────
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
        // ── Branch 1 — Tracker ("מעבר") tab ──────────────────────────────────
        StatefulShellBranch(
          navigatorKey: _trackerNavKey,
          routes: [
            GoRoute(path: '/tracker', name: 'Tracker', builder: (_, __) => const TrackerWidget()),
            GoRoute(path: '/lead/:planId', name: 'Lead', builder: (_, s) => LeadWidget(planId: s.pathParameters['planId']!, source: s.uri.queryParameters['source'] ?? 'form')),
            GoRoute(path: '/success', name: 'Success', builder: (_, s) => SuccessWidget(leadAccepted: s.extra as bool?)),
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
        // ── Branch 2 — Account ("אישי") tab ──────────────────────────────────
        StatefulShellBranch(
          navigatorKey: _accountNavKey,
          routes: [
            GoRoute(path: '/account', name: 'Account', builder: (_, __) => const AccountWidget()),
            GoRoute(path: '/profile', name: 'Profile', builder: (_, __) => const ProfileWidget()),
            GoRoute(path: '/bills', name: 'Bills', builder: (_, __) => const BillsWidget()),
            GoRoute(path: '/ratings', name: 'Ratings', builder: (_, __) => const RatingsWidget()),
          ],
        ),
        // ── Branch 3 — Compare (reachable-but-untabbed) ──────────────────────
        // No longer a primary tab (WAVE 4). Still a live branch with its own
        // back-stack; reached from Home's floating compare-tray. Deep-links to
        // /compare resolve here and auto-activate this branch.
        StatefulShellBranch(
          navigatorKey: _compareNavKey,
          routes: [
            GoRoute(path: '/compare', name: 'Compare', builder: (_, __) => const CompareWidget()),
          ],
        ),
        // ── Branch 4 — Community (reachable-but-untabbed) ────────────────────
        // No longer a primary tab (WAVE 4). Still a live branch; reached from
        // Home's community section and the Account screen's "קהילה" quick-link.
        // Deep-links to /community, /advisor, /deals resolve here.
        StatefulShellBranch(
          navigatorKey: _communityNavKey,
          routes: [
            GoRoute(path: '/community', name: 'Community', builder: (_, __) => const CommunityWidget()),
            GoRoute(path: '/advisor', name: 'AIAdvisor', builder: (_, __) => const AIAdvisorWidget()),
            GoRoute(path: '/deals', name: 'Deals', builder: (_, __) => const DealsWidget()),
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

    // The slimmed funnel bar (בית / מעבר / אישי) carries no compare-count badge,
    // so the shell no longer needs to subscribe to the compare slice — the
    // compare count is surfaced by Home's floating compare-tray instead. The bar
    // only depends on the shell's active branch, which drives its own rebuilds.
    return Scaffold(
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
            child: _BottomNavBar(navigationShell: navigationShell),
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
  const _BottomNavBar({required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  // The slimmed, funnel-focused PRIMARY tab bar (WAVE 4): בית / מעבר / אישי, in
  // RTL reading order (right→left). Each tab carries the SHELL BRANCH it drives,
  // so the visible-tab index is decoupled from the branch index — that lets the
  // shell keep extra reachable-but-untabbed branches (Compare, Community) without
  // a phantom tab slot. Compare is reached from Home's compare-tray; Community
  // from Home's community section + the Account "קהילה" quick-link.
  static const _tabs = [
    _Tab(icon: Icons.home_rounded, label: 'בית', branchIndex: _BranchIndex.home),
    _Tab(icon: Icons.sync_alt_rounded, label: 'מעבר', branchIndex: _BranchIndex.tracker),
    _Tab(icon: Icons.person_rounded, label: 'אישי', branchIndex: _BranchIndex.account),
  ];

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    // The shell's active BRANCH index (0..4). Map it to the VISIBLE-tab index by
    // finding the tab that drives that branch. When a reachable-but-untabbed
    // branch is active (Compare / Community), no tab is selected — `selectedTab`
    // is -1, so the travelling pill hides and no glyph reads as active. (The
    // back-stack still belongs to that branch; the user returns via the in-page
    // entry point or the system back gesture.)
    final branchIndex = navigationShell.currentIndex;
    final selectedTab = _tabs.indexWhere((t) => t.branchIndex == branchIndex);
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    // Travelling pill: instant under reduced-motion (no transform animation),
    // otherwise a snappy slide in the fast band. Map the active tab to a
    // [-1, 1] Alignment.x across the n equal slots; RTL is handled by the
    // ambient Directionality so the pill tracks the visually-active tab. When no
    // tab is selected (untabbed branch) the pill is hidden entirely below.
    final pillIndex = selectedTab < 0 ? 0 : selectedTab;
    final pillAlignX = _tabs.length == 1
        ? 0.0
        : (pillIndex / (_tabs.length - 1)) * 2 - 1;

    return SizedBox(
      height: 64,
      child: Stack(
        children: [
          // ── The single travelling selection pill (behind the row) ──────────
          // It SLIDES between slots so the eye follows one continuous object
          // instead of a fade swap. The AnimatedAlign fills the whole bar and
          // its child is exactly one slot wide ([widthFactor] 1/n), so an
          // Alignment.x of (pillIndex/(n-1))*2-1 centres that slot-box over
          // the active tab for ANY bar width. The visible pill is inset within
          // the slot-box so it reads as a soft 56px-wide pill. Directionality is
          // resolved so RTL tracks the visually-active tab.
          Positioned.fill(
            child: IgnorePointer(
              // Hide the pill entirely while a reachable-but-untabbed branch
              // (Compare / Community) is active — there's no tab for it to sit
              // under, so a parked pill would falsely read as "Home selected".
              //
              // RepaintBoundary: the pill is the bar's continuously-animated
              // layer (slide + fade on every tab switch); isolating it keeps
              // those frames from repainting the icon/label row above it.
              child: RepaintBoundary(
                child: AnimatedOpacity(
                  duration: reduceMotion ? Duration.zero : ffTheme.motionFast,
                  curve: ffTheme.easeOut,
                  opacity: selectedTab < 0 ? 0 : 1,
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
            ),
          ),
          // ── The tappable tab row (icons + labels) on top of the pill ───────
          Row(
            children: List.generate(_tabs.length, (i) {
              final tab = _tabs[i];
              final active = i == selectedTab;
              return Expanded(
                child: Semantics(
                  button: true,
                  selected: active,
                  label: tab.label,
                  excludeSemantics: true,
                  child: _NavTabButton(
                    onTap: () {
                      // Tactile confirm on tab change — the tabs were silent,
                      // a classic webview tell; every native bar buzzes here.
                      HapticFeedback.selectionClick();
                      // Switch to this tab's branch, preserving its stack +
                      // scroll. Re-tapping the ALREADY-active tab pops it back to
                      // that branch's root route (initialLocation: true) — the
                      // standard native tab behaviour. Tab index is decoupled
                      // from branch index, so drive goBranch by [tab.branchIndex].
                      navigationShell.goBranch(
                        tab.branchIndex,
                        initialLocation: tab.branchIndex == branchIndex,
                      );
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
                                    // AA-safe darker green for the active glyph
                                    // (the lighter brandAccent fill only ~3:1
                                    // on white — fails AA). 24px glyph.
                                    end: active
                                        ? ffTheme.brandAccentText
                                        : ffTheme.secondaryText,
                                  ),
                                  builder: (_, color, __) => Icon(
                                    tab.icon,
                                    size: 24,
                                    color: color,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 2),
                        // Flexible + ellipsis: at very large OS text scales the
                        // label shrinks/truncates inside the fixed 64px bar
                        // instead of overflowing the column — text scaling
                        // itself stays fully enabled.
                        Flexible(
                          child: AnimatedDefaultTextStyle(
                            duration:
                                reduceMotion ? Duration.zero : ffTheme.motionFast,
                            curve: ffTheme.easeOut,
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight:
                                  active ? FontWeight.w700 : FontWeight.w500,
                              // AA-safe darker green for the active label (the
                              // lighter brandAccent fill is only ~3:1 on white —
                              // fails AA small-text contrast).
                              color: active
                                  ? ffTheme.brandAccentText
                                  : ffTheme.secondaryText,
                            ),
                            child: Text(tab.label,
                                maxLines: 1, overflow: TextOverflow.ellipsis),
                          ),
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
      // RepaintBoundary: the press squeeze animates this slot's subtree on
      // every tap — isolate it so the squeeze never repaints the sibling tabs
      // or the pill layer.
      child: RepaintBoundary(
        child: AnimatedScale(
          scale: _down ? pressedScale : 1.0,
          duration: _down ? t.motionPress : t.motionMedium,
          curve: t.easeOut,
          child: widget.child,
        ),
      ),
    );
  }
}

class _Tab {
  final IconData icon;
  final String label;
  // The shell-branch index this tab drives (see [_BranchIndex]). Decoupling the
  // visible-tab index from the branch index lets the shell keep extra
  // reachable-but-untabbed branches (Compare, Community) with no phantom slot.
  final int branchIndex;
  const _Tab({required this.icon, required this.label, required this.branchIndex});
}
