import 'dart:typed_data';

import 'package:chosech/models.dart';
import 'package:chosech/services/comparison_export.dart';
import 'package:chosech/services/comparison_pdf.dart';
import 'package:flutter_test/flutter_test.dart';

/// Tests for [ComparisonPdf] — the pure, web-safe PDF byte generator.
///
/// We bypass [ComparisonExport.build] (which needs a full AppState) and hand the
/// PDF builder a hand-built export so we can drive each render branch directly:
/// the winner banner (with/without saving + match), the spec table, and the
/// mixed-categories notice. The builder loads the real bundled Rubik/Assistant
/// TTFs via rootBundle, so [TestWidgetsFlutterBinding] is required for assets.
void main() {
  // rootBundle.load(...) of the declared assets/google_fonts/*.ttf needs the
  // test binding (and the asset bundle) initialized.
  TestWidgetsFlutterBinding.ensureInitialized();

  Plan plan({
    required String id,
    required String cat,
    required String provider,
    required String name,
    required int price,
    Map<String, String> specs = const {},
  }) =>
      Plan(
        id: id,
        cat: cat,
        provider: provider,
        net: provider,
        plan: name,
        price: price,
        specs: specs,
      );

  /// A PDF stream always starts with the "%PDF-" magic header.
  void expectIsPdf(Uint8List bytes) {
    expect(bytes, isNotEmpty);
    final header = String.fromCharCodes(bytes.take(5));
    expect(header, '%PDF-', reason: 'output should be a real PDF document');
  }

  ComparisonExport richExport() {
    final a = plan(
      id: 'a',
      cat: 'cellular',
      provider: 'ספק א',
      name: 'מסלול זהב',
      price: 39,
      specs: const {'נתונים': '100GB', 'דקות': 'ללא הגבלה'},
    );
    final b = plan(
      id: 'b',
      cat: 'cellular',
      provider: 'ספק ב',
      name: 'מסלול כסף',
      price: 59,
      specs: const {'נתונים': '50GB'},
    );
    final columns = [
      ComparisonColumn(
          plan: a, annualSaving: 240, matchPct: 92, isWinner: true),
      ComparisonColumn(
          plan: b, annualSaving: 0, matchPct: 60, isWinner: false),
    ];
    return ComparisonExport(
      columns: columns,
      rows: const [
        ComparisonRow('מחיר', ['₪39/לחודש', '₪59/לחודש']),
        ComparisonRow('חיסכון שנתי', ['₪240', '—'], isSaving: true),
      ],
      specRows: const [
        ComparisonRow('נתונים', ['100GB', '50GB']),
        ComparisonRow('דקות', ['ללא הגבלה', '—']),
      ],
      generatedAt: DateTime(2026, 6, 24),
      mixedCategories: false,
    );
  }

  group('ComparisonPdf.build', () {
    test('renders a real PDF for the full rich comparison', () async {
      final bytes = await ComparisonPdf.build(richExport());
      expectIsPdf(bytes);
    });

    test('winner banner without saving/match and no spec rows still renders',
        () async {
      // Exercises the falsy branches: annualSaving == 0, matchPct == null,
      // empty specRows (the מפרט section is skipped).
      final a = plan(
        id: 'a',
        cat: 'cellular',
        provider: 'ספק א',
        name: 'בסיס',
        price: 49,
      );
      final b = plan(
        id: 'b',
        cat: 'cellular',
        provider: 'ספק ב',
        name: 'פרימיום',
        price: 49,
      );
      final export = ComparisonExport(
        columns: [
          ComparisonColumn(
              plan: a, annualSaving: 0, matchPct: null, isWinner: true),
          ComparisonColumn(
              plan: b, annualSaving: 0, matchPct: null, isWinner: false),
        ],
        rows: const [
          ComparisonRow('מחיר', ['₪49/לחודש', '₪49/לחודש']),
        ],
        specRows: const [],
        generatedAt: DateTime(2026, 6, 24),
        mixedCategories: false,
      );

      final bytes = await ComparisonPdf.build(export);
      expectIsPdf(bytes);
    });

    test('mixed-categories export adds the notice and still renders', () async {
      final a = plan(
        id: 'a',
        cat: 'cellular',
        provider: 'ספק א',
        name: 'סלולר',
        price: 39,
      );
      final b = plan(
        id: 'b',
        cat: 'internet',
        provider: 'ספק ב',
        name: 'אינטרנט',
        price: 99,
      );
      final export = ComparisonExport(
        columns: [
          ComparisonColumn(
              plan: a, annualSaving: 120, matchPct: 80, isWinner: true),
          ComparisonColumn(
              plan: b, annualSaving: 0, matchPct: 70, isWinner: false),
        ],
        rows: const [
          ComparisonRow('מחיר', ['₪39/לחודש', '₪99/לחודש']),
        ],
        specRows: const [],
        generatedAt: DateTime(2026, 6, 24),
        mixedCategories: true,
      );

      final bytes = await ComparisonPdf.build(export);
      expectIsPdf(bytes);
    });

    test('is deterministic enough to build repeatedly to valid PDFs', () async {
      final first = await ComparisonPdf.build(richExport());
      final second = await ComparisonPdf.build(richExport());
      expectIsPdf(first);
      expectIsPdf(second);
    });
  });
}
