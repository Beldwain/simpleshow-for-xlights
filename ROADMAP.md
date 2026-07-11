# SimpleShow Roadmap

The initial build works end-to-end against current xLights builds (verified
July 2026). Remaining priorities, in order:

## 1. Deepen the choreography (v1 shipped 2026-07-06; layer stack 2026-07-06)

The choreography-first generator and the bed/moves/rhythm/accent layer stack
are live (see Shipped). Next layers on top:

- **Plan scoring / best-of-N:** `scorePlan` metrics (variety, coverage,
  section contrast) to auto-pick the best of N seeds; the seed UI already
  makes any candidate reproducible.
- **Singing tree:** props with a face definition that classify as something
  else (e.g. the Mega Tree with `faceInfo`) should be able to join the vocal
  cast *and* keep their choreography role, instead of being one or the other.
- **Group render modes:** effects on groups render through the group's
  default buffer style, which SimpleShow doesn't control; consider emitting
  buffer settings for directional effects on mixed groups (the pros lean on
  `B_CHOICE_BufferStyle=Horizontal Per Model/Strand` and
  `Overlay - Centered`).
- **Melody-follow layer:** a third musical layer that tracks the vocal /
  lead line rather than the beat grid.

## Smaller items

- Per-word boundary dragging — the step-5 lyric editor (shipped 2026-07-06)
  covers moving, nudging, and splitting whole lines, but individual word
  boundaries within a line still can't be dragged against the waveform.
- True vocal-band detection (isolate the vocal, not just onsets) for
  dictionary-grade line placement; onset snapping shipped 2026-07-05 gets
  most of the way for typical songs.
- Grow the phoneme exceptions dictionary as misfires are reported; consider
  an optional CMU-dictionary fetch for dictionary-exact breakdowns.
- Per-role palette overrides and a custom palette editor.
- Persist the whole session (layout roles, analysis, lyrics) to
  `localStorage` so a browser refresh doesn't start over.

## Reference material

`exampleFilesforDEVOnly-DoNotShare/` (local only — never share or commit its
contents) holds a real 109-model layout for classifier regression testing,
plus three folders of exceptional xLights light-to-music shows to study for
the choreography-first work — what makes a good show song, how pros use
negative space, ramps, and prop families.

## Shipped

- **2026-07-11 — Small-display release: Prop focus, face outlines, auto
  shaders** (user request: a 3-strings + 5-faces display sat mostly dark
  between lyric lines). Three pieces, all opt-in:
  (1) **Detection notice** — after layout import, fewer than 5 groups AND
  fewer than 20 non-Skip props shows an inline step-1 note offering
  direct-to-prop sync lights; Yes checks the new toggle and regenerates.
  (2) **Prop focus** (step-4 toggle) — families keep their structure but
  drop group elements, so `compileChoreo` stamps every member directly;
  the move table reweights toward chases/beat pulses, and with ≤2 families
  the degenerate ensemble moves swap out (focus→chase, call→pulse, weights
  merged). Idle gaps ≥3 s on RGB props auto-fill with **spin/pulse shaders**
  (`motion` tags on 11 of the 20 catalog shaders; `propShaderFor` +
  `propShaderPlacements` in simpleshow-screens.js) — the preview samples
  the real shader per node on any prop (memoized per frame), and
  `usedShaderFiles()` picks the .fs files up into the show bundle
  automatically. Single-color strings and screens are excluded.
  (3) **Face outlines join the show** (step-4 toggle, default off) —
  between a face's own sung lines its FaceOutline nodes run string effects
  (SingleStrand / Twinkle / Marquee / On fades, section-weighted, own RNG
  stream so the main show is seed-identical) with a 0.6 s pad so the face
  is always dark when it sings. Exported as `SubModelEffectLayer`s nested
  in the face's element — submodels matched by node range ⊆ FaceOutline
  (`outlineSubmodelsFor`; the real Boscoyo props match `@Bulb`+`@Socket`) —
  the exact structure the pro Christmas Can-Can sequence uses. The preview
  gets a gap mode: outline animates in palette color, mouth/eyes stay dark.
  Faces without qualifying submodels silently skip the feature.
  Also: the **Layers & moves card redesigned** — layering is now three
  stack tiles (you see the bed/move/sparkle bars you're choosing), the
  move vocabulary is lit bulb-chips, and the showstoppers are switch
  tiles; all element ids unchanged so tests and session restore are
  untouched. e2e now 234 asserts (+36) plus 14 real-layout.
  **Still needs a real-xLights check:** two `SubModelEffectLayer`s in one
  element importing cleanly, submodel effects blending over the dim face
  bed, and chase continuity across the @Bulb→@Socket node order.

- **2026-07-10 — Layer-order fix + metrics-free karaoke** (user-reported:
  karaoke invisible in xLights, mega tree "only 2 lines of lights").
  Verified in xLights source that it composites layers bottom-up and the
  **first `EffectLayer` is the TOP layer** — the opposite of the plan's
  0=bed convention — so exports wrote opaque beds/shaders on top of
  everything (karaoke text hidden entirely under the dimmed shader; moves
  hidden under beds). The exporter now writes each element's layers in
  reverse. Also from the source: xLights bitmap fonts are
  **variable-width** (per-glyph advance), so exact per-word X positions
  are impossible to compute externally — karaoke re-designed to be
  metrics-free: the full line rides the top half of the matrix (Text
  centers natively), the **current word pops big and centered in the
  bottom half** for exactly its sung span, the ball drops onto it via a
  vector move, and outline mode shadows both from the layer below; short
  matrices show word-pops only; over-wide lines still scroll. Dropped an
  invented font name (only names seen in real sequences remain). The
  mega-tree Tendril now renders 3 thick (it's inherently a 1-pixel trail —
  that was the "2 lines of lights"), and with the layer fix its color bed
  shows beneath again. 198 e2e asserts incl. layer-reversal and stacked-
  karaoke checks.

- **2026-07-10 — xsq database fix: shaders render, colors are colors**
  (user-reported from real xLights testing). The exporter wrote its
  settings/palette databases as lowercase `<colorpalettes>`/`<effectdb>`
  with `ref` attributes inside a `<databases>` wrapper — a structure
  xLights silently ignores, so **every effect rendered with default
  settings** (Shader effects had no file → blank screens) **and the
  default white palette** (the "everything is white" symptom). Now the
  export writes exactly what xLights itself writes: top-level
  `<ColorPalettes>`/`<EffectDB>`, entries indexed by position, palettes
  in the pro byte-format (8 buttons, then only the checked checkboxes),
  plus a `<version>` header. Confirmed against xLights master source that
  relative `Shaders/SimpleShow/…​.fs` paths resolve against the show
  folder (xLights even converts absolute paths to relative for
  portability). e2e now pins the section shapes (197 asserts).
  **Re-export any earlier sequence** — all previous exports carried the
  bug.

- **2026-07-09 — Show bundle download + whole-display canvas moments.**
  (1) Step 5's primary download is now a **show bundle zip** in proper
  show-folder layout: the `.xsq` at the root, `Shaders/SimpleShow/` with
  **only the shaders this sequence actually uses**, and a README with the
  three-step install (plain `.xsq` and setup-guide buttons remain).
  (2) **Whole-display moment** (step-4 toggle, on by default, deliberately
  rare — once per show in the last build, or the middle quiet when a song
  has no build): the entire display becomes one graphic — a calm shader,
  a slow 3-arm rotation, or a palette color fade — rendered house-wide via
  the all-display group with `B_CHOICE_BufferStyle=Per Preview`; every
  other placement in the window is cleared (clipped at the edges) except
  singing faces and configured screens. The preview samples one shared
  frame across every prop by world position, so the moment looks like the
  real thing. Skipped gracefully when the layout has no whole-display
  group. Verified: 194 e2e asserts (bundle contents = xsq + used shaders +
  README with valid CRCs, window cleared, toggle off removes it) + a
  real-layout screenshot of the whole house as one canvas.

- **2026-07-09 — Screens: 20 original shaders, on-screen karaoke, worldwide
  palettes & moods** (`simpleshow-screens.js`; the pre-release feature).
  (1) **Twenty original ISF shaders** (Aurora Veil, Ember Drift, Snowfall
  Depth, Fireworks Bloom, Candy Twist, Kaleido Bloom, Lava Lounge,
  Starfield Warp, Bokeh Lights, Ripple Pond, Rangoli Spin, Holi Splash,
  Witchlight Fog, Heart Pulse, Shamrock Spiral, Flag Wave, Tinsel Rain,
  Nebula Drift, Disco Prism, Geo Tunnel) — most take hue inputs that
  follow the selected palette, four keep signature colors; one GLSL body
  serves both the in-app WebGL preview and the downloadable **ISF pack**
  (client-built zip with real CRC32s; export references
  `Shaders/SimpleShow/<name>.fs` the way the pro shows use the Shader
  effect, with `SHADERXYZZY` sliders and per-section `Shader_Speed`).
  (2) **On-screen karaoke** — per screen: scrolling, highlighted words,
  highlighted + outline, or bouncing ball, exported as xLights Text
  effects on bitmap fonts whose fixed cell widths make per-word X
  positions exact; lines wider than the matrix auto-degrade to scrolling;
  "karaoke over shaders" layers the words above a dimmed shader.
  (3) **Step-4 Screens card** — per-screen mode + karaoke style, global
  shader multi-select, pack download; configured screens leave the
  generic choreography (same exclusion as singing faces). (4) **~25
  seasonal palettes** in grouped dropdowns (Christmas, US holidays,
  Diwali / Holi / Hanukkah / Eid / Lunar New Year / Bonfire Night /
  Mardi Gras / Cinco / Australia, plain seasons) and a separate **Mood**
  control (Gentle / Classic / Festive / Party) that biases the energy
  budget, hero rest cadence, and sparkle. Preview renders real shader
  frames (WebGL, sampled onto each matrix's nodes by position) and real
  karaoke frames. Verified: 141 features asserts incl. all-20-shader
  compile/render in headless WebGL, `unzip -t` CRC validation, karaoke
  offset math, mood A/B (party 446 rows vs gentle 324 at one seed);
  still to confirm in real xLights: bitmap-font metrics and shader-path
  pickup after unzipping the pack.

- **2026-07-09 — Synced lyric timing from the internet** (user request).
  Step 3 gained **"Find synced lyrics online"**: artist/title (prefilled
  from the audio filename) searched against the free **LRCLIB** database
  (lrclib.net — no key, CORS-open; exact match with duration first, fuzzy
  fallback; results flag duration matches). Picking a result fills the
  lyrics box and stores the human-synced `[mm:ss.xx]` line stamps; a
  timestamped **.lrc file** now keeps its stamps too instead of having them
  stripped (repeated karaoke lines become real lines). When stamps exist
  and the line count still matches, `buildLyrics` uses them as line starts
  — human sync beats the proportional layout and line-level onset snapping
  — while word boundaries inside lines still follow the vocal-band onsets.
  Word-level edits keep the sync; adding/removing lines falls back to
  automatic. The timing store persists per song (`autoshow.lrctimes.v1`),
  and the offset slider still shifts everything (for different edits of a
  track). Search is manual-only — the app never sends song metadata
  anywhere without a click.

- **2026-07-09 — Lip-sync accuracy & singing-face export fixes** (user bug
  batch). (1) **Word-level onset alignment** — a vocal-leaning onset
  envelope (mid-band rises only, so kicks and hi-hats don't attract word
  boundaries) pulls every interior word boundary to the nearest sung
  syllable instead of a proportional grid; synthetic regression: 20/20 top
  envelope peaks land on syllables where the full-mix envelope manages 3/20
  against drums. (2) **Faces effects now match the pro sequences
  byte-for-byte** — the model's own face definition is exported (node-range
  faces like Boscoyo ChromaBulbs rendered nothing without it), the invalid
  `Phoneme=(off)` key is gone, 0.5 s fades added, and the palette carries
  three checked colors so xLights has face-part colors to assign.
  (3) **Node-range faces render as the real prop** — in the main preview
  they light **in place on the prop's own pixels** (outline in the singer's
  color, blinking eyes, the current viseme's mouth; idle faces sit dim with
  a rest mouth) with no overlay box covering the display, and in the step-5
  faces strip as fitted portraits; character-art faces now scale to the
  prop's real on-canvas footprint instead of a fixed box. The drawn cartoon
  remains only for matrix faces without art. Verified: 156 e2e assertions
  plus a real-layout headless run (`.e2e/driver-real.js`, 13 asserts)
  proving all four Face Bulbs classify, sing, export the Boscoyo
  definition, and light in place in the preview (screenshot-checked).
  Still open from this batch: per-word boundary dragging in the editor,
  and confirming colors / timing-track binding by opening an export in
  real xLights.

- **2026-07-07 — Polish pass.** The glow pass hugs each prop's real extent
  as an **ellipse** instead of a circle (forests skip glow entirely — they
  read better as bare spikes); **Alt+wheel vertical stretch** on the house
  canvas lets flat forests grow readable spikes (wheel = resize, Shift+wheel
  = rotate, all persisted); **rest schedules** keep even the hero honest —
  the anchor tree sits out one phrase in three during verses, and forests
  are featured only in quiets and alternate choruses (seasoning, not a main
  course); **wall washers never chase or beat** — they always render as
  long flood swells (`mvFlood`); and the header gained a **text sizer**
  with five sizes XXS–XXL for tired eyes (Normal sits ~6% above the old
  base). Verified e2e headless — the suite now runs 134 assertions.

- **2026-07-07 — Realism batch** (from studying the pro sequences). Four
  changes: (1) **Ellis dynamic-programming beat tracking** (Ellis 2007, the
  same family QM Vamp uses — the plugin itself can't run in-browser)
  replaces the fixed tempo grid: ~11 ms beat error on real songs vs ~240 ms
  of grid drift, so pulses land on the actual beat all song long.
  (2) **Mega-tree hero rotation** — verses trade Spirals with Tendrils, and
  choruses rotate a six-feature program: Butterfly, center Curtain,
  fast Spirals, circling Tendril, bottom-up Curtain wipe, Pinwheel.
  (3) **Cross-prop beat chases** — mini trees and candy canes chase the
  beat across sibling props instead of all pulsing together. (4) **Forest
  Wave undulation** — a "chase" on a forest renders as a traveling sine
  wave, used sparingly because waves read best when rare.

- **2026-07-07 — User-requested batch (7 items).** (1) Arches models that
  store counts as `NumArches`/`NodesPerArch` now report node counts and
  render per-arch spans correctly. (2) **Lyric file import** — drop a
  `.txt` or `.lrc` onto the step-3 lyrics box; karaoke `.lrc` files are
  cleaned to plain lines. (3) **Flood glow pools** — floods and wall
  washers render as soft pools of light at each head, not outlines.
  (4) **xLights-style title** — the header logotype glows in the xLights
  RGB letter colors. (5) **Forest up-spikes** — forests draw as vertical
  spike columns in the house preview. (6) **Wheel scale / Shift+wheel
  rotate** on hovered props in the house canvas (persisted per model).
  (7) **Spinners map to Pinwheel**, and **.zip face packs** — drop a zip
  of mouth-shape PNGs (`Name_AI_eo.png`, …) per character; an eyes-closed
  rest frame adds idle **blinking**, phase-offset per face so the cast
  never blinks in unison.

- **2026-07-06 — xLights-style rendering, color capability, drag & layers**
  (`simpleshow-render.js` + step-4/5 UI). Five changes from user feedback:
  (1) **Real model geometry** — every prop renders as its actual light
  nodes (custom-model pixel grids, Poly Line point data, arches/icicles/
  line spans, tree cones, star rings, matrix grids) with per-node effect
  animation (chases travel along the prop's own pixels), radial glow, and
  hover-only labels — the crowded always-on names are gone and the preview
  reads like the xLights house view. (2) **String-type color capability** —
  StringType parses to RGB / RGBW / single color (+ its color), a step-1
  Lights column overrides it (persisted), single-color props export
  one-color palettes and preview in their own color only. (3) **Drag props**
  on the step-1 house canvas to reposition (persisted per model name, layout
  file untouched). (4) **Layer stack & show options** — layered mode puts a
  dim color bed under every active family's moves (Max blending, exported in
  the settings), rich adds sparkle; step-4 checkboxes prune the move
  vocabulary and gate unison hits. (5) **Fix-the-Lyrics faces preview** —
  see the next entry's editor: a dedicated singing-faces-only canvas with
  per-face **character image sets** (xLights matrix-face PNGs, dropped per
  face, persisted, used in the main preview too) and per-line
  contract/expand timing buttons. Verified e2e headless (85 assertions
  across 3 drivers) + visual checks against the real 109-model layout.

- **2026-07-06 — Lyric review & editing** (`simpleshow-lyric-editor.js`).
  Step 5 gained a **Fix the Lyrics** timeline: click a line to select it and
  jump the player there, drag it to move it, nudge ±50/±250 ms, snap its
  start to the playhead, split it apart at any word, reassign which face
  sings it, and pick its color (faces are stably color-coded; a custom line
  color carries into the exported Faces palette). Edits live in a per-song
  "lyric doc" that replaces the automatic layout in `buildLyrics`, persists
  in `localStorage` (keyed by audio name + duration, valid while the step-3
  lyric text is unchanged), and survives regenerating with any seed — every
  edit re-runs generation with the *same* seed so the plan follows. A reset
  button returns to automatic timing. Verified end-to-end headless (27
  assertions: move/split/recast/recolor, persistence roundtrip, stale-doc
  fallbacks, well-formed xsq with edits).

- **2026-07-06 — Choreography-first generation** (`simpleshow-choreo.js`).
  Rebuilt generation the way the three pro sequences work (measured):
  **model groups are first-class targets** — nested group members expand,
  role-homogeneous prop-type groups ("Arches", "Mini Trees", "Peace Forest")
  become choreography families with exclusive member ownership (the
  double-lighting defense), whole-display groups ("All") carry unison hits,
  and leftover models fall back to role families. A **seeded choreographer**
  picks display-level moves per section — hold, pulse trains, chases,
  spatial sweeps by WorldPosX, call-and-response, focus rotation — under an
  **energy budget** (quiet 1–2 families → chorus most-but-focused), so
  negative space is generated, not manually thinned. Moves compile into the
  existing plan format; the exporter emits group elements natively. The
  step-4 seed box + "🎲 New show" button make every show reproducible and
  re-rollable. Real-layout numbers: 6/11/15 elements active in
  quiet/verse/chorus of 114 — right in the measured pro band (8–22).

- **2026-07-06 — Per-voice timing tracks.** The export now carries one
  "Voice - <lead>" track per lead singer (three layers each) plus the merged
  Lyrics track; every Faces effect binds to its singer's track — the exact
  structure the pro sequences use. Round-robin mode stays on the single
  Lyrics track.

- **2026-07-06 — Session persistence + preview nudge.** Lyrics, toggles,
  style, intensity, offset, and seed persist in `localStorage` and restore
  on reload (audio can't — a note says to re-drop the song). The lyric
  timing offset slider is mirrored on step 5 and regenerates the plan with
  the same seed, so nudging while watching the preview is what gets
  exported. Also: newer xLights models (`NumStrings`/`NodesPerString`
  instead of `parm1/parm2`) now report node counts correctly — this was
  misclassifying a 992-node singing mega tree as a face.

- **2026-07-05 — Lyric alignment overhaul.** Lines now live in singable
  windows (non-quiet sections only — instrumental intros/outros/breaks get
  no lyrics), each line start snaps to the strongest musical onset nearby
  instead of a proportional grid (the "dubbed movie" fix), and step 3 gained
  an onset-snap toggle plus a ±2 s timing-offset slider that shifts every
  line/word/phoneme.

- **2026-07-05 — Plan-driven live preview + desktop scaling.** The step-5
  preview renders the actual generated plan (per-effect animation styles,
  accent flashes, dark-when-idle), singing faces animate Preston Blair
  mouth shapes, the current line plays karaoke-style with the active word
  highlighted, and a section-colored scrub bar supports click/drag seeking.
  Layout is desktop-first: 1720 px max width, window-sized canvases, scaled
  glyphs, hover tooltips on the house preview.

- **2026-07-05 — Score-based prop identification** (`simpleshow-classify.js`).
  Every signal votes with a weight — DisplayAs type (canonical xLights
  types), name keywords, `faceInfo` + mouth/eyes submodels, model-group
  membership, node count, roofline position — and the winning margin sets a
  confidence flag (`high`/`medium`/`low`) shown per row in step 1, so users
  review exactly the flagged models. Corrections persist in `localStorage`
  keyed by model name and re-apply on the next load of the same layout
  (with a "forget saved corrections" escape hatch). Tuned against a real
  109-model layout: negated group names ("All No Matrix") don't hint, DMX
  fixtures/channels and null-pixel models classify as Skip.

- **2026-07-05 — Forest and Special/Accent roles.** Ground forests (grids of
  5–15-pixel vertical spikes — great 3D depth) get their own role, recipes
  built on upward motion (Meteors Up, Fire), and a house-preview glyph; the
  name "forest" outweighs the DisplayAs type since forests are often modeled
  as Icicles grids. Special/Accent covers yard art (deer, sleighs, peacocks,
  angels…) that a show holds back for the big moments: dark through quiet
  and verse, ramping On through builds, shimmering through choruses.

- **2026-07-05 — Vocal arrangements** (`simpleshow-vocals.js`). Replaced
  round-robin lyric casting with real staging: one solo lead (or two duet
  leads trading lines) carries the verses and all faces join as backup on
  chorus sections (toggleable). Lead choice and mode persist in
  `localStorage`. Round robin remains as an explicit option.

- **2026-07-05 — Silence-aware audio analysis.** The analyzer now computes a
  music extent (smoothed-energy threshold at 4% of the 95th-percentile
  level) and trims leading/trailing silence out of everything downstream:
  section percentiles are computed over in-music bars only (silent padding
  no longer drags the quiet/verse/build/chorus thresholds down), bass hits
  are clamped to the extent, and the lyric span never stretches over dead
  air even with "skip intro/outro" unchecked. The waveform view dims the
  trimmed regions and reports the music span.

- **2026-07-05 — Automated phoneme breakdown.** In-browser grapheme→viseme
  engine (`wordVisemes`: exceptions dictionary + stem/suffix lookup +
  ordered letter rules) targeting the Preston Blair mouth shapes. The export
  now carries a single three-layer **Lyrics** timing track
  (phrases / words / phonemes) — the structure xLights' own breakdown
  produces — with Faces effects bound to it, so faces sing on open with no
  manual step. Word slots and phoneme durations are weighted by phoneme
  count (vowels 2×). English-only; xLights' dictionary breakdown remains the
  documented fallback and cleanly replaces the phoneme layer.
