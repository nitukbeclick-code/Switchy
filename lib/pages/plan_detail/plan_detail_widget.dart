import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../core/zoom_providers.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';
import '../../models.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../services/analytics_service.dart';
import '../../services/recommendation_engine.dart';
import '../../services/backend/local_backend.dart';
import '../../services/provider_ratings.dart';
import '../../services/street_price.dart';
import '../../widgets/legal_disclosure.dart';
import '../../widgets/pressable.dart';
import '../../widgets/price_text.dart';
import '../../widgets/saving_pill.dart';

// Per-section widgets (mechanical split of this page's 2.3k-line tree; zero
// visual change). `part` files share this library — the section widgets stay
// private (_FitPanel, _Card, …) and reuse the imports above.
part 'sections/fit_panel_section.dart';
part 'sections/value_anchor_section.dart';
part 'sections/post_promo_badge_section.dart';
part 'sections/payments_equipment_section.dart';
part 'sections/trust_signals_section.dart';
part 'sections/detail_cards.dart';
part 'sections/spec_grid_section.dart';
part 'sections/cost_breakdown_section.dart';
part 'sections/extra_info_section.dart';

/// Reduced-motion-aware settle for the secondary card stack: `.settleY()` is
/// a drop-in for `.slideY(begin: …)` that KEEPS the fade already applied on
/// the chain but DROPS the slide transform when the OS asks for reduced
/// motion (`MediaQuery.disableAnimations`) — the same policy as [_settleCard].
extension _SettleYX on Animate {
  Animate settleY(BuildContext context, {double begin = 0.08}) {
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduceMotion) return this;
    return slideY(begin: begin, end: 0);
  }
}

class PlanDetailWidget extends StatefulWidget {
  const PlanDetailWidget({super.key, required this.planId});
  final String planId;

  @override
  State<PlanDetailWidget> createState() => _PlanDetailWidgetState();
}

class _PlanDetailWidgetState extends State<PlanDetailWidget> {
  @override
  void initState() {
    super.initState();
    // Track this plan view for demand analytics
    final viewedPlan = planById(widget.planId);
    if (viewedPlan != null) {
      appBackend.trackPlanView(
        planId: widget.planId,
        provider: viewedPlan.provider,
        category: viewedPlan.cat,
      ).catchError((_) {});
      // Funnel beacon — one planView per screen open. Fire-and-forget,
      // scalars only, no PII.
      AnalyticsService.track(AnalyticsEvent.planView, props: {
        'provider': viewedPlan.provider,
        'cat': viewedPlan.cat,
      });
    }
    // Record the view once per visit, after the first frame so the
    // notifyListeners doesn't fire mid-build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) AppState().viewPlan(widget.planId);
    });
    // Warm the live Zoom-supported provider set once so the video-meeting
    // cross-sell shows/hides honestly (falls back to the const set until it
    // resolves). Rebuild when it lands in case it flips this provider's gate.
    zoomSupportedProviders().then((_) {
      if (mounted) setState(() {});
    });
    // Light up the street-price trust row from the deployed edge fn's REAL,
    // threshold-gated aggregate (lazy + cached + fail-soft — see
    // StreetPriceService.hydrate). Rebuild when data lands so aggregateFor
    // (still synchronous) picks up the hydrated server figure. Under
    // LocalBackend (offline / tests) this is a strict no-op — the row stays
    // truth-gated exactly as before.
    if (viewedPlan != null) {
      StreetPriceService.hydrate(viewedPlan.provider, viewedPlan.cat)
          .then((_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final plan = planById(widget.planId);

    if (plan == null) {
      return Scaffold(
        appBar: AppBar(
          // Standard light app bar + ink back arrow (the old ffTheme.primary
          // fill flipped to off-white in dark mode and hid the white icon).
          backgroundColor: ffTheme.cardSurface,
          leading: IconButton(
            icon: Icon(Icons.arrow_back_ios_rounded,
                color: ffTheme.primaryText),
            tooltip: 'חזרה',
            onPressed: () => context.pop(),
          ),
        ),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline_rounded, size: 64, color: ffTheme.alternate),
              const SizedBox(height: 16),
              Text('מסלול לא נמצא', style: ffTheme.titleMedium),
              const SizedBox(height: 8),
              AppButton.ghost(
                text: 'חזרה',
                onPressed: () async => context.pop(),
              ),
            ],
          ),
        ),
      );
    }

    final bill = appState.currentBill(plan.cat);
    final saveYear = planSaveYear(plan, bill);
    final cost24 = plan.price * 24;
    final inCompare = appState.isInCompare(plan.id);

    // Compute match once for this plan
    final matchProfile = MatchProfile.fromAppState(appState, plan.cat);
    final planMatch = RecommendationEngine.scorePlan(plan, matchProfile);

    // Trust signals — both truth-gated upstream, computed once per build:
    //   • street price: aggregateFor is SYNCHRONOUS in-memory (session reports
    //     + the server aggregate hydrated in initState) and returns null below
    //     kStreetPriceMinReports ACCEPTED reports — the server enforces the same
    //     threshold — so a non-null value is always real, sufficient, screened
    //     data;
    //   • rating: hasData is false until at least one REAL review (catalogue or
    //     the signed-in user's own) backs the provider.
    final streetAgg = StreetPriceService.aggregateFor(plan.provider, plan.cat);
    final providerRating =
        ProviderRatings.forProvider(plan.provider, appState: appState);

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              // SliverAppBar with green gradient
              SliverAppBar(
                expandedHeight: 200,
                pinned: true,
                // Flat ink hero — theme-locked near-black in BOTH themes (the
                // theme-aware ffTheme.primary getter inverts to off-white on dark,
                // which would hide the white app-bar icons).
                backgroundColor: AppColors.primary,
                leading: IconButton(
                  icon: const Icon(Icons.arrow_back_ios_rounded, color: Colors.white),
                  tooltip: 'חזרה',
                  onPressed: () => context.pop(),
                ),
                actions: [
                  IconButton(
                    icon: const Icon(Icons.share_rounded, color: Colors.white),
                    tooltip: 'שתף מסלול',
                    onPressed: () {
                      HapticFeedback.selectionClick();
                      final unit = priceUnitShort(plan);
                      Share.share('${plan.provider} — ${plan.plan}\n₪${plan.priceText}/$unit\n\nמצאתי ב-Switchy AI');
                    },
                  ),
                  IconButton(
                    icon: Icon(
                      inCompare ? Icons.compare_arrows_rounded : Icons.add,
                      // Active state = the green accent (the old ffTheme.secondary
                      // resolved to a dark slate in dark mode — invisible on the
                      // theme-locked ink hero).
                      color: inCompare ? ffTheme.brandAccent : Colors.white,
                    ),
                    tooltip: inCompare ? 'הסר מהשוואה' : 'הוסף להשוואה',
                    onPressed: () {
                      HapticFeedback.selectionClick();
                      appState.toggleCompare(plan.id);
                    },
                  ),
                  const SizedBox(width: 8),
                ],
                flexibleSpace: FlexibleSpaceBar(
                  background: Container(
                    decoration: BoxDecoration(
                      // Flat ink hero, theme-locked near-black in BOTH themes (the
                      // bespoke [primary, primaryDark] wash inverted to off-white on
                      // dark, breaking the white-on-ink foreground).
                      gradient: ffTheme.freshGradient,
                    ),
                    child: SafeArea(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const SizedBox(height: 32),
                          // Logo sits on a soft white chip so per-provider brand
                          // colours stay legible over the green hero (we never
                          // recolour the logo itself).
                          Hero(
                            tag: 'plan_logo_${plan.id}',
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                // Locked-white chip so provider brand colours
                                // read on the ink hero; GEIST-flat (the bespoke
                                // black drop shadow broke the one elevation
                                // story).
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                              ),
                              child: LogoWidget(provider: plan.provider, size: 64),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Semantics(
                            button: true,
                            label: 'עבור לעמוד הספק ${plan.provider}',
                            child: Material(
                              color: Colors.transparent,
                              child: InkWell(
                                borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                                onTap: () => context.pushNamed('Provider', pathParameters: {'name': plan.provider}),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(plan.provider,
                                          style: ffTheme.titleLarge.copyWith(color: Colors.white)),
                                      const SizedBox(width: 4),
                                      Icon(Icons.chevron_left_rounded,
                                          size: 18,
                                          color: Colors.white.withValues(alpha: 0.85)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 40),
                            child: Text(
                              plan.plan,
                              style: ffTheme.bodySmall
                                  .copyWith(color: Colors.white.withValues(alpha: 0.85)),
                              textAlign: TextAlign.center,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),

              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Price hero card — the page's focal element gets the
                      // calm ease-out settle (Emil) instead of a bare fade.
                      _settleCard(
                      context,
                      _Card(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Expanded (not intrinsic): at large text scales the
                            // promo line + commitment pill pushed the SavingPill
                            // past the card edge (27px overflow at the 1.3×
                            // clamp) — let this side wrap instead.
                            Expanded(
                              child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // FittedBox: the single big price numeral
                                // scales down instead of clipping when the OS
                                // text scale is large; user scaling stays
                                // honored on all the surrounding copy.
                                FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    // The plan's headline price is the page's
                                    // single focal number — rendered through
                                    // PriceText (bidi-safe LTR isolate) on the
                                    // shared [priceDisplay] numeral token.
                                    PriceText('₪${plan.priceText}'),
                                    const SizedBox(width: 4),
                                    Padding(
                                      padding: const EdgeInsets.only(bottom: 6),
                                      child: Text('/${priceUnitShort(plan)}',
                                          style: ffTheme.bodySmall.copyWith(
                                              color: ffTheme.secondaryText)),
                                    ),
                                  ],
                                  ),
                                ),
                                if (plan.hasPromo)
                                  Text(
                                    '₪${plan.afterText} אחרי ${plan.intro ?? 'המבצע'}',
                                    style: ffTheme.bodySmall
                                        .copyWith(color: ffTheme.secondaryText),
                                  ),
                                const SizedBox(height: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: ffTheme.background,
                                    borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                                    border: Border.all(color: ffTheme.alternate),
                                  ),
                                  child: Text(plan.commitmentLabel,
                                      style: ffTheme.labelSmall),
                                ),
                              ],
                              ),
                            ),
                            const SizedBox(width: 12),
                            if (saveYear > 0)
                              // Savings figures render through the ONE canonical
                              // SavingPill treatment (green TINT + glyph +
                              // tabular figures) — solid green fills stay
                              // reserved for CTAs.
                              SavingPill(
                                text: 'חוסך ₪$saveYear בשנה',
                                shortText: 'חוסך ₪$saveYear',
                              ),
                          ],
                        ),
                      ),
                      delayMs: 0,
                      durationMs: 350,
                    ),

                      // §7b commission disclosure + §17 price caveat — directly
                      // under the headline price so the paid-relationship and the
                      // VAT/verify caveat sit with the price (and above the
                      // "קבלו ליווי אישי" lead CTA in the sticky bar). Approved
                      // shared copy — [decorated] is presentation only (quiet
                      // pale-tint + hairline + shield), no new legal wording.
                      const SizedBox(height: 10),
                      const LegalDisclosure(decorated: true),

                      // ── Post-promo price badge ───────────────────────────
                      // A clear "מחיר עכשיו → מחיר אחרי המבצע" badge built only
                      // from the plan's REAL after/afterExact + intro. Renders
                      // only when there is a genuine promo jump; never invented.
                      if (plan.hasPromo) ...[
                        const SizedBox(height: 14),
                        _settleCard(context, _PostPromoBadge(plan: plan), delayMs: 40),
                      ],

                      // ── Above-the-fold VALUE anchor — the ₪ saving the user
                      // gets vs their own bill, then 3 honest "why this plan"
                      // bullets derived from the real spec + engine reasons.
                      // Specs/fine-print follow below.
                      const SizedBox(height: 14),
                      _settleCard(
                        context,
                        _ValueAnchor(
                          plan: plan,
                          saveYear: saveYear,
                          bill: bill,
                          match: planMatch,
                          billsPersonalized: appState.billsPersonalized,
                        ),
                        delayMs: 60,
                      ),

                      const SizedBox(height: 14),

                      // Features card
                      _Card(
                        title: 'מה כלול',
                        child: Column(
                          children: plan.feats
                              .map((feat) => Padding(
                                    padding: const EdgeInsets.only(bottom: 10),
                                    child: Row(
                                      children: [
                                        Icon(Icons.check_circle_rounded,
                                            color: ffTheme.primary, size: 20),
                                        const SizedBox(width: 10),
                                        Expanded(
                                            child: Text(feat,
                                                style: ffTheme.bodyMedium)),
                                      ],
                                    ),
                                  ))
                              .toList(),
                        ),
                      )
                          .animate(delay: 80.ms)
                          .fadeIn(duration: 300.ms)
                          .settleY(context),

                      const SizedBox(height: 14),

                      // Pricing breakdown card
                      _Card(
                        title: 'פירוט מחיר',
                        child: Column(
                          children: [
                            _PriceRow(
                                label: 'מחיר מבצע',
                                value: '₪${plan.priceText}',
                                ffTheme: ffTheme),
                            if (plan.hasPromo)
                              _PriceRow(
                                label: 'מחיר לאחר מבצע',
                                value: '₪${plan.afterText}',
                                valueColor: ffTheme.warning,
                                ffTheme: ffTheme,
                              ),
                            _PriceRow(
                                label: 'התחייבות',
                                value: plan.commitmentLabel,
                                ffTheme: ffTheme,
                                isLast: plan.cat == 'abroad'),
                            if (plan.cat != 'abroad')
                              _PriceRow(
                                label: 'עלות ל-24 חודשים',
                                value: '₪$cost24',
                                ffTheme: ffTheme,
                                isLast: true),
                          ],
                        ),
                      )
                          .animate(delay: 120.ms)
                          .fadeIn(duration: 300.ms)
                          .settleY(context),

                      // ── Trust signals — what people ACTUALLY pay + real
                      // ratings, right under the sticker-price breakdown. Both
                      // rows are conditional on real data (see the truth gates
                      // where [streetAgg]/[providerRating] are computed above);
                      // with no data there is NO row and NO placeholder.
                      if (streetAgg != null || providerRating.hasData) ...[
                        const SizedBox(height: 14),
                        _TrustSignalsRow(
                          plan: plan,
                          agg: streetAgg,
                          rating: providerRating,
                        )
                            .animate(delay: 140.ms)
                            .fadeIn(duration: 300.ms)
                            .settleY(context),
                      ],

                      // Warning card (promo)
                      if (plan.hasPromo) ...[
                        const SizedBox(height: 14),
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: ffTheme.warning.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                            border: Border.all(
                                color: ffTheme.warning.withValues(alpha: 0.4)),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.warning_amber_rounded,
                                  color: ffTheme.warning, size: 22),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  'המחיר יעלה ל-₪${plan.afterText} לאחר ${plan.intro ?? 'תקופת המבצע'}',
                                  style: ffTheme.bodySmall.copyWith(
                                      color: ffTheme.warning,
                                      fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                        ).animate(delay: 160.ms).fadeIn(duration: 300.ms),
                      ],

                      const SizedBox(height: 14),

                      // Rate provider CTA — honest entry point to leave the
                      // first real review (no fabricated rating shown).
                      Semantics(
                        button: true,
                        label: appState.hasReviewedProvider(plan.provider) ? 'עדכן דירוג עבור ${plan.provider}' : 'דרג את ${plan.provider}',
                        child: Pressable(
                          onTap: () => context.pushNamed('Ratings'),
                          child: Container(
                            // Comfortable tap target (≥48dp) + tokenized 1px
                            // hairline (was a raw ink-alpha border on a bare
                            // GestureDetector).
                            constraints:
                                const BoxConstraints(minHeight: kMinTapTarget),
                            alignment: Alignment.center,
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            decoration: BoxDecoration(
                              color: ffTheme.accent1,
                              borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                              border: Border.all(color: ffTheme.lineColor),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.rate_review_rounded, size: 16, color: ffTheme.primary),
                                const SizedBox(width: 6),
                                Text(
                                  appState.hasReviewedProvider(plan.provider) ? 'עדכן דירוג עבור ${plan.provider}' : 'דרג את ${plan.provider}',
                                  style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700),
                                ),
                                const Spacer(),
                                Icon(Icons.chevron_left_rounded, size: 16, color: ffTheme.primary),
                              ],
                            ),
                          ),
                        ),
                      ).animate(delay: 250.ms).fadeIn(duration: 300.ms),

                      // ── "למה המסלול הזה מתאים לך" — fit panel ──────────────
                      const SizedBox(height: 14),
                      _FitPanel(
                        match: planMatch,
                        annualSaving: saveYear,
                        billsPersonalized: appState.billsPersonalized,
                        inCompare: inCompare,
                        onCompare: () {
                          HapticFeedback.selectionClick();
                          appState.toggleCompare(plan.id);
                        },
                      )
                          .animate(delay: 270.ms)
                          .fadeIn(duration: 300.ms)
                          .settleY(context),

                      // ── Quick-spec grid ─────────────────────────────────
                      if (plan.specs.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        _SpecGrid(plan: plan)
                            .animate(delay: 285.ms)
                            .fadeIn(duration: 300.ms)
                            .settleY(context),
                      ],

                      // ── Detailed cost breakdown ──────────────────────────
                      const SizedBox(height: 14),
                      _CostBreakdownCard(plan: plan)
                          .animate(delay: 295.ms)
                          .fadeIn(duration: 300.ms)
                          .settleY(context),

                      // ── Payments & equipment (router / installation) ─────
                      // An expandable section surfacing the plan's REAL fees
                      // dict — installation, router and any one-off charges —
                      // so the true cost isn't buried. Real data only; renders
                      // only when the plan actually carries fees.
                      if (plan.fees.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        _PaymentsEquipmentSection(plan: plan)
                            .animate(delay: 300.ms)
                            .fadeIn(duration: 300.ms)
                            .settleY(context),
                      ],

                      // Fine print
                      if (plan.fine != null) ...[
                        const SizedBox(height: 14),
                        Container(
                          clipBehavior: Clip.antiAlias,
                          decoration: ffTheme.cardDecoration(radius: ffTheme.radiusCard),
                          child: ExpansionTile(
                            title: Text('אותיות קטנות', style: ffTheme.titleSmall),
                            iconColor: ffTheme.secondaryText,
                            collapsedIconColor: ffTheme.secondaryText,
                            tilePadding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 4),
                            childrenPadding:
                                const EdgeInsets.fromLTRB(16, 0, 16, 16),
                            children: [
                              Text(plan.fine!, style: ffTheme.bodySmall),
                            ],
                          ),
                        ).animate(delay: 240.ms).fadeIn(duration: 300.ms),
                      ],

                      // ── מידע נוסף / אותיות קטנות (progressive disclosure) ──
                      if (plan.hasExtraInfo) ...[
                        const SizedBox(height: 14),
                        _ExtraInfoSection(plan: plan)
                            .animate(delay: 305.ms)
                            .fadeIn(duration: 300.ms)
                            .settleY(context),
                      ],

                      // Savings timeline
                      if (saveYear > 0) ...[
                        const SizedBox(height: 14),
                        _Card(
                          title: 'חיסכון לאורך זמן',
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              _SavingsPeriod(months: 6, saveYear: saveYear, ffTheme: ffTheme),
                              Container(width: 1, height: 48, color: ffTheme.alternate),
                              _SavingsPeriod(months: 12, saveYear: saveYear, ffTheme: ffTheme),
                              Container(width: 1, height: 48, color: ffTheme.alternate),
                              _SavingsPeriod(months: 24, saveYear: saveYear, ffTheme: ffTheme),
                            ],
                          ),
                        ).animate(delay: 260.ms).fadeIn(duration: 300.ms).settleY(context),
                      ],

                      const SizedBox(height: 14),

                      // Video-meeting cross-sell — a quote over Zoom with a rep.
                      // Only providers that support Zoom calls
                      // (provider_capabilities.supports_zoom_meeting) get the
                      // booking entry; an unsupported provider shows an honest
                      // not-supported note instead of a card that dead-ends.
                      if (providerSupportsZoom(plan.provider))
                        _Card(
                          child: Material(
                            color: Colors.transparent,
                            child: InkWell(
                              borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                              onTap: () => context.pushNamed('Meeting', queryParameters: {
                                'provider': plan.provider,
                                'planId': plan.id,
                                'source': 'plan',
                              }),
                              child: Row(
                                children: [
                                  // Inline leading icon in ink — green stays for
                                  // actions/savings, not decorative glyphs.
                                  Icon(Icons.videocam_rounded, color: ffTheme.primary, size: 22),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text('פגישת וידאו עם נציג', style: ffTheme.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
                                        Text('הצעת מחיר אישית בשיחת Zoom של 30 דקות',
                                            style: ffTheme.labelSmall),
                                      ],
                                    ),
                                  ),
                                  Icon(Icons.chevron_left_rounded, size: 20, color: ffTheme.secondaryText),
                                ],
                              ),
                            ),
                          ),
                        ).animate(delay: 270.ms).fadeIn(duration: 300.ms).settleY(context)
                      else
                        _Card(
                          child: Row(
                            children: [
                              Icon(Icons.videocam_off_rounded, color: ffTheme.secondaryText, size: 22),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text('ספק זה אינו תומך כרגע בשיחות וידאו',
                                    style: ffTheme.bodyMedium.copyWith(
                                        fontWeight: FontWeight.w700, color: ffTheme.secondaryText)),
                              ),
                            ],
                          ),
                        ).animate(delay: 270.ms).fadeIn(duration: 300.ms).settleY(context),

                      const SizedBox(height: 14),

                      // Price-watch card — turning it on writes an explicit
                      // §30A opt-in (see AppState.toggleWatch); the consent
                      // microcopy below the toggle states exactly that.
                      _Card(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // MergeSemantics: the switch and its row label are
                            // announced as ONE toggle ("מעקב אחר שינויי מחיר")
                            // instead of an unnamed switch next to loose text.
                            MergeSemantics(
                              child: Row(
                                children: [
                                  Icon(Icons.notifications_outlined,
                                      color: ffTheme.primary, size: 22),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      // Section row reads as a noun label (was the
                                      // imperative "עקוב אחר…"), consistent with
                                      // the other card headers on the page.
                                      'מעקב אחר שינויי מחיר',
                                      style: ffTheme.bodyMedium,
                                    ),
                                  ),
                                  Switch(
                                    value: appState.isWatching(plan.id),
                                    onChanged: (v) {
                                      HapticFeedback.selectionClick();
                                      appState.toggleWatch(plan.id);
                                    },
                                    // ON = an active state → the green accent.
                                    activeThumbColor: ffTheme.brandAccent,
                                  ),
                                ],
                              ),
                            ),
                            // Explicit opt-in microcopy (Spam-Law §30A): only
                            // shown once watching is ON, stating that the user is
                            // consenting to receive price-drop notifications and
                            // can turn them off any time.
                            if (appState.isWatching(plan.id)) ...[
                              const SizedBox(height: 8),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(Icons.verified_user_outlined,
                                      size: 14, color: ffTheme.secondaryText),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      'בהפעלה אישרת לקבל התראות על ירידות מחיר במסלול הזה. '
                                      'אפשר לבטל בכל רגע מאותו מתג.',
                                      style: ffTheme.labelSmall.copyWith(
                                        color: ffTheme.secondaryText,
                                        height: 1.4,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      )
                          .animate(delay: 280.ms)
                          .fadeIn(duration: 300.ms)
                          .settleY(context),

                      // Similar plans section
                      Builder(builder: (_) {
                        final similar = allPlans
                            .where((p) => p.cat == plan.cat && p.id != plan.id)
                            .toList()
                          ..sort((a, b) => (a.price - plan.price).abs().compareTo((b.price - plan.price).abs()));
                        final topSimilar = similar.take(4).toList();
                        if (topSimilar.isEmpty) return const SizedBox();
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 20),
                            Semantics(
                                header: true,
                                child: Text('מסלולים דומים',
                                    style: ffTheme.titleLarge)),
                            const SizedBox(height: 12),
                            SizedBox(
                              // A hair taller so the SavingPill row breathes.
                              // Scaled with the user's text size (house idiom,
                              // results_widget:854) — at the app's 1.3× clamp
                              // the fixed 118 overflowed the card Column by 5px.
                              height: MediaQuery.textScalerOf(context).scale(118),
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                itemCount: topSimilar.length,
                                separatorBuilder: (_, __) => const SizedBox(width: 10),
                                itemBuilder: (ctx, i) {
                                  final p = topSimilar[i];
                                  final pSave = planSaveYear(p, bill);
                                  // Accessible name + button role for the
                                  // tappable mini-card (GestureDetector alone
                                  // exposes neither). Figures are the card's
                                  // own real values.
                                  return Semantics(
                                    button: true,
                                    label:
                                        '${p.provider}, ₪${p.priceText} ל${priceUnitShort(p)}${pSave > 0 ? ', חוסך ₪$pSave בשנה' : ''}. הצג מסלול',
                                    child: Pressable(
                                    onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': p.id}),
                                    child: Container(
                                      width: 160,
                                      padding: const EdgeInsets.all(14),
                                      decoration: ffTheme.cardDecoration(),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              LogoWidget(provider: p.provider, size: 28),
                                              const SizedBox(width: 8),
                                              Expanded(child: Text(p.provider, style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis)),
                                            ],
                                          ),
                                          const SizedBox(height: 6),
                                          // Money via PriceText (bidi-safe, tabular), ink.
                                          PriceText('₪${p.priceText}/${priceUnitShort(p)}', style: ffTheme.titleSmall),
                                          const SizedBox(height: 3),
                                          if (pSave > 0)
                                            // Savings = the canonical SavingPill
                                            // treatment (with a compact fallback;
                                            // the Semantics label above carries
                                            // the full sentence).
                                            SavingPill(
                                                text: 'חוסך ₪$pSave/שנה',
                                                shortText: 'חוסך ₪$pSave')
                                          else
                                            Text(p.plan, style: ffTheme.labelSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                                        ],
                                      ),
                                    ),
                                    ),
                                  ).animate(delay: (i * 60).ms).fadeIn(duration: 250.ms);
                                },
                              ),
                            ),
                          ],
                        );
                      }),

                      const SizedBox(height: 100),
                    ],
                  ),
                ),
              ),
            ],
          ),

          // Sticky bottom bar
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                decoration: BoxDecoration(
                  color: ffTheme.cardSurface,
                  borderRadius: BorderRadius.vertical(
                      top: Radius.circular(ffTheme.radiusXl)),
                  // Tokenized 1px hairline (was a raw ink-alpha wash).
                  border: Border(
                      top: BorderSide(color: ffTheme.lineColor, width: 1)),
                  boxShadow: ffTheme.shadowLifted,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: AppButton(
                        // The page's single conversion moment — it submits a
                        // lead. Use the one committed conversion promise
                        // ("קבלו ליווי אישי"), not a sales verb like "בדקו כמה
                        // תחסכו"; every other action on this page stays a calm
                        // browse/compare verb so the accent is spent only here.
                        text: 'קבלו ליווי אישי ←',
                        onPressed: () async => context.pushNamed('Lead',
                            pathParameters: {'planId': plan.id}, queryParameters: {'source': 'plan'}),
                        height: 56,
                        // Const brand ink → AppButton lifts this into the green
                        // ACTION gradient in BOTH themes; the label colour is
                        // picked contrast-aware by AppButton (no pinned white),
                        // and the corner falls back to the shared button token.
                        color: AppColors.primary,
                        textStyle: ffTheme.titleSmall,
                      ),
                    ),
                    const SizedBox(width: 12),
                    // Icon-only control → explicit accessible name + toggle
                    // state for screen readers (the icon alone says nothing).
                    Semantics(
                      button: true,
                      label: inCompare ? 'הסר מהשוואה' : 'הוסף להשוואה',
                      child: Pressable(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        appState.toggleCompare(plan.id);
                      },
                      // Active = the ONE green active language (tint + green
                      // border + green ink) — replaces the solid-ink fill with
                      // its per-theme pinned-white icon gymnastics.
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: inCompare
                              ? ffTheme.brandAccentTint
                              : ffTheme.secondaryBackground,
                          border: Border.all(
                              color: inCompare
                                  ? ffTheme.brandAccent
                                  : ffTheme.alternate,
                              width: 1.5),
                          borderRadius:
                              BorderRadius.circular(ffTheme.radiusMd),
                        ),
                        child: Icon(
                          inCompare ? Icons.check_rounded : Icons.add_rounded,
                          color: inCompare
                              ? ffTheme.brandAccentText
                              : ffTheme.primary,
                          size: 24,
                        ),
                      ),
                    ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Emil settle for a plan-detail card: fade-in + an 8px upward settle under the
/// app's ease-out, optionally delayed so the stack cascades. Reduced-motion
/// KEEPS the fade but DROPS the transform (per `MediaQuery.disableAnimations`),
/// so the page still resolves cleanly with no translation for users who asked
/// for less movement. Used for the focal hero/price/value stack so each card
/// arrives with the same calm, decelerating settle rather than a bare fade.
Widget _settleCard(BuildContext context, Widget child, {int delayMs = 0, int durationMs = 320}) {
  final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
  final delay = delayMs.ms;
  if (reduceMotion) {
    return child.animate().fadeIn(delay: delay, duration: durationMs.ms);
  }
  return child
      .animate(delay: delay)
      .fadeIn(duration: durationMs.ms, curve: const Cubic(0.22, 1, 0.36, 1))
      .slideY(begin: 0.08, end: 0, duration: durationMs.ms, curve: const Cubic(0.22, 1, 0.36, 1));
}
