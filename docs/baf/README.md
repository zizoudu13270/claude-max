# Better Animation & Feature — developer notes

LBR Studio. Source for the add-on built as
`dist/Better_Animation_Feature_Clean.mcaddon`.

This add-on has its own toolchain. `addons.json` marks it `"pipeline": "baf"`,
which keeps `tools/build.py`, `tools/validate.py` and `tools/test_scripts.mjs`
(the shared Pack Survie Ultime / Survival Core toolchain) out of it.

## Layout

```
packs/BetterAnimationFeature_BP/     blocks, features, feature_rules,
                                     loot_tables, scripts, texts
packs/BetterAnimationFeature_RP/     animations, animation_controllers,
                                     entity, models, render_controllers,
                                     materials, textures/lbr_baf, texts
tools/baf/                           the toolchain
docs/baf/                            audit, rename map, provenance
```

## Commands

| command | does |
|---------|------|
| `python3 tools/baf/audit.py` | inventory both packs and scan for legacy namespaces |
| `python3 tools/baf/build_rename_map.py` | regenerate `docs/baf/RENAME_MAP.json` |
| `python3 tools/baf/apply_rename.py` | apply that map to both packs, in place |
| `python3 tools/baf/make_docs.py` | regenerate the generated documents |
| `python3 tools/baf/validate_baf.py` | walk the whole reference graph and fail on anything broken |
| `python3 tools/baf/signature.py <animation file> --out <json>` | fingerprint every animation payload |
| `python3 tools/baf/verify_roundtrip.py <1.0.2 extraction>` | prove the refactor renamed and nothing else |
| `python3 tools/baf/remove_block.py <id> [--dry-run]` | delete a block and the full closure of what only served it |
| `python3 tools/baf/build_baf.py [--original <dir>]` | validate, then package to `dist/` |

`build_baf.py` refuses to package unless `validate_baf.py` passes.

## Naming rules

| thing | shape | example |
|-------|-------|---------|
| blocks, features, rules, block states, item tags | `lbr:` | `lbr:rock_coal` |
| animations | `animation.lbr_baf.player.*` | `animation.lbr_baf.player.walk` |
| animation controllers | `controller.animation.lbr_baf.player.*` | `…player.jump` |
| render controllers | `controller.render.lbr_baf.player.*` | `…player.main` |
| geometry | `geometry.lbr_baf.*` | `geometry.lbr_baf.player.main` |
| materials | `lbr_baf_player_*` | `lbr_baf_player_overlay` |
| client-entity aliases | `lbr_*` | `lbr_walk` |
| controller states | bare word, no prefix | `jump`, `state_005`, `step_01` |
| Molang variables | `v.lbr_baf_*` | `v.lbr_baf_player_animations` |
| textures | `textures/lbr_baf/{player,blocks,environment}/` | `…/player/boat_arms_01.png` |

An animation only gets a descriptive name when the evidence supports one.
Where it does not, the identifier stays `state_NNN` — see `PROJECT_AUDIT.md` §4.

## Documents

| file | contents |
|------|----------|
| `AUTHORSHIP.md` | what the project is made of, system by system |
| `THIRD_PARTY_REVIEW.md` | **material that does not appear to originate with LBR Studio — read before publishing** |
| `PROJECT_AUDIT.md` | what was analysed, changed, kept, and left unresolved |
| `ANIMATION_INDEX.md` | one row per animation, with its probable function and how that was reached |
| `RESOURCE_USAGE.md` | USED / UNRESOLVED / UNUSED_CONFIRMED per asset |
| `RENAME_MAP.json` | every old → new identifier |
| `FILE_MOVES.json` | every file that moved |
| `REMOVED.json` | content deleted on request, with its full reference closure |
