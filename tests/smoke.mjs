// node tests/smoke.mjs  -> generates a few rhythms, prints ASCII, validates and writes .mid files to out/
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateRhythm } from '../src/engine/generate.js';
import { finalize } from '../src/engine/finalize.js';
import { writeMidi } from '../src/io/midi.js';
import { toAscii } from '../src/io/ascii.js';
import { LANES, LANE_LABELS } from '../src/core/drummap.js';

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

// Count note-ons; the writer never uses running status, so events are [delta][status][data...].
function countNoteOns(bytes) {
  let n = 0;
  let off = 14;
  const readVlq = () => { let v = 0, b; do { b = bytes[off++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  while (off < bytes.length) {
    const end = off + 8 + new DataView(bytes.buffer).getUint32(off + 4);
    off += 8;
    while (off < end) {
      readVlq();
      const s = bytes[off++];
      if (s === 0xff) { off++; const len = readVlq(); off += len; } else { if (s === 0x99) n++; off += 2; }
    }
  }
  return n;
}

mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
for (const c of cases) {
  const t0 = performance.now();
  const r = generateRhythm(c);
  const f = finalize(r, c);
  const midiArgs = { events: f.events, tempo: r.playTempo, meter: r.meter, parts: r.parts, lanes: LANES.slice().reverse(), labels: LANE_LABELS, tpt: f.tpt, totalTatums: r.total };
  const bytes = writeMidi(midiArgs);
  const ntrk = validate(bytes);
  writeFileSync(new URL(`../out/${c.name}.mid`, import.meta.url), bytes);
  const combined = writeMidi({ ...midiArgs, combine: true });
  if (validate(combined) !== 1 || combined[9] !== 0) throw new Error('combined export should be a single-track type 0 file');
  if (countNoteOns(combined) !== f.events.length || countNoteOns(bytes) !== f.events.length) throw new Error(`note count mismatch: combined ${countNoteOns(combined)}, per-lane ${countNoteOns(bytes)}, expected ${f.events.length}`);
  writeFileSync(new URL(`../out/${c.name}.combined.mid`, import.meta.url), combined);
  console.log(toAscii(r));
  for (const p of r.parts) {
    console.log(`  [${p.name}] tk=${p.timekeeper} removed=${p.removed}`);
    for (const lane of LANES) console.log(`    ${lane.padEnd(8)} ${p.info[lane].algo} :: ${p.info[lane].detail} (cycle ${p.info[lane].cycle})`);
  }
  if (r.warnings.length) console.log('  warnings:', r.warnings);
  console.log(`  -> ${c.name}.mid  ${ntrk} tracks, ${f.events.length} notes, ${(performance.now() - t0).toFixed(0)} ms\n`);
}
