// Orchestration: parts -> lanes (in dependency order) -> playability.
import { Rng, clamp } from '../core/rng.js';
import { parseMeter } from '../core/meter.js';
import { LANES } from '../core/drummap.js';
import { interpretDescriptors, blendItems, applyRole, ROLES } from '../core/descriptors.js';
import { parseLaneSpec } from '../core/lanespec.js';
import { generateLane } from './lanes.js';
import { planFill, planBlast, planLull } from './fills.js';
import { enforcePlayability } from './playability.js';

export function generateRhythm(cfg, { previous = null, keep = [] } = {}) {
  const meter = parseMeter(cfg.meter, Number(cfg.resolution) || 16);
  const tempo = clamp(Number(cfg.tempo) || 120, 20, 400);
  // The grid is notated in meter.unit; irrational meters play it faster so a 1/den note lasts exactly 4/den quarters.
  const playTempo = tempo * meter.tempoScale;
  const tatumSec = (60 / playTempo) * (4 / meter.resolution);
  const warnings = [];
  const song = interpretDescriptors(cfg.descriptors);
  const unknownMsg = (u) => (u.word.includes('=') ? `Unknown parameter "${u.word}"` : `Didn't recognize "${u.word}"`);
  const overrides = Object.fromEntries(Object.entries(cfg.overrides || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => [k, Number(v)]));
  const root = new Rng(Number(cfg.seed) >>> 0);

  const specs = {};
  for (const lane of LANES) {
    specs[lane] = parseLaneSpec(cfg.lanes?.[lane]?.spec, lane);
    specs[lane].warnings.forEach((w) => warnings.push(`${lane}: ${w}`));
    const s = specs[lane];
    if (s.hitsPerBar && !s.algo) { s.algo = 'euclid'; s.euclid = { k: Math.min(s.hitsPerBar, meter.barLen), n: meter.barLen }; }
  }
  const blastForced = Object.values(specs).some((s) => s.algo === 'blast');
  const typedLanes = LANES.filter((l) => specs[l].raw.trim() && !/^\s*auto\s*$/i.test(specs[l].raw));

  const global = blendItems(song.items, { ...song.overrides, ...overrides });
  global.tempoHint = song.tempo ?? global.tempoHint;
  warnings.push(...song.unknown.map(unknownMsg));
  let baseKeeper = root.fork('timekeeper').chance(global.params.rideBias) ? 'ride' : 'hihat';
  if (specs.hihat.off && !specs.ride.off) baseKeeper = 'ride';
  if (specs.ride.off && !specs.hihat.off) baseKeeper = 'hihat';
  const otherKeeper = (k) => (k === 'hihat' ? 'ride' : 'hihat');

  const canReuse = previous && previous.meter.barLen === meter.barLen && previous.meter.resolution === meter.resolution;
  const parts = [];
  let start = 0;
  let motif = null;

  (cfg.parts || []).forEach((pc, pi) => {
    const bars = clamp(Math.round(Number(pc.bars)) || 1, 1, 64);
    const len = bars * meter.barLen;
    const role = ROLES.includes(pc.role) ? pc.role : 'groove';
    // Part descriptions weigh more than the song description so variations stand out.
    const partDesc = interpretDescriptors(pc.descriptors, 1.5);
    partDesc.unknown.forEach((u) => warnings.push(`${pc.name}: ${unknownMsg(u)}`));
    let params = blendItems([...song.items, ...partDesc.items], { ...song.overrides, ...partDesc.overrides, ...overrides }).params;
    if (pc.tension !== null && pc.tension !== undefined && pc.tension !== '') params.tension = clamp(Number(pc.tension));
    if (blastForced) params.blast = Math.max(params.blast, 0.9);
    if (specs.kick.doubleKick) params.doubleKick = Math.max(params.doubleKick, 1);
    params = applyRole(params, role);

    const timekeeper = params.flipTimekeeper && !specs.hihat.off && !specs.ride.off ? otherKeeper(baseKeeper) : baseKeeper;
    const prng = root.fork(`part:${pi}`);
    const part = {
      index: pi, name: pc.name || `Part ${pi + 1}`, role, bars, len, start, params, timekeeper,
      lanes: {}, base: {}, info: {},
    };
    part.fill = planFill(part, meter, params, prng.fork('fill'), tatumSec);
    part.blast = planBlast(part, meter, params, prng.fork('blast'), tatumSec);
    part.lull = planLull(part, meter, params, prng.fork('lull'), !!part.fill);

    const prev = canReuse ? previous.parts[pi] : null;
    const kept = [];
    for (const lane of LANES) {
      if (keep.includes(lane) && prev && prev.len === len) {
        part.lanes[lane] = prev.lanes[lane].map((h) => h && { ...h });
        part.base[lane] = prev.base[lane];
        part.info[lane] = prev.info[lane];
        kept.push(lane);
      }
    }

    const order = ['kick', 'snare', timekeeper, otherKeeper(timekeeper), 'toms', 'cymbals', 'crash'];
    for (const lane of order) {
      if (part.lanes[lane]) continue;
      const r = generateLane(lane, {
        meter, part, params, timekeeper, tatumSec, spec: specs[lane],
        rng: root.fork(`${pi}:${lane}:${cfg.lanes?.[lane]?.salt || 0}`),
        lanes: part.lanes, motif, useMotif: role === 'variation' || role === 'fill',
        fill: part.fill, blast: part.blast, lull: part.lull, prevFill: pi > 0 && !!parts[pi - 1].fill,
      });
      part.lanes[lane] = r.hits;
      part.base[lane] = r.base;
      part.info[lane] = r.info;
    }
    part.removed = enforcePlayability(part, tatumSec, params, kept, typedLanes);
    if (role === 'groove' || !motif) motif = part;
    parts.push(part);
    start += len;
  });

  // The rhythm loops: a fill at the end resolves onto a crash at the top.
  const first = parts[0];
  if (parts.length > 1 && parts[parts.length - 1].fill && first && !keep.includes('crash') && !specs.crash.off && !first.lanes.crash[0]) {
    first.lanes.crash[0] = { s: 1, art: 'c1' };
    enforcePlayability(first, tatumSec, first.params, [...keep, 'crash']);
  }

  return { meter, tempo, playTempo, tatumSec, parts, total: start, warnings, tempoHint: global.tempoHint, timekeeper: baseKeeper, seed: cfg.seed };
}
