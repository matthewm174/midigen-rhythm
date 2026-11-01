// Lane generators. Each lane is generated in context of the lanes generated before it.
import { clamp } from '../core/rng.js';
import { resolvePositions } from '../core/meter.js';
import { TOM_VOICES, DEFAULT_ART } from '../core/drummap.js';
import { bjorklund, rotate, TIMELINES } from '../algorithms/euclid.js';
import { lsysRhythm, voiceMelody } from '../algorithms/lsystem.js';
import { caBars, pickRule, RULE_CHARACTER } from '../algorithms/ca.js';
import { sturmian, nearestIrrational, fibonacciWord, nucleate } from '../algorithms/crystal.js';
import { compositions, groupsToPattern, restartGroups, tile, TILE_MOTIFS } from '../algorithms/packing.js';
import { evolve } from '../algorithms/genetic.js';
import { chooseCycle, choosePoly, lcm } from '../algorithms/interference.js';
import { makeFitness, foldOccupancy, unionOccupancy, cycleWeights } from './score.js';
import { applyBlast, applyFill, applyBuild, applyLull } from './fills.js';

const empty = (len) => new Array(len).fill(null);
const hit = (s, art) => ({ s: clamp(s, 0.05, 1), art });
const ALGOS = ['euclid', 'packing', 'lsystem', 'ca', 'crystal', 'genetic'];

const scaleDensity = (d, meter) => clamp((d * 16) / meter.resolution, 0.02, 0.95);
const gapTatums = (sec, tatumSec) => Math.max(1, Math.ceil(sec / tatumSec - 1e-6));
const hasAlgo = (spec) => spec.algo && spec.algo !== 'blast';

function pickAlgo(ctx, suit = {}) {
  return ctx.rng.weighted(ALGOS, (a) => (ctx.params.algos[a] || 0) * (suit[a] ?? 1));
}

function specCycle(spec, meter) {
  if (!spec.cycle || !(spec.cycle.n > 0)) return null;
  return spec.cycle.unit ? Math.max(1, Math.round((spec.cycle.n * meter.resolution) / spec.cycle.unit)) : spec.cycle.n;
}

function buildRefs(ctx, cycle, defaults) {
  const rels = ctx.spec.relations.length ? ctx.spec.relations : defaults;
  return rels
    .filter((r) => r.lane && r.lane !== ctx.lane && ctx.lanes[r.lane])
    .map((r) => ({ type: r.type, occ: foldOccupancy(ctx.lanes[r.lane], cycle), w: r.w ?? 1 }));
}

function toStrength(p, cw) {
  return p.map((v, i) => (v ? clamp(0.5 + 0.3 * cw[i] + 0.2 * Math.min(1, v), 0.3, 1) : 0));
}

function select(cands, fitness, rng) {
  const top = cands.map((c) => ({ ...c, f: fitness(c.p) })).sort((a, b) => b.f - a.f).slice(0, 3);
  const w = [0.6, 0.25, 0.15];
  return rng.weighted(top.map((c, i) => ({ c, w: w[i] })), (o) => o.w).c;
}

function expand(pattern, step) {
  const out = new Array(pattern.length * step).fill(0);
  pattern.forEach((v, i) => (out[i * step] = v));
  return out;
}

function propose(algo, cycle, ctx, density, top) {
  const { rng, params, meter, spec } = ctx;
  const out = [];
  switch (algo) {
    case 'euclid': {
      const k0 = Math.round(density * cycle);
      for (const k of new Set([k0 - 1, k0, k0 + 1])) {
        if (k < 1 || k >= cycle) continue;
        const base = bjorklund(k, cycle);
        for (let r = 0; r < cycle; r++) out.push({ p: rotate(base, r), detail: `E(${k},${cycle}) rot ${r}` });
      }
      break;
    }
    case 'packing': {
      const parts = spec.packParts || [2, 3, ...(density < 0.25 ? [4] : []), ...(params.tension > 0.7 ? [5] : [])];
      const prefer = { 2: 0.6 + density, 3: 0.6 + params.syncopation * 2, 4: 1 - density, 5: params.tension };
      for (let i = 0; i < 24; i++) {
        const c = compositions(cycle, parts, rng, prefer);
        if (!c) break;
        const p = groupsToPattern(c, cycle);
        if (density > 0.45) {
          let s = 0;
          for (const g of c) { if (g >= 3 && rng.chance(density - 0.35)) p[s + g - 1] = 0.7; s += g; }
        }
        out.push({ p, detail: `groups ${c.join('+')}` });
      }
      break;
    }
    case 'lsystem': {
      for (let i = 0; i < 16; i++) {
        const { pattern, trace } = lsysRhythm(cycle, rng, {
          density: clamp(density * 1.8 + 0.1, 0.05, 0.95), syncopation: params.syncopation, top,
        });
        out.push({ p: pattern, detail: `L-system ${trace}` });
      }
      break;
    }
    case 'crystal': {
      const irr = nearestIrrational(density);
      for (let i = 0; i < 10; i++) {
        const rho = i / 10;
        out.push({ p: sturmian(cycle, irr.value, rho), detail: `quasicrystal (Sturmian α=${irr.name}, ρ=${rho.toFixed(1)})` });
      }
      for (let off = 0; off < 6; off++) {
        out.push({ p: fibonacciWord(cycle, density < 0.5 ? 'B' : 'A', off), detail: `Fibonacci word (A→AB, B→A) +${off}` });
      }
      for (let i = 0; i < 8; i++) {
        out.push({
          p: nucleate(cycle, rng, { density, weights: cycleWeights(cycle, meter), lattices: [meter.beatLens[0], 3, 5], mirrorSpan: meter.barLen }),
          detail: 'crystal nucleation + lattice growth',
        });
      }
      break;
    }
  }
  if (!out.length) out.push({ p: bjorklund(clamp(Math.round(density * cycle), 1, cycle), cycle), detail: 'Euclid fallback' });
  return out;
}

function varyRegion(out, from, to, rng, artFor, protect = 0.93) {
  if (to - from < 2) return;
  const hits = [], holes = [];
  for (let t = from; t < to; t++) (out[t] ? hits : holes).push(t);
  const op = rng.int(3);
  if (op === 0 && hits.length) {
    const h = rng.pick(hits);
    const d = h + (rng.chance(0.5) ? 1 : -1);
    if (out[h].s < protect && d >= from && d < to && !out[d]) { out[d] = out[h]; out[h] = null; }
  } else if (op === 1 && holes.length) {
    const t = rng.pick(holes);
    out[t] = hit(0.7, artFor(t));
  } else if (hits.length) {
    const h = rng.pick(hits);
    if (out[h].s < protect) out[h] = null;
  }
}

function layout(cell, ctx, { cycle, algo, rule = null, art, artAt = null, vary = true }) {
  const { part, meter, params, rng } = ctx;
  const { len, bars } = part;
  const barLen = meter.barLen;
  // Over-beat rule: polymetric lanes realign at phrase boundaries unless tension is high.
  const phraseLen = algo === 'crystal' || params.tension > 0.65 || cycle === barLen ? len : Math.min(len, 4 * barLen);
  let seq = null;
  if (algo === 'ca') {
    const reps = Math.ceil(len / cycle);
    seq = caBars(cell, reps, rule, clamp(params.mutation, 0.12, 0.9), rng, cell.filter(Boolean).length / cycle).flat();
  }
  const out = empty(len);
  for (let t = 0; t < len; t++) {
    const i = (t % phraseLen) % cycle;
    const v = seq ? seq[t] : cell[i];
    if (v > 0) out[t] = hit(v, artAt ? artAt(t, seq ? t % cycle : i) : art);
  }
  if (vary && algo !== 'ca') {
    const lb = meter.beatStarts.length - 1;
    for (let b = 0; b < bars; b++) {
      if ((b % 4 === 3 || (b === bars - 1 && bars > 1)) && rng.chance(params.mutation * 0.9)) {
        varyRegion(out, b * barLen + meter.beatStarts[lb], (b + 1) * barLen, rng, (t) => (artAt ? artAt(t, t % cycle) : art));
      }
    }
  }
  return out;
}

// Spec clauses that fully determine a pattern.
function gallopCell(meter) {
  const cell = new Array(meter.barLen).fill(0);
  meter.beatStarts.forEach((bs, j) => {
    const L = meter.beatLens[j];
    cell[bs] = 1;
    if (L >= 4) { cell[bs + Math.round(L / 2)] = 0.75; cell[bs + Math.round((3 * L) / 4)] = 0.8; }
    else if (L >= 2) cell[bs + L - 1] = 0.75;
  });
  return cell;
}

function deterministic(ctx, art) {
  const { spec, meter } = ctx;
  const { barLen, resolution, weights: W } = meter;
  switch (spec.algo) {
    case 'grid': {
      const step = Math.max(1, Math.round((resolution * spec.grid.num) / spec.grid.den));
      const cell = new Array(barLen).fill(0);
      for (let t = 0; t < barLen; t += step) cell[t] = 0.6 + 0.4 * W[t];
      return { cell, cycle: barLen, detail: `grid ${spec.grid.num}/${spec.grid.den}` };
    }
    case 'on': {
      const cell = new Array(barLen).fill(0);
      for (const p of resolvePositions(spec.only, meter)) cell[p] = 0.7 + 0.3 * W[p];
      return { cell, cycle: barLen, detail: `on ${spec.only.join(' ')}` };
    }
    case 'literal': {
      const chars = [...spec.pattern];
      const cell = chars.map((c) => ({ x: 0.8, X: 1, g: 0.3, o: 0.8, O: 1 })[c] || 0);
      const arts = chars.map((c) => (c === 'g' ? 'ghost' : c === 'o' || c === 'O' ? 'open' : null));
      return { cell, cycle: chars.length, detail: `literal ${spec.pattern}`, artAt: (t, i) => arts[i] || art };
    }
    case 'gallop': return { cell: gallopCell(meter), cycle: barLen, detail: 'gallop (x.xx on every beat)' };
    case 'group': {
      const g = spec.group;
      const sizes = g.sizes.map((s) => Math.max(1, Math.round((s * resolution) / g.unit)));
      if (g.restart === 'cycle') {
        const cyc = sizes.reduce((a, b) => a + b, 0);
        return { cell: groupsToPattern(sizes, cyc), cycle: cyc, detail: `packing ${g.sizes.join('+')} (cycle ${cyc})` };
      }
      const restarts = g.restart === 'beat' ? meter.beatStarts : [0];
      return { cell: restartGroups(sizes[0], barLen, restarts), cycle: barLen, detail: `groups of ${g.sizes[0]}/${g.unit} from each ${g.restart === 'beat' ? 'beat' : '1'}` };
    }
    case 'euclid': {
      if (spec.rotate == null) return null;
      const { k, n } = spec.euclid;
      return { cell: rotate(bjorklund(k, n), spec.rotate), cycle: n, detail: `E(${k},${n}) rot ${spec.rotate}` };
    }
    case 'poly': {
      const { k, beats } = spec.poly;
      const nB = meter.beatStarts.length;
      const span = beats < nB ? meter.beatStarts[beats] : Math.round((beats * barLen) / nB);
      const cell = new Array(span).fill(0);
      for (let j = 0; j < k; j++) cell[Math.round((j * span) / k) % span] = j === 0 ? 1 : 0.8;
      return { cell, cycle: span, detail: `${k} over ${beats} beats` };
    }
  }
  return null;
}

function generic(ctx, o) {
  const { spec, meter, params, part, rng, info } = ctx;
  const art = spec.art || o.art;
  const det = deterministic(ctx, art);
  if (det) {
    info.algo = 'spec'; info.detail = det.detail; info.cycle = det.cycle;
    return layout(det.cell, ctx, { cycle: det.cycle, algo: 'spec', art, artAt: det.artAt, vary: false });
  }
  const algo = o.algo || (hasAlgo(spec) ? spec.algo : spec.simple ? 'euclid' : pickAlgo(ctx, o.suit));
  let cycle = meter.barLen;
  const sc = specCycle(spec, meter);
  if (spec.algo === 'euclid') cycle = Math.max(2, spec.euclid.n);
  else if (sc) cycle = sc;
  else if (algo === 'crystal') cycle = part.len;
  else if (spec.simple) cycle = meter.barLen;
  else if (o.polymeter && rng.chance(params.polymeter * o.polymeter)) cycle = chooseCycle(meter.barLen, params.tension, rng);
  else if (o.polymeter && params.phasing > 0.3 && rng.chance(params.phasing * 0.5)) cycle = chooseCycle(meter.barLen, params.tension, rng, { phasing: true });
  cycle = clamp(cycle, 2, part.len);

  const density = clamp((spec.density ?? o.density) * (spec.densityScale ?? 1), 0.02, 0.95);
  const syncopation = spec.syncopation ?? o.syncopation;
  const cw = cycleWeights(cycle, meter);
  const free = spec.relations.some((r) => r.type === 'free');
  const refs = free ? [] : buildRefs(ctx, cycle, o.relations || []);
  const all = free ? null : unionOccupancy(ctx.lanes, cycle, ['crash', ctx.lane]);
  const anchors = (o.anchors || []).filter((a) => a < cycle);
  const fitness = makeFitness({
    len: cycle, weights: cw, density, syncopation, refs, all, tension: params.tension,
    minGap: gapTatums(o.minGapSec || 0.05, ctx.tatumSec), anchors, anchorWeight: o.anchorWeight || 0,
  });
  const top = cycle === meter.barLen ? meter.beatStarts.map((s, i) => [s, meter.beatLens[i]]) : null;

  let pick;
  if (spec.algo === 'euclid') {
    const base = bjorklund(spec.euclid.k, cycle);
    pick = select(base.map((_, r) => ({ p: rotate(base, r), detail: `E(${spec.euclid.k},${cycle}) rot ${r} (best fit)` })), fitness, rng);
  } else if (algo === 'genetic') {
    const seeds = ['euclid', 'lsystem', 'packing']
      .flatMap((a) => propose(a, cycle, ctx, density, top))
      .map((c) => ({ ...c, f: fitness(c.p) }))
      .sort((a, b) => b.f - a.f)
      .slice(0, 12)
      .map((c) => c.p);
    const best = evolve({ len: cycle, fitness, rng, seeds, density, segment: meter.beatLens[0], protect: o.anchorWeight > 1.5 ? anchors : [] });
    pick = { p: best.ind, detail: `GA over Euclid/L-system/packing seeds, fitness ${best.f.toFixed(2)}` };
  } else {
    pick = select(propose(algo === 'ca' ? rng.pick(['euclid', 'lsystem']) : algo, cycle, ctx, density, top), fitness, rng);
  }

  const cell = toStrength(pick.p, cw);
  const rule = algo === 'ca' ? spec.rule ?? pickRule(params, rng) : null;
  info.algo = algo;
  info.detail = algo === 'ca' ? `rule ${rule} (${RULE_CHARACTER[rule] || 'custom'}), seeded by ${pick.detail}` : pick.detail;
  info.cycle = cycle;
  info.fitness = fitness(pick.p);
  const artAt = o.artFrom ? o.artFrom(cell, cw, cycle) : null;
  return layout(cell, ctx, { cycle, algo, rule, art, artAt });
}

function backbeatPositions(meter, halftime) {
  const nB = meter.beatStarts.length;
  if (nB < 2) return [Math.floor(meter.barLen / 2)];
  if (halftime) return [meter.beatStarts[Math.floor(nB / 2)]];
  return meter.beatStarts.filter((_, i) => i % 2 === 1);
}

// Kick feels driven by the song description rather than a lane spec.
function steadyKick(ctx) {
  const { params, meter, info, tatumSec, spec } = ctx;
  if (hasAlgo(spec) || spec.simple || params.halftime > 0.5) return null;
  const { barLen, resolution } = meter;
  let cell = null;
  if (params.doubleKick >= 0.75) {
    let step = Math.max(1, Math.round(resolution / 16));
    while (step * tatumSec < 0.055) step *= 2;
    cell = new Array(barLen).fill(0);
    for (let t = 0; t < barLen; t += step) cell[t] = meter.beatStarts.includes(t) ? 0.95 : 0.8;
    info.algo = 'double bass';
    info.detail = `constant 1/${Math.round(resolution / step)} notes`;
  } else if (params.gallop >= 0.6) {
    cell = gallopCell(meter);
    info.algo = 'gallop';
    info.detail = 'x.xx on every beat';
  } else if (params.fourFloor >= 0.6) {
    cell = new Array(barLen).fill(0);
    meter.beatStarts.forEach((s) => (cell[s] = 1));
    info.algo = 'four on the floor';
    info.detail = 'kick on every beat';
  }
  if (!cell) return null;
  info.cycle = barLen;
  return layout(cell, ctx, { cycle: barLen, algo: 'steady', art: spec.art || 'kick', vary: false });
}

function genKick(ctx) {
  const { params, meter, rng, part, info, spec } = ctx;
  const steady = steadyKick(ctx);
  if (steady) return steady;
  const density = scaleDensity((0.12 + 0.3 * params.density) * (params.halftime > 0.5 ? 0.75 : 1), meter);
  const out = generic(ctx, {
    art: 'kick', density, syncopation: params.syncopation * 0.85,
    relations: ctx.lanes.snare ? [{ type: 'interlock', lane: 'snare' }] : [],
    anchors: [0], anchorWeight: 0.5 + 2 * params.downbeat,
    minGapSec: params.doubleKick > 0.5 ? 0.05 : 0.1, polymeter: 0.5,
    suit: { packing: 1.2, lsystem: 0.8, ca: 0.8, crystal: 0.7 },
  });
  if (params.doubleKick > 0.5 && !hasAlgo(spec) && !spec.simple) {
    const step = gapTatums(0.055, ctx.tatumSec);
    let bursts = 0;
    for (let b = 0; b < part.bars; b++) {
      meter.beatStarts.forEach((bs, j) => {
        if (!rng.chance((params.doubleKick - 0.4) * 0.35 * params.density)) return;
        const s0 = b * meter.barLen + bs;
        for (let t = s0; t < s0 + meter.beatLens[j]; t += step) if (!out[t]) out[t] = hit(0.72, 'kick');
        bursts++;
      });
    }
    if (bursts) info.detail += ` + ${bursts} double-kick bursts`;
  }
  return out;
}

// Funeral-march snare: a measured crescendo roll swelling into an accented stroke.
function addRolls(out, ctx) {
  const { params, meter, part, tatumSec, info } = ctx;
  const rng = ctx.rng.fork('rolls');
  const { barLen, beatLens } = meter;
  let step = 1;
  while (step * tatumSec < 0.06) step *= 2;
  let n = 0;
  for (let b = 0; b < part.bars; b++) {
    if (!rng.chance(0.2 + 0.6 * params.march)) continue;
    const targets = [];
    for (let t = b * barLen; t < (b + 1) * barLen; t++) if (out[t]?.s >= 0.9) targets.push(t);
    if (!targets.length) continue;
    const target = rng.pick(targets);
    const span = beatLens[0] * (rng.chance(params.march * 0.5) ? 2 : 1);
    const start = Math.max(0, target - span);
    if (target - start < 2 * step) continue;
    for (let t = target - step; t >= start; t -= step) {
      if (out[t]) continue;
      const p = (t - start) / (target - start);
      out[t] = { ...hit(0.3 + 0.5 * p, 'center'), roll: true };
    }
    out[target] = { ...out[target], s: 1 };
    n++;
  }
  if (n) info.detail = `${info.detail ? `${info.detail} ` : ''}+ ${n} march roll${n > 1 ? 's' : ''}`;
}

function genSnare(ctx) {
  const { spec, params, meter, rng, info } = ctx;
  let out;
  if (hasAlgo(spec)) {
    out = generic(ctx, {
      art: 'center', density: scaleDensity(0.1 + 0.15 * params.density, meter), syncopation: params.syncopation,
      relations: [{ type: 'interlock', lane: 'kick' }], minGapSec: 0.05, polymeter: 0.3,
    });
  } else if (!spec.backbeat && !spec.simple && params.tomUse > 0.7 && rng.chance(params.sidestick)) {
    out = generic(ctx, {
      art: rng.pick(['side', 'rim']), density: scaleDensity(0.1 + 0.12 * params.density, meter), syncopation: params.syncopation,
      relations: [{ type: 'interlock', lane: 'kick' }, { type: 'interlock', lane: 'toms' }],
      minGapSec: 0.08, polymeter: 0.4, suit: { euclid: 2, lsystem: 0.5, ca: 0.3 },
    });
    info.algo = `rim timeline · ${info.algo}`;
  } else {
    const halftime = spec.halftime || params.halftime > 0.5;
    let base = new Array(meter.barLen).fill(0);
    backbeatPositions(meter, halftime).forEach((p) => (base[p] = 1));
    info.algo = halftime ? 'half-time backbeat' : 'backbeat';
    const sync = spec.syncopation ?? params.syncopation;
    if (!spec.backbeat && sync > 0.5 && rng.chance(sync)) {
      const d = (base.filter(Boolean).length + 1) / meter.barLen;
      const fitness = makeFitness({
        len: meter.barLen, weights: meter.weights, density: d, syncopation: sync * 0.6,
        refs: ctx.lanes.kick ? [{ type: 'interlock', occ: foldOccupancy(ctx.lanes.kick, meter.barLen) }] : [],
        prior: base, priorWeight: 3, minGap: 2,
      });
      base = evolve({ len: meter.barLen, fitness, rng, seeds: [base], density: d, segment: meter.beatLens[0] }).ind;
      info.algo = 'genetic'; info.detail = 'displaced backbeat (evolved against the kick)';
    }
    out = layout(base.map((v) => (v ? 0.95 : 0)), ctx, { cycle: meter.barLen, algo: 'backbeat', art: spec.art || 'center' });
    if (params.march > 0.3 && !spec.backbeat && !spec.simple) addRolls(out, ctx);
  }

  const ghostAmt = spec.ghost ?? clamp(params.ghost * (spec.densityScale ?? 1));
  if (ghostAmt > 0.02) {
    const g = meter.resolution === 24 ? 2 : meter.resolution / 16;
    const kick = ctx.lanes.kick || [];
    let n = 0;
    for (let t = 0; t < out.length; t++) {
      if (out[t] || kick[t] || t % g) continue;
      if (meter.weights[t % meter.barLen] >= 0.5) continue;
      const near = out[t - g]?.s >= 0.9 || out[t + g]?.s >= 0.9;
      if (rng.chance(ghostAmt * (near ? 0.5 : 0.18))) { out[t] = hit(0.3, 'ghost'); n++; }
    }
    if (n) info.detail = `${info.detail ? `${info.detail} ` : ''}+ ${n} ghost notes`;
  }
  return out;
}

const keeperDefaults = (lane, ctx) => ({
  art: lane === 'ride' ? 'bow' : 'closed', density: scaleDensity(0.25 + 0.4 * ctx.params.density, ctx.meter),
  syncopation: ctx.params.syncopation, relations: [], minGapSec: 0.06, polymeter: 0.5,
});

function genTimekeeper(lane, ctx) {
  const { spec, params, meter, rng, info, tatumSec } = ctx;
  if (hasAlgo(spec)) return generic(ctx, keeperDefaults(lane, ctx));
  const isRide = lane === 'ride';
  const art = spec.art || (isRide ? (params.bell > 0.6 ? 'bell' : 'bow') : 'closed');
  const { barLen } = meter;

  if (isRide && params.bell > 0.6 && !spec.simple && !spec.densityScale) {
    const tl = rng.weighted(TIMELINES, (x) => (barLen % x.n === 0 ? 4 : 1));
    let cycle, base, step = 1;
    if (barLen % tl.n === 0) { step = barLen / tl.n; cycle = barLen; base = bjorklund(tl.k, tl.n); }
    else if (params.polymeter > 0.5) { step = Math.max(1, Math.round(meter.resolution / 16)); cycle = tl.n * step; base = bjorklund(tl.k, tl.n); }
    else { cycle = barLen; base = bjorklund(clamp(Math.round((tl.k * barLen) / tl.n), 1, barLen - 1), barLen); }
    const cw = cycleWeights(cycle, meter);
    const fitness = makeFitness({
      len: cycle, weights: cw, density: base.filter(Boolean).length / cycle, syncopation: params.syncopation,
      refs: buildRefs(ctx, cycle, [{ type: 'interlock', lane: 'kick', w: 0.5 }]), anchors: [0], anchorWeight: 1,
    });
    const pick = select(base.map((_, r) => ({ p: expand(rotate(base, r), step), detail: `E(${tl.k},${tl.n}) rot ${r}${step > 1 ? ` on a 1/${meter.resolution / step} grid` : ''}` })), fitness, rng);
    info.algo = `timeline: ${tl.name}`; info.detail = pick.detail; info.cycle = cycle;
    return layout(toStrength(pick.p, cw), ctx, { cycle, algo: 'euclid', art: 'bell', vary: false });
  }

  if (!spec.simple && rng.chance(params.polyrhythm * 0.6)) {
    const nB = meter.beatStarts.length;
    const k = choosePoly(nB, params.tension, rng);
    const cell = new Array(barLen).fill(0);
    for (let j = 0; j < k; j++) cell[Math.round((j * barLen) / k)] = j === 0 ? 1 : 0.8;
    info.algo = 'polyrhythm'; info.detail = `${k} against ${nB} (evenly spaced, quantized)`;
    return layout(cell, ctx, { cycle: barLen, algo: 'poly', art, vary: false });
  }

  const dens = clamp(params.density * (spec.densityScale ?? 1));
  const note = dens < 0.15 ? 2 : dens < 0.3 ? 4 : dens < 0.72 ? 8 : 16;
  let step = note === 2 ? 2 * (meter.compound ? meter.beatLens[0] : Math.max(1, Math.round(meter.resolution / 4)))
    : meter.compound && note === 4 ? meter.beatLens[0] : Math.max(1, Math.round(meter.resolution / note));
  while (step * tatumSec < 0.065) step *= 2;
  const offAcc = (spec.syncopation ?? params.syncopation) > 0.55;
  const cell = new Array(barLen).fill(0);
  for (let t = 0; t < barLen; t += step) {
    const onBeat = meter.beatStarts.includes(t);
    cell[t] = offAcc ? (onBeat ? 0.6 : 0.95) : 0.62 + 0.38 * meter.weights[t];
  }
  info.algo = 'grid';
  info.detail = `every ${step} tatum${step > 1 ? 's' : ''}${offAcc ? ', off-beat accents' : ''}`;

  const opens = new Set();
  if (lane === 'hihat' && art === 'closed' && rng.chance(0.15 + params.syncopation * 0.7)) {
    const offs = [];
    for (let t = 0; t < barLen; t++) if (cell[t] && !meter.beatStarts.includes(t)) offs.push(t);
    if (offs.length) opens.add(offs[offs.length - 1]);
    if (params.syncopation > 0.6 && offs.length > 3) opens.add(rng.pick(offs));
    if (opens.size) info.detail += `, open on ${[...opens].join(',')}`;
  }
  const out = layout(cell, ctx, { cycle: barLen, algo: 'grid', art, artAt: opens.size ? (t, i) => (opens.has(i) ? 'open' : art) : null, vary: false });

  if (params.phasing > 0.5 && barLen - step >= 4 && barLen % step === 0) {
    // Accent pattern one grid step shorter than the bar: drifts against the downbeat, realigns at lcm.
    const pc = barLen - step;
    const slots = pc / step;
    const acc = bjorklund(Math.max(2, Math.round(slots / 3)), slots);
    for (let t = 0; t < out.length; t++) {
      const idx = t % pc;
      if (!out[t] || idx % step) continue;
      out[t].s = acc[idx / step] ? 1 : out[t].s * 0.7;
    }
    info.detail += `, phasing accents (cycle ${pc} vs ${barLen}, realign every ${lcm(pc, barLen) / barLen} bars)`;
  }
  return out;
}

function genSecondary(lane, ctx) {
  const { spec, params, meter, rng, info, part } = ctx;
  if (hasAlgo(spec) || spec.play) return generic(ctx, keeperDefaults(lane, ctx));
  if (lane === 'hihat') {
    if (params.density < 0.15) { info.algo = 'rest'; return empty(part.len); }
    const cell = new Array(meter.barLen).fill(0);
    if (params.syncopation > 0.55) meter.beatStarts.forEach((s, i) => (cell[s + Math.floor(meter.beatLens[i] / 2)] = 0.7));
    else (params.density > 0.5 ? meter.beatStarts : backbeatPositions(meter, false)).forEach((s) => (cell[s] = 0.7));
    info.algo = 'foot'; info.detail = params.syncopation > 0.55 ? 'pedal on the &' : 'pedal on the beat';
    return layout(cell, ctx, { cycle: meter.barLen, algo: 'pedal', art: 'pedal', vary: false });
  }
  if (rng.chance(0.15 + params.bell * 0.6 + params.polyrhythm * 0.2)) {
    return generic(ctx, {
      art: 'bell', density: scaleDensity(0.05 + 0.08 * params.density, meter), syncopation: params.syncopation,
      relations: [{ type: 'lock', lane: 'kick' }], minGapSec: 0.15, polymeter: 0.7, suit: { lsystem: 0.3, genetic: 0.3 },
    });
  }
  info.algo = 'rest';
  return empty(part.len);
}

function tomVoicer(ctx) {
  return (cell, cw) => {
    const idx = cell.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    const mel = voiceMelody(idx.length, 4, ctx.rng);
    const map = new Map();
    idx.forEach((i, j) => map.set(i, cw[i] >= 0.8 ? 'f1' : TOM_VOICES[mel[j]]));
    ctx.info.detail += ' · voices from an L-system melody';
    return (t, i) => map.get(i) || 't2';
  };
}

function tiling(ctx, density, relations) {
  const { meter, rng, params, info } = ctx;
  const n = meter.barLen;
  for (let attempt = 0; attempt < 6; attempt++) {
    const motif = rng.pick(TILE_MOTIFS);
    const shifts = tile(motif, n);
    if (!shifts) continue;
    const want = clamp(Math.round((density * n) / motif.length), 1, shifts.length);
    const fitness = makeFitness({
      len: n, weights: meter.weights, density, syncopation: params.syncopation,
      refs: buildRefs(ctx, n, relations), tension: params.tension,
    });
    let best = null;
    for (let i = 0; i < 24; i++) {
      const chosen = rng.shuffle(shifts.map((_, j) => j)).slice(0, want);
      const p = new Array(n).fill(0);
      const voice = new Array(n).fill(null);
      chosen.forEach((j, v) => motif.forEach((m) => {
        const pos = (m + shifts[j]) % n;
        p[pos] = 1;
        voice[pos] = TOM_VOICES[v % TOM_VOICES.length];
      }));
      const f = fitness(p);
      if (!best || f > best.f) best = { p, voice, f, chosen };
    }
    info.algo = 'packing (tiling canon)';
    info.detail = `motif {${motif.join(',')}} ⊕ {${best.chosen.map((j) => shifts[j]).join(',')}}, one tom per translate`;
    info.cycle = n;
    return layout(toStrength(best.p, meter.weights), ctx, { cycle: n, algo: 'packing', art: 't2', artAt: (t, i) => best.voice[i] || 't2' });
  }
  return null;
}

function genToms(ctx) {
  const { spec, params, meter, rng, info, part } = ctx;
  if (!hasAlgo(spec) && !spec.play && (params.tomUse < 0.25 || !rng.chance(params.tomUse))) {
    info.algo = 'fills only';
    return empty(part.len);
  }
  const density = scaleDensity(0.12 + 0.35 * params.density * Math.max(0.4, params.tomUse), meter);
  const relations = [{ type: 'interlock', lane: 'kick' }, { type: 'interlock', lane: 'snare' }];
  const algo = hasAlgo(spec) ? spec.algo : pickAlgo(ctx, { euclid: 1.3, packing: 1.2, crystal: 1, ca: 0.7, genetic: 0.6 });
  if (algo === 'packing' && !spec.packParts && !specCycle(spec, meter)) {
    const r = tiling(ctx, density, relations);
    if (r) return r;
  }
  return generic(ctx, {
    algo: hasAlgo(spec) ? undefined : algo, art: 't2', density, syncopation: params.syncopation,
    relations, minGapSec: 0.06, polymeter: 0.8, artFrom: tomVoicer(ctx),
  });
}

function genCymbals(ctx) {
  const { spec, params, meter, rng, info, part } = ctx;
  if (!hasAlgo(spec) && !spec.play && !rng.chance(params.cymbalAccents + 0.1)) { info.algo = 'rest'; return empty(part.len); }
  return generic(ctx, {
    art: params.cymbalAccents > 0.6 ? 'china' : rng.pick(['china', 'splash']),
    density: scaleDensity(0.03 + 0.14 * params.cymbalAccents, meter), syncopation: params.syncopation,
    relations: [{ type: 'lock', lane: 'kick' }], minGapSec: 0.15, polymeter: 0.6,
    suit: { lsystem: 0.3, ca: 0.3, packing: 1.5 },
  });
}

function genCrash(ctx) {
  const { params, meter, rng, info, part, spec } = ctx;
  if (hasAlgo(spec)) {
    return generic(ctx, { art: 'c1', density: scaleDensity(0.03, meter), syncopation: 0.1, relations: [{ type: 'lock', lane: 'kick' }], minGapSec: 0.2 });
  }
  const { barLen } = meter;
  const out = empty(part.len);
  let n = 0, art = 'c1';
  const put = (t, s = 1) => { out[t] = hit(s, art); art = art === 'c1' ? 'c2' : 'c1'; n++; };

  const startP = ctx.prevFill ? 1
    : ['contrast', 'breakdown', 'build'].includes(part.role) ? 0.9
    : part.role === 'variation' ? 0.35 : 0.45 + 0.45 * params.downbeat;
  if (rng.chance(startP)) put(0);
  for (let b = 4; b < part.bars; b += 4) if (rng.chance(0.3 + params.cymbalAccents * 0.6)) put(b * barLen, 0.9);

  // Interference peaks: where the heavy lanes pile up on strong metric positions.
  const field = new Array(part.len).fill(0);
  for (const [l, w] of Object.entries({ kick: 1, snare: 1, toms: 0.8, cymbals: 0.7 })) {
    const h = ctx.lanes[l];
    if (h) for (let t = 0; t < part.len; t++) if (h[t]) field[t] += w * h[t].s;
  }
  for (let t = 0; t < part.len; t++) field[t] *= 0.4 + 0.6 * meter.weights[t % barLen];
  const max = Math.max(...field, 1e-9);
  const chosen = out.map((h, t) => (h ? t : -1)).filter((t) => t >= 0);
  let peaks = 0;
  const budget = Math.floor(part.bars / 2);
  const order = field.map((v, t) => [v, t]).sort((a, b) => b[0] - a[0]);
  for (const [v, t] of order) {
    if (peaks >= budget || v < 0.8 * max) break;
    if (chosen.some((c) => Math.abs(c - t) < barLen)) continue;
    if (rng.chance(params.cymbalAccents * 0.7)) { put(t, 0.85); chosen.push(t); peaks++; }
  }

  if (ctx.blast && rng.chance(0.4 + 0.4 * params.cymbalAccents)) {
    for (const bar of ctx.blast.bars) for (const bs of meter.beatStarts) put(bar * barLen + bs, 0.8);
  }
  info.algo = 'structure + interference';
  info.detail = `${n} crashes, ${peaks} on interference peaks`;
  return out;
}

function mostCommon(arr, fallback) {
  const c = {};
  let best = fallback, bc = 0;
  for (const a of arr) { c[a] = (c[a] || 0) + 1; if (c[a] > bc) { bc = c[a]; best = a; } }
  return best;
}

function fromMotif(lane, ctx) {
  const { motif, meter, part, params, rng, info } = ctx;
  const src = motif.base[lane];
  const { barLen } = meter;
  const out = empty(part.len);
  for (let t = 0; t < part.len; t++) {
    const b = Math.floor(t / barLen);
    const st = (b % motif.bars) * barLen + (t % barLen);
    if (src[st]) out[t] = { ...src[st] };
  }
  const keeper = lane === 'hihat' || lane === 'ride';
  const art = mostCommon(out.filter(Boolean).map((h) => h.art), DEFAULT_ART[lane]);
  const silent = !src.some(Boolean);
  let ops = 0;
  for (let b = 0; b < part.bars && !silent; b++) {
    const amt = params.mutation * (0.4 + 0.6 * (part.bars > 1 ? b / (part.bars - 1) : 1));
    const n = keeper ? (rng.chance(amt * 0.4) ? 1 : 0) : Math.floor(amt * 3 * rng.next() + (rng.chance(amt) ? 1 : 0));
    for (let k = 0; k < n; k++) {
      varyRegion(out, b * barLen, (b + 1) * barLen, rng, () => (lane === 'toms' ? rng.pick(TOM_VOICES) : art));
      ops++;
    }
  }
  const mi = motif.info[lane] || {};
  info.algo = `motif "${motif.name}"`;
  info.detail = `${ops} mutations of: ${mi.algo || '?'}${mi.detail ? ` (${mi.detail})` : ''}`;
  info.cycle = mi.cycle ?? barLen;
  return out;
}

function applyAccents(out, ctx, art) {
  const { spec, meter } = ctx;
  const { barLen } = meter;
  if (spec.accents) {
    const pos = new Set(resolvePositions(spec.accents, meter));
    for (let t = 0; t < out.length; t++) {
      if (pos.has(t % barLen)) out[t] = out[t] ? { ...out[t], s: 1 } : hit(1, art);
      else if (out[t]) out[t].s *= 0.72;
    }
  }
  if (spec.opens) {
    const pos = new Set(resolvePositions(spec.opens, meter));
    for (let t = 0; t < out.length; t++) if (pos.has(t % barLen)) out[t] = { ...(out[t] || hit(0.85, 'open')), art: 'open' };
  }
}

const GEN = { kick: genKick, snare: genSnare, toms: genToms, cymbals: genCymbals, crash: genCrash };

export function generateLane(lane, ctx) {
  ctx.info = { algo: '-', detail: '', cycle: ctx.meter.barLen };
  ctx.lane = lane;
  const { spec } = ctx;
  const typed = spec.raw && !/^\s*auto\s*$/i.test(spec.raw);
  let out;
  if (spec.off) {
    out = empty(ctx.part.len);
    ctx.info.algo = 'off';
  } else if (ctx.useMotif && ctx.motif && lane !== 'crash' && !typed) {
    out = fromMotif(lane, ctx);
  } else if (lane === 'hihat' || lane === 'ride') {
    out = lane === ctx.timekeeper ? genTimekeeper(lane, ctx) : genSecondary(lane, ctx);
  } else {
    out = GEN[lane](ctx);
  }
  if (!spec.off) {
    applyAccents(out, ctx, spec.art || DEFAULT_ART[lane]);
    if (applyBlast(lane, out, ctx) && (lane === 'kick' || lane === 'snare' || lane === ctx.timekeeper)) {
      ctx.info.detail += ` + ${ctx.blast.type} blast`;
    }
    applyBuild(lane, out, ctx);
    if (applyLull(lane, out, ctx) && lane === 'kick') ctx.info.detail += ` + lull in bar${ctx.lull.bars.size > 1 ? 's' : ''} ${[...ctx.lull.bars].map((b) => b + 1).join(',')}`;
    // Both hands are on the snare during a roll.
    const snare = ctx.lanes.snare;
    if (snare && lane !== 'snare' && lane !== 'crash' && lane !== 'kick') {
      for (let t = 0; t < out.length; t++) if (snare[t]?.roll && out[t] && out[t].art !== 'pedal') out[t] = null;
    }
  }
  const base = out.map((h) => h && { ...h });
  if (!spec.off) applyFill(lane, out, ctx);
  return { hits: out, base, info: ctx.info };
}
