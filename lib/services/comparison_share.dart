import 'package:printing/printing.dart';
import 'comparison_export.dart';
import 'comparison_pdf.dart';

/// Share / print I/O for a comparison, kept out of the widget so the page
/// depends on this thin service rather than the `printing` plugin directly
/// (same separation as MediaService).
///
/// Web-safe: `printing` ships a real web implementation — [sharePdf] opens the
/// native share sheet on mobile/desktop and triggers a browser download on web;
/// [printPdf] opens the OS/browser print dialog. Both accept bytes produced by
/// [ComparisonPdf], which is pure Dart with no `dart:io`.
class ComparisonShare {
  ComparisonShare._();

  /// Render [export] to a PDF and hand it to the platform share sheet (or a
  /// browser download on web). Returns true if the share was initiated.
  static Future<bool> sharePdf(ComparisonExport export) async {
    final bytes = await ComparisonPdf.build(export);
    return Printing.sharePdf(
      bytes: bytes,
      filename: '${export.fileName}.pdf',
      subject: ComparisonExport.title,
      body: export.toShareText(),
    );
  }

  /// Render [export] to a PDF and open the OS/browser print dialog.
  static Future<bool> printPdf(ComparisonExport export) {
    return Printing.layoutPdf(
      name: export.fileName,
      onLayout: (_) => ComparisonPdf.build(export),
    );
  }
}
