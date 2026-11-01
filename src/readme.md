# midigen rhythm

Generative drum rhythms for Superior Drummer 3 (MIDI), with harmony and melody built on top, in the browser.

## Quick start

Requires [Node.js](https://nodejs.org/) 18+. No dependencies to install. Run commands from the project root.

```sh
npm start            # serves the app at http://localhost:5173
node serve.mjs 8080  # or pick a different port
```

Then open the URL in your browser. For an illustrated, step-by-step walkthrough, see [How to use](../README.md#how-to-use) in the main README.

## Describing a beat

- **Pick a preset** (Metal, Baroque, Gregorian chant, Tribal…). Presets are styles: they fill the **Style** box. Tempo, meter and grid are on **auto**, so they follow the style. Tribal might land in 7/8, a waltz in 3/4, a jig in 6/8. Type a value in those fields to fix it; clear the field to go back to auto.
- **Describe the song** in plain English to change the style, e.g. `swing`, `slower, sparse`, `in 7/8`, `VERY heavy double bass, no ghosts, 180 bpm`. With the Metal preset, `swing` gives swung metal and `jazz` gives something between metal and jazz. Changes apply as you type. Use "very", "!" or CAPS to emphasize, "slightly" to soften, and "no" or "not" to negate. The **Heard** line under each box shows how your words were interpreted and which words weren't recognized. Your description stays when you switch presets, so you can try the same change on different styles.
- **Parts** (A, B, breakdown…) can each add their own description, e.g. `busier, loud hands`. Part descriptions outweigh the style and song description.
- **Lanes**: type plain English per drum, e.g. kick `double bass, loud`, snare `simple backbeat, ghost notes`, hats `busy offbeat`. The precise lane language (`grid 1/8`, `euclid 5/16`…) still works too.
- **Feel → Feet / Hands** sets how hard the kick is played compared with the rest of the kit.

**Export MIDI** downloads a `.mid` file. Use the dropdown next to it to choose the layout:
- **Track per lane** gives one track per drum lane (kick, snare, etc.) plus one each for melody, rhythm section and bass.
- **Single track** puts everything on one track.
- **Drums only** leaves out the pitched tracks.
- **Harmony only** leaves out the drums.

Drums are on channel 10. Melody, bass and rhythm section have their own channels and General MIDI instruments.

## Harmony and melody

The rhythm is the foundation: the **bass** follows the kick, the **rhythm section** (chords) follows the snare and hats, and the **melody** sits on the chords.

- **Styles and eras** are read from the song description, or from the **Describe the harmony & melody** box. Examples: `gregorian chant`, `organum`, `renaissance`, `baroque`, `classical`, `romantic`, `impressionist`, `twelve tone`, `jazz`, `blues`, `funk`, `pop`, `hard rock`, `metal`, `doom`, `synthwave`, `flamenco`, `maqam`, `raga` and `gamelan`. The **Heard** line marks harmony terms with ♪. Open **Styles, eras & scales** for the full clickable list.
- **Key and scale.** Type them (`in D dorian`, `key of F#`, `harmonic minor`) or pick them in the panel.
- **Voices.** Each voice has a box for a style or a chord chart:
  - Chords: `i bVI III bVII`, `Am F C G` or `ii7 V7 Imaj7`.
  - Bass: `walking`, `pedal`, `octave` or `root fifth`.
  - Rhythm section: `pad`, `strum`, `arpeggio`, `power`, `tremolo` or `alberti`.
  - Melody: `riff`, `chant`, `lyrical`, `busy high` or `follow snare`.

  Every voice also has **M**ute, **lock**, **re-roll** and an instrument picker.
- **Microtones.** Everything stays in 12-tone equal temperament unless you set **Microtones** to **On**, or describe them (`microtonal`, `quarter tones`, `just intonation`, `meantone`, `31 edo`). Then pick a **Tuning**, or leave it on auto to use the style's historical tuning. Microtonal notes are exported with pitch bend, so use an instrument that supports per-channel pitch bend or MPE.

## Saving and opening songs

Every exported `.mid` file remembers all the settings and every note. **Open MIDI** (or dragging a `.mid` onto the page) brings it back exactly, ready for more changes. You can also open other MIDI files: their drums, bass, chords and melody are imported and locked, and anything missing is generated around them. **Save preset** keeps a song inside the browser.

## Tests

```sh
npm test             # smoke test (drums, harmony, MIDI export, recall and import)
node tests/fuzz.mjs  # fuzz test (meters, descriptors, lane specs, harmony styles, tunings, MIDI writing)
```
