// Time signature parsing and the metric hierarchy: tatum (sub-beat) -> beat -> bar -> hypermeter.

const TOP = 6;

function defaultGroups(num, den) {
  if (den <= 4) return Array(num).fill(1);
  if (num % 3 === 0 && num > 3) return Array(num / 3).fill(3);
  if (num <= 3) return [num];
  const g = Array(Math.floor(num / 2)).fill(2);
  if (num % 2 === 1) g[g.length - 1] = 3;
  return g;
}

function subdivide(w, start, len, level) {
  w[start] = Math.max(w[start], level);
  if (len <= 1) return;
  let parts;
  if (len % 3 === 0) parts = [len / 3, len / 3, len / 3];
  else if (len % 2 === 0) parts = [len / 2, len / 2];
  else {
    parts = Array(Math.floor(len / 2)).fill(2);
    parts[parts.length - 1] = 3;
  }
  let s = start;
  for (const p of parts) {
    subdivide(w, s, p, level - 1);
    s += p;
  }
}

// Fractional numerators (3.5/4) become the equivalent whole-number meter (7/8), approximated past 1/16 steps.
function wholeNumerator(num, den) {
  for (let k = 1; k <= 16; k *= 2) if (Math.abs(num * k - Math.round(num * k)) < 1e-9) return [Math.round(num * k), den * k, false];
  return [Math.max(1, Math.round(num * 16)), den * 16, true];
}

export function parseMeter(text, resolution = 16) {
  const m = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*\/\s*(\d+)\s*(?:\(\s*([\d+\s]+?)\s*\))?\s*$/.exec(text || '');
  if (!m) throw new Error(`Can't read time signature "${text}". Try 4/4, 7/8 (2+2+3), 12/8, 9/17.`);
  const [num, den, approx] = wholeNumerator(+m[1], +m[2]);
  if (+m[2] < 1 || +m[2] > 64) throw new Error(`Denominator ${m[2]} is out of range (1-64).`);
  if (num < 1 || num > 64) throw new Error(`Numerator ${m[1]} is out of range.`);
  if (m[3] && num !== +m[1]) throw new Error('A grouping needs a whole-number numerator.');
  // Irrational meters (x/17, x/12, x/5…): a 1/den note is played on the nearest power-of-two grid
  // below it, sped up by den/unit. 9/17 at ♩=T sounds exactly like 9/16 at ♩=T·17/16.
  let unit = 1;
  while (unit * 2 <= den && resolution % (unit * 2) === 0) unit *= 2;
  const tempoScale = den / unit;
  const tpd = resolution / unit;

  let groups = defaultGroups(num, den);
  if (m[3]) {
    groups = m[3].split('+').map((s) => parseInt(s, 10)).filter((n) => n > 0);
    const sum = groups.reduce((a, b) => a + b, 0);
    if (sum !== num) throw new Error(`Grouping ${m[3]} adds up to ${sum}, not ${num}.`);
  }

  const barLen = num * tpd;
  const beatStarts = [];
  const beatLens = [];
  let s = 0;
  for (const g of groups) {
    beatStarts.push(s);
    beatLens.push(g * tpd);
    s += g * tpd;
  }

  const w = new Array(barLen).fill(0);
  w[0] = TOP;
  groups.forEach((g, i) => {
    const bs = beatStarts[i];
    w[bs] = Math.max(w[bs], TOP - 1);
    if (g > 1) for (let u = 0; u < g; u++) subdivide(w, bs + u * tpd, tpd, TOP - 2);
    else subdivide(w, bs, tpd, TOP - 1);
  });
  if (groups.length >= 4 && groups.length % 2 === 0) {
    const mid = beatStarts[groups.length / 2];
    w[mid] = Math.max(w[mid], TOP - 0.5);
  }
  const minW = Math.min(...w);
  const weights = w.map((x) => (x - minW) / (TOP - minW));

  return {
    text: `${num}/${den}${m[3] ? ` (${groups.join('+')})` : ''}`,
    num, den, unit, tempoScale, irrational: tempoScale !== 1, approx, groups, resolution, tpd, barLen, beatStarts, beatLens,
    compound: den >= 8 && num % 3 === 0 && num > 3,
    weights,
  };
}

// Hypermetric weight of a bar inside a phrase (bar 0 strongest, then mid-phrase).
export function barWeight(barIndex, bars) {
  if (barIndex === 0) return 1;
  if (bars >= 4 && barIndex % 4 === 0) return 0.85;
  if (barIndex % 2 === 0) return 0.7;
  return 0.5;
}

// Metric weights for an arbitrary cycle length (polymetric lanes carry their own little hierarchy).
export function genericWeights(len, beatLen) {
  const w = new Array(len).fill(0);
  w[0] = TOP;
  for (let s = 0; s < len; s += beatLen) {
    const l = Math.min(beatLen, len - s);
    subdivide(w, s, l, TOP - 1);
  }
  const minW = Math.min(...w);
  return w.map((x) => (x - minW) / (TOP - minW || 1));
}

const FRACTIONS = { e: 1 / 4, '&': 1 / 2, and: 1 / 2, a: 3 / 4, la: 1 / 3, li: 2 / 3 };

// Tokens like "1", "&", "2&", "3e", "4a", "1la", "beats", "offbeats", "@5" -> tatum offsets within a bar.
export function resolvePositions(tokens, meter) {
  const out = new Set();
  const nBeats = meter.beatStarts.length;
  const at = (beat, frac) => {
    const off = meter.beatStarts[beat] + Math.round(frac * meter.beatLens[beat]);
    if (off < meter.barLen) out.add(off);
  };
  for (const raw of tokens) {
    const tok = raw.toLowerCase();
    if (tok === 'beats' || tok === 'all') { for (let b = 0; b < nBeats; b++) at(b, 0); continue; }
    if (tok === 'offbeats' || tok === 'off') { for (let b = 0; b < nBeats; b++) at(b, 0.5); continue; }
    if (tok.startsWith('@')) {
      const n = parseInt(tok.slice(1), 10);
      if (n >= 0 && n < meter.barLen) out.add(n);
      continue;
    }
    const m = /^(\d+)?(e|&|and|a|la|li)?$/.exec(tok);
    if (!m || (!m[1] && !m[2])) continue;
    const frac = m[2] ? FRACTIONS[m[2]] : 0;
    if (m[1]) {
      const b = parseInt(m[1], 10) - 1;
      if (b >= 0 && b < nBeats) at(b, frac);
    } else {
      for (let b = 0; b < nBeats; b++) at(b, frac);
    }
  }
  return [...out].sort((a, b) => a - b);
}
