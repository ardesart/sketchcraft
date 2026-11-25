# minimodel spike

Can a small local model (offline, no accounts, no API keys, no cloud) turn plain English into SketchCraft
commands? This folder measures it. Results and the plan: [docs/dev/minimodel-spike.md](../../docs/dev/minimodel-spike.md).

Nothing here ships in the app. It needs Node 20+, a built `sketchcraft` binary and (for real models) Ollama.

## What is here

| Path | What |
| --- | --- |
| `eval/new_cases.jsonl`, `eval/build_new_cases.mjs` | the v4 new-features set (52 cases: Room mode, picture materials, projection, Position Texture, vertex paint, UV, lightmap UV, texture painting); `--set new`; its own category so core and plan numbers stay comparable |
| `eval/v5_cases.jsonl`, `eval/build_v5_cases.mjs` | the v5 Model-tab + UV/texture set (61 cases: arcs and pies, Follow Me, text, guides, axes, resize, soften, divide, weld, explode curve, bevel, reverse, explode, ungroup, intersect, solid tools, slice, flip, subdivide, materials, tile size, texture pixels, UV and texture-painting chains); `--set v5` |
| `gen/templates_v5.mjs`, `mix.mjs` | v5 training templates; `mix.mjs` joins chat files and re-applies today's held-out rules to older data |
| `lib/probe.mjs` | result probes: a check may run read-only commands (`rooms`, `uv_info`, `vertex_colors`, `texture_frame`, `texture_pixels`) after the answer and test their replies |
| `eval/cases.jsonl` | 201 requests: easy / medium / hard, 45 of them also tagged `"cat":"a11y"` (see below) |
| `eval/fixtures/*.jsonl` | starting models (a house group, a room, two cubes...). A case with `"fixture"` runs it first; its `# ...` header line is what the model is told about the model state |
| `eval/build_cases.mjs` | the single source: `node eval/build_cases.mjs` regenerates `cases.jsonl`, `fixtures/` and `fixtures.json` |
| `lib/check.mjs` | the result checks (bounding box, sizes, group/instance counts, faces, paint colors, tags, replies) |
| `lib/engine.mjs` | drives the real engine as an AI agent does: `sketchcraft mcp` (the untrusted allowlist), scratch `SKETCHCRAFT_DOC` and `HOME` per request |
| `lib/spec.mjs` | the command table the model may use (35 of ~170 commands): generates the prompt reference AND the JSON schema given to Ollama |
| `run_eval.mjs` | the harness |
| `validate_eval.mjs` | runs every case's reference solution through its own check: proves the checks are satisfiable and not too loose |
| `report.mjs` | `results/*.json` to markdown tables / failure examples |
| `run_all.sh` | one model at a time: pull, run three configurations, `ollama rm` |
| `results/` | raw per-request results from the runs in the doc |
| `gen_data.mjs`, `gen/templates.mjs` | Phase 2 training-data generator: (state, request -> command list) pairs, each verified in the engine (see below) |
| `lib/heldout.mjs` | the rules that keep training data apart from the eval set |
| `data/sample.jsonl` | a small sample of generated pairs (one or two per template); full runs go to a scratch folder, not the repo |

## Run it

```sh
cargo build --release -p sketchcraft-core            # the engine; or point SKETCHCRAFT_BIN at an existing sketchcraft binary
export SKETCHCRAFT_BIN=target/release/sketchcraft
node tools/minimodel/validate_eval.mjs               # 201/201 gold solutions pass their checks
node tools/minimodel/run_eval.mjs --check-spec       # the command table still matches command.rs and the agent allowlist
node tools/minimodel/run_eval.mjs --model gold       # control: 100%
node tools/minimodel/run_eval.mjs --model noop       # control: a do-nothing answer (`info`) scores about 6%

ollama pull qwen2.5-coder:1.5b
node tools/minimodel/run_eval.mjs --model qwen2.5-coder:1.5b                    # schema-constrained (Ollama `format`)
node tools/minimodel/run_eval.mjs --model qwen2.5-coder:1.5b --mode free        # no grammar: parse whatever it writes
node tools/minimodel/run_eval.mjs --model qwen2.5-coder:1.5b --shots 3          # + 3 worked examples in the prompt
node tools/minimodel/report.mjs                                                 # tables
```

Useful flags: `--limit N` (an evenly spread subset), `--cat a11y`, `--ids e001,m010`, `--tag name`.
Env: `SKETCHCRAFT_BIN` (engine), `OLLAMA_HOST`, `MINIMODEL_SCRATCH` (where scratch folders go; default the OS temp dir; each
request's folder is deleted afterwards).

The harness waits while the Mac has under 30% memory free (`memory_pressure`), because small models and a build in
parallel do not fit in 8 GB; `--no-memory-guard` turns that off.

## How grading works

Each request is graded on the RESULT. The harness starts a fresh engine (scratch folder), runs the fixture, runs the model's
commands through the agent allowlist, then asks the engine for `info`, `parts` and `faces` and applies the case's `check`:
bounding box and sizes within a tolerance, group and instance counts, a face of a given area/normal/place, faces painted a
color class (red, blue...), tags, or a number in a reply (`volume`, `length`). Any correct command sequence passes; the gold
commands in `cases.jsonl` are only there to prove the check can be satisfied.

Questions ("how big is the room?") use `"check":{"readonly":true}`: pass = the model ran an inspect command (`info`, `parts`,
`faces`, `volume`, `pick`) and the model state is exactly as before.

Known limits of the checks: the position of an inserted door/window is not visible in `info`/`parts`, so those cases
check that it exists, not where (cases that need position use a group-built door or a cut-out opening instead); and a check
cannot tell that a model "meant" something, only that the result has the right numbers.

## The accessibility category (`"cat":"a11y"`)

45 requests written for people who dictate, type or use a switch/eye-tracker instead of pointing, and for screen-reader users:
precise numbers ("a wall 4.2 m long, 2.4 m high, 20 cm thick starting at the origin"), relative requests ("a window 1 m from the
left end of the north wall, 1.2 m wide"), edit-by-sentence follow-ups ("make it 5 meters instead", "move the door 1 m left",
"undo that") and read-only questions ("how big is the room?", "what's on the south wall?"). They are also graded
easy/medium/hard and counted in the tier totals; `run_eval` reports them separately too.

## Training data (Phase 2)

```sh
node tools/minimodel/gen_data.mjs --n 5000 --seed 1 --out /private/tmp/claude-501/minimodel-data/v1 --sample tools/minimodel/data/sample.jsonl
node tools/minimodel/gen_data.mjs --check /private/tmp/claude-501/minimodel-data/v1/train.jsonl    # held-out rules, exit 1 on any hit
```

Each pair is kept only if: every command is in the `lib/spec.mjs` table; a fresh `sketchcraft mcp` (agent policy, scratch
folder) runs the starting model and then the answer inside `begin_batch`/`end_batch` and accepts every command; the result
passes a check computed from the request's numbers (inserted assets are checked by position from the bounds; questions
must be read-only and change nothing); one `undo` restores the model exactly; and `lib/heldout.mjs` finds no collision with
the eval set. Failures are dropped and counted in `report.json` / `failures.txt`, never fixed by hand. `--strict` also
drops pairs whose wording is close to an eval request (word cosine >= 0.6). The eval set is never used as training data.
Each row: `{id, template, tier, cat, fixture_kind, state, setup, request, commands, check, sim, sim_eval}`; `check.inst_at`
is a generator-only check (not a `lib/check.mjs` key).

## Training data (v3: targeted at the v2 failures)

v2 scored 87.6% on the core eval and 96.4% on the plan eval. v3 adds pairs for the failure families (written from the eval
CHECKS' conventions, never from the eval sentences; `lib/heldout.mjs` still gates every pair):

```sh
node tools/minimodel/gen_data.mjs --templates v3 --n 3000 --seed 301 --out DIR/route1      # gen/templates_v3.mjs
node tools/minimodel/gen_plans.mjs --notch --n 1000 --seed 33 --out DIR/plans               # route 2: notch / carved-corner plans
```

Families (`family` field on each row): f1 spacing words ("N between them" / "gap of N" = the gap; "N apart" / "every N" /
"N to the east" = origin-to-origin; "array X n times" = n copies in total), f2 "a box ... at x X, y Y" = min corner (and
"centered at" = center), f3 polygons / circles / vertical faces / tables / stacked slabs / L-shaped rooms, f4 roofs
(`roof {face: @top-face, kind, pitch}`; roofs after a scale; painting roof vs walls), f5 openings (windows cut in a wall at a
position from either end, facade windows, hollow open-top boxes, rooms sharing walls, door + windows + slab), f6 edits
(relative resize, mirror = a copy offset because `mirror` is not in the agent allowlist, tower against the house, wall
questions that use `parts`/`faces`, never a made-up name), f7 plans (`--notch`: a tall garage/living room with a stack of small
rooms beside it, or a large room that is L-shaped because a small room is carved from its corner; polygon rooms; ft and m).
`data/sample_v3.jsonl` has two pairs per template.

## Training data (v4: the 0.3.9 commands)

v3 never saw Room mode, wall pull, picture materials, projection, Position Texture, vertex paint, UV, lightmap UVs or
texture painting. `gen/templates_v4.mjs` adds them (families r1 rooms, t1 materials/projection/position, t2 vertex paint,
t3 UV, t4 texture painting, x1 combos); the command table in `lib/spec.mjs` grew from 37 to 58 commands. The model still
only names materials that are already in the state (it never writes image data). Pairs are verified exactly like v3, plus
`probes` (lib/probe.mjs) for state `info`/`parts`/`faces` cannot show.

```sh
node tools/minimodel/gen_data.mjs --templates v4 --n 10500 --seed 401 --jobs 8 --out DIR/new     # gen/templates_v4.mjs
node tools/minimodel/eval/build_new_cases.mjs --validate                                          # the new-features eval set
node tools/minimodel/run_eval.mjs --model MODEL --mode free --prompt short --set new              # score it
```

The v4 training mix is all of the v3 mix plus the new pairs (same short prompt). `train/train_v4.py` and `train/launch_v4.py` are
the pc-11 scripts (v3 recipe; a deadline callback stops at 07:15 so the merge always happens).

## Training data (v5: the whole Model tab, deeper UV and texturing)

v4 knew 58 commands. v5 adds the 23 Model-tab and material commands that are in the agent allowlist and were not taught (81 in
`lib/spec.mjs`): `arc` (Arc, 2-point, 3-point and Pie: a pie is an arc then a `line` back through the centre), `follow_me`,
`text`, `guide` and `clear_guides` (Tape Measure, Protractor), `set_axes` (Axes), `resize` (Tape Measure resize), `soften`
(Eraser with Ctrl), `divide`, `weld`, `explode_curve`, `bevel`, `reverse`, `explode`, `ungroup`, `intersect`, `solid`, `slice`,
`flip`, `subdivide`, `material`, `texture` (a picture material's tile size, never image data) and `texture_pixels`. Every other
Model-tab tool was already covered (Line and Freehand by `line`, Rectangle, Rotated Rectangle, Circle and Polygon by `rect`,
`polygon`, `circle`; Push/Pull, Offset, Move, Rotate, Scale, Dimension, Paint Bucket, Vertex Paint, Texture Paint, Eraser by
`delete`). Left out on purpose: `text_3d` (it takes font outlines the app traces, the model cannot write them), `uv_set` (its map
is keyed by numeric face ids, and the model only knows `@names`), `push_pull` (an alias of `pushpull`).

`gen/templates_v5.mjs` families: m1 arcs, m2 Follow Me, m3 text / guides / axes / resize, m4 edge tools, m5 groups and solids,
m6 materials, u1 UV and texture-painting chains (seams then unwrap, unwrap then pack or lightmap, UV scale / rotate / mirror,
projection on several faces, Position Texture on the side and top, paint texture + fill, UV-space strokes, soft strokes,
erase), x2 combos. State the face lists cannot show (guides, texts, axes, soft edges, curves, material settings) is checked by
`doc` probes that read the saved document, and the one-undo rule now also compares that document state.

```sh
node tools/minimodel/eval/build_v5_cases.mjs --validate                                       # 61/61 gold, no-op 0 (of the non-questions)
node tools/minimodel/gen_data.mjs --templates v5 --n 10000 --seed 501 --jobs 8 --out DIR/v5/new --sample tools/minimodel/data/sample_v5.jsonl
node tools/minimodel/to_chat.mjs DIR/v5/new/train.jsonl DIR/v5/new/train.chat.jsonl          # and dev
node tools/minimodel/mix.mjs --out DIR/v5/data/train.chat.jsonl DIR/v4/data/train.chat.jsonl DIR/v5/new/train.chat.jsonl
node tools/minimodel/mix.mjs --out DIR/v5/data/dev.chat.jsonl DIR/v4/data/dev.chat.jsonl DIR/v5/new/dev.chat.jsonl
node tools/minimodel/run_eval.mjs --model MODEL --mode free --prompt short --set v5          # score it
```

The v5 mix is the v4 mix (v3 + v4 pairs) re-checked by `mix.mjs` against the v5 eval set, plus the v5 pairs; same short prompt.
`train/train_v5.py` and `train/launch_v5.py` are the pc-11 scripts (v4 recipe, `out5/`, resumes from checkpoints; the deadline
is a safety net on Nov 27). `data/sample_v5.jsonl` has two pairs per template.
