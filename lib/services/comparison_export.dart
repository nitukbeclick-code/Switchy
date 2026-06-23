import '../app_state.dart';
import '../data.dart';
import '../models.dart';
import 'recommendation_engine.dart';

/// One column of the exported comparison — a single plan plus the figures we
/// already show on the Compare screen. Every value here is derived from REAL
/// plan data (no invented prices/savings/specs); the export is just a different
/// rendering of what the user is already looking at.
class ComparisonColumn {
  const ComparisonColumn({
    required this.plan,
    required this.annualSaving,
    required this.matchPct,
    required this.isWinner,
  });

  final Plan plan;

  /// Annual saving vs. the user's current bill for this plan's category, or 0
  /// when no bill is known (we render '—' for 0). Same formula as the screen.
  final int annualSaving;

  /// Recommendation-engine match percentage (0–100), or null when not scored.
  final int? matchPct;

  /// True for the single recommended ("winner") plan.
  final bool isWinner;
}

/// One labelled spec/attribute row across all compared plans, in the same
/// order the Compare table renders them. [values] is parallel to the export's
/// [columns].
class ComparisonRow {
  const ComparisonRow(this.label, this.values, {this.isSaving = false});
  final String label;
  final List<String> values;

  /// The savings row gets visual emphasis (amber) in the PDF.
  final bool isSaving;
}

/// A structured, render-agnostic snapshot of the Compare screen. Built once from
/// [AppState] + the compared plans; consumed by the PDF builder, the plain-text
/// share fallback, and tests. This is the single source of truth for what the
/// shared/exported comparison contains, so the PDF and the text never drift.
class ComparisonExport {
  ComparisonExport({
    required this.columns,
    required this.rows,
    required this.specRows,
    required this.generatedAt,
    required this.mixedCategories,
  });

  final List<ComparisonColumn> columns;

  /// Headline attribute rows (price, post-promo, commitment, saving, …).
  final List<ComparisonRow> rows;

  /// Structured מפרט (specs) rows — present only when at least one plan has them.
  final List<ComparisonRow> specRows;

  final DateTime generatedAt;
  final bool mixedCategories;

  static const String title = 'השוואת מסלולים — חוסך';

  /// Commission / sponsorship disclosure required by §7b of the Israeli Consumer
  /// Protection regulations — always shown, regardless of the plans compared.
  static const String disclosure =
      'חוסך עשוי לקבל עמלה מספקים בעת מעבר. הנתונים אינדיקטיביים '
      'ולאימות מול הספק לפני התקשרות.';

  /// Canonical spec key order — mirrors `_CompareTable._canonicalSpecOrder`.
  static const _canonicalSpecOrder = [
    'נתונים', 'דקות', 'SMS', 'מהירות', 'ערוצים', 'ממירים', 'VOD', 'חו"ל',
  ];

  /// The winning column, or the first column when nothing ranked as a winner.
  ComparisonColumn get winner =>
      columns.firstWhere((c) => c.isWinner, orElse: () => columns.first);

  /// Build the export from the user's compared plans. Returns null when there
  /// are fewer than two plans (nothing meaningful to compare/share).
  static ComparisonExport? build(AppState appState, List<Plan> plans) {
    if (plans.length < 2) return null;

    // Score every plan once (same engine the screen uses).
    final matchMap = <String, PlanMatch>{
      for (final p in plans)
        p.id: RecommendationEngine.scorePlan(
          p,
          MatchProfile.fromAppState(appState, p.cat),
        ),
    };

    // Winner: highest score; tie-break by higher annual saving, then lower price
    // — identical to `CompareWidget`'s winner selection.
    final winner = plans.reduce((a, b) {
      final ma = matchMap[a.id]!;
      final mb = matchMap[b.id]!;
      final byScore = mb.score.compareTo(ma.score);
      if (byScore != 0) return byScore < 0 ? a : b;
      final bySave = mb.annualSaving.compareTo(ma.annualSaving);
      if (bySave != 0) return bySave < 0 ? a : b;
      return a.price <= b.price ? a : b;
    });

    final columns = plans.map((p) {
      final bill = appState.currentBill(p.cat);
      return ComparisonColumn(
        plan: p,
        annualSaving: bill > 0 ? planSaveYear(p, bill) : 0,
        matchPct: matchMap[p.id]?.scorePct,
        isWinner: p.id == winner.id,
      );
    }).toList();

    final rows = <ComparisonRow>[
      ComparisonRow('מחיר',
          plans.map((p) => '₪${p.priceText}/${priceUnitShort(p)}').toList()),
      ComparisonRow('לאחר מבצע',
          plans.map((p) => p.hasPromo ? '₪${p.afterText}' : 'קבוע').toList()),
      ComparisonRow('התחייבות', plans.map((p) => p.commitmentLabel).toList()),
      ComparisonRow(
        'חיסכון שנתי',
        columns
            .map((c) => c.annualSaving > 0 ? '₪${c.annualSaving}' : '—')
            .toList(),
        isSaving: true,
      ),
      ComparisonRow('רשת', plans.map((p) => p.netLabel).toList()),
      ComparisonRow('ציוד ועמלות', plans.map((p) {
        if (p.fees.isEmpty) return '—';
        return p.fees.entries.map((e) => '${e.key} ${e.value}').join(', ');
      }).toList()),
      ComparisonRow(
          'ללא התחייבות', plans.map((p) => p.noCommit ? 'כן' : '—').toList()),
      ComparisonRow('5G', plans.map((p) => p.is5G ? 'כן' : '—').toList()),
      ComparisonRow('חו"ל', plans.map((p) => p.hasAbroad ? 'כן' : '—').toList()),
    ];

    final specRows = _buildSpecRows(plans);

    return ComparisonExport(
      columns: columns,
      rows: rows,
      specRows: specRows,
      generatedAt: DateTime.now(),
      mixedCategories: plans.map((p) => p.cat).toSet().length > 1,
    );
  }

  static List<ComparisonRow> _buildSpecRows(List<Plan> plans) {
    final allKeys = <String>{};
    for (final p in plans) {
      allKeys.addAll(p.specs.keys);
    }
    if (allKeys.isEmpty) return const [];

    final ordered = <String>[];
    for (final k in _canonicalSpecOrder) {
      if (allKeys.contains(k)) ordered.add(k);
    }
    final remaining = allKeys.difference(ordered.toSet()).toList()..sort();
    ordered.addAll(remaining);

    return ordered
        .map((k) =>
            ComparisonRow(k, plans.map((p) => p.specs[k] ?? '—').toList()))
        .toList();
  }

  /// A plain-text rendering of the comparison — used as the share-sheet text
  /// body (and as a graceful fallback when PDF generation is unavailable).
  String toShareText() {
    final b = StringBuffer()
      ..writeln(title)
      ..writeln();

    for (final c in columns) {
      final p = c.plan;
      final mark = c.isWinner ? '⭐ ' : '• ';
      b.write('$mark${p.provider} — ${p.plan}: ₪${p.priceText}/'
          '${priceUnitShort(p)}');
      if (c.annualSaving > 0) b.write(' (חיסכון ₪${c.annualSaving}/שנה)');
      if (c.matchPct != null) b.write(' · ${c.matchPct}% התאמה');
      b.writeln();
    }

    b
      ..writeln()
      ..writeln('ההמלצה שלנו: ${winner.plan.provider} ${winner.plan.plan}')
      ..writeln()
      ..writeln(disclosure);
    return b.toString();
  }

  /// A short, descriptive filename for the exported PDF (no extension).
  String get fileName {
    final providers =
        columns.map((c) => c.plan.provider).join('-').replaceAll(' ', '');
    return 'chosech-compare-$providers';
  }
}
