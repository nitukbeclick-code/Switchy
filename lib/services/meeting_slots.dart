/// Pure scheduling rules for "פגישת וידאו עם נציג" (Zoom sales meetings).
///
/// Single source of truth for WHICH days and HOURS are bookable — the wizard
/// renders exactly this, and the server-side `meetings_guard()` trigger
/// re-enforces the same rules authoritatively. Booking opens 4 HOURS ahead
/// (same-day slots allowed once they clear the lead time), Sunday–Thursday
/// 09:00–20:30 plus Friday mornings 09:00–12:30, in 30-minute slots.
///
/// All times here are Israel WALL time (the only clock the user thinks in);
/// the UTC instant (`starts_at`) is computed server-side with the Postgres tz
/// database so DST never drifts.
library;

/// Minimum lead time before a meeting may start (shared with the server guard
/// and the website). A chosen date+slot must be at least this far in the
/// future (Israel time) to be bookable.
const Duration meetingMinLead = Duration(hours: 4);

/// The providers offered in the meeting wizard. Authoritative list shared with
/// the server guard and the website — keep these EXACT strings in sync.
const List<String> meetingProviders = [
  'HOT',
  'yes',
  'פרטנר',
  'סלקום',
  'STING TV',
  'בזק',
  'הוט מובייל',
];

/// Sunday–Thursday and Friday are bookable; Saturday is not.
bool isMeetingBookableDay(DateTime d) => d.weekday != DateTime.saturday;

/// "Now" in Israel WALL time. The default device clock is read as UTC+3, which
/// is never behind Israel time, so the wizard can't offer a moment the server
/// (Asia/Jerusalem) would reject — even on a device whose local clock lags.
DateTime _israelNow(DateTime? now) =>
    now ?? DateTime.now().toUtc().add(const Duration(hours: 3));

/// The dates a meeting may be booked on, skipping Saturdays, first [count]
/// bookable days. TODAY is included when at least one of today's slots still
/// clears the [meetingMinLead] lead time (≥ now + 4h, Israel wall time);
/// otherwise the list starts from the next valid day.
List<DateTime> bookableMeetingDates({DateTime? now, int count = 14}) {
  final base = _israelNow(now);
  final today = DateTime(base.year, base.month, base.day);
  final out = <DateTime>[];
  // Start at today only if it still has a bookable slot; otherwise tomorrow.
  var d = meetingSlotsFor(today, now: base).isNotEmpty
      ? today
      : today.add(const Duration(days: 1));
  while (out.length < count) {
    if (isMeetingBookableDay(d)) out.add(d);
    d = d.add(const Duration(days: 1));
  }
  return out;
}

/// 30-minute slots for [date]: Friday is mornings-only (09:00–12:30),
/// Sunday–Thursday run 09:00–20:30. Saturday yields no slots. When [date] is
/// today (per [now], Israel wall time), only slots whose start is at least
/// [meetingMinLead] (4h) in the future are returned.
List<String> meetingSlotsFor(DateTime date, {DateTime? now}) {
  if (!isMeetingBookableDay(date)) return const [];
  final lastHalfHour = date.weekday == DateTime.friday ? 12 : 20;
  final base = _israelNow(now);
  final isToday = date.year == base.year && date.month == base.month && date.day == base.day;
  // Lead-time cutoff as minutes-from-midnight of [date]. Computed in field
  // space (Y/M/D/H/M) so it never mixes a UTC `base` with a local slot instant
  // — both `base` and the slot are read purely by their wall-clock fields.
  int? earliestMinOfDay;
  if (isToday) {
    final cutoff = base.add(meetingMinLead);
    // base + lead lands on the same calendar day here (lead is only 4h and the
    // last slot is 20:30, so a cutoff past midnight simply empties the list).
    earliestMinOfDay = cutoff.day == date.day
        ? cutoff.hour * 60 + cutoff.minute
        : 24 * 60; // cutoff rolled past today → no slot qualifies
  }
  final out = <String>[];
  for (var h = 9; h <= lastHalfHour; h++) {
    for (final m in const [0, 30]) {
      if (earliestMinOfDay != null && h * 60 + m < earliestMinOfDay) continue;
      out.add('${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}');
    }
  }
  return out;
}

/// Combine a 'YYYY-MM-DD' date and an 'HH:MM' slot into a wall-time DateTime
/// (local clock — used for display and countdowns, never for UTC math).
DateTime meetingLocalStart(String dateIso, String slot) {
  final d = DateTime.parse(dateIso);
  final parts = slot.split(':');
  return DateTime(d.year, d.month, d.day, int.parse(parts[0]), int.parse(parts[1]));
}

const _hebrewDayLetters = {
  DateTime.sunday: 'א׳',
  DateTime.monday: 'ב׳',
  DateTime.tuesday: 'ג׳',
  DateTime.wednesday: 'ד׳',
  DateTime.thursday: 'ה׳',
  DateTime.friday: 'ו׳',
  DateTime.saturday: 'ש׳',
};

/// 'יום ג׳ · 16.6' — the date-chip label.
String formatMeetingDateHe(DateTime d) =>
    'יום ${_hebrewDayLetters[d.weekday]} · ${d.day}.${d.month}';

/// 'YYYY-MM-DD' for [MeetingInput.meetingDate].
String meetingDateIso(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
