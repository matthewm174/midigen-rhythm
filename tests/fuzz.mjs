// node tests/fuzz.mjs  -> many meters/descriptors/roles/lane specs; checks events, lane re-roll isolation, MIDI writing,
// and the harmony layer (styles, scales, tunings, voice specs, voice re-roll isolation, pitched MIDI).
import { generateRhythm } from '../src/engine/generate.js';
import { finalize } from '../src/engine/finalize.js';
import { writeMidi } from '../src/io/midi.js';
import { parseMidi } from '../src/io/midiread.js';
import { DESCRIPTORS, ROLES } from '../src/core/descriptors.js';
import { LANES, LANE_LABELS } from '../src/core/drummap.js';
import { generateHarmony, VOICES, PITCHED } from '../src/harmony/generate.js';
import { finalizeHarmony } from '../src/harmony/finalize.js';
import { H_STYLES } from '../src/harmony/styles.js';
import { SCALE_IDS } from '../src/harmony/scales.js';
import { TUNING_IDS, KEY_NAMES } from '../src/harmony/tuning.js';

const meters = [['4/4', 16], ['7/8 (2+2+3)', 16], ['12/8', 24], ['5/4', 32], ['11/16', 16], ['3/4', 24], ['9/8 (2+2+2+3)', 16], ['6/8', 32], ['13/8', 16], ['2/2', 16],
  ['9/17', 16], ['5/12', 24], ['7/10 (3+2+2)', 32], ['4/3', 16], ['3.5/4', 16], ['11/32', 16], ['13/24', 24]];
const words = Object.keys(DESCRIPTORS);
const specs = ['', 'ca 30', 'crystal', 'lsystem', 'evolve', 'packing 2 3 5', 'euclid 7/12', 'cycle 5/16', 'poly 5:4', 'on 1 2& 4a', 'x..x.X.g', 'group 3+3+2', 'blast', 'off', 'grid 1/16, open &, accent 1',
  'double bass, loud', '12 fast double', 'gallop', 'simple backbeat with ghost notes', 'busy offbeat', 'very soft, sparse', 'follow the kick', 'on the beat, bell', '8', 'triplets', 'no ghosts, syncopated'];
const sentences = ['fast metal with VERY heavy double bass, no ghosts, 180 bpm', 'slightly swung jazz, soft hands, heavy feet!', 'not busy, less syncopated funk', 'four on the floor house'];
const arts = (lane) => JSON.stringify(lane.map((h) => h && h.art));
const hStyles = Object.keys(H_STYLES).filter((k) => !k.startsWith('scale:'));
const voiceSpecs = {
  progression: ['', 'i bVI III bVII', 'Am F C G', 'ii7 V7 Imaj7', '1 4 5 1', 'V7/V V I', 'C/E F#m7b5 Bb', 'nonsense'],
  bass: ['', 'walking', 'pedal', 'octave busy', 'root fifth', 'none', 'chug', 'eighths low'],
  comp: ['', 'pad', 'strum', 'arpeggio', 'alberti', 'tremolo', 'stabs on snare', 'skank', 'organum', 'tanpura', 'comp rootless'],
  melody: ['', 'riff', 'chant', 'bebop', 'sequence', 'arp', 'minimal', 'ornate', 'row', 'none', 'busy high', 'sparse low stepwise'],
};

let ok = 0, fails = 0, notes = 0, pnotes = 0;
const t0 = performance.now();
for (let s = 0; s < 400; s++) {
  const [meter, resolution] = meters[s % meters.length];
  const descriptors = s % 5 === 4 ? sentences[s % sentences.length] : [words[s % words.length], words[(s * 7 + 3) % words.length]].join(',');
  const lanes = Object.fromEntries(LANES.map((l, i) => [l, { spec: (s + i) % 3 === 0 ? specs[(s + i) % specs.length] : '' }]));
  const parts = ROLES.map((role, i) => ({ name: role, bars: 1 + ((s + i) % 4), role, descriptors: i === 1 && s % 2 ? 'busier, loud hands' : i === 2 && s % 3 === 0 ? `${hStyles[(s * 5) % hStyles.length]}, in F#` : '' }));
  const harmony = {
    key: s % 4 === 0 ? KEY_NAMES[s % 12] : 'auto',
    scale: s % 5 === 0 ? SCALE_IDS[s % SCALE_IDS.length] : 'auto',
    microtones: ['auto', 'off', 'on'][s % 3],
    tuning: s % 3 === 2 && s % 2 ? TUNING_IDS[s % TUNING_IDS.length] : 'auto',
    descriptors: [hStyles[(s * 3) % hStyles.length], hStyles[(s * 11 + 7) % hStyles.length]].join(', '),
    voices: Object.fromEntries(VOICES.map((v, i) => [v, { spec: (s + i) % 4 === 0 ? voiceSpecs[v][(s + i) % voiceSpecs[v].length] : '', salt: 0 }])),
  };
  const auto = s % 3 === 1;
  const cfg = {
    seed: s, tempo: auto ? 'auto' : 60 + ((s * 37) % 260), meter: auto ? 'auto' : meter, resolution: auto ? 'auto' : resolution,
    style: auto ? [words[(s * 13) % words.length], hStyles[(s * 7) % hStyles.length]].join(', ') : '', descriptors, parts, lanes, harmony,
  };
  try {
    const r = generateRhythm(cfg);
    r.harmony = generateHarmony(cfg, r);
    const f = finalize(r, cfg);
    for (const e of f.events) {
      if (!(e.vel >= 1 && e.vel <= 127 && e.tick >= 0 && Number.isInteger(e.note))) throw new Error(`bad event ${JSON.stringify(e)}`);
    }
    const pe = finalizeHarmony(r, cfg, f.tpt);
    for (const e of pe) {
      if (!(e.vel >= 1 && e.vel <= 127 && e.tick >= 0 && e.dur >= 1 && Number.isFinite(e.pitch) && e.pitch > 0 && e.pitch < 128)) throw new Error(`bad pitched event ${JSON.stringify(e)}`);
    }
    for (const hp of r.harmony.parts) {
      if (!hp.prog.chords.length || hp.prog.chords.some((c) => !c.sym || !c.iv.every(Number.isFinite))) throw new Error(`bad chords in ${hp.name}`);
      for (const v of PITCHED) for (const n of hp.voices[v]) if (n.t < 0 || n.t >= hp.len || !(n.d > 0) || n.t + n.d > hp.len + 1e-6) throw new Error(`${v} note outside part: ${JSON.stringify(n)}`);
      if (!r.harmony.micro && PITCHED.some((v) => hp.voices[v].some((n) => Math.abs(n.p - Math.round(n.p)) > 1e-6))) throw new Error('microtone with microtones off');
    }
    // Re-rolling the melody must leave the chords and bass untouched.
    const voiceOf = (h, v) => JSON.stringify(h.parts.map((p) => (v === 'progression' ? p.prog.chords.map((c) => c.sym) : p.voices[v])));
    const h2 = generateHarmony({ ...cfg, harmony: { ...harmony, voices: { ...harmony.voices, melody: { ...harmony.voices.melody, salt: 1 } } } }, r, { previous: r.harmony, keep: ['progression', 'bass'] });
    for (const v of ['progression', 'bass']) if (voiceOf(h2, v) !== voiceOf(r.harmony, v)) throw new Error(`kept voice changed: ${v}`);
    const keep = LANES.filter((l) => l !== 'toms');
    const r2 = generateRhythm({ ...cfg, lanes: { ...lanes, toms: { spec: '', salt: 1 } } }, { previous: r, keep });
    for (const p of r2.parts) {
      for (const l of keep) if (arts(p.lanes[l]) !== arts(r.parts[p.index].lanes[l])) throw new Error(`kept lane changed: ${l}`);
    }
    const pitched = PITCHED.map((v, i) => ({ name: v, program: r.harmony.programs[v], channels: [[0, 10, 11], [2, 3, 4, 5, 6, 7, 8], [1, 12]][i], notes: pe.filter((e) => e.voice === v) }));
    const bytes = writeMidi({ events: f.events, tempo: r.playTempo, meter: r.meter, parts: r.parts, lanes: LANES, labels: LANE_LABELS, tpt: f.tpt, totalTatums: r.total, pitched, state: { cfg } });
    if (JSON.stringify(parseMidi(bytes).state) !== JSON.stringify({ cfg })) throw new Error('state did not round-trip');
    writeMidi({ events: f.events, tempo: r.playTempo, meter: r.meter, parts: r.parts, lanes: LANES, labels: LANE_LABELS, tpt: f.tpt, totalTatums: r.total, combine: true, pitched });
    // A bar must last exactly num/den whole notes at the requested quarter-note tempo.
    const barSec = r.meter.barLen * r.tatumSec, want = (r.meter.num * 4 / r.meter.den) * (60 / r.tempo);
    if (Math.abs(barSec - want) > 1e-9) throw new Error(`bar lasts ${barSec}s, expected ${want}s`);
    notes += f.events.length;
    pnotes += pe.length;
    ok++;
  } catch (e) {
    fails++;
    if (fails < 6) console.log('FAIL', JSON.stringify({ meter, resolution, descriptors, harmony, seed: s }), e.stack.split('\n').slice(0, 3).join(' | '));
  }
}
console.log(`ok ${ok}, fail ${fails}, avg drum notes ${(notes / Math.max(1, ok)).toFixed(1)}, avg pitched ${(pnotes / Math.max(1, ok)).toFixed(1)}, ${(performance.now() - t0).toFixed(0)} ms`);
process.exitCode = fails ? 1 : 0;
