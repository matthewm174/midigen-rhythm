// "Crystal generation": quasicrystals (ordered but never periodic) and nucleation-and-growth on a lattice.
import { expandLSystem } from './lsystem.js';

export const IRRATIONALS = [
  { name: '1/φ', value: (Math.sqrt(5) - 1) / 2 },
  { name: '1/φ²', value: (3 - Math.sqrt(5)) / 2 },
  { name: '1/φ³', value: Math.sqrt(5) - 2 },
  { name: '1/φ⁴', value: (7 - 3 * Math.sqrt(5)) / 2 },
  { name: '√2−1 (silver)', value: Math.SQRT2 - 1 },
  { name: '1−1/√2', value: 1 - Math.SQRT1_2 },
  { name: '3−2√2', value: 3 - 2 * Math.SQRT2 },
  { name: '1/e', value: 1 / Math.E },
  { name: '1/π', value: 1 / Math.PI },
  { name: 'π−3', value: Math.PI - 3 },
  { name: '(√3−1)/2', value: (Math.sqrt(3) - 1) / 2 },
];

// Mechanical / Sturmian word: hit when floor((i+1)α + ρ) increments. Rational α gives a Euclidean rhythm;
// irrational α gives a 1D quasicrystal (cut-and-project).
export function sturmian(len, alpha, rho = 0) {
  const out = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    if (Math.floor((i + 1) * alpha + rho) - Math.floor(i * alpha + rho) >= 1) out[i] = 1;
  }
  return out;
}

export function nearestIrrational(density) {
  return IRRATIONALS.reduce((best, x) => (Math.abs(x.value - density) < Math.abs(best.value - density) ? x : best));
}

// Fibonacci word via the L-system A -> AB, B -> A. Hits on 'B' (density ~0.382) or 'A' (~0.618).
export function fibonacciWord(len, hitOn = 'B', offset = 0) {
  const w = expandLSystem('A', { A: 'AB', B: 'A' }, 30, null, len + offset + 2);
  return [...w.slice(offset, offset + len)].map((c) => (c === hitOn ? 1 : 0));
}

// Nucleation: seeds on strong metric positions grow by lattice translation and mirror symmetry.
export function nucleate(len, rng, { density = 0.3, weights, lattices = [4, 3], mirrorSpan = len }) {
  const out = new Array(len).fill(0);
  const target = Math.max(1, Math.round(density * len));
  const strong = weights
    .map((w, i) => [w, i])
    .filter(([, i]) => i < len)
    .sort((a, b) => b[0] - a[0])
    .slice(0, Math.max(2, Math.round(len / 8)));
  const seeds = rng.shuffle(strong).slice(0, Math.max(1, Math.round(target / 4)));
  for (const [, i] of seeds) out[i] = 1;

  let count = seeds.length;
  for (let iter = 0; iter < len * 8 && count < target; iter++) {
    const hits = out.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    const h = rng.pick(hits);
    let p;
    if (rng.chance(0.6)) {
      const v = rng.pick(lattices) * (rng.chance(0.5) ? 1 : -1);
      p = h + v;
    } else {
      const block = Math.floor(h / mirrorSpan) * mirrorSpan;
      p = block + (mirrorSpan - 1 - (h - block));
    }
    if (p >= 0 && p < len && !out[p]) {
      out[p] = Math.max(0.55, out[h] * 0.88);
      count++;
    }
  }
  return out;
}
