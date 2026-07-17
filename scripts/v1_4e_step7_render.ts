// V1-4e STEP 7 — render V1-A1-4 explanations for real live profiles.
import { Client } from 'pg';
import { writeFileSync } from 'node:fs';
import { renderFullExplanation, renderCompactExplanation } from '../src/explanation/index.js';
import type { EvidenceProfileOutput } from '../src/evidence/types.js';

const c = new Client({ connectionString: process.env['SLIPLABZ_HOSTED_DATABASE_URL']! });
await c.connect();
try {
  // Pull real profiles: 3 spanning different scenarios (all Unavailable in this
  // ticket's run, but different players / games / markets).
  const q = await c.query(`
    SELECT ep.evidence_profile_id::text AS id,
           ep.classification, ep.direction,
           ep.evaluated_line, ep.composite_score,
           ep.quality_capped, ep.quality_cap_reason,
           ep.includes_backfilled_historical,
           ep.method_version,
           ep.evaluated_source_kind, ep.evaluated_source_identifier,
           ep.c_rtp, ep.c_ms, ep.c_wa, ep.c_ma,
           p.display_name AS player, ep.market_key,
           g.scheduled_start_utc, g.status AS game_status,
           t_a.display_name AS away, t_h.display_name AS home
      FROM evidence_profiles ep
      JOIN players p ON p.internal_player_id = ep.internal_player_id
      JOIN games g ON g.internal_game_id = ep.internal_game_id
      JOIN teams t_h ON t_h.internal_team_id = g.home_team_id
      JOIN teams t_a ON t_a.internal_team_id = g.away_team_id
     ORDER BY ep.created_at ASC LIMIT 3`);

  const renders: any[] = [];
  for (const p of q.rows) {
    const reasons_res = await c.query(
      `SELECT reason_code, category, intra_category_rank, contribution_magnitude
         FROM evidence_profile_reasons
        WHERE evidence_profile_id = $1::uuid
        ORDER BY category, intra_category_rank`,
      [p.id]
    );
    const profile: EvidenceProfileOutput = {
      classification: p.classification,
      direction: p.direction,
      components: {
        c_rtp: Number(p.c_rtp ?? 0),
        c_ms: Number(p.c_ms ?? 0),
        c_wa: Number(p.c_wa ?? 0),
        c_ma: Number(p.c_ma ?? 0),
        composite_score: p.composite_score !== null ? Number(p.composite_score) : null,
        direction: p.direction,
        c_rtp_non_l5_magnitude: null,
        longer_window_choice: null,
      } as any,
      quality_capped: p.quality_capped,
      quality_cap_reason: p.quality_cap_reason ?? 'none',
      includes_backfilled_historical: p.includes_backfilled_historical,
      evaluated_line: p.evaluated_line !== null ? Number(p.evaluated_line) : null,
      evaluated_source_kind: p.evaluated_source_kind,
      evaluated_source_identifier: p.evaluated_source_identifier,
      reasons: reasons_res.rows.map((r) => ({
        reason_code: r.reason_code, category: r.category,
        intra_category_rank: r.intra_category_rank,
        contribution_magnitude: r.contribution_magnitude !== null ? Number(r.contribution_magnitude) : null,
      })) as any,
      method_version: 'evidence_method_v1',
    };

    const full = renderFullExplanation(profile, { render_numeric_score: false });
    const compact = renderCompactExplanation(profile);

    renders.push({
      evidence_profile_id: p.id,
      player: p.player,
      market: p.market_key,
      matchup: `${p.away} @ ${p.home}`,
      commence: p.scheduled_start_utc,
      game_status: p.game_status,
      evaluated_line: profile.evaluated_line,
      composite_score: profile.components.composite_score,
      classification: profile.classification,
      full: {
        classification_label: full.classification_label,
        direction: full.direction,
        prose_paragraphs: full.prose_paragraphs,
        reasons: full.reasons.map((r) => ({ code: r.reason_code, category: r.category, text: r.text })),
        binding_cap: full.binding_cap,
        provenance_marker: full.provenance_marker,
        disclosure_g1: full.disclosure_g1.text,
        disclosure_g2: full.disclosure_g2?.text ?? null,
      },
      compact: {
        compact_label: compact.compact_label,
        compact_display_line: compact.compact_display_line,
        binding_cap: compact.binding_cap,
        provenance_marker: compact.provenance_marker,
        disclosure_g1: compact.disclosure_g1.text,
        must_never_expose_numeric_score: compact.must_never_expose_numeric_score,
      },
    });
  }
  console.log(JSON.stringify(renders, null, 2));
  writeFileSync('/tmp/v14d/step7_renders.json', JSON.stringify(renders, null, 2));
} finally { await c.end(); }
