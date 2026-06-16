@TestOn('vm')
library;

/// Generates the full Supabase `plans` seed from the bundled catalogue, so the
/// remote table is a faithful mirror of the app's [seedPlans] — no hand-copying,
/// always in sync. Run explicitly (it is NOT part of the default `flutter test`
/// suite because it lives under tool/):
///
///   flutter test tool/gen_plans_seed.dart
///
/// It (over)writes `supabase/migrations/20260617_plans_seed_full.sql` with an
/// idempotent upsert of every catalogue plan. Apply it (psql / Supabase SQL
/// editor / MCP apply_migration) against the *Chosech* project once one exists.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';

String _sql(String? v) => v == null ? 'null' : "'${v.replaceAll("'", "''")}'";

String _jsonb(Map<String, String> m) =>
    m.isEmpty ? 'null' : "'${jsonEncode(m).replaceAll("'", "''")}'::jsonb";

String _num(num? v) => v == null ? 'null' : v.toString();

void main() {
  test('generate full plans seed SQL from the bundled catalogue', () {
    final plans = seedPlans;
    final buf = StringBuffer()
      ..writeln('-- ─────────────────────────────────────────────────────────────────────────────')
      ..writeln('-- Full plans seed — GENERATED from lib/data.dart seedPlans.')
      ..writeln('-- Regenerate with:  flutter test tool/gen_plans_seed.dart')
      ..writeln('-- Do not edit by hand; edit the catalogue and regenerate.')
      ..writeln('-- Plans: ${plans.length}')
      ..writeln('-- ─────────────────────────────────────────────────────────────────────────────')
      ..writeln()
      ..writeln('insert into public.plans')
      ..writeln('  (id, provider, category, price, price_exact, title, specs, kind, price_unit, fees, rating, review_count, is_featured)')
      ..writeln('values');

    for (var i = 0; i < plans.length; i++) {
      final p = plans[i];
      final row = '  ('
          '${_sql(p.id)}, '
          '${_sql(p.provider)}, '
          '${_sql(p.cat)}, '
          '${p.price}, '
          '${_num(p.priceExact)}, '
          '${_sql(p.plan)}, '
          '${_jsonb(p.specs)}, '
          '${_sql(p.kind)}, '
          '${_sql(p.unit)}, '
          '${_jsonb(p.fees)}, '
          '${p.rating}, '
          '${p.reviews}, '
          '${p.highlight}'
          ')';
      buf.write(row);
      buf.writeln(i == plans.length - 1 ? '' : ',');
    }

    buf
      ..writeln('on conflict (id) do update set')
      ..writeln('  provider      = excluded.provider,')
      ..writeln('  category      = excluded.category,')
      ..writeln('  price         = excluded.price,')
      ..writeln('  price_exact   = excluded.price_exact,')
      ..writeln('  title         = excluded.title,')
      ..writeln('  specs         = excluded.specs,')
      ..writeln('  kind          = excluded.kind,')
      ..writeln('  price_unit    = excluded.price_unit,')
      ..writeln('  fees          = excluded.fees,')
      ..writeln('  rating        = excluded.rating,')
      ..writeln('  review_count  = excluded.review_count,')
      ..writeln('  is_featured   = excluded.is_featured,')
      ..writeln('  updated_at    = now();');

    final out = File('supabase/migrations/20260617_plans_seed_full.sql');
    out.writeAsStringSync(buf.toString());

    // Sanity: every plan id is unique (a dup would silently collapse rows).
    final ids = plans.map((p) => p.id).toSet();
    expect(ids.length, plans.length, reason: 'duplicate plan id in the catalogue');
    expect(plans.length, greaterThan(50));
    // ignore: avoid_print
    print('Wrote ${out.path} with ${plans.length} plans.');
  });
}
