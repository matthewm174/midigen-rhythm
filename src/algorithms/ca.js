// 1D elementary cellular automata. One row = one bar (or cycle), one cell = one tatum, wrap-around edges.

export const RULE_CHARACTER = {
  30: 'chaotic', 45: 'chaotic', 54: 'complex', 60: 'shifting', 90: 'fractal (Sierpinski)',
  102: 'shifting', 110: 'complex (Turing-complete)', 150: 'fractal', 184: 'flowing (traffic)',
};

export function caStep(row, rule) {
  const n = row.length;
  const next = new Array(n);
  for (let i = 0; i < n; i++) {
    const l = row[(i - 1 + n) % n] ? 1 : 0, c = row[i] ? 1 : 0, r = row[(i + 1) % n] ? 1 : 0;
    next[i] = (rule >> ((l << 2) | (c << 1) | r)) & 1;
  }
  return next;
}

// Evolve a base row bar by bar; `mutation` controls how much of each new generation is adopted.
export function caBars(base, bars, rule, mutation, rng, targetDensity) {
  const rows = [base.slice()];
  const len = base.length;
  for (let b = 1; b < bars; b++) {
    const prev = rows[b - 1];
    const next = caStep(prev, rule);
    let row = prev.map((v, i) => (rng.chance(mutation) ? (next[i] ? Math.max(v, 0.8) : 0) : v));
    const d = row.filter(Boolean).length / len;
    if (d === 0 || d > Math.max(0.85, targetDensity * 2.5)) row = base.slice();
    rows.push(row);
  }
  return rows;
}

export function pickRule(params, rng) {
  if (params.caRule != null) return params.caRule;
  if (params.tension > 0.75) return rng.pick([30, 45, 110]);
  if (params.mutation < 0.15) return rng.pick([184, 60, 102]);
  return rng.pick([90, 150, 110, 54, 184]);
}
