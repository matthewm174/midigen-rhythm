// node tests/smoke.mjs  -> generates a few songs, prints ASCII, validates and writes .mid files to out/
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateRhythm } from '../src/engine/generate.js';
import { finalize } from '../src/engine/finalize.js';
import { writeMidi } from '../src/io/midi.js';
import { importMidi, parseMidi, midiNotes } from '../src/io/midiread.js';
import { toAscii } from '../src/io/ascii.js';
import { LANES, LANE_LABELS } from '../src/core/drummap.js';
import { generateHarmony, harmonySnapshot, PITCHED, VOICE_LABELS } from '../src/harmony/generate.js';
import { finalizeHarmony } from '../src/harmony/finalize.js';

const parts = [
  { name: 'A', bars: 2, role: 'groove' },
  { name: "A'", bars: 2, role: 'variation' },
  { name: 'B', bars: 2, role: 'contrast' },
  { name: 'turn', bars: 1, role: 'fill' },
];

const cases = [
  { name: 'tribal-78', tempo: 132, meter: '7/8 (2+2+3)', descriptors: 'tribal polymetric', seed: 7, parts },
  { name: 'grind', tempo: 250, meter: '4/4', descriptors: 'grindcore', seed: 3, parts },
  { name: 'djent', tempo: 118, meter: '4/4', descriptors: 'djent math', seed: 11, parts: [...parts.slice(0, 2), { name: 'C', bars: 2, role: 'breakdown' }] },
  { name: 'musical-swing', tempo: 96, meter: '4/4', descriptors: 'musical groove swing', seed: 5, parts },
  { name: 'chaos-crystal-128', tempo: 140, meter: '12/8', descriptors: 'chaotic crystalline polyrhythmic', seed: 99, parts },
  { name: 'hypnotic-phasing', tempo: 120, meter: '4/4', resolution: 32, descriptors: 'hypnotic phasing ritual', seed: 21, parts: [{ name: 'A', bars: 4, role: 'groove' }, { name: 'build', bars: 2, role: 'build' }] },
  { name: 'irrational-9-17', tempo: 100, meter: '9/17', descriptors: 'doom', seed: 4, parts },
  {
    name: 'spec-lanes', tempo: 140, meter: '4/4', descriptors: 'downbeat', seed: 1, parts,
    lanes: {
      hihat: { spec: 'grid 1/8, accent &' },
      kick: { spec: 'group 3/16 from each 1' },
      toms: { spec: 'euclid 5/12, interlock kick' },
      ride: { spec: 'poly 3:2, bell' },
      cymbals: { spec: 'x...x...x.x.' },
    },
  },
  { name: 'baroque-34', tempo: 96, meter: '3/4', descriptors: 'baroque, soft', seed: 8, parts },
  { name: 'hard-rock', tempo: 132, meter: '4/4', descriptors: 'hard rock, heavy', seed: 12, parts, harmony: { key: 'E' } },
  { name: 'gregorian', tempo: 70, meter: '4/4', descriptors: 'gregorian chant in D dorian', seed: 2, parts },
  { name: 'jazz-walk', tempo: 150, meter: '4/4', resolution: 24, descriptors: 'jazz, walking bass, extended chords', seed: 6, parts },
  { name: 'maqam-micro', tempo: 92, meter: '10/8 (3+2+2+3)', descriptors: 'maqam bayati', seed: 9, parts, harmony: { microtones: 'on' } },
  { name: 'baroque-meantone', tempo: 90, meter: '4/4', descriptors: 'baroque, meantone', seed: 10, parts, harmony: { microtones: 'on' } },
  { name: 'chart', tempo: 110, meter: '4/4', descriptors: 'rock', seed: 4, parts, harmony: { voices: { progression: { spec: 'Am F C G' }, bass: { spec: 'octave' } } } },
];

function validate(bytes) {
  const dv = new DataView(bytes.buffer);
  if (String.fromCharCode(...bytes.slice(0, 4)) !== 'MThd') throw new Error('bad header');
  const ntrk = dv.getUint16(10);
  let off = 14;
  for (let i = 0; i < ntrk; i++) {
    if (String.fromCharCode(...bytes.slice(off, off + 4)) !== 'MTrk') throw new Error(`bad track ${i}`);
    off += 8 + dv.getUint32(off + 4);
  }
  if (off !== bytes.length) throw new Error('length mismatch');
  return ntrk;
}

// Count note-ons per channel kind; the writer never uses running status, so events are [delta][status][data...].
function countNoteOns(bytes) {
  let drums = 0, pitched = 0;
  let off = 14;
  const readVlq = () => { let v = 0, b; do { b = bytes[off++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  while (off < bytes.length) {
    const end = off + 8 + new DataView(bytes.buffer).getUint32(off + 4);
    off += 8;
    while (off < end) {
      readVlq();
      const s = bytes[off++];
      if (s === 0xff) { off++; const len = readVlq(); off += len; continue; }
      const kind = s & 0xf0;
      if (kind === 0x90 && bytes[off + 1] > 0) { if ((s & 0x0f) === 9) drums++; else pitched++; }
      off += kind === 0xc0 || kind === 0xd0 ? 1 : 2;
    }
  }
  return { drums, pitched };
}

mkdirSync(new URL('../out/', import.meta.url), { recursive: true });

// Style + description layering: the description modifies the style; meter and tempo follow the style on auto.
{
  const two = [{ name: 'A', bars: 2, role: 'groove' }, { name: 'B', bars: 2, role: 'contrast' }];
  const run = (style, descriptors, extra = {}) => {
    const cfg = { seed: 1, style, descriptors, parts: two, meter: 'auto', tempo: 'auto', resolution: 'auto', ...extra };
    const r = generateRhythm(cfg);
    return { r, h: generateHarmony(cfg, r), p: r.parts[0].params };
  };
  const metal = run('metal', ''), swungMetal = run('metal', 'swing'), jazzMetal = run('metal', 'jazz');
  if (!(swungMetal.p.swing > 0.3) || metal.p.swing !== 0) throw new Error('"swing" should swing the metal style');
  if (swungMetal.h.grammar !== 'metal' || swungMetal.h.styles.comp !== 'chug') throw new Error('"swing" should keep metal harmony');
  if (!(jazzMetal.p.doubleKick < metal.p.doubleKick && jazzMetal.p.doubleKick > 0.1)) throw new Error('metal + jazz should land between the two');
  if (metal.r.meter.text !== '4/4' || metal.r.tempo !== 170) throw new Error(`metal should default to 4/4 at 170, got ${metal.r.meter.text} at ${metal.r.tempo}`);
  const odd = run('metal', 'in 7/8, 140 bpm');
  if (odd.r.meter.text !== '7/8' || odd.r.tempo !== 140) throw new Error('a meter or bpm in the description should win');
  if (run('passacaglia', '').r.meter.text !== '3/4' || run('doom', 'waltz').r.meter.text !== '3/4' || run('celtic', 'jig').r.meter.text !== '6/8') throw new Error('style meters not applied');
  if (run('metal', 'in 7/8', { meter: '5/4' }).r.meter.text !== '5/4') throw new Error('an explicit meter setting should win');
  console.log('layering ok: metal+swing swing', swungMetal.p.swing.toFixed(2), '· metal+jazz doubleKick', jazzMetal.p.doubleKick.toFixed(2), '\n');
}
for (const c of cases) {
  const t0 = performance.now();
  const r = generateRhythm(c);
  r.harmony = generateHarmony(c, r);
  const f = finalize(r, c);
  const pe = finalizeHarmony(r, c, f.tpt);
  const channels = { melody: [0, 10, 11], bass: [1, 12], comp: [2, 3, 4, 5, 6, 7, 8, 13, 14, 15] };
  const pitched = PITCHED.map((v) => ({ name: VOICE_LABELS[v], program: r.harmony.programs[v], channels: channels[v], notes: pe.filter((e) => e.voice === v) }));
  const pinned = { barLen: r.meter.barLen, resolution: r.meter.resolution, parts: r.parts.map((p) => ({ len: p.len, lanes: p.lanes, base: p.base, info: p.info })) };
  const state = JSON.parse(JSON.stringify({ app: 'midigen', version: 1, cfg: c, pinned, harmony: harmonySnapshot(r.harmony) }));
  const midiArgs = { events: f.events, tempo: r.playTempo, meter: r.meter, parts: r.parts, lanes: LANES.slice().reverse(), labels: LANE_LABELS, tpt: f.tpt, totalTatums: r.total, pitched };
  const bytes = writeMidi({ ...midiArgs, state });
  const ntrk = validate(bytes);
  writeFileSync(new URL(`../out/${c.name}.mid`, import.meta.url), bytes);
  const combined = writeMidi({ ...midiArgs, combine: true });
  if (validate(combined) !== 1 || combined[9] !== 0) throw new Error('combined export should be a single-track type 0 file');
  for (const [label, b] of [['combined', combined], ['per-lane', bytes]]) {
    const n = countNoteOns(b);
    if (n.drums !== f.events.length || n.pitched !== pe.length) throw new Error(`${label} note count mismatch: ${JSON.stringify(n)}, expected ${f.events.length} drums / ${pe.length} pitched`);
  }
  writeFileSync(new URL(`../out/${c.name}.combined.mid`, import.meta.url), combined);

  // Recall: the embedded state comes back intact, and pitches (including microtones) survive the pitch-bend encoding.
  const back = parseMidi(bytes);
  if (JSON.stringify(back.state) !== JSON.stringify(state)) throw new Error('embedded state did not round-trip');
  // What the app does on Open MIDI: regenerate keeping every lane and voice from the snapshot.
  const rr = generateRhythm(back.state.cfg, { previous: { meter: { barLen: back.state.pinned.barLen, resolution: back.state.pinned.resolution }, parts: back.state.pinned.parts }, keep: LANES });
  rr.harmony = generateHarmony(back.state.cfg, rr, { previous: back.state.harmony, keep: ['progression', ...PITCHED] });
  const sig = (x) => JSON.stringify([x.parts.map((p) => LANES.map((l) => p.lanes[l])), x.harmony.parts.map((p) => [p.prog.chords.map((ch) => ch.sym), p.voices])]);
  if (sig(rr) !== sig(JSON.parse(JSON.stringify(r)))) throw new Error('recall did not reproduce the song exactly');
  const read = midiNotes(back).filter((n) => n.ch !== 9).map((n) => Math.round(n.pitch * 100)).sort((a, b) => a - b);
  const want = pe.map((e) => Math.round(Math.max(0, Math.min(127, e.pitch)) * 100)).sort((a, b) => a - b);
  const off = read.findIndex((x, i) => Math.abs(x - want[i]) > 1);
  if (read.length !== want.length || off >= 0) throw new Error(`pitches changed in MIDI: ${read[off] / 100} vs ${want[off] / 100}`);
  // Foreign import (no state): same notes come back as locked material, in the right voices.
  const imp = importMidi(writeMidi(midiArgs));
  const count = (pin, v) => pin.parts.reduce((n, p) => n + p.voices[v].length, 0);
  for (const v of PITCHED) {
    const want = pe.filter((e) => e.voice === v).length;
    if (count(imp.harmonyPinned, v) !== want) throw new Error(`import put ${count(imp.harmonyPinned, v)} notes in ${v}, expected ${want}`);
  }
  const impPitched = PITCHED.reduce((n, v) => n + count(imp.harmonyPinned, v), 0);
  const impComb = importMidi(combined);
  if (PITCHED.reduce((n, v) => n + count(impComb.harmonyPinned, v), 0) !== pe.length) throw new Error('combined import lost pitched notes');
  const impDrums = imp.pinned.parts.reduce((n, p) => n + LANES.reduce((m, l) => m + p.lanes[l].filter(Boolean).length, 0), 0);
  if (impPitched !== pe.length) throw new Error(`import found ${impPitched} pitched notes, expected ${pe.length}`);
  if (Math.abs(impDrums - f.events.length) > f.events.length * 0.02 + 1) throw new Error(`import found ${impDrums} drum hits, expected ~${f.events.length}`);

  console.log(toAscii(r));
  const h = r.harmony;
  console.log(`  harmony: ${h.keyName} ${h.scaleName} · ${h.tuningName} · ${h.grammar} · ${JSON.stringify(h.styles)}`);
  for (const p of r.parts) {
    console.log(`  [${p.name}] tk=${p.timekeeper} removed=${p.removed}`);
    for (const lane of LANES) console.log(`    ${lane.padEnd(8)} ${p.info[lane].algo} :: ${p.info[lane].detail} (cycle ${p.info[lane].cycle})`);
    const hp = h.parts[p.index];
    for (const v of PITCHED) console.log(`    ${v.padEnd(8)} ${hp.info[v].detail}`);
  }
  if (r.warnings.length || h.warnings.length) console.log('  warnings:', [...r.warnings, ...h.warnings]);
  const vc = (pin) => PITCHED.map((v) => `${v} ${count(pin, v)}`).join(', ');
  console.log(`  -> ${c.name}.mid  ${ntrk} tracks, ${f.events.length} drum + ${pe.length} pitched notes, import: ${imp.summary}; single-track import voices: ${vc(impComb.harmonyPinned)} (generated ${vc({ parts: r.harmony.parts })}), ${(performance.now() - t0).toFixed(0)} ms\n`);
}
