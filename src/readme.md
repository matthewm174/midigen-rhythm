# midigen rhythm

Generative drum rhythms for Superior Drummer 3 (MIDI), in the browser.

## Quick start

Requires [Node.js](https://nodejs.org/) 18+. No dependencies to install. Run commands from the project root.

```sh
npm start            # serves the app at http://localhost:5173
node serve.mjs 8080  # or pick a different port
```

Then open the URL in your browser.

## Describing a beat

- **Describe the song** in plain English, e.g. `fast metal with VERY heavy double bass, soft hands, no ghosts, 180 bpm`. Use "very", "!" or CAPS to emphasize, "slightly" to soften, and "no" or "not" to negate. The **Heard** line under the box shows how your words were interpreted and which words weren't recognized.
- **Parts** (A, B, breakdown…) can each add their own description, e.g. `busier, loud hands`. Part descriptions outweigh the song description.
- **Lanes**: type plain English per drum, e.g. kick `double bass, loud`, snare `simple backbeat, ghost notes`, hats `busy offbeat`. The precise lane language (`grid 1/8`, `euclid 5/16`…) still works too.
- **Feel → Feet / Hands** sets how hard the kick is played compared with the rest of the kit.

**Export MIDI** downloads a `.mid` file. Use the dropdown next to it to choose the layout: **Track per lane** gives one track per drum lane (kick, snare, etc.). **Single track** puts everything on one track. All notes are on channel 10.

## Tests

```sh
npm test             # smoke test
node tests/fuzz.mjs  # fuzz test (meters, descriptors, lane specs, MIDI writing)
```
