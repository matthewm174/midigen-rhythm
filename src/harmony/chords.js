// Chords: qualities, Roman numerals, chord symbols, diatonic chords from any scale, and voicing.
import { pc12, noteName, parseKey } from './tuning.js';

export const QUALITIES = {
  maj: { iv: [0, 4, 7], sym: '' }, min: { iv: [0, 3, 7], sym: 'm' }, dim: { iv: [0, 3, 6], sym: '°' }, aug: { iv: [0, 4, 8], sym: '+' },
  5: { iv: [0, 7], sym: '5' }, sus2: { iv: [0, 2, 7], sym: 'sus2' }, sus4: { iv: [0, 5, 7], sym: 'sus4' },
  7: { iv: [0, 4, 7, 10], sym: '7' }, maj7: { iv: [0, 4, 7, 11], sym: 'maj7' }, m7: { iv: [0, 3, 7, 10], sym: 'm7' },
  m7b5: { iv: [0, 3, 6, 10], sym: 'ø7' }, dim7: { iv: [0, 3, 6, 9], sym: '°7' }, mM7: { iv: [0, 3, 7, 11], sym: 'm(maj7)' },
  6: { iv: [0, 4, 7, 9], sym: '6' }, m6: { iv: [0, 3, 7, 9], sym: 'm6' }, 9: { iv: [0, 4, 7, 10, 14], sym: '9' },
  maj9: { iv: [0, 4, 7, 11, 14], sym: 'maj9' }, m9: { iv: [0, 3, 7, 10, 14], sym: 'm9' }, add9: { iv: [0, 4, 7, 14], sym: 'add9' },
  madd9: { iv: [0, 3, 7, 14], sym: 'm(add9)' }, m11: { iv: [0, 3, 7, 10, 14, 17], sym: 'm11' }, 13: { iv: [0, 4, 7, 10, 14, 21], sym: '13' },
  '7b9': { iv: [0, 4, 7, 10, 13], sym: '7♭9' }, '7#9': { iv: [0, 4, 7, 10, 15], sym: '7♯9' }, '7sus4': { iv: [0, 5, 7, 10], sym: '7sus4' },
  quartal: { iv: [0, 5, 10], sym: 'q' }, quartal4: { iv: [0, 5, 10, 15], sym: 'q4' },
};

const ROMAN = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const SUFFIX = {
  '': null, 7: '7', maj7: 'maj7', M7: 'maj7', 9: '9', maj9: 'maj9', 6: '6', 5: '5', sus2: 'sus2', sus4: 'sus4', add9: 'add9',
  11: 'm11', 13: '13', '7b9': '7b9', '7#9': '7#9', '7sus4': '7sus4', m7: 'm7',
};

function qualityFor(base, suffix) {
  if (!suffix) return base;
  const minor = base === 'min', dim = base === 'dim';
  switch (suffix) {
    case '7': return minor ? 'm7' : dim ? 'm7b5' : '7';
    case 'maj7': return minor ? 'mM7' : 'maj7';
    case '9': return minor ? 'm9' : '9';
    case 'maj9': return 'maj9';
    case '6': return minor ? 'm6' : '6';
    case 'add9': return minor ? 'madd9' : 'add9';
    default: return SUFFIX[suffix] || suffix;
  }
}

function make(root, q, ctx, extra = {}) {
  const iv = QUALITIES[q].iv.map((x) => ctx.snapIv(root, x));
  return { root, q, iv, ...extra };
}

// Roman numeral relative to the major scale on the tonic: I, bVII, iv7, V7/V, ii°, bII, #iv°7 ...
const ROMAN_RE = /^(bb|b|#|♭|♯)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|o|ø|\+)?(maj7|maj9|M7|m7|7b9|7#9|7sus4|sus2|sus4|add9|13|11|9|7|6|5)?(?:\/(.+))?$/;

export function parseRoman(tok, ctx) {
  const m = ROMAN_RE.exec(tok);
  if (!m) return null;
  let base = 0;
  if (m[5]) {
    const target = parseRoman(m[5], ctx);
    if (!target) return null;
    base = target.root - ctx.tonic;
  }
  const n = ROMAN[m[2].toLowerCase()];
  const acc = !m[1] ? 0 : /#|♯/.test(m[1]) ? 1 : m[1].length === 2 ? -2 : -1;
  const upper = m[2] === m[2].toUpperCase();
  let q = m[3] === '°' || m[3] === 'o' ? (m[4] === '7' ? 'dim7' : 'dim') : m[3] === 'ø' ? 'm7b5' : m[3] === '+' ? 'aug' : upper ? 'maj' : 'min';
  if (!['dim7', 'm7b5'].includes(q)) q = qualityFor(q, m[4]);
  const root = ctx.snapP(ctx.tonic + base + MAJOR_STEPS[n] + acc);
  return make(root, q, ctx, { roman: tok });
}

// Chord symbols: Am7, F#m7b5, Bbmaj7, Dsus4, E5, C/E.
const SYM_RE = /^([A-Ga-g])(#|b|♯|♭)?(maj7|maj9|M7|m7b5|mmaj7|m\(maj7\)|dim7|dim|°7|°|ø7?|aug|\+|m7|m9|m6|m11|madd9|min7|min|m|-7|-|sus2|sus4|7sus4|add9|7b9|7#9|13|11|9|7|6|5)?(?:\/([A-Ga-g](?:#|b|♯|♭)?))?$/;
const SYM_Q = {
  '': 'maj', maj7: 'maj7', maj9: 'maj9', M7: 'maj7', m7b5: 'm7b5', mmaj7: 'mM7', 'm(maj7)': 'mM7', dim7: 'dim7', dim: 'dim', '°7': 'dim7', '°': 'dim',
  ø: 'm7b5', ø7: 'm7b5', aug: 'aug', '+': 'aug', m7: 'm7', min7: 'm7', '-7': 'm7', m9: 'm9', m6: 'm6', m11: 'm11', madd9: 'madd9', min: 'min', m: 'min', '-': 'min',
  sus2: 'sus2', sus4: 'sus4', '7sus4': '7sus4', add9: 'add9', '7b9': '7b9', '7#9': '7#9', 13: '13', 11: 'm11', 9: '9', 7: '7', 6: '6', 5: '5',
};

export function parseSymbol(tok, ctx) {
  const m = SYM_RE.exec(tok);
  if (!m) return null;
  const pc = parseKey(m[1] + (m[2] || ''));
  const root = ctx.snapP(ctx.tonic + pc12(pc - ctx.tonic));
  const c = make(root, SYM_Q[m[3] || ''], ctx, { roman: tok });
  if (m[4]) {
    const b = parseKey(m[4]);
    c.bass = ctx.snapP(root + pc12(b - root)) - root;
  }
  return c;
}

// Diatonic chord on scale degree d (0-based) by stacking every other scale step.
export function diatonicChord(ps, d, size = 3, ctx) {
  const root = ps.pitch(d);
  const iv = [];
  for (let k = 0; k < size; k++) iv.push(ps.pitch(d + 2 * k) - root);
  return { root: pc12(root), q: classify(iv), iv, deg: ((d % ps.n) + ps.n) % ps.n, roman: romanOf(ps, d, iv, ctx) };
}

function classify(iv) {
  const r = iv.map((x) => Math.round(x));
  const micro = iv.some((x, i) => Math.abs(x - r[i]) > 0.2);
  if (!micro) {
    for (const [q, d] of Object.entries(QUALITIES)) if (d.iv.length === r.length && d.iv.every((x, i) => x === r[i])) return q;
  }
  const third = iv[1] ?? 0;
  if (third > 3.25 && third < 3.75) return 'neutral';
  return third >= 3.5 ? 'maj' : 'min';
}

function romanOf(ps, d, iv, ctx) {
  const deg = ((d % ps.n) + ps.n) % ps.n;
  if (ps.n !== 7) return String(deg + 1);
  const names = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
  const off = Math.round(ps.deg[deg] / 100) - MAJOR_STEPS[deg];
  const acc = off < 0 ? 'b' : off > 0 ? '#' : '';
  const n = (iv[1] ?? 4) >= 3.5 ? names[deg].toUpperCase() : names[deg];
  const dim = Math.round(iv[2] ?? 7) === 6 ? '°' : '';
  return `${acc}${n}${dim}${iv.length > 3 ? '7' : ''}`;
}

export function chordSymbol(c) {
  const q = QUALITIES[c.q];
  let sym = noteName(c.root) + (q ? q.sym : c.q === 'neutral' ? 'n' : '');
  if (c.bass) sym += `/${noteName(c.root + c.bass)}`;
  return sym;
}

export const chordPcs = (c) => c.iv.map((x) => pc12(c.root + x));

// Add a seventh / ninth to an existing chord, staying in the pitch space when the chord is diatonic.
export function extend(c, ps, size, ctx) {
  if (c.iv.length >= size || c.q === '5') return c;
  if (c.deg != null) {
    const d = ps.degreeOf(ps.tonic + 12 + pc12(c.root - ps.tonic));
    const e = diatonicChord(ps, d, size, ctx);
    return { ...c, ...e, roman: c.roman + (size === 4 ? '7' : '9'), deg: c.deg };
  }
  const dominant = Math.abs(pc12(c.root - ctx.tonic) - 7) < 0.6 || /\//.test(c.roman || '');
  const map = { maj: size === 4 ? (dominant ? '7' : 'maj7') : 'add9', min: size === 4 ? 'm7' : 'm9', dim: 'm7b5', '7': '9', m7: 'm9', maj7: 'maj9' };
  const q = map[c.q];
  return q ? { ...c, q, iv: QUALITIES[q].iv.map((x) => ctx.snapIv(c.root, x)) } : c;
}

export function withQuality(c, q, ctx) {
  return { ...c, q, iv: QUALITIES[q].iv.map((x) => ctx.snapIv(c.root, x)) };
}

// Context for parsing chords in a pitch space: snapping keeps chord tones on the tuning's grid.
export function chordCtx(ps) {
  return {
    tonic: ps.tonic,
    snapP: (p) => pc12(ps.snap(p)),
    snapIv: (root, x) => {
      const r = ps.snap(root + x) - root;
      return Math.abs(r - x) > 0.6 ? x : r;
    },
  };
}

export function parseChordToken(tok, ps, ctx = chordCtx(ps)) {
  const t = String(tok).trim();
  if (/^[1-9]$/.test(t)) return diatonicChord(ps, Number(t) - 1, 3, ctx);
  return parseRoman(t, ctx) || parseSymbol(t, ctx);
}

// ---------- voicing ----------

// Choose concrete pitches for a chord near the previous voicing (smallest total movement).
// opts: { n, lo, hi, spread 0-1, type: 'close' | 'power' | 'quartal' | 'rootless', rng }
export function voiceChord(c, prev, opts) {
  const { lo, hi, type = 'close', rng } = opts;
  const root = c.root;
  if (type === 'power') {
    let r = root;
    while (r < lo) r += 12;
    while (r >= lo + 12) r -= 12;
    const fifth = c.iv.find((x) => Math.abs(x - 7) < 0.6) ?? 7;
    return opts.n >= 3 ? [r, r + fifth, r + 12] : [r, r + fifth];
  }
  let tones = c.iv.slice();
  if (type === 'quartal' && tones.length >= 3) {
    // Stack fourths from the third (So What voicing feel): third, seventh-ish, ninth...
    tones = [tones[1], tones[1] + 5, tones[1] + 10].map((x) => x);
  }
  if (type === 'rootless' && tones.length >= 4) tones = tones.slice(1);
  const n = Math.max(2, opts.n || 4);
  while (tones.length > n) tones.splice(tones.length > 4 ? 4 : 2, 1);
  const doubles = [0, tones[2] ?? 7, tones[1] ?? 4];
  for (let i = 0; tones.length < n; i++) tones.push(doubles[i % 3] + 12);
  const pcs = tones.map((x) => root + x);

  const cands = [];
  for (let inv = 0; inv < pcs.length; inv++) {
    const order = [...pcs.slice(inv), ...pcs.slice(0, inv)];
    for (let base = lo - 12; base <= hi; base += 12) {
      const v = [];
      let last = -Infinity;
      for (const pc of order) {
        let p = pc12(pc) + base - pc12(base);
        while (p <= last) p += 12;
        v.push(p);
        last = p;
      }
      if (v[0] < lo || v[v.length - 1] > hi + 4) continue;
      if (new Set(v.map((p) => Math.round(p * 1000))).size === v.length) cands.push(v);
      if (v.length >= 4) {
        const d2 = v.slice();
        d2[d2.length - 2] -= 12;
        d2.sort((a, b) => a - b);
        if (d2[0] >= lo - 3 && new Set(d2.map((p) => Math.round(p * 1000))).size === d2.length) cands.push(d2);
      }
    }
  }
  if (!cands.length) return [...new Set(pcs.map((p) => pc12(p) + Math.ceil((lo - pc12(p)) / 12) * 12))].sort((a, b) => a - b);

  const center = (lo + hi) / 2;
  const target = 7 + (opts.spread ?? 0.4) * 14;
  let best = cands[0], bc = Infinity;
  for (const v of cands) {
    let cost = 0;
    if (prev && prev.length) {
      const a = prev.slice().sort((x, y) => x - y);
      for (let i = 0; i < v.length; i++) cost += Math.abs(v[i] - a[Math.min(i, a.length - 1)]);
      cost += Math.abs(v[v.length - 1] - a[a.length - 1]) * 0.5;
    } else cost += Math.abs((v[0] + v[v.length - 1]) / 2 - center);
    cost += Math.abs(v[v.length - 1] - v[0] - target) * 0.4;
    for (let i = 1; i < v.length; i++) if (v[i] < 52 && v[i] - v[i - 1] < 4.5) cost += 3;
    cost += Math.max(0, (v[0] + v[v.length - 1]) / 2 - center - 6) * 0.5 + Math.max(0, center - 6 - (v[0] + v[v.length - 1]) / 2) * 0.5;
    if (rng) cost += rng.next() * 0.6;
    if (cost < bc) { bc = cost; best = v; }
  }
  return best;
}
