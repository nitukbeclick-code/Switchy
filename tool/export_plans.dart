// Exports the app's plan catalogue.
//
// ⚠️ public.plans IS DB-AUTHORITATIVE — DO NOT CLOBBER OWNER EDITS. ⚠️
//   The owner curates public.plans directly in the Supabase dashboard (prices,
//   feats, fine_lines, notes, terms, specs, fees, highlight, rating, …) and the
//   site/app/bot read those live. This export must therefore NEVER overwrite an
//   existing plan row — it only INSERTS rows for ids the DB doesn't have yet
//   (insert-only via on_conflict=id + resolution=ignore-duplicates). A re-run on
//   an existing id is a no-op server-side, so a dashboard edit always survives.
//   If you ever need to refresh a structural field on existing rows, do it with a
//   targeted, column-scoped UPDATE — never widen this back to merge-duplicates.
//
// Two actions, both driven by the flutter test runner (the data layer pulls in
// Flutter, so we run under `flutter test` rather than `dart run`):
//
//   1. JSON export → site/data/plans.json (the static site renders the real
//      plans from this file). Always runs.
//   2. INSERT-ONLY upsert → public.plans (seeds NEW plan ids the dashboard
//      doesn't carry yet; existing ids are left untouched so owner edits stand).
//      Only runs when both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are present
//      in the environment — otherwise skipped (so CI / a plain `flutter test`
//      stays offline).
//
// Run from the repo root:
//   flutter test tool/export_plans.dart                      # JSON only
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     flutter test tool/export_plans.dart                    # JSON + UPSERT
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';
import 'package:chosech/models.dart';

void main() {
  test('export plan catalogue to site/data/plans.json', () {
    final cats = categories
        .map((c) => {'id': c.id, 'name': c.name, 'icon': c.icon})
        .toList();

    final plans = allPlans.map((p) => {
          'id': p.id,
          'cat': p.cat,
          'provider': p.provider,
          'plan': p.plan,
          'price': p.price,
          'priceExact': p.priceExact,
          'after': p.hasPromo ? p.after : null,
          'afterExact': p.hasPromo ? p.afterExact : null,
          'net': p.netLabel,
          'is5G': p.is5G,
          'noCommit': p.noCommit,
          'hasAbroad': p.hasAbroad,
          'feats': p.feats,
          'specs': p.specs,
          'priceUnit': p.unit, // month / package / day / minute (resolved default)
          'kind': p.kind,      // regular / dataonly / kosher
          // ── Rich detail for the site "מידע נוסף" modal (all optional) ─────────
          'fees': p.fees,            // דמי חיבור / התקנה / נתב / מגדיל טווח / ממיר
          'fineLines': p.allFinePrint, // the full "פרטים נוספים" bullets
          'terms': p.terms,          // commitment / contract bullets
          'term': p.term,            // commitment months (null = ללא התחייבות)
          'eligibility': p.eligibility,
          'notes': p.notes,
          'updatedAt': p.updatedAt,
        }).toList();

    final out = {
      'generated': DateTime.now().toIso8601String(),
      'categories': cats,
      'plans': plans,
    };

    final f = File('site/data/plans.json');
    f.parent.createSync(recursive: true);
    f.writeAsStringSync(const JsonEncoder.withIndent('  ').convert(out));

    // Sanity: the catalogue should be the full set.
    expect(plans.length, greaterThan(100));
    // ignore: avoid_print
    print('Exported ${plans.length} plans across ${cats.length} categories → site/data/plans.json');
  });

  test('upsert plan catalogue into public.plans (skipped without creds)', () async {
    final url = Platform.environment['SUPABASE_URL']?.trim();
    final key = Platform.environment['SUPABASE_SERVICE_ROLE_KEY']?.trim();
    if (url == null || url.isEmpty || key == null || key.isEmpty) {
      // ignore: avoid_print
      print('SKIP upsert: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to push to public.plans.');
      return;
    }

    final n = await upsertPlansToSupabase(url, key);
    // ignore: avoid_print
    print('Upserted $n plans → public.plans');
    expect(n, equals(allPlans.length));
  });
}

/// Maps every plan in [allPlans] into the `public.plans` row shape and INSERTs
/// the ones the DB doesn't have yet via the Supabase REST API (service role,
/// on_conflict=id, resolution=ignore-duplicates). public.plans is DB-authoritative
/// (owner-curated in the dashboard), so on an id conflict we DO NOTHING — the
/// existing row (and any owner edit to price/feats/fine_lines/notes/terms/specs/
/// fees/highlight/rating/…) is preserved. Column mapping mirrors what
/// _shared/catalogue.ts plansFromRows() reads (the structural identity + flags).
/// Returns the number of rows sent (not necessarily the number inserted — the
/// server silently skips existing ids).
///
/// Secrets come from the caller (env) — never hardcode them here.
Future<int> upsertPlansToSupabase(String url, String key) async {
  final rows = allPlans.map(planToRow).toList();
  final base = url.endsWith('/') ? url.substring(0, url.length - 1) : url;
  final uri = Uri.parse('$base/rest/v1/plans?on_conflict=id');

  final client = HttpClient();
  try {
    final req = await client.postUrl(uri);
    req.headers.set('Content-Type', 'application/json');
    req.headers.set('apikey', key);
    req.headers.set('Authorization', 'Bearer $key');
    // ignore-duplicates = INSERT-ONLY on the id conflict target (DO NOTHING on an
    // existing id) so owner dashboard edits are NEVER clobbered; minimal = no body.
    req.headers.set('Prefer', 'resolution=ignore-duplicates,return=minimal');
    req.add(utf8.encode(jsonEncode(rows)));
    final resp = await req.close();
    final body = await resp.transform(utf8.decoder).join();
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      throw HttpException(
        'upsert failed: HTTP ${resp.statusCode} ${body.isEmpty ? '' : body}',
        uri: uri,
      );
    }
  } finally {
    client.close(force: true);
  }
  return rows.length;
}

/// One `public.plans` row from a [Plan]. Keys are the DB column names
/// (category, title, price_exact, …) so the body PATCHes/inserts cleanly.
Map<String, dynamic> planToRow(Plan p) => {
      'id': p.id,
      'provider': p.provider,
      'category': p.cat,
      'title': p.plan,
      'price': p.price,
      'price_exact': p.priceExact,
      'after': p.hasPromo ? p.after : null,
      'after_exact': p.hasPromo ? p.afterExact : null,
      'is_5g': p.is5G,
      'no_commit': p.noCommit,
      'has_abroad': p.hasAbroad,
      'specs': p.specs, // jsonb (label→value)
      'price_unit': p.unit, // month / package / day / minute (resolved default)
      'kind': p.kind,
      'subtitle': p.feats.isNotEmpty ? p.feats.join(' · ') : null,
    };
