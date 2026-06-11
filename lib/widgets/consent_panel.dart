import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_theme.dart';
import 'app_snackbar.dart';

/// The legal-consent checkboxes required before any contact-capture submit
/// (Israeli Privacy Protection Regs + Spam Law): terms + privacy are mandatory,
/// marketing is an unchecked opt-in. Shared by the lead form and the
/// video-meeting wizard so the wording and the legal links never drift.
class ConsentPanel extends StatelessWidget {
  const ConsentPanel({
    super.key,
    required this.acceptTerms,
    required this.acceptPrivacy,
    required this.acceptMarketing,
    required this.onTermsChanged,
    required this.onPrivacyChanged,
    required this.onMarketingChanged,
  });

  final bool acceptTerms;
  final bool acceptPrivacy;
  final bool acceptMarketing;
  final ValueChanged<bool> onTermsChanged;
  final ValueChanged<bool> onPrivacyChanged;
  final ValueChanged<bool> onMarketingChanged;

  Future<void> _openLegal(BuildContext context, String page) async {
    try {
      await launchUrl(Uri.parse('https://chosech.co.il/$page'),
          mode: LaunchMode.externalApplication);
    } catch (_) {
      if (context.mounted) AppSnackBar.info(context, 'לא ניתן לפתוח את המסמך כרגע');
    }
  }

  Widget _row(BuildContext context, AppTheme t,
      {required bool value,
      required ValueChanged<bool> onChanged,
      required String lead,
      String? link,
      String? page}) {
    final label = Text.rich(TextSpan(
      text: lead,
      style: t.bodySmall.copyWith(color: t.secondaryText, height: 1.35),
      children: link != null
          ? [
              TextSpan(
                text: link,
                style: t.bodySmall.copyWith(
                    color: t.primary, fontWeight: FontWeight.w700, decoration: TextDecoration.underline),
              )
            ]
          : null,
    ));
    return Row(children: [
      SizedBox(
        width: 40,
        height: 40,
        child: Checkbox(
          value: value,
          onChanged: (v) => onChanged(v ?? false),
          activeColor: t.primary,
          visualDensity: VisualDensity.compact,
          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
      Expanded(
        child: page != null
            ? Semantics(
                button: true,
                label: 'פתח $link',
                child: InkWell(onTap: () => _openLegal(context, page), child: label))
            : label,
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _row(context, t,
            value: acceptTerms,
            onChanged: onTermsChanged,
            lead: 'קראתי ואני מסכים/ה ל',
            link: 'תנאי השימוש',
            page: 'terms.html'),
        _row(context, t,
            value: acceptPrivacy,
            onChanged: onPrivacyChanged,
            lead: 'קראתי ואני מסכים/ה ל',
            link: 'מדיניות הפרטיות',
            page: 'privacy.html'),
        _row(context, t,
            value: acceptMarketing,
            onChanged: onMarketingChanged,
            lead: 'אני מעוניין/ת לקבל דיוור שיווקי ומבצעים (אופציונלי)'),
      ],
    );
  }
}
