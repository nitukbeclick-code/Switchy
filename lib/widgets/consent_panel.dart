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
      // Live legal pages on the production site (Next routes /terms, /privacy,
      // /rights — see web/app/* + sitemap). The old chosech.co.il/*.html paths
      // 404, so point at the real switchy-ai.com equivalents.
      await launchUrl(Uri.parse('https://switchy-ai.com/$page'),
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
    // The whole row is a single screen-reader toggle: [Semantics] announces the
    // FULL consent sentence as a checkable button and flips the value on tap, so
    // VoiceOver/TalkBack users can toggle consent without hunting for the small
    // checkbox glyph. The sentence is the lead + (optional) legal-link words, so
    // the §30A terms / §7b marketing wording is announced verbatim.
    final fullSentence = link != null ? '$lead$link' : lead;
    return Semantics(
      container: true,
      checked: value,
      button: true,
      label: fullSentence,
      // One clean node for the whole row — drop the descendant checkbox/link
      // semantics so the announcement is just the consent sentence + state.
      excludeSemantics: true,
      onTap: () => onChanged(!value),
      child: InkWell(
        // Tapping anywhere on the row toggles consent. The legal link keeps its
        // own visual affordance and opens the document via a nested gesture
        // (below) without stealing the row-level toggle.
        onTap: () => onChanged(!value),
        child: ConstrainedBox(
          // >=44px tap target (iOS HIG / WCAG 2.5.5) across the whole row.
          constraints: const BoxConstraints(minHeight: 44),
          child: Row(children: [
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
                  ? GestureDetector(
                      // Sighted users can still open the legal doc by tapping the
                      // underlined link text; screen-reader users reach it via the
                      // row's existing link route. Toggle stays on the row tap.
                      behavior: HitTestBehavior.opaque,
                      onTap: () => _openLegal(context, page),
                      child: label)
                  : label,
            ),
          ]),
        ),
      ),
    );
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
            page: 'terms'),
        _row(context, t,
            value: acceptPrivacy,
            onChanged: onPrivacyChanged,
            lead: 'קראתי ואני מסכים/ה ל',
            link: 'מדיניות הפרטיות',
            page: 'privacy'),
        _row(context, t,
            value: acceptMarketing,
            onChanged: onMarketingChanged,
            lead: 'אני מעוניין/ת לקבל דיוור שיווקי ומבצעים (אופציונלי)'),
      ],
    );
  }
}
