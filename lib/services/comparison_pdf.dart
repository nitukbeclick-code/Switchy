import 'dart:typed_data';
import 'package:flutter/services.dart' show rootBundle;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'comparison_export.dart';

/// Renders a [ComparisonExport] to a real, RTL, Hebrew-typeset PDF.
///
/// Pure & web-safe: it only depends on the `pdf` package (pure Dart, no
/// `dart:io`) and reads the already-bundled Rubik/Assistant TTFs via
/// [rootBundle], so the Hebrew renders identically offline and on web. The
/// actual share/print I/O lives in `comparison_share.dart`; this file just
/// produces bytes, which keeps it unit-testable without a plugin.
class ComparisonPdf {
  ComparisonPdf._();

  // Brand palette (mirrors AppColors): ink structure + amber VALUE accent.
  static const PdfColor _ink = PdfColor.fromInt(0xFF111827);
  static const PdfColor _text = PdfColor.fromInt(0xFF0B0F14);
  static const PdfColor _muted = PdfColor.fromInt(0xFF4B5563);
  static const PdfColor _line = PdfColor.fromInt(0xFFE5E7EB);
  static const PdfColor _altRow = PdfColor.fromInt(0xFFF5F7F8);
  static const PdfColor _amber = PdfColor.fromInt(0xFFF59E0B);
  static const PdfColor _amberTint = PdfColor.fromInt(0xFFFEF3C7);
  static const PdfColor _amberText = PdfColor.fromInt(0xFF92400E);
  static const PdfColor _white = PdfColor.fromInt(0xFFFFFFFF);
  static const PdfColor _slate = PdfColor.fromInt(0xFFCBD5E1);

  /// Build the comparison PDF and return its bytes.
  static Future<Uint8List> build(ComparisonExport export) async {
    final regular = await _font('assets/google_fonts/Assistant-Regular.ttf');
    final medium = await _font('assets/google_fonts/Assistant-Medium.ttf');
    final bold = await _font('assets/google_fonts/Rubik-Bold.ttf');
    final semibold = await _font('assets/google_fonts/Rubik-SemiBold.ttf');

    final doc = pw.Document(
      title: ComparisonExport.title,
      author: 'Chosech',
      theme: pw.ThemeData.withFont(
        base: regular,
        bold: bold,
        // Fallbacks let any glyph the base font lacks (Latin/symbols) resolve.
        fontFallback: [regular, medium, bold, semibold],
      ),
    );

    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        textDirection: pw.TextDirection.rtl,
        margin: const pw.EdgeInsets.fromLTRB(28, 32, 28, 28),
        header: (ctx) => _header(export, semibold, regular),
        footer: (ctx) => _footer(export, ctx, regular),
        build: (ctx) => [
          _winnerBanner(export, semibold, regular),
          pw.SizedBox(height: 14),
          _table(export, export.rows, semibold, medium, regular),
          if (export.specRows.isNotEmpty) ...[
            pw.SizedBox(height: 16),
            pw.Text('מפרט',
                style: pw.TextStyle(
                    font: semibold, fontSize: 11, color: _muted)),
            pw.SizedBox(height: 6),
            _table(export, export.specRows, semibold, medium, regular),
          ],
          if (export.mixedCategories) ...[
            pw.SizedBox(height: 12),
            _notice('שים לב: מושווים מסלולים מקטגוריות שונות.', regular),
          ],
          pw.SizedBox(height: 16),
          _disclosureBox(regular, medium),
        ],
      ),
    );

    return doc.save();
  }

  static Future<pw.Font> _font(String asset) async =>
      pw.Font.ttf(await rootBundle.load(asset));

  static pw.Widget _header(
      ComparisonExport e, pw.Font title, pw.Font body) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          crossAxisAlignment: pw.CrossAxisAlignment.end,
          children: [
            pw.Text(ComparisonExport.title,
                style: pw.TextStyle(font: title, fontSize: 18, color: _ink)),
            pw.Text('Switchy AI',
                style: pw.TextStyle(font: title, fontSize: 14, color: _ink)),
          ],
        ),
        pw.SizedBox(height: 4),
        pw.Text('הופק ב-${_formatDate(e.generatedAt)}',
            style: pw.TextStyle(font: body, fontSize: 9, color: _muted)),
        pw.SizedBox(height: 8),
        pw.Divider(color: _line, thickness: 1, height: 1),
      ],
    );
  }

  static pw.Widget _footer(
      ComparisonExport e, pw.Context ctx, pw.Font body) {
    return pw.Padding(
      padding: const pw.EdgeInsets.only(top: 8),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text('chosech.co.il',
              style: pw.TextStyle(font: body, fontSize: 8, color: _muted)),
          pw.Text('עמוד ${ctx.pageNumber} מתוך ${ctx.pagesCount}',
              style: pw.TextStyle(font: body, fontSize: 8, color: _muted)),
        ],
      ),
    );
  }

  static pw.Widget _winnerBanner(
      ComparisonExport e, pw.Font title, pw.Font body) {
    final w = e.winner;
    final p = w.plan;
    return pw.Container(
      width: double.infinity,
      padding: const pw.EdgeInsets.all(14),
      decoration: pw.BoxDecoration(
        color: _ink,
        borderRadius: pw.BorderRadius.circular(10),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Container(
                padding: const pw.EdgeInsets.symmetric(
                    horizontal: 8, vertical: 3),
                decoration: pw.BoxDecoration(
                    color: _amber,
                    borderRadius: pw.BorderRadius.circular(20)),
                child: pw.Text('ההמלצה שלנו',
                    style: pw.TextStyle(
                        font: title, fontSize: 9, color: _amberText)),
              ),
              if (w.annualSaving > 0)
                pw.Text('חיסכון ₪${w.annualSaving}/שנה',
                    style: pw.TextStyle(
                        font: title, fontSize: 11, color: _amber)),
            ],
          ),
          pw.SizedBox(height: 8),
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(p.provider,
                        style: pw.TextStyle(
                            font: title, fontSize: 16, color: _white)),
                    pw.Text(p.plan,
                        style: pw.TextStyle(
                            font: body,
                            fontSize: 10,
                            color: _slate)),
                  ],
                ),
              ),
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: [
                  pw.Text('₪${p.priceText}',
                      style: pw.TextStyle(
                          font: title, fontSize: 22, color: _white)),
                  if (w.matchPct != null)
                    pw.Text('${w.matchPct}% התאמה',
                        style: pw.TextStyle(
                            font: body,
                            fontSize: 9,
                            color: _slate)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  static pw.Widget _table(
    ComparisonExport e,
    List<ComparisonRow> rows,
    pw.Font header,
    pw.Font value,
    pw.Font body,
  ) {
    // Column 0 = row label; remaining columns = one per plan.
    final headerCells = <pw.Widget>[
      _cell('', header, color: _muted, bold: true),
      ...e.columns.map((c) => _headerCell(c, header, body)),
    ];

    final dataRows = <pw.TableRow>[
      pw.TableRow(
        decoration: const pw.BoxDecoration(color: _altRow),
        children: headerCells,
      ),
    ];

    for (var i = 0; i < rows.length; i++) {
      final row = rows[i];
      final isAlt = i.isOdd;
      dataRows.add(
        pw.TableRow(
          decoration: pw.BoxDecoration(
              color: row.isSaving
                  ? _amberTint
                  : (isAlt ? _altRow : _white)),
          children: [
            _cell(row.label, body, color: _muted),
            ...List.generate(e.columns.length, (j) {
              final isWinner = e.columns[j].isWinner;
              final v = j < row.values.length ? row.values[j] : '—';
              return _cell(
                v,
                row.isSaving ? header : value,
                color: row.isSaving
                    ? _amberText
                    : (isWinner ? _ink : _text),
                bold: row.isSaving || isWinner,
                center: true,
              );
            }),
          ],
        ),
      );
    }

    return pw.Table(
      border: pw.TableBorder.all(color: _line, width: 0.5),
      defaultVerticalAlignment: pw.TableCellVerticalAlignment.middle,
      columnWidths: {
        0: const pw.FixedColumnWidth(90),
        for (var i = 1; i <= e.columns.length; i++)
          i: const pw.FlexColumnWidth(),
      },
      children: dataRows,
    );
  }

  static pw.Widget _headerCell(
      ComparisonColumn c, pw.Font header, pw.Font body) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 8),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.center,
        children: [
          if (c.isWinner)
            pw.Container(
              margin: const pw.EdgeInsets.only(bottom: 3),
              padding:
                  const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: pw.BoxDecoration(
                  color: _amber,
                  borderRadius: pw.BorderRadius.circular(8)),
              child: pw.Text('זוכה',
                  style: pw.TextStyle(
                      font: header, fontSize: 8, color: _amberText)),
            ),
          pw.Text(c.plan.provider,
              textAlign: pw.TextAlign.center,
              maxLines: 2,
              style: pw.TextStyle(font: header, fontSize: 10, color: _ink)),
          pw.Text(c.plan.plan,
              textAlign: pw.TextAlign.center,
              maxLines: 1,
              overflow: pw.TextOverflow.clip,
              style: pw.TextStyle(font: body, fontSize: 8, color: _muted)),
        ],
      ),
    );
  }

  static pw.Widget _cell(
    String text,
    pw.Font font, {
    PdfColor? color,
    bool bold = false,
    bool center = false,
  }) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 7),
      child: pw.Text(
        text,
        textAlign: center ? pw.TextAlign.center : pw.TextAlign.right,
        style: pw.TextStyle(
          font: font,
          fontSize: 9.5,
          color: color ?? _text,
          fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
        ),
      ),
    );
  }

  static pw.Widget _notice(String text, pw.Font body) {
    return pw.Container(
      width: double.infinity,
      padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: pw.BoxDecoration(
        color: _amberTint,
        borderRadius: pw.BorderRadius.circular(8),
      ),
      child: pw.Text(text,
          style: pw.TextStyle(font: body, fontSize: 9, color: _amberText)),
    );
  }

  static pw.Widget _disclosureBox(pw.Font body, pw.Font medium) {
    return pw.Container(
      width: double.infinity,
      padding: const pw.EdgeInsets.all(10),
      decoration: pw.BoxDecoration(
        color: _altRow,
        borderRadius: pw.BorderRadius.circular(8),
        border: pw.Border.all(color: _line, width: 0.5),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text('גילוי נאות',
              style: pw.TextStyle(font: medium, fontSize: 9, color: _ink)),
          pw.SizedBox(height: 3),
          pw.Text(ComparisonExport.disclosure,
              style: pw.TextStyle(font: body, fontSize: 8.5, color: _muted)),
        ],
      ),
    );
  }

  static String _formatDate(DateTime d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}.${two(d.month)}.${d.year}';
  }
}
