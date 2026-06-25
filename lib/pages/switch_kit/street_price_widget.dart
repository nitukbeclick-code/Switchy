import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../data.dart' show categoryById;
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/sticky_cta_scaffold.dart';
import '../../services/street_price.dart';

/// מחיר רחוב — a standalone browser for crowd-reported real-world prices.
///
/// What people ACTUALLY pay (often a personalised retention offer below the
/// public headline) so the next person walks into a negotiation grounded in
/// reality. The user picks a (provider, category), sees the threshold-gated
/// aggregate, and can report their own real ₪/month. This is the same honest
/// engine the provider page uses — [StreetPriceService] is the single source of
/// truth — surfaced as its own /street-price destination.
///
/// TRUTH-ONLY (the contract is enforced by [StreetPriceService], not this UI):
///   • a typical figure is shown ONLY at/above [kStreetPriceMinReports] accepted
///     reports — below that we say how many MORE are needed, never a fabricated
///     price or count;
///   • every reported price runs through the deterministic [StreetPriceService
///     .screenReport] sanity gate before it can count — an out-of-band typo is
///     held out and we say so;
///   • a bare price report carries NO contact details, so it needs no consent
///     (this is a user-PULL surface — no §30A send path).
class StreetPriceWidget extends StatefulWidget {
  const StreetPriceWidget({
    super.key,
    this.initialProvider,
    this.initialCategory,
  });

  final String? initialProvider;
  final String? initialCategory;

  @override
  State<StreetPriceWidget> createState() => _StreetPriceWidgetState();
}

class _StreetPriceWidgetState extends State<StreetPriceWidget> {
  // Real Israeli carriers the user could be on — same honest list as the
  // porting / switch-kit forms ("אחר" is omitted: a street price needs a real
  // provider to compare against the catalogue).
  static const _providers = [
    'פלאפון', 'סלקום', 'פרטנר', 'גולן טלקום', 'רמי לוי', 'הוט מובייל',
    'הוט', 'yes', 'בזק', '019 מובייל',
  ];

  final _priceCtrl = TextEditingController();

  String? _provider;
  String? _category;

  @override
  void initState() {
    super.initState();
    if (widget.initialProvider != null) {
      _provider = _matchProvider(widget.initialProvider!);
    }
    if (_provider != null) {
      final cats = providerCategoryIds(_provider!);
      // Honour an incoming category only when this provider actually serves it.
      if (widget.initialCategory != null &&
          cats.contains(widget.initialCategory)) {
        _category = widget.initialCategory;
      } else if (cats.isNotEmpty) {
        _category = cats.first;
      }
    }
  }

  @override
  void dispose() {
    _priceCtrl.dispose();
    super.dispose();
  }

  String? _matchProvider(String raw) {
    final name = raw.trim();
    for (final p in _providers) {
      if (p == name || name.contains(p) || p.contains(name)) return p;
    }
    return null;
  }

  /// The real categories the selected provider serves (no fabricated pair).
  List<String> get _providerCategories =>
      _provider == null ? const [] : providerCategoryIds(_provider!);

  StreetPriceAggregate? get _aggregate {
    final p = _provider, c = _category;
    if (p == null || c == null) return null;
    return StreetPriceService.aggregateFor(p, c);
  }

  void _selectProvider(String p) {
    HapticFeedback.selectionClick();
    setState(() {
      _provider = p;
      final cats = providerCategoryIds(p);
      _category = cats.isNotEmpty ? cats.first : null;
    });
  }

  void _submit() {
    final provider = _provider;
    final category = _category;
    if (provider == null || category == null) {
      AppSnackBar.info(context, 'בחרו ספק ושירות לפני הדיווח');
      return;
    }
    final price = double.tryParse(_priceCtrl.text.trim().replaceAll(',', '.'));
    if (price == null || price <= 0) {
      AppSnackBar.error(context, 'הזינו מחיר חודשי תקין (₪)');
      return;
    }
    final report = StreetPriceService.submitReport(
      provider: provider,
      category: category,
      monthlyPrice: price,
    );
    if (!report.accepted) {
      // Honest rejection — held out of the aggregate, and we say so (never a
      // silent drop or a fabricated number).
      AppSnackBar.error(context,
          'המחיר שהוזן חורג מהטווח הסביר ולכן לא ייכלל בממוצע. בדקו את הסכום ונסו שוב.');
      return;
    }
    _priceCtrl.clear();
    final catName = categoryById(category)?.name ?? category;
    final needed = StreetPriceService.reportsNeeded(provider, category);
    final msg = needed > 0
        ? 'תודה! נדרשים עוד $needed דיווחים ב$catName כדי להציג מחיר רחוב.'
        : 'תודה! הדיווח נכלל במחיר הרחוב של $catName.';
    AppSnackBar.success(context, msg);
    setState(() {}); // refresh the aggregate / threshold message
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return StickyCtaScaffold(
      appBar: AppBar(
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_rounded),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: const Text('מחיר רחוב'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _intro(t).animate().fadeIn(duration: 300.ms),
            const SizedBox(height: 22),
            Text('ספק', style: t.titleSmall.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            _providerChips(t).animate(delay: 60.ms).fadeIn(duration: 280.ms),
            if (_provider != null && _providerCategories.isNotEmpty) ...[
              const SizedBox(height: 22),
              Text('שירות',
                  style: t.titleSmall.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              _categoryChips(t).animate(delay: 120.ms).fadeIn(duration: 280.ms),
            ],
            const SizedBox(height: 26),
            _aggregateCard(t).animate(delay: 160.ms).fadeIn(duration: 300.ms),
            const SizedBox(height: 20),
            _reportCard(t).animate(delay: 200.ms).fadeIn(duration: 300.ms),
          ],
        ),
      ),
      // The single primary action — submit your real ₪/month — is pinned to the
      // bottom so it stays above the keyboard while the price field is focused.
      cta: AppButton(
        text: 'שליחת דיווח',
        onPressed: () async => _submit(),
        color: AppColors.primary,
        height: 52,
        width: double.infinity,
      ),
    );
  }

  Widget _intro(AppTheme t) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: t.saving.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(t.radiusCard),
        border: Border.all(color: t.saving.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.insights_rounded, color: t.savingText, size: 20),
              const SizedBox(width: 8),
              Text('מה אנשים באמת משלמים',
                  style: t.titleSmall.copyWith(color: t.savingText)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'לעיתים קרובות יש מחיר "רחוב" נמוך מהמחיר המפורסם — הצעת שימור אישית '
            'שמקבלים בטלפון. כאן רואים מחיר טיפוסי לפי דיווחים אמיתיים, וגם אתם '
            'יכולים לשתף את המחיר שלכם. מציגים נתון רק כשיש מספיק דיווחים.',
            style: t.bodySmall.copyWith(color: t.savingText, height: 1.5),
          ),
        ],
      ),
    );
  }

  Widget _providerChips(AppTheme t) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _providers.map((p) {
        final selected = _provider == p;
        return _chip(t, label: p, selected: selected, onTap: () => _selectProvider(p));
      }).toList(),
    );
  }

  Widget _categoryChips(AppTheme t) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _providerCategories.map((id) {
        final selected = _category == id;
        final name = categoryById(id)?.name ?? id;
        return _chip(t,
            label: name,
            selected: selected,
            onTap: () {
              HapticFeedback.selectionClick();
              setState(() => _category = id);
            });
      }).toList(),
    );
  }

  Widget _chip(AppTheme t,
      {required String label,
      required bool selected,
      required VoidCallback onTap}) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? t.brandAccent : t.cardSurface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected ? t.brandAccent : t.alternate,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Text(
            label,
            style: t.bodyMedium.copyWith(
              color: selected ? Colors.white : t.primaryText,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }

  // ── Aggregate ────────────────────────────────────────────────────────────────

  Widget _aggregateCard(AppTheme t) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: t.cardSurface,
        borderRadius: BorderRadius.circular(t.radiusCard),
        border: Border.all(color: t.alternate),
        boxShadow: t.shadowSoft,
      ),
      child: _aggregateBody(t),
    );
  }

  Widget _aggregateBody(AppTheme t) {
    if (_provider == null || _category == null) {
      return _hintRow(t, Icons.touch_app_rounded, 'בחרו ספק ושירות כדי לראות מחיר רחוב');
    }
    final agg = _aggregate;
    if (agg != null) return _figureView(t, agg);
    return _belowThresholdView(t);
  }

  Widget _figureView(AppTheme t, StreetPriceAggregate agg) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('מחיר רחוב טיפוסי',
            style: t.labelMedium.copyWith(color: t.secondaryText)),
        const SizedBox(height: 6),
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text('₪${agg.typicalText}',
                style: t.displaySmall
                    .copyWith(color: t.brandAccent, fontWeight: FontWeight.w800)),
            const SizedBox(width: 6),
            Text('לחודש', style: t.bodySmall),
          ],
        ),
        const SizedBox(height: 10),
        if (agg.hasSpread)
          Text('טווח דיווחים: ₪${agg.lowText}–₪${agg.highText}', style: t.bodySmall),
        const SizedBox(height: 6),
        Text('מבוסס על ${agg.reportCount} דיווחים אמיתיים שאומתו', style: t.labelSmall),
        if (agg.beatsCatalogue && agg.savingVsCatalogueText != null) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: t.saving.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(t.radiusPill),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.trending_down_rounded, size: 16, color: t.savingText),
                const SizedBox(width: 6),
                Text(
                  '₪${agg.savingVsCatalogueText} מתחת למחירון'
                  '${agg.catalogueLowestText != null ? ' (₪${agg.catalogueLowestText})' : ''}',
                  style: t.labelMedium.copyWith(
                      color: t.savingText, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _belowThresholdView(AppTheme t) {
    final provider = _provider!, category = _category!;
    final needed = StreetPriceService.reportsNeeded(provider, category);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.groups_outlined, color: t.secondaryText, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text('עדיין אין מספיק דיווחים',
                  style: t.titleSmall.copyWith(color: t.secondaryText)),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          needed > 0
              ? 'נדרשים עוד $needed דיווחים כדי להציג מחיר טיפוסי אמין. עד אז '
                  'איננו מציגים נתון — כדי לא להטעות. היו מהראשונים לדווח.'
              : 'איסוף דיווחים בעיצומו. נציג מחיר טיפוסי ברגע שיהיו מספיק נתונים.',
          style: t.bodySmall.copyWith(height: 1.5),
        ),
      ],
    );
  }

  Widget _hintRow(AppTheme t, IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, color: t.secondaryText, size: 20),
        const SizedBox(width: 12),
        Expanded(
            child: Text(text, style: t.bodyMedium.copyWith(color: t.secondaryText))),
      ],
    );
  }

  // ── Report ───────────────────────────────────────────────────────────────────

  Widget _reportCard(AppTheme t) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: t.cardSurface,
        borderRadius: BorderRadius.circular(t.radiusCard),
        border: Border.all(color: t.alternate),
        boxShadow: t.shadowSoft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.add_chart_rounded, color: t.brandAccent, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text('שתפו את המחיר שלכם', style: t.titleSmall)),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'כמה אתם משלמים בפועל לחודש? הדיווח אנונימי — בלי שם או טלפון — ועובר '
            'בדיקת סבירות לפני שהוא נספר. עוזר למשתמש הבא להיכנס למשא ומתן מתוך '
            'מידע אמיתי.',
            style: t.bodySmall.copyWith(height: 1.45),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _priceCtrl,
            keyboardType: TextInputType.number,
            textDirection: TextDirection.ltr,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(4),
            ],
            decoration: InputDecoration(
              hintText: 'כמה אתם משלמים בחודש? (₪)',
              prefixIcon:
                  Icon(Icons.payments_outlined, color: t.secondaryText, size: 20),
              filled: true,
              fillColor: t.background,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: t.alternate),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: t.alternate),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: t.brandAccent, width: 1.5),
              ),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            ),
          ),
          // The "send report" action now lives in the sticky bottom CTA (see
          // build) so it stays reachable above the keyboard while typing.
        ],
      ),
    );
  }
}
