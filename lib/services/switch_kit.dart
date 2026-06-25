/// Pure "ערכת מעבר" (Switch Autopilot) builder + progress model.
///
/// This is the single source of truth for the Switch Kit: the packet a user
/// reviews before leaving a provider (a factual exit checklist, a cancellation /
/// number-porting letter they review and send THEMSELVES, and the honest legal
/// framing) plus the step-by-step tracker's progress model. No Flutter, no UI,
/// no navigation, no network — just data, so it can be unit-tested directly and
/// can never drift from the screen that renders it.
///
/// TRUTH-ONLY / E-E-A-T — this mirrors the SAME honest framing as the live AEO
/// `/switch` guide (web/app/switch). It is grounded in real Israeli consumer
/// rights:
///   • זכות הניתוק — a provider must let you disconnect after written notice;
///   • ניוד מספר via מסלקת הניוד — you keep your number, free, and the NEW
///     provider handles the port (you do not disconnect first);
///   • מסלולים ללא התחייבות have no exit penalty; commitment plans may bill only
///     the remaining commitment per the contract you signed.
/// It invents NO phone numbers, NO exact in-app steps, and NO fabricated
/// timelines. Every kit carries an explicit "הנחיה כללית, לא ייעוץ משפטי"
/// disclaimer and points the user to the provider's OFFICIAL site for the
/// authoritative procedure. The cancellation letter is NEVER auto-sent — the
/// user reviews it and sends it themselves.
library;

/// Whether the user's current plan carries a commitment, which changes the exit
/// framing (penalty exposure) honestly without inventing a specific number.
enum CommitmentStatus {
  /// ללא התחייבות — no early-termination penalty.
  none,

  /// בהתחייבות — a remaining-commitment charge per the signed contract may apply.
  committed,

  /// The user isn't sure — we tell them how to check, and frame conservatively.
  unknown,
}

/// The kind of service being left — drives whether number porting is relevant.
enum SwitchService {
  /// סלולר — number porting via מסלקת הניוד applies (handled by the new provider).
  cellular,

  /// אינטרנט/טלוויזיה/חבילה — no number port; the exit is a written disconnect
  /// notice (+ possible equipment return).
  fixed,
}

/// Map a plan-category string (the app's `cellular`/`internet`/`tv`/`triple`/
/// `abroad`) to the exit service kind. Only `cellular` (and abroad SIMs, which
/// are cellular numbers) involve number porting; everything else is a fixed
/// disconnect.
SwitchService switchServiceForCategory(String category) {
  switch (category) {
    case 'cellular':
    case 'abroad':
      return SwitchService.cellular;
    default:
      return SwitchService.fixed;
  }
}

/// A single factual exit step (general, accurate — never invented per-provider
/// specifics). Mirrors the HowTo steps on the AEO `/switch/[provider]` guide.
class SwitchStep {
  const SwitchStep({
    required this.id,
    required this.title,
    required this.detail,
  });

  /// Stable id used as the persistence key for the tracker's "done" state. Never
  /// renumber an existing id — completed progress is stored against it.
  final String id;

  /// Short imperative Hebrew title (e.g. "בדקו את תנאי ההתקשרות").
  final String title;

  /// One-paragraph factual detail for the step.
  final String detail;
}

/// The fully-built Switch Kit for one (provider, plan) the user is leaving.
/// Pure data: a screen renders it; nothing here re-derives the catalogue.
class SwitchKit {
  const SwitchKit({
    required this.providerName,
    required this.service,
    required this.commitment,
    required this.steps,
    required this.letter,
    required this.summary,
    required this.officialUrl,
    required this.disclaimer,
    required this.rights,
  });

  /// The provider being left (display name as it appears in the catalogue).
  final String providerName;

  /// Whether this is a cellular (portable number) or fixed (disconnect) exit.
  final SwitchService service;

  /// The user's commitment status, framing penalty exposure honestly.
  final CommitmentStatus commitment;

  /// The ordered exit checklist (the tracker walks these).
  final List<SwitchStep> steps;

  /// The cancellation / porting letter the USER reviews and sends themselves.
  final String letter;

  /// A one-paragraph plain-language summary ("השורה התחתונה").
  final String summary;

  /// The provider's official site, or null when none is verified — callers must
  /// NOT fabricate a link/number when this is null.
  final String? officialUrl;

  /// The mandatory "general guidance, not legal advice" disclaimer (always set).
  final String disclaimer;

  /// The factual rights bullets behind the kit (זכות הניתוק, ניוד מספר, …).
  final List<SwitchRight> rights;

  /// The stable step ids, in order — the tracker uses these as its checklist
  /// keys so completion survives a rebuild/restart.
  List<String> get stepIds => [for (final s in steps) s.id];
}

/// A factual consumer-right behind the kit, transparently stated.
class SwitchRight {
  const SwitchRight({required this.title, required this.detail});
  final String title;
  final String detail;
}

/// Real, verified official sites by provider display name — mirrors web's
/// `PROVIDER_OFFICIAL_URLS` (web/lib/data.ts). Used ONLY to surface a REAL link
/// to the provider's own cancellation/contact channels; we never fabricate a
/// URL or a phone number. Loose matching in [switchKitOfficialUrl] lets a
/// catalogue name like 'גולן טלקום' resolve to its base entry.
const Map<String, String> _providerOfficialUrls = {
  'בזק': 'https://www.bezeq.co.il',
  'פרטנר': 'https://www.partner.co.il',
  'הוט': 'https://www.hot.net.il',
  'HOT': 'https://www.hot.net.il',
  'הוט מובייל': 'https://www.hotmobile.co.il',
  'סלקום': 'https://www.cellcom.co.il',
  'yes': 'https://www.yes.co.il',
  'פלאפון': 'https://www.pelephone.co.il',
  'גולן טלקום': 'https://www.golantelecom.co.il',
  'רמי לוי': 'https://www.rl-net.co.il',
  '019 מובייל': 'https://www.019mobile.co.il',
};

/// The provider's REAL official URL by display name, or null when none is
/// verified — callers MUST omit the link when this returns null (never invent
/// one). Exact match first, then a loose contains-match so 'גולן טלקום' finds
/// 'גולן' and vice-versa.
String? switchKitOfficialUrl(String providerName) {
  final name = providerName.trim();
  final exact = _providerOfficialUrls[name];
  if (exact != null) return exact;
  for (final e in _providerOfficialUrls.entries) {
    if (name.contains(e.key) || e.key.contains(name)) return e.value;
  }
  return null;
}

/// The mandatory disclaimer shown on every kit and letter. Not legal advice;
/// the binding procedure lives on the provider's official channels.
const String switchKitDisclaimer =
    'הנחיה כללית, לא ייעוץ משפטי. הפרטים המחייבים (הליך הניתוק, פרטי קשר '
    'ותנאי ההתחייבות שלכם) מופיעים אצל הספק בערוצים הרשמיים — בדקו אותם לפני '
    'הניתוק. אנחנו לא שולחים את המכתב עבורכם: אתם בודקים ושולחים אותו בעצמכם.';

/// Build the factual exit checklist for a service kind. The steps are accurate
/// and general; the porting step appears only for a cellular number.
List<SwitchStep> buildSwitchSteps({
  required String providerName,
  required SwitchService service,
}) {
  final isCellular = service == SwitchService.cellular;
  return [
    SwitchStep(
      id: 'check_terms',
      title: 'בדקו את תנאי ההתקשרות שלכם',
      detail:
          'אתרו את מסמך תנאי ההתקשרות מול $providerName ובדקו אם המסלול שלכם הוא '
          'עם התחייבות או בלעדיה. במסלול ללא התחייבות אין קנס יציאה; במסלול עם '
          'התחייבות ייתכן חיוב על יתרת תקופת ההתחייבות בלבד — לא קנס מעבר לכך.',
    ),
    const SwitchStep(
      id: 'compare_alt',
      title: 'בחרו ספק חדש והשוו חלופות',
      detail:
          'לפני הניתוק, השוו מסלולים חלופיים כדי לוודא שהמעבר באמת משתלם — לפי '
          'המחיר היום והמחיר אחרי המבצע. כך אתם עוברים למסלול טוב יותר, לא רק שונה.',
    ),
    if (isCellular)
      SwitchStep(
        id: 'port_number',
        title: 'ניוד המספר מתבצע מול הספק החדש',
        detail:
            'לשמירת מספר הטלפון מסרו לספק החדש את המספר ופרטי הזיהוי. הספק החדש '
            'מטפל בניוד מול מסלקת הניוד וסוגר את החשבון אצל $providerName. הניוד '
            'חינמי ומתבצע בדרך כלל תוך יום עסקים אחד — אין צורך לנתק מראש בעצמכם.',
      )
    else
      SwitchStep(
        id: 'notice',
        title: 'מסרו הודעת ניתוק בכתב ותעדו אותה',
        detail:
            'מסרו ל$providerName הודעת ניתוק בערוצים הרשמיים, ושמרו תיעוד '
            '(אישור/מספר פנייה) של מועד ההודעה. הספק מחויב להפסיק את השירות '
            'ולעצור את החיוב בהתאם לדין ולתנאי ההתקשרות.',
      ),
    const SwitchStep(
      id: 'send_letter',
      title: 'עברו על המכתב — ושלחו אותו בעצמכם',
      detail:
          'הכנו לכם טיוטת מכתב ניתוק/ניוד. עברו עליה, השלימו את הפרטים החסרים '
          'ושלחו אותה דרך הערוצים הרשמיים של הספק. אנחנו לא שולחים אותה עבורכם.',
    ),
    const SwitchStep(
      id: 'equipment',
      title: 'ודאו החזרת ציוד ובדקו את החשבון הסופי',
      detail:
          'אם קיבלתם ציוד בהשאלה (ממיר/ראוטר), בררו מול הספק כיצד להחזירו. בדקו '
          'שהחשבון הסופי משקף את מועד הניתוק ושאין חיובים מעבר ליתרת ההתחייבות.',
    ),
  ];
}

/// The factual rights behind the kit — the same transparently-stated points as
/// the AEO guide's "הזכויות שלכם" section.
List<SwitchRight> buildSwitchRights({
  required String providerName,
  required SwitchService service,
}) {
  return [
    SwitchRight(
      title: 'זכות הניתוק',
      detail:
          '$providerName מחויבת לאפשר לכם להתנתק לאחר מסירת הודעה — אין מצב של '
          'סירוב לניתוק. החיוב נעצר בהתאם לדין ולתנאי ההתקשרות.',
    ),
    if (service == SwitchService.cellular)
      const SwitchRight(
        title: 'ניוד מספר חינמי',
        detail:
            'שמירת המספר במעבר ספק סלולר היא חינמית ומעוגנת בדין. הספק החדש מבצע '
            'את הניוד דרך מסלקת הניוד, כך שלא צריך לנתק מראש בעצמכם.',
      ),
    const SwitchRight(
      title: 'בלי קנסות מעבר ליתרת ההתחייבות',
      detail:
          'אם המסלול בהתחייבות, החיוב מוגבל ליתרת תקופת ההתחייבות בלבד לפי החוזה '
          '— ולא קנס שרירותי. במסלול ללא התחייבות אין חיוב כלל.',
    ),
  ];
}

/// Human-readable Hebrew label for a commitment status, for the letter + UI.
String commitmentLabel(CommitmentStatus c) {
  switch (c) {
    case CommitmentStatus.none:
      return 'ללא התחייבות';
    case CommitmentStatus.committed:
      return 'עם התחייבות';
    case CommitmentStatus.unknown:
      return 'לא ידוע';
  }
}

/// One honest sentence on penalty exposure given the commitment status — never
/// a fabricated number.
String _commitmentClause(CommitmentStatus c) {
  switch (c) {
    case CommitmentStatus.none:
      return 'מסלולי הוא ללא התחייבות, ולכן אין קנס יציאה.';
    case CommitmentStatus.committed:
      return 'ידוע לי שייתכן חיוב על יתרת תקופת ההתחייבות בלבד, בהתאם לחוזה '
          'שעליו חתמתי — ואני מבקש/ת לקבל פירוט של חיוב זה אם קיים.';
    case CommitmentStatus.unknown:
      return 'אבקש לבדוק מול הספק האם המסלול בהתחייבות, ואם כן — לקבל פירוט של '
          'יתרת ההתחייבות בלבד (ללא קנס מעבר לכך).';
  }
}

/// Build the cancellation / number-porting letter the USER reviews and sends.
///
/// The letter is a respectful, factual disconnect/port request grounded in the
/// real rights. Placeholders ([שם מלא], [מספר לקוח/חשבון], …) are left for the
/// user to fill — we never fabricate the user's identifying details. For a
/// cellular line it frames the request around number porting handled by the new
/// provider; for a fixed service it's a written disconnect notice.
String buildSwitchLetter({
  required String providerName,
  required SwitchService service,
  required CommitmentStatus commitment,
}) {
  final isCellular = service == SwitchService.cellular;
  const dateLine = 'תאריך: [תאריך]';
  final toLine = 'לכבוד: $providerName — מחלקת שירות לקוחות';
  final subject = isCellular
      ? 'הנדון: הודעה על מעבר ספק וניוד מספר'
      : 'הנדון: הודעה על ניתוק שירות';

  final body = StringBuffer()
    ..writeln('שלום רב,')
    ..writeln();

  if (isCellular) {
    body
      ..writeln(
          'אני, [שם מלא], בעל/ת מספר לקוח [מספר לקוח/חשבון] ות.ז. [מספר תעודת זהות], '
          'מבקש/ת להודיע על מעברי לספק אחר תוך שמירה על מספר הטלפון [מספר טלפון].')
      ..writeln()
      ..writeln(
          'ניוד המספר יתבצע מול הספק החדש דרך מסלקת הניוד, כפי שמתיר הדין. '
          'הודעה זו נמסרת לתיעוד ולעצירת החיוב במועד הניוד.');
  } else {
    body
      ..writeln(
          'אני, [שם מלא], בעל/ת מספר לקוח [מספר לקוח/חשבון] ות.ז. [מספר תעודת זהות], '
          'מבקש/ת להודיע על ניתוק השירות [סוג השירות] שברשותי החל מ-[תאריך מבוקש].')
      ..writeln()
      ..writeln(
          'אבקש לקבל אישור בכתב על מועד קליטת ההודעה ועל מועד הניתוק בפועל, '
          'וכן פירוט החשבון הסופי.');
  }

  body
    ..writeln()
    ..writeln(_commitmentClause(commitment))
    ..writeln()
    ..writeln(
        'אם קיים ברשותי ציוד בהשאלה, אבקש הנחיות להחזרתו. נא לאשר קבלת הודעה זו '
        'ולמסור מספר פנייה לתיעוד.')
    ..writeln()
    ..writeln('בכבוד רב,')
    ..writeln('[שם מלא]')
    ..writeln('[מספר טלפון] | [דוא"ל]');

  return '$dateLine\n$toLine\n$subject\n\n${body.toString().trimRight()}\n';
}

/// Build the full Switch Kit for leaving [providerName].
///
/// [category] is the app plan category (`cellular`/`internet`/…); [commitment]
/// frames penalty exposure; [officialUrl] is the provider's REAL official site
/// (pass null when none is verified — we never fabricate one).
SwitchKit buildSwitchKit({
  required String providerName,
  required String category,
  CommitmentStatus commitment = CommitmentStatus.unknown,
  String? officialUrl,
}) {
  final service = switchServiceForCategory(category);
  // Fall back to the verified official-URL map only when the caller didn't pass
  // one explicitly — never fabricate a link (null stays null).
  final resolvedUrl = officialUrl ?? switchKitOfficialUrl(providerName);
  final steps = buildSwitchSteps(providerName: providerName, service: service);
  final rights = buildSwitchRights(providerName: providerName, service: service);
  final letter = buildSwitchLetter(
    providerName: providerName,
    service: service,
    commitment: commitment,
  );

  final summary = service == SwitchService.cellular
      ? 'רוצים לעזוב את $providerName? במסלול ללא התחייבות אפשר להתנתק בכל עת ללא '
          'קנס; במסלול עם התחייבות משלמים רק על יתרת התקופה. את המספר שומרים בניוד '
          'חינמי דרך מסלקת הניוד, שמתבצע מול הספק החדש — בדרך כלל תוך יום עסקים.'
      : 'רוצים לעזוב את $providerName? מסרו הודעת ניתוק בכתב בערוצים הרשמיים '
          'ותעדו אותה. במסלול ללא התחייבות אין קנס; במסלול עם התחייבות משלמים רק '
          'על יתרת ההתחייבות. בדקו החזרת ציוד ואת החשבון הסופי.';

  return SwitchKit(
    providerName: providerName,
    service: service,
    commitment: commitment,
    steps: steps,
    letter: letter,
    summary: summary,
    officialUrl: resolvedUrl,
    disclaimer: switchKitDisclaimer,
    rights: rights,
  );
}

/// Immutable progress over a kit's checklist — which step ids are done. Pure;
/// the screen persists [doneIds] (e.g. via SharedPreferences) and renders the
/// derived figures. Built from the kit's [SwitchKit.stepIds] so a kit change
/// (e.g. cellular ↔ fixed) can't strand stale ids in the count.
class SwitchProgress {
  SwitchProgress({
    required this.stepIds,
    required Set<String> doneIds,
  }) : doneIds = {
          // Only count ids that still belong to this kit — drops any stale id
          // left over from a different (provider, service) kit.
          for (final id in doneIds)
            if (stepIds.contains(id)) id,
        };

  /// The kit's ordered step ids (the checklist).
  final List<String> stepIds;

  /// The subset of [stepIds] the user has marked done.
  final Set<String> doneIds;

  /// Total steps in the checklist.
  int get total => stepIds.length;

  /// How many steps are done.
  int get completed => doneIds.length;

  /// True once every step is done (and there is at least one step).
  bool get isComplete => total > 0 && completed >= total;

  /// Whether [id] is marked done.
  bool isDone(String id) => doneIds.contains(id);

  /// Completion fraction in `0.0..1.0` (0 when the checklist is empty).
  double get fraction => total == 0 ? 0 : completed / total;

  /// Whole-percent completion in `0..100`.
  int get percent => (fraction * 100).round();

  /// The first not-yet-done step id, or null when the checklist is complete —
  /// the tracker's "next action" pointer.
  String? get nextStepId {
    for (final id in stepIds) {
      if (!doneIds.contains(id)) return id;
    }
    return null;
  }

  /// A copy with [id] toggled done/undone.
  SwitchProgress toggle(String id) {
    if (!stepIds.contains(id)) return this;
    final next = Set<String>.from(doneIds);
    if (!next.remove(id)) next.add(id);
    return SwitchProgress(stepIds: stepIds, doneIds: next);
  }

  /// A copy with every step cleared (restart the tracker).
  SwitchProgress cleared() => SwitchProgress(stepIds: stepIds, doneIds: const {});
}
