import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/app_theme.dart';
import '../services/analytics_service.dart';
import 'app_button.dart';

/// A reusable "דברו איתנו בוואטסאפ" call-to-action.
///
/// Opens a `wa.me` deep link in WhatsApp (optionally to a specific [phone] and
/// with a [prefillText] already typed), and falls back to the native share
/// sheet when WhatsApp can't be launched (web/desktop without WhatsApp) — so the
/// button always does *something* useful and never invents a phone number.
///
/// It is an [AppButton] under the hood, so it inherits the brand's green ACTION
/// gradient + glow, the async loading state, and the keyboard-focus ring. A tap
/// fires the [AnalyticsEvent.whatsappClick] beacon (fire-and-forget); pass
/// [source] to tag where it came from (e.g. 'lead', 'provider').
class WhatsAppButton extends StatelessWidget {
  const WhatsAppButton({
    super.key,
    this.label = 'דברו איתנו בוואטסאפ',
    this.prefillText,
    this.phone,
    this.source,
    this.width,
    this.height = 52,
    this.onTap,
  });

  /// Button copy (Hebrew). Defaults to the standard CTA.
  final String label;

  /// Optional message pre-filled in the WhatsApp composer.
  final String? prefillText;

  /// Optional E.164-ish destination number (digits only, no `+`/spaces). When
  /// omitted, WhatsApp opens its own contact picker (`wa.me/?text=…`).
  final String? phone;

  /// Where this CTA lives, recorded as an analytics prop (e.g. 'lead', 'provider').
  final String? source;

  final double? width;
  final double height;

  /// Optional extra callback fired before the link opens — for page-local side
  /// effects (the analytics beacon is already handled internally).
  final VoidCallback? onTap;

  /// Build the `wa.me` URI: to [phone] when given, otherwise the contact picker.
  /// [prefillText] is URL-encoded into the `text` query param when present.
  Uri _waUri() {
    final digits = (phone ?? '').replaceAll(RegExp(r'[^\d]'), '');
    final base = digits.isNotEmpty ? 'https://wa.me/$digits' : 'https://wa.me/';
    final text = prefillText?.trim() ?? '';
    if (text.isEmpty) return Uri.parse(base);
    return Uri.parse('$base?text=${Uri.encodeComponent(text)}');
  }

  Future<void> _open() async {
    onTap?.call();
    // Fire-and-forget — never await or let it block opening WhatsApp.
    AnalyticsService.track(
      AnalyticsEvent.whatsappClick,
      props: {if (source != null) 'source': source!},
    );
    final uri = _waUri();
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        return;
      }
    } catch (_) {
      // fall through to the native share sheet
    }
    // No WhatsApp available (web/desktop): hand off to the OS share sheet with
    // whatever text we had, so the CTA still leads somewhere.
    final fallback = prefillText?.trim();
    if (fallback != null && fallback.isNotEmpty) {
      await Share.share(fallback);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Semantics(
      button: true,
      label: label,
      child: AppButton(
        text: label,
        // AppColors.primary is the ink sentinel that maps to the theme's green
        // ACTION gradient inside AppButton — this is how we get the brand green.
        color: AppColors.primary,
        width: width,
        height: height,
        icon: const Icon(Icons.chat_rounded, color: Colors.white, size: 20),
        textStyle: t.titleSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
        onPressed: _open,
      ),
    );
  }
}
