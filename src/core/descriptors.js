// Descriptors -> parameter vector.
// Free text ("fast metal with VERY heavy double bass, no ghosts, 180 bpm") is read as phrases.
// Each phrase can be emphasized ("very", "!", CAPS), softened ("slightly") or negated ("no", "not").
// Values blend as a weighted average. Specific features like "double bass" outweigh broad genres.

export const BASE_PARAMS = {
  density: 0.5, syncopation: 0.3, polyrhythm: 0.1, polymeter: 0.1, tension: 0.35,
  ghost: 0.25, fills: 0.45, tomUse: 0.1, blast: 0, swing: 0, dynamics: 0.5, humanize: 0.3,
  mutation: 0.25, rideBias: 0.25, bell: 0.05, doubleKick: 0.1, halftime: 0, downbeat: 0.5,
  phasing: 0, sidestick: 0, cymbalAccents: 0.2, gallop: 0, fourFloor: 0,
  // march: crescendo snare rolls into accents. lull: bars where the kit drops out and toms carry.
  march: 0, lull: 0,
  // Velocity balance between limbs; 0.5 is neutral.
  feet: 0.5, hands: 0.5,
  caRule: null,
  algos: { euclid: 1, packing: 0.6, lsystem: 0.6, ca: 0.3, crystal: 0.3, genetic: 0.7 },
};

const GENRE = 0.7;
const FEATURE = 2.5;
const plain = { polymeter: 0, polyrhythm: 0, phasing: 0 };

// _w is how strongly a descriptor competes in the blend (default 1).
export const DESCRIPTORS = {
  // Genres
  metal: { _w: GENRE, ...plain, doubleKick: 0.45, density: 0.55, syncopation: 0.15, ghost: 0.05, mutation: 0.12, tension: 0.3, rideBias: 0.3, bell: 0.1, tomUse: 0.15, cymbalAccents: 0.45, dynamics: 0.3, humanize: 0.12, swing: 0, fills: 0.55, feet: 0.7, hands: 0.65, downbeat: 0.7, algos: { euclid: 2.5 }, tempo: 170 },
  thrash: { _w: GENRE, ...plain, density: 0.65, doubleKick: 0.4, syncopation: 0.1, ghost: 0, mutation: 0.12, cymbalAccents: 0.5, dynamics: 0.25, humanize: 0.1, rideBias: 0.2, feet: 0.7, hands: 0.7, algos: { euclid: 2.5 }, tempo: 200 },
  death: { _w: GENRE, ...plain, blast: 0.6, doubleKick: 0.8, density: 0.75, syncopation: 0.2, ghost: 0, feet: 0.75, hands: 0.7, algos: { euclid: 2 }, tempo: 220 },
  blackmetal: { _w: GENRE, ...plain, blast: 0.8, doubleKick: 0.7, density: 0.8, syncopation: 0.05, ghost: 0, rideBias: 0.1, algos: { euclid: 2 }, tempo: 230 },
  punk: { _w: GENRE, ...plain, density: 0.55, syncopation: 0.1, ghost: 0, doubleKick: 0, mutation: 0.1, rideBias: 0.15, humanize: 0.2, dynamics: 0.3, algos: { euclid: 2 }, tempo: 180 },
  rock: { _w: GENRE, ...plain, density: 0.45, syncopation: 0.2, ghost: 0.2, mutation: 0.15, doubleKick: 0, dynamics: 0.55, humanize: 0.3, rideBias: 0.2, algos: { euclid: 2 }, tempo: 120 },
  doom: { _w: GENRE, ...plain, density: 0.18, halftime: 1, syncopation: 0.05, tension: 0.15, mutation: 0.08, ghost: 0.03, doubleKick: 0, blast: 0, swing: 0, tomUse: 0.75, march: 0.55, lull: 0.45, fills: 0.35, downbeat: 0.9, dynamics: 0.75, humanize: 0.25, cymbalAccents: 0.4, rideBias: 0.45, feet: 0.75, hands: 0.65, algos: { euclid: 1.5 }, tempo: 60 },
  funeral: { _w: 1.5, ...plain, march: 1, lull: 0.6, tomUse: 0.7, density: 0.15, halftime: 1, downbeat: 0.9, syncopation: 0.03, ghost: 0, dynamics: 0.8, mutation: 0.05, tempo: 50 },
  dreary: { lull: 0.75, density: 0.2, tension: 0.15, syncopation: 0.05, mutation: 0.08, ghost: 0.05, fills: 0.25, dynamics: 0.7, downbeat: 0.8, tempo: 65 },
  grindcore: { blast: 0.85, density: 0.85, doubleKick: 0.85, dynamics: 0.2, fills: 0.6, rideBias: 0.5, mutation: 0.4, cymbalAccents: 0.6, ghost: 0, tempo: 250 },
  djent: { syncopation: 0.75, halftime: 0.6, doubleKick: 0.6, rideBias: 0.6, cymbalAccents: 0.85, polymeter: 0.5, algos: { packing: 3 }, tempo: 120 },
  math: { polymeter: 0.7, syncopation: 0.6, tension: 0.7, algos: { packing: 2, euclid: 1.5 } },
  funk: { _w: GENRE, polymeter: 0, polyrhythm: 0.05, ghost: 0.8, syncopation: 0.65, swing: 0.15, humanize: 0.55, dynamics: 0.8, doubleKick: 0, algos: { genetic: 1 }, tempo: 100 },
  hiphop: { _w: GENRE, ...plain, swing: 0.35, density: 0.35, syncopation: 0.5, ghost: 0.3, humanize: 0.5, doubleKick: 0, tempo: 90 },
  jazz: { _w: GENRE, swing: 0.65, rideBias: 1, ghost: 0.5, density: 0.35, humanize: 0.6, dynamics: 0.8, doubleKick: 0, polymeter: 0.1, algos: { genetic: 1, lsystem: 1 }, tempo: 140 },
  dance: { _w: GENRE, ...plain, fourFloor: 1, syncopation: 0.55, swing: 0, ghost: 0.1, humanize: 0.1, doubleKick: 0, algos: { euclid: 1 }, tempo: 124 },
  tribal: { tomUse: 0.95, bell: 0.85, rideBias: 0.85, sidestick: 0.6, ghost: 0.05, syncopation: 0.45, algos: { euclid: 2, crystal: 0.8 }, tempo: 110 },
  ritual: { tomUse: 0.8, density: 0.3, mutation: 0.1, bell: 0.5, downbeat: 0.8, algos: { ca: 1 }, tempo: 80 },

  // Kick, time feel
  doublebass: { _w: FEATURE, ...plain, doubleKick: 1, syncopation: 0.12, ghost: 0.05, feet: 0.7 },
  gallop: { _w: FEATURE, gallop: 1, doubleKick: 0.6, syncopation: 0.15 },
  fourfloor: { _w: FEATURE, fourFloor: 1 },
  blast: { _w: 1.5, blast: 1, density: 0.8, ghost: 0 },
  halftime: { _w: 1.5, halftime: 1, density: 0.4 },
  doubletime: { density: 0.8, doubleKick: 0.4 },
  swing: { _w: 1.5, swing: 0.6, ghost: 0.45 },
  straight: { syncopation: 0.1, swing: 0, humanize: 0.15 },
  syncopated: { syncopation: 0.75 },
  downbeat: { downbeat: 1, syncopation: 0.08, tension: 0.1, cymbalAccents: 0.5 },
  groove: { ghost: 0.7, syncopation: 0.4, humanize: 0.6, dynamics: 0.7 },
  laidback: { humanize: 0.55, density: 0.35, swing: 0.12, tension: 0.2, dynamics: 0.7, feet: 0.45, hands: 0.4 },
  driving: { density: 0.6, syncopation: 0.15, downbeat: 0.8, humanize: 0.15 },

  // Amount / complexity
  simple: { _w: 1.5, ...plain, syncopation: 0.08, mutation: 0.05, tension: 0.15, ghost: 0.1, fills: 0.3, tomUse: 0.1, cymbalAccents: 0.25, algos: { euclid: 3 } },
  complex: { _w: 1.2, tension: 0.7, mutation: 0.45, syncopation: 0.6, polymeter: 0.45, polyrhythm: 0.35, algos: { genetic: 1, crystal: 1, lsystem: 1, ca: 0.5 } },
  sparse: { density: 0.2, fills: 0.2, ghost: 0.05 },
  dense: { density: 0.85, ghost: 0.5 },
  fast: { _w: 0.8, density: 0.55, tempo: 190 },
  slow: { _w: 0.8, density: 0.4, tempo: 75 },
  ghosty: { _w: FEATURE, ghost: 0.75 },
  fills: { _w: FEATURE, fills: 0.9 },
  toms: { _w: FEATURE, tomUse: 0.85 },
  rolls: { _w: FEATURE, march: 0.85 },
  lulls: { _w: FEATURE, lull: 0.8 },
  ride: { _w: FEATURE, rideBias: 0.95 },
  hats: { _w: FEATURE, rideBias: 0.02 },
  accents: { _w: FEATURE, cymbalAccents: 0.85 },

  // Dynamics (hands = snare, hats, ride, toms, cymbals; feet = kick)
  heavy: { feet: 0.8, hands: 0.7, cymbalAccents: 0.55 },
  loud: { feet: 0.75, hands: 0.75, ghost: 0.1 },
  soft: { feet: 0.3, hands: 0.3, dynamics: 0.6, ghost: 0.35 },
  tight: { humanize: 0.05 },
  loose: { humanize: 0.7 },
  'heavy feet': { _w: FEATURE, feet: 0.9 },
  'light feet': { _w: FEATURE, feet: 0.2 },
  'heavy hands': { _w: FEATURE, hands: 0.9 },
  'light hands': { _w: FEATURE, hands: 0.2 },

  // Texture / algorithmic
  polyrhythmic: { polyrhythm: 0.9, tension: 0.6 },
  polymetric: { polymeter: 0.9, tension: 0.6 },
  musical: { syncopation: 0.35, ghost: 0.55, tension: 0.3, humanize: 0.5, dynamics: 0.7, algos: { genetic: 1.5, lsystem: 1 } },
  hypnotic: { mutation: 0.08, caRule: 184, phasing: 0.4, algos: { ca: 2 } },
  chaotic: { tension: 0.95, mutation: 0.8, syncopation: 0.7, caRule: 30, algos: { ca: 2, crystal: 1.5 } },
  phasing: { phasing: 1, mutation: 0.05 },
  crystalline: { mutation: 0.1, algos: { crystal: 3 } },
  organic: { humanize: 0.7, algos: { genetic: 2, ca: 1 } },
  fractal: { caRule: 90, algos: { lsystem: 2, ca: 1.5 } },
};

export const DISPLAY = {
  doublebass: 'double bass', fourfloor: 'four on the floor', blackmetal: 'black metal', death: 'death metal',
  hiphop: 'hip-hop', laidback: 'laid back', ghosty: 'ghost notes', accents: 'cymbal accents',
  funeral: 'funeral march', rolls: 'snare rolls',
};
export const displayName = (name) => DISPLAY[name] || name;

export const DESCRIPTOR_GROUPS = [
  ['Genre', ['metal', 'thrash', 'death', 'blackmetal', 'punk', 'rock', 'doom', 'grindcore', 'djent', 'math', 'funk', 'hiphop', 'jazz', 'dance', 'tribal', 'ritual']],
    ['Kick & feel', ['doublebass', 'gallop', 'fourfloor', 'blast', 'halftime', 'doubletime', 'swing', 'straight', 'syncopated', 'downbeat', 'groove', 'laidback', 'driving', 'funeral', 'dreary']],
    ['Amount', ['simple', 'complex', 'sparse', 'dense', 'fast', 'slow', 'ghosty', 'fills', 'toms', 'rolls', 'lulls', 'ride', 'hats', 'accents']],
  ['Dynamics', ['heavy', 'loud', 'soft', 'tight', 'loose']],
  ['Texture', ['polyrhythmic', 'polymetric', 'musical', 'hypnotic', 'chaotic', 'phasing', 'crystalline', 'organic', 'fractal']],
];

// phrase -> descriptor name(s). Hyphens are split into words before matching.
const PHRASES = {
  grind: 'grindcore', blastbeat: 'blast', 'blast beat': 'blast', 'blast beats': 'blast', blasts: 'blast', blasting: 'blast',
  polyrhythm: 'polyrhythmic', poly: 'polyrhythmic', polyrhythms: 'polyrhythmic',
  polymeter: 'polymetric', polymeters: 'polymetric', tribe: 'tribal', trance: 'hypnotic', mathcore: 'math', 'math rock': 'math',
  swung: 'swing', swingy: 'swing', shuffle: 'swing', shuffled: 'swing',
  half: 'halftime', 'half time': 'halftime', double: 'doubletime', 'double time': 'doubletime',
  chaos: 'chaotic', crystal: 'crystalline', quasicrystal: 'crystalline', phase: 'phasing',
  syncopation: 'syncopated', offbeat: 'syncopated', 'off beat': 'syncopated', groovy: 'groove', grooving: 'groove', downbeats: 'downbeat',
  'heavy metal': ['metal', 'heavy'], metalcore: ['metal', 'heavy'], 'groove metal': ['metal', 'groove'], 'nu metal': ['metal', 'groove'],
  'death metal': 'death', 'black metal': 'blackmetal', black: 'blackmetal', thrashy: 'thrash', speed: 'thrash', 'speed metal': 'thrash',
  hardcore: 'punk', 'd beat': 'punk', dbeat: 'punk', 'pop punk': 'punk', skate: 'punk',
  'hard rock': ['rock', 'heavy'], 'classic rock': 'rock', 'indie rock': 'rock', indie: 'rock', 'alt rock': 'rock', grunge: ['rock', 'heavy'],
  sludge: 'doom', stoner: 'doom', 'post metal': 'doom', doomy: 'doom', 'doom metal': 'doom', 'sludge metal': 'doom', 'stoner metal': 'doom',
  'stoner rock': 'doom', 'funeral doom': ['doom', 'funeral'], 'death doom': ['doom', 'heavy'], 'funeral march': 'funeral', dirge: 'funeral',
  depressive: 'dreary', depressing: 'dreary', depressed: 'dreary', 'down beat': 'dreary', sad: 'dreary', mournful: 'dreary', somber: 'dreary',
  sombre: 'dreary', gloomy: 'dreary', bleak: 'dreary', melancholy: 'dreary', melancholic: 'dreary', dismal: 'dreary', desolate: 'dreary',
  roll: 'rolls', 'snare roll': 'rolls', 'snare rolls': 'rolls', 'buzz roll': 'rolls', 'buzz rolls': 'rolls', 'press rolls': 'rolls', march: 'rolls',
  lull: 'lulls', 'drop outs': 'lulls', dropouts: 'lulls', spacious: 'lulls', space: 'lulls', progressive: 'complex', prog: 'complex', proggy: 'complex', technical: 'complex', 'tech death': ['death', 'complex'],
  funky: 'funk', 'hip hop': 'hiphop', 'boom bap': 'hiphop', rap: 'hiphop', jazzy: 'jazz', bebop: 'jazz',
  edm: 'dance', house: 'dance', techno: 'dance', disco: 'dance', club: 'dance', electronic: 'dance',
  'four on the floor': 'fourfloor', '4 on the floor': 'fourfloor', fotf: 'fourfloor', '4otf': 'fourfloor',
  'double bass': 'doublebass', 'double basses': 'doublebass', 'double kick': 'doublebass', 'double kicks': 'doublebass',
  'double pedal': 'doublebass', 'double pedals': 'doublebass', 'twin pedal': 'doublebass', 'double bass drum': 'doublebass',
  'double bass drums': 'doublebass', 'constant kick': 'doublebass', 'constant kicks': 'doublebass', 'rolling kick': 'doublebass',
  'rolling kicks': 'doublebass', 'machine gun kick': 'doublebass', '16th kicks': 'doublebass', 'sixteenth kicks': 'doublebass',
  galloping: 'gallop', gallops: 'gallop',
  basic: 'simple', plain: 'simple', straightforward: 'simple', standard: 'simple', classic: 'simple', normal: 'simple', easy: 'simple',
  complicated: 'complex', intricate: 'complex',
  busy: 'dense', full: 'dense', 'kit work': 'dense', minimal: 'sparse', minimalist: 'sparse', few: 'sparse', empty: 'sparse',
  quick: 'fast', speedy: 'fast', uptempo: 'fast', 'up tempo': 'fast', frantic: 'fast', faster: 'fast',
  downtempo: 'slow', sluggish: 'slow', crawling: 'slow', slower: 'slow',
  'ghost notes': 'ghosty', 'ghost note': 'ghosty', ghosts: 'ghosty', ghost: 'ghosty', ghosted: 'ghosty', 'ghost strokes': 'ghosty',
  fill: 'fills', 'drum fills': 'fills', tom: 'toms', 'tom grooves': 'toms', 'on the ride': 'ride', 'ride cymbal': 'ride',
  hat: 'hats', hihat: 'hats', 'hi hat': 'hats', 'hi hats': 'hats', hihats: 'hats', 'on the hats': 'hats',
  'cymbal accents': 'accents', crashes: 'accents', chinas: 'accents', china: 'accents', splashes: 'accents', cymbals: 'accents',
  'laid back': 'laidback', relaxed: 'laidback', chill: 'laidback', lazy: 'laidback', mellow: 'laidback',
  relentless: 'driving', steady: 'driving', pounding: ['driving', 'heavy'], marching: 'driving',
  aggressive: 'loud', intense: 'loud', hard: 'loud', powerful: 'loud', louder: 'loud', angry: 'loud',
  gentle: 'soft', quiet: 'soft', light: 'soft', delicate: 'soft', softer: 'soft', quieter: 'soft', subtle: 'soft',
  heavier: 'heavy', crushing: 'heavy', massive: 'heavy',
  robotic: 'tight', quantized: 'tight', mechanical: 'tight', precise: 'tight',
  human: 'loose', sloppy: 'loose', humanized: 'loose', drunk: 'loose',
  'four on floor': 'fourfloor',
};

const LOUD_ADJ = ['heavy', 'heavier', 'loud', 'louder', 'hard', 'harder', 'strong', 'stronger', 'powerful', 'punchy', 'aggressive', 'big', 'fat', 'pounding', 'accented', 'intense'];
const SOFT_ADJ = ['soft', 'softer', 'light', 'lighter', 'quiet', 'quieter', 'gentle', 'subtle', 'delicate', 'weak', 'weaker', 'ghosted'];
const FEET_N = ['feet', 'foot', 'kick', 'kicks', 'kick drum', 'bass drum', 'bass drums', 'pedals', 'legs'];
const HAND_N = ['hands', 'hand', 'snare', 'snares', 'sticks', 'arms', 'cymbal work', 'hand work'];
for (const [adjs, level] of [[LOUD_ADJ, 'heavy'], [SOFT_ADJ, 'light']]) {
  for (const a of adjs) {
    for (const n of FEET_N) { PHRASES[`${a} ${n}`] = `${level} feet`; PHRASES[`${n} ${a}`] = `${level} feet`; }
    for (const n of HAND_N) { PHRASES[`${a} ${n}`] = `${level} hands`; PHRASES[`${n} ${a}`] = `${level} hands`; }
  }
}
for (const name of Object.keys(DESCRIPTORS)) PHRASES[name] ??= name;
for (const [name, label] of Object.entries(DISPLAY)) PHRASES[label.replace(/-/g, ' ')] ??= name;

// Multipliers applied to the next phrase in the same clause.
const MODIFIERS = {
  very: 1.6, really: 1.6, super: 1.7, extremely: 1.9, ultra: 1.9, insanely: 1.9, insane: 1.8, crazy: 1.7, so: 1.4,
  more: 1.35, much: 1.3, heavily: 1.6, totally: 1.6, mega: 1.8, hella: 1.7, too: 1.5, quite: 1.25, pretty: 1.2,
  'lots of': 1.6, 'lot of': 1.6, 'a lot of': 1.6, 'tons of': 1.7, 'plenty of': 1.5, 'full on': 1.6, 'all out': 1.8, max: 1.9, maximum: 1.9,
  slightly: 0.5, somewhat: 0.6, mildly: 0.5, 'a bit': 0.5, 'a little': 0.5, 'a touch of': 0.4, 'a bit of': 0.5, 'a little bit': 0.4,
  bit: 0.5, little: 0.5, kinda: 0.6, 'kind of': 0.6, 'sort of': 0.6, barely: 0.3, some: 0.7, hint: 0.4, 'a hint of': 0.4, touch: 0.4,
};
const NEGATORS = new Set(['no', 'not', 'without', 'non', 'never', 'zero', 'nothing', 'avoid', 'dont', "don't", 'less']);
const STOPWORDS = new Set([
  'a', 'an', 'the', 'with', 'and', 'of', 'in', 'on', 'to', 'for', 'style', 'styled', 'feel', 'feeling', 'vibe', 'vibes', 'beat', 'beats',
  'drums', 'drum', 'drumming', 'drummer', 'pattern', 'patterns', 'rhythm', 'rhythms', 'song', 'track', 'part', 'section', 'like', 'kind',
  'type', 'sound', 'sounding', 'ish', 'that', 'this', 'is', 'it', 'its', "it's", 'but', 'plus', 'has', 'have', 'played', 'playing', 'play',
  'i', 'want', 'would', 'something', 'using', 'use', 'also', '&', 'n', 'or', 'verse', 'chorus', 'intro', 'outro', 'bridge', 'riff', 'riffs',
  'be', 'should', 'mostly', 'lots', 'everything', 'all', 'over', 'under', 'through', 'throughout', 'at', 'tempo', 'groove', 'bpm', 'some',
  'kit', 'parts', 'flow', 'band', 'music', 'genre', 'way', 'just', 'only', 'by', 'from', 'my', 'me', 'we', 'our', 'up', 'down', 'bass',
]);
STOPWORDS.delete('groove');

const MAX_PHRASE = 5;

function tokenize(text) {
  const out = [];
  const re = /[^\s,;:()[\]{}"]+/g;
  let m, lastEnd = 0;
  while ((m = re.exec(text))) {
    const gap = text.slice(lastEnd, m.index);
    let raw = m[0];
    let start = m.index;
    const boundary = /[,;:()]/.test(gap) || out.length === 0;
    lastEnd = m.index + raw.length;
    // Sentence punctuation ends a clause too.
    const endsClause = /[.!?]$/.test(raw) && !/^\d*\.\d+$/.test(raw);
    const bangs = (raw.match(/!+$/) || [''])[0].length;
    raw = raw.replace(/[.!?]+$/, '');
    if (!raw) continue;
    const caps = raw.length >= 3 && /[A-Z]/.test(raw) && raw === raw.toUpperCase() && /[A-Z]{2}/.test(raw);
    if (raw.includes('=')) { out.push({ w: raw.toLowerCase(), start, end: lastEnd, boundary, bangs, caps, endsClause }); continue; }
    const pieces = raw.toLowerCase().split('-').filter(Boolean);
    pieces.forEach((w, i) => out.push({ w, start, end: lastEnd, boundary: boundary && i === 0, bangs: i === pieces.length - 1 ? bangs : 0, caps, endsClause: endsClause && i === pieces.length - 1 }));
  }
  for (let i = 1; i < out.length; i++) if (out[i - 1].endsClause) out[i].boundary = true;
  return out;
}

function matchAt(tokens, i, table) {
  for (let n = Math.min(MAX_PHRASE, tokens.length - i); n >= 1; n--) {
    if (tokens.slice(i + 1, i + n).some((t) => t.boundary)) continue;
    const key = tokens.slice(i, i + n).map((t) => t.w).join(' ');
    if (key in table) return { n, value: table[key] };
  }
  return null;
}

// Free text -> { items: [{ name, weight, negate, start, end }], overrides, unknown: [{ word, start, end }], tempo }
export function interpretDescriptors(input, weightScale = 1) {
  const text = Array.isArray(input) ? input.join(', ') : String(input || '');
  const tokens = tokenize(text);
  const items = [];
  const overrides = {};
  const unknown = [];
  let tempo = null;
  let mul = 1, neg = false, modStart = null;
  const reset = () => { mul = 1; neg = false; modStart = null; };

  for (let i = 0; i < tokens.length;) {
    const tok = tokens[i];
    if (tok.boundary) reset();
    const kv = /^([a-z]+)=([\d.]+)$/.exec(tok.w);
    if (kv) {
      const key = Object.keys(BASE_PARAMS).find((k) => k.toLowerCase() === kv[1]);
      if (key && typeof BASE_PARAMS[key] === 'number') overrides[key] = parseFloat(kv[2]);
      else unknown.push({ word: tok.w, start: tok.start, end: tok.end });
      i++; continue;
    }
    const bpm = /^(\d{2,3})(bpm)?$/.exec(tok.w);
    if (bpm && (bpm[2] || tokens[i + 1]?.w === 'bpm')) {
      tempo = Number(bpm[1]);
      i += bpm[2] ? 1 : 2; continue;
    }
    const d = matchAt(tokens, i, PHRASES);
    if (d) {
      const last = tokens[i + d.n - 1];
      let w = mul * weightScale;
      if (last.bangs) w *= 1 + 0.5 * Math.min(2, last.bangs);
      if (tokens.slice(i, i + d.n).some((t) => t.caps)) w *= 1.5;
      for (const name of [].concat(d.value)) {
        items.push({ name, weight: w, negate: neg, start: modStart ?? tok.start, end: last.end });
      }
      i += d.n;
      // "heavy double bass" / "soft swing": the adjective also scales the next phrase.
      const dyn = { heavy: 1.4, loud: 1.4, soft: 0.6 }[d.value];
      if (dyn && tokens[i] && !tokens[i].boundary && matchAt(tokens, i, PHRASES)) {
        mul *= dyn;
        continue;
      }
      reset();
      continue;
    }
    const m = matchAt(tokens, i, MODIFIERS);
    if (m) { mul *= m.value; modStart ??= tok.start; i += m.n; continue; }
    if (NEGATORS.has(tok.w)) {
      neg = true;
      if (tok.w === 'less') mul *= 0.5;
      modStart ??= tok.start;
      i++; continue;
    }
    if (!STOPWORDS.has(tok.w) && !/^\d+$/.test(tok.w)) unknown.push({ word: tok.w, start: tok.start, end: tok.end });
    i++;
  }
  return { items, overrides, unknown, tempo, text };
}

// Weighted blend of interpreted items onto the base parameters.
export function blendItems(items, overrides = {}, base = BASE_PARAMS) {
  const sums = {}, totals = {};
  const out = { ...base, algos: { ...base.algos } };
  let tSum = 0, tW = 0;
  for (const it of items) {
    const d = DESCRIPTORS[it.name];
    if (!d) continue;
    const w = Math.min(3, Math.max(0.1, it.weight));
    const pull = Math.min(2, w);
    const share = (d._w ?? 1) * w;
    for (const [k, v] of Object.entries(d)) {
      if (k === '_w') continue;
      if (k === 'algos') { if (!it.negate) for (const [a, x] of Object.entries(v)) out.algos[a] = (out.algos[a] || 0) + x * w; continue; }
      if (k === 'caRule') { if (!it.negate) out.caRule = v; continue; }
      if (k === 'tempo') { if (!it.negate) { tSum += v * share; tW += share; } continue; }
      const b = base[k] ?? 0;
      const val = Math.max(0, Math.min(1, it.negate ? b - (v - b) * pull : b + (v - b) * pull));
      sums[k] = (sums[k] || 0) + val * share;
      totals[k] = (totals[k] || 0) + share;
    }
  }
  for (const k of Object.keys(sums)) out[k] = sums[k] / totals[k];
  Object.assign(out, overrides);
  return { params: out, tempoHint: tW ? Math.round(tSum / tW / 5) * 5 : null };
}

// Human-readable summary of what was understood.
export function describeItems(items) {
  return items.map((it) => {
    const amt = Math.abs(it.weight - 1) < 0.05 ? '' : ` ×${it.weight.toFixed(1)}`;
    return `${it.negate ? 'no ' : ''}${displayName(it.name)}${amt}`;
  });
}

export function descriptorNames(text) {
  return [...new Set(interpretDescriptors(text).items.filter((it) => !it.negate).map((it) => it.name))];
}

export function parseDescriptorList(text) {
  if (Array.isArray(text)) return text;
  return (text || '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

// Compatibility wrapper: free text or a word list -> params.
export function blendDescriptors(input, base = BASE_PARAMS) {
  const r = interpretDescriptors(input);
  const b = blendItems(r.items, r.overrides, base);
  return {
    params: b.params,
    tempoHint: r.tempo ?? b.tempoHint,
    warnings: r.unknown.map((u) => (u.word.includes('=') ? `Unknown parameter "${u.word}"` : `Didn't recognize "${u.word}"`)),
  };
}

export const ROLES = ['groove', 'variation', 'contrast', 'build', 'breakdown', 'fill'];

export function applyRole(params, role) {
  const p = { ...params, algos: { ...params.algos } };
  switch (role) {
    case 'variation':
      p.mutation = Math.max(p.mutation, 0.35);
      break;
    case 'contrast':
      p.tension = Math.min(1, p.tension + 0.3);
      p.polymeter = Math.min(1, p.polymeter + 0.35);
      p.polyrhythm = Math.min(1, p.polyrhythm + 0.25);
      p.syncopation = Math.min(1, p.syncopation + 0.15);
      p.flipTimekeeper = true;
      break;
    case 'build':
      p.density = Math.min(1, p.density + 0.15);
      p.fills = 1;
      break;
    case 'breakdown':
      p.halftime = 1;
      p.density *= 0.6;
      p.downbeat = 1;
      p.blast *= 0.3;
      p.cymbalAccents = Math.min(1, p.cymbalAccents + 0.4);
      p.tension *= 0.6;
      break;
    case 'fill':
      p.fills = 1;
      break;
  }
  return p;
}
