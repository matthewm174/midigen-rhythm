// Per-lane mini-language. Clauses are separated by commas or semicolons.
// Strict syntax:   "grid 1/8, accent &"   "group 3/16 from each 1"   "euclid 5/12 rotate 2, interlock kick"
// Plain English:   "double bass, loud"   "busy offbeat, follow the kick"   "simple backbeat with ghost notes"
// Each clause tries the strict syntax first, then falls back to reading it as plain English.
import { DEFAULT_MAP } from './drummap.js';

const LANE_ALIASES = {
  kick: 'kick', kicks: 'kick', bass: 'kick', bd: 'kick', feet: 'kick', snare: 'snare', snares: 'snare', sn: 'snare',
  hihat: 'hihat', hihats: 'hihat', hh: 'hihat', hat: 'hihat', hats: 'hihat', ride: 'ride', toms: 'toms', tom: 'toms',
  crash: 'crash', crashes: 'crash', cymbals: 'cymbals', china: 'cymbals', splash: 'cymbals',
};

const ARTS = ['rim', 'side', 'bell', 'bow', 'china', 'splash', 'pedal', 'closed', 'open', 'center'];
const RELATIONS = ['lock', 'interlock', 'avoid', 'answer', 'free'];
const KEEPERS = ['hihat', 'ride'];

function parseFrac(s) {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s || '');
  return m ? { num: +m[1], den: +m[2] } : null;
}

const isPos = (w) => /^(\d+(e|&|and|a|la|li)?|e|&|and|a|la|li|@\d+|beats|all|offbeats)$/i.test(w);
const validPositions = (rest) => rest.length > 0 && rest.every(isPos);

// Returns true if the clause was understood as strict syntax (and applies it), false otherwise.
function strictClause(words, spec) {
  const joined = words.join('');
  if (/^[xXgoO.\-_|]+$/.test(joined) && joined.replace(/[|]/g, '').length >= 2 && /[.\-_]/.test(joined)) {
    spec.algo = 'literal';
    spec.pattern = joined.replace(/\|/g, '');
    return true;
  }
  const head = words[0].toLowerCase();
  const rest = words.slice(1);
  const num = (i = 0) => parseFloat(rest[i]);

  switch (head) {
    case 'off': case 'mute': case 'none':
      if (rest.length) return false;
      spec.off = true; return true;
    case 'auto': return rest.length === 0;
    case 'grid': case 'every': {
      const f = parseFrac(rest[0]);
      if (!f) return false;
      spec.algo = 'grid'; spec.grid = f; return true;
    }
    case 'euclid': case 'e': case 'bjorklund': {
      const f = parseFrac(rest[0]) || (rest.length >= 2 && /^\d+$/.test(rest[0]) && /^\d+$/.test(rest[1]) ? { num: +rest[0], den: +rest[1] } : null);
      if (!f || !(f.den > 0)) return false;
      spec.algo = 'euclid'; spec.euclid = { k: f.num, n: f.den };
      const r = rest.indexOf('rotate');
      if (r >= 0) spec.rotate = parseInt(rest[r + 1], 10) || 0;
      return true;
    }
    case 'rotate':
      if (!/^-?\d+$/.test(rest[0] || '')) return false;
      spec.rotate = parseInt(rest[0], 10); return true;
    case 'group': case 'groups': {
      const f = parseFrac(rest[0]);
      const restart = rest.join(' ').includes('beat') ? 'beat' : 'bar';
      if (f) spec.group = { sizes: [f.num], unit: f.den, restart };
      else if (/^[\d+]+$/.test(rest[0] || '')) spec.group = { sizes: rest[0].split('+').map(Number).filter((n) => n > 0), unit: 16, restart: rest.length > 1 ? restart : 'cycle' };
      else return false;
      spec.algo = 'group';
      return true;
    }
    case 'on': case 'only': case 'hits':
      if (!validPositions(rest)) return false;
      spec.algo = 'on'; spec.only = rest; return true;
    case 'accent': case 'accents': case 'sync': case 'syncopate':
      if (!validPositions(rest)) return false;
      spec.accents = rest; return true;
    case 'open':
      if (rest.length && !validPositions(rest)) return false;
      if (rest.length) spec.opens = rest; else spec.art = 'open';
      return true;
    case 'cycle': case 'polymeter': {
      const f = parseFrac(rest[0]);
      if (f) spec.cycle = { n: f.num, unit: f.den };
      else if (/^\d+$/.test(rest[0] || '')) spec.cycle = { n: parseInt(rest[0], 10), unit: null };
      else return false;
      return true;
    }
    case 'poly': case 'polyrhythm': {
      const m = /^(\d+)\s*[:/]\s*(\d+)$/.exec(rest[0] || '');
      if (!m) return false;
      spec.algo = 'poly'; spec.poly = { k: +m[1], beats: +m[2] }; return true;
    }
    case 'ca': case 'automata': case 'cellular': {
      spec.algo = 'ca';
      const n = rest.map((w) => parseInt(w, 10)).find((n) => n >= 0 && n <= 255);
      if (n !== undefined) spec.rule = n;
      return true;
    }
    case 'crystal': case 'quasi': case 'fib': case 'fibonacci': case 'quasicrystal':
      if (rest.length) return false;
      spec.algo = 'crystal'; return true;
    case 'lsys': case 'lsystem': case 'l-system':
      if (rest.length) return false;
      spec.algo = 'lsystem'; return true;
    case 'evolve': case 'genetic': case 'ga':
      if (rest.length) return false;
      spec.algo = 'genetic'; return true;
    case 'packing': case 'pack': {
      const parts = rest.join(' ').split(/[\s+]+/).map(Number).filter((n) => n > 0);
      if (rest.length && !parts.length) return false;
      spec.algo = 'packing';
      if (parts.length) spec.packParts = parts;
      return true;
    }
    case 'blast': if (rest.length) return false; spec.algo = 'blast'; return true;
    case 'backbeat': if (rest.length) return false; spec.backbeat = true; return true;
    case 'halftime': if (rest.length) return false; spec.halftime = true; return true;
    case 'ghosts': case 'ghost':
      if (rest.length && isNaN(num())) return false;
      spec.ghost = isNaN(num()) ? 0.6 : num(); return true;
    case 'density':
      if (isNaN(num())) return false;
      spec.density = num(); return true;
    case 'velocity': case 'vel':
      if (isNaN(num())) return false;
      spec.velocity = Math.round(num()); return true;
    default:
      if (RELATIONS.includes(head)) {
        const lane = LANE_ALIASES[(rest[0] || '').toLowerCase()];
        if (!lane && head !== 'free') return false;
        if (rest.length > 1) return false;
        spec.relations.push({ type: head, lane });
        return true;
      }
      if (ARTS.includes(head) && rest.length === 0) { spec.art = head; return true; }
      return false;
  }
}

// ---------- plain English ----------

const MODS = { very: 1.6, really: 1.6, super: 1.7, extremely: 1.9, more: 1.3, much: 1.3, quite: 1.25, slightly: 0.5, 'a bit': 0.5, 'a little': 0.5, somewhat: 0.6, bit: 0.5, little: 0.5 };
const NEG = new Set(['no', 'not', 'without', 'never', 'less']);
const STOP = new Set([
  'a', 'an', 'the', 'and', 'of', 'to', 'in', 'at', 'for', 'it', 'is', 'that', 'this', 'some', 'lots', 'lot', 'plenty',
  'beat', 'beats', 'pattern', 'notes', 'note', 'hits', 'hit', 'strokes', 'play', 'playing', 'played', 'just', 'mostly',
  'bar', 'bars', 'per', 'each', 'every', 'only', 'style', 'feel', 'like', 'please', 'but', 'also', 'drum', 'drums', 'bass', 'pedal',
]);

// phrase -> effect id
const LANE_PHRASES = {
  double: 'double', 'double bass': 'double', 'double kick': 'double', 'double kicks': 'double', 'double pedal': 'double',
  doublebass: 'double', constant: 'double', rolling: 'double', 'machine gun': 'double', continuous: 'double', stream: 'double',
  fast: 'fast', faster: 'fast', quick: 'fast', slow: 'slow', slower: 'slow',
  gallop: 'gallop', galloping: 'gallop', gallops: 'gallop',
  quarters: 'beats', 'quarter notes': 'beats', 'quarter note': 'beats', 'on the beat': 'beats', 'on beat': 'beats', 'on beats': 'beats',
  'four on the floor': 'beats', '4 on the floor': 'beats', pulse: 'beats', pulsing: 'beats', steady: 'beats', downbeats: 'beats', 'every beat': 'beats',
  eighths: 'g8', '8ths': 'g8', 'eighth notes': 'g8', 'eighth note': 'g8', '8th notes': 'g8', '8th': 'g8', eighth: 'g8',
  sixteenths: 'g16', '16ths': 'g16', '16th notes': 'g16', '16th': 'g16', sixteenth: 'g16', '32nds': 'g32', '32nd notes': 'g32',
  triplets: 'g12', triplet: 'g12', 'eighth triplets': 'g12', '8th triplets': 'g12',
  offbeat: 'offbeats', offbeats: 'offbeats', 'off beat': 'offbeats', 'off beats': 'offbeats', 'on the and': 'offbeats', 'on the &': 'offbeats', upbeats: 'offbeats',
  backbeat: 'backbeat', 'back beat': 'backbeat', '2 and 4': 'backbeat', 'two and four': 'backbeat',
  busy: 'busy', dense: 'busy', lots: 'busy', many: 'busy', more: 'busy', active: 'busy', full: 'busy',
  sparse: 'sparse', few: 'sparse', minimal: 'sparse', fewer: 'sparse', occasional: 'sparse', rare: 'sparse', less: 'sparse',
  simple: 'simple', basic: 'simple', plain: 'simple', straight: 'simple', standard: 'simple', normal: 'simple',
  syncopated: 'sync', syncopation: 'sync', funky: 'sync', groovy: 'sync', complex: 'sync', displaced: 'sync',
  loud: 'loud', louder: 'loud', heavy: 'loud', heavier: 'loud', hard: 'loud', harder: 'loud', strong: 'loud', punchy: 'loud',
  powerful: 'loud', accented: 'loud', aggressive: 'loud', big: 'loud', fat: 'loud', pounding: 'loud',
  soft: 'soft', softer: 'soft', quiet: 'soft', quieter: 'soft', light: 'soft', lighter: 'soft', gentle: 'soft', subtle: 'soft', delicate: 'soft',
  ghost: 'ghost', ghosts: 'ghost', 'ghost notes': 'ghost', ghosty: 'ghost', ghosted: 'ghost',
  halftime: 'halftime', 'half time': 'halftime', blast: 'blast', blasts: 'blast', 'blast beat': 'blast', blasting: 'blast',
  open: 'art:open', opens: 'art:open', closed: 'art:closed', tight: 'art:closed', bell: 'art:bell', bow: 'art:bow',
  rim: 'art:rim', rimshot: 'art:rim', rimshots: 'art:rim', 'cross stick': 'art:side', sidestick: 'art:side', 'side stick': 'art:side', side: 'art:side',
  china: 'art:china', chinas: 'art:china', splash: 'art:splash', splashes: 'art:splash', pedal: 'art:pedal', foot: 'art:pedal', center: 'art:center',
  off: 'off', mute: 'off', muted: 'off', none: 'off', silent: 'off', nothing: 'off', rest: 'off',
};

const REL_WORDS = {
  with: 'lock', follow: 'lock', follows: 'lock', following: 'lock', lock: 'lock', locked: 'lock', same: 'lock', unison: 'lock', match: 'lock', doubling: 'lock',
  between: 'interlock', around: 'interlock', against: 'interlock', opposite: 'interlock', interlock: 'interlock', gaps: 'interlock', fill: 'interlock',
  answer: 'answer', answers: 'answer', answering: 'answer', reply: 'answer', respond: 'answer', after: 'answer',
  avoid: 'avoid', away: 'avoid', apart: 'avoid',
};

function tokens(clause) {
  return clause.toLowerCase().split(/[\s\-]+/).map((w) => w.replace(/[.!?]+$/, '')).filter(Boolean);
}

function matchPhrase(ws, i) {
  for (let n = Math.min(4, ws.length - i); n >= 1; n--) {
    const key = ws.slice(i, i + n).join(' ');
    if (key in LANE_PHRASES) return { n, id: LANE_PHRASES[key] };
  }
  return null;
}

const mulText = (m) => (Math.abs(m - 1) < 0.05 ? '' : ` ×${m.toFixed(1)}`);

function naturalClause(clause, spec, lane) {
  const ws = tokens(clause);
  const said = [];
  const ignored = [];
  let mul = 1, neg = false;
  let number = null;
  let algoSet = false;
  const isKeeper = KEEPERS.includes(lane);
  const setGrid = (num, den, label) => { spec.algo = 'grid'; spec.grid = { num, den }; algoSet = true; said.push(label); };

  for (let i = 0; i < ws.length;) {
    const w = ws[i];

    // Relations: "follow the kick", "between the snare", "lock to kick"
    const target = LANE_ALIASES[w];
    if (target && target !== lane && i > 0) {
      const back = ws.slice(Math.max(0, i - 3), i).map((x) => REL_WORDS[x]).filter(Boolean);
      if (back.length) {
        const type = neg && back[back.length - 1] === 'lock' ? 'avoid' : back[back.length - 1];
        spec.relations.push({ type, lane: target });
        said.push(`${type} ${target}`);
        i++; neg = false; mul = 1; continue;
      }
    }

    const m = (() => {
      for (let n = Math.min(3, ws.length - i); n >= 1; n--) {
        const key = ws.slice(i, i + n).join(' ');
        if (key in MODS && !(n === 1 && key === 'more' && matchPhrase(ws, i + 1) == null)) return { n, v: MODS[key] };
      }
      return null;
    })();
    if (m) { mul *= m.v; i += m.n; continue; }
    if (NEG.has(w) && !(w === 'less' && i === ws.length - 1)) { neg = true; if (w === 'less') mul *= 0.6; i++; continue; }

    const p = matchPhrase(ws, i);
    if (p) {
      const id = p.id;
      i += p.n;
      if (id.startsWith('art:')) {
        const art = id.slice(4);
        if (lane && !DEFAULT_MAP[lane]?.[art]) ignored.push(`${art} (not a ${lane} sound)`);
        else if (neg) said.push(`not ${art}`);
        else { spec.art = art; said.push(`${art} articulation`); }
      } else switch (id) {
        case 'double':
          if (lane === 'kick') { if (!spec.doubleKick) setGrid(1, 16, 'constant 16th double bass'); spec.doubleKick = true; }
          else setGrid(1, 16, '16ths');
          break;
        case 'fast':
          if (lane === 'kick') { if (!spec.doubleKick) setGrid(1, 16, 'fast 16th double bass'); spec.doubleKick = true; }
          else if (isKeeper) setGrid(1, 16, '16ths');
          else { spec.densityScale = 1.6 * mul; spec.play = true; said.push(`busier${mulText(1.6 * mul)}`); }
          break;
        case 'slow':
          if (isKeeper || lane === 'kick') { spec.algo = 'on'; spec.only = ['beats']; algoSet = true; said.push('on the beats'); }
          else { spec.densityScale = 0.5; spec.play = true; said.push('sparser'); }
          break;
        case 'gallop': spec.algo = 'gallop'; algoSet = true; said.push('gallop (x.xx per beat)'); if (lane === 'kick') spec.doubleKick = true; break;
        case 'beats': spec.algo = 'on'; spec.only = ['beats']; algoSet = true; said.push('on every beat'); break;
        case 'g8': setGrid(1, 8, '8ths'); break;
        case 'g16': setGrid(1, 16, '16ths'); if (lane === 'kick') spec.doubleKick = true; break;
        case 'g32': setGrid(1, 32, '32nds'); break;
        case 'g12': setGrid(1, 12, 'triplets (best with Grid 1/24)'); break;
        case 'offbeats':
          if (neg) { spec.syncopation = 0.05; said.push('on the beat'); }
          else { spec.algo = 'on'; spec.only = ['offbeats']; algoSet = true; said.push('on the offbeats'); }
          break;
        case 'backbeat':
          if (lane === 'snare') { spec.backbeat = true; said.push('backbeat'); }
          else { spec.algo = 'on'; spec.only = ['2', '4', '6']; algoSet = true; said.push('on 2 and 4'); }
          break;
        case 'busy':
          if (neg) { spec.densityScale = 0.5; said.push('sparser'); }
          else { spec.densityScale = Math.min(2.5, 1.6 * mul); said.push(`busier${mulText(spec.densityScale)}`); }
          spec.play = true;
          break;
        case 'sparse':
          if (neg) { spec.densityScale = 1.6; said.push('busier'); }
          else { spec.densityScale = Math.max(0.2, 0.5 / mul); said.push(`sparser${mulText(spec.densityScale)}`); }
          spec.play = true;
          break;
        case 'simple':
          if (neg) { spec.syncopation = 0.8; said.push('syncopated'); break; }
          spec.simple = true; spec.syncopation = 0.05; said.push('simple, on the grid');
          if (lane === 'snare') spec.backbeat = true;
          if (isKeeper && !algoSet) setGrid(1, 8, '8ths');
          break;
        case 'sync':
          spec.syncopation = neg ? 0.05 : Math.min(1, 0.75 * mul);
          said.push(neg ? 'not syncopated' : `syncopated${mulText(mul)}`);
          spec.play = true;
          break;
        case 'loud': {
          const g = neg ? 0.8 : Math.min(1.6, 1 + 0.2 * mul);
          spec.gain = g; said.push(`velocity ×${g.toFixed(2)}`);
          break;
        }
        case 'soft': {
          const g = neg ? 1.2 : Math.max(0.35, 1 - 0.25 * mul);
          spec.gain = g; said.push(`velocity ×${g.toFixed(2)}`);
          break;
        }
        case 'ghost':
          spec.ghost = neg ? 0 : Math.min(1, 0.6 * mul);
          said.push(neg ? 'no ghost notes' : `ghost notes${mulText(mul)}`);
          break;
        case 'halftime':
          if (lane === 'snare') spec.halftime = true;
          else { spec.densityScale = 0.6; spec.play = true; }
          said.push('half-time');
          break;
        case 'blast': spec.algo = 'blast'; said.push('blast beat'); break;
        case 'off':
          if (neg) break;
          spec.off = true; said.push('off');
          break;
      }
      mul = 1; neg = false;
      continue;
    }

    if (/^\d+$/.test(w) && +w > 0 && +w <= 64) { number = { n: +w, word: w }; i++; continue; }
    if (!STOP.has(w) && !LANE_ALIASES[w] && !REL_WORDS[w]) ignored.push(w);
    i++;
  }

  if (number) {
    if (algoSet || spec.algo) ignored.push(number.word);
    else { spec.hitsPerBar = number.n; spec.play = true; said.push(`${number.n} hits per bar`); }
  }
  spec.understood.push(...new Set(said));
  if (ignored.length) spec.warnings.push(`ignored "${ignored.join(' ')}"`);
  return said.length > 0;
}

export function parseLaneSpec(text, lane = null) {
  const spec = { raw: text || '', algo: null, relations: [], warnings: [], understood: [] };
  if (!text || /^\s*auto\s*$/i.test(text)) return spec;

  for (const clause of text.split(/[,;]+/)) {
    const words = clause.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    if (strictClause(words, spec)) { spec.understood.push(clause.trim()); continue; }
    const before = spec.warnings.length;
    if (!naturalClause(clause, spec, lane) && spec.warnings.length === before) spec.warnings.push(`Didn't understand "${clause.trim()}"`);
  }
  return spec;
}

export const LANE_SPEC_HELP = [
  ['auto', 'let the song description decide'],
  ['double bass, loud', 'plain English works: double bass, gallop, 8ths, 16ths, on the beat, offbeat, backbeat'],
  ['busy | sparse | simple | syncopated', 'more/fewer hits, plainer or more displaced'],
  ['loud | soft | very heavy', 'velocity for this lane (also: hard, punchy, quiet, gentle)'],
  ['follow the kick | between the snare', 'relationship to another lane in plain words'],
  ['ghost notes | no ghosts | rimshot | open | bell', 'snare/hat/ride behaviors and articulations'],
  ['grid 1/8', 'steady hits every note value'],
  ['on 1 3 2&', 'hits only on those positions (1..n, &, e, a, la, li, @tatum)'],
  ['accent &', 'accent positions (e.g. syncopation on the &)'],
  ['open 4&', 'hi-hat opens on positions'],
  ['euclid 5/16 rotate 2', 'Bjorklund: k hits over n grid steps'],
  ['group 3/16 from each 1', 'groupings of 3 sixteenths, restarting each bar ("each beat" also works)'],
  ['group 3+3+2', 'packing: hits at the start of each group'],
  ['poly 3:2', 'k evenly spaced hits across n beats'],
  ['cycle 5/16', 'polymeter: lane repeats every 5 sixteenths'],
  ['ca 90 | crystal | lsystem | evolve | packing', 'choose algorithm'],
  ['lock kick | interlock snare | answer toms', 'relationship to another lane'],
  ['ghosts 0.6 | backbeat | halftime | blast', 'snare behaviors'],
  ['x..x..x.', 'literal pattern (x hit, X accent, g ghost, o open, . rest)'],
  ['velocity 100', 'fixed base velocity'],
  ['off', 'mute the lane'],
];
