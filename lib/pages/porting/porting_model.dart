import 'package:flutter/material.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import 'porting_widget.dart';

class PortingModel extends FlutterFlowModel<PortingWidget> {
  final TextEditingController phoneController = TextEditingController();
  final TextEditingController idController = TextEditingController();
  String? selectedProvider;
  bool poaAccepted = false;
  bool submitted = false;

  bool get canSubmit =>
      phoneController.text.trim().length >= 9 &&
      idController.text.trim().length >= 9 &&
      selectedProvider != null &&
      poaAccepted;

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {
    phoneController.dispose();
    idController.dispose();
    super.dispose();
  }
}
