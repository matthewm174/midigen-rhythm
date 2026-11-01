// Shared fitness: every generator proposes candidates, this decides which ones "line up" with the other lanes.
import { genericWeights } from '../core/meter.js';

export function foldOccupancy(hits, cycle) {
  const occ = new Array(cycle).fill(0);
  const cnt = new Array(cycle).fill(0);
  for (let t = 0; t < hits.length; t++) {
    const i = t % cycle;
    cnt[i]++;
    if (hits[t]) occ[i] += 1;
  }
  return occ.map((v, i) => (cnt[i] ? v / cnt[i] : 0));
}

export function unionOccupancy(lanes, cycle, exclude = []) {
  const arrs = Object.entries(lanes)
    .filter(([name, h]) => h && !exclude.includes(name))
    .map(([, h]) => foldOccupancy(h, cycle));
  if (!arrs.length) return null;
  return arrs[0].map((_, i) => Math.min(1, arrs.reduce((a, o) => a + o[i], 0)));
}

export function cycleWeights(cycle, meter) {
  if (cycle === meter.barLen) return meter.weights;
  if (cycle % meter.barLen === 0) {
    return Array.from({ length: cycle }, (_, i) => meter.weights[i % meter.barLen] * (i < meter.barLen || i % meter.barLen ? 1 : 0.9));
  }
  return genericWeights(cycle, meter.beatLens[0]);
}

export function makeFitness({
  len, weights, density, syncopation, refs = [], all = null, tension = 0.4,
  minGap = 1, anchors = [], anchorWeight = 0, prior = null, priorWeight = 0,
}) {
  return (pat) => {
    let hits = 0, syn = 0;
    for (let i = 0; i < len; i++) if (pat[i]) { hits++; syn += 1 - weights[i]; }
    if (!hits) return -10;
    let f = -4 * Math.abs(hits / len - density) - 2.5 * Math.abs(syn / hits - syncopation);

    for (const r of refs) {
      let c = 0;
      if (r.type === 'answer') {
        for (let i = 0; i < len; i++) if (pat[i]) c += Math.max(r.occ[(i - 1 + len) % len], r.occ[i], r.occ[(i + 1) % len]);
        f -= 1.4 * (c / hits) * (r.w ?? 1);
        continue;
      }
      for (let i = 0; i < len; i++) if (pat[i]) c += r.occ[i];
      const frac = c / hits;
      if (r.type === 'lock') f += 1.6 * frac * (r.w ?? 1);
      else if (r.type === 'interlock' || r.type === 'avoid') f -= 1.8 * frac * (r.w ?? 1);
    }

    if (all) {
      let c = 0;
      for (let i = 0; i < len; i++) if (pat[i]) c += all[i];
      f -= 1.0 * Math.abs(c / hits - (1 - tension) * 0.6);
    }

    if (minGap > 1) {
      let last = -Infinity, first = -1;
      for (let i = 0; i < len; i++) {
        if (!pat[i]) continue;
        if (first < 0) first = i;
        if (i - last < minGap) f -= 0.7;
        last = i;
      }
      if (first >= 0 && first + len - last < minGap) f -= 0.7;
    }

    for (const a of anchors) if (a < len && !pat[a]) f -= anchorWeight;

    if (prior) {
      let same = 0;
      for (let i = 0; i < len; i++) if (!!pat[i] === !!prior[i]) same++;
      f += priorWeight * (same / len);
    }
    return f;
  };
}

export function syncopationIndex(hits, weightAt) {
  let n = 0, s = 0;
  hits.forEach((h, t) => { if (h) { n++; s += 1 - weightAt(t); } });
  return n ? s / n : 0;
}

// Fraction of the smaller lane's hits that coincide with the other lane.
export function coincidence(a, b) {
  let na = 0, nb = 0, both = 0;
  for (let t = 0; t < a.length; t++) {
    if (a[t]) na++;
    if (b[t]) nb++;
    if (a[t] && b[t]) both++;
  }
  const m = Math.min(na, nb);
  return m ? both / m : null;
}
