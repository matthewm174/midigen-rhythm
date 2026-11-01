// Voices over a progression and a drum part: bass (locked to the kick), comping (the rhythm section,
// locked to snare / timekeeper), and melody (generate-and-test over the chords).
// Notes are { t (tatum in part), d (tatums), p (float MIDI pitch), v (0-1 strength), o? (strum offset in tatums) }.
import { clamp } from '../core/rng.js';
import { pc12, noteName } from './tuning.js';
import { chordPcs, voiceChord } from './chords.js';
import { chordAt, nextChord } from './progression.js';

const near = (pcs, target, lo, hi, ps) => {
  const cands = ps.pitchesIn(pcs, lo, hi);
  if (!cands.length) return target;
  let best = cands[0];
  for (const c of cands) if (Math.abs(c - target) < Math.abs(best - target)) best = c;
  return best;
};
const isTone = (p, pcs) => pcs.some((pc) => { const d = pc12(p - pc); return d < 0.15 || d > 11.85; });
const range = (notes) => {
  if (!notes.length) return '';
  const ps = notes.map((n) => n.p);
  return `${noteName(Math.min(...ps), { octave: true })}–${noteName(Math.max(...ps), { octave: true })}`;
};

function helpers(ctx) {
  const { meter, part } = ctx;
  const { barLen, resolution } = meter;
  const w = (t) => meter.weights[((t % barLen) + barLen) % barLen];
  const unit = (div) => Math.max(1, Math.round(resolution / div));
  const onGrid = (t, u) => ((t % barLen) % u) === 0;
  const hits = (lane, pred = () => true) => {
    const arr = part.lanes?.[lane] || [];
    const out = [];
    for (let t = 0; t < part.len; t++) if (arr[t] && pred(arr[t], t)) out.push({ t, s: arr[t].s ?? 0.8, art: arr[t].art });
    return out;
  };
  const beats = () => {
    const out = [];
    for (let bar = 0; bar < part.len; bar += barLen) meter.beatStarts.forEach((b, i) => { if (bar + b < part.len) out.push({ t: bar + b, i, len: meter.beatLens[i] }); });
    return out;
  };
  const gridPts = (u) => { const out = []; for (let t = 0; t < part.len; t++) if (onGrid(t, u)) out.push(t); return out; };
  const durs = (ons, legato, minD = 1) => ons.map((t, i) => Math.max(minD, ((ons[i + 1] ?? part.len) - t) * legato));
  return { w, unit, onGrid, hits, beats, gridPts, durs, barLen };
}

const uniqSorted = (arr) => [...new Set(arr)].sort((a, b) => a - b);

// ---------- bass ----------

export function genBass(ctx) {
  const { prog, ps, hp, rng, style, mods = {} } = ctx;
  if (style === 'none') return { notes: [], detail: 'none' };
  const H = helpers(ctx);
  const len = ctx.part.len;
  const center = 38 + ((mods.reg ?? 0.5) - 0.5) * 16;
  const lo = 28, hi = 57;
  const legato = mods.legato ?? hp.bassLegato;
  const dens = mods.bassDensity ?? hp.bassDensity;
  const e8 = H.unit(8), e16 = H.unit(16);
  const bassPc = (c) => (c.pedal != null ? c.pedal : pc12(c.root + (c.bass || 0)));
  const fifthOf = (c) => pc12(c.root + (c.iv.find((x) => Math.abs(x - 7) < 0.6) ?? 7));
  let last = center;
  const pick = (pcs, target = last) => near([].concat(pcs), target, lo, hi, ps);
  const notes = [];
  const push = (t, p, v, d) => { notes.push({ t, p, v: clamp(v), d }); last = p; };

  const kicks = H.hits('kick');
  const chordStarts = prog.chords.map((c) => c.t);

  if (style === 'follow' || style === 'sub' || style === 'chug' || style === 'pedal') {
    let ons = kicks.map((k) => k.t);
    const busy = ons.length > len * 0.4;
    if (style === 'chug') { if (!ons.length) ons = H.gridPts(e8); }
    else {
      if (busy) ons = ons.filter((t) => H.onGrid(t, e8));
      if (style === 'pedal') ons = kicks.filter((k) => k.s >= 0.7 || H.w(k.t) >= 0.6).map((k) => k.t);
      if (style === 'sub') ons = ons.filter((t, i) => i === 0 || t - ons[i - 1] >= e8);
      if (!ons.length) ons = H.beats().map((b) => b.t);
      if (style !== 'pedal') ons.push(...chordStarts);
      ons.push(0);
    }
    ons = uniqSorted(ons);
    const sByT = new Map(kicks.map((k) => [k.t, k.s]));
    const ds = H.durs(ons, style === 'sub' ? 1 : style === 'chug' ? 1 : legato);
    ons.forEach((t, i) => {
      let c = chordAt(prog, t);
      const nx = nextChord(prog, t);
      if (nx && nx.t - t <= e8 && !chordStarts.includes(t) && H.w(t) < 0.5 && rng.chance(hp.push)) c = nx;
      let p;
      if (style === 'pedal') p = pick(c.pedal ?? ps.tonic, lo + 8);
      else if (style === 'chug') p = near([bassPc(c)], lo + 6, lo, lo + 13, ps);
      else {
        const first = chordStarts.includes(t) || i === 0;
        p = pick(bassPc(c), first ? center : last);
        const nextT = ons[i + 1];
        if (!first && rng.chance(dens * 0.35)) p = rng.chance(0.5) ? pick(fifthOf(c)) : Math.min(hi, p + 12);
        if (nx && nextT !== undefined && nextT >= nx.t && nx.t - t >= 2 && rng.chance(0.2 + hp.chromatic * 0.5)) {
          const target = pick(bassPc(nx), p);
          p = rng.chance(hp.chromatic) ? target + (rng.chance(0.5) ? 1 : -1) : ps.pitch(ps.degreeOf(target) + (target > p ? -1 : 1));
        }
      }
      const d = style === 'chug' ? Math.max(1, Math.min(ds[i], e16 * 2) * 0.7) : ds[i];
      push(t, p, (sByT.get(t) ?? 0.7) * 0.9 + 0.1, d);
    });
    return { notes, detail: `${style}${kicks.length ? ' kick' : ''} · ${range(notes)}` };
  }

  if (style === 'walking' || style === 'continuo') {
    const bts = H.beats();
    let ons = style === 'walking' ? bts.map((b) => b.t) : (dens > 0.55 ? H.gridPts(e8) : H.gridPts(H.unit(4)));
    ons = uniqSorted([...ons, ...chordStarts]);
    const ds = H.durs(ons, style === 'walking' ? 0.95 : legato);
    ons.forEach((t, i) => {
      const c = chordAt(prog, t);
      const nx = nextChord(prog, t);
      const nextT = ons[i + 1] ?? len;
      let p;
      if (t === c.t || i === 0) p = pick(bassPc(c));
      else if (nx && nextT >= nx.t) {
        const target = pick(bassPc(nx), last);
        p = style === 'walking' && rng.chance(0.5 + hp.chromatic * 0.4) ? target + (target >= last ? -1 : 1) : ps.pitch(ps.degreeOf(target) + (target >= last ? -1 : 1));
      } else {
        const target = nx ? pick(bassPc(nx), last) : last;
        const dir = target > last ? 1 : target < last ? -1 : rng.chance(0.5) ? 1 : -1;
        if (style === 'walking' && rng.chance(0.45)) {
          const tones = ps.pitchesIn(chordPcs(c), last - 7, last + 7).filter((x) => Math.abs(x - last) > 0.1);
          p = tones.length ? rng.pick(tones) : ps.pitch(ps.degreeOf(last) + dir);
        } else if (style === 'continuo' && rng.chance(0.12)) p = last + (last + 12 <= hi ? 12 : -12);
        else p = ps.pitch(ps.degreeOf(last) + dir);
      }
      while (p < lo) p += 12;
      while (p > hi) p -= 12;
      push(t, p, 0.65 + 0.3 * H.w(t), ds[i]);
    });
    return { notes, detail: `${style} · ${range(notes)}` };
  }

  if (style === 'drone') {
    const p = near([ps.tonic], lo + 7, lo, hi, ps);
    for (let t = 0; t < len; t += H.barLen * 4) notes.push({ t, p, v: 0.7, d: Math.min(H.barLen * 4, len - t) });
    return { notes, detail: `drone ${noteName(p, { octave: true })}` };
  }

  if (style === 'octave' || style === 'eighths') {
    let ons = H.gridPts(e8);
    if (style === 'octave' && dens > 0.6) ons = uniqSorted([...ons, ...kicks.map((k) => k.t).filter((t) => H.onGrid(t, e16))]);
    const ds = H.durs(ons, style === 'octave' ? 0.55 : legato);
    ons.forEach((t, i) => {
      const c = chordAt(prog, t);
      const base = near([bassPc(c)], center - 3, lo, hi - 12, ps);
      const up = style === 'octave' && Math.round(t / e8) % 2 === 1;
      const ghost = style === 'octave' && !H.onGrid(t, e8);
      notes.push({ t, p: up ? base + 12 : base, v: ghost ? 0.35 : 0.6 + 0.3 * H.w(t), d: ds[i] });
    });
    return { notes, detail: `${style} · ${range(notes)}` };
  }

  if (style === 'rootfifth') {
    const strong = H.beats().filter((b) => b.i % 2 === 0 || ctx.meter.beatStarts.length === 3 && b.i === 0);
    const ons = uniqSorted([...strong.map((b) => b.t), ...chordStarts]);
    const ds = H.durs(ons, 0.8);
    let alt = 0;
    ons.forEach((t, i) => {
      const c = chordAt(prog, t);
      if (t === c.t) alt = 0;
      const root = near([bassPc(c)], center, lo, hi, ps);
      const p = alt++ % 2 === 0 ? root : near([fifthOf(c)], root - 5, lo, hi, ps);
      notes.push({ t, p, v: 0.75 + 0.2 * H.w(t), d: ds[i] });
    });
    return { notes, detail: `root-fifth · ${range(notes)}` };
  }
  return { notes, detail: style };
}

// ---------- comping / rhythm section ----------

export function genComp(ctx) {
  const { prog, ps, hp, rng, style, mods = {}, part, melody } = ctx;
  if (style === 'none') return { notes: [], detail: 'none' };
  const H = helpers(ctx);
  const len = part.len;
  const reg = mods.reg ?? 0.5;
  const lo = Math.round(46 + (reg - 0.5) * 16), hi = lo + 28;
  const nVoices = 3 + Math.round(2 * hp.voices);
  const e8 = H.unit(8), e16 = H.unit(16);
  const spread = mods.spread ?? hp.spread;
  const notes = [];
  const add = (t, ps_, v, d, strum = 0) => [...new Set(ps_)].forEach((p, i) => notes.push({ t, p, v: clamp(v), d: Math.max(1, d), ...(strum ? { o: strum * i } : {}) }));

  // Voicing per chord, led smoothly from the previous one.
  const voicings = new Map();
  let prevV = ctx.prevVoicing || null, prevRoot = null;
  const heavy = ['power', 'chug', 'tremolo'].includes(style);
  for (const c of prog.chords) {
    let v;
    if (c.row) v = c.iv.map((x) => c.root + x).map((p) => near([p], 60, lo, hi, ps));
    else if (heavy || c.q === '5') v = voiceChord(c, prevV, { n: style === 'tremolo' ? 2 : 3, lo: 40, hi: 64, type: 'power' });
    else if (hp.parallel > 0.5 && prevV && prevRoot != null && rng.chance(hp.parallel)) {
      const shift = c.root - prevRoot;
      v = prevV.map((p) => p + shift);
      const mid = (v[0] + v[v.length - 1]) / 2;
      const oct = Math.round(((lo + hi) / 2 - mid) / 12) * 12;
      v = v.map((p) => p + oct);
    } else {
      const type = mods.quartal || (hp.quartal > 0.5 && rng.chance(hp.quartal)) ? 'quartal' : (style === 'comp' || mods.rootless) && c.iv.length >= 4 ? 'rootless' : 'close';
      v = voiceChord(c, prevV, { n: nVoices, lo, hi, spread, type, rng });
    }
    voicings.set(c, v);
    prevV = v;
    prevRoot = c.root;
  }
  const vAt = (t) => voicings.get(chordAt(prog, t));
  const chordStarts = prog.chords.map((c) => c.t);

  const fromHits = (ons, legato, vel, opt = {}) => {
    ons = uniqSorted(ons);
    const ds = H.durs(ons, legato);
    ons.forEach((t, i) => add(t, vAt(t), vel(t, i), opt.maxD ? Math.min(ds[i], opt.maxD) : ds[i], opt.strum ? opt.strum(i, t) : 0));
  };

  switch (style) {
    case 'pad': {
      const ons = [...chordStarts];
      for (let t = 0; t < len; t += H.barLen * 2) ons.push(t);
      fromHits(ons, 1, () => 0.55);
      break;
    }
    case 'block': fromHits([...H.beats().map((b) => b.t), ...chordStarts], mods.legato ?? 0.95, (t) => 0.55 + 0.35 * H.w(t)); break;
    case 'stab': {
      let ons = [...H.hits('snare', (h) => h.art !== 'ghost' && h.art !== 'side').map((h) => h.t), ...H.hits('crash').map((h) => h.t)];
      if (!ons.length) ons = H.beats().filter((b) => b.i % 2 === 1).map((b) => b.t);
      fromHits(ons, 1, (t) => 0.7 + 0.25 * H.w(t), { maxD: e8 * (mods.legato ? 2 * mods.legato : 0.9) });
      break;
    }
    case 'power': {
      const sn = H.hits('snare', (h) => h.art !== 'ghost').map((h) => h.t);
      let ons = [...H.hits('kick').map((h) => h.t).filter((t) => H.onGrid(t, e8)), ...sn, ...chordStarts];
      if (ons.length < 2) ons = [...ons, ...H.gridPts(e8)];
      fromHits(ons, mods.legato ?? 0.9, (t) => (sn.includes(t) ? 0.95 : 0.7 + 0.2 * H.w(t)));
      break;
    }
    case 'chug': {
      let ons = H.hits('kick').map((h) => h.t);
      if (!ons.length) ons = H.gridPts(e8);
      const accents = new Set([...H.hits('crash').map((h) => h.t), ...chordStarts]);
      ons = uniqSorted(ons);
      ons.forEach((t, i) => {
        const gap = (ons[i + 1] ?? len) - t;
        const open = accents.has(t);
        add(t, vAt(t), open ? 0.95 : 0.7, open ? gap * 0.95 : Math.max(1, Math.min(gap, e16 * 1.5) * 0.7));
      });
      break;
    }
    case 'strum': {
      const keeper = part.timekeeper || 'hihat';
      let ons = H.hits(keeper).map((h) => h.t);
      if (!ons.length) ons = H.hits(keeper === 'hihat' ? 'ride' : 'hihat').map((h) => h.t);
      if (!ons.length || (hp.compDensity < 0.7 && ons.length > len / e8)) ons = [...ons.filter((t) => H.onGrid(t, e8)), ...(ons.length ? [] : H.gridPts(e8))];
      ons.push(...chordStarts);
      fromHits(ons, mods.legato ?? 0.9, (t) => (H.onGrid(t, H.unit(4)) ? 0.75 : 0.5) + 0.15 * H.w(t), {
        strum: (i, t) => (H.onGrid(t, H.unit(4)) ? 0.04 : -0.03) * Math.min(1, ctx.meter.resolution / 16),
      });
      break;
    }
    case 'arpeggio': case 'alberti': {
      const u = (mods.compDensity ?? hp.compDensity) > 0.6 ? e16 : e8;
      let step = 0, lastChord = null;
      for (const t of H.gridPts(u)) {
        const c = chordAt(prog, t);
        if (c !== lastChord) { step = 0; lastChord = c; }
        const v = vAt(t).slice().sort((a, b) => a - b);
        let p;
        if (style === 'alberti') {
          const tri = [v[0], v[Math.floor(v.length / 2)], v[v.length - 1]];
          p = tri[[0, 2, 1, 2][step % 4]];
        } else {
          const up = [...v, v[0] + 12];
          const cyc = [...up, ...up.slice(1, -1).reverse()];
          p = cyc[step % cyc.length];
        }
        step++;
        notes.push({ t, p, v: clamp(0.45 + 0.35 * H.w(t)), d: u * (style === 'alberti' ? 0.95 : 1.8) });
      }
      break;
    }
    case 'tremolo': {
      const u = Math.max(1, e16);
      for (const t of H.gridPts(u)) add(t, vAt(t), 0.55 + 0.3 * H.w(t), u * 0.9);
      break;
    }
    case 'comp': {
      for (let bar = 0; bar < len; bar += H.barLen) {
        const cands = [];
        for (const b of ctx.meter.beatStarts.map((x, i) => ({ s: x, l: ctx.meter.beatLens[i] }))) {
          cands.push({ t: bar + b.s, w: 0.5 }, { t: bar + b.s + Math.round(b.l / 2), w: 1 + hp.push });
        }
        const pool = cands.filter((c) => c.t < len);
        const k = Math.max(1, Math.round(1 + hp.compDensity * 2.5));
        const chosen = [];
        if (rng.chance(0.4) && pool[0]) chosen.push(pool[0].t);
        for (let i = 0; i < k && pool.length; i++) {
          const c = rng.weighted(pool, (x) => (chosen.includes(x.t) ? 0 : x.w));
          if (!chosen.includes(c.t)) chosen.push(c.t);
        }
        for (const t of chosen.sort((a, b) => a - b)) {
          const nx = nextChord(prog, t);
          const v = nx && nx.t - t <= e8 && rng.chance(0.6) ? voicings.get(nx) : vAt(t);
          add(t, v, 0.5 + 0.3 * rng.next(), Math.min(H.unit(4), e8 * 1.5));
        }
      }
      break;
    }
    case 'skank': {
      for (const b of H.beats()) {
        const t = b.t + Math.round(b.len / 2);
        if (t < len) add(t, vAt(t), 0.7, Math.max(1, Math.min(b.len / 2, e8) * 0.8));
      }
      break;
    }
    case 'organum': {
      const iv = hp.quartal > 0.5 ? 5 : 7;
      for (const n of melody || []) {
        const p = ps.snap(n.p - iv);
        notes.push({ t: n.t, p, v: n.v * 0.85, d: n.d });
        if (hp.voices > 0.6) notes.push({ t: n.t, p: ps.snap(n.p - 12), v: n.v * 0.7, d: n.d });
      }
      return { notes, detail: `organum at the ${iv === 7 ? 'fifth' : 'fourth'} below` };
    }
    case 'drone': {
      const root = near([ps.tonic], 50, 43, 57, ps);
      const fifth = ps.snap(root + 7);
      for (let t = 0; t < len; t += H.barLen * 4) add(t, [root, fifth, root + 12], 0.5, Math.min(H.barLen * 4, len - t));
      return { notes, detail: `drone ${noteName(root)}–${noteName(fifth)}` };
    }
    case 'tanpura': {
      const sa = near([ps.tonic], 48, 43, 55, ps);
      const pa = ps.snap(sa + 7);
      const cyc = [pa, sa + 12, sa + 12, sa];
      H.beats().forEach((b, i) => notes.push({ t: b.t, p: cyc[i % 4], v: 0.45, d: b.len * 3 }));
      return { notes, detail: `tanpura on ${noteName(sa)}` };
    }
  }
  const nv = prog.chords.length ? voicings.get(prog.chords[0]).length : nVoices;
  return { notes, detail: `${style} · ${nv} voices · ${range(notes)}` };
}

// ---------- melody ----------

const PENTA_MINOR = [0, 300, 500, 700, 1000], PENTA_MAJOR = [0, 200, 400, 700, 900];

export function genMelody(ctx) {
  const { meter, part, prog, ps, hp, rng, style, mods = {}, role } = ctx;
  if (style === 'none') return { notes: [], detail: 'none' };
  const H = helpers(ctx);
  const len = part.len, barLen = meter.barLen;
  const reg = mods.reg ?? hp.register;
  let center = 55 + 20 * reg + (role === 'contrast' ? 2 : 0);
  const span = 6 + 16 * (style === 'chant' ? Math.min(hp.range, 0.4) : hp.range);
  const lo = center - span / 2, hi = center + span / 2;
  const dens = mods.melDensity ?? hp.melDensity;
  const step = mods.step ?? hp.step;
  const legato = mods.legato ?? hp.legato;
  const repeat = mods.repeat ?? hp.repeat;
  const unit = style === 'chant' ? H.unit(8) : style === 'bebop' ? H.unit(8) : style === 'sequence' || style === 'arp' ? H.unit(dens > 0.6 ? 16 : 8) : H.unit(dens > 0.78 ? 16 : dens > 0.3 ? 8 : 4);
  const sync = style === 'chant' || style === 'sequence' ? 0 : mods.melSync ?? hp.melSync;
  const phraseBars = part.bars >= 4 && style !== 'minimal' ? 2 : 1;
  const L = Math.min(len, barLen * phraseBars);
  const tenorP = ps.pitch(ps.degreeOf(ps.tonic + 12 * Math.round((center - ps.tonic) / 12)) + (ctx.tenor ?? 4));
  const pcsAt = (t) => chordPcs(chordAt(prog, t));

  // Motif reuse for variations.
  if (ctx.motifMel && ctx.motifMel.len === len && (role === 'variation' || (role === 'fill' && rng.chance(0.5)))) {
    const mut = ctx.mutation ?? 0.3;
    const notes = ctx.motifMel.notes.map((n) => {
      let p = n.p;
      if (rng.chance(mut * 0.5)) p = ps.pitch(ps.degreeOf(p) + (rng.chance(0.5) ? 1 : -1));
      if (H.w(n.t) >= 0.55 && !isTone(p, pcsAt(n.t)) && rng.chance(1 - hp.dissonance * 0.6)) p = near(pcsAt(n.t), p, lo - 2, hi + 2, ps);
      return { ...n, p };
    });
    return { notes, detail: `motif varied · ${range(notes)}` };
  }

  // Rhythm of one phrase.
  const src = mods.src || (style === 'riff' ? rng.pick(['kick', 'snare', 'both']) : null);
  const srcHits = src ? new Set([...(src !== 'snare' ? H.hits('kick') : []), ...(src !== 'kick' ? H.hits('snare', (h) => h.art !== 'ghost') : [])].map((h) => h.t)) : null;
  const rhythm = (start, Lp) => {
    const ons = [];
    const restLen = style === 'minimal' || style === 'arp' ? 0 : Math.round((hp.melRest * Lp * 0.3) / unit) * unit;
    for (let x = 0; x < Lp - restLen; x++) {
      const t = start + x;
      const fromSrc = srcHits && srcHits.has(t);
      if (!H.onGrid(t, unit) && !fromSrc) continue;
      const w = H.w(t);
      let p;
      if (style === 'arp' || style === 'sequence' || style === 'bebop') p = 0.6 + 0.4 * dens;
      else if (style === 'chant') p = 0.55 + 0.4 * dens;
      else if (srcHits) p = fromSrc ? 0.85 : 0.12 * dens;
      else p = Math.min(1, 0.1 + dens) * ((1 - sync) * (0.3 + 0.7 * w) + sync * (0.55 + 0.45 * (1 - w)));
      if (x === 0 && style !== 'bebop' && rng.chance(0.85)) p = 1;
      if (rng.chance(p)) ons.push(t);
    }
    if (!ons.length) ons.push(start);
    const end = start + Lp - restLen;
    return ons.map((t, i) => ({ t, d: Math.max(1, ((ons[i + 1] ?? end) - t) * (i === ons.length - 1 ? 1 : legato)) }));
  };

  // Pitches for a rhythm: random walk in scale degrees, scored by a fitness (generate-and-test).
  const pool = style === 'riff' && ps.n === 7 ? (isMinorPs(ps) ? PENTA_MINOR : PENTA_MAJOR) : null;
  const inPool = (p) => !pool || pool.some((c) => Math.abs(pc12(p - ps.tonic) * 100 - c) < 60);
  const contourOf = () => (role === 'build' ? 'rise' : role === 'fill' ? 'fall' : style === 'chant' ? 'arch' : rng.pick(['arch', 'arch', 'wave', 'fall', 'rise']));
  const contourAt = (kind, x) => {
    switch (kind) {
      case 'rise': return lo + (hi - lo) * (0.25 + 0.65 * x);
      case 'fall': return lo + (hi - lo) * (0.85 - 0.6 * x);
      case 'wave': return lo + (hi - lo) * (0.5 + 0.3 * Math.sin(x * Math.PI * 2));
      default: return lo + (hi - lo) * (0.3 + 0.55 * Math.sin(Math.PI * Math.min(1, x * 1.15)));
    }
  };
  const line = (rh, startP, kind) => {
    let d = ps.degreeOf(startP);
    let leap = 0;
    const out = [];
    rh.forEach((n, i) => {
      const x = rh.length > 1 ? i / (rh.length - 1) : 0;
      const target = contourAt(kind, x);
      const cur = ps.pitch(d);
      const dir = target > cur + 0.5 ? 1 : target < cur - 0.5 ? -1 : rng.chance(0.5) ? 1 : -1;
      if (i > 0) {
        if (leap) { d -= Math.sign(leap); leap = 0; }
        else if (style === 'chant' && rng.chance(hp.recite)) d += Math.sign(ps.degreeOf(tenorP) - d);
        else if (rng.chance(step)) d += rng.chance(style === 'riff' || style === 'minimal' ? 0.3 : 0.12) ? 0 : rng.chance(0.75) ? dir : -dir;
        else { leap = (2 + rng.int(3)) * (rng.chance(0.8) ? dir : -dir); d += leap; }
      }
      let p = ps.pitch(d);
      if (p > hi) { d -= ps.n; p = ps.pitch(d); }
      if (p < lo) { d += ps.n; p = ps.pitch(d); }
      if (pool) for (let k = 0; k < ps.n && !inPool(p); k++) { d += dir; p = ps.pitch(d); }
      const strong = H.w(n.t) >= 0.55 || n.d >= H.unit(4);
      const pcs = pcsAt(n.t);
      if ((strong || style === 'arp') && !isTone(p, pcs) && rng.chance(1 - hp.dissonance * 0.6)) {
        p = near(pcs, p, lo - 1, hi + 1, ps);
        d = ps.degreeOf(p);
      }
      out.push(p);
    });
    // Chromatic passing tones between notes a whole step apart.
    for (let i = 1; i < out.length - 1; i++) {
      if (H.w(rh[i].t) < 0.5 && Math.abs(out[i + 1] - out[i - 1]) > 1.6 && Math.abs(out[i + 1] - out[i - 1]) < 2.4 && rng.chance(hp.chroma)) out[i] = ps.snap((out[i - 1] + out[i + 1]) / 2);
    }
    if (style === 'bebop') {
      for (let i = 0; i < out.length - 1; i++) if (H.w(rh[i + 1].t) >= 0.55 && H.w(rh[i].t) < 0.55 && rng.chance(hp.chroma)) out[i] = out[i + 1] + (rng.chance(0.5) ? 1 : -1);
    }
    return out;
  };
  const score = (rh, ps_) => {
    let s = 0, steps = 0, strongN = 0, strongOk = 0, rep = 0;
    for (let i = 0; i < ps_.length; i++) {
      if (H.w(rh[i].t) >= 0.55) { strongN++; if (isTone(ps_[i], pcsAt(rh[i].t))) strongOk++; }
      if (i) {
        const iv = Math.abs(ps_[i] - ps_[i - 1]);
        if (iv > 0.1 && iv <= 2.6) steps++;
        if (iv > 7.5) s -= 1.2;
        if (Math.abs(iv - 6) < 0.3 && hp.dissonance < 0.7) s -= 0.6;
        if (iv < 0.1) { rep++; if (rep > 2 && !['chant', 'riff', 'minimal'].includes(style)) s -= 0.7; } else rep = 0;
        if (i > 1 && iv > 4 && Math.abs(ps_[i - 1] - ps_[i - 2]) > 4 && Math.sign(ps_[i] - ps_[i - 1]) === Math.sign(ps_[i - 1] - ps_[i - 2])) s -= 0.8;
      }
    }
    const n = Math.max(1, ps_.length - 1);
    s += 3 * (strongN ? strongOk / strongN : 1);
    s -= 2 * Math.abs(steps / n - step);
    const mx = Math.max(...ps_), mn = Math.min(...ps_);
    if (mx - mn < 4 && ps_.length > 4 && !['chant', 'riff', 'minimal'].includes(style)) s -= 1;
    const peaks = ps_.filter((p) => p === mx).length;
    if (peaks === 1) s += 0.5;
    const at = ps_.indexOf(mx) / n;
    if (at > 0.35 && at < 0.85) s += 0.5;
    return s;
  };
  const best = (rh, startP, kind, K = 18) => {
    let b = null, bs = -Infinity;
    for (let k = 0; k < K; k++) {
      const c = line(rh, startP, kind);
      const sc = score(rh, c);
      if (sc > bs) { bs = sc; b = c; }
    }
    return b;
  };

  const notes = [];
  const nPh = Math.ceil(len / L);
  const form = repeat > 0.75 ? 'AABA' : repeat > 0.45 ? 'ABAC' : repeat > 0.2 ? 'ABCB' : 'ABCD';
  const memo = {};
  let prevEnd = near([ps.tonic], center - 2, lo, hi, ps);

  if (style === 'row') {
    ctx.row ||= rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    let k = 0, last = center;
    for (let ph = 0; ph < nPh; ph++) {
      const rh = rhythm(ph * L, Math.min(L, len - ph * L));
      const form_ = ['P', 'R', 'I', 'RI'][ph % 4];
      const r = form_ === 'R' ? ctx.row.slice().reverse() : form_ === 'I' ? ctx.row.map((x) => (12 - x) % 12) : form_ === 'RI' ? ctx.row.map((x) => (12 - x) % 12).reverse() : ctx.row;
      for (const n of rh) {
        const pc = pc12(ps.tonic + r[k++ % 12]);
        const opts = ps.pitchesIn([pc], lo, hi);
        last = opts.length ? (rng.chance(1 - step) ? rng.pick(opts) : opts.reduce((a, b) => (Math.abs(b - last) < Math.abs(a - last) ? b : a))) : last;
        notes.push({ ...n, p: last, v: 0.55 + 0.35 * H.w(n.t) });
      }
    }
    return { notes, detail: `12-tone row ${ctx.row.map((x) => '0123456789TE'[x]).join('')} · ${range(notes)}` };
  }

  if (style === 'sequence') {
    // Fortspinnung: a one-beat (or half-bar) cell repeated a scale step lower (or higher) each time.
    const cellLen = meter.beatLens[0] * (rng.chance(0.5) ? 1 : Math.max(1, Math.floor(meter.beatStarts.length / 2)));
    const rh = rhythm(0, cellLen).filter((n) => n.t < cellLen);
    const cell = best(rh, prevEnd, rng.pick(['rise', 'fall', 'arch']), 12);
    const offs = cell.map((p) => ps.degreeOf(p) - ps.degreeOf(cell[0]));
    const seqStep = rng.chance(0.7) ? -1 : 1;
    let startD = ps.degreeOf(cell[0]);
    for (let s = 0, k = 0; s < len; s += cellLen, k++) {
      const chord = chordAt(prog, s);
      if (k % 4 === 0 && k) startD = ps.degreeOf(near(chordPcs(chord), center + (seqStep < 0 ? 4 : -4), lo, hi, ps));
      rh.forEach((n, i) => {
        if (s + n.t >= len) return;
        let p = ps.pitch(startD + offs[i]);
        while (p > hi + 2) p -= 12;
        while (p < lo - 2) p += 12;
        if (i === 0 && !isTone(p, chordPcs(chord)) && rng.chance(0.7)) p = near(chordPcs(chord), p, lo - 2, hi + 2, ps);
        notes.push({ t: s + n.t, d: Math.min(n.d, len - s - n.t), p, v: 0.55 + 0.35 * H.w(s + n.t) });
      });
      startD += seqStep;
    }
    cadenceEnd(notes, ctx, lo, hi);
    ornament(notes, ctx, H);
    return { notes, detail: `sequence (Fortspinnung) ${seqStep < 0 ? 'falling' : 'rising'} · ${range(notes)}` };
  }

  for (let ph = 0; ph < nPh; ph++) {
    const start = ph * L;
    const Lp = Math.min(L, len - start);
    const letter = style === 'minimal' ? 'A' : form[ph % form.length];
    const last = ph === nPh - 1;
    let rh, pitches;
    const m = memo[letter];
    if (m && m.Lp === Lp) {
      rh = m.rh.map((n) => ({ ...n, t: n.t - m.start + start }));
      pitches = m.pitches.map((p, i) => {
        const pcs = pcsAt(rh[i].t);
        if (style === 'minimal' && rng.chance(0.08)) return ps.pitch(ps.degreeOf(p) + (rng.chance(0.5) ? 1 : -1));
        return H.w(rh[i].t) >= 0.55 && !isTone(p, pcs) && rng.chance(0.8) ? near(pcs, p, lo - 1, hi + 1, ps) : p;
      });
      if (last && rh.length > 3) {
        const tail = Math.ceil(rh.length / 3);
        const fresh = best(rh.slice(-tail), pitches[rh.length - tail - 1] ?? prevEnd, 'fall', 10);
        pitches.splice(rh.length - tail, tail, ...fresh);
      }
    } else if (style === 'arp') {
      rh = rhythm(start, Lp);
      let k = 0;
      pitches = rh.map((n) => {
        const tones = ps.pitchesIn(pcsAt(n.t), lo, hi);
        const cyc = [...tones, ...tones.slice(1, -1).reverse()];
        return cyc.length ? cyc[k++ % cyc.length] : center;
      });
    } else {
      rh = rhythm(start, Lp);
      pitches = best(rh, prevEnd, contourOf());
    }
    memo[letter] ||= { rh, pitches, Lp, start };
    rh.forEach((n, i) => notes.push({ t: n.t, d: n.d, p: pitches[i], v: clamp(0.5 + 0.3 * H.w(n.t) + 0.2 * (pitches[i] - lo) / Math.max(1, hi - lo)) }));
    prevEnd = pitches[pitches.length - 1];
  }

  // Fill: a scale run into the next downbeat over the last beat(s).
  if (role === 'fill' && len >= barLen) {
    const runStart = len - Math.max(meter.beatLens[meter.beatLens.length - 1], H.unit(4));
    for (let i = notes.length - 1; i >= 0; i--) if (notes[i].t >= runStart) notes.splice(i, 1);
    const u = H.unit(16);
    let d = ps.degreeOf(notes.length ? notes[notes.length - 1].p : center);
    const dir = rng.chance(0.6) ? 1 : -1;
    for (let t = runStart; t < len; t += u) { d += dir; notes.push({ t, d: u, p: ps.pitch(d), v: 0.55 + 0.04 * ((t - runStart) / u) }); }
  }

  cadenceEnd(notes, ctx, lo, hi);
  blueNotes(notes, ctx);
  ornament(notes, ctx, H);
  return { notes, detail: `${style}${srcHits ? ` on ${src}` : ''} · form ${style === 'minimal' ? 'ostinato' : form.slice(0, Math.min(4, nPh))} · ${range(notes)}` };
}

function isMinorPs(ps) {
  const third = ps.deg.find((c) => c > 250 && c < 450);
  return third === undefined || third < 375;
}

function cadenceEnd(notes, ctx, lo, hi) {
  const { prog, ps, hp, rng, role } = ctx;
  if (!notes.length || role === 'fill') return;
  const last = notes[notes.length - 1];
  const c = chordAt(prog, last.t);
  const tonicChord = Math.abs(pc12(c.root - ps.tonic)) < 0.3 || Math.abs(pc12(c.root - ps.tonic) - 12) < 0.3;
  if (tonicChord && rng.chance(0.4 + 0.6 * hp.cadence)) last.p = near([ps.tonic], last.p, lo - 2, hi + 2, ps);
  else if (!isTone(last.p, chordPcs(c))) last.p = near(chordPcs(c), last.p, lo - 2, hi + 2, ps);
}

function blueNotes(notes, ctx) {
  const { ps, hp, rng } = ctx;
  if (!ps.micro || hp.blue <= 0) return;
  for (const n of notes) {
    const rel = pc12(n.p - ps.tonic);
    if (Math.abs(rel - 3) < 0.15 && rng.chance(hp.blue)) n.p += 0.5;
    else if (Math.abs(rel - 10) < 0.15 && rng.chance(hp.blue * 0.6)) n.p -= 0.31;
  }
}

// Trills, mordents, turns and grace notes carved out of longer notes.
function ornament(notes, ctx, H) {
  const { ps, hp, rng } = ctx;
  if (hp.ornament <= 0) return;
  const kinds = hp.cats?.orn || { grace: 1 };
  const u = H.unit(16);
  const out = [];
  for (const n of notes) {
    if (n.d < 2 * u || !rng.chance(hp.ornament * 0.6)) { out.push(n); continue; }
    const kind = rng.weighted(Object.keys(kinds), (k) => kinds[k]);
    const up = ps.pitch(ps.degreeOf(n.p) + 1), down = ps.pitch(ps.degreeOf(n.p) - 1);
    const seq = (ps_) => {
      ps_.forEach((p, i) => out.push({ t: n.t + i * u, d: u, p, v: n.v * (i ? 0.8 : 1), orn: kind }));
      out.push({ ...n, t: n.t + ps_.length * u, d: n.d - ps_.length * u });
    };
    if (kind === 'trill' && n.d >= 4 * u) {
      const k = Math.floor((n.d * 0.66) / u);
      seq(Array.from({ length: k }, (_, i) => (i % 2 ? n.p : up)));
    } else if (kind === 'mordent') seq([n.p, down]);
    else if (kind === 'turn' && n.d >= 5 * u) seq([up, n.p, down]);
    else {
      const below = ps.micro && rng.chance(0.4) ? n.p - 0.5 : rng.chance(hp.chromatic + 0.3) ? n.p - 1 : down;
      out.push({ t: n.t, d: Math.max(1, Math.round(u / 2)) || 1, p: below, v: n.v * 0.75, orn: 'grace' });
      const g = Math.max(1, Math.round(u / 2)) || 1;
      out.push({ ...n, t: n.t + g, d: n.d - g });
    }
  }
  notes.splice(0, notes.length, ...out.filter((n) => n.d > 0));
}
