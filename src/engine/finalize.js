// Turns lane hits into timed, humanized MIDI events and computes the analysis shown in the UI.
import { Rng, hashString, clamp } from '../core/rng.js';
import { barWeight } from '../core/meter.js';
import { LANES, DEFAULT_MAP, DEFAULT_ART, BASE_VELOCITY } from '../core/drummap.js';
import { parseLaneSpec } from '../core/lanespec.js';
import { interferenceField, beatFrequency } from '../algorithms/interference.js';
import { syncopationIndex, coincidence } from './score.js';

export const TPQ = 480;
const TIGHT = { kick: 0.5, snare: 0.7, hihat: 1.2, ride: 1, toms: 0.9, crash: 0.8, cymbals: 1 };

export function finalize(result, cfg) {
  const { meter, parts, total } = result;
  const map = { ...DEFAULT_MAP, ...(cfg.drumMap || {}) };
  const tpt = (TPQ * 4) / meter.resolution;
  const { barLen } = meter;

  const lanesFull = {};
  for (const lane of LANES) {
    const arr = new Array(total).fill(null);
    for (const p of parts) for (let t = 0; t < p.len; t++) arr[p.start + t] = p.lanes[lane][t];
    lanesFull[lane] = arr;
  }

  const weightArr = new Array(total);
  for (const p of parts) {
    for (let t = 0; t < p.len; t++) {
      const inBar = t % barLen;
      weightArr[p.start + t] = meter.weights[inBar] * (inBar === 0 ? 0.6 + 0.4 * barWeight(Math.floor(t / barLen), p.bars) : 1);
    }
  }
  const field = interferenceField(lanesFull, (t) => weightArr[t], total);

  const events = [];
  for (const p of parts) {
    const params = p.params;
    for (const lane of LANES) {
      if (cfg.lanes?.[lane]?.muted) continue;
      const laneSpec = parseLaneSpec(cfg.lanes?.[lane]?.spec, lane);
      const fixedVel = laneSpec.velocity;
      // feet/hands: 0 -> x0.6, 0.5 -> x1 (neutral), 1 -> x1.3
      const limb = lane === 'kick' ? params.feet ?? 0.5 : params.hands ?? 0.5;
      const limbGain = limb <= 0.5 ? 0.6 + 0.8 * limb : 1 + 0.6 * (limb - 0.5);
      const gain = (laneSpec.gain ?? 1) * limbGain;
      const hits = p.lanes[lane];
      for (let t = 0; t < p.len; t++) {
        const h = hits[t];
        if (!h) continue;
        const T = p.start + t;
        const g = new Rng(hashString(`${cfg.seed}:${lane}:${T}`));
        const w = weightArr[T];
        let v;
        if (h.art === 'ghost') v = 24 + 22 * h.s + g.gauss() * 3;
        else if (h.art === 'pedal') v = 55 + 20 * h.s;
        else {
          const base = fixedVel || BASE_VELOCITY[lane];
          v = base * (0.55 + 0.45 * h.s) * (1 - params.dynamics * 0.22 * (1 - w)) + params.dynamics * 14 * field[T] - 4;
        }
        v *= gain;
        v += g.gauss() * params.humanize * 6;

        let tick = T * tpt;
        if (params.swing > 0 && meter.resolution !== 24) {
          const unit = params.density > 0.65 ? meter.resolution / 16 : meter.resolution / 8;
          if (unit >= 1 && t % (2 * unit) === unit) tick += (params.swing * unit * tpt) / 3;
        }
        tick += g.gauss() * params.humanize * tpt * 0.1 * TIGHT[lane];

        const note = map[lane]?.[h.art] ?? map[lane]?.[DEFAULT_ART[lane]];
        if (note == null) continue;
        events.push({ lane, t: T, tick: Math.max(0, Math.round(tick)), note, vel: clamp(Math.round(v), 1, 127), art: h.art });
      }
    }
  }
  events.sort((a, b) => a.tick - b.tick);

  return { events, field, lanesFull, weightArr, tpt, analysis: analyze(result, lanesFull, weightArr) };
}

function analyze(result, lanesFull, weightArr) {
  const { meter, parts, tatumSec, total } = result;
  const lanes = {};
  for (const lane of LANES) {
    const arr = lanesFull[lane];
    const n = arr.filter(Boolean).length;
    lanes[lane] = {
      hits: n,
      perBar: n / (total / meter.barLen),
      syncopation: syncopationIndex(arr, (t) => weightArr[t]),
    };
  }

  const alignment = {};
  for (const a of LANES) {
    alignment[a] = {};
    for (const b of LANES) alignment[a][b] = a === b ? null : coincidence(lanesFull[a], lanesFull[b]);
  }

  const oscillators = [];
  for (const p of parts) {
    for (const lane of LANES) {
      const info = p.info[lane];
      if (!info || !info.cycle || info.cycle === meter.barLen || info.cycle >= p.len) continue;
      oscillators.push({ part: p.name, lane, cycle: info.cycle, ...beatFrequency(info.cycle, meter.barLen, tatumSec) });
    }
  }

  const core = ['kick', 'snare', 'toms', 'cymbals'];
  const partStats = parts.map((p) => {
    const vals = [];
    for (let i = 0; i < core.length; i++) {
      for (let j = i + 1; j < core.length; j++) {
        const c = coincidence(p.lanes[core[i]], p.lanes[core[j]]);
        if (c !== null) vals.push(c);
      }
    }
    const align = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { name: p.name, role: p.role, targetTension: p.params.tension, alignment: align, timekeeper: p.timekeeper, removed: p.removed, fill: p.fill?.trace || null, blast: p.blast ? `${p.blast.type} in ${p.blast.bars.size} bar(s)` : null };
  });

  return { lanes, alignment, oscillators, parts: partStats };
}
