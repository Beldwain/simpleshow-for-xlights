# SimpleShow — xLights Sequence Generator

SimpleShow is a browser-based tool that turns an xLights layout plus a song into a
beat-synced sequence (`.xsq`) you can open directly in xLights. Everything runs
client-side — no server, no install, no upload of your audio or layout
anywhere. The app is `simpleshow-xlights.html` plus five supporting scripts
(`simpleshow-classify.js`, `simpleshow-vocals.js`, `simpleshow-choreo.js`,
`simpleshow-render.js`, `simpleshow-lyric-editor.js`) that must stay in the same
folder.

**Status:** Working against current xLights builds (verified July 2026), but
early. See [ROADMAP.md](ROADMAP.md) for known limitations and planned work.

## Wiki
For some easy to understand guidance we now have a wiki with several area's to help guide you.

![Simpleshow for xLights Wiki](https://github.com/Beldwain/simpleshow-for-xlights/wiki)

## Quick start

1. Open `simpleshow-xlights.html` in any modern browser (Chrome/Edge/Firefox).
2. Follow the five-step wizard:

| Step | What you do | What SimpleShow does |
|---|---|---|
| 1 · Layout | Drop in `xlights_rgbeffects.xml` from your show folder | Parses every model, scores each into a show role (Singing Face, Mega Tree, Arch, …) with a confidence flag so you review only the doubtful rows, and draws the house the way xLights does — every prop as its **actual pixels** (custom-model grids, tree cones, arches, icicle drops, poly-line runs). **Drag any prop** to reposition it (saved in your browser; the layout file is untouched). A **Lights** column shows what each string can physically display — RGB, RGBW, or single color (with its color) — detected from the StringType and correctable. Corrections are remembered per layout. |
| 2 · Music | Drop in an MP3/WAV/M4A | Analyzes the audio in-browser: tempo, beat grid, downbeats, song sections (quiet/verse/build/chorus), big bass hits — and the actual music span, so silence padding at either end is ignored. |
| 3 · Lyrics | Paste lyrics, one sung line per line — or click **Find synced lyrics online** (free lrclib.net database) or drop a timestamped `.lrc` to get human-synced line timing (or leave empty for instrumental) | With downloaded/`.lrc` sync, every line starts exactly where a human timed it; otherwise lines are placed inside the sung parts of the song and snapped to the nearest musical onset. Word boundaries inside each line follow the vocal-band onsets, every word breaks down into mouth-shape phonemes, and the faces are cast like a real act: a solo lead or a duet trading lines, with every face joining as backup on choruses. A global timing-offset slider fine-tunes everything. |
| 4 · Generate | Pick a **palette** (~25 seasonal sets: Christmas, US holidays, Diwali / Holi / Hanukkah / Eid / Lunar New Year / Bonfire Night / Mardi Gras / Australia and more, plus plain seasons), a **mood** (Gentle / Classic / Festive / Party — shapes rests, energy, and sparkle), intensity, **layering depth** (simple / layered / rich), which **moves** are allowed, unison hits, a show seed — and configure each **screen/matrix**: choreography effects, one of **20 original shaders** (exported as an ISF pack for the xLights Shader effect), **karaoke words** (scrolling, highlighted, highlighted + outline), or karaoke over a dimmed shader | Choreographs the display top-down the way pros sequence: your model groups carry sweeps, chases, pulse trains and call-and-response; an energy budget keeps only a few prop families loud at once so quiet moments and hits both land; special props hold back for the ramps. In layered mode every active family keeps a dim color bed under its moves (blended with Max, like the pro sequences); rich adds a sparkle overlay on choruses. Same seed reproduces the same show — roll a new one for a different show. |
| 5 · Export | Watch the live preview (plan-driven per-pixel colors, karaoke line, click-to-seek scrub bar), fix the lyric timing in the **Fix the Lyrics** editor — it has its **own preview of just the singing faces**, each representable by a **character image set** (drop in per-mouth-shape PNGs like `Name_AI_eo.png`; xLights matrix-face art works as-is) — drag lines on a timeline, nudge by 50 ms, **contract / expand** a line's timing, snap to the playhead, split a line at any word, recast which face sings it, recolor it — then download the **show bundle** (a zip in show-folder layout: the `.xsq` plus only the shaders this show uses, plus a README) or just the `.xsq` | Builds a complete xLights sequence file with Beats, Bars, and a three-layer Lyrics timing track (lines / words / phonemes). Your lyric fixes and face art are saved in the browser and survive regenerating the show with any seed. |

SimpleShow is desktop-first — it's built for a real monitor (or at worst a
tablet/small laptop), not phones, and the previews scale with your window.

## Importing into xLights

1. Copy the downloaded `.xsq` into your show folder, next to
   `xlights_rgbeffects.xml`. Model names in the sequence were read from your
   layout file, so they match automatically.
2. Open the `.xsq` in xLights and point it at your audio file when prompted.
3. Lip sync works out of the box: the **Lyrics** timing track ships with a
   phoneme layer (Preston Blair mouth shapes) and every Faces effect is bound
   to it — no *Breakdown Words into Phonemes* step. If you prefer xLights'
   dictionary-exact breakdown, running it on the words layer simply replaces
   the phoneme layer.
4. Render and watch in the xLights preview before pushing to a controller.

## What gets generated

- **Timing tracks:** Beats, Bars, and (when lyrics are supplied) per-voice
  tracks — one three-layer track per lead singer plus a merged **Lyrics**
  track (lines / words / auto-generated phonemes, the same structure
  xLights' own breakdown produces). Every Faces effect binds to its
  singer's track.
- **Choreographed group effects:** your model groups ("Arches", "Mini
  Trees", "Peace Forest", …) become the units of the show and carry chases,
  beat-aligned pulse trains, spatial sweeps and call-and-response; a
  whole-display group ("All") takes unison hits on section starts. Ground
  **forests** get upward motion for 3D depth; **special/accent** yard art
  stays dark until builds and choruses so the ramps land. Moves change
  every 8 beats and only a few families are lit at once — the rests are
  deliberate.
- **Accents:** Shockwave on the mega tree and strobes on the roof outline at
  detected bass hits (optional), VU-meter effects on matrices during choruses
  (optional).
- **Palettes & moods:** ~25 seasonal palettes (Christmas, US and worldwide
  holidays, plain seasons) with A/B alternation between phrases, plus four
  moods that shape the choreography itself (rests, energy budget, sparkle).
  Props marked **single color** export palettes of their one color only —
  the sequence never asks a white-only prop to turn red.
- **Screens:** matrices can run any of 20 original ISF shaders (download
  the pack from step 4 into your show folder — the export references
  `Shaders/SimpleShow/…​.fs`), karaoke words in four styles built on
  xLights bitmap fonts with exact per-word timing, or karaoke over a
  dimmed shader.
- **Layer stack (layered / rich modes):** layer 0 dim color bed, layer 1
  moves (`T_CHOICE_LayerMethod=Max`), layer 2 rhythm pulses stacked over
  holds, layer 3 accents (unison hits, shockwave/strobe); rich adds
  `SparkleFrequency` to chorus textures — the same stacking the pro
  sequences use.

## Known limitations (short version)

- **Prop identification is heuristic.** Roles are scored from model types,
  names, face definitions, groups, and geometry, with low-confidence rows
  flagged for review — but unusual props can still need a manual correction
  in step 1 (it's remembered for next time).
- **Phoneme breakdown is rule-based and English-only.** Visemes come from a
  letter-rule engine plus an exceptions dictionary, not a full pronouncing
  dictionary; for non-English lyrics run xLights' own breakdown instead.
- **Group effects render through each group's default buffer style** in
  xLights, which SimpleShow doesn't control — directional effects on mixed
  groups can look different from the in-app preview.

Full detail and planned fixes: [ROADMAP.md](ROADMAP.md).
How the internals work: [ARCHITECTURE.md](ARCHITECTURE.md).

## Development

There is no build step. The app is `simpleshow-xlights.html` (four `<script>`
blocks: layout parsing, audio analysis, lyrics + show generation, and xsq
export + preview playback) plus five plain-script supporting files it loads
from its own folder: `simpleshow-classify.js` (prop identification),
`simpleshow-vocals.js` (vocal arrangements + voice tracks),
`simpleshow-choreo.js` (choreography-first generation + session persistence),
`simpleshow-render.js` (model geometry + xLights-style node rendering, color
capability, prop dragging), and `simpleshow-lyric-editor.js` (the step-5 lyric
review & editing timeline, singing-faces preview, character face art). Edit
and refresh the browser. See [ARCHITECTURE.md](ARCHITECTURE.md) for a map.

For end-to-end checks, `.e2e/` holds a headless-Chromium harness: copies of
the app with a `driver.js` script appended that builds a synthetic layout +
analysis, exercises a feature, and appends a `PASS`/`FAIL` report to the DOM
(`chromium --headless=new --dump-dom` to run, `--screenshot` for a visual).
