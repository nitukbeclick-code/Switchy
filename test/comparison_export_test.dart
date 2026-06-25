import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:chosech/app.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/models.dart' show Plan;
import 'package:chosech/services/comparison_export.dart';
import 'package:chosech/services/comparison_pdf.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  group('ComparisonExport (pure model)', () {
    test('returns null for fewer than two plans', () {
      final s = AppState();
      final one = plansByCat('cellular').take(1).toList();
      expect(ComparisonExport.build(s, one), isNull);
      expect(ComparisonExport.build(s, const <Plan>[]), isNull);
    });

    test('builds one column per plan and marks exactly one winner', () {
      final s = AppState();
      final plans = plansByCat('cellular').take(3).toList();
      final export = ComparisonExport.build(s, plans)!;

      expect(export.columns.length, plans.length);
      expect(export.columns.where((c) => c.isWinner).length, 1);
      // The winner getter resolves to that flagged column.
      expect(export.winner.isWinner, isTrue);
    });

    test('always includes the price and saving rows', () {
      final s = AppState();
      final plans = plansByCat('cellular').take(2).toList();
      final export = ComparisonExport.build(s, plans)!;

      final priceRow = export.rows.firstWhere((r) => r.label == 'מחיר');
      expect(priceRow.values.length, plans.length);
      // Price strings carry the real headline price + unit.
      expect(priceRow.values.first, contains('₪'));

      final savingRow = export.rows.firstWhere((r) => r.isSaving);
      expect(savingRow.label, 'חיסכון שנתי');
      expect(savingRow.values.length, plans.length);
    });

    test('annual saving reflects the real bill (true data, no fabrication)', () {
      final s = AppState();
      s.resetAllBills();
      s.setCurrentBill('cellular', 220);
      final plans = plansByCat('cellular').take(2).toList();
      final export = ComparisonExport.build(s, plans)!;

      // Each column's saving must equal planSaveYear against the set bill.
      for (final c in export.columns) {
        expect(c.annualSaving, planSaveYear(c.plan, 220));
      }
      // At least one positive saving against a ₪220 bill.
      expect(export.columns.any((c) => c.annualSaving > 0), isTrue);
    });

    test('with no bill the saving row shows a dash, never an invented number',
        () {
      final s = AppState();
      s.resetAllBills();
      final plans = plansByCat('cellular').take(2).toList();
      final export = ComparisonExport.build(s, plans)!;
      final savingRow = export.rows.firstWhere((r) => r.isSaving);
      expect(savingRow.values.every((v) => v == '—'), isTrue);
    });

    test('share text carries the disclosure and a winner line', () {
      final s = AppState();
      final plans = plansByCat('cellular').take(2).toList();
      final export = ComparisonExport.build(s, plans)!;
      final text = export.toShareText();

      expect(text, contains(ComparisonExport.title));
      expect(text, contains(ComparisonExport.disclosure));
      expect(text, contains(export.winner.plan.provider));
    });

    test('flags mixed categories', () {
      final s = AppState();
      final mixed = [plansByCat('cellular').first, plansByCat('tv').first];
      final export = ComparisonExport.build(s, mixed)!;
      expect(export.mixedCategories, isTrue);

      final same = plansByCat('cellular').take(2).toList();
      expect(ComparisonExport.build(s, same)!.mixedCategories, isFalse);
    });

    test('fileName is filesystem-safe (no spaces)', () {
      final s = AppState();
      final plans = plansByCat('cellular').take(2).toList();
      final export = ComparisonExport.build(s, plans)!;
      expect(export.fileName, isNot(contains(' ')));
      expect(export.fileName, startsWith('chosech-compare-'));
    });
  });

  group('ComparisonPdf', () {
    test('produces a non-empty PDF byte stream with the %PDF header', () async {
      final s = AppState();
      s.setCurrentBill('cellular', 200);
      final plans = plansByCat('cellular').take(2).toList();
      final export = ComparisonExport.build(s, plans)!;

      final bytes = await ComparisonPdf.build(export);
      expect(bytes.length, greaterThan(1000));
      // Every valid PDF starts with the "%PDF" magic bytes.
      expect(String.fromCharCodes(bytes.take(4)), '%PDF');
    });

    test('renders specs without throwing when plans carry a מפרט', () async {
      final s = AppState();
      final withSpecs =
          plansByCat('cellular').where((p) => p.specs.isNotEmpty).take(2).toList();
      // Only run the assertion when the catalogue actually has specced plans.
      if (withSpecs.length < 2) return;
      final export = ComparisonExport.build(s, withSpecs)!;
      expect(export.specRows, isNotEmpty);
      final bytes = await ComparisonPdf.build(export);
      expect(bytes.length, greaterThan(1000));
    });
  });

  group('Compare share menu (widget)', () {
    Future<void> bootApp(WidgetTester tester) async {
      GoogleFonts.config.allowRuntimeFetching = false;
      SharedPreferences.setMockInitialValues({});
      AppState.reset();
      await AppState().initializePersistedState();
      await tester.pumpWidget(
        ChangeNotifierProvider.value(
            value: AppState(), child: const ChosechApp()),
      );
      await tester.pump(const Duration(milliseconds: 300));
    }

    void go(WidgetTester tester, String path) {
      final ctx = tester.element(find.byType(Navigator).first);
      ctx.go(path);
    }

    Future<void> settle(WidgetTester tester) async {
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));
    }

    testWidgets('share menu offers a PDF export option for 2+ plans',
        (tester) async {
      await bootApp(tester);

      final cellular = plansByCat('cellular');
      AppState().toggleCompare(cellular[0].id);
      AppState().toggleCompare(cellular[1].id);
      AppState().setCategory('cellular');

      go(tester, '/compare');
      await settle(tester);

      // The labelled share affordance is present…
      expect(find.byTooltip('שתף'), findsWidgets);
      expect(find.byIcon(Icons.ios_share_rounded), findsWidgets);

      // …and opening it surfaces a real PDF export entry.
      await tester.tap(find.byTooltip('שתף').first);
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('שתף כ-PDF'), findsOneWidget);
      expect(find.text('הדפס'), findsOneWidget);
      expect(find.text('שתף כטקסט'), findsOneWidget);

      final ex = tester.takeException();
      if (ex != null) {
        expect(ex.toString().contains('A RenderFlex overflowed'), isTrue,
            reason: 'Unexpected exception: $ex');
      }
    });
  });
}
