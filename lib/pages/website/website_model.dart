import 'package:flutter/material.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'website_widget.dart';

class WebsiteModel extends FlutterFlowModel<WebsiteWidget> {
  final TextEditingController billController = TextEditingController(text: '119');
  String activeCategory = 'cellular';

  int get currentBill => int.tryParse(billController.text) ?? 119;

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {
    billController.dispose();
    super.dispose();
  }
}
