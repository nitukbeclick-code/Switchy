import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../services/switch_kit.dart';
import 'switch_kit_progress_store.dart';

/// ערכת מעבר — Switch Autopilot.
///
/// A pull-only tool: the user picks the provider + service they want to leave
/// (pre-filled from a tracked renewal plan when they arrived from one), and we
/// build a factual exit packet — an honest checklist, the real consumer rights,
/// and a cancellation/porting letter they REVIEW and SEND THEMSELVES. Progress
/// over the checklist is persisted locally (per provider+service) via
/// [SwitchKitProgressStore] so the tracker survives a restart.
///
/// TRUTH-ONLY: every word here mirrors the live AEO `/switch` guide's framing.
/// No invented phone numbers, no exact in-app steps, no fabricated timelines —
/// and we NEVER auto-send the letter. See [switchKitDisclaimer].
class SwitchKitWidget extends StatefulWidget {
  const SwitchKitWidget({
    super.key,
    this.initialProvider,
    this.initialCategory,
    this.trackedId,
  });

  /// Pre-selected provider (e.g. from a tracked plan or a provider page link).
  final String? initialProvider;

  /// Pre-selected plan category (`cellular`/`internet`/…).
  final String? initialCategory;

  /// When set, pull the provider + category from this tracked renewal plan.
  final String? trackedId;

  @override
  State<SwitchKitWidget> createState() => _SwitchKitWidgetState();
}

class _SwitchKitWidgetState extends State<SwitchKitWidget> {
  // The providers a user could be leaving — same honest list the porting form
  // uses (real Israeli carriers; "אחר" for anything not listed).
  static const _providers = [
    'פלאפון', 'סלקום', 'פרטנר', 'גולן טלקום', 'רמי לוי', 'הוט מובייל',
    'הוט', 'yes', 'בזק', '019 מובייל', 'אחר',
  ];

  // The service the user is leaving, expressed as a plan category so the kit's
  // porting/disconnect logic matches the rest of the app.
  static const _categories = <(String, String)>[
    ('cellular', 'סלולר'),
    ('internet', 'אינטרנט'),
    ('tv', 'טלוויזיה'),
    ('triple', 'חבילת טריפל'),
    ('abroad', 'חבילת חו"ל'),
  ];

  String? _provider;
  String _category = 'cellular';
  CommitmentStatus _commitment = CommitmentStatus.unknown;

  /// Local persistence for the tracker's done-steps (per provider+service).
  final _store = SwitchKitProgressStore();

  /// The currently-rendered progress, hydrated from [_store] for the current kit.
  SwitchProgress? _progress;
  bool _loadingProgress = false;

  @override
  void initState() {
    super.initState();
    // Resolve the pre-selection: an explicit tracked plan wins, then the raw
    // provider/category args.
    final tracked = widget.trackedId == null
        ? null
        : AppState().trackedPlanById(widget.trackedId!);
    if (tracked != null) {
      _provider = _matchProvider(tracked.provider);
      _category = tracked.category;
      _commitment = CommitmentStatus.unknown;
    } else {
      if (widget.initialProvider != null) {
        _provider = _matchProvider(widget.initialProvider!);
      }
      if (widget.initialCategory != null &&
          _categories.any((c) => c.$1 == widget.initialCategory)) {
        _category = widget.initialCategory!;
      }
    }
    if (_provider != null) _loadProgress();
  }

  /// Snap a free-text provider name to a chip in [_providers] (loose match), or
  /// 'אחר' when nothing fits — so a tracked plan's exact label still selects.
  String _matchProvider(String raw) {
    final name = raw.trim();
    for (final p in _providers) {
      if (p == name || name.contains(p) || p.contains(name)) return p;
    }
    return 'אחר';
  }

  SwitchKit? get _kit {
    final p = _provider;
    if (p == null) return null;
    return buildSwitchKit(
      providerName: p,
      category: _category,
      commitment: _commitment,
    );
  }

  Future<void> _loadProgress() async {
    final kit = _kit;
    if (kit == null) return;
    setState(() => _loadingProgress = true);
    final done = await _store.load(provider: kit.providerName, service: kit.service);
    if (!mounted) return;
    setState(() {
      _progress = SwitchProgress(stepIds: kit.stepIds, doneIds: done);
      _loadingProgress = false;
    });
  }

  void _onSelectionChanged() {
    // A new kit → reset the rendered progress and re-hydrate from storage.
    setState(() => _progress = null);
    if (_provider != null) _loadProgress();
  }

  Future<void> _toggleStep(String id) async {
    final kit = _kit;
    final current = _progress;
    if (kit == null || current == null) return;
    final next = current.toggle(id);
    setState(() => _progress = next);
    await _store.save(
      provider: kit.providerName,
      service: kit.service,
      doneIds: next.doneIds,
    );
  }

  Future<void> _restart() async {
    final kit = _kit;
    final current = _progress;
    if (kit == null || current == null) return;
    final cleared = current.cleared();
    setState(() => _progress = cleared);
    await _store.save(
      provider: kit.providerName,
      service: kit.service,
      doneIds: cleared.doneIds,
    );
  }

  void _copyLetter(SwitchKit kit) {
    Clipboard.setData(ClipboardData(text: '${kit.letter}\n${kit.disclaimer}'));
    AppSnackBar.info(context, 'המכתב הועתק — עברו עליו, השלימו פרטים ושלחו בעצמכם');
  }

  Future<void> _openOfficial(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (!mounted) return;
      AppSnackBar.error(context, 'לא ניתן לפתוח את הקישור');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    Provider.of<AppState>(context);
    final kit = _kit;

    return Scaffold(
      backgroundColor: t.background,
      appBar: AppBar(
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_rounded),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: const Text('ערכת מעבר'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _IntroCard(t: t).animate().fadeIn(duration: 300.ms),
            const SizedBox(height: 22),
            _SectionLabel('מאיזה ספק אתם עוזבים?', t: t),
            const SizedBox(height: 10),
            _providerChips(t).animate(delay: 60.ms).fadeIn(duration: 280.ms),
            const SizedBox(height: 22),
            _SectionLabel('איזה שירות?', t: t),
            const SizedBox(height: 10),
            _categoryChips(t).animate(delay: 120.ms).fadeIn(duration: 280.ms),
            const SizedBox(height: 22),
            _SectionLabel('המסלול בהתחייבות?', t: t),
            const SizedBox(height: 10),
            _commitmentChips(t).animate(delay: 180.ms).fadeIn(duration: 280.ms),
            const SizedBox(height: 28),
            if (kit == null)
              _EmptyHint(t: t).animate().fadeIn(duration: 280.ms)
            else ...[
              _SummaryCard(kit: kit, t: t)
                  .animate()
                  .fadeIn(duration: 300.ms)
                  .slideY(begin: 0.05),
              const SizedBox(height: 20),
              _trackerCard(kit, t),
              const SizedBox(height: 20),
              _rightsCard(kit, t),
              const SizedBox(height: 20),
              _letterCard(kit, t),
              if (kit.officialUrl != null) ...[
                const SizedBox(height: 20),
                _officialCard(kit, t),
              ],
              const SizedBox(height: 20),
              _disclaimerCard(kit, t),
            ],
            const SizedBox(height: 24),
            _streetPriceTile(t),
          ],
        ),
      ),
    );
  }

  // ── Selection chips ────────────────────────────────────────────────────────

  Widget _providerChips(AppTheme t) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _providers.map((p) {
        final selected = _provider == p;
        return _Chip(
          label: p,
          selected: selected,
          t: t,
          onTap: () {
            setState(() => _provider = p);
            _onSelectionChanged();
          },
        );
      }).toList(),
    );
  }

  Widget _categoryChips(AppTheme t) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _categories.map((c) {
        final selected = _category == c.$1;
        return _Chip(
          label: c.$2,
          selected: selected,
          t: t,
          onTap: () {
            setState(() => _category = c.$1);
            _onSelectionChanged();
          },
        );
      }).toList(),
    );
  }

  Widget _commitmentChips(AppTheme t) {
    const opts = <(CommitmentStatus, String)>[
      (CommitmentStatus.none, 'ללא התחייבות'),
      (CommitmentStatus.committed, 'עם התחייבות'),
      (CommitmentStatus.unknown, 'לא בטוח/ה'),
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: opts.map((o) {
        final selected = _commitment == o.$1;
        return _Chip(
          label: o.$2,
          selected: selected,
          t: t,
          onTap: () => setState(() => _commitment = o.$1),
        );
      }).toList(),
    );
  }

  // ── Tracker ─────────────────────────────────────────────────────────────────

  Widget _trackerCard(SwitchKit kit, AppTheme t) {
    final progress = _progress;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: t.cardSurface,
        borderRadius: BorderRadius.circular(t.radiusCard),
        border: Border.all(color: t.alternate),
        boxShadow: t.shadowSoft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.checklist_rounded, color: t.brandAccent, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text('מעקב שלב-אחר-שלב', style: t.titleSmall),
              ),
              if (progress != null && progress.completed > 0)
                Semantics(
                  button: true,
                  label: 'התחל מחדש את המעקב',
                  child: IconButton(
                    icon: const Icon(Icons.restart_alt_rounded, size: 20),
                    tooltip: 'התחל מחדש',
                    onPressed: _restart,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (_loadingProgress || progress == null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation(t.brandAccent)),
                ),
              ),
            )
          else ...[
            _progressBar(progress, t),
            const SizedBox(height: 16),
            for (var i = 0; i < kit.steps.length; i++)
              _stepTile(kit.steps[i], i, progress, t),
          ],
        ],
      ),
    );
  }

  Widget _progressBar(SwitchProgress progress, AppTheme t) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              progress.isComplete
                  ? 'הושלם — כל הכבוד!'
                  : '${progress.completed} מתוך ${progress.total} שלבים',
              style: t.labelMedium.copyWith(
                color: progress.isComplete ? t.brandAccentText : t.secondaryText,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text('${progress.percent}%',
                style: t.labelMedium
                    .copyWith(color: t.brandAccent, fontWeight: FontWeight.w800)),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(t.radiusPill),
          child: LinearProgressIndicator(
            value: progress.fraction,
            minHeight: 8,
            backgroundColor: t.alternate.withValues(alpha: 0.4),
            valueColor: AlwaysStoppedAnimation(t.brandAccent),
          ),
        ),
      ],
    );
  }

  Widget _stepTile(SwitchStep step, int index, SwitchProgress progress, AppTheme t) {
    final done = progress.isDone(step.id);
    final isNext = progress.nextStepId == step.id;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Semantics(
        button: true,
        toggled: done,
        label: done ? '${step.title}, הושלם' : '${step.title}, סמן כבוצע',
        excludeSemantics: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(t.radiusSm),
          onTap: () => _toggleStep(step.id),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isNext ? t.brandAccentTint : Colors.transparent,
              borderRadius: BorderRadius.circular(t.radiusSm),
              border: Border.all(
                color: isNext ? t.brandAccent.withValues(alpha: 0.3) : Colors.transparent,
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AnimatedContainer(
                  duration: t.motionFast,
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: done ? t.brandAccent : t.cardSurface,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: done ? t.brandAccent : t.alternate,
                      width: 1.5,
                    ),
                  ),
                  child: done
                      ? const Icon(Icons.check_rounded, size: 16, color: Colors.white)
                      : Center(
                          child: Text('${index + 1}',
                              style: t.labelSmall.copyWith(
                                  color: t.secondaryText,
                                  fontWeight: FontWeight.w700)),
                        ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        step.title,
                        style: t.bodyMedium.copyWith(
                          fontWeight: FontWeight.w700,
                          decoration: done ? TextDecoration.lineThrough : null,
                          color: done ? t.secondaryText : t.primaryText,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(step.detail,
                          style: t.bodySmall.copyWith(height: 1.4)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Rights ───────────────────────────────────────────────────────────────────

  Widget _rightsCard(SwitchKit kit, AppTheme t) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: t.cardSurface,
        borderRadius: BorderRadius.circular(t.radiusCard),
        border: Border.all(color: t.alternate),
        boxShadow: t.shadowSoft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.gavel_rounded, color: t.brandAccent, size: 20),
              const SizedBox(width: 8),
              Text('הזכויות שלכם', style: t.titleSmall),
            ],
          ),
          const SizedBox(height: 12),
          for (final r in kit.rights)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.check_circle_outline_rounded,
                          size: 16, color: t.brandAccent),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(r.title,
                            style: t.bodyMedium
                                .copyWith(fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Padding(
                    padding: const EdgeInsetsDirectional.only(start: 22),
                    child: Text(r.detail, style: t.bodySmall.copyWith(height: 1.45)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ── Letter ───────────────────────────────────────────────────────────────────

  Widget _letterCard(SwitchKit kit, AppTheme t) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: t.cardSurface,
        borderRadius: BorderRadius.circular(t.radiusCard),
        border: Border.all(color: t.alternate),
        boxShadow: t.shadowSoft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.mail_outline_rounded, color: t.brandAccent, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text('מכתב ניתוק/ניוד מוכן', style: t.titleSmall)),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'עברו על הטיוטה, השלימו את הפרטים בסוגריים — ושלחו אותה בעצמכם דרך '
            'הערוצים הרשמיים של הספק. אנחנו לא שולחים אותה עבורכם.',
            style: t.bodySmall.copyWith(height: 1.45),
          ),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: t.background,
              borderRadius: BorderRadius.circular(t.radiusSm),
              border: Border.all(color: t.alternate),
            ),
            child: SelectableText(
              kit.letter,
              style: t.bodySmall.copyWith(height: 1.6, color: t.primaryText),
            ),
          ),
          const SizedBox(height: 14),
          AppButton(
            text: 'העתק את המכתב',
            icon: const Icon(Icons.copy_rounded, size: 18, color: Colors.white),
            onPressed: () async => _copyLetter(kit),
            color: AppColors.primary,
            height: 50,
            width: double.infinity,
          ),
        ],
      ),
    );
  }

  // ── Official link ─────────────────────────────────────────────────────────────

  Widget _officialCard(SwitchKit kit, AppTheme t) {
    final url = kit.officialUrl!;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: t.brandAccentTint,
        borderRadius: BorderRadius.circular(t.radiusCard),
        border: Border.all(color: t.brandAccent.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('הדף הרשמי של ${kit.providerName}',
              style: t.titleSmall.copyWith(color: t.brandAccentText)),
          const SizedBox(height: 6),
          Text(
            'להליך הניתוק המדויק ולפרטי הקשר העדכניים — פנו לאתר הרשמי. הפרטים '
            'המחייבים מופיעים שם בלבד; איננו ממציאים מספרי טלפון או שלבים.',
            style: t.bodySmall.copyWith(color: t.brandAccentText, height: 1.45),
          ),
          const SizedBox(height: 12),
          AppButton.secondary(
            text: 'לאתר הרשמי של ${kit.providerName}',
            icon: Icon(Icons.open_in_new_rounded, size: 18, color: t.brandAccent),
            onPressed: () async => _openOfficial(url),
            height: 48,
            width: double.infinity,
            textStyle: t.labelLarge.copyWith(color: t.brandAccentText),
          ),
        ],
      ),
    );
  }

  // ── Disclaimer ────────────────────────────────────────────────────────────────

  Widget _disclaimerCard(SwitchKit kit, AppTheme t) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.accent1,
        borderRadius: BorderRadius.circular(t.radiusSm),
        border: Border.all(color: t.alternate),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, size: 18, color: t.secondaryText),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              kit.disclaimer,
              style: t.labelSmall.copyWith(height: 1.5),
            ),
          ),
        ],
      ),
    );
  }

  // ── Street-price cross-link ─────────────────────────────────────────────────

  Widget _streetPriceTile(AppTheme t) {
    return Semantics(
      button: true,
      label: 'מחיר רחוב — מה אנשים באמת משלמים',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(t.radiusCard),
        onTap: () => context.pushNamed('StreetPrice'),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: t.cardSurface,
            borderRadius: BorderRadius.circular(t.radiusCard),
            border: Border.all(color: t.alternate),
            boxShadow: t.shadowXs,
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: t.saving.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(t.radiusSm),
                ),
                child: Icon(Icons.insights_rounded, color: t.savingText, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('מחיר רחוב', style: t.titleSmall),
                    const SizedBox(height: 2),
                    Text('מה אנשים באמת משלמים — ושתפו את המחיר שלכם',
                        style: t.bodySmall),
                  ],
                ),
              ),
              Icon(Icons.chevron_left_rounded, color: t.secondaryText),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Small shared pieces ────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text, {required this.t});
  final String text;
  final AppTheme t;
  @override
  Widget build(BuildContext context) =>
      Text(text, style: t.titleSmall.copyWith(fontWeight: FontWeight.w700));
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
    required this.t,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? t.brandAccent : t.cardSurface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected ? t.brandAccent : t.alternate,
              width: selected ? 1.5 : 1,
            ),
            boxShadow: selected
                ? [
                    BoxShadow(
                        color: t.brandAccent.withValues(alpha: 0.28),
                        blurRadius: 10,
                        offset: const Offset(0, 3))
                  ]
                : [],
          ),
          child: Text(
            label,
            style: t.bodyMedium.copyWith(
              color: selected ? Colors.white : t.primaryText,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}

class _IntroCard extends StatelessWidget {
  const _IntroCard({required this.t});
  final AppTheme t;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: t.brandAccentTint,
        borderRadius: BorderRadius.circular(t.radiusCard),
        border: Border.all(color: t.brandAccent.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.sync_alt_rounded, color: t.brandAccent, size: 20),
              const SizedBox(width: 8),
              Text('עוזבים ספק? בלי להסתבך',
                  style: t.titleSmall.copyWith(color: t.brandAccentText)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'בחרו את הספק והשירות שאתם רוצים לעזוב — ונכין לכם ערכת מעבר עובדתית: '
            'צ׳ק-ליסט, הזכויות שלכם לפי הדין, ומכתב ניתוק/ניוד מוכן שאתם בודקים '
            'ושולחים בעצמכם.',
            style: t.bodySmall.copyWith(color: t.brandAccentText, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint({required this.t});
  final AppTheme t;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: t.cardSurface,
        borderRadius: BorderRadius.circular(t.radiusCard),
        border: Border.all(color: t.alternate),
      ),
      child: Row(
        children: [
          Icon(Icons.touch_app_rounded, color: t.secondaryText, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Text('בחרו ספק כדי לבנות את ערכת המעבר',
                style: t.bodyMedium.copyWith(color: t.secondaryText)),
          ),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.kit, required this.t});
  final SwitchKit kit;
  final AppTheme t;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        // Premium ink hero — stays ink in both themes (not recoloured).
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(t.radiusCard),
        boxShadow: t.shadowMd,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.lightbulb_outline_rounded,
                  color: AppColors.secondary, size: 20),
              const SizedBox(width: 8),
              Text('השורה התחתונה',
                  style: t.labelLarge.copyWith(
                      color: Colors.white, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            kit.summary,
            style: t.bodyMedium
                .copyWith(color: Colors.white.withValues(alpha: 0.92), height: 1.55),
          ),
        ],
      ),
    );
  }
}
