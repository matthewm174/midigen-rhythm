// Genetic algorithm over binary rhythm patterns. Crossover swaps whole beats; mutation flips or nudges hits.

function mutate(ind, rng, rate) {
  const c = ind.slice();
  const n = c.length;
  for (let i = 0; i < n; i++) if (rng.chance(rate)) c[i] = c[i] ? 0 : 1;
  if (rng.chance(0.35)) {
    const hits = c.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (hits.length) {
      const h = rng.pick(hits);
      const to = (h + (rng.chance(0.5) ? 1 : -1) + n) % n;
      if (!c[to]) { c[h] = 0; c[to] = 1; }
    }
  }
  return c;
}

export function evolve({ len, fitness, rng, seeds = [], popSize = 36, generations = 45, density = 0.3, segment = 4, protect = [] }) {
  const fix = (ind) => { for (const p of protect) if (p < len) ind[p] = 1; return ind; };
  const binary = (s) => s.map((v) => (v ? 1 : 0));
  const randomInd = () => Array.from({ length: len }, () => (rng.chance(density) ? 1 : 0));

  let pop = seeds.slice(0, popSize).map((s) => fix(binary(s)));
  while (pop.length < popSize) {
    pop.push(fix(seeds.length && rng.chance(0.6) ? mutate(binary(rng.pick(seeds)), rng, 2 / len) : randomInd()));
  }
  let scored = pop.map((ind) => ({ ind, f: fitness(ind) }));
  const tournament = () => {
    let best = rng.pick(scored);
    for (let i = 0; i < 2; i++) { const c = rng.pick(scored); if (c.f > best.f) best = c; }
    return best.ind;
  };

  for (let g = 0; g < generations; g++) {
    scored.sort((a, b) => b.f - a.f);
    const next = scored.slice(0, 4);
    while (next.length < popSize) {
      const a = tournament(), b = tournament();
      const child = new Array(len);
      for (let s = 0; s < len; s += segment) {
        const src = rng.chance(0.5) ? a : b;
        for (let i = s; i < Math.min(len, s + segment); i++) child[i] = src[i];
      }
      const m = fix(mutate(child, rng, 1.2 / len));
      next.push({ ind: m, f: fitness(m) });
    }
    scored = next;
  }
  scored.sort((a, b) => b.f - a.f);
  return scored[0];
}
