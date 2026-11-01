// Part-level plans that several lanes read from: fills (L-system), blast beats, build-ups.
import { clamp } from '../core/rng.js';
import { TOM_VOICES } from '../core/drummap.js';
import { lsysRhythm, voiceMelody } from '../algorithms/lsystem.js';

const hit = (s, art) => ({ s: clamp(s, 0.05, 1), art });

export function planFill(part, meter, params, rng, tatumSec) {
  const big = part.role === 'fill' || part.role === 'build';
  if (!big && !rng.chance(params.fills * 0.8)) return null;

  const nB = meter.beatStarts.length;
  const lastBar = (part.bars - 1) * meter.barLen;
  let beats = big ? nB : params.fills > 0.6 && nB > 2 ? 2 : 1;
  if (big && part.bars === 1 && nB > 2 && part.role === 'fill') beats = nB;
  beats = Math.min(beats, nB);
  const startOff = meter.beatStarts[nB - beats];
  const start = lastBar + startOff;
  const span = part.len - start;
  const top = meter.beatStarts.slice(nB - beats).map((s, i) => [s - startOff, meter.beatLens[nB - beats + i]]);

  // Subdivide only down to a playable grid (alternating hands).
  const unit = [1, 2, 3, 4, 6, 8].find((u) => u * tatumSec >= 0.05 && meter.beatLens.every((l) => l % u === 0)) || 1;
  const coarse = Math.floor(span / unit);
  const coarseTop = top.map(([s, l]) => [Math.floor(s / unit), Math.max(1, Math.floor(l / unit))]);
  const { pattern, trace } = lsysRhythm(coarse, rng, {
    density: clamp(0.55 + 0.35 * params.density + 0.15 * params.fills, 0, 0.95),
    syncopation: params.syncopation, top: coarseTop,
  });
  pattern[0] = Math.max(pattern[0], 0.95);

  const roll = part.role === 'build' || (params.march > 0.3 && rng.fork('march').chance(params.march * 0.6));
  const voices = ['snare', ...(params.tomUse > 0.3 || rng.chance(0.7) ? TOM_VOICES : ['t1', 't3', 'f1'])];
  const onsets = pattern.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const melody = voiceMelody(onsets.length, 3, rng);
  const hits = [];
  const kick = [];
  onsets.forEach((ci, j) => {
    const p = onsets.length > 1 ? j / (onsets.length - 1) : 0;
    let vi = roll ? 0 : Math.round(p * (voices.length - 1)) + (melody[j] - 1);
    vi = clamp(vi, 0, voices.length - 1);
    const t = start + ci * unit;
    const s = roll ? 0.45 + 0.55 * p : clamp(pattern[ci] * (0.8 + 0.2 * p), 0.4, 1);
    hits.push({ t, voice: voices[vi], s });
    if (pattern[ci] >= 0.85 && (j === 0 || rng.chance(0.5))) kick.push(t);
  });
  return { start, end: part.len, hits, kick, trace, roll };
}

export function planBlast(part, meter, params, rng, tatumSec) {
  if (params.blast < 0.05) return null;
  const bars = new Set();
  for (let b = 0; b < part.bars; b++) if (rng.chance(params.blast * 0.85)) bars.add(b);
  if (!bars.size) return null;
  const type = rng.weighted(['traditional', 'hammer', 'bomb'], (t) => ({ traditional: 3, hammer: 1.5, bomb: 1 + params.doubleKick })[t]);
  let step = 1;
  const limb = type === 'bomb' ? 0.05 : 0.065;
  while ((type === 'traditional' ? 2 : 1) * step * tatumSec < limb) step *= 2;
  return { bars, type, step };
}

export function applyBlast(lane, out, ctx) {
  const b = ctx.blast;
  if (!b || !['kick', 'snare', 'hihat', 'ride'].includes(lane)) return false;
  const { barLen } = ctx.meter;
  const tk = lane === ctx.timekeeper;
  if ((lane === 'hihat' || lane === 'ride') && !tk) {
    for (const bar of b.bars) for (let t = bar * barLen; t < (bar + 1) * barLen; t++) if (out[t] && out[t].art !== 'pedal') out[t] = null;
    return true;
  }
  const s = b.step;
  for (const bar of b.bars) {
    const b0 = bar * barLen;
    for (let i = 0; i < barLen; i++) {
      const t = b0 + i;
      out[t] = null;
      const acc = i === 0 ? 1 : 0.85;
      let on = false;
      if (b.type === 'traditional') on = lane === 'snare' ? i % (2 * s) === s : i % (2 * s) === 0;
      else if (b.type === 'hammer') on = i % (2 * s) === 0;
      else on = lane === 'kick' ? i % s === 0 : i % (2 * s) === 0;
      if (on) out[t] = hit(acc, lane === 'kick' ? 'kick' : lane === 'snare' ? 'center' : lane === 'ride' ? 'bow' : 'closed');
    }
  }
  return true;
}

export function applyFill(lane, out, ctx) {
  const f = ctx.fill;
  if (!f) return;
  for (let t = f.start; t < f.end; t++) {
    if (lane === 'hihat' && out[t]?.art === 'pedal') continue;
    out[t] = null;
  }
  if (lane === 'snare') for (const h of f.hits) if (h.voice === 'snare') out[h.t] = hit(h.s, 'center');
  if (lane === 'toms') for (const h of f.hits) if (h.voice !== 'snare') out[h.t] = hit(h.s, h.voice);
  if (lane === 'kick') for (const t of f.kick) out[t] = hit(0.9, 'kick');
  if (lane === 'hihat' && ctx.params.density > 0.3) {
    const { barLen, beatStarts } = ctx.meter;
    for (let t = f.start; t < f.end; t++) if (beatStarts.includes(t % barLen) && !out[t]) out[t] = hit(0.6, 'pedal');
  }
}

// Lulls: whole bars where the kit falls away to a struck downbeat and a slow pulse, and the toms carry.
export function planLull(part, meter, params, rng, hasFill) {
  if (params.lull < 0.05 || part.bars < 2 || ['fill', 'build'].includes(part.role)) return null;
  const last = hasFill ? part.bars - 1 : part.bars;
  const max = Math.ceil(part.bars / 2);
  const bars = new Set();
  for (let b = 1; b < last && bars.size < max; b++) if (rng.chance(params.lull * 0.5)) bars.add(b);
  return bars.size ? { bars } : null;
}

export function applyLull(lane, out, ctx) {
  const l = ctx.lull;
  if (!l) return false;
  const { barLen, beatStarts } = ctx.meter;
  if (lane === 'toms') {
    if (ctx.params.tomUse < 0.4) return true;
    for (const bar of l.bars) {
      const b0 = bar * barLen;
      if (out.slice(b0, b0 + barLen).some(Boolean)) continue;
      beatStarts.forEach((bs, j) => { if (j % 2 === 0 || ctx.rng.chance(0.3)) out[b0 + bs] = hit(j === 0 ? 0.85 : 0.6, j === 0 ? 'f2' : 'f1'); });
    }
    return true;
  }
  const keeper = lane === 'hihat' || lane === 'ride';
  for (const bar of l.bars) {
    for (let i = 0; i < barLen; i++) {
      const t = bar * barLen + i;
      const h = out[t];
      if (!h) continue;
      if (lane === 'kick' || lane === 'crash') { if (i !== 0) out[t] = null; continue; }
      if (lane === 'snare' && h.roll) continue;
      if (keeper && (h.art === 'pedal' || beatStarts.includes(i))) { out[t] = { ...h, s: h.s * 0.7 }; continue; }
      out[t] = null;
    }
  }
  return true;
}

export function applyBuild(lane, out, ctx) {
  if (ctx.part.role !== 'build' || lane === 'crash' || ctx.part.bars < 2) return;
  const { barLen } = ctx.meter;
  const bars = ctx.part.bars;
  for (let t = 0; t < out.length; t++) {
    const b = Math.floor(t / barLen);
    if (b === bars - 1 || !out[t] || out[t].s >= 0.9) continue;
    if (!ctx.rng.chance(0.3 + 0.7 * (b / (bars - 1)))) out[t] = null;
  }
}
