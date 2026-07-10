# SimpleShow Architecture

The app is `simpleshow-xlights.html` — a five-panel wizard with a single global
state object and four script blocks — plus four supporting scripts loaded with
plain `<script src>` tags (they must ship in the same folder as the HTML):

- `simpleshow-classify.js` — score-based prop/role identification, confidence
  flags, and localStorage-persisted role corrections.
- `simpleshow-vocals.js` — vocal arrangement state (solo/duet/round-robin),
  the `castVocals()` casting algorithm, the step-3 arrangement controls, and
  `voiceTrackPlan()/voiceTrackFor()` (per-voice timing track naming).
- `simpleshow-choreo.js` — choreography-first generation: seeded PRNG,
  `buildFamilies()` (groups → families), the move vocabulary + layer stack
  (`ACCENT_LAYER`, `mvBed`, `fxSettings`), `choreograph()` +
  `compileChoreo()`, and session persistence.
- `simpleshow-render.js` — model geometry & xLights-style rendering:
  `parseModelGeometry()` (custom grids, point data, two-point spans),
  `modelNodeOffsets()` (per-node world offsets, cached), `drawHouse()`
  (node-level drawing with per-node effect animation), string-type color
  capability (`chanFromStringType`, `palForModel`, overrides), and prop
  dragging with persisted positions.
- `simpleshow-lyric-editor.js` — the step-5 lyric review & editing timeline:
  the editable "lyric doc" that replaces automatic layout, its per-song
  localStorage persistence, the canvas editor UI (see Stage 3b), the
  singing-faces preview, and character face-art image sets.

All are plain scripts sharing the page's global scope (no modules — ES
modules don't load over `file://`). This doc maps the code and records the
algorithms so future work (see [ROADMAP.md](ROADMAP.md)) doesn't have to
reverse-engineer them.

> **Naming note:** the app was renamed from AutoShow to SimpleShow
> (2026-07-07). localStorage keys deliberately keep their historical
> `autoshow.*` prefix — renaming them would silently wipe every user's saved
> role corrections, prop positions, sessions, lyric docs, and face art. The
> internal `AUTOSHOW_*` constant names match those keys.

## Global state

```js
const S = {
  models,    // [{name, displayAs, role, conf, why, x, y, w, h, parm1, parm2, stringType, hasFaceDef, submodels[],
             //   chan:'RGB'|'RGBW'|'single', fixedColor, customPts[[col,row]], pointData, x2, y2, scaleX, scaleY, …geometry}]
  groups,    // [{name, members[]}] — model groups, used as classification hints
  audio,     // {name, duration, sampleRate, mono: Float32Array}
  analysis,  // {bpm, beats[], downbeats[], sections[], energy, bass, mid, high, fps, hits[], dbPhase, musicStart, musicEnd}
  lyrics,    // {lines: [{text, start, end, words: [{text,start,end}], faces[]}], faces[]}
  vocal,     // {mode:'solo'|'duet'|'round', leads[], backup} — lazily seeded from localStorage by vocalState()
  lyricDoc,  // {songKey, raw, lines[]} — manual lyric edits (step-5 editor); null = automatic layout
  sequence,  // {plan: {elementName: [[layer, effectName, settings, palette[], startMs, endMs]]}, style, phrases,
             //  seed, families, coverage} — elementName may be a model OR group name
}
```

All times in `analysis`/`lyrics` are seconds; the effect plan and xsq are in
milliseconds on a 50 ms grid.

## Stage 1 — Layout parsing (`parseLayout` + simpleshow-classify.js)

- Parses `xlights_rgbeffects.xml` with `DOMParser`, reads `models > model`
  elements plus submodel names. Model groups (both `<modelGroups>` children
  and legacy `DisplayAs="ModelGroup"` entries) are collected into `S.groups`
  as classification hints; groups themselves are still not sequenced.
- `classifyLayout()` scores each model against all 15 roles: DisplayAs type
  (+5, canonical — `Arches`, `Icicles`, `Window Frame`… map directly; DMX
  fixture types get Skip +5), tree types split Mega/Mini at 400 nodes (+4),
  `faceInfo` (+8) and mouth/eyes submodels (+4) for Singing Face, name
  keywords (+2..4; "forest" is +7 so deliberate naming beats the DisplayAs
  hack of modeling ground forests as Icicles grids; DMX channel names like
  gobo/tilt/pan and "null" pixels get Skip +4; yard-art words like
  deer/sleigh/peacock lean Special/Accent +2), group-name keywords at 0.7×
  applied to members (skipped entirely for negated group names like "All No
  Matrix"), poly/single line (+2, +1 more when positioned in the top 30% of
  the layout), single-node models lean Flood (+2). Highest score wins
  (min 2, else Generic Prop); the margin sets
  `m.conf` — high (≥5 and ≥3 clear), medium (≥3 and ≥1.5 clear), else low —
  and `m.why` records the human-readable reasons shown as a tooltip.
- Low-confidence rows are tinted and counted in a "roles to review" stat so
  the user checks exactly the doubtful ones.
- If multiple models classify as Mega Tree, the one with the most nodes
  (`parm1 × parm2`) keeps the title; the rest become Mini Trees.
- The user can override any role via a dropdown; overrides are saved to
  `localStorage` (`autoshow.roleOverrides.v1`, keyed by model name) and
  re-applied with `conf:'user'` on any future classification of the same
  names. A button clears them. Roles drive everything downstream (recipes,
  accents, face casting).
- `drawHouse()` renders a top-down house preview from `WorldPosX/Y` when at
  least half the models have positions; otherwise it falls back to a grid.
  The same function powers the step-5 live preview via a `litColors` map.

## Stage 1b — Geometry, color capability & dragging (simpleshow-render.js)

**Geometry.** `parseModelGeometry()` reads what the layout file already
knows: `CustomModelCompressed` (`node,row,col;…`) / `CustomModel` grids +
`CustomWidth/Height`, Poly Line `PointData` (x,y,z offsets from WorldPos ×
scale), two-point spans (`X2/Y2` for Single Line / Arches / Icicles), and
scale/strand/string counts for boxed types. `modelNodeOffsets()` turns each
model into cached node offsets from its anchor (+y up, capped ≈130–240
nodes): custom grids exactly, poly lines dotted along their segments, arches
as `parm1` semicircles (newer layouts store the count as
`NumArches`/`NodesPerArch`, mapped into parm1/parm2 at parse time — same as
the `NumStrings`/`NodesPerString` fallback), icicles as a run of drops laid
out from the real `DropPattern` (nodes-per-drop) and node count — hanging
down for true icicles, spiking **up** from the baseline for Forest-role rows
(ground forests modeled as Icicles, like the user's PeaceForest strings:
100 nodes, DropPattern 5 → 21 uniform stakes), trees as cones
(width = strings × strands × scale, tapered by `TreeBottomTopRatio`),
matrices as grids, stars as `LayerSizes` rings; unknown boxed props fall back
to a dot ring sized by scale. **Flood-role models** (floods & wall washers)
short-circuit every geometry branch: their nodes are fixture *heads* — Poly
Line vertices, points along a two-point span, or a single point — and
`drawHouse` renders each head as a soft radial pool of light (`m._big`),
per-head animated and dimmed when resting. Because geometry now depends on
the role, `setRole`/`runClassification` invalidate the cached
`_nodes`/`_big`. `drawHouse()` fits the union of node extents
and draws every node — the same house view xLights shows — with a soft
**elliptical** glow hugging each lit model's real extent (a circle sized by
the widest dimension gave wide flat props a giant dome; Forest-role props
skip the glow entirely so their ground pixels stay crisp) and per-node
effect animation (`nodeFx`): chases
travel along a prop's own pixels, Bars alternate blocks, twinkles/meteors
flicker per node, shockwaves ring outward, sparkle overlays pop white.
Labels only render for the hovered model; the live preview gets hover
tooltips (`S._prevPts`).

**Color capability.** `chanFromStringType()` maps StringType → `chan`
(`RGB` / `RGBW` / `single` + `fixedColor` from the name: White/Blue/Red/…).
Step 1's **Lights** column overrides it (persisted in `autoshow.chan.v1`,
keyed by model name). `palForModel(m, pal)` collapses palettes to
`[fixedColor]` for single-color strings — applied when role families stamp
member rows, and to face washes / Faces effects / bass accents. The preview
tints single-color props to `fixedColor × pow(luminance(planned), 0.55)`, so
a white-only angel brightens and dims but never changes hue.

**Dragging, scale & rotation.** Mousedown near a prop on the step-1 house
canvas grabs it; the inverse of the draw transform (`houseXform`) maps the
mouse back to world coordinates; mouseup persists to `autoshow.positions.v1`
(name → [x, y]), reapplied by `parseLayout`. The **mouse wheel** over a prop
resizes it (×1.07 per notch, clamped 0.2–8), **Shift+wheel** rotates it
(5° steps; shift-wheel arrives as `deltaX` on many mice), and **Alt+wheel**
stretches it taller/shorter (vertical-only scale, applied after rotation —
the way to make a flat forest's spikes readable) — all persist to
`autoshow.xform.v1` (name → {s, r, sy}) and re-apply via
`applyXformOverrides`. Forest-role Icicles rows also get a full-height
geometry floor (tiny layout `Height` attrs squashed spikes into dashes).
`modelNodesXf(m)` layers the user transform over the cached
`modelNodeOffsets`; `drawHouse`/`modelExtent` draw and fit through it, so
both previews follow. "Forget dragged positions" / "Forget scale & rotation"
clear each store. Both previews share `m.x/m.y`, so step 5 follows
immediately.

## Stage 2 — Audio analysis (`analyze`)

All in-browser, on a mono downmix at the file's native sample rate.

1. **STFT:** 1024-sample Hann frames, 512 hop, custom radix-2 FFT (`fftMag`).
   Per frame: spectral flux (positive magnitude deltas), total energy, and
   band energies (bass < 250 Hz, mid < 2 kHz, high above).
2. **Music extent:** energy smoothed over a ±0.4 s window; frames below 4%
   of the 95th-percentile smoothed level at the head/tail are silence, and
   `musicStart`/`musicEnd` (±0.2 s slack) bound everything downstream —
   section thresholds, bass hits, and the lyric span. Guard: if the whole
   file reads as silence, the extent falls back to the full duration.
3. **Onset envelope:** flux minus 1.15× its local mean over a ±0.7 s window,
   clamped at zero.
4. **Tempo:** autocorrelation of the onset envelope scanned 60–180 BPM in
   0.5 BPM steps with interpolated lags and a gentle prior centered at
   118 BPM. **Octave fix:** because fractional lags defeat autocorrelation at
   this frame rate, candidate BPM vs 2× BPM are compared by summing onset
   energy along an actual float-period beat grid; doubling wins if its grid
   sum is ≥ 1.55× the base.
5. **Beats:** dynamic-programming beat tracking (Ellis 2007 — the same family
   of tracker as the QM Vamp plugin, in pure JS because a browser can't load
   native Vamp plugins). The onset envelope is std-normalized and gaussian-
   smoothed (σ ≈ period/32) into a local score; the DP then scores each frame
   as `local[i] + max_j(score[j] − 100·ln²((i−j)/period))` over predecessors
   0.5–2 periods back, and the beat sequence is backtraced from the best
   frame near `musicEnd`. Beats therefore snap to real onsets and bend with
   tempo drift instead of sliding off a rigid grid (synthetic regression:
   ~11 ms median error on a drifting click track where the old fixed grid was
   up to 240 ms off). The reported BPM is the median inter-beat interval the
   tracker actually followed. Degenerate/near-silent input (< 16 beats found)
   falls back to the old fixed grid at the autocorrelation tempo.
6. **Downbeats:** the 4-beat phase whose beats carry the most bass energy.
7. **Sections:** per-bar mean energy → percentile thresholds (35/60/82) →
   quiet / verse / build / chorus, with single-bar islands smoothed away,
   then merged into runs. Percentiles come from **in-music bars only** and
   bars outside the music extent are forced to `quiet`, so silence padding
   can't drag the thresholds down and misgrade the real music.
8. **Bass hits:** local maxima of bass-band energy above the 98.5th
   percentile, at least 1.2 s apart, within the music extent. These drive
   shockwave/strobe accents.

## Stage 3 — Lyrics timing, phoneme breakdown & face casting (`buildLyrics`)

Lyrics arrive by typing/pasting into the step-3 box, or from a text file
(`loadLyricsText` — browse button or drop straight onto the textarea). File
text is normalized (CRLF → LF, trimmed lines, blank runs collapsed) and
`.lrc` karaoke files are cleaned to plain lines: metadata tags
(`[ar:…]`, `[offset:…]`) and `[mm:ss.xx]` timestamps stripped, since
SimpleShow does its own timing. Loading dispatches the textarea's `input`
event so it follows the same session-save path as typing (and, like
retyping, invalidates any step-5 lyric doc built from different text).

**Grapheme → viseme engine (`wordVisemes`):** every word is broken down into
the Preston Blair mouth shapes xLights' Faces effect renders
(`AI, E, O, U, FV, L, MBP, WQ, etc`), entirely in the browser:

- Lookup order: exceptions dictionary (`G2V_DICT`, ~60 common words the
  letter rules get visibly wrong — *the, of, love, would, heart…*) → stem +
  suffix against the dictionary (*loves/loved/loving*) → ordered letter-rule
  engine (`G2V_RULES`).
- The rules match longest-pattern-first at each position: contextual
  clusters (`eigh/igh/ough/tion/all/alk`), vowel digraphs (`oo→U, ee→E,
  ow→O, ou→AI…`), magic-e lookaheads (`a_e→E, i_e→AI, o_e→O, u_e→U`),
  consonant digraphs (`ph→FV, wh→WQ, qu→WQ`, silent `kn/wr`), then single
  letters. Silent final *e*, `ed`/`es` endings, and positional *y* are
  handled contextually in the loop. Adjacent identical visemes merge (same
  mouth, held). Viseme-level output is far more forgiving than true
  phonemes — most consonants collapse to `etc` — which is why a rule engine
  suffices without bundling a pronouncing dictionary.

**Timing** is phoneme-weighted end to end (vowel viseme = 2, consonant = 1):

- Lines live in **singable windows**: the non-quiet sections clipped to the
  music extent (with "keep lyrics inside the sung parts" checked — the
  default), so instrumental intros, outros, and mid-song breaks never get
  lyrics. Unchecked, the single window is the whole music extent.
- Lines are laid out along the concatenated windows proportionally to their
  total phoneme weight; a line never crosses an instrumental gap (it ends
  with its window). Each line start is then pulled to the **strongest onset
  nearby** (radius ~40% of its slot, capped at 1.5 s, closer onsets favored
  over louder-but-far ones) — vocals land on onsets, not on a proportional
  grid; this was the "dubbed movie" lip-sync fix. Onset snapping can be
  toggled off (falls back to beat snapping), starts stay monotonic, and a
  ±2 s **timing offset** slider shifts every line/word/phoneme for
  systematic early/late feel. 15% breathing room at the end of each line.
- Words get slots proportional to their phoneme weight (singing for 94% of
  the slot — the gap reads as *rest*), and phonemes tile each word with
  vowels held twice as long as consonants.
- **Casting** (`castVocals` in simpleshow-vocals.js): solo mode gives every
  verse line to one chosen lead; duet mode alternates two leads line by
  line; round robin rotates all faces (legacy). Any line starting inside a
  chorus section lights **all** faces as backup (toggleable — with backup
  off, a duet still sings its choruses together). Arrangement, leads, and
  the backup toggle persist in `localStorage` (`autoshow.vocals.v1`) and
  the step-3 controls re-render from `vocalState()`, which re-validates
  saved leads against the current face list.

## Stage 3b — Lyric review & editing (simpleshow-lyric-editor.js)

Automatic timing won't be perfect, so step 5 carries a **Fix the Lyrics**
editor. Its data model is the **lyric doc** — `S.lyricDoc = {songKey, raw,
lines[]}` — created by snapshotting the current automatic layout on the first
edit (`ensureLyricDoc`). While a doc is active, `buildLyrics` **replaces** the
automatic layout with a deep copy of the doc's lines and disables the
timing-offset sliders (edits are absolute; a global offset would fight them).

- **Applicability** (`activeLyricDoc`): the doc only applies while both the
  song key (`audio name + rounded duration`) and the raw step-3 lyric text
  match what it was built from — retyping the lyrics or loading a different
  song falls back to automatic layout without losing the saved doc.
- **Persistence:** every edit saves to `localStorage`
  (`autoshow.lyricdoc.v1.<songKey>`), so the corrected timing survives page
  reloads and any number of regenerations with any seed. "Reset to automatic
  timing" deletes the doc.
- **Edit operations** all shift word *and phoneme* times along with the line:
  `moveDocLine` (drag / ±50 ms / ±250 ms / start-to-playhead, clamped to the
  audio), `splitDocLine` (split before any word; both halves keep casting and
  color), `setDocLineVoice` (reassign to one face or ALL; clears the custom
  color), `setDocLineColor`. Each ends in `rebuildFromDoc()`: `buildLyrics()`
  → `generateShow()` with the **same seed** (so Faces effects follow the
  edit) → editor + preview refresh.
- **UI:** a section-tinted timeline canvas draws each line as a block in its
  cast color (`FACE_HUES` gives every face a stable hue; a custom line color
  overrides it — the same color feeds the Faces effect palette on export),
  staggered on two rows, with the playhead overlaid; `drawLyricEditCanvas` is
  cheap enough to call per animation frame. Click selects a line and seeks
  the player to it; drag live-previews the move and commits through the doc
  on mouseup. The selected-line panel (rebuilt only on selection/edit) holds
  the nudge buttons, **contract/expand** (`scaleDocLine` — words & phonemes
  rescale around the line start), voice select, color picker, and
  split-before word chips.
- **Singing-faces preview** (`drawFacesPreview`, canvas above the timeline):
  just the faces, big — sorted by world X, glowing in their cast color while
  singing, dimmed at rest, with the current words underneath and the active
  word bracketed. Redraws with the editor playhead every frame.
- **Character face art** (`faceArtFor` / `assignFaceArt`): each face has a
  chip that accepts dropped (or picked) per-viseme PNGs **or a .zip of the
  whole set** (`zipImageFiles` — a minimal in-browser ZIP reader walking the
  central directory; stored entries sliced directly, deflate entries
  inflated with the browser's `DecompressionStream('deflate-raw')`, folders
  flattened, non-images skipped). Filenames parse as
  `Name_<VIS>_<eo|ec>.png` with `F→FV`, `ect→etc` normalization and
  eyes-open preferred; an eyes-closed rest (`_rest_ec`) is kept separately
  as `rest_ec`. Images are downscaled to ≤200 px and stored as data
  URLs in `autoshow.faceart.v1.<modelName>`. `faceArtImage(name, vis, t?)`
  feeds both the faces preview and the main live preview (which draws the
  character instead of mouth glyphs, dimmed when not singing); while a
  character **waits**, `rest` blinks the eyes-closed frame for ~0.18 s every
  ~3.8 s, phase-offset per face (`hashF`) so the cast doesn't blink in
  unison. Faces without art fall back to a drawn cartoon + `drawMouth`
  visemes.

## Stage 4 — Show generation (choreography-first; simpleshow-choreo.js)

Modeled on measurements from three professional sequences (groups carry the
show, ~8–22 elements active at once out of 100+, short beat-aligned effects,
deliberate rests):

- **Seed** (`makeRng`, mulberry32): the step-4 seed box + 🎲 button; same
  seed ⇒ byte-identical plan, new seed ⇒ genuinely different show.
- **Families** (`buildFamilies`): group member lists expand nested groups;
  groups covering >50% of the display become the unison-hit target
  (`allGroup`), the rest are sorted by role-homogeneity then size and
  greedily accepted with **exclusive member ownership** (a model owned by a
  group family never gets direct base effects — the double-lighting
  defense; subgroups of an accepted group are naturally rejected). Unowned
  models fall back into role families. Flags: `anchor` (mega tree > matrix
  > most pixels), `special`, `forest`, `strandy` (all-linear members ⇒
  group-level chases allowed).
- **Choreographer** (`choreograph`): per section, an **energy budget**
  (quiet 1–2 families, verse n/3, build ramps one family per phrase,
  chorus ~all, scaled by intensity) picks the active set (anchor always in,
  though **it rests too**: in verses the anchor sits out one phrase in three,
  bed only, so the mega tree isn't running the entire song; forests are
  featured in quiets but otherwise join only every OTHER chorus — last, when
  the budget is genuinely full — and sit out verses and builds entirely;
  specials only in build/chorus via their recipes). Per 8-beat phrase a **move** is
  drawn from a section-weighted table: hold (recipe texture), pulse
  (beat-aligned 0.5-beat On/Shockwave trains), chase (SingleStrand on
  strandy groups; Pinwheel on all-spinner families — spinners/wreaths
  always rotate, never linear; Wave on all-forest families — forests always
  undulate; and in build/chorus a family of ≥3 mini trees / candy canes gets
  a **cross-prop chase** — per-member `elName` On placements ordered by
  WorldPosX, one prop per beat, 8th-note steps when the row is >8 props, the
  way pros program scale runs; Bars otherwise — chase is also in the chorus
  table now so fast sections actually roll it), sweep (families staggered by
  mean WorldPosX, left→right/right→left/center-out), call-and-response (two
  halves trade beats), focus rotation (one family featured, others drop to
  quiet textures). **Wall washers are long fades, never beat props:** every
  move that lands on an all-Flood family — hold, pulse, chase, sweep —
  becomes `mvFlood`, a slow swell (On brightness ramps up over the front 60%
  of the phrase and back down over the rest, peaking at 40/75/100 by section
  energy). Unison `On` hits land on `allGroup` at build/chorus
  starts. `recipesFor` survives as the texture vocabulary — Forest recipes
  are Wave (sine, height/speed rising with the section) in every non-quiet
  section, and Flood recipes are slow On fades. The mega-tree spotlight program trades **Spirals with Tendril**
  through verses and rotates six chorus hero textures (Butterfly, Curtain
  open-then-close, fast Spirals, Tendril circle, a bottom-up Curtain wipe,
  Pinwheel) with sparkle, over its Shockwave ring rhythm layer.
- **Layer stack** (step-4 "Layers & moves"): `layerDepth` = *simple* (moves
  on layer 0, the old shape), *layered* (default: every active family gets a
  dim **color bed** on layer 0 — `mvBed`, ColorWash `Brightness=30`, palette
  B — with moves on layer 1 carrying `T_CHOICE_LayerMethod=Max`), or *rich*
  (layered + `SparkleFrequency=60` on build/chorus textures). Pulses stacked
  over a hold on the same family (focus feature, anchor pulses) go one layer
  higher so no two effects overlap on one layer. Accents (unison hits, bass
  shockwave/strobe) always sit at `ACCENT_LAYER` (3). Step-4 checkboxes
  remove individual moves from the vocabulary (hold always remains) and gate
  the unison hits; all of it persists with the session.
- **Compiler** (`compileChoreo`): placements → the same plan rows
  `[layer, effect, settings, palette[], startMs, endMs]`; group-backed
  families emit onto the **group element name** (one plan key), role
  families stamp each member — with `palForModel` collapsing palettes for
  single-color members. Every non-Skip model and group element is seeded
  with an empty array so rests render dark in the preview.
- Faces still get a dim ColorWash base + layer-1 Faces effects on their
  lines, bound to **per-voice timing tracks**. 50 ms grid throughout.
- `S.sequence` = `{plan, style, phrases, seed, families, coverage}`.

## Stage 5 — XSQ export (`buildXSQ`)

Emits xLights' XML sequence format:

- `<head>` declares 50 ms timing, Media sequence type, the audio filename,
  and duration.
- `<databases>` holds deduplicated `<effectdb>` settings strings and
  `<colorpalettes>` (each palette expanded to the 8-slot
  `C_BUTTON_Palette*/C_CHECKBOX_Palette*` form). Effects reference these by
  index — the body is built *first* so the ref maps populate.
- Timing tracks: **Beats**, **Bars**, and when lyrics exist, **per-voice
  tracks** ("Voice - <lead>", from `voiceTrackPlan()`, deduped against
  reserved names) carrying each lead's solo/duet lines plus the merged
  **Lyrics** track with every line — each with three `<EffectLayer>`s:
  phrases (labels = line text), words, phonemes (viseme names). That's the
  exact structure xLights' own *Breakdown Words into Phonemes* produces, so
  Faces effects (each bound to its singer's track via
  `E_CHOICE_Faces_TimingTrack`) lip-sync on open. All-faces chorus lines and
  round-robin mode bind to Lyrics. Zero-length timing marks are dropped.
- Model elements get one `<EffectLayer>` per plan layer, effects sorted by
  start time, zero-length effects dropped. Plan keys that are **group
  names** export as ordinary `<Element type="model" name="GroupName">` —
  exactly how professional sequences carry group effects; the header's
  `ModelBlending="true"` makes group-over-model layering render sensibly.

`downloadReadme()` generates a plain-text setup guide covering import,
phoneme breakdown, matrix video content, and polish tips.

## Stage 6 — Preview (`drawPreviewFrame`, `planColorAt`, `drawScrub`)

The preview is driven by the **actual effect plan**: `planColorAt()` walks
each model's covering elements from `S.sequence.coverage` (itself + owning
group + allGroup) — a direct model effect beats a group effect, the accent
layer (≥3) wins as a white flash, and the member's ordinal within its group
phases chases so a SingleStrand on "Arches" visibly travels across the
arch dots. The chosen effect maps to a model-level animation style
(Twinkle/Meteors flicker with deterministic per-model noise (`hashF`),
Bars/chases alternate palette colors on eighths, Spirals/Butterfly/Pinwheel/
Tendril cycle the palette per beat, Wave rolls a traveling sine so forests
visibly undulate, Curtain opens from the center using the effect's progress,
ColorWash shimmers when the settings say so, the
`Brightness=30` bed dims, and any "On" with `Eff_On_Start/End` lerps its
brightness across the span — washer swells visibly breathe and accent ramps
brighten) and is recorded into `S._fx` so `drawHouse` can also animate **per
node** (see Stage 1b). Models with no active effect are near-dark, so
negative space reads truthfully. On top of `drawHouse()`:

- **Mouth shapes**: singing faces with an assigned character set draw the
  viseme **image** (dimmed when idle); otherwise `drawMouth` glyphs (AI
  open, E wide, O/U round, MBP closed, FV teeth…) — the direct visual check
  for lip sync.
- **Karaoke overlay**: the current line is drawn along the bottom of the
  canvas with the active word in gold and the viseme code inline;
  `drawHouse` reserves a bottom band on the preview canvas so text never
  covers props. When no line is active, the status row shows the next line.
- **Scrub bar** (`drawScrub` + drag handlers): a section-colored strip with
  lyric-line ticks, dimmed silence, and a playhead; click or drag to seek.

Canvases are desktop-first: the preview canvas sizes to the window height
(≈380–860 px), the house canvas to its width, and glyphs/labels scale with a
canvas-width factor. Hovering the step-1 house preview shows
name/role/confidence via the canvas title. Bass hits still flash the whole
display white.

**Text sizer** (header, top right): every CSS `font-size` runs through
`calc(Npx * var(--ts))`; five settings — XXS (0.88) / XS (0.96) / Normal
(1.06, deliberately a touch above the old base for tired eyes) / XL (1.22) /
XXL (1.4) — set `--ts` via `applyTextScale`, highlight the active button, and
persist to `autoshow.textscale.v1`. Canvas-drawn text is unaffected (it
scales with the canvas-width factor instead).
