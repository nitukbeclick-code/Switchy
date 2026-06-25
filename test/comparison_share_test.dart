import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/services/comparison_export.dart';
import 'package:chosech/services/comparison_share.dart';

/// The `printing` plugin's platform method channel. We mock it so the share /
/// print I/O can be exercised in a pure test without a real share sheet or
/// print dialog (the channel is otherwise a no-op under the test binding).
const _channel = MethodChannel('net.nfet.printing');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  // Captures the args of the most recent platform call so each test can assert
  // on exactly what ComparisonShare forwarded to the plugin.
  late List<MethodCall> calls;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
    calls = <MethodCall>[];
  });

  tearDown(() {
    messenger.setMockMethodCallHandler(_channel, null);
  });

  ComparisonExport buildExport() {
    final s = AppState();
    s.setCurrentBill('cellular', 200);
    final plans = plansByCat('cellular').take(2).toList();
    return ComparisonExport.build(s, plans)!;
  }

  group('ComparisonShare.sharePdf', () {
    test('renders a real PDF and forwards it to the share sheet', () async {
      // Plugin acks the share with a non-zero (success) result.
      messenger.setMockMethodCallHandler(_channel, (call) async {
        calls.add(call);
        if (call.method == 'sharePdf') return 1;
        return null;
      });

      final export = buildExport();
      final ok = await ComparisonShare.sharePdf(export);

      expect(ok, isTrue, reason: 'a non-zero plugin result means shared');
      final shareCall = calls.singleWhere((c) => c.method == 'sharePdf');
      final args = (shareCall.arguments as Map).cast<String, dynamic>();

      // The document is a genuine PDF built from the export (the %PDF magic
      // bytes), not a placeholder — same contract as ComparisonPdf.build.
      final doc = args['doc'] as Uint8List;
      expect(doc.length, greaterThan(1000));
      expect(String.fromCharCodes(doc.take(4)), '%PDF');

      // Filename, subject and body come straight from the export model so the
      // share sheet and the in-app comparison never drift.
      expect(args['name'], '${export.fileName}.pdf');
      expect(args['subject'], ComparisonExport.title);
      expect(args['body'], export.toShareText());
    });

    test('returns false when the platform reports a no-op share', () async {
      // A zero result is the plugin's "nothing was shared" signal.
      messenger.setMockMethodCallHandler(_channel, (call) async {
        calls.add(call);
        if (call.method == 'sharePdf') return 0;
        return null;
      });

      final ok = await ComparisonShare.sharePdf(buildExport());
      expect(ok, isFalse);
      expect(calls.any((c) => c.method == 'sharePdf'), isTrue);
    });
  });

  group('ComparisonShare.printPdf', () {
    test('opens the print dialog and renders the export as a PDF', () async {
      // The print-job protocol is a two-step handshake: the service calls
      // `printPdf`, then the plugin asks Dart to render the page via `onLayout`
      // and finally reports completion via `onCompleted`. We drive that loop so
      // the returned future resolves, and capture the rendered bytes.
      Uint8List? rendered;
      messenger.setMockMethodCallHandler(_channel, (call) async {
        calls.add(call);
        if (call.method == 'printPdf') {
          final args = (call.arguments as Map).cast<String, dynamic>();
          final job = args['job'] as int;

          // Ask Dart to lay out the single page; the reply is the PDF bytes.
          final layout = await messenger.handlePlatformMessage(
            _channel.name,
            _channel.codec.encodeMethodCall(MethodCall('onLayout', {
              'job': job,
              'width': args['width'],
              'height': args['height'],
              'marginLeft': 0.0,
              'marginTop': 0.0,
              'marginRight': 0.0,
              'marginBottom': 0.0,
            })),
            null,
          );
          rendered = _channel.codec.decodeEnvelope(layout!) as Uint8List;

          // Report the job as completed so printPdf's future resolves true.
          await messenger.handlePlatformMessage(
            _channel.name,
            _channel.codec.encodeMethodCall(
                MethodCall('onCompleted', {'job': job, 'completed': true})),
            null,
          );
          return 1;
        }
        return null;
      });

      final export = buildExport();
      final ok = await ComparisonShare.printPdf(export);

      expect(ok, isTrue);
      // The job was named after the export (drives the suggested print title).
      final printCall = calls.singleWhere((c) => c.method == 'printPdf');
      final printArgs = (printCall.arguments as Map).cast<String, dynamic>();
      expect(printArgs['name'], export.fileName);

      // The onLayout callback produced a genuine PDF from the same export.
      expect(rendered, isNotNull);
      expect(rendered!.length, greaterThan(1000));
      expect(String.fromCharCodes(rendered!.take(4)), '%PDF');
    });
  });
}
