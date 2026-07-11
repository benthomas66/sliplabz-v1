# V1-1 Test Fixture Provenance Manifest

**Ticket:** V1-1 — Canonical Identities and Mapping
**Applies to:** every fixture file in this directory.

Each fixture file carries a top-level `"provenance"` object with the shape:

```json
{
  "provenance": {
    "kind": "audit_derived" | "synthetic" | "mixed",
    "authority_sources": [ "…" ],
    "notes": "…"
  },
  "records": [ … ]
}
```

Provenance categories used in V1-1:

- **`audit_derived`** — every record's identifying fields are traceable to
  an audit table in the shipped sub-specs (BDL §6.2, §12A, §12B; Odds §5,
  §10, §11, §12, §13.2). Internal IDs remain synthetic because internal
  IDs did not exist at audit time; these are marked with an `_internal_id`
  suffix and are deterministic UUIDs generated for this fixture set.
- **`synthetic`** — the fixture is a hand-crafted contract example not
  derivable from the audits (edge cases: ambiguous names, alias conflicts,
  reversed home/away pairs). Every synthetic record has `"synthetic": true`
  at the record level.
- **`mixed`** — a mix; each record within carries a `synthetic` flag.

**Rules for fixtures in this directory:**

1. No provider payload may be represented as though it were captured from
   a live provider unless it appears verbatim in the sub-spec audit
   tables. Records the audits do not contain must be marked
   `"synthetic": true`.
2. Fixtures are inputs to unit and reconciliation tests only. They must
   never be treated as an ingestion feed.
3. Do not add records outside of what the tests in `tests/identity/`
   directly consume.

**Files in this directory:**

- `teams.json` — mixed. The 15 current + 2 historical + special/national
  + placeholder classifications are derived from BDL §12B.3. Individual
  provider strings (`raw_full_name`, `raw_abbreviation`) are taken from
  the audit table. Internal team UUIDs are synthetic-deterministic.
- `current-slate-events.json` — mixed. The 6 events on the 2026-07-10 WNBA
  slate come verbatim from Odds §5. Provider game IDs are the audited
  strings. Internal game UUIDs are synthetic-deterministic.
- `current-slate-players.json` — mixed. Named player rows (Gabby Williams,
  Kayla Thornton) are audit-attested; edge-case rows (ambiguous name pair,
  team-change scenario, alias-conflict scenario, unresolved-team scenario)
  are marked synthetic.
- `aliases.json` — synthetic. Reviewed aliases used by tests.
