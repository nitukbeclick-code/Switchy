import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../data.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/sticky_cta_scaffold.dart';
import '../../services/negotiation_script.dart';

/// "תסריט מיקוח" (Negotiation/Retention Script) — helps a user who wants to STAY
/// with their provider but pay less. Pick a category (and optionally their
/// provider) and we build a GROUNDED script from real catalogue plans: honest
/// leverage for a retention call, never a promise. All logic lives in the pure
/// [buildNegotiationScript]; this page only collects inputs and renders.
class NegotiateWidget extends StatefulWidget {
  const NegotiateWidget({super.key, this.initialCategory, this.initialProvider});

  /// Optional deep-link defaults (e.g. from a plan/provider surface).
  final String? initialCategory;
  final String? initialProvider;

  @override
  State<NegotiateWidget> createState() => _NegotiateWidgetState();
}

class _NegotiateWidgetState extends State<NegotiateWidget> {
  late String _category;
  final TextEditingController _providerCtrl = TextEditingController();

  // Only the non-electricity telecom categories make sense for a retention call.
  static const _catIds = ['cellular', 'internet', 'tv', 'triple', 'abroad'];

  @override
  void initState() {
    super.initState();
    _category = (widget.initialCategory != null &&
            _catIds.contains(widget.initialCategory))
        ? widget.initialCategory!
        : 'cellular';
    if (widget.initialProvider != null) {
      _providerCtrl.text = widget.initialProvider!;
    }
  }

  @override
  void dispose() {
    _providerCtrl.dispose();
    super.dispose();
  }

  void _copyScript(NegotiationScript script) {
    final lines = <String>[
      ...script.talkingPoints.asMap().entries.map((e) => '${e.key + 1}. ${e.value}'),
      '',
      NegotiationScript.disclaimer,
    ];
    Clipboard.setData(ClipboardData(text: lines.join('\n')));
    AppSnackBar.info(context, 'התסריט הועתק — בהצלחה בשיחה!');
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final script = buildNegotiationScript(_category, provider: _providerCtrl.text);

    final appBar = AppBar(
      backgroundColor: Colors.transparent,
      elevation: 0,
      foregroundColor: ffTheme.primaryText,
      title: Text('תסריט מיקוח',
          style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700)),
      leading: IconButton(
        icon: const Icon(Icons.arrow_forward_ios_rounded),
        tooltip: 'חזרה',
        onPressed: () => context.safePop(),
      ),
    );

    final body = ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          // Intro
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: ffTheme.brandGradient,
              borderRadius: BorderRadius.circular(ffTheme.radiusCard),
              boxShadow: ffTheme.shadowLifted,
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                  ),
                  child: const Icon(Icons.support_agent_rounded,
                      color: Colors.white, size: 22),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    'רוצים להישאר אבל לשלם פחות? בנינו לכם תסריט מבוסס על מחירים '
                    'אמיתיים מהשוק — להתקשר לשימור ולבקש להשוות.',
                    style: GoogleFonts.assistant(
                        fontSize: 13.5,
                        color: Colors.white,
                        fontWeight: FontWeight.w500,
                        height: 1.45),
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 350.ms),

          const SizedBox(height: 20),

          // Category chips
          Text('הקטגוריה', style: ffTheme.labelMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _catIds.map((id) {
              final selected = _category == id;
              final cat = categoryById(id);
              return GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _category = id);
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: selected ? ffTheme.primary : ffTheme.accent1,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: selected ? ffTheme.primary : ffTheme.alternate),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(categoryIconData(id),
                          size: 14,
                          color: selected ? Colors.white : ffTheme.primaryText),
                      const SizedBox(width: 5),
                      Text(cat?.name ?? id,
                          style: GoogleFonts.assistant(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color:
                                  selected ? Colors.white : ffTheme.primaryText)),
                    ],
                  ),
                ),
              );
            }).toList(),
          ).animate().fadeIn(delay: 80.ms),

          const SizedBox(height: 18),

          // Provider (optional)
          Text('הספק הנוכחי (אופציונלי)', style: ffTheme.labelMedium),
          const SizedBox(height: 8),
          TextField(
            controller: _providerCtrl,
            onChanged: (_) => setState(() {}),
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              hintText: 'למשל: סלקום',
              hintStyle:
                  ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
              filled: true,
              fillColor: ffTheme.accent1,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: ffTheme.alternate),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: ffTheme.alternate),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: ffTheme.primary, width: 1.5),
              ),
            ),
          ).animate().fadeIn(delay: 120.ms),

          const SizedBox(height: 20),

          // The grounded script (or honest empty state)
          if (!script.hasLeverage)
            Container(
              padding: const EdgeInsets.all(18),
              decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
              child: Row(
                children: [
                  Icon(Icons.info_outline_rounded,
                      size: 22, color: ffTheme.secondaryText),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'אין לנו כרגע מסלולים אמיתיים בקטגוריה הזו לבסס עליהם תסריט.',
                      style: ffTheme.bodySmall
                          .copyWith(color: ffTheme.secondaryText, height: 1.4),
                    ),
                  ),
                ],
              ),
            ).animate().fadeIn(delay: 160.ms)
          else ...[
            _BenchmarkCard(script: script, ffTheme: ffTheme)
                .animate()
                .fadeIn(delay: 160.ms)
                .slideY(begin: 0.06),
            const SizedBox(height: 16),
            Text('מה אומרים בשיחה', style: ffTheme.titleLarge)
                .animate()
                .fadeIn(delay: 200.ms),
            const SizedBox(height: 12),
            ...script.talkingPoints.asMap().entries.map((e) => _ScriptStep(
                  index: e.key + 1,
                  text: e.value,
                  ffTheme: ffTheme,
                ).animate().fadeIn(delay: (220 + e.key * 70).ms).slideX(begin: 0.05)),
            const SizedBox(height: 14),
            // Honesty disclaimer.
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.verified_user_outlined,
                    size: 15, color: ffTheme.secondaryText),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    NegotiationScript.disclaimer,
                    style: ffTheme.labelSmall.copyWith(
                        color: ffTheme.secondaryText, height: 1.4),
                  ),
                ),
              ],
            ).animate().fadeIn(delay: 300.ms),
            const SizedBox(height: 20),
            // Onward link — if the call fails, switching is the real fallback.
            // (The primary "copy the script" action is pinned as the sticky
            // bottom CTA — see the StickyCtaScaffold below.)
            AppButton.secondary(
              text: 'לא הסכימו? מצאו מסלול זול יותר',
              icon: Icon(Icons.search_rounded,
                  color: ffTheme.primary, size: 18),
              onPressed: () async => context.pushNamed('Results'),
            ).animate().fadeIn(delay: 380.ms),
          ],
        ],
      );

    // When the script is grounded, pin "copy the script" as a sticky bottom CTA
    // so it stays one tap away while the talking points scroll. With no leverage
    // there's nothing to copy, so we fall back to a plain Scaffold.
    if (!script.hasLeverage) {
      return Scaffold(
        backgroundColor: ffTheme.background,
        appBar: appBar,
        body: body,
      );
    }
    return StickyCtaScaffold(
      appBar: appBar,
      body: body,
      cta: AppButton(
        text: 'העתק את התסריט',
        icon: const Icon(Icons.copy_rounded, color: Colors.white, size: 18),
        color: ffTheme.primary,
        height: 52,
        width: double.infinity,
        textStyle: GoogleFonts.rubik(
            fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white),
        onPressed: () async => _copyScript(script),
      ),
    );
  }
}

// ── Benchmark card — the real market plan the script is built on ───────────────

class _BenchmarkCard extends StatelessWidget {
  const _BenchmarkCard({required this.script, required this.ffTheme});
  final NegotiationScript script;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final best = script.marketBest!;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ffTheme.saving.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
        border: Border.all(color: ffTheme.saving.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(Icons.flag_rounded, size: 22, color: ffTheme.savingDark),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('המחיר שמולו מתמקחים',
                    style: ffTheme.labelSmall
                        .copyWith(color: ffTheme.secondaryText)),
                const SizedBox(height: 2),
                Text('${best.provider} · ${best.plan}',
                    style: ffTheme.bodyMedium
                        .copyWith(fontWeight: FontWeight.w700)),
              ],
            ),
          ),
          Text('₪${best.priceText}/${priceUnitShort(best)}',
              style: ffTheme.titleSmall.copyWith(
                  color: ffTheme.savingText, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

// ── One numbered talking point ─────────────────────────────────────────────────

class _ScriptStep extends StatelessWidget {
  const _ScriptStep(
      {required this.index, required this.text, required this.ffTheme});
  final int index;
  final String text;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              color: ffTheme.primary,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: Text('$index',
                  style: GoogleFonts.rubik(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: Colors.white)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(text,
                style: ffTheme.bodyMedium
                    .copyWith(height: 1.45, color: ffTheme.primaryText)),
          ),
        ],
      ),
    );
  }
}
