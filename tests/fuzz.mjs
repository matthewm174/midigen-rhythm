// node tests/fuzz.mjs  -> many meters/descriptors/roles/lane specs; checks events, lane re-roll isolation, MIDI writing.
import { generateRhythm } from '../src/engine/generate.js';
import { finalize } from '../src/engine/finalize.js';
import { writeMidi } from '../src/io/midi.js';
import { DESCRIPTORS, ROLES } from '../src/core/descriptors.js';
import { LANES, LANE_LABELS } from '../src/core/drummap.js';

const meters = [['4/4', 16], ['7/8 (2+2+3)', 16], ['12/8', 24], ['5/4', 32], ['11/16', 16], ['3/4', 24], ['9/8 (2+2+2+3)', 16], ['6/8', 32], ['13/8', 16], ['2/2', 16],
  ['9/17', 16], ['5/12', 24], ['7/10 (3+2+2)', 32], ['4/3', 16], ['3.5/4', 16], ['11/32', 16], ['13/24', 24]];
const words = Object.keys(DESCRIPTORS);
const specs = ['', 'ca 30', 'crystal', 'lsystem', 'evolve', 'packing 2 3 5', 'euclid 7/12', 'cycle 5/16', 'poly 5:4', 'on 1 2& 4a', 'x..x.X.g', 'group 3+3+2', 'blast', 'off', 'grid 1/16, open &, accent 1',
  'double bass, loud', '12 fast double', 'gallop', 'simple backbeat with ghost notes', 'busy offbeat', 'very soft, sparse', 'follow the kick', 'on the beat, bell', '8', 'triplets', 'no ghosts, syncopated'];
const sentences = ['fast metal with VERY heavy double bass, no ghosts, 180 bpm', 'slightly swung jazz, soft hands, heavy feet!', 'not busy, less syncopated funk', 'four on the floor house'];
const arts = (lane) => JSON.stringify(lane.map((h) => h && h.art));

let ok = 0, fails = 0, notes = 0;
const t0 = performance.now();
for (let s = 0; s < 400; s++) {
  const [meter, resolution] = meters[s % meters.length];
  const descriptors = s % 5 === 4 ? sentences[s % sentences.length] : [words[s % words.length], words[(s * 7 + 3) % words.length]].join(',');
  const lanes = Object.fromEntries(LANES.map((l, i) => [l, { spec: (s + i) % 3 === 0 ? specs[(s + i) % specs.length] : '' }]));
  const parts = ROLES.map((role, i) => ({ name: role, bars: 1 + ((s + i) % 4), role, descriptors: i === 1 && s % 2 ? 'busier, loud hands' : '' }));
  const cfg = { seed: s, tempo: 60 + ((s * 37) % 260), meter, resolution, descriptors, parts, lanes };
  try {
    const r = generateRhythm(cfg);
    const f = finalize(r, cfg);
    for (const e of f.events) {
      if (!(e.vel >= 1 && e.vel <= 127 && e.tick >= 0 && Number.isInteger(e.note))) throw new Error(`bad event ${JSON.stringify(e)}`);
    }
    const keep = LANES.filter((l) => l !== 'toms');
    const r2 = generateRhythm({ ...cfg, lanes: { ...lanes, toms: { spec: '', salt: 1 } } }, { previous: r, keep });
    for (const p of r2.parts) {
      for (const l of keep) if (arts(p.lanes[l]) !== arts(r.parts[p.index].lanes[l])) throw new Error(`kept lane changed: ${l}`);
    }
    writeMidi({ events: f.events, tempo: r.playTempo, meter: r.meter, parts: r.parts, lanes: LANES, labels: LANE_LABELS, tpt: f.tpt, totalTatums: r.total });
    writeMidi({ events: f.events, tempo: r.playTempo, meter: r.meter, parts: r.parts, lanes: LANES, labels: LANE_LABELS, tpt: f.tpt, totalTatums: r.total, combine: true });
    // A bar must last exactly num/den whole notes at the requested quarter-note tempo.
    const barSec = r.meter.barLen * r.tatumSec, want = (r.meter.num * 4 / r.meter.den) * (60 / r.tempo);
    if (Math.abs(barSec - want) > 1e-9) throw new Error(`bar lasts ${barSec}s, expected ${want}s`);
    notes += f.events.length;
    ok++;
  } catch (e) {
    fails++;
    if (fails < 6) console.log('FAIL', JSON.stringify({ meter, resolution, descriptors, seed: s }), e.stack.split('\n').slice(0, 3).join(' | '));
  }
}
console.log(`ok ${ok}, fail ${fails}, avg notes ${(notes / Math.max(1, ok)).toFixed(1)}, ${(performance.now() - t0).toFixed(0)} ms`);
process.exitCode = fails ? 1 : 0;
