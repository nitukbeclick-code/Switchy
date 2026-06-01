import 'package:flutter/material.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'lead_widget.dart';

class LeadModel extends FlutterFlowModel<LeadWidget> {
  final TextEditingController nameController = TextEditingController();
  final TextEditingController phoneController = TextEditingController();
  final FocusNode nameFocusNode = FocusNode();
  final FocusNode phoneFocusNode = FocusNode();
  String selectedProvider = '';

  bool get isFormValid =>
      nameController.text.trim().isNotEmpty &&
      phoneController.text.trim().length >= 9 &&
      selectedProvider.isNotEmpty;

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {
    nameController.dispose();
    phoneController.dispose();
    nameFocusNode.dispose();
    phoneFocusNode.dispose();
    super.dispose();
  }
}
