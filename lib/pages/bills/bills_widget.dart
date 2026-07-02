import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/pressable.dart';
import '../../widgets/price_text.dart';
import '../../widgets/saving_pill.dart';
import '../../widgets/sticky_cta_scaffold.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../services/savings_summary.dart';
import '../../services/media_service.dart';
import '../../services/backend/backend.dart';
import '../../services/backend/local_backend.dart';

class BillsWidget extends StatefulWidget {
  const BillsWidget({super.key});

  @override
  State<BillsWidget> createState() => _BillsWidgetState();
}

/// A single category's "are you overpaying?" benchmark, derived ONLY from the
/// user's own entered bill and the REAL catalogue. [cheapest] is the cheapest
/// comparable (regular, monthly-priced) plan in the category; [annualSaving] is
/// the recommendation engine's figure for that category so every savings surface
/// agrees. Pure — no fabricated benchmarks.
class _Overpay {
  const _Overpay({
    required this.category,
    required this.bill,
    required this.cheapest,
    required this.annualSaving,
  });

  final Category category;
  final int bill;
  final Plan cheapest;
  final int annualSaving;

  /// ₪/month the user pays above the cheapest real plan (never negative).
  int get monthlyGap => (bill - cheapest.priceValue).round().clamp(0, 999999);

  /// How much higher the bill is than the cheapest plan, as a percentage.
  int get overPct =>
      cheapest.priceValue <= 0 ? 0 : ((monthlyGap / cheapest.priceValue) * 100).round();
}

/// Build the overpay benchmark for every category where the user has entered a
/// bill and a cheaper REAL, comparable (regular + monthly) plan exists. Abroad
/// (per-day / per-package pricing) is naturally excluded because its plans
/// aren't monthly — comparing a monthly bill to a per-day rate would mislead.
/// Sorted by annual saving, biggest opportunity first.
List<_Overpay> _overpaysFor(AppState appState, Map<String, int> savingByCat) {
  final out = <_Overpay>[];
  for (final cat in categories) {
    final bill = appState.currentBill(cat.id);
    if (bill <= 0) continue;
    // Cheapest comparable real plan: an ordinary monthly subscriber line.
    Plan? cheapest;
    for (final p in plansByCat(cat.id)) {
      if (!p.isRegular || p.unit != 'month') continue;
      if (cheapest == null || p.priceValue < cheapest.priceValue) cheapest = p;
    }
    if (cheapest == null || cheapest.priceValue >= bill) continue;
    out.add(_Overpay(
      category: cat,
      bill: bill,
      cheapest: cheapest,
      annualSaving: savingByCat[cat.id] ?? 0,
    ));
  }
  out.sort((a, b) => b.annualSaving.compareTo(a.annualSaving));
  return out;
}

class _BillsWidgetState extends State<BillsWidget> {
  int _touchedIndex = -1;
  bool _busyPhoto = false;

  /// "Upload a bill photo" affordance — REAL OCR. The image is captured/picked
  /// via the shared [MediaService] (downscaled JPEG, size-capped) and sent to
  /// `appBackend.analyzeBill` (the `site-bill-analyzer` edge function: Gemini
  /// Vision extracts provider/amount/category). On a readable bill we pre-fill
  /// that category's current bill via [AppState.setCurrentBill] and show the
  /// detected provider/amount + cheaper suggestions in a sheet; an unreadable
  /// photo or any failure surfaces a friendly Hebrew message. Fail-soft and
  /// self-contained: the image is never kept in state beyond the call.
  Future<void> _uploadBillPhoto({required bool fromCamera}) async {
    if (_busyPhoto) return;
    setState(() => _busyPhoto = true);
    try {
      final dataUri = await MediaService.pickImageDataUri(fromCamera: fromCamera);
      if (!mounted) return;
      if (dataUri == null) {
        // User cancelled or the image was too large to keep.
        AppSnackBar.info(context, 'לא נבחרה תמונה');
        return;
      }

      final analysis = await appBackend.analyzeBill(dataUri);
      if (!mounted) return;

      // Transport / outage / parse failure → friendly nudge to the manual editor.
      if (analysis == null) {
        AppSnackBar.error(
          context,
          'לא הצלחנו לנתח את החשבון כרגע — עדכנו את הסכום למטה ידנית',
          duration: const Duration(seconds: 4),
        );
        return;
      }

      // Unreadable / not-a-bill → the analyzer's own friendly Hebrew message.
      if (!analysis.isReadable) {
        AppSnackBar.info(
          context,
          analysis.error ??
              'לא הצלחנו לקרוא את החשבון מהתמונה. נסו לצלם שוב באור טוב, ישר מול הדף',
          duration: const Duration(seconds: 5),
        );
        return;
      }

      // Readable: pre-fill the detected category's bill (when we recognised one)
      // so every savings surface updates, then show the detected details.
      final appState = Provider.of<AppState>(context, listen: false);
      final cat = categoryById(analysis.category);
      if (cat != null && analysis.currentSpend > 0) {
        appState.setCurrentBill(cat.id, analysis.currentSpend);
        appBackend.upsertBills(AppState().currentBills).catchError((_) {});
      }
      _showBillAnalysisResult(AppTheme.of(context), analysis, cat);
    } catch (_) {
      if (!mounted) return;
      AppSnackBar.error(context, 'לא ניתן לצרף תמונה כרגע — נסו שוב');
    } finally {
      if (mounted) setState(() => _busyPhoto = false);
    }
  }

  /// Bottom sheet with the OCR result: the detected provider + monthly amount,
  /// a note that the matching category's bill was pre-filled, and up to 3
  /// cheaper plans in the same category. Read-only — the user keeps editing in
  /// the manual list below.
  void _showBillAnalysisResult(AppTheme ffTheme, BillAnalysis a, Category? cat) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: ffTheme.cardSurface,
      isScrollControlled: true,
      shape: RoundedRectangleBorder(
        // The one sheet corner token — sheets are the sole >12 exception.
        borderRadius: BorderRadius.vertical(top: Radius.circular(ffTheme.radiusSheet)),
      ),
      builder: (sheetCtx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(color: ffTheme.alternate, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      // Success medallion in the designed green tint token.
                      color: ffTheme.brandAccentTint,
                      borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    ),
                    child: Icon(Icons.check_circle_rounded, size: 22, color: ffTheme.brandAccent),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('קראנו את החשבון', style: ffTheme.titleMedium),
                        const SizedBox(height: 2),
                        Text(
                          [
                            if (a.provider.isNotEmpty) a.provider,
                            if (cat != null) cat.name,
                          ].join(' · '),
                          style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              // Detected monthly amount.
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                  border: Border.all(color: ffTheme.primary.withValues(alpha: 0.15)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.receipt_long_rounded, size: 18, color: ffTheme.primary),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        cat != null
                            ? 'זוהה תשלום חודשי של ₪${a.currentSpend} — עדכנו את ${cat.name} עבורכם'
                            : 'זוהה תשלום חודשי של ₪${a.currentSpend}',
                        style: ffTheme.labelMedium.copyWith(fontWeight: FontWeight.w700, color: ffTheme.primaryText),
                      ),
                    ),
                  ],
                ),
              ),
              if (a.suggestions.isNotEmpty) ...[
                const SizedBox(height: 18),
                Text('מסלולים זולים יותר', style: ffTheme.titleSmall),
                const SizedBox(height: 10),
                ...a.suggestions.map((s) => _BillSuggestionRow(suggestion: s, ffTheme: ffTheme)),
              ] else ...[
                const SizedBox(height: 14),
                Text(
                  a.note ?? 'לא מצאנו מסלול זול יותר באותה קטגוריה — נראה שאתם משלמים מחיר טוב.',
                  style: ffTheme.bodySmall,
                ),
              ],
              const SizedBox(height: 16),
              if (cat != null)
                AppButton(
                  text: 'השווה חבילות ${cat.name}',
                  color: AppColors.primary,
                  width: double.infinity,
                  onPressed: () async {
                    final appState = Provider.of<AppState>(context, listen: false);
                    appState.setCategory(cat.id);
                    Navigator.pop(sheetCtx);
                    if (mounted) context.pushNamed('Results');
                  },
                )
              else
                AppButton.ghost(
                  text: 'סגירה',
                  width: double.infinity,
                  onPressed: () async => Navigator.pop(sheetCtx),
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// Bottom sheet to choose camera vs gallery for the bill photo.
  void _pickBillPhotoSource(AppTheme ffTheme) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: ffTheme.cardSurface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(ffTheme.radiusSheet)),
      ),
      builder: (sheetCtx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 12),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: ffTheme.alternate, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 8),
            ListTile(
              leading: Icon(Icons.photo_camera_rounded, color: ffTheme.primary),
              title: Text('צילום חשבון במצלמה', style: ffTheme.titleSmall),
              onTap: () {
                Navigator.pop(sheetCtx);
                _uploadBillPhoto(fromCamera: true);
              },
            ),
            ListTile(
              leading: Icon(Icons.photo_library_rounded, color: ffTheme.primary),
              title: Text('בחירה מהגלריה', style: ffTheme.titleSmall),
              onTap: () {
                Navigator.pop(sheetCtx);
                _uploadBillPhoto(fromCamera: false);
              },
            ),
            // Honest privacy note (verified against the site-bill-analyzer edge
            // fn): the photo is sent to AI for one-time reading only — the image
            // itself is not saved, only the detected amount and provider.
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.lock_outline_rounded, size: 14, color: ffTheme.secondaryText),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'התמונה נשלחת לניתוח חכם (AI) לקריאת הסכום והספק בלבד — '
                      'התמונה עצמה אינה נשמרת.',
                      style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, height: 1.4),
                      textAlign: TextAlign.start,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  /// A formal monochrome ramp (full ink → fading steps) for the per-category
  /// bars so each category reads as a distinct shade in greyscale. Derived from
  /// the THEME ink token (no hex literals in feature code), so the ramp also
  /// resolves in dark mode — the old const near-black steps vanished against
  /// the dark card. Indexed by position; wraps if there are more categories
  /// than steps.
  List<Color> _barRamp(AppTheme t) => [
        t.primary,
        t.primary.withValues(alpha: 0.76),
        t.primary.withValues(alpha: 0.56),
        t.primary.withValues(alpha: 0.38),
        t.primary.withValues(alpha: 0.22),
      ];

  @override
  void dispose() {
    appBackend.upsertBills(AppState().currentBills).catchError((_) {});
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    // Reduced-motion KEEPS every entrance fade (opacity) but DROPS the
    // translate (Emil — reveals stay vestibular-safe). The reveals below branch
    // their slide offset on this; the fade always plays.
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    final activeCats = categories.where((c) => appState.currentBill(c.id) > 0).toList();
    final total = categories.fold<int>(0, (sum, c) => sum + appState.currentBill(c.id));
    // Use the same recommendation-engine figures as the home hero and the
    // /savings dashboard, so all three savings surfaces agree.
    final summary = computeSavings(appState);
    final savingByCat = {for (final c in summary.categories) c.categoryId: c.annualSaving};
    final totalSavings = summary.totalAnnualPotential;

    // "איפה אתם משלמים יותר מדי" — real catalogue benchmarks, biggest first.
    final overpays = _overpaysFor(appState, savingByCat);
    final worst = overpays.isNotEmpty ? overpays.first : null;
    // Until the user personalises their bills, every saving is an estimate.
    final estimate = !appState.billsPersonalized;

    return StickyCtaScaffold(
      appBar: AppBar(
        title: const Text('החשבונות שלי'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
        actions: [
          if (total > 0)
            IconButton(
              icon: Icon(Icons.refresh_rounded, color: ffTheme.secondaryText, size: 20),
              tooltip: 'אפס הכל',
              onPressed: () {
                final appState = Provider.of<AppState>(context, listen: false);
                showDialog(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    // Dialog corner from the radius scale (content caps at
                    // radiusXl) — no literal radii.
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusXl)),
                    title: const Text('איפוס חשבונות', textAlign: TextAlign.center),
                    content: const Text('לאפס את כל הסכומים?', textAlign: TextAlign.center),
                    actionsAlignment: MainAxisAlignment.center,
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('ביטול')),
                      ElevatedButton(
                        onPressed: () { Navigator.pop(ctx); appState.resetAllBills(); appBackend.upsertBills(AppState().currentBills).catchError((_) {}); },
                        // Destructive = error token; the label ink resolves per
                        // theme (white on the light red-600, near-black on the
                        // lifted dark red-400 where white fails AA).
                        style: ElevatedButton.styleFrom(
                            backgroundColor: ffTheme.error,
                            foregroundColor: ffTheme.dark ? ffTheme.primaryDark : ffTheme.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusMd))),
                        child: const Text('אפס'),
                      ),
                    ],
                  ),
                );
              },
            ),
        ],
      ),
      // Promote "compare now" from a tiny app-bar text link to the screen's
      // single primary action, pinned to the bottom so it reads as the CTA.
      cta: AppButton(
        text: 'השווה עכשיו',
        // Contrast-aware ink ON the solid-green ACTION fill (pinned white fell
        // to ~1.7:1 on the lifted dark-mode green-400).
        icon: Icon(Icons.search_rounded, color: ffTheme.onSaving, size: 18),
        color: AppColors.primary,
        height: 52,
        width: double.infinity,
        onPressed: () async => context.pushNamed('Results'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Hero total card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                // Flat ink hero — resting content carries no float under the
                // one-elevation story (only sheets/FABs/sticky bars lift).
                gradient: ffTheme.brandGradient,
                borderRadius: BorderRadius.circular(ffTheme.radiusCard),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // The hero stays ink in BOTH themes, so the eyebrow reads in
                  // the white token — the old [secondary] getter flipped to a
                  // dark slate in dark mode and vanished on the ink.
                  Text('הוצאה חודשית כוללת',
                      style: ffTheme.bodySmall.copyWith(
                          fontWeight: FontWeight.w600,
                          color: ffTheme.white.withValues(alpha: 0.9))),
                  const SizedBox(height: 6),
                  // The hero total — numeric-scale token (tabular figures),
                  // bidi-pinned via PriceText; dialed from a shouting 48px to
                  // 34 so it matches the app's calm hero numerals. The real
                  // figure is unchanged.
                  PriceText('₪$total',
                      style: ffTheme.numericLarge.copyWith(
                          fontSize: 34,
                          color: ffTheme.white,
                          letterSpacing: -1)),
                  const SizedBox(height: 2),
                  Text('לחודש בכל הקטגוריות',
                      style: ffTheme.labelMedium.copyWith(
                          color: ffTheme.white.withValues(alpha: 0.7))),
                  if (totalSavings > 0) ...[
                    const SizedBox(height: 12),
                    // De-pushed: the ₪/year saving figure is shown where it's
                    // earned (the per-category breakdown below + /savings). On
                    // the spend hero we keep a calm, comparison-framed one-liner
                    // instead of a second green sales badge.
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ExcludeSemantics(
                            child: Icon(Icons.compare_arrows_rounded,
                                size: 15, color: ffTheme.white.withValues(alpha: 0.7))),
                        const SizedBox(width: 6),
                        Text('יש מסלולים מתאימים להשוואה למטה',
                            style: ffTheme.labelMedium.copyWith(
                                fontSize: 12.5,
                                color: ffTheme.white.withValues(alpha: 0.75))),
                      ],
                    ),
                  ],
                ],
              ),
            ).animate().fadeIn(duration: 400.ms).scale(
                begin: reduceMotion ? const Offset(1, 1) : const Offset(0.97, 0.97),
                end: const Offset(1, 1)),

            const SizedBox(height: 16),

            // Empty state — no bills yet: explain what this screen gives and
            // point at the editor below instead of showing a bare ₪0 page.
            if (total == 0)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(18),
                decoration: ffTheme.glassDecoration(alpha: 0.72),
                child: Column(
                  children: [
                    Container(
                      width: 52,
                      height: 52,
                      // Neutral accent1 medallion, radius from the scale.
                      decoration: BoxDecoration(
                          color: ffTheme.accent1,
                          borderRadius: BorderRadius.circular(ffTheme.radiusCard)),
                      child: Icon(Icons.receipt_long_rounded, size: 26, color: ffTheme.primary),
                    ),
                    const SizedBox(height: 12),
                    Text('עוד לא הזנתם חשבונות', style: ffTheme.titleSmall, textAlign: TextAlign.center),
                    const SizedBox(height: 4),
                    Text(
                      'בחרו למטה כמה אתם משלמים היום בכל קטגוריה — ונראה לכם מיד איפה אפשר לחסוך.',
                      style: ffTheme.bodySmall,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 10),
                    Icon(Icons.keyboard_double_arrow_down_rounded, size: 20, color: ffTheme.secondaryText),
                  ],
                ),
              ).animate().fadeIn(delay: 120.ms).slideY(begin: reduceMotion ? 0 : 0.05, end: 0),

            // Savings ring
            if (total > 0 && totalSavings > 0)
              _SavingsRing(
                total: total,
                totalSavings: totalSavings,
                ffTheme: ffTheme,
              ).animate().fadeIn(delay: 200.ms),

            const SizedBox(height: 20),

            // Bar chart
            if (activeCats.isNotEmpty) ...[
              Semantics(
                  header: true,
                  child: Text('פילוח לפי קטגוריה', style: ffTheme.titleMedium)),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(14, 22, 14, 14),
                // Premium bento tile — the breakdown chart is an anchor surface.
                decoration: ffTheme.bentoDecoration(),
                child: Column(
                  children: [
                    SizedBox(
                      height: 160,
                      child: BarChart(
                        BarChartData(
                          alignment: BarChartAlignment.spaceAround,
                          maxY: activeCats.map((c) => appState.currentBill(c.id).toDouble()).reduce((a, b) => a > b ? a : b) * 1.3,
                          barTouchData: BarTouchData(
                            touchCallback: (event, response) {
                              setState(() {
                                _touchedIndex = response?.spot?.touchedBarGroupIndex ?? -1;
                              });
                            },
                            touchTooltipData: BarTouchTooltipData(
                              getTooltipColor: (_) => ffTheme.primaryDark,
                              getTooltipItem: (group, groupIndex, rod, rodIndex) {
                                return BarTooltipItem(
                                  '₪${rod.toY.toInt()}',
                                  // Title-scale token; the tooltip surface is
                                  // [primaryDark] (true black in both themes)
                                  // so the label reads in the white token —
                                  // the old [secondary] getter went dark-slate
                                  // on dark and vanished.
                                  ffTheme.titleSmall.copyWith(
                                      color: ffTheme.white,
                                      fontWeight: FontWeight.w700,
                                      fontFeatures: const [FontFeature.tabularFigures()]),
                                );
                              },
                            ),
                          ),
                          titlesData: FlTitlesData(
                            show: true,
                            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                            leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                            bottomTitles: AxisTitles(
                              sideTitles: SideTitles(
                                showTitles: true,
                                getTitlesWidget: (value, meta) {
                                  final i = value.toInt();
                                  if (i >= activeCats.length) return const SizedBox();
                                  return Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: Icon(categoryIconData(activeCats[i].id), size: 16, color: ffTheme.secondaryText),
                                  );
                                },
                              ),
                            ),
                          ),
                          borderData: FlBorderData(show: false),
                          gridData: FlGridData(
                            show: true,
                            horizontalInterval: 50,
                            getDrawingHorizontalLine: (v) => FlLine(color: ffTheme.alternate, strokeWidth: 1, dashArray: [4, 4]),
                            drawVerticalLine: false,
                          ),
                          barGroups: activeCats.asMap().entries.map((entry) {
                            final i = entry.key;
                            final cat = entry.value;
                            final bill = appState.currentBill(cat.id).toDouble();
                            final isTouch = i == _touchedIndex;
                            final ramp = _barRamp(ffTheme);
                            final barColor = ramp[i % ramp.length];
                            return BarChartGroupData(
                              x: i,
                              barRods: [
                                BarChartRodData(
                                  toY: bill,
                                  color: isTouch ? ffTheme.primaryDark : barColor,
                                  width: isTouch ? 28 : 24,
                                  borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
                                  backDrawRodData: BackgroundBarChartRodData(
                                    show: true,
                                    toY: activeCats.map((c) => appState.currentBill(c.id).toDouble()).reduce((a, b) => a > b ? a : b) * 1.3,
                                    color: ffTheme.accent2,
                                  ),
                                ),
                              ],
                            );
                          }).toList(),
                        ),
                        swapAnimationDuration: const Duration(milliseconds: 500),
                        swapAnimationCurve: Curves.easeInOut,
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Legend — swatch matches each bar's ramp shade.
                    Wrap(
                      spacing: 16,
                      runSpacing: 8,
                      alignment: WrapAlignment.center,
                      children: activeCats.asMap().entries.map((e) {
                        final i = e.key;
                        final c = e.value;
                        final ramp = _barRamp(ffTheme);
                        final shade = ramp[i % ramp.length];
                        return Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 10,
                              height: 10,
                              decoration: BoxDecoration(
                                color: shade,
                                borderRadius: BorderRadius.circular(3),
                                border: Border.all(color: ffTheme.alternate.withValues(alpha: 0.25), width: 0.5),
                              ),
                            ),
                            const SizedBox(width: 5),
                            Icon(categoryIconData(c.id), size: 13, color: ffTheme.secondaryText),
                            const SizedBox(width: 4),
                            Text(c.name, style: ffTheme.labelSmall),
                            const SizedBox(width: 4),
                            Text('₪${appState.currentBill(c.id)}', style: ffTheme.labelSmall.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
                          ],
                        );
                      }).toList(),
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 150.ms),

              const SizedBox(height: 24),
            ],

            // ── "איפה אתם משלמים יותר מדי" — overpay insights ─────────────────
            if (overpays.isNotEmpty) ...[
              Row(
                children: [
                  Semantics(
                      header: true,
                      child: Text('איפה אתם משלמים יותר מדי', style: ffTheme.titleMedium)),
                  const SizedBox(width: 8),
                  ExcludeSemantics(
                      child: Icon(Icons.search_rounded, size: 16, color: ffTheme.primaryText)),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                estimate
                    ? 'השוואה לחבילה הזולה ביותר בקטלוג — הערכה עד שתעדכנו את הסכומים'
                    : 'השוואה לחבילה הזולה ביותר בקטלוג בכל קטגוריה',
                style: ffTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              ...overpays.asMap().entries.map((entry) {
                final i = entry.key;
                final o = entry.value;
                return _OverpayCard(
                  overpay: o,
                  isWorst: i == 0,
                  estimate: estimate,
                  ffTheme: ffTheme,
                  onCompare: () {
                    appState.setCategory(o.category.id);
                    context.pushNamed('Results');
                  },
                ).animate(delay: (i * 80).ms).fadeIn(duration: 350.ms).slideY(begin: reduceMotion ? 0 : 0.06, end: 0);
              }),

              // Single strong CTA — fix the worst category.
              if (worst != null && worst.annualSaving > 0) ...[
                const SizedBox(height: 6),
                _WorstCategoryCta(
                  worst: worst,
                  estimate: estimate,
                  ffTheme: ffTheme,
                  onTap: () {
                    appState.setCategory(worst.category.id);
                    context.pushNamed('Results');
                  },
                ).animate().fadeIn(delay: 250.ms).slideY(begin: reduceMotion ? 0 : 0.08, end: 0),
              ],

              const SizedBox(height: 24),
            ],

            Semantics(
                header: true,
                child: Text('עדכן חשבונות', style: ffTheme.titleMedium)),
            const SizedBox(height: 4),
            Text('הכניסו את הסכום שאתם משלמים כיום בכל קטגוריה', style: ffTheme.bodySmall),
            const SizedBox(height: 12),

            // ── "Upload bill photo" affordance — real OCR ───────────────────
            // Captures/picks a bill photo and sends it to the site-bill-analyzer
            // edge function, which reads the amount/provider and pre-fills the
            // matching category. Wrapped in Semantics for the icon-led control.
            Semantics(
              button: true,
              label: 'צרפו צילום של החשבון לזיהוי אוטומטי',
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                  onTap: _busyPhoto ? null : () => _pickBillPhotoSource(ffTheme),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: ffTheme.brandAccentTint,
                      borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                      border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.22)),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            // Card-surface medallion so the tile stays visible
                            // ON the tint (a green-on-green wash blurred away).
                            color: ffTheme.secondaryBackground,
                            borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                          ),
                          // Upload → analysis is a STATE change, not a pop:
                          // crossfade the scanner glyph into the working spinner
                          // (Emil — transition between states, never snap). Both
                          // legs ease-out via the switcher's FadeTransition; the
                          // 130ms band keeps the swap quick, and a keyed child
                          // tells AnimatedSwitcher the two glyphs are distinct.
                          child: AnimatedSwitcher(
                            duration: ffTheme.motionPress,
                            switchInCurve: ffTheme.easeOut,
                            switchOutCurve: ffTheme.easeOut,
                            child: _busyPhoto
                                ? Padding(
                                    key: const ValueKey('busy'),
                                    padding: const EdgeInsets.all(10),
                                    child: CircularProgressIndicator(strokeWidth: 2, color: ffTheme.brandAccent),
                                  )
                                : Icon(Icons.document_scanner_rounded,
                                    key: const ValueKey('idle'), size: 20, color: ffTheme.brandAccent),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('צרפו צילום של החשבון', style: ffTheme.titleSmall),
                              const SizedBox(height: 2),
                              Text('מהמצלמה או מהגלריה — נזהה את הסכום אוטומטית',
                                  style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                            ],
                          ),
                        ),
                        Icon(Icons.add_a_photo_rounded, size: 18, color: ffTheme.brandAccent),
                      ],
                    ),
                  ),
                ),
              ),
            ).animate().fadeIn(delay: 60.ms).slideY(begin: reduceMotion ? 0 : 0.05, end: 0),
            const SizedBox(height: 14),

            ...categories.asMap().entries.map((entry) {
              final i = entry.key;
              final cat = entry.value;
              final bill = appState.currentBill(cat.id);
              final yearlySave = savingByCat[cat.id] ?? 0;

              return _BillCard(
                category: cat,
                currentBill: bill,
                yearlySave: yearlySave,
                onDecrease: () => appState.setCurrentBill(cat.id, (bill - 10).clamp(0, 2000)),
                onIncrease: () => appState.setCurrentBill(cat.id, (bill + 10).clamp(0, 2000)),
                onSetValue: (v) => appState.setCurrentBill(cat.id, v),
                onTap: () {
                  appState.setCategory(cat.id);
                  context.pushNamed('Results');
                },
                ffTheme: ffTheme,
              ).animate(delay: (i * 70).ms).fadeIn(duration: 350.ms).slideX(begin: reduceMotion ? 0 : 0.05, end: 0);
            }),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

/// One cheaper-plan row inside the OCR result sheet: the plan name + provider on
/// the right, the monthly price and (when known) the annual saving on the left.
class _BillSuggestionRow extends StatelessWidget {
  const _BillSuggestionRow({required this.suggestion, required this.ffTheme});
  final BillSuggestion suggestion;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final s = suggestion;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: ffTheme.background,
        borderRadius: BorderRadius.circular(ffTheme.radiusSm),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.name.isEmpty ? s.provider : s.name,
                    style: ffTheme.titleSmall, overflow: TextOverflow.ellipsis),
                if (s.name.isNotEmpty && s.provider.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(s.provider, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // Bidi-safe money (LTR isolate) with tabular figures.
              PriceText('₪${s.price}/חודש',
                  style: ffTheme.labelMedium.copyWith(
                      color: ffTheme.primary,
                      fontWeight: FontWeight.w800,
                      // Neutralise the price token's tracking (the label face
                      // carries none of its own).
                      letterSpacing: 0,
                      fontFeatures: const [FontFeature.tabularFigures()])),
              if (s.annualSaving > 0) ...[
                const SizedBox(height: 2),
                // The shared VALUE pill — every savings figure reads as one
                // recognizable category. TRUTH-ONLY: same real figure.
                SavingPill(text: 'חיסכון ₪${s.annualSaving}/שנה'),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _SavingsRing extends StatelessWidget {
  const _SavingsRing({required this.total, required this.totalSavings, required this.ffTheme});
  final int total;
  final int totalSavings;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final savingsPerMonth = (totalSavings / 12).round();
    final pct = ((savingsPerMonth / total) * 100).round().clamp(0, 100);
    final keep = total - savingsPerMonth;

    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return Container(
      padding: const EdgeInsets.all(20),
      // Premium bento tile — the savings ring is a headline VALUE surface.
      decoration: ffTheme.bentoDecoration(),
      child: Row(
        children: [
          // Donut chart — the amber savings slice sweeps in clockwise and the
          // percentage counts up, so the "how much you save" lands with motion.
          SizedBox(
            width: 110,
            height: 110,
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: reduceMotion ? 1 : 0, end: 1),
              duration: const Duration(milliseconds: 1100),
              curve: ffTheme.easeOut,
              builder: (_, t, __) => Stack(
                alignment: Alignment.center,
                children: [
                  PieChart(
                    PieChartData(
                      startDegreeOffset: -90 - 360 * (1 - t),
                      sectionsSpace: 3,
                      centerSpaceRadius: 34,
                      sections: [
                        // Amber for the saving (the VALUE share), pale grey for the
                        // rest (market price) — the savings slice reads as money.
                        PieChartSectionData(
                          value: savingsPerMonth.toDouble(),
                          color: ffTheme.saving,
                          radius: 16 + 4 * t,
                          showTitle: false,
                        ),
                        PieChartSectionData(
                          value: keep.toDouble().clamp(1, double.infinity),
                          color: ffTheme.secondary,
                          radius: 16,
                          showTitle: false,
                        ),
                      ],
                    ),
                  ),
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('${(pct * t).round()}%',
                          // Numeric-scale token (tabular built in); the 18px /
                          // w800 / VALUE-green deltas ride via copyWith.
                          style: ffTheme.numericMedium.copyWith(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0,
                              height: 1,
                              color: ffTheme.savingDark)),
                      Text('חיסכון', style: ffTheme.labelSmall.copyWith(fontSize: 10)),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 20),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('פילוח ההוצאה שלכם', style: ffTheme.titleSmall),
                const SizedBox(height: 10),
                // Honest monthly split (real figures), no shouted ₪/year hero —
                // that headline lives on /savings. The pill below was removed in
                // the de-push so the bills page stays a calm spend overview.
                _RingLegendRow(color: ffTheme.saving, label: 'אפשר לחסוך', value: '₪$savingsPerMonth/חודש', ffTheme: ffTheme),
                const SizedBox(height: 6),
                _RingLegendRow(color: ffTheme.secondary, label: 'מחיר שוק', value: '₪$keep/חודש', ffTheme: ffTheme),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RingLegendRow extends StatelessWidget {
  const _RingLegendRow({required this.color, required this.label, required this.value, required this.ffTheme});
  final Color color;
  final String label, value;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle, border: Border.all(color: ffTheme.alternate.withValues(alpha: 0.25), width: 0.5))),
        const SizedBox(width: 8),
        Text(label, style: ffTheme.labelSmall),
        const Spacer(),
        Text(value, style: ffTheme.labelSmall.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

/// One category's overpay insight: the gap to the cheapest REAL plan, a tidy
/// per-category breakdown bar (your bill vs that plan), the estimated annual
/// saving, and a compare CTA. All numbers are real catalogue prices + the
/// user's own bill; the saving is marked an estimate until bills are personalised.
class _OverpayCard extends StatelessWidget {
  const _OverpayCard({
    required this.overpay,
    required this.isWorst,
    required this.estimate,
    required this.ffTheme,
    required this.onCompare,
  });

  final _Overpay overpay;
  final bool isWorst;
  final bool estimate;
  final AppTheme ffTheme;
  final VoidCallback onCompare;

  @override
  Widget build(BuildContext context) {
    final o = overpay;
    final cat = o.category;
    // Bar fractions: the cheapest plan as a share of the (larger) current bill.
    const billFrac = 1.0;
    final cheapFrac = o.bill > 0 ? (o.cheapest.priceValue / o.bill).clamp(0.04, 1.0) : 0.0;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: ffTheme.glassDecoration(alpha: 0.72).copyWith(
        border: Border.all(
          color: isWorst ? ffTheme.primary.withValues(alpha: 0.35) : ffTheme.lineColor,
          width: isWorst ? 1.4 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(12)),
                child: Center(child: Icon(categoryIconData(cat.id), size: 20, color: ffTheme.primary)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(cat.name, style: ffTheme.titleSmall),
                        if (isWorst) ...[
                          const SizedBox(width: 8),
                          // ACTIVE-chip language (green tint + AA green ink +
                          // green hairline) — solid green fills are reserved
                          // for primary CTAs only.
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: ffTheme.brandAccentTint,
                              borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                              border: Border.all(color: ffTheme.brandAccent),
                            ),
                            child: Text('מומלץ',
                                style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w800, fontSize: 10)),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text('משלמים ₪${o.monthlyGap} יותר מהזולה ביותר${o.overPct > 0 ? ' (+${o.overPct}%)' : ''}',
                        style: ffTheme.labelSmall.copyWith(color: ffTheme.warning, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // ── Per-category breakdown: your bill vs the cheapest real plan ──────
          _BenchmarkBar(
            label: 'אתם משלמים',
            amount: '₪${o.bill}',
            frac: billFrac,
            color: ffTheme.warning,
            ffTheme: ffTheme,
          ),
          const SizedBox(height: 8),
          _BenchmarkBar(
            label: 'הזולה בקטלוג',
            sublabel: o.cheapest.provider,
            amount: '₪${o.cheapest.priceText}',
            frac: cheapFrac.toDouble(),
            color: ffTheme.primary,
            ffTheme: ffTheme,
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                // The annual saving rides in the shared VALUE pill (tint bg +
                // savings glyph + tabular figures) so it matches every other
                // savings surface; without a real saving, a calm neutral hint.
                // TRUTH-ONLY: the real figure + estimate hedge are unchanged.
                child: o.annualSaving > 0
                    ? Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: SavingPill(
                          text:
                              'חיסכון${estimate ? ' (הערכה)' : ''}: ₪${o.annualSaving} בשנה',
                          shortText: 'חיסכון: ₪${o.annualSaving}',
                        ),
                      )
                    : Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                        decoration: BoxDecoration(
                          color: ffTheme.accent1,
                          borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                          border: Border.all(color: ffTheme.lineColor),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.savings_rounded, size: 16, color: ffTheme.primary),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'בדקו חבילות זולות יותר',
                                style: ffTheme.labelSmall.copyWith(
                                    color: ffTheme.primary, fontWeight: FontWeight.w700),
                              ),
                            ),
                          ],
                        ),
                      ),
              ),
              const SizedBox(width: 8),
              Semantics(
                button: true,
                label: 'השווה חבילות ${cat.name}',
                child: Material(
                  color: ffTheme.primary,
                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    onTap: onCompare,
                    child: Container(
                      // >=48dp tap target for the inline compare action.
                      constraints: const BoxConstraints(minHeight: kMinTapTarget),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      alignment: Alignment.center,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Ink CTA label in the CARD-SURFACE ink so it stays
                          // readable in BOTH themes (pinned white vanished on
                          // the off-white dark-mode [primary] fill).
                          Text('השווה',
                              style: ffTheme.labelMedium.copyWith(
                                  color: ffTheme.secondaryBackground,
                                  fontWeight: FontWeight.w700)),
                          const SizedBox(width: 4),
                          Icon(Icons.arrow_back_rounded,
                              size: 14, color: ffTheme.secondaryBackground),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A labelled proportional bar — the building block of the per-category
/// breakdown ("אתם משלמים" vs "הזולה בקטלוג").
class _BenchmarkBar extends StatelessWidget {
  const _BenchmarkBar({
    required this.label,
    required this.amount,
    required this.frac,
    required this.color,
    required this.ffTheme,
    this.sublabel,
  });

  final String label;
  final String? sublabel;
  final String amount;
  final double frac;
  final Color color;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label, style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700, color: ffTheme.primaryText)),
            if (sublabel != null) ...[
              const SizedBox(width: 6),
              Flexible(child: Text('· $sublabel', style: ffTheme.labelSmall, overflow: TextOverflow.ellipsis)),
            ],
            const Spacer(),
            Text(amount, style: ffTheme.labelMedium.copyWith(color: color, fontWeight: FontWeight.w800)),
          ],
        ),
        const SizedBox(height: 5),
        ClipRRect(
          borderRadius: BorderRadius.circular(ffTheme.radiusPill),
          child: LayoutBuilder(
            builder: (context, constraints) {
              return Stack(
                children: [
                  Container(height: 9, width: double.infinity, color: ffTheme.accent2),
                  Container(
                    height: 9,
                    width: (constraints.maxWidth * frac).clamp(0.0, constraints.maxWidth),
                    decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(ffTheme.radiusPill)),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

/// The single strong call-to-action: switch the worst-overpaying category.
class _WorstCategoryCta extends StatelessWidget {
  const _WorstCategoryCta({
    required this.worst,
    required this.estimate,
    required this.ffTheme,
    required this.onTap,
  });

  final _Overpay worst;
  final bool estimate;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // The CTA rides a PERMANENTLY-dark ink wash (brandGradient is ink in BOTH
    // themes), so its foreground reads in the white token and the trailing
    // chevron disc resolves through the LIGHT token set — the theme-aware
    // [secondary]/[primaryDark] pair went slate-with-black in dark (invisible).
    const lt = AppTheme.light;
    return Semantics(
      button: true,
      label: 'עברו לחבילה זולה יותר ב${worst.category.name} וחסכו עד ₪${worst.annualSaving} בשנה',
      child: Container(
        width: double.infinity,
        decoration: BoxDecoration(
          gradient: ffTheme.brandGradient,
          borderRadius: BorderRadius.circular(ffTheme.radiusLg),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(ffTheme.radiusLg),
            splashColor: ffTheme.white.withValues(alpha: 0.12),
            highlightColor: ffTheme.white.withValues(alpha: 0.06),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: ffTheme.white.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                ),
                child: Center(child: Icon(categoryIconData(worst.category.id), size: 22, color: ffTheme.white)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('התחילו מ${worst.category.name}',
                        style: ffTheme.titleSmall.copyWith(color: ffTheme.white, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(
                      'הקטגוריה שבה משלמים הכי הרבה מעבר לשוק — חיסכון${estimate ? ' מוערך' : ''} עד ₪${worst.annualSaving}/שנה',
                      // Label-scale token; the muted-white ink + tighter leading
                      // ride via copyWith (no raw GoogleFonts).
                      style: ffTheme.labelMedium.copyWith(
                          color: ffTheme.white.withValues(alpha: 0.85), height: 1.3),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: lt.secondary, shape: BoxShape.circle),
                child: Icon(Icons.arrow_back_rounded, size: 18, color: lt.primaryDark),
              ),
            ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BillCard extends StatelessWidget {
  const _BillCard({
    required this.category,
    required this.currentBill,
    required this.yearlySave,
    required this.onDecrease,
    required this.onIncrease,
    required this.onSetValue,
    required this.onTap,
    required this.ffTheme,
  });
  final Category category;
  final int currentBill;
  final int yearlySave;
  final VoidCallback onDecrease;
  final VoidCallback onIncrease;
  final ValueChanged<int> onSetValue;
  final VoidCallback onTap;
  final AppTheme ffTheme;

  static const Map<String, List<int>> _presets = {
    'cellular': [29, 49, 89, 129],
    'internet': [79, 99, 149, 199],
    'tv': [49, 89, 149, 199],
    'triple': [199, 279, 349, 449],
    'abroad': [19, 39, 69, 99],
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(15),
      // Premium card surface; an active (entered) bill keeps its subtle ink
      // accent border, an empty one falls back to the soft hairline.
      decoration: ffTheme.cardDecoration(
        radius: ffTheme.radiusMd,
        borderColor: currentBill > 0 ? ffTheme.primary.withValues(alpha: 0.2) : null,
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                ),
                child: Center(child: Icon(categoryIconData(category.id), size: 22, color: ffTheme.primary)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(category.name, style: ffTheme.titleSmall),
                    if (currentBill > 0 && yearlySave > 0)
                      // The shared VALUE pill — the per-category saving reads
                      // as the same recognizable category as every other
                      // savings surface (was plain green text). TRUTH-ONLY:
                      // the real figure is unchanged; compact fallback keeps
                      // the same figure when the row is tight.
                      Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: SavingPill(
                          text: 'חיסכון פוטנציאלי: ₪$yearlySave/שנה',
                          shortText: '₪$yearlySave/שנה',
                        ),
                      ),
                    if (currentBill == 0)
                      Text('לא בשימוש', style: ffTheme.labelSmall),
                  ],
                ),
              ),
              // Stepper
              Row(
                children: [
                  _RoundBtn(icon: Icons.remove, color: ffTheme.alternate, iconColor: ffTheme.secondaryText, onTap: onDecrease, semanticLabel: 'הפחת ₪10 מ${category.name}'),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    // Bidi-safe money (LTR isolate) — the ₪+digits run stays
                    // stable inside the RTL row.
                    child: PriceText(
                      '₪$currentBill',
                      style: ffTheme.titleSmall.copyWith(
                        color: currentBill > 0 ? ffTheme.primary : ffTheme.secondaryText,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0,
                        // Fixed-width digits so ±10 steps don't nudge the buttons.
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                  // The "+" ink disc carries the CARD-SURFACE ink so it stays
                  // visible in BOTH themes (pinned white vanished on the
                  // off-white dark-mode [primary] fill).
                  _RoundBtn(icon: Icons.add, color: ffTheme.primary, iconColor: ffTheme.secondaryBackground, onTap: onIncrease, semanticLabel: 'הוסף ₪10 ל${category.name}'),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Quick-preset chips
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: (_presets[category.id] ?? [49, 99, 149, 199]).map((preset) {
              final isActive = currentBill == preset;
              // ONE chip language — ACTIVE: green tint bg + AA green ink +
              // green hairline; resting: surface + hairline + muted ink (the
              // old ink-filled active chip broke the no-solid-ink-chips rule).
              // Pressable (tactile, reduced-motion aware) + Semantics replace
              // the bare GestureDetector; invisible padding widens the hit
              // area toward the touch-target minimum without inflating the
              // visual chip.
              return Semantics(
                button: true,
                selected: isActive,
                label: 'קביעת ${category.name} על ₪$preset בחודש',
                child: Pressable(
                  onTap: () => onSetValue(preset),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: isActive ? ffTheme.brandAccentTint : ffTheme.background,
                        borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                        border: Border.all(color: isActive ? ffTheme.brandAccent : ffTheme.alternate),
                      ),
                      child: Text(
                        '₪$preset',
                        style: ffTheme.labelSmall.copyWith(
                          color: isActive ? ffTheme.brandAccentText : ffTheme.secondaryText,
                          fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          if (currentBill > 0 && yearlySave > 0) ...[
            const SizedBox(height: 10),
            // Shared ghost variant — was a hand-rolled InkWell with a ~34px
            // hit area; now a 44px-tall consistent tertiary button.
            AppButton.ghost(
              text: 'חפש חבילות זולות יותר',
              onPressed: () async => onTap(),
              width: double.infinity,
              height: 44,
              borderRadius: BorderRadius.circular(ffTheme.radiusLg),
              icon: Icon(Icons.search_rounded, size: 14, color: ffTheme.primary),
              textStyle: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700),
              iconPadding: 6,
            ),
          ],
        ],
      ),
    );
  }
}

class _RoundBtn extends StatelessWidget {
  const _RoundBtn({required this.icon, required this.color, required this.iconColor, required this.onTap, required this.semanticLabel});
  final IconData icon;
  final Color color;
  final Color iconColor;
  final VoidCallback onTap;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    // 44×44 tap area (touch-target minimum) around the 34px visual circle,
    // with a ripple halo so the press is felt as well as seen.
    return Semantics(
      button: true,
      label: semanticLabel,
      child: SizedBox(
        width: 44,
        height: 44,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: Center(
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                child: Icon(icon, size: 17, color: iconColor),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
