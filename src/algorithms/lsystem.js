// L-systems: string rewriting, plus a span-subdividing (parametric) L-system for rhythms.

export function expandLSystem(axiom, rules, iterations, rng = null, maxLen = 4096) {
  let s = axiom;
  for (let i = 0; i < iterations && s.length < maxLen; i++) {
    let next = '';
    for (const ch of s) {
      const r = rules[ch];
      if (r === undefined) next += ch;
      else if (typeof r === 'string') next += r;
      else next += rng ? rng.weighted(r, (o) => o[1])[0] : r[0][0];
    }
    s = next;
  }
  return s;
}

// Symbols: A = active span (rewrites further), H = hit (terminal), R = rest (terminal).
// A span of length L rewrites into children of equal length, e.g. A -> A A, A -> R A, A -> A A A.
export function lsysRhythm(len, rng, { density = 0.5, syncopation = 0.3, top = null } = {}) {
  const out = new Array(len).fill(0);
  const roots = top || [[0, len]];

  const rewrite = (s, l, depth) => {
    if (l <= 1) { out[s] = Math.max(out[s], 1 - 0.15 * depth); return 'H'; }
    const opts = [['H', (1 - density) * 1.2]];
    let parts = null;
    if (l % 2 === 0) {
      opts.push(['AA', density * 1.3], ['AR', (1 - syncopation) * 0.7], ['RA', syncopation * 0.9], ['HA', density * 0.6]);
    }
    if (l % 3 === 0) {
      opts.push(['AAA', density], ['ARA', 0.3 + syncopation * 0.3], ['RAA', syncopation * 0.6], ['HRA', 0.3]);
    }
    if (l % 2 !== 0 && l % 3 !== 0) {
      parts = Array(Math.floor(l / 2)).fill(2);
      parts[parts.length - 1] = 3;
      opts.push(['*', density * 1.5]);
    }
    const [rule] = rng.weighted(opts, (o) => o[1]);
    if (rule === 'H') { out[s] = Math.max(out[s], 1 - 0.15 * depth); return 'H'; }
    if (rule === '*') {
      let p = s;
      const kids = parts.map((pl) => { const r = rewrite(p, pl, depth + 1); p += pl; return r; });
      return `[${kids.join(' ')}]`;
    }
    const cl = l / rule.length;
    const kids = [...rule].map((sym, i) => {
      const cs = s + i * cl;
      if (sym === 'R') return '.';
      if (sym === 'H') { out[cs] = Math.max(out[cs], 1 - 0.15 * (depth + 1)); return 'H'; }
      return rewrite(cs, cl, depth + 1);
    });
    return `[${kids.join(' ')}]`;
  };

  const trace = roots.map(([s, l]) => rewrite(s, l, 0)).join(' ');
  return { pattern: out, trace };
}

// A tiny L-system over voice indices -> self-similar melodic orders for toms.
export function voiceMelody(n, voices, rng) {
  const syms = 'abcdefgh'.slice(0, voices);
  const rules = {};
  for (let i = 0; i < voices; i++) {
    const up = syms[(i + 1) % voices], down = syms[(i + voices - 1) % voices], me = syms[i];
    rules[me] = rng.pick([me + up, me + down, up + me, me + me + down, down + up]);
  }
  let s = expandLSystem(syms[0], rules, 1);
  while (s.length < n) s = expandLSystem(s, rules, 1);
  return [...s.slice(0, n)].map((c) => syms.indexOf(c));
}
