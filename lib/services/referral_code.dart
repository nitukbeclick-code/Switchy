import 'dart:math';

/// Referral-code generation — the Dart mirror of the agent's
/// `_shared/referrals.ts` `makeReferralCode`. A code is a REAL, shareable token
/// in the same `SW-XXXXXX` shape the backend issues, so a referee can redeem it
/// and the referrer can be attributed.
///
/// HONESTY / §30A (mirrors referrals.ts):
///   • Sharing a code is NOT marketing TO anyone — the referrer chooses to share
///     it — so there is no consent gate here.
///   • There is NO advertised cash reward. The framing is share-the-tool
///     ("עזרו לחבר לחסוך"), value-based. A reward, if ever defined, is owner
///     config — never invented in the client.
class ReferralCode {
  /// Unambiguous alphabet: no 0/O, 1/I/L — readable aloud / typeable without
  /// confusion. Uppercase only (codes are case-insensitive on lookup).
  static const String alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  /// Body length: 30^6 ≈ 729M combinations — collision-safe at our volume.
  static const int bodyLen = 6;

  /// Brand prefix, e.g. "SW-7KQ4M9".
  static const String prefix = 'SW';

  /// Generate a code, e.g. "SW-7KQ4M9". A [random] seam lets tests pin the
  /// output deterministically.
  static String make([Random? random]) {
    final rng = random ?? Random.secure();
    final sb = StringBuffer(prefix)..write('-');
    for (var i = 0; i < bodyLen; i++) {
      sb.write(alphabet[rng.nextInt(alphabet.length)]);
    }
    return sb.toString();
  }

  /// Normalize a code for storage/lookup: trim, uppercase, strip whitespace.
  static String normalize(String raw) =>
      raw.trim().toUpperCase().replaceAll(RegExp(r'\s+'), '');

  /// True when [code] has the canonical `SW-XXXXXX` shape over the alphabet.
  static bool isValid(String code) {
    final c = normalize(code);
    return RegExp('^$prefix-[$alphabet]{$bodyLen}\$').hasMatch(c);
  }
}
