import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

export 'package:go_router/go_router.dart';

// Model base class
abstract class FlutterFlowModel<T extends StatefulWidget> {
  final FocusNode unfocusNode = FocusNode();
  void initState(BuildContext context);

  @mustCallSuper
  void dispose() {
    unfocusNode.dispose();
  }
}

M createModel<M extends FlutterFlowModel>(BuildContext context, M Function() creator) {
  final m = creator();
  m.initState(context);
  return m;
}

// Navigation extensions
extension NavContextExtension on BuildContext {
  void pushNamed(String name, {Map<String, String> pathParameters = const {}, Map<String, dynamic> queryParameters = const {}}) {
    GoRouter.of(this).pushNamed(name, pathParameters: pathParameters, queryParameters: queryParameters.map((k, v) => MapEntry(k, v?.toString() ?? '')));
  }

  void goNamed(String name, {Map<String, String> pathParameters = const {}, Map<String, dynamic> queryParameters = const {}}) {
    GoRouter.of(this).goNamed(name, pathParameters: pathParameters, queryParameters: queryParameters.map((k, v) => MapEntry(k, v?.toString() ?? '')));
  }

  void pop<T extends Object?>([T? result]) => Navigator.of(this).pop(result);
  bool canPop() => Navigator.of(this).canPop();
  void safePop() { if (canPop()) pop(); }
}

// Formatters
String formatNumber(int n) => NumberFormat('#,###', 'he').format(n);
String formatPrice(int price) => '₪${formatNumber(price)}';
String formatPriceShort(int price) => '₪$price';
String formatSavings(int s) => s <= 0 ? '₪0' : '₪${formatNumber(s)}';
