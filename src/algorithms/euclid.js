// Bjorklund's algorithm: k onsets spread as evenly as possible over n steps -> the Euclidean rhythm E(k, n).
// E. Bjorklund, "The theory of rep-rate pattern generation in the SNS timing system", SNS-NOTE-CNTRL-99 (2003);
// applied to rhythm by G. Toussaint (2005). This is the usual pair-merging formulation of the algorithm.

export function bjorklund(k, n) {
  k = Math.max(0, Math.min(n, Math.round(k)));
  if (n <= 0) return [];
  if (k === 0) return Array(n).fill(0);
  if (k === n) return Array(n).fill(1);
  let a = Array.from({ length: k }, () => [1]);
  let b = Array.from({ length: n - k }, () => [0]);
  while (b.length > 1) {
    const m = Math.min(a.length, b.length);
    const merged = [];
    for (let i = 0; i < m; i++) merged.push(a[i].concat(b[i]));
    const rest = a.length > m ? a.slice(m) : b.slice(m);
    a = merged;
    b = rest;
  }
  return a.concat(b).flat();
}

export function rotate(pattern, r) {
  const n = pattern.length;
  if (!n) return pattern;
  const s = ((r % n) + n) % n;
  return pattern.slice(s).concat(pattern.slice(0, s));
}

export function allRotations(pattern) {
  return pattern.map((_, r) => rotate(pattern, r));
}

// Famous timelines, all Euclidean. Names follow Toussaint (2005), "The Euclidean Algorithm Generates
// Traditional Musical Rhythms", Proc. BRIDGES, pp. 47-56. Several are "necklaces": the traditional
// pattern is a rotation, which the generator searches anyway.
export const TIMELINES = [
  { name: 'tresillo', k: 3, n: 8 },
  { name: 'cinquillo', k: 5, n: 8 },
  { name: 'bossa nova necklace', k: 5, n: 16 },
  { name: 'West African standard bell', k: 7, n: 12 },
  { name: 'aksak', k: 4, n: 9 },
  { name: 'ruchenitza', k: 3, n: 7 },
  { name: 'samba necklace', k: 7, n: 16 },
  { name: 'Venda clapping', k: 5, n: 12 },
  { name: 'agsag-samai', k: 5, n: 9 },
  { name: 'Central African necklace', k: 9, n: 16 },
  { name: 'fandango clapping', k: 4, n: 12 },
  { name: 'york-samai', k: 5, n: 6 },
];
