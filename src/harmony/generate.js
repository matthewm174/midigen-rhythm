// Harmony orchestration: per part, progression -> bass -> melody -> comping, all over the generated drums.
import { Rng, clamp } from '../core/rng.js';
import { ROLES } from '../core/descriptors.js';
import { makePitchSpace, transposeSpace, parseKey, pc12, KEY_NAMES, TUNINGS } from './tuning.js';
import { SCALES, tenorDegree } from './scales.js';
import { interpretHarmony, blendHarmony, applyHarmonyRole, parseVoiceSpec, argmax, BASS_STYLES, COMP_STYLES, MELODY_STYLES } from './styles.js';
import { genProgression, GRAMMARS } from './progression.js';
import { genBass, genComp, genMelody } from './voices.js';

export const VOICES = ['progression', 'bass', 'comp', 'melody'];
export const PITCHED = ['melody', 'comp', 'bass'];
export const VOICE_LABELS = { progression: 'Chords', bass: 'Bass', comp: 'Rhythm section', melody: 'Melody' };
export const DEFAULT_PROGRAMS = { bass: 33, comp: 0, melody: 73 };

export function defaultHarmonyCfg() {
  return {
    key: 'auto', scale: 'auto', microtones: 'auto', tuning: 'auto', descriptors: '',
    voices: Object.fromEntries(VOICES.map((v) => [v, { spec: '', locked: false, muted: false, salt: 0, program: null }])),
  };
}

export function normalizeHarmonyCfg(h) {
  const d = defaultHarmonyCfg();
  const out = { ...d, ...(h || {}) };
  out.voices = Object.fromEntries(VOICES.map((v) => [v, { ...d.voices[v], ...(h?.voices?.[v] || {}) }]));
  return out;
}

const keyPcOf = (name) => parseKey(name);

export function generateHarmony(cfg, rhythm, { previous = null, keep = [] } = {}) {
  const H = normalizeHarmonyCfg(cfg.harmony);
  const meter = rhythm.meter;
  const root = new Rng(Number(cfg.seed) >>> 0).fork('harmony');
  const warnings = [];
  const style = interpretHarmony(cfg.style);
  const song = interpretHarmony(cfg.descriptors, 1.3);
  const extra = interpretHarmony(H.descriptors, 1.2);
  extra.unknown.forEach((u) => warnings.push(`Harmony: didn't recognize "${u.word}"`));
  const overrides = Object.fromEntries(Object.entries({ ...style.overrides, ...song.overrides, ...extra.overrides }).filter(([k]) => k !== 'cats'));
  const baseItems = [...style.items, ...song.items, ...extra.items];
  const gBlend = blendHarmony(baseItems, overrides);
  const g = gBlend.params;

  // Key, scale, tuning (song-level).
  const specs = Object.fromEntries(VOICES.map((v) => [v, parseVoiceSpec(v, H.voices[v].spec)]));
  const chartKey = (() => {
    const m = /^([A-G](?:#|b)?)(m(?!aj)|min|-)?/.exec(specs.progression.chart?.[0] || '');
    return m ? { pc: parseKey(m[1]), minor: !!m[2] } : null;
  })();
  let keyPc, keySrc;
  if (H.key !== 'auto' && keyPcOf(H.key) != null) { keyPc = keyPcOf(H.key); keySrc = 'set'; }
  else if (extra.key || song.key || style.key) { keyPc = (extra.key || song.key || style.key).pc; keySrc = 'described'; }
  else if (chartKey) { keyPc = chartKey.pc; keySrc = 'chart'; }
  else {
    const ks = Object.keys(g.cats.key);
    keyPc = ks.length ? keyPcOf(root.fork('key').weighted(ks, (k) => g.cats.key[k])) : root.fork('key').pick([0, 2, 4, 5, 7, 9, 10]);
    keySrc = 'auto';
  }
  // A scale named outright ("dorian", "maqam bayati") wins; otherwise draw from the styles' suggestions.
  const named = baseItems.filter((it) => !it.negate && it.name.startsWith('scale:')).map((it) => it.name.slice(6)).filter((id) => SCALES[id]);
  let scaleId = H.scale !== 'auto' && SCALES[H.scale] ? H.scale
    : named.length ? named.reduce((a, b) => ((g.cats.scale[b] || 0) > (g.cats.scale[a] || 0) ? b : a))
      : keySrc === 'chart' ? (chartKey.minor ? 'minor' : 'major')
        : root.fork('scale').weighted(Object.keys(g.cats.scale), (k) => g.cats.scale[k]);
  if (!SCALES[scaleId]) scaleId = 'major';
  const micro = H.microtones === 'on' || (H.microtones === 'auto' && g.micro > 0.5);
  if (SCALES[scaleId].micro && !micro) {
    warnings.push(`${SCALES[scaleId].name} needs microtones; using ${SCALES[SCALES[scaleId].fallback].name} instead (turn microtones on to hear it)`);
    scaleId = SCALES[scaleId].fallback;
  }
  let tuning = '12tet';
  if (micro) {
    if (H.tuning !== 'auto' && TUNINGS[H.tuning]) tuning = H.tuning;
    else {
      const best = argmax(g.cats.tuning);
      const strong = best && g.cats.tuning[best] >= 1;
      tuning = SCALES[scaleId].micro && !strong ? 'free' : best || 'just';
    }
  }
  const ps0 = makePitchSpace({ key: keyPc, scaleCents: SCALES[scaleId].cents, tuning });
  const grammar0 = root.fork('grammar').weighted(Object.keys(g.cats.grammar).filter((k) => GRAMMARS.includes(k)), (k) => g.cats.grammar[k] ** 2) || 'functional';

  for (const v of VOICES) specs[v].warnings.forEach((w) => warnings.push(`${VOICE_LABELS[v]}: ${w}`));
  const allowed = { bass: BASS_STYLES, comp: COMP_STYLES, melody: MELODY_STYLES };
  const pickStyle = (v, cats, rng) => {
    if (specs[v].style) return specs[v].style;
    const ks = Object.keys(cats[v] || {}).filter((k) => allowed[v].includes(k));
    return ks.length ? rng.weighted(ks, (k) => cats[v][k] ** 2) : allowed[v][0];
  };
  const songStyles = Object.fromEntries(PITCHED.map((v) => [v, pickStyle(v, g.cats, root.fork(`style:${v}`))]));
  const prog = (v, cat) => {
    const p = H.voices[v]?.program;
    if (p !== null && p !== undefined && p !== '' && !Number.isNaN(Number(p))) return clamp(Math.round(Number(p)), 0, 127);
    const best = argmax(g.cats[cat]);
    return best != null ? Number(best) : DEFAULT_PROGRAMS[v];
  };
  const programs = { bass: prog('bass', 'pBass'), comp: prog('comp', 'pComp'), melody: prog('melody', 'pMel') };

  const canReuse = previous && previous.barLen === meter.barLen && previous.resolution === meter.resolution;
  const parts = [];
  let motif = null;
  const shared = { warnings, row: null };
  const nParts = rhythm.parts.length;

  rhythm.parts.forEach((rp, pi) => {
    const pc = cfg.parts?.[pi] || {};
    const role = ROLES.includes(rp.role) ? rp.role : 'groove';
    const partH = interpretHarmony(pc.descriptors, 1.5);
    let hp = blendHarmony([...baseItems, ...partH.items], { ...overrides, ...partH.overrides }).params;
    hp = applyHarmonyRole(hp, role);
    const prng = root.fork(`part:${pi}`);

    let ps = ps0;
    let modulated = null;
    const partScale = partH.items.some((it) => it.name.startsWith('scale:') && !it.negate)
      ? argmax(Object.fromEntries(Object.entries(hp.cats.scale).filter(([k]) => SCALES[k] && (!SCALES[k].micro || micro)))) : null;
    if (partScale && partScale !== scaleId) ps = makePitchSpace({ key: keyPc, scaleCents: SCALES[partScale].cents, tuning });
    if (partH.key) { ps = transposeSpace(ps, partH.key.pc); modulated = 'described'; }
    else if (role === 'contrast' && prng.fork('mod').chance(hp.modulate)) {
      const minorish = (ps.deg.find((c) => c > 250 && c < 450) ?? 300) < 375;
      ps = transposeSpace(ps, keyPc + prng.fork('mod2').pick([5, 7, minorish ? 3 : 9]));
      modulated = 'contrast';
    }
    const grammarId = partH.items.length && Object.keys(hp.cats.grammar).some((k) => (hp.cats.grammar[k] || 0) > (g.cats.grammar[k] || 0) + 0.5)
      ? prng.fork('grammar').weighted(Object.keys(hp.cats.grammar).filter((k) => GRAMMARS.includes(k)), (k) => hp.cats.grammar[k]) : grammar0;
    const styles = { ...songStyles };
    for (const v of PITCHED) {
      const partCats = partH.items.some((it) => !it.negate && Object.keys(hp.cats[v]).some((k) => (hp.cats[v][k] || 0) > (g.cats[v][k] || 0) + 0.5));
      if (partCats && !specs[v].style) styles[v] = pickStyle(v, hp.cats, prng.fork(`style:${v}`));
    }

    const prev = canReuse ? previous.parts[pi] : null;
    const kept = (v) => keep.includes(v) && prev && prev.len === rp.len && prev.voices;
    const vr = (v) => root.fork(`${pi}:${v}:${H.voices[v]?.salt || 0}`);
    const part = {
      index: pi, name: rp.name, role, len: rp.len, start: rp.start, keyPc: pc12(ps.key), keyName: KEY_NAMES[pc12(Math.round(ps.key))],
      grammar: grammarId, styles, modulated, voices: {}, info: {},
    };
    const ctxBase = {
      meter, part: rp, ps, hp, role, mutation: rp.params?.mutation ?? 0.3, warnings, tenor: tenorDegree(partScale || scaleId, ps.deg),
    };

    if (kept('progression')) { part.prog = JSON.parse(JSON.stringify(prev.prog)); part.info.progression = { ...prev.info.progression, kept: true }; }
    else {
      part.prog = genProgression({
        ...ctxBase, rng: vr('progression'), grammarId, isLast: pi === nParts - 1, motif: motif?.prog, chart: specs.progression.chart, get row() { return shared.row; }, set row(r) { shared.row = r; },
      });
      part.info.progression = { detail: `${grammarId}${part.prog.trace ? ` · ${part.prog.trace}` : ''}${modulated ? ` · key ${part.keyName}` : ''}` };
    }

    const run = (v, fn, extraCtx = {}) => {
      if (kept(v)) { part.voices[v] = prev.voices[v].map((n) => ({ ...n })); part.info[v] = { ...prev.info[v], kept: true }; return; }
      const r = fn({ ...ctxBase, ...extraCtx, prog: part.prog, rng: vr(v), style: styles[v], mods: specs[v].mods, get row() { return shared.row; }, set row(x) { shared.row = x; } });
      part.voices[v] = r.notes.filter((n) => n.t >= 0 && n.t < rp.len && Number.isFinite(n.p)).map((n) => ({ ...n, d: Math.min(n.d, rp.len - n.t) }));
      part.info[v] = { style: styles[v], detail: r.detail };
    };
    run('bass', genBass);
    run('melody', genMelody, { motifMel: motif && motif.voices.melody ? { len: motif.len, notes: motif.voices.melody } : null });
    run('comp', genComp, { melody: part.voices.melody });

    if (role === 'groove' || !motif) motif = part;
    parts.push(part);
  });

  return {
    keyPc, keyName: KEY_NAMES[keyPc], keySrc, scale: scaleId, scaleName: SCALES[scaleId].name, tuning, tuningName: TUNINGS[tuning].name, micro,
    grammar: grammar0, styles: songStyles, programs, parts, warnings, drumless: g.drumless, barLen: meter.barLen, resolution: meter.resolution,
    tempoHint: gBlend.tempoHint,
  };
}

// Snapshot for presets and MIDI recall (plain JSON).
export function harmonySnapshot(h) {
  if (!h) return null;
  return JSON.parse(JSON.stringify({
    barLen: h.barLen, resolution: h.resolution,
    parts: h.parts.map((p) => ({ len: p.len, prog: p.prog, voices: p.voices, info: p.info })),
  }));
}
