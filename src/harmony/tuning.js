// Tunings and the pitch space. Pitches are float MIDI numbers (60 = middle C, 60.5 = a quarter tone above).
// Everything stays in 12-tone equal temperament unless microtones are switched on.

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const edo = (n) => Array.from({ length: n }, (_, i) => (i * 1200) / n);
const ratio = (r) => 1200 * Math.log2(r);
const fifthsChain = (fifth, from = -3) => {
  const out = new Array(12);
  for (let k = from; k < from + 12; k++) out[(((7 * k) % 12) + 12) % 12] = (((k * fifth) % 1200) + 1200) % 1200;
  return out;
};

// relative: true -> the table is measured from the tonic; false -> from C (historical keyboard temperaments).
export const TUNINGS = {
  '12tet': { name: '12-tone equal', cents: edo(12), relative: false },
  '24edo': { name: 'Quarter tones (24-EDO)', cents: edo(24), relative: true },
  '19edo': { name: '19-EDO', cents: edo(19), relative: true },
  '22edo': { name: '22-EDO', cents: edo(22), relative: true },
  '31edo': { name: '31-EDO (meantone-like)', cents: edo(31), relative: true },
  '53edo': { name: '53-EDO (Turkish makam)', cents: edo(53), relative: true },
  just: { name: 'Just intonation (5-limit)', relative: true, cents: [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8].map(ratio) },
  pythagorean: { name: 'Pythagorean', relative: true, cents: [1, 256 / 243, 9 / 8, 32 / 27, 81 / 64, 4 / 3, 729 / 512, 3 / 2, 128 / 81, 27 / 16, 16 / 9, 243 / 128].map(ratio) },
  meantone: { name: 'Quarter-comma meantone', relative: false, cents: fifthsChain(1200 * Math.log2(5) / 4) },
  werckmeister: { name: 'Werckmeister III', relative: false, cents: [0, 90.225, 192.18, 294.135, 390.225, 498.045, 588.27, 696.09, 792.18, 888.27, 996.09, 1092.18] },
  shruti: { name: '22 shruti (Indian)', relative: true, cents: [0, 90.2, 111.7, 182.4, 203.9, 294.1, 315.6, 386.3, 407.8, 498, 519.6, 590.2, 611.7, 702, 792.2, 813.7, 884.4, 905.9, 996.1, 1017.6, 1088.3, 1109.8] },
  slendro: { name: 'Slendro (gamelan, approx.)', relative: true, cents: [0, 231, 474, 717, 955] },
  pelog: { name: 'Pelog (gamelan, approx.)', relative: true, cents: [0, 120, 270, 540, 670, 785, 950] },
  free: { name: 'Exact scale (no snapping)', relative: true, cents: null },
};
export const TUNING_IDS = Object.keys(TUNINGS);

export const pc12 = (p) => ((p % 12) + 12) % 12;

export function noteName(p, { octave = false } = {}) {
  const n = Math.round(p);
  const dev = Math.round((p - n) * 100);
  return `${NOTE_NAMES[pc12(n)]}${octave ? Math.floor(n / 12) - 1 : ''}${dev ? `${dev > 0 ? '+' : ''}${dev}¢` : ''}`;
}

export function parseKey(text) {
  const m = /^\s*([A-Ga-g])\s*(#|♯|b|♭|-?sharp|-?flat)?\s*$/.exec(String(text || ''));
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  const acc = !m[2] ? 0 : /#|♯|sharp/.test(m[2]) ? 1 : -1;
  return pc12(base + acc);
}

// scaleCents: degrees of the scale in cents above the tonic. key: tonic pitch class 0-11.
export function makePitchSpace({ key = 0, scaleCents, tuning = '12tet' }) {
  const T = TUNINGS[tuning] || TUNINGS['12tet'];
  const origin = T.relative ? key * 100 : 0;
  const snapCents = (abs) => {
    if (!T.cents) return abs;
    const rel = abs - origin;
    const oct = Math.floor(rel / 1200);
    const r = rel - oct * 1200;
    let best = 0, bd = Infinity;
    for (const c of [...T.cents, 1200]) {
      const d = Math.abs(c - r);
      if (d < bd) { bd = d; best = c; }
    }
    return origin + oct * 1200 + best;
  };
  const tonicC = snapCents(key * 100);
  const deg = [...new Set(scaleCents.map((c) => {
    const r = Math.round((snapCents(tonicC + c) - tonicC) * 1000) / 1000;
    return ((r % 1200) + 1200) % 1200;
  }))].sort((a, b) => a - b);
  const n = deg.length;
  const tonic = tonicC / 100;

  const ps = {
    key, tuning, micro: tuning !== '12tet', tonic, deg, n,
    snap: (p) => snapCents(p * 100) / 100,
    pitch: (d) => tonic + 12 * Math.floor(d / n) + deg[((d % n) + n) % n] / 100,
    // Nearest scale degree to a pitch.
    degreeOf(p) {
      const oct = Math.floor((p - tonic) / 12);
      let best = 0, bd = Infinity;
      for (let o = oct - 1; o <= oct + 1; o++) {
        for (let i = 0; i < n; i++) {
          const d = Math.abs(tonic + 12 * o + deg[i] / 100 - p);
          if (d < bd) { bd = d; best = o * n + i; }
        }
      }
      return best;
    },
    inScale: (p) => Math.abs(ps.pitch(ps.degreeOf(p)) - p) < 0.06,
    degreesIn(lo, hi) {
      const out = [];
      for (let d = ps.degreeOf(lo) - 1; ps.pitch(d) <= hi + 1e-9; d++) if (ps.pitch(d) >= lo - 1e-9) out.push(d);
      return out;
    },
    // All pitches in [lo, hi] whose pitch class is in pcs (floats mod 12).
    pitchesIn(pcs, lo, hi) {
      const out = [];
      for (const pc of pcs) for (let p = pc12(pc) + 12 * Math.floor(lo / 12) - 12; p <= hi + 1e-9; p += 12) if (p >= lo - 1e-9) out.push(p);
      return [...new Set(out.map((x) => Math.round(x * 1000) / 1000))].sort((a, b) => a - b);
    },
  };
  return ps;
}

// The same scale on another tonic (modulation).
export function transposeSpace(ps, newKey) {
  return makePitchSpace({ key: pc12(newKey), scaleCents: ps.deg, tuning: ps.tuning });
}
