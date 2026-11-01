// Chord progressions: style grammars (template phrases + cadences), harmonic rhythm, substitutions and roles.
import { parseChordToken, chordCtx, extend, withQuality, diatonicChord, chordSymbol } from './chords.js';
import { isMinorish } from './scales.js';
import { pc12 } from './tuning.js';

// Roman numerals are relative to the major scale on the tonic (so minor keys write i, bIII, iv, v, bVI, bVII).
// Plain numbers 1-7 are diatonic chords of whatever scale is active (modal grammars).
const G = {
  functional: {
    major: ['I IV V I', 'I vi IV V', 'I ii V I', 'I IV I V', 'I vi ii V', 'I iii IV V', 'I IV ii V', 'I V I IV', 'I V vi IV'],
    minor: ['i iv V i', 'i bVI iv V', 'i ii° V i', 'i iv bVII bIII', 'i V i iv', 'i bVI ii° V', 'i iv i V'],
    cad: { auth: 3, plagal: 1, half: 1, deceptive: 1 },
  },
  hymn: {
    major: ['I IV I V', 'I V vi iii IV I IV V', 'I ii V I', 'I IV V I', 'I vi IV V'],
    minor: ['i iv V i', 'i bIII iv V', 'i bVI iv V'],
    cad: { auth: 3, plagal: 2 },
  },
  baroque: {
    major: ['1 4 7 3 6 2 5 1', 'I IV V I', 'I V vi iii IV I IV V', 'I ii V I', 'I V/V V I', 'I vi ii V'],
    minor: ['i iv bVII bIII bVI ii° V i', 'i iv V i', 'i bVII bVI V', 'i V/V V i', 'i iv ii° V'],
    cad: { auth: 4, half: 1, deceptive: 0.5 },
  },
  classical: {
    major: ['I I IV V', 'I V V I', 'I IV V I', 'I ii V I', 'I vi ii V', 'I V/V V I'],
    minor: ['i i iv V', 'i V V i', 'i iv V i', 'i bVI ii° V'],
    cad: { auth: 4, half: 2 },
  },
  romantic: {
    major: ['I bVI IV V', 'I III IV iv', 'I bIII IV I', 'I vi bVI V', 'I iii vi IV', 'I V/vi vi IV', 'I iv I V'],
    minor: ['i bII V i', 'i bVI bIII bVII', 'i iv bVI V', 'i V/iv iv V', 'i bVI bII V'],
    cad: { auth: 3, plagal: 1, deceptive: 1.5 },
  },
  cinematic: {
    major: ['I V vi IV', 'I iii IV iv', 'I bVI bVII I', 'I bIII IV I', 'I bVI I bVI'],
    minor: ['i bVI bIII bVII', 'i bVI bVII i', 'i iv bVI V', 'i bIII bVII iv', 'i bVI i bVI'],
    cad: { mario: 2, plagal: 1, auth: 1 },
  },
  pop: {
    major: ['I V vi IV', 'vi IV I V', 'I vi IV V', 'IV I V vi', 'I IV vi V', 'I V IV V'],
    minor: ['i bVI bIII bVII', 'i bVII bVI bVII', 'i iv bVI bVII', 'i bIII bVII iv'],
    cad: { auth: 1, plagal: 1, rock: 1 },
  },
  rock: {
    major: ['I bVII IV I', 'I IV V IV', 'I V IV I', 'I bIII IV I', 'I IV I V', 'I bVII bVI bVII', 'I IV bVII IV'],
    minor: ['i bVII bVI bVII', 'i bVI bVII i', 'i iv bVII i', 'i bIII iv bVI', 'i bVII i bVII', 'i bIII bVII IV'],
    cad: { rock: 3, auth: 1, plagal: 1 },
  },
  punk: {
    major: ['I IV V I', 'I V vi IV', 'I IV I V', 'I bVII IV I', 'I V IV V'],
    minor: ['i bVI bIII bVII', 'i bVII bVI bVII', 'i iv bVII i'],
    cad: { auth: 2, rock: 2 },
  },
  metal: {
    major: ['i bII i bII', 'i bVI bVII i', 'i bV i bV', 'i bIII bII i'],
    minor: ['i bII i bII', 'i bVI bVII i', 'i bV i bV', 'i bIII bII i', 'i i bII i', 'i bVI bIII bVII', 'i iv bVI bVII', 'i bVII bVI V'],
    cad: { phrygian: 3, mario: 1, auth: 0.5 },
  },
  doom: {
    major: ['i bVI i bVI', 'i bII i i', 'i bV bVI i'],
    minor: ['i bVI i bVI', 'i bII i i', 'i bV bVI i', 'i iv i bVI', 'i bVII bVI bV'],
    cad: { phrygian: 2, plagal: 2 },
  },
  djent: {
    major: ['1 1 2 1', '1 6 7 6', '1 4 1 2'],
    minor: ['i i bII i', 'i bVI bVII bVI', 'i i bVI bVII', 'i bII bIII bII'],
    cad: { phrygian: 2, modal: 1 },
  },
  blues12: {
    major: ['I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', 'I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', 'I7 IV7 I7 V7'],
    minor: ['i7 iv7 i7 i7 iv7 iv7 i7 i7 bVI7 V7 i7 V7', 'i7 i7 i7 i7 iv7 iv7 i7 i7 bVI7 V7 i7 V7', 'i7 iv7 i7 V7'],
    cad: { blues: 3 }, cycle: true,
  },
  jazz: {
    major: ['ii7 V7 Imaj7 Imaj7', 'Imaj7 vi7 ii7 V7', 'iii7 vi7 ii7 V7', 'Imaj7 VI7 ii7 V7', 'ii7 V7 iii7 VI7', 'Imaj7 IV7 iii7 VI7', 'ii7 bII7 Imaj7 Imaj7'],
    minor: ['iiø7 V7 i7 i7', 'i7 iv7 bVII7 bIIImaj7', 'i7 bVImaj7 iiø7 V7', 'iiø7 V7 i7 iv7'],
    cad: { jazz: 4 },
  },
  bossa: {
    major: ['Imaj7 II7 ii7 V7', 'ii7 V7 Imaj7 VI7', 'Imaj7 bII7 Imaj7 bII7', 'Imaj7 iv7 iii7 VI7'],
    minor: ['i7 IV7 i7 IV7', 'iiø7 V7 i7 bVI7', 'i7 iv7 iiø7 V7'],
    cad: { jazz: 3 },
  },
  gospel: {
    major: ['I iii vi IV', 'IV V iii vi ii V I I', 'I I7 IV iv', 'I V/vi vi IV', 'IV iv I vi'],
    minor: ['i iv bVII bIII', 'i bVI iv V'],
    cad: { plagal: 3, auth: 2 },
  },
  soul: {
    major: ['Imaj7 IV7 Imaj7 IV7', 'ii7 V7 Imaj7 vi7', 'Imaj7 iii7 IVmaj7 V7', 'IVmaj7 iii7 ii7 Imaj7'],
    minor: ['i7 IV7 i7 IV7', 'i7 bVII7 bVImaj7 V7', 'i9 iv9'],
    cad: { plagal: 2, jazz: 1 },
  },
  lofi: {
    major: ['IVmaj7 iii7 ii7 Imaj7', 'ii9 V9 Imaj9 vi9', 'Imaj7 vi7 IVmaj7 V7', 'IVmaj7 V7 iii7 vi7'],
    minor: ['i9 iv9 bVIImaj7 bIIImaj7', 'i7 bVImaj7 iv7 V7'],
    cad: { plagal: 2, jazz: 1 },
  },
  funk: {
    major: ['I7 I7 IV7 I7', 'I9 I9 I9 IV9', 'I7 bVII7 I7 bVII7'],
    minor: ['i7 i7 IV7 i7', 'i7 IV7', 'i9 i9 iv9 i9', 'i7 bVII7 i7 bVII7'],
    cad: { modal: 1 }, cycle: true,
  },
  reggae: {
    major: ['I IV V IV', 'I V vi IV', 'I ii IV V', 'I IV I V'],
    minor: ['i bVII i bVII', 'i iv i iv', 'i bVI bVII i'],
    cad: { plagal: 2, rock: 1 },
  },
  country: {
    major: ['I IV I V', 'I I IV IV I I V I', 'I V I IV', 'I IV V I', 'I V/V V I'],
    minor: ['i iv i V', 'i bVII i bVII'],
    cad: { auth: 3, plagal: 1 },
  },
  folk: {
    major: ['I IV I V', 'I V vi IV', 'I bVII IV I', '1 7 1 7', '1 4 1 5'],
    minor: ['i bVII i bVII', 'i bIII bVII i', 'i iv i bVII', '1 7 1 7'],
    cad: { auth: 1, modal: 2, plagal: 1 },
  },
  celtic: {
    major: ['I bVII I bVII', 'I IV I V', '1 7 1 7', 'vi IV I V', '1 4 1 5'],
    minor: ['i bVII i bVII', 'i bVII bVI bVII', '1 7 1 7', 'i bIII bVII i'],
    cad: { modal: 3, auth: 1 },
  },
  edm: {
    major: ['vi IV I V', 'I V vi IV', 'IV V vi vi'],
    minor: ['i bVI bIII bVII', 'i bVII bVI bVII', 'i iv bVI bVII', 'i bVI iv bVII'],
    cad: { rock: 2, mario: 1 }, cycle: true,
  },
  synthwave: {
    major: ['vi IV I V', 'I bVI bVII I'],
    minor: ['i bVI bIII bVII', 'i bVI bVII i', 'i bVI iv bVII'],
    cad: { mario: 2, rock: 1 }, cycle: true,
  },
  latin: {
    major: ['I IV V IV', 'I V7 V7 I', 'ii7 V7 Imaj7 Imaj7'],
    minor: ['i iv V i', 'i bVII bVI V', 'i iv bVII bIII'],
    cad: { auth: 2 }, cycle: true,
  },
  modal: {
    major: ['1 2', '1 4', '1 7', '1 4 1 7', '1 2 1 7', '1 1 4 1', '1 6 7 1'],
    minor: ['1 2', '1 4', '1 7', '1 4 1 7', '1 2 1 7', '1 1 4 1', '1 6 7 1'],
    cad: { modal: 3 }, cycle: true,
  },
  minimalist: {
    major: ['1 1 6 6', '1 4 1 4', '1 6 4 5', '1 5 6 4'],
    minor: ['1 1 6 6', '1 7 6 7', '1 4 1 4', '1 6 3 7'],
    cad: { modal: 1 }, cycle: true,
  },
  impressionist: {
    major: ['Imaj9 bVIImaj9 bVImaj9 bVIImaj9', 'Imaj7 IImaj7', 'Imaj7 bIIImaj7 IVmaj7 bIIImaj7', 'Imaj9 iii7 IVmaj9 IImaj7', '1 2 1 2'],
    minor: ['i9 bVIImaj7 bVImaj7 bVIImaj7', 'i7 IV9', 'i9 bIIImaj7 IVmaj7 bIIImaj7'],
    cad: { plagal: 2, modal: 2 },
  },
  renaissance: {
    major: ['1 4 1 5', '1 6 4 5 1', '1 3 6 4 5 1', '1 7 1', '6 3 4 1', '1 5 6 3 4 1 4 5'],
    minor: ['1 4 1 5', '1 6 4 5 1', '1 7 1 4', '1 3 7 1', '1 6 3 7'],
    cad: { modal: 2, auth: 2, plagal: 1 }, picardy: 0.5,
  },
  medieval: {
    major: ['1 1 7 1', '1 2 1', '1 4 5 1', '1 7 6 7', '1 5 1 4'],
    minor: ['1 1 7 1', '1 2 1', '1 4 5 1', '1 7 6 7', '1 5 1 4'],
    cad: { modal: 3, double: 2 },
  },
  andalusian: {
    major: ['iv bIII bII I', 'I bII I bII', 'iv bIII bII I', 'bII I bII I'],
    minor: ['iv bIII bII I', 'I bII I bII', 'iv bIII bII I'],
    cad: { phrygian: 4 }, cycle: true,
  },
  klezmer: {
    major: ['I iv I I', 'I bII I I', 'I bVII I bII', 'iv I bII I', 'I iv bVII bIII'],
    minor: ['I iv I I', 'I bII I I', 'I bVII I bII'],
    cad: { phrygian: 3 },
  },
  lament: {
    major: ['vi V IV III', 'i bVII bVI V'],
    minor: ['i bVII bVI V', 'i v bVI V', 'i bVII bVI V i bVII bVI V'],
    cad: { half: 2, auth: 1 }, cycle: true,
  },
  pachelbel: {
    major: ['I V vi iii IV I IV V'],
    minor: ['i v bVI bIII iv i iv V'],
    cad: { half: 1 }, cycle: true,
  },
  drone: { major: ['1'], minor: ['1'], cad: {}, cycle: true },
  row: { major: ['row'], minor: ['row'], cad: {}, cycle: true },
};
export const GRAMMARS = Object.keys(G);

const CAD = {
  auth: { major: ['V', 'I'], minor: ['V', 'i'] },
  plagal: { major: ['IV', 'I'], minor: ['iv', 'i'] },
  half: { major: ['IV', 'V'], minor: ['iv', 'V'] },
  deceptive: { major: ['V', 'vi'], minor: ['V', 'bVI'] },
  rock: { major: ['bVII', 'I'], minor: ['bVII', 'i'] },
  mario: { major: ['bVI', 'bVII', 'I'], minor: ['bVI', 'bVII', 'i'] },
  phrygian: { major: ['bII', 'I'], minor: ['bII', 'i'] },
  modal: { major: ['7', '1'], minor: ['7', '1'] },
  double: { major: ['2', '1'], minor: ['2', '1'] },
  jazz: { major: ['ii7', 'V7', 'Imaj7'], minor: ['iiø7', 'V7', 'i7'] },
  blues: { major: ['V7', 'IV7', 'I7'], minor: ['V7', 'bVI7', 'i7'] },
};
// Ending on the dominant (or its stand-in) so the loop leads back to the top.
const TURN = {
  default: { major: ['ii', 'V'], minor: ['iv', 'V'] }, rock: { major: ['IV', 'V'], minor: ['bVI', 'bVII'] },
  modal: { major: ['6', '7'], minor: ['6', '7'] }, jazz: { major: ['ii7', 'V7'], minor: ['iiø7', 'V7'] }, phrygian: { major: ['bII'], minor: ['bII'] },
  blues: { major: ['V7'], minor: ['V7'] }, mario: { major: ['bVI', 'bVII'], minor: ['bVI', 'bVII'] },
};
const TURN_FOR = { rock: 'rock', punk: 'rock', pop: 'rock', edm: 'mario', synthwave: 'mario', cinematic: 'mario', modal: 'modal', minimalist: 'modal', celtic: 'modal', folk: 'modal', medieval: 'modal', renaissance: 'modal', jazz: 'jazz', bossa: 'jazz', soul: 'jazz', lofi: 'jazz', funk: 'modal', metal: 'phrygian', doom: 'phrygian', djent: 'phrygian', andalusian: 'phrygian', klezmer: 'phrygian', blues12: 'blues' };

// Harmonic rhythm: chord slots over a part, aligned to bars and beats.
export function chordSlots(meter, len, hr) {
  const bpc = 2 ** Math.round(Math.max(-2, Math.min(2, hr)));
  const slots = [];
  const { barLen, beatStarts } = meter;
  if (bpc >= 1) {
    const L = barLen * bpc;
    for (let t = 0; t < len; t += L) slots.push({ t, len: Math.min(L, len - t) });
    return slots;
  }
  const k = Math.round(1 / bpc);
  const nb = beatStarts.length;
  const cuts = [...new Set(Array.from({ length: k }, (_, i) => beatStarts[Math.min(nb - 1, Math.round((i * nb) / k))]))].sort((a, b) => a - b);
  for (let bar = 0; bar < len; bar += barLen) {
    cuts.forEach((c, i) => {
      const t = bar + c;
      const end = Math.min(len, bar + (cuts[i + 1] ?? barLen));
      if (t < end) slots.push({ t, len: end - t });
    });
  }
  return slots;
}

// 12-tone row for serial styles: chords are row trichords.
function makeRow(rng) { return rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); }

function rowChords(row, n, ps, form) {
  const r = form === 'R' ? row.slice().reverse() : form === 'I' ? row.map((x) => (12 - x) % 12) : row;
  const out = [];
  for (let i = 0; i < n; i++) {
    const tri = [0, 1, 2].map((k) => r[(i * 3 + k) % 12]);
    const root = pc12(ps.tonic + tri[0]);
    out.push({ root, q: 'row', iv: tri.map((x) => pc12(x - tri[0])), roman: tri.map((x) => '0123456789TE'[x]).join(''), row: true });
  }
  return out;
}

// One part's progression. ctx: { meter, part, hp, ps, rng, grammar, motif (progression of the motif part), isLast, spec, role }
export function genProgression(ctx) {
  const { meter, part, hp, ps, rng, grammarId, role, isLast, chart } = ctx;
  const cctx = chordCtx(ps);
  const family = isMinorish(ps.deg) ? 'minor' : 'major';
  const gram = G[grammarId] || G.functional;
  const slots = chordSlots(meter, part.len, hp.hr);
  const n = slots.length;
  const trace = [];
  let tokens;

  if (chart && chart.length) {
    const parsed = chart.map((t) => [t, parseChordToken(t, ps, cctx)]);
    const bad = parsed.filter(([, c]) => !c).map(([t]) => t);
    if (bad.length) ctx.warnings.push(`chords: didn't recognize ${bad.join(', ')}`);
    const good = parsed.filter(([, c]) => c).map(([, c]) => c);
    if (good.length) {
      const chords = slots.map((s, i) => ({ ...s, ...good[i % good.length] }));
      return finish(chords, ctx, 'chart', cctx);
    }
  }

  if (grammarId === 'row') {
    ctx.row ||= makeRow(rng);
    const cs = rowChords(ctx.row, n, ps, rng.pick(['P', 'R', 'I']));
    return finish(slots.map((s, i) => ({ ...s, ...cs[i] })), ctx, 'row', cctx);
  }

  const reuse = ctx.motif && (role === 'variation' || (role === 'fill' && rng.chance(0.4)));
  if (reuse) {
    tokens = slots.map((_, i) => ctx.motif.tokens[i % ctx.motif.tokens.length]);
    trace.push('motif');
  } else {
    const list = gram[family];
    tokens = [];
    let avoid = role === 'contrast' && ctx.motif ? ctx.motif.template : null;
    while (tokens.length < n) {
      const fits = list.filter((t) => t !== avoid);
      const tpl = rng.pick(fits.length ? fits : list);
      if (!trace.length) trace.push(tpl);
      avoid = null;
      tokens.push(...tpl.split(' '));
      if (gram.cycle && tokens.length >= n) break;
    }
    tokens = tokens.slice(0, n);
  }

  // Cadence or turnaround at the end of the part.
  const strong = rng.chance(0.35 + 0.65 * hp.cadence);
  const turn = isLast || role === 'build' || role === 'fill';
  if (n >= 2 && strong && !['drone', 'row', 'blues12'].includes(grammarId) && (!gram.cycle || turn)) {
    let f;
    if (turn) f = (TURN[TURN_FOR[grammarId]] || TURN.default)[family];
    else f = (CAD[rng.weighted(Object.keys(gram.cad), (k) => gram.cad[k]) || 'auth'] || CAD.auth)[family];
    if (f && f.length <= n) {
      for (let i = 0; i < f.length; i++) tokens[n - f.length + i] = f[i];
      trace.push(turn ? `turn ${f.join(' ')}` : `cadence ${f.join(' ')}`);
    }
  }

  let chords = tokens.map((tok, i) => ({ ...slots[i], ...(parseChordToken(tok, ps, cctx) || diatonicChord(ps, 0, 3, cctx)), tok }));

  // Picardy third: a minor-mode piece ending on a major tonic.
  if (gram.picardy && family === 'minor' && !turn && rng.chance(gram.picardy)) {
    const last = chords[n - 1];
    if (Math.abs(pc12(last.root - ps.tonic)) < 0.3 || Math.abs(pc12(last.root - ps.tonic) - 12) < 0.3) chords[n - 1] = { ...last, ...withQuality(last, 'maj', cctx), roman: 'I' };
  }
  const out = finish(chords, ctx, trace.join(' · '), cctx);
  out.tokens = tokens;
  out.template = trace[0];
  return out;
}

function finish(chords, ctx, trace, cctx) {
  const { hp, rng, ps, grammarId } = ctx;
  const jazzy = ['jazz', 'bossa', 'soul', 'lofi', 'blues12', 'funk'].includes(grammarId);
  // Secondary dominant before a chord that isn't the tonic.
  if (!jazzy && !['drone', 'modal', 'medieval', 'row', 'minimalist'].includes(grammarId)) {
    for (let i = 1; i < chords.length; i++) {
      const target = chords[i];
      if (target.row || target.q === 'dim' || pc12(target.root - ps.tonic) < 0.5 || !rng.chance(hp.chromatic * 0.35)) continue;
      chords[i - 1] = { ...chords[i - 1], ...secondary(target, cctx), sub: 'V/' };
    }
  }
  chords = chords.map((c) => {
    if (c.row || grammarId === 'drone') return c;
    let x = c;
    if (x.q !== '5' && rng.chance(hp.sus * 0.5) && x.iv.length === 3) x = { ...x, ...withQuality(x, rng.chance(0.5) ? 'sus4' : 'sus2', cctx) };
    if (jazzy && x.q === '7' && rng.chance(hp.chromatic * 0.3) && Math.abs(pc12(x.root - ps.tonic) - 7) < 0.5) x = { ...x, root: pc12(x.root + 6), roman: 'bII7', sub: 'tritone' };
    if (rng.chance(hp.seventh) && x.iv.length === 3 && !['sus4', 'sus2', 'aug'].includes(x.q)) x = extend(x, ps, 4, cctx);
    if (rng.chance(hp.ext * 0.6) && x.iv.length === 4) x = extend(x, ps, 5, cctx);
    if (hp.power > 0.5 && rng.chance(hp.power)) x = { ...x, ...withQuality(x, '5', cctx) };
    return x;
  });
  // Pedal point: the bass holds the tonic (or the dominant before a turnaround).
  const pedal = rng.chance(hp.pedal * 0.6);
  const pedalPc = ctx.role === 'build' ? pc12(ps.tonic + 7) : pc12(ps.tonic);
  for (const c of chords) {
    c.sym = c.row ? c.roman : chordSymbol(c);
    if (pedal) c.pedal = pedalPc;
  }
  return { chords, trace: trace + (pedal ? ' · pedal' : ''), tokens: chords.map((c) => c.tok || c.roman), template: trace };
}

function secondary(target, cctx) {
  const root = cctx.snapP(target.root + 7);
  return { root, q: '7', iv: [0, 4, 7, 10].map((x) => cctx.snapIv(root, x)), roman: `V7/${target.roman || '?'}` };
}

export function chordAt(prog, t) {
  const cs = prog.chords;
  for (let i = cs.length - 1; i >= 0; i--) if (t >= cs[i].t) return cs[i];
  return cs[0];
}

export function nextChord(prog, t) {
  return prog.chords.find((c) => c.t > t) || null;
}
