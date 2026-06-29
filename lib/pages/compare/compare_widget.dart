import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_sheet.dart';
import '../../widgets/app_sliver_header.dart';
import '../../widgets/refreshable_scroll.dart';
import '../../widgets/pressable.dart';
import '../../app_state.dart';
import '../../models.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../services/recommendation_engine.dart';
import '../../services/backend/local_backend.dart';
import '../../services/comparison_export.dart';
import '../../services/comparison_share.dart';

class CompareWidget extends StatelessWidget {
  const CompareWidget({super.key});

  MatchProfile _profileFor(Plan p, AppState appState) =>
      MatchProfile.fromAppState(appState, p.cat);

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final ids = appState.comparePlans;
    final plans = ids.map((id) => planById(id)).whereType<Plan>().toList();

    // Compute PlanMatch scores once, keyed by plan id.
    final Map<String, PlanMatch> matchMap = {
      for (final p in plans)
        p.id: RecommendationEngine.scorePlan(p, _profileFor(p, appState)),
    };

    // Winner = highest score; tie-break: higher annualSaving, then lower price.
    Plan? winner;
    if (plans.length >= 2) {
      winner = plans.reduce((a, b) {
        final ma = matchMap[a.id]!;
        final mb = matchMap[b.id]!;
        final byScore = mb.score.compareTo(ma.score);
        if (byScore != 0) return byScore < 0 ? a : b;
        final bySave = mb.annualSaving.compareTo(ma.annualSaving);
        if (bySave != 0) return bySave < 0 ? a : b;
        return a.price <= b.price ? a : b;
      });
    }
    final winnerId = winner?.id;

    // ── Single / empty state: keep the classic ink AppBar + empty card. The
    // collapsing hero is reserved for a real 2+ comparison (it carries the
    // winner's saving figure, which has no meaning with fewer than two plans).
    if (plans.length < 2) {
      return Scaffold(
        backgroundColor: ffTheme.background,
        appBar: AppBar(
          // Geist white header: flat surface + dark ink foreground (was ink hero).
          backgroundColor: ffTheme.cardSurface,
          foregroundColor: ffTheme.primaryText,
          title: Text('השוואת מסלולים',
              style: ffTheme.titleLarge.copyWith(color: ffTheme.primaryText)),
          actions: [
            if (plans.isNotEmpty)
              IconButton(
                icon: Icon(Icons.ios_share_rounded, color: ffTheme.primaryText),
                tooltip: 'שתף',
                onPressed: () => Share.share(_quickShareText(plans)),
              ),
            if (ids.isNotEmpty)
              TextButton(
                onPressed: appState.clearCompare,
                child: Text('נקה הכל',
                    style: ffTheme.labelMedium.copyWith(
                        color: ffTheme.secondaryText)),
              ),
          ],
        ),
        body: _EmptyState(
            ffTheme: ffTheme,
            hasPlan: plans.length == 1,
            firstPlan: plans.isEmpty ? null : plans.first),
      );
    }

    // ── Full comparison (2+ plans) ──────────────────────────────────────────
    // The hero saving figure shown in the collapsing header = the winner's
    // annual saving vs the user's own bill (the engine's number, not re-derived).
    final winnerBill = appState.currentBill(winner!.cat);
    final heroSave = winnerBill > 0 ? planSaveYear(winner, winnerBill) : 0;

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: Stack(
        children: [
          RefreshableScroll(
            // Re-derives the comparison from the live AppState/catalogue; the
            // spinner stays until the rebuilt frame settles.
            onRefresh: () async {
              HapticFeedback.selectionClick();
              await Future<void>.delayed(const Duration(milliseconds: 350));
            },
            slivers: [
              AppSliverHeader(
                title: 'השוואת מסלולים',
                subtitle: heroSave > 0 ? 'הזוכה: ${winner.provider}' : null,
                expandedHeight: heroSave > 0 ? 196 : 150,
                actions: [
                  _ShareMenu(plans: plans, appState: appState),
                  if (ids.isNotEmpty)
                    TextButton(
                      onPressed: appState.clearCompare,
                      child: Text('נקה הכל',
                          style: ffTheme.labelMedium.copyWith(
                              color: ffTheme.secondaryText)),
                    ),
                ],
                flexibleChild: heroSave > 0
                    ? _HeroSaving(saving: heroSave, ffTheme: ffTheme)
                    : null,
              ),
              SliverToBoxAdapter(
                child: _CompareTable(
                  plans: plans,
                  appState: appState,
                  ffTheme: ffTheme,
                  winnerId: winnerId,
                  matchMap: matchMap,
                ).animate().fadeIn(duration: 350.ms).slideY(
                    begin: 0.04, end: 0, curve: Curves.easeOutCubic),
              ),
              // Clear the pinned bottom CTA bar so the last rows aren't hidden.
              const SliverToBoxAdapter(child: SizedBox(height: 96)),
            ],
          ),
          // Sticky bottom primary CTA for the winner — mirrors the PlanDetail
          // bottom-bar pattern so the strongest action is always one tap away.
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: _WinnerCtaBar(winner: winner, ffTheme: ffTheme),
          ),
          // Track both compared plans once on mount.
          for (final p in plans)
            _PlanViewTracker(
                planId: p.id, provider: p.provider, category: p.cat),
        ],
      ),
    );
  }
}

// ── Hero saving figure (header flexibleChild) ──────────────────────────────────

/// The big "₪X/שנה" the collapsing [AppSliverHeader] carries for a 2+ compare —
/// the winner's annual saving vs the user's bill, dark-on-white on the Geist
/// header (value figure in savingText, caption in secondaryText).
class _HeroSaving extends StatelessWidget {
  const _HeroSaving({required this.saving, required this.ffTheme});
  final int saving;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '₪$saving',
          style: GoogleFonts.rubik(
            fontSize: 34,
            fontWeight: FontWeight.w800,
            color: ffTheme.savingText,
            letterSpacing: -1,
            height: 1.0,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'חיסכון שנתי עם ההמלצה',
          style: GoogleFonts.assistant(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: ffTheme.secondaryText,
          ),
        ),
      ],
    );
  }
}

// ── Sticky winner CTA bar ──────────────────────────────────────────────────────

/// The pinned bottom action bar for the focused/winner plan, mirroring the
/// PlanDetail sticky-bar pattern (card surface, top hairline, soft glass shadow,
/// SafeArea-guarded). Tapping routes to the Lead flow for the winner.
class _WinnerCtaBar extends StatelessWidget {
  const _WinnerCtaBar({required this.winner, required this.ffTheme});
  final Plan winner;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        decoration: BoxDecoration(
          color: ffTheme.cardSurface,
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(ffTheme.radiusXl)),
          border: Border(
              top: BorderSide(
                  color: ffTheme.primary.withValues(alpha: 0.06), width: 1)),
          boxShadow: ffTheme.shadowLifted,
        ),
        child: Row(
          children: [
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 12),
              child: LogoWidget(provider: winner.provider, size: 36),
            ),
            Expanded(
              child: Semantics(
                button: true,
                label:
                    'בחר את המסלול ${winner.plan} של ${winner.provider} — הזוכה',
                child: AppButton(
                  text: 'בחרו ב-${winner.provider} ←',
                  onPressed: () async {
                    HapticFeedback.lightImpact();
                    context.pushNamed('Lead',
                        pathParameters: {'planId': winner.id},
                        queryParameters: {'source': 'compare'});
                  },
                  height: 56,
                  // Const brand ink → AppButton lifts this into the green ACTION
                  // gradient + glow in BOTH themes (white-on-green).
                  color: AppColors.primary,
                  textStyle: ffTheme.titleSmall.copyWith(color: Colors.white),
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One-line share text for the single-plan fallback (no full export yet).
String _quickShareText(List<Plan> plans) =>
    'השוויתי ב-Switchy AI: '
    '${plans.map((p) => '${p.provider} ${p.plan} ₪${p.priceText}').join(' מול ')}';

// ── Share menu (PDF / text) ────────────────────────────────────────────────────

/// AppBar share affordance for a 2+ plan comparison. Offers a real PDF export
/// (structured, RTL, Hebrew-typeset) and a plain-text share, both built from the
/// pure [ComparisonExport]. PDF generation shows a brief spinner; failures fall
/// back to text so the user is never stuck.
class _ShareMenu extends StatefulWidget {
  const _ShareMenu({required this.plans, required this.appState});
  final List<Plan> plans;
  final AppState appState;

  @override
  State<_ShareMenu> createState() => _ShareMenuState();
}

class _ShareMenuState extends State<_ShareMenu> {
  bool _busy = false;

  ComparisonExport? _buildExport() =>
      ComparisonExport.build(widget.appState, widget.plans);

  Future<void> _sharePdf() async {
    final export = _buildExport();
    if (export == null) {
      _shareText(); // <2 plans shouldn't reach here, but stay safe.
      return;
    }
    setState(() => _busy = true);
    try {
      await ComparisonShare.sharePdf(export);
    } catch (_) {
      if (!mounted) return;
      // Graceful degradation: hand the user the text instead of failing silently.
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('יצירת ה-PDF נכשלה — שותף כטקסט')),
      );
      await Share.share(export.toShareText());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _printPdf() async {
    final export = _buildExport();
    if (export == null) return;
    setState(() => _busy = true);
    try {
      await ComparisonShare.printPdf(export);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ההדפסה אינה זמינה במכשיר זה')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _shareText() {
    final export = _buildExport();
    Share.share(export?.toShareText() ?? _quickShareText(widget.plans));
  }

  /// The three real share actions, opened as a bottom sheet. Each row preserves
  /// its exact behaviour (PDF export, print, plain-text), including the
  /// PDF-fail-to-text fallback inside [_sharePdf].
  void _openShareSheet() {
    HapticFeedback.lightImpact();
    AppSheet.actions(
      context,
      title: 'שיתוף ההשוואה',
      actions: [
        AppSheetAction(
          icon: Icons.picture_as_pdf_rounded,
          label: 'שתף כ-PDF',
          onTap: _sharePdf,
        ),
        AppSheetAction(
          icon: Icons.print_rounded,
          label: 'הדפס',
          onTap: _printPdf,
        ),
        AppSheetAction(
          icon: Icons.short_text_rounded,
          label: 'שתף כטקסט',
          onTap: _shareText,
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    // Busy: the in-flight PDF/print spinner sits where the share button was so
    // the header doesn't reflow (>=48dp tap-target footprint preserved).
    if (_busy) {
      return SizedBox(
        width: kMinTapTarget,
        height: kMinTapTarget,
        child: Center(
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
                strokeWidth: 2, color: ffTheme.primaryText),
          ),
        ),
      );
    }
    return IconButton(
      icon: Icon(Icons.ios_share_rounded, color: ffTheme.primaryText),
      tooltip: 'שתף',
      onPressed: _openShareSheet,
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.ffTheme, this.hasPlan = false, this.firstPlan});
  final AppTheme ffTheme;
  final bool hasPlan;
  final Plan? firstPlan;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(height: 20),
            Container(
              width: 112,
              height: 112,
              decoration: BoxDecoration(
                // GEIST: neutral tint surface (was a decorative ink-tint backdrop).
                color: ffTheme.accent1,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.compare_arrows_rounded,
                size: 56,
                color: hasPlan
                    ? ffTheme.primaryText
                    : ffTheme.secondaryText,
              ),
            ).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.7, 0.7)),
            const SizedBox(height: 24),
            Text(hasPlan ? 'מסלול אחד בסל' : 'בחר 2–3 מסלולים מהתוצאות',
                    style: ffTheme.headlineSmall.copyWith(color: ffTheme.secondaryText),
                    textAlign: TextAlign.center)
                .animate().fadeIn(delay: 150.ms),
            const SizedBox(height: 12),
            Text(
              hasPlan ? 'הוסף מסלול נוסף להשוואה — לחץ + בכרטיס מסלול' : 'לחץ על + בכרטיס של כל מסלול\nלהוספה לסל ההשוואה',
              style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText),
              textAlign: TextAlign.center,
            ).animate().fadeIn(delay: 200.ms),
            if (hasPlan && firstPlan != null) ...[
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: ffTheme.cardDecoration(
                  radius: ffTheme.radiusCard,
                  borderColor: ffTheme.primary.withValues(alpha: 0.20),
                ),
                child: Row(
                  children: [
                    LogoWidget(provider: firstPlan!.provider, size: 40),
                    const SizedBox(width: 12),
                    Expanded(child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(firstPlan!.provider, style: ffTheme.titleSmall),
                        Text(firstPlan!.plan, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    )),
                    Text('₪${firstPlan!.priceText}', style: ffTheme.titleMedium.copyWith(color: ffTheme.primary)),
                  ],
                ),
              ).animate().fadeIn(delay: 250.ms),
            ],
            const SizedBox(height: 32),
            AppButton(
              text: hasPlan ? 'הוסף מסלול נוסף ←' : 'חזרה לתוצאות',
              onPressed: () async => context.goNamed('Results'),

                // Const brand ink → green ACTION gradient in both themes.
                color: AppColors.primary,
                textStyle: ffTheme.titleSmall.copyWith(color: Colors.white),
                borderRadius: BorderRadius.circular(14),
                height: 52,

            ).animate().fadeIn(delay: 300.ms),
          ],
        ),
      ),
    );
  }
}

// ── Compare table ─────────────────────────────────────────────────────────────

/// Shared geometry for the frozen-column matrix. The first (label) column is
/// pinned — it never scrolls — while every per-plan column is the same width and
/// scrolls horizontally in lockstep across all strips (header, rows, specs, CTA,
/// features) via a linked group of [ScrollController]s (see [_LinkedHScroll]).
const double _kLabelColW = 104;
const double _kPlanColW = 150;

/// Keeps several horizontal scroll views in lockstep WITHOUT a third-party
/// package. A single [ScrollController] can't legally attach to more than one
/// scrollable at once, so each matrix strip gets its OWN controller from
/// [vend]; whenever one moves, the group mirrors its offset onto the others and
/// publishes the [fraction] (0…1 of the scroll extent) for the scroll
/// affordance. A re-entrancy guard prevents the mirror writes from echoing.
class _LinkedHScroll {
  final List<ScrollController> _controllers = [];
  bool _syncing = false;

  /// 0 (start) … 1 (end) of the horizontal extent, and whether the band is
  /// actually overflowing. Drives the edge fades + dot rail.
  final ValueNotifier<double> fraction = ValueNotifier<double>(0);
  final ValueNotifier<bool> scrollable = ValueNotifier<bool>(false);

  /// Creates and registers a controller for one strip. Dispose via [dispose].
  ScrollController vend() {
    final c = ScrollController();
    c.addListener(() => _onMoved(c));
    _controllers.add(c);
    return c;
  }

  void _onMoved(ScrollController source) {
    if (_syncing || !source.hasClients) return;
    _syncing = true;
    final offset = source.offset;
    for (final c in _controllers) {
      if (c == source || !c.hasClients) continue;
      // Clamp to the peer's own extent so a shorter band can't be jumped past
      // its end (extents match in practice, but stay safe).
      final max = c.position.maxScrollExtent;
      final target = offset.clamp(0.0, max);
      if ((c.offset - target).abs() > 0.5) c.jumpTo(target);
    }
    _syncing = false;
    _publish(source);
  }

  /// Recompute the public fraction/scrollable from any attached controller.
  void publishFrom(ScrollController c) => _publish(c);

  void _publish(ScrollController c) {
    if (!c.hasClients) return;
    final max = c.position.maxScrollExtent;
    final canScroll = max > 1;
    scrollable.value = canScroll;
    fraction.value = canScroll ? (c.offset / max).clamp(0.0, 1.0) : 0.0;
  }

  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    _controllers.clear();
    fraction.dispose();
    scrollable.dispose();
  }
}

class _CompareTable extends StatefulWidget {
  const _CompareTable({
    required this.plans,
    required this.appState,
    required this.ffTheme,
    required this.winnerId,
    required this.matchMap,
  });
  final List<Plan> plans;
  final AppState appState;
  final AppTheme ffTheme;
  final String? winnerId;
  final Map<String, PlanMatch> matchMap;

  @override
  State<_CompareTable> createState() => _CompareTableState();
}

class _CompareTableState extends State<_CompareTable> {
  // One linked group keeps every horizontal strip in lockstep, so the frozen
  // label column and the plan columns stay row-aligned no matter which strip
  // the user drags. (A single controller can't attach to >1 scrollable.)
  final _LinkedHScroll _hGroup = _LinkedHScroll();

  List<Plan> get plans => widget.plans;
  AppState get appState => widget.appState;
  AppTheme get ffTheme => widget.ffTheme;
  String? get winnerId => widget.winnerId;
  Map<String, PlanMatch> get matchMap => widget.matchMap;

  @override
  void dispose() {
    _hGroup.dispose();
    super.dispose();
  }

  // Canonical spec key order; any extra keys are appended alphabetically.
  static const _canonicalSpecOrder = [
    'נתונים', 'דקות', 'SMS', 'מהירות', 'ערוצים', 'ממירים', 'VOD', 'חו"ל',
  ];

  /// Returns spec keys present in at least one plan, in canonical order first,
  /// then remaining keys sorted alphabetically.
  List<String> _specKeyUnion(List<Plan> plans) {
    final allKeys = <String>{};
    for (final p in plans) {
      allKeys.addAll(p.specs.keys);
    }
    if (allKeys.isEmpty) return const [];

    final result = <String>[];
    for (final k in _canonicalSpecOrder) {
      if (allKeys.contains(k)) result.add(k);
    }
    final remaining = allKeys.difference(result.toSet()).toList()..sort();
    result.addAll(remaining);
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final mixedCats = plans.map((p) => p.cat).toSet().length > 1;

    // Compute spec union once, outside builders.
    final specKeys = _specKeyUnion(plans);

    final rows = <_Row>[
      _Row('מחיר', plans.map((p) => '₪${p.priceText}/${priceUnitShort(p)}').toList()),
      _Row('לאחר מבצע',
          plans.map((p) => p.hasPromo ? '₪${p.afterText}' : 'קבוע').toList()),
      _Row('התחייבות',
          plans.map((p) => p.commitmentLabel).toList()),
      _Row('חיסכון שנתי',
          plans.map((p) {
            final bill = appState.currentBill(p.cat);
            return bill > 0 ? '₪${planSaveYear(p, bill)}' : '—';
          }).toList(),
          isHighlight: true),
      _Row('רשת', plans.map((p) => p.netLabel).toList()),
      // Equipment / setup fees — the kamaze "ציוד / עלויות נלוות" parity. We show
      // a compact summary of the real plan.fees, or '—' when the plan has none.
      _Row('ציוד ועמלות',
          plans.map((p) {
            if (p.fees.isEmpty) return '—';
            return p.fees.entries.map((e) => '${e.key} ${e.value}').join('\n');
          }).toList()),
      _Row('ללא התחייבות',
          plans.map((p) => p.noCommit ? '✓' : '—').toList()),
      _Row('5G', plans.map((p) => p.is5G ? '✓' : '—').toList()),
      _Row('חו"ל', plans.map((p) => p.hasAbroad ? '✓' : '—').toList()),
    ];

    // Root is a plain Column now — the page's vertical scroll is owned by the
    // outer RefreshableScroll (this widget lives in a SliverToBoxAdapter). The
    // matrix below keeps the side-by-side spec/price comparison (the screen's
    // core), but with a FROZEN first column (row labels) and the plan columns
    // scrolling horizontally in lockstep across every strip via [_hGroup], so the
    // user never loses the "which row is this?" context while panning plans.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── Winner summary card ───────────────────────────────────────────
        _WinnerSummaryCard(
          plans: plans,
          winnerId: winnerId,
          appState: appState,
          ffTheme: ffTheme,
          matchMap: matchMap,
        ),

        // ── Header strip — frozen empty label cell + scrolling plan headers ──
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          child: _FrozenMatrixStrip(
            group: _hGroup,
            ffTheme: ffTheme,
            planColWidth: _kPlanColW,
            crossAxisAlignment: CrossAxisAlignment.start,
            // The header carries the shared dot rail (only one strip should).
            showDots: true,
            // Empty corner above the row labels keeps the grid aligned.
            label: const SizedBox(width: _kLabelColW),
            cells: plans.map((p) {
              final isWinner = p.id == winnerId;
              return _PlanHeader(
                plan: p,
                isWinner: isWinner,
                ffTheme: ffTheme,
                appState: appState,
                match: matchMap[p.id],
              );
            }).toList(),
          ),
        ),

        // ── Main rows — each row keeps its label frozen on the start edge ──
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: _FrozenRowGroup(
            group: _hGroup,
            ffTheme: ffTheme,
            rows: [
              for (final e in rows.asMap().entries)
                _RowWidget(
                  row: e.value,
                  plans: plans,
                  winnerId: winnerId,
                  ffTheme: ffTheme,
                  isAlt: e.key.isOdd,
                ),
            ],
          ),
        ),

        // ── Spec rows (מפרט) ────────────────────────────────────────────────
        if (specKeys.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
            child: Row(
              children: [
                Icon(Icons.tune_rounded, size: 14, color: ffTheme.secondaryText),
                const SizedBox(width: 6),
                Text(
                  'מפרט',
                  style: ffTheme.labelSmall.copyWith(
                    color: ffTheme.secondaryText,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
            child: _FrozenRowGroup(
              group: _hGroup,
              ffTheme: ffTheme,
              rows: [
                for (final e in specKeys.asMap().entries)
                  _RowWidget(
                    row: _Row(
                      e.value,
                      plans.map((p) => p.specs[e.value] ?? '—').toList(),
                    ),
                    plans: plans,
                    winnerId: winnerId,
                    ffTheme: ffTheme,
                    // Continue alternating tint from where main rows left off.
                    isAlt: (rows.length + e.key).isOdd,
                  ),
              ],
            ),
          ),
        ] else
          const SizedBox(height: 16),

        // Mixed-category notice
        if (mixedCats)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: ffTheme.warning.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: ffTheme.warning.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline_rounded, size: 16, color: ffTheme.warning),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'אתה משווה מסלולים מקטגוריות שונות',
                      style: ffTheme.labelSmall.copyWith(color: ffTheme.warning, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ),

        // ── CTA strip — frozen empty label cell + scrolling per-plan buttons ──
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: _FrozenMatrixStrip(
            group: _hGroup,
            ffTheme: ffTheme,
            planColWidth: _kPlanColW,
            label: const SizedBox(width: _kLabelColW),
            cells: plans.map((p) {
              final isWinner = p.id == winnerId;
              return Padding(
                padding: const EdgeInsetsDirectional.only(start: 10),
                child: Semantics(
                  button: true,
                  label: 'בחר את המסלול ${p.plan} של ${p.provider}',
                  child: ElevatedButton(
                    onPressed: () {
                      HapticFeedback.lightImpact();
                      context.pushNamed('Lead', pathParameters: {'planId': p.id}, queryParameters: {'source': 'compare'});
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isWinner
                          ? ffTheme.primary
                          : ffTheme.cardSurface,
                      foregroundColor: isWinner
                          ? (ffTheme.dark ? ffTheme.background : Colors.white)
                          : ffTheme.primaryText,
                      elevation: 0,
                      // Raise the per-plan select control to the accessible
                      // minimum tap target so it's comfortable on mobile.
                      minimumSize: const Size(0, kMinTapTarget),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(
                            color: isWinner
                                ? ffTheme.primary
                                : ffTheme.alternate),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: Text(
                      'בחר ←',
                      style: ffTheme.titleSmall.copyWith(
                          color: isWinner
                              ? (ffTheme.dark ? ffTheme.background : Colors.white)
                              : ffTheme.primaryText),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),

        // Perks comparison ("מה כלול בכל מסלול"). Sourced from the truth-only
        // [Plan.perksList] (web-parity), NOT raw feats — so the raw spec tokens
        // (volume / minutes / speed / 5G) that already appear in their own
        // price/spec rows are filtered out, and only the qualitative perks show.
        if (plans.any((p) => p.perksList().isNotEmpty)) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Divider(color: ffTheme.alternate),
                const SizedBox(height: 8),
                Text('מה כלול בכל מסלול', style: ffTheme.titleSmall.copyWith(color: ffTheme.secondaryText, fontWeight: FontWeight.w600)),
                const SizedBox(height: 12),
                _FrozenMatrixStrip(
                  group: _hGroup,
                  ffTheme: ffTheme,
                  planColWidth: _kPlanColW,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  label: const SizedBox(width: _kLabelColW),
                  cells: plans.map((p) => Padding(
                    padding: const EdgeInsetsDirectional.only(start: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: p.perksList().map((f) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.check_rounded, size: 14, color: p.id == winnerId ? ffTheme.primary : ffTheme.secondaryText),
                            const SizedBox(width: 4),
                            Expanded(child: Text(f, style: ffTheme.labelSmall.copyWith(
                              color: p.id == winnerId ? ffTheme.primaryText : ffTheme.secondaryText,
                            ))),
                          ],
                        ),
                      )).toList(),
                    ),
                  )).toList(),
                ),
              ],
            ),
          ),
        ] else
          const SizedBox(height: 32),
      ],
    );
  }
}

// ── Frozen-column matrix primitives ─────────────────────────────────────────────

/// A single matrix strip: a FROZEN [label] cell pinned to the start edge, plus a
/// horizontally-scrolling band of plan [cells]. The band's controller is vended
/// from the shared [group] so this strip pans in lockstep with every other strip.
/// Wrapped in [_ScrollAffordance] so the band shows an edge fade (and, on the
/// [showDots] strip, a dot rail) hinting there are more plans off-screen. Used
/// for the header, CTA and features bands; the row groups use [_FrozenRowGroup].
class _FrozenMatrixStrip extends StatefulWidget {
  const _FrozenMatrixStrip({
    required this.group,
    required this.ffTheme,
    required this.label,
    required this.cells,
    required this.planColWidth,
    this.crossAxisAlignment = CrossAxisAlignment.center,
    this.showDots = false,
  });

  final _LinkedHScroll group;
  final AppTheme ffTheme;
  final Widget label;
  final List<Widget> cells;

  /// Width given to each per-plan cell, so columns line up across every strip.
  final double planColWidth;
  final CrossAxisAlignment crossAxisAlignment;

  /// Whether this strip carries the shared dot rail (only one strip should).
  final bool showDots;

  @override
  State<_FrozenMatrixStrip> createState() => _FrozenMatrixStripState();
}

class _FrozenMatrixStripState extends State<_FrozenMatrixStrip> {
  late final ScrollController _ctrl = widget.group.vend();

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: widget.crossAxisAlignment,
      children: [
        // Frozen label cell — stays put while the plan band scrolls.
        widget.label,
        Expanded(
          child: _ScrollAffordance(
            group: widget.group,
            controller: _ctrl,
            ffTheme: widget.ffTheme,
            showDots: widget.showDots,
            child: SingleChildScrollView(
              controller: _ctrl,
              scrollDirection: Axis.horizontal,
              // iOS-style rubber-band so the horizontal pan feels native.
              physics: const BouncingScrollPhysics(),
              child: Row(
                crossAxisAlignment: widget.crossAxisAlignment,
                children: [
                  for (final c in widget.cells)
                    SizedBox(width: widget.planColWidth, child: c),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// A group of [_RowWidget]s sharing ONE horizontal scroll for their plan cells,
/// with each row's label frozen on the start edge. Splitting the label out of
/// the scroll view (instead of scrolling a fixed-width spacer with the plans) is
/// what gives the matrix a true frozen first column. Its controller is vended
/// from [group] so it pans in lockstep with the header/CTA/features bands.
class _FrozenRowGroup extends StatefulWidget {
  const _FrozenRowGroup({
    required this.group,
    required this.ffTheme,
    required this.rows,
  });

  final _LinkedHScroll group;
  final AppTheme ffTheme;
  final List<_RowWidget> rows;

  @override
  State<_FrozenRowGroup> createState() => _FrozenRowGroupState();
}

class _FrozenRowGroupState extends State<_FrozenRowGroup> {
  late final ScrollController _ctrl = widget.group.vend();

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Frozen label column: the row labels stacked, pinned in place. Each
        // label cell sets its own fixed width (_kLabelColW), so the column sizes
        // to that — never stretch (the parent Row gives unbounded width).
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [for (final r in widget.rows) r.frozenLabel()],
        ),
        Expanded(
          child: _ScrollAffordance(
            group: widget.group,
            controller: _ctrl,
            ffTheme: widget.ffTheme,
            child: SingleChildScrollView(
              controller: _ctrl,
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [for (final r in widget.rows) r.scrollingValues()],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Subtle "there's more to the side" affordance for a horizontally-scrolling
/// band: a soft edge fade on whichever side has hidden content, plus (when
/// [showDots]) a compact dot rail under the band that fills as the user scrolls.
/// Purely decorative — it never intercepts the scroll gesture, and reads its
/// state from the shared [group] so every band agrees. Hidden entirely when
/// nothing is clipped, so a short/complete band stays clean.
class _ScrollAffordance extends StatefulWidget {
  const _ScrollAffordance({
    required this.group,
    required this.controller,
    required this.ffTheme,
    required this.child,
    this.showDots = false,
  });
  final _LinkedHScroll group;
  final ScrollController controller;
  final AppTheme ffTheme;
  final Widget child;
  final bool showDots;

  @override
  State<_ScrollAffordance> createState() => _ScrollAffordanceState();
}

class _ScrollAffordanceState extends State<_ScrollAffordance> {
  @override
  void initState() {
    super.initState();
    // The viewport isn't measured on the first frame; publish once laid out so
    // the group's notifiers reflect whether this band actually overflows.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && widget.controller.hasClients) {
        widget.group.publishFrom(widget.controller);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final ff = widget.ffTheme;
    final fadeColor = ff.background;

    return ValueListenableBuilder<bool>(
      valueListenable: widget.group.scrollable,
      builder: (context, scrollable, _) {
        return ValueListenableBuilder<double>(
          valueListenable: widget.group.fraction,
          builder: (context, frac, _) {
            // Under RTL the scroll "start" is the right edge, "end" the left —
            // so the fades map to physical right (start) / left (end).
            final showStartFade = scrollable && frac > 0.02;
            final showEndFade = scrollable && frac < 0.98;
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Stack(
                  children: [
                    widget.child,
                    // RIGHT edge fade (scroll start under RTL).
                    if (showStartFade)
                      PositionedDirectional(
                        start: 0,
                        top: 0,
                        bottom: 0,
                        child: _EdgeFade(color: fadeColor, toStart: true),
                      ),
                    // LEFT edge fade (scroll end under RTL).
                    if (showEndFade)
                      PositionedDirectional(
                        end: 0,
                        top: 0,
                        bottom: 0,
                        child: _EdgeFade(color: fadeColor, toStart: false),
                      ),
                  ],
                ),
                if (widget.showDots && scrollable) ...[
                  const SizedBox(height: 8),
                  _ScrollDots(fraction: frac, ffTheme: ff),
                ],
              ],
            );
          },
        );
      },
    );
  }
}

/// A 24dp-wide horizontal gradient from [color] (opaque, at the band edge) to
/// transparent, hinting clipped content. [toStart] points the opaque side to the
/// directional start (right under RTL); otherwise to the end (left).
class _EdgeFade extends StatelessWidget {
  const _EdgeFade({required this.color, required this.toStart});
  final Color color;
  final bool toStart;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: 24,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: toStart
                ? AlignmentDirectional.centerStart
                : AlignmentDirectional.centerEnd,
            end: toStart
                ? AlignmentDirectional.centerEnd
                : AlignmentDirectional.centerStart,
            colors: [color, color.withValues(alpha: 0)],
          ),
        ),
      ),
    );
  }
}

/// A compact dot rail under a scrolling band. A pale track of three dots with a
/// single brand-green thumb that glides across as [fraction] (0…1) advances —
/// a quiet "more plans this way" tell that mirrors a page indicator.
class _ScrollDots extends StatelessWidget {
  const _ScrollDots({required this.fraction, required this.ffTheme});
  final double fraction;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    const trackW = 44.0;
    const dotR = 3.0;
    return ExcludeSemantics(
      child: Align(
        alignment: Alignment.center,
        child: SizedBox(
          width: trackW,
          height: 8,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Pale track.
              Container(
                height: 2,
                decoration: BoxDecoration(
                  color: ffTheme.alternate,
                  borderRadius: BorderRadius.circular(1),
                ),
              ),
              // Gliding thumb — left/right is physical, fraction follows the
              // RTL scroll direction so it reads "moving with my finger".
              Align(
                alignment: Alignment(-1 + fraction * 2, 0),
                child: Container(
                  width: dotR * 2,
                  height: dotR * 2,
                  decoration: BoxDecoration(
                    color: ffTheme.brandAccent,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Winner summary card ────────────────────────────────────────────────────────

class _WinnerSummaryCard extends StatelessWidget {
  const _WinnerSummaryCard({
    required this.plans,
    required this.winnerId,
    required this.appState,
    required this.ffTheme,
    required this.matchMap,
  });
  final List<Plan> plans;
  final String? winnerId;
  final AppState appState;
  final AppTheme ffTheme;
  final Map<String, PlanMatch> matchMap;

  @override
  Widget build(BuildContext context) {
    final winner = plans.firstWhere((p) => p.id == winnerId, orElse: () => plans.first);
    final winnerBill = appState.currentBill(winner.cat);
    final winnerSave = winnerBill > 0 ? planSaveYear(winner, winnerBill) : 0;
    final maxPrice = plans.map((p) => p.price).reduce((a, b) => a > b ? a : b).toDouble();
    final winnerMatch = matchMap[winner.id];

    // Derive comparative superlatives that are TRUE for the winner.
    final superlatives = <String>[];
    final minPrice = plans.map((p) => p.price).reduce((a, b) => a < b ? a : b);
    if (winner.price == minPrice && plans.where((p) => p.price == minPrice).length == 1) {
      superlatives.add('המחיר הזול ביותר');
    }

    final maxSaving = plans.map((p) => planSaveYear(p, appState.currentBill(p.cat))).reduce((a, b) => a > b ? a : b);
    if (maxSaving > 0 && winnerSave == maxSaving && plans.where((p) => planSaveYear(p, appState.currentBill(p.cat)) == maxSaving).length == 1) {
      superlatives.add('החיסכון הגדול ביותר');
    }

    // Top 2–3 reasons from the engine.
    final topReasons = winnerMatch != null ? winnerMatch.reasons.take(3).toList() : <String>[];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Champion banner
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              // Flat ink hero — theme-locked near-black in BOTH themes (the
              // bespoke [primaryDark, primary] wash inverted to off-white on
              // dark, breaking the white-on-ink foreground).
              gradient: ffTheme.freshGradient,
              borderRadius: BorderRadius.circular(ffTheme.radiusCard),
              boxShadow: ffTheme.shadowLifted,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    // The win state wears the VALUE accent (amber), not grey.
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                      decoration: BoxDecoration(color: ffTheme.saving, borderRadius: BorderRadius.circular(ffTheme.radiusPill)),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.emoji_events_rounded, size: 13, color: ffTheme.onSaving),
                          const SizedBox(width: 4),
                          Text('ההמלצה שלנו', style: ffTheme.labelSmall.copyWith(color: ffTheme.onSaving, fontWeight: FontWeight.w800)),
                        ],
                      ),
                    ),
                    const Spacer(),
                    if (winnerSave > 0)
                      Text('חיסכון ₪$winnerSave/שנה',
                          style: GoogleFonts.rubik(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: ffTheme.saving,
                              fontFeatures: const [FontFeature.tabularFigures()])),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
                      child: LogoWidget(provider: winner.provider, size: 40),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(winner.provider, style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
                          Text(winner.plan, style: GoogleFonts.assistant(fontSize: 12, color: Colors.white70), maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('₪${winner.priceText}', style: GoogleFonts.rubik(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -1)),
                        Text(priceUnitLabel(winner), style: GoogleFonts.assistant(fontSize: 11, color: Colors.white60)),
                      ],
                    ),
                  ],
                ),

                // ── "Why winner wins" explanation block ───────────────────
                if (topReasons.isNotEmpty || superlatives.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'למה ${winner.provider} מנצח?',
                          style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white),
                        ),
                        const SizedBox(height: 8),
                        // Engine reasons — green-tinted check reads as "pro" on the
                        // dark hero (white on white-wash chip).
                        ...topReasons.map((r) => Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(Icons.check_circle_rounded, size: 15, color: Colors.white),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(r, style: GoogleFonts.assistant(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ),
                        )),
                        // Comparative superlatives wear the VALUE accent (amber).
                        ...superlatives.take(2).map((s) => Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.star_rounded, size: 15, color: ffTheme.saving),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(s, style: GoogleFonts.assistant(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ),
                        )),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 14),
                ElevatedButton(
                  onPressed: () {
                    HapticFeedback.lightImpact();
                    context.pushNamed('Lead', pathParameters: {'planId': winner.id}, queryParameters: {'source': 'compare'});
                  },
                  style: ElevatedButton.styleFrom(
                    // Sits on the permanently-ink hero in both themes, so the
                    // on-hero contrast pair is fixed (white fill, ink label).
                    backgroundColor: Colors.white,
                    foregroundColor: AppColors.primary,
                    minimumSize: const Size(double.infinity, 46),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  child: Text('בחר מסלול זה ←', style: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.primary)),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.1, end: 0),

          const SizedBox(height: 16),

          // Price bars comparison
          Text('השוואת מחירים', style: ffTheme.titleSmall.copyWith(color: ffTheme.secondaryText, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          ...plans.map((p) {
            final fraction = maxPrice > 0 ? p.price / maxPrice : 0.0;
            final isWinner = p.id == winnerId;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  SizedBox(
                    width: 80,
                    child: Text(p.provider, style: ffTheme.labelSmall.copyWith(
                      color: isWinner ? ffTheme.primary : ffTheme.secondaryText,
                      fontWeight: isWinner ? FontWeight.w700 : FontWeight.w500,
                    ), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: fraction,
                        // Track stays a pale glass tint; winner is full ink, the
                        // rest slate — a clean two-step ramp, no colour.
                        backgroundColor: ffTheme.accent2,
                        valueColor: AlwaysStoppedAnimation(isWinner ? ffTheme.primary : ffTheme.tertiary),
                        minHeight: isWinner ? 10 : 8,
                      ),
                    ).animate(delay: 200.ms).slideX(begin: -0.3, end: 0, duration: 400.ms),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 56,
                    child: Text('₪${p.priceText}', style: ffTheme.labelSmall.copyWith(
                      color: isWinner ? ffTheme.primary : ffTheme.primaryText,
                      fontWeight: isWinner ? FontWeight.w800 : FontWeight.w600,
                    ), textAlign: TextAlign.end),
                  ),
                  if (isWinner)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(end: 4),
                      child: Icon(Icons.star_rounded, size: 14, color: ffTheme.saving),
                    )
                  else
                    const SizedBox(width: 18),
                ],
              ),
            );
          }),

          const SizedBox(height: 4),
          Divider(color: ffTheme.alternate),
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}

// ── Plan header ────────────────────────────────────────────────────────────────

class _PlanHeader extends StatelessWidget {
  const _PlanHeader({
    required this.plan,
    required this.isWinner,
    required this.ffTheme,
    required this.appState,
    this.match,
  });
  final Plan plan;
  final bool isWinner;
  final AppTheme ffTheme;
  final AppState appState;
  final PlanMatch? match;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'פתח את פרטי המסלול ${plan.plan} של ${plan.provider}',
      child: Pressable(
      // Callback fires its own lightImpact; keep the press silent to avoid a
      // double-buzz. Adds the tactile scale-on-press the bare GestureDetector lacked.
      haptic: false,
      onTap: () {
        HapticFeedback.lightImpact();
        context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id});
      },
      child: Container(
      // Width comes from the matrix strip's per-plan column (_kPlanColW); the
      // start margin keeps the original inter-column gap, so the card renders at
      // its prior 140dp visual width inside the 150dp column.
      margin: const EdgeInsetsDirectional.only(start: 10),
      padding: const EdgeInsets.all(14),
      decoration: isWinner
          ? BoxDecoration(
              // GEIST: flat amber VALUE win state — tint + 2px amber border, no
              // glow (the bespoke amber drop-shadow contradicted the flat standard).
              color: ffTheme.saving.withValues(alpha: ffTheme.dark ? 0.16 : 0.10),
              borderRadius: BorderRadius.circular(ffTheme.radiusLg),
              border: Border.all(color: ffTheme.saving, width: 2),
            )
          : ffTheme.cardDecoration(),
      child: Column(
        children: [
          if (isWinner)
            Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: ffTheme.saving,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.emoji_events_rounded,
                      size: 13, color: ffTheme.onSaving),
                  const SizedBox(width: 4),
                  Text('זוכה',
                      style: ffTheme.labelSmall.copyWith(
                          color: ffTheme.onSaving,
                          fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          LogoWidget(provider: plan.provider, size: 44),
          const SizedBox(height: 6),
          Text(plan.provider,
              style: ffTheme.labelSmall
                  .copyWith(fontWeight: FontWeight.w700),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis),
          // Match score badge
          if (match != null) ...[
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                // Winner: ink chip + white text. Others: light-grey chip + dark
                // text (never grey-on-dark — keeps the % legible).
                color: isWinner ? ffTheme.primary : ffTheme.secondary,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '${match!.scorePct}% התאמה',
                style: ffTheme.labelSmall.copyWith(
                  color: isWinner
                      ? (ffTheme.dark ? ffTheme.background : Colors.white)
                      : ffTheme.primaryText,
                  fontWeight: isWinner ? FontWeight.w700 : FontWeight.w600,
                  fontSize: isWinner ? null : 10,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ],
          const SizedBox(height: 2),
          // Remove-from-compare: the glyph stays 18dp but the hit area is raised
          // to the min tap target so the small "×" is comfortably tappable.
          Semantics(
            button: true,
            label: 'הסר מהשוואה',
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {
                HapticFeedback.selectionClick();
                appState.toggleCompare(plan.id);
              },
              child: SizedBox(
                width: kMinTapTarget,
                height: kMinTapTarget,
                child: Icon(Icons.close_rounded,
                    size: 18, color: ffTheme.secondaryText),
              ),
            ),
          ),
        ],
      ),
      ),
      ),
    );
  }
}

class _Row {
  const _Row(this.label, this.values, {this.isHighlight = false});
  final String label;
  final List<String> values;
  final bool isHighlight;
}

/// One comparison row, split into a FROZEN label cell ([frozenLabel]) and a
/// horizontally-scrolling band of value cells ([scrollingValues]). The two are
/// rendered in separate columns ([_FrozenRowGroup]) so the label stays pinned
/// while plans pan — to keep them row-aligned, BOTH halves share the same fixed
/// [_kRowMinH] height and the same per-row alternating tint.
class _RowWidget extends StatelessWidget {
  const _RowWidget({
    required this.row,
    required this.plans,
    required this.winnerId,
    required this.ffTheme,
    required this.isAlt,
  });
  final _Row row;
  final List<Plan> plans;
  final String? winnerId;
  final AppTheme ffTheme;
  final bool isAlt;

  // Shared FIXED row height so the frozen label column and the scrolling value
  // column line up cell-for-cell. It's fixed (not a minimum) so a tall value —
  // e.g. multi-line fees — can never make the scrolling band's row outgrow the
  // frozen label's row and shear the grid; value text is capped to fit.
  static const double _kRowH = 48;

  Color get _tint =>
      isAlt ? ffTheme.accent1.withValues(alpha: 0.5) : ffTheme.cardSurface;

  /// The pinned label cell for the frozen first column.
  Widget frozenLabel() {
    return Container(
      width: _kLabelColW,
      height: _kRowH,
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(
        color: _tint,
        // Round only the start side; the end butts against the scrolling band.
        borderRadius: const BorderRadiusDirectional.horizontal(
          start: Radius.circular(8),
        ),
      ),
      alignment: AlignmentDirectional.centerStart,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      child: Text(row.label,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
    );
  }

  /// The scrolling value cells for this row (one fixed-width cell per plan).
  Widget scrollingValues() {
    return Container(
      height: _kRowH,
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(
        color: _tint,
        borderRadius: const BorderRadiusDirectional.horizontal(
          end: Radius.circular(8),
        ),
      ),
      child: Row(
        children: [
          for (final e in row.values.asMap().entries)
            _valueCell(e.key, e.value),
        ],
      ),
    );
  }

  Widget _valueCell(int idx, String v) {
    final plan = plans[idx];
    final isWinner = plan.id == winnerId;

    Color textColor = ffTheme.primaryText;
    if (v == '✓') textColor = ffTheme.primary;
    if (v == '—') textColor = ffTheme.secondaryText;
    if (row.isHighlight && isWinner) textColor = ffTheme.primary;

    return SizedBox(
      width: _kPlanColW,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Center(
          child: row.isHighlight
              ? Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    // Savings highlight wears the VALUE accent (amber) for the
                    // winner; others stay a quiet glass tint.
                    color: isWinner
                        ? ffTheme.saving.withValues(alpha: 0.18)
                        : ffTheme.background,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    v,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ffTheme.labelSmall.copyWith(
                      color:
                          isWinner ? ffTheme.savingDark : ffTheme.secondaryText,
                      fontWeight:
                          isWinner ? FontWeight.w800 : FontWeight.w500,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                    textAlign: TextAlign.center,
                  ),
                )
              : Text(
                  v,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: ffTheme.bodySmall.copyWith(
                    color: textColor,
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                ),
        ),
      ),
    );
  }

  // The standalone build is retained for completeness but the matrix uses the
  // split [frozenLabel]/[scrollingValues] pair via [_FrozenRowGroup].
  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [frozenLabel(), scrollingValues()],
    );
  }
}

// ── Plan-view analytics tracker (zero-size, fires once on mount) ───────────────

class _PlanViewTracker extends StatefulWidget {
  const _PlanViewTracker({
    required this.planId,
    required this.provider,
    required this.category,
  });
  final String planId;
  final String provider;
  final String category;
  @override
  State<_PlanViewTracker> createState() => _PlanViewTrackerState();
}

class _PlanViewTrackerState extends State<_PlanViewTracker> {
  @override
  void initState() {
    super.initState();
    appBackend
        .trackPlanView(
          planId: widget.planId,
          provider: widget.provider,
          category: widget.category,
        )
        .catchError((_) {});
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
