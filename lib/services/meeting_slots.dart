/// Pure scheduling rules for "פגישת וידאו עם נציג" (Zoom sales meetings).
///
/// Single source of truth for WHICH days and HOURS are bookable — the wizard
/// renders exactly this, and the server-side `meetings_guard()` trigger
/// re-enforces the same rules authoritatively. Booking opens TOMORROW (one-day
/// advance coordination), Sunday–Thursday 09:00–20:30 plus Friday mornings
/// 09:00–12:30, in 30-minute slots.
///
/// All times here are Israel WALL time (the only clock the user thinks in);
/// the UTC instant (`starts_at`) is computed server-side with the Postgres tz
/// database so DST never drifts.
library;

/// Sunday–Thursday and Friday are bookable; Saturday is not.
bool isMeetingBookableDay(DateTime d) => d.weekday != DateTime.saturday;

/// The dates a meeting may be booked on: starting TOMORROW (never today —
/// reps need a day's notice), skipping Saturdays, first [count] bookable days.
///
/// "Tomorrow" is judged by the ISRAEL calendar (the server's `meetings_guard`
/// enforces it in Asia/Jerusalem): the default clock is UTC+3, which is never
/// behind Israel time, so the wizard can't offer a date the server rejects —
/// even on a device whose local calendar lags Israel's.
List<DateTime> bookableMeetingDates({DateTime? now, int count = 14}) {
  final base = now ?? DateTime.now().toUtc().add(const Duration(hours: 3));
  final out = <DateTime>[];
  var d = DateTime(base.year, base.month, base.day).add(const Duration(days: 1));
  while (out.length < count) {
    if (isMeetingBookableDay(d)) out.add(d);
    d = d.add(const Duration(days: 1));
  }
  return out;
}

/// 30-minute slots for [date]: Friday is mornings-only (09:00–12:30),
/// Sunday–Thursday run 09:00–20:30. Saturday yields no slots.
List<String> meetingSlotsFor(DateTime date) {
  if (!isMeetingBookableDay(date)) return const [];
  final lastHalfHour = date.weekday == DateTime.friday ? 12 : 20;
  final out = <String>[];
  for (var h = 9; h <= lastHalfHour; h++) {
    out.add('${h.toString().padLeft(2, '0')}:00');
    out.add('${h.toString().padLeft(2, '0')}:30');
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
