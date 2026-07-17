// V1-4e STEP 7 — evidence profile survey after populate.
import { Client } from 'pg';
import { writeFileSync } from 'node:fs';

const c = new Client({ connectionString: process.env['SLIPLABZ_HOSTED_DATABASE_URL']! });
await c.connect();
try {
  // Distribution across all seven classifications.
  const dist = await c.query(`
    SELECT classification, count(*)::int AS n FROM evidence_profiles GROUP BY classification ORDER BY classification`);
  console.log('classification distribution:', dist.rows);

  // Reason-code frequency.
  const reasons = await c.query(`
    SELECT reason_code, category, count(*)::int AS n
      FROM evidence_profile_reasons
     GROUP BY reason_code, category ORDER BY category, n DESC`);
  console.log('reason-code frequency:', reasons.rows);

  // Any abnormal_dispersion? (must be zero — RESERVED).
  const ad = await c.query(`SELECT count(*)::int AS n FROM evidence_profile_reasons WHERE reason_code='abnormal_dispersion'`);
  console.log('abnormal_dispersion count (must be 0):', ad.rows[0]);

  // Unavailable breakdown.
  const un = await c.query(`
    SELECT epr.reason_code, count(*)::int AS n
      FROM evidence_profiles ep
      JOIN evidence_profile_reasons epr ON epr.evidence_profile_id = ep.evidence_profile_id
     WHERE ep.classification = 'unavailable'
     GROUP BY epr.reason_code ORDER BY n DESC`);
  console.log('Unavailable by primary reason:', un.rows);

  // Strong count specifically.
  const st = await c.query(`SELECT count(*)::int AS n FROM evidence_profiles WHERE classification IN ('strong_over_evidence','strong_under_evidence')`);
  console.log('STRONG COUNT:', st.rows[0]);

  // First operative profile — the DR-29 record fields.
  const first = await c.query(`
    SELECT ep.evidence_profile_id::text, ep.created_at, ep.method_version,
           ep.classification, ep.direction, ep.evaluated_line,
           p.display_name AS player, ep.market_key,
           ep.internal_game_id::text AS internal_game_id,
           ep.internal_player_id::text
      FROM evidence_profiles ep
      JOIN players p ON p.internal_player_id = ep.internal_player_id
     ORDER BY ep.created_at ASC LIMIT 1`);
  console.log('FIRST OPERATIVE PROFILE:', first.rows[0]);
  writeFileSync('/tmp/v14d/step7_first_profile.json', JSON.stringify(first.rows[0], null, 2));

  // Grain-level: how many produced no profile? (Should be 0 — populator inserted 141 of 141.)
  const cmr_n = await c.query(`SELECT count(*)::int AS n FROM current_market_rows`);
  const ep_n = await c.query(`SELECT count(*)::int AS n FROM evidence_profiles`);
  console.log('current_market_rows:', cmr_n.rows[0], 'evidence_profiles:', ep_n.rows[0]);

  // Save top-3 classified (non-Unavailable) profiles for STEP-6-style rendering.
  const classified = await c.query(`
    SELECT ep.evidence_profile_id::text, ep.classification, ep.direction,
           ep.evaluated_line, ep.composite_score, ep.quality_capped,
           ep.quality_cap_reason, ep.includes_backfilled_historical,
           ep.method_version,
           p.display_name AS player, ep.market_key
      FROM evidence_profiles ep
      JOIN players p ON p.internal_player_id = ep.internal_player_id
     WHERE ep.classification <> 'unavailable'
     ORDER BY abs(ep.composite_score) DESC NULLS LAST
     LIMIT 5`);
  console.log('top-5 classified profiles:'); console.log(classified.rows);
  writeFileSync('/tmp/v14d/step7_classified_profiles.json', JSON.stringify(classified.rows, null, 2));

  // Also sample an Unavailable (for STEP 6-style render coverage).
  const unavail = await c.query(`
    SELECT ep.evidence_profile_id::text, ep.classification, ep.direction,
           ep.evaluated_line, ep.method_version, p.display_name AS player, ep.market_key
      FROM evidence_profiles ep
      JOIN players p ON p.internal_player_id = ep.internal_player_id
     WHERE ep.classification = 'unavailable' LIMIT 1`);
  console.log('sample unavailable:', unavail.rows[0]);
} finally { await c.end(); }
