// Rhythmic interference: lanes as oscillators. Two periods a and b realign every lcm(a, b) tatums,
// the rhythmic analog of acoustic beating (f_beat = |f1 - f2|).

export const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
export const lcm = (a, b) => (a && b ? Math.abs(a * b) / gcd(a, b) : 0);

// Tenney height of a ratio: low = consonant (3:2), high = dissonant (15:16).
export function tenney(a, b) {
  const g = gcd(a, b);
  return Math.log2((a / g) * (b / g));
}

function weightByTension(h, tension, spread = 2.2) {
  const target = 3 + tension * 4.5;
  return Math.exp(-((h - target) ** 2) / spread);
}

export function chooseCycle(barLen, tension, rng, { phasing = false } = {}) {
  if (phasing) return barLen + (rng.chance(0.5) ? -1 : 1);
  const cands = [];
  for (let c = Math.max(3, Math.floor(barLen / 3)); c <= Math.ceil(barLen * 1.5); c++) {
    if (c !== barLen) cands.push(c);
  }
  return rng.weighted(cands, (c) => weightByTension(tenney(c, barLen), tension));
}

export function choosePoly(beats, tension, rng) {
  const cands = [];
  for (let k = 2; k <= 9; k++) if (k !== beats && k % beats !== 0 && beats % k !== 0) cands.push(k);
  if (!cands.length) return beats + 1;
  return rng.weighted(cands, (k) => weightByTension(tenney(k, beats), tension));
}

export function interferenceField(laneArrays, weightAt, total) {
  const W = { kick: 1, snare: 1, toms: 0.8, cymbals: 0.7, ride: 0.4, hihat: 0.3 };
  const field = new Array(total).fill(0);
  for (const [lane, arr] of Object.entries(laneArrays)) {
    const lw = W[lane] ?? 0;
    if (!lw || !arr) continue;
    for (let t = 0; t < total; t++) if (arr[t]) field[t] += lw * arr[t].s;
  }
  let max = 0;
  for (let t = 0; t < total; t++) {
    field[t] *= 0.4 + 0.6 * weightAt(t);
    max = Math.max(max, field[t]);
  }
  return max ? field.map((v) => v / max) : field;
}

export function beatFrequency(cycle, barLen, tatumSec) {
  const laneHz = 1 / (cycle * tatumSec);
  const barHz = 1 / (barLen * tatumSec);
  const realign = lcm(cycle, barLen);
  return {
    laneHz, barHz,
    beatHz: Math.abs(laneHz - barHz),
    realignTatums: realign,
    realignBars: realign / barLen,
    realignSec: realign * tatumSec,
    ratio: `${cycle / gcd(cycle, barLen)}:${barLen / gcd(cycle, barLen)}`,
    tenney: tenney(cycle, barLen),
  };
}
