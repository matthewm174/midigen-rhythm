// Harmony & melody styles. The song description is read with this vocabulary as well as the drum one,
// so "baroque", "hard rock" or "gregorian chant" shape the chords, bass, comping and melody.
import { interpretWith, STOPWORDS } from '../core/descriptors.js';
import { parseKey } from './tuning.js';
import { SCALES } from './scales.js';

// Numeric parameters (0-1 unless noted). hr = log2(bars per chord), -2..2.
export const H_BASE = {
  hr: 0, seventh: 0.15, ext: 0.05, power: 0, sus: 0.05, chromatic: 0.1, cadence: 0.6, pedal: 0.05, parallel: 0,
  spread: 0.4, voices: 0.4, quartal: 0, push: 0.15, compDensity: 0.5, bassDensity: 0.4, bassLegato: 0.85,
  step: 0.7, range: 0.5, melDensity: 0.5, melSync: 0.25, repeat: 0.5, chroma: 0.08, ornament: 0.05, recite: 0,
  register: 0.5, legato: 0.75, blue: 0, dissonance: 0.2, melRest: 0.35, modulate: 0.15, micro: 0, drumless: 0,
};
export const CATS = ['grammar', 'scale', 'bass', 'comp', 'melody', 'tuning', 'key', 'orn', 'pBass', 'pComp', 'pMel', 'meter'];
const BASE_CATS = {
  grammar: { functional: 1, pop: 0.6 }, scale: { major: 1, minor: 1 }, bass: { follow: 1 }, comp: { pad: 0.5, strum: 0.5 },
  melody: { lyric: 1 }, tuning: { just: 0.2 }, key: {}, orn: { grace: 1 }, pBass: { 33: 1 }, pComp: { 0: 1 }, pMel: { 73: 1 }, meter: {},
};

export const BASS_STYLES = ['follow', 'chug', 'walking', 'continuo', 'pedal', 'drone', 'octave', 'rootfifth', 'sub', 'eighths', 'none'];
export const COMP_STYLES = ['pad', 'block', 'stab', 'power', 'chug', 'strum', 'arpeggio', 'alberti', 'tremolo', 'comp', 'skank', 'organum', 'drone', 'tanpura', 'none'];
export const MELODY_STYLES = ['lyric', 'chant', 'sequence', 'bebop', 'riff', 'arp', 'minimal', 'ornate', 'row', 'none'];

const ERA = 0.8, FEATURE = 2.5, SCALE_W = 3;

// era: grouping for the UI chips. Programs are General MIDI (0-based).
export const H_STYLES = {
  // Early & sacred
  gregorian: { era: 'Early', _w: 1.5, grammar: { drone: 6 }, scale: { dorian: 2, phrygian: 1, mixolydian: 1, lydian: 0.5 }, bass: { none: 6 }, comp: { none: 6 }, melody: { chant: 6 }, step: 0.92, range: 0.3, melDensity: 0.7, melSync: 0, recite: 0.6, repeat: 0.15, register: 0.25, legato: 0.97, melRest: 0.3, ornament: 0, cadence: 0.9, tuning: { pythagorean: 3 }, pMel: { 52: 3 }, key: { D: 2, E: 1, F: 1, G: 1 }, drumless: 1, tempo: 70 },
  organum: { era: 'Early', _w: 1.5, grammar: { drone: 6 }, scale: { dorian: 2, mixolydian: 1, phrygian: 1 }, bass: { drone: 3, none: 1 }, comp: { organum: 6 }, melody: { chant: 6 }, step: 0.9, range: 0.3, melDensity: 0.55, melSync: 0, recite: 0.4, register: 0.35, legato: 0.97, power: 1, tuning: { pythagorean: 3 }, pMel: { 52: 3 }, pComp: { 52: 3 }, pBass: { 19: 2 }, drumless: 1, tempo: 66 },
  medieval: { era: 'Early', grammar: { medieval: 3, drone: 1 }, scale: { dorian: 2, mixolydian: 1.5, minor: 0.5 }, power: 0.7, bass: { drone: 2, rootfifth: 1 }, comp: { drone: 1, pad: 1, strum: 0.5 }, melody: { ornate: 1, lyric: 1 }, ornament: 0.3, orn: { grace: 1, mordent: 1 }, step: 0.78, melSync: 0.15, tuning: { pythagorean: 3 }, pMel: { 74: 2 }, pComp: { 46: 1, 24: 1 }, pBass: { 42: 1 }, drumless: 0.4, tempo: 100 },
  renaissance: { era: 'Early', sus: 0, grammar: { renaissance: 3 }, scale: { dorian: 1, minor: 1, major: 1, mixolydian: 0.5 }, bass: { continuo: 2 }, comp: { block: 2, pad: 1 }, melody: { lyric: 2 }, step: 0.82, seventh: 0, ext: 0, chromatic: 0.05, cadence: 0.9, voices: 0.7, ornament: 0.15, orn: { mordent: 1, grace: 1 }, melSync: 0.1, tuning: { meantone: 3 }, pMel: { 74: 2 }, pComp: { 24: 2 }, pBass: { 42: 2 }, drumless: 0.7, tempo: 90 },
  chorale: { era: 'Early', sus: 0, grammar: { functional: 2, hymn: 2 }, bass: { continuo: 2 }, comp: { block: 4 }, melody: { lyric: 2 }, hr: -1, seventh: 0.2, cadence: 1, voices: 0.75, step: 0.85, range: 0.4, melDensity: 0.3, melSync: 0, legato: 0.95, pComp: { 19: 3 }, pBass: { 19: 2 }, pMel: { 52: 2 }, tuning: { meantone: 1, just: 1 }, drumless: 0.8, tempo: 80 },

  // Baroque & classical
  baroque: { era: 'Baroque & classical', sus: 0, grammar: { baroque: 3, functional: 2 }, scale: { major: 1, minor: 1.2 }, bass: { continuo: 3 }, comp: { block: 1, arpeggio: 1 }, melody: { sequence: 3, lyric: 1 }, hr: -1, seventh: 0.35, chromatic: 0.2, cadence: 0.9, ornament: 0.4, orn: { trill: 2, mordent: 1, turn: 1 }, step: 0.75, melDensity: 0.75, melSync: 0.1, range: 0.7, legato: 0.65, register: 0.6, voices: 0.6, modulate: 0.3, pComp: { 6: 3 }, pBass: { 42: 2 }, pMel: { 40: 2, 73: 1 }, tuning: { werckmeister: 2, meantone: 1 }, key: { D: 1, G: 1, C: 0.5, A: 0.5 }, drumless: 0.6, tempo: 100 },
  passacaglia: { era: 'Baroque & classical', sus: 0, grammar: { lament: 5 }, scale: { minor: 3 }, bass: { continuo: 3 }, comp: { block: 1, arpeggio: 1 }, melody: { sequence: 2, lyric: 1 }, seventh: 0.3, ornament: 0.3, orn: { trill: 2, mordent: 1 }, pComp: { 6: 2 }, pBass: { 42: 2 }, pMel: { 40: 2 }, tuning: { werckmeister: 2 }, drumless: 0.6, tempo: 70 },
  classical: { era: 'Baroque & classical', sus: 0, grammar: { functional: 3, classical: 1 }, scale: { major: 2, minor: 1 }, bass: { rootfifth: 1, follow: 1 }, comp: { alberti: 3, block: 1 }, melody: { lyric: 3 }, seventh: 0.2, chromatic: 0.15, cadence: 1, ornament: 0.15, orn: { trill: 1, turn: 1, grace: 1 }, step: 0.75, melSync: 0.1, repeat: 0.6, pComp: { 0: 3 }, pBass: { 0: 2 }, pMel: { 40: 1, 0: 1 }, tuning: { werckmeister: 1 }, drumless: 0.6, tempo: 120 },
  romantic: { era: 'Baroque & classical', sus: 0, grammar: { romantic: 3, functional: 1 }, scale: { minor: 1.5, major: 1, harmonicMinor: 0.5 }, bass: { follow: 1, pedal: 0.5 }, comp: { arpeggio: 3, pad: 1 }, melody: { lyric: 3 }, seventh: 0.45, ext: 0.2, chromatic: 0.45, modulate: 0.4, spread: 0.8, range: 0.8, dissonance: 0.35, legato: 0.9, pComp: { 0: 3 }, pBass: { 0: 1, 42: 1 }, pMel: { 40: 1.5, 42: 1 }, drumless: 0.6, tempo: 76 },
  cinematic: { era: 'Modern', grammar: { cinematic: 3 }, scale: { minor: 1.5, major: 1 }, bass: { follow: 1, pedal: 1 }, comp: { pad: 2, arpeggio: 1 }, melody: { lyric: 2 }, hr: 0.5, spread: 0.85, voices: 0.8, chromatic: 0.3, pComp: { 48: 3 }, pBass: { 43: 2 }, pMel: { 60: 2, 48: 1 }, tempo: 90 },

  // 20th century
  impressionist: { era: 'Modern', grammar: { impressionist: 3, modal: 1 }, scale: { lydian: 1, wholeTone: 1, majorPentatonic: 0.5, dorian: 0.5 }, parallel: 0.8, ext: 0.7, seventh: 0.7, comp: { arpeggio: 2, pad: 2 }, bass: { pedal: 1, follow: 0.5 }, melody: { lyric: 2 }, spread: 0.8, chromatic: 0.3, dissonance: 0.5, melSync: 0.2, pComp: { 0: 2, 46: 1 }, pMel: { 73: 3 }, pBass: { 0: 1 }, drumless: 0.7, tempo: 72 },
  minimalist: { era: 'Modern', grammar: { minimalist: 3 }, hr: 1, comp: { arpeggio: 3 }, bass: { pedal: 1, follow: 0.5 }, melody: { minimal: 3 }, repeat: 0.95, step: 0.6, pComp: { 12: 2, 0: 1 }, pMel: { 11: 1, 73: 1 }, pBass: { 0: 1 }, tuning: { just: 2 }, tempo: 120 },
  serial: { era: 'Modern', _w: 1.5, grammar: { row: 6 }, scale: { chromatic: 6 }, comp: { block: 1, stab: 1 }, bass: { follow: 1 }, melody: { row: 6 }, dissonance: 1, step: 0.3, range: 1, chromatic: 1, melSync: 0.4, pComp: { 0: 3 }, pMel: { 71: 2 }, pBass: { 0: 1 }, tuning: { '12tet': 4 }, drumless: 0.5, tempo: 80 },
  ambient: { era: 'Modern', grammar: { minimalist: 2, impressionist: 1 }, hr: 2, comp: { pad: 4 }, bass: { drone: 2 }, melody: { lyric: 1 }, melDensity: 0.15, legato: 1, ext: 0.5, spread: 1, pComp: { 89: 3 }, pBass: { 89: 1 }, pMel: { 88: 1, 91: 1 }, tuning: { just: 2 }, drumless: 0.7, tempo: 70 },

  // Jazz & blues
  blues: { era: 'Jazz & blues', grammar: { blues12: 4 }, scale: { blues: 2, minorPentatonic: 1, mixolydian: 1 }, seventh: 1, bass: { walking: 1, follow: 1 }, comp: { comp: 1, strum: 1 }, melody: { riff: 2, lyric: 1 }, blue: 0.7, ornament: 0.3, orn: { grace: 3 }, pComp: { 26: 1, 0: 1 }, pBass: { 32: 1, 33: 1 }, pMel: { 29: 1, 65: 1, 22: 1 }, tuning: { '12tet': 3 }, tempo: 90 },
  jazz: { era: 'Jazz & blues', grammar: { jazz: 4 }, scale: { major: 1, dorian: 1, minor: 0.5 }, seventh: 1, ext: 0.6, chromatic: 0.5, bass: { walking: 4 }, comp: { comp: 4 }, melody: { bebop: 2, lyric: 1 }, spread: 0.5, voices: 0.5, dissonance: 0.5, chroma: 0.4, melDensity: 0.7, melSync: 0.55, range: 0.75, blue: 0.3, quartal: 0.2, pComp: { 0: 2, 26: 1 }, pBass: { 32: 3 }, pMel: { 65: 2, 56: 1, 66: 1 }, tuning: { '12tet': 2 }, tempo: 140 },
  bebop: { era: 'Jazz & blues', grammar: { jazz: 4 }, seventh: 1, ext: 0.5, chromatic: 0.6, bass: { walking: 4 }, comp: { comp: 4 }, melody: { bebop: 5 }, melDensity: 0.9, chroma: 0.6, melSync: 0.5, range: 0.85, pComp: { 0: 2 }, pBass: { 32: 3 }, pMel: { 65: 2, 56: 1 }, tempo: 220 },
  modaljazz: { era: 'Jazz & blues', grammar: { modal: 3 }, scale: { dorian: 4 }, quartal: 0.8, seventh: 0.8, comp: { comp: 2, pad: 1 }, bass: { walking: 3 }, melody: { lyric: 1, bebop: 1 }, hr: 1, pComp: { 0: 2 }, pBass: { 32: 3 }, pMel: { 56: 1, 66: 1 }, tempo: 136 },
  bossa: { era: 'Jazz & blues', grammar: { bossa: 3 }, seventh: 1, ext: 0.5, bass: { rootfifth: 2 }, comp: { comp: 2, strum: 1 }, melody: { lyric: 2 }, melSync: 0.5, pComp: { 24: 3 }, pBass: { 32: 2 }, pMel: { 73: 2, 65: 1 }, tempo: 130 },
  gospel: { era: 'Jazz & blues', grammar: { gospel: 3 }, seventh: 0.6, ext: 0.4, chromatic: 0.4, comp: { block: 1, comp: 1 }, bass: { follow: 1 }, melody: { lyric: 2 }, ornament: 0.3, orn: { grace: 1, turn: 1 }, pComp: { 16: 2, 0: 1 }, pBass: { 33: 1 }, pMel: { 52: 2 }, tempo: 90 },
  soul: { era: 'Jazz & blues', grammar: { soul: 3 }, seventh: 0.7, ext: 0.5, comp: { stab: 1, pad: 1, comp: 1 }, bass: { follow: 2, octave: 0.5 }, melody: { lyric: 2 }, melSync: 0.45, pComp: { 4: 3 }, pBass: { 33: 2 }, pMel: { 65: 1, 53: 1 }, tempo: 92 },
  lofi: { era: 'Jazz & blues', grammar: { lofi: 3 }, seventh: 1, ext: 0.8, comp: { pad: 1, comp: 1 }, bass: { sub: 1, follow: 1 }, melody: { lyric: 1, minimal: 1 }, spread: 0.6, dissonance: 0.4, repeat: 0.8, pComp: { 4: 3 }, pBass: { 33: 1, 38: 1 }, pMel: { 11: 1, 4: 1 }, tempo: 80 },
  funk: { era: 'Jazz & blues', grammar: { funk: 3 }, scale: { dorian: 2, mixolydian: 1, minorPentatonic: 1 }, seventh: 0.9, ext: 0.6, hr: 1, comp: { stab: 2, strum: 2 }, bass: { octave: 3, follow: 1 }, melody: { riff: 2 }, bassDensity: 0.8, compDensity: 0.7, melSync: 0.6, pComp: { 27: 2, 4: 1 }, pBass: { 36: 2, 33: 1 }, pMel: { 61: 2 }, tempo: 100 },

  // Popular
  pop: { era: 'Popular', grammar: { pop: 4 }, scale: { major: 2, minor: 1 }, comp: { strum: 1, pad: 1, stab: 0.5 }, bass: { follow: 2, eighths: 0.5 }, melody: { lyric: 3 }, repeat: 0.75, step: 0.75, sus: 0.2, pComp: { 0: 1, 25: 1 }, pBass: { 33: 2 }, pMel: { 53: 1, 80: 0.5 }, tempo: 115 },
  rock: { era: 'Popular', seventh: 0.04, grammar: { rock: 3, pop: 1 }, scale: { major: 1, mixolydian: 1, minor: 1, minorPentatonic: 0.5 }, power: 0.4, comp: { power: 2, strum: 1.5 }, bass: { follow: 2, eighths: 1 }, melody: { riff: 1.5, lyric: 1.5 }, blue: 0.3, sus: 0.15, pComp: { 29: 2, 25: 1 }, pBass: { 34: 2, 33: 1 }, pMel: { 29: 2, 53: 1 }, tempo: 120 },
  hardrock: { era: 'Popular', seventh: 0.04, grammar: { rock: 4 }, scale: { minorPentatonic: 1.5, blues: 1, minor: 1, mixolydian: 1 }, power: 0.85, comp: { power: 4 }, bass: { follow: 2, eighths: 2 }, melody: { riff: 3 }, blue: 0.5, ornament: 0.3, orn: { grace: 3 }, dissonance: 0.3, pComp: { 30: 2, 29: 1 }, pBass: { 34: 2 }, pMel: { 30: 2, 29: 1 }, key: { E: 2, A: 2, D: 1, G: 1 }, tempo: 130 },
  punk: { era: 'Popular', seventh: 0.04, grammar: { punk: 3 }, power: 1, comp: { power: 2, tremolo: 0.5 }, bass: { eighths: 3 }, melody: { riff: 1, lyric: 1 }, legato: 0.5, bassLegato: 0.6, pComp: { 30: 2 }, pBass: { 34: 2 }, pMel: { 30: 1, 53: 1 }, tempo: 180 },
  metal: { era: 'Popular', seventh: 0.04, grammar: { metal: 4 }, scale: { phrygian: 1.5, minor: 2, harmonicMinor: 0.7, phrygianDominant: 0.5 }, power: 1, comp: { chug: 3, power: 1, tremolo: 0.5 }, bass: { chug: 3 }, melody: { riff: 1, lyric: 1 }, ornament: 0.2, register: 0.7, dissonance: 0.4, bassLegato: 0.6, pComp: { 30: 3 }, pBass: { 34: 2 }, pMel: { 30: 2 }, key: { E: 3, D: 2, C: 1, B: 1 }, tempo: 170 },
  thrash: { era: 'Popular', seventh: 0.04, grammar: { metal: 4 }, scale: { phrygian: 1.5, minor: 1.5, locrian: 0.3 }, power: 1, chromatic: 0.35, comp: { chug: 4, tremolo: 1 }, bass: { chug: 3 }, melody: { riff: 2 }, pComp: { 30: 3 }, pBass: { 34: 2 }, pMel: { 30: 2 }, key: { E: 3 }, tempo: 200 },
  death: { era: 'Popular', seventh: 0.04, grammar: { metal: 3 }, scale: { phrygian: 2, locrian: 0.5, minor: 1 }, power: 1, chromatic: 0.5, dissonance: 0.7, comp: { tremolo: 2, chug: 2 }, bass: { chug: 3 }, melody: { riff: 1, lyric: 1 }, pComp: { 30: 3 }, pBass: { 34: 2 }, pMel: { 30: 2 }, key: { D: 1, C: 1, B: 1 }, tempo: 210 },
  blackmetal: { era: 'Popular', seventh: 0.04, grammar: { metal: 2, cinematic: 1 }, scale: { minor: 2, harmonicMinor: 1 }, power: 0.7, comp: { tremolo: 4 }, bass: { follow: 1, chug: 1 }, melody: { lyric: 1 }, hr: 0.5, spread: 0.5, pComp: { 30: 3 }, pBass: { 34: 2 }, pMel: { 30: 1, 48: 1 }, tempo: 220 },
  doom: { era: 'Popular', seventh: 0.04, grammar: { doom: 4 }, hr: 1, scale: { minor: 1, phrygian: 1, locrian: 0.3 }, power: 1, comp: { power: 3 }, bass: { pedal: 2, follow: 1 }, melody: { lyric: 2, riff: 1 }, melDensity: 0.25, legato: 1, register: 0.4, bassLegato: 1, pComp: { 30: 3 }, pBass: { 34: 2 }, pMel: { 30: 2 }, key: { C: 1, B: 1, A: 1, D: 1 }, tempo: 60 },
  djent: { era: 'Popular', seventh: 0.04, grammar: { djent: 3 }, comp: { chug: 4 }, bass: { chug: 3 }, scale: { phrygian: 1, minor: 1, lydian: 0.5 }, ext: 0.5, quartal: 0.5, power: 0.7, melody: { lyric: 1, minimal: 1 }, pComp: { 30: 3 }, pBass: { 34: 2 }, pMel: { 30: 1, 89: 1 }, key: { B: 2, 'F#': 1, D: 1 }, tempo: 120 },
  prog: { era: 'Popular', grammar: { modal: 1, rock: 1, cinematic: 1 }, scale: { dorian: 1, lydian: 1, minor: 1 }, chromatic: 0.35, modulate: 0.4, ext: 0.3, comp: { arpeggio: 1, power: 1, pad: 1 }, melody: { lyric: 1, riff: 1 }, pComp: { 29: 1, 16: 1 }, pBass: { 34: 1 }, pMel: { 81: 1, 29: 1 } },
  postrock: { era: 'Popular', grammar: { minimalist: 1, pop: 1, cinematic: 1 }, comp: { tremolo: 1, arpeggio: 2, pad: 1 }, hr: 0.5, spread: 0.9, ext: 0.4, melody: { lyric: 1, minimal: 1 }, pComp: { 27: 2, 29: 1 }, pBass: { 34: 1 }, pMel: { 27: 1 }, tempo: 110 },
  country: { era: 'Popular', grammar: { country: 3 }, scale: { major: 3, majorPentatonic: 1 }, bass: { rootfifth: 3 }, comp: { strum: 3 }, melody: { lyric: 2 }, ornament: 0.2, pComp: { 25: 3 }, pBass: { 32: 2 }, pMel: { 110: 1, 105: 0.5, 25: 1 }, tempo: 110 },
  folk: { era: 'Popular', grammar: { folk: 3 }, scale: { major: 1, mixolydian: 1, dorian: 1 }, bass: { rootfifth: 1, follow: 1 }, comp: { strum: 3, arpeggio: 1 }, melody: { lyric: 2 }, pComp: { 25: 3 }, pBass: { 32: 1 }, pMel: { 73: 1, 53: 1 }, tempo: 100 },
  reggae: { era: 'Popular', grammar: { reggae: 3 }, comp: { skank: 4 }, bass: { follow: 1 }, melody: { lyric: 1 }, bassDensity: 0.6, pComp: { 27: 2, 16: 1 }, pBass: { 33: 2 }, pMel: { 0: 1 }, tempo: 75 },
  disco: { era: 'Popular', grammar: { pop: 1, funk: 1 }, bass: { octave: 4 }, comp: { strum: 2, stab: 1 }, melody: { lyric: 1, riff: 1 }, pBass: { 33: 2 }, pComp: { 48: 1, 27: 1 }, pMel: { 48: 1 }, tempo: 118 },
  edm: { era: 'Popular', grammar: { edm: 3 }, scale: { minor: 2, major: 0.5 }, comp: { pad: 1, stab: 1.5, arpeggio: 1 }, bass: { sub: 1, octave: 1, follow: 1 }, melody: { riff: 1, arp: 1, lyric: 1 }, repeat: 0.85, pComp: { 81: 1, 89: 1 }, pBass: { 38: 2 }, pMel: { 81: 2 }, tempo: 124 },
  trance: { era: 'Popular', grammar: { edm: 3 }, scale: { minor: 2 }, comp: { arpeggio: 3, pad: 1 }, bass: { octave: 2, eighths: 1 }, melody: { lyric: 1, arp: 1 }, pComp: { 81: 2 }, pBass: { 38: 2 }, pMel: { 81: 2 }, tempo: 138 },
  synthwave: { era: 'Popular', grammar: { synthwave: 3 }, scale: { minor: 2 }, comp: { pad: 2, arpeggio: 1 }, bass: { eighths: 3 }, melody: { lyric: 2 }, pBass: { 38: 3 }, pComp: { 90: 2 }, pMel: { 81: 2 }, tempo: 100 },
  hiphop: { era: 'Popular', grammar: { lofi: 1, minimalist: 1, edm: 1 }, hr: 1, comp: { pad: 1, stab: 1 }, bass: { sub: 3 }, melody: { riff: 1, minimal: 1 }, repeat: 0.9, pComp: { 4: 2, 0: 1 }, pBass: { 38: 2 }, pMel: { 4: 1, 11: 1 }, tempo: 90 },

  // World
  flamenco: { era: 'World', grammar: { andalusian: 4 }, scale: { phrygianDominant: 2, phrygian: 1 }, comp: { strum: 3 }, bass: { follow: 1 }, melody: { ornate: 2 }, ornament: 0.5, orn: { turn: 2, mordent: 1, grace: 1 }, pComp: { 24: 3 }, pBass: { 32: 1 }, pMel: { 24: 2 }, key: { E: 3, A: 1 }, tempo: 110 },
  klezmer: { era: 'World', grammar: { klezmer: 3 }, scale: { phrygianDominant: 3, ukrainianDorian: 1 }, ornament: 0.5, orn: { grace: 1, mordent: 2, turn: 1 }, comp: { skank: 1, block: 1 }, bass: { rootfifth: 3 }, melody: { ornate: 2 }, pMel: { 71: 3, 40: 1 }, pComp: { 21: 3 }, pBass: { 58: 2 }, key: { D: 2, A: 1 }, tempo: 120 },
  celtic: { era: 'World', grammar: { celtic: 3 }, scale: { dorian: 2, mixolydian: 2, major: 1 }, ornament: 0.55, orn: { grace: 2, turn: 2 }, melDensity: 0.8, step: 0.8, melody: { ornate: 2, lyric: 1 }, bass: { drone: 1, rootfifth: 1 }, comp: { strum: 1, drone: 1 }, pMel: { 110: 1, 73: 1, 109: 0.5 }, pComp: { 24: 1 }, pBass: { 42: 1 }, tempo: 120 },
  maqam: { era: 'World', grammar: { drone: 3 }, scale: { rast: 1, bayati: 2, phrygianDominant: 2, saba: 0.5, harmonicMinor: 1 }, comp: { drone: 2, none: 1 }, bass: { drone: 2 }, melody: { ornate: 3 }, ornament: 0.55, orn: { grace: 2, mordent: 1, turn: 1 }, step: 0.85, range: 0.45, tuning: { '24edo': 3 }, pMel: { 73: 1.5, 110: 1 }, pComp: { 24: 2 }, pBass: { 32: 1 }, key: { D: 2, C: 1, G: 1 }, drumless: 0.3, tempo: 90 },
  makam: { era: 'World', grammar: { drone: 3 }, scale: { huzam: 1, bayati: 1, phrygianDominant: 1, rast: 1 }, comp: { drone: 2 }, bass: { drone: 2 }, melody: { ornate: 3 }, ornament: 0.5, orn: { grace: 2, mordent: 1 }, step: 0.85, tuning: { '53edo': 3 }, pMel: { 73: 2 }, pComp: { 24: 2 }, drumless: 0.3, tempo: 90 },
  raga: { era: 'World', grammar: { drone: 5 }, scale: { doubleHarmonic: 1, lydian: 1, dorian: 1, phrygian: 1, todi: 0.5, marwa: 0.5 }, comp: { tanpura: 4 }, bass: { none: 3 }, melody: { ornate: 3 }, ornament: 0.5, orn: { grace: 2, turn: 1 }, step: 0.8, melSync: 0.3, tuning: { shruti: 2, just: 1 }, pMel: { 104: 2, 73: 1 }, pComp: { 104: 1 }, drumless: 0.3, tempo: 80 },
  gamelan: { era: 'World', grammar: { drone: 2, minimalist: 2 }, scale: { slendro: 2, pelog: 2 }, comp: { arpeggio: 3 }, bass: { pedal: 2 }, melody: { minimal: 2, lyric: 1 }, repeat: 0.9, tuning: { free: 3 }, pComp: { 11: 1, 12: 1 }, pMel: { 11: 2 }, pBass: { 12: 1 }, drumless: 0.3, tempo: 90 },
  japanese: { era: 'World', scale: { in: 2, hirajoshi: 2, yo: 1, insen: 1 }, grammar: { drone: 2, modal: 1 }, melody: { lyric: 2, ornate: 1 }, comp: { arpeggio: 2 }, ornament: 0.3, pMel: { 77: 2 }, pComp: { 107: 3 }, pBass: { 107: 1 }, drumless: 0.4, tempo: 80 },
  chinese: { era: 'World', scale: { majorPentatonic: 4 }, grammar: { drone: 1, modal: 1, pop: 0.5 }, melody: { ornate: 2 }, ornament: 0.35, pMel: { 110: 1, 73: 1 }, pComp: { 107: 1, 15: 1 }, tempo: 90 },
  afrobeat: { era: 'World', grammar: { pop: 1, funk: 1 }, comp: { arpeggio: 1, stab: 1, strum: 1 }, bass: { follow: 2, octave: 1 }, melody: { riff: 2 }, repeat: 0.85, scale: { majorPentatonic: 1, mixolydian: 1, dorian: 1 }, pComp: { 27: 2, 108: 1 }, pMel: { 61: 1 }, tempo: 110 },
  latin: { era: 'World', grammar: { latin: 3 }, comp: { comp: 1, arpeggio: 1 }, bass: { follow: 1, rootfifth: 1 }, melody: { lyric: 1, riff: 1 }, melSync: 0.55, pComp: { 0: 2 }, pBass: { 32: 2 }, pMel: { 56: 2 }, tempo: 180 },
  tango: { era: 'World', grammar: { functional: 2, romantic: 1 }, scale: { harmonicMinor: 2, minor: 1 }, comp: { stab: 3 }, bass: { rootfifth: 2 }, melody: { lyric: 2 }, pComp: { 21: 2 }, pMel: { 40: 2 }, pBass: { 32: 1 }, tempo: 115 },

  // Mood & colour
  dark: { era: 'Mood', scale: { minor: 1.5, phrygian: 1, harmonicMinor: 0.7, locrian: 0.3 }, register: 0.4, chromatic: 0.25 },
  bright: { era: 'Mood', scale: { major: 2, lydian: 1, mixolydian: 0.5 }, register: 0.6 },
  sad: { era: 'Mood', scale: { minor: 2, dorian: 1 }, melDensity: 0.35, step: 0.8 },
  mysterious: { era: 'Mood', scale: { wholeTone: 1, locrian: 0.5, octatonic: 1, harmonicMinor: 1 }, chromatic: 0.5, dissonance: 0.5 },
  tense: { era: 'Mood', dissonance: 0.8, chromatic: 0.6, ext: 0.5 },
  dreamy: { era: 'Mood', ext: 0.7, parallel: 0.5, scale: { lydian: 2 }, comp: { arpeggio: 1, pad: 1 }, legato: 0.95 },
  epic: { era: 'Mood', grammar: { cinematic: 2 }, voices: 0.9, spread: 0.9 },
  exotic: { era: 'Mood', scale: { phrygianDominant: 1, doubleHarmonic: 1, hungarianMinor: 1 } },

  // Harmony features (outweigh styles)
  powerchords: { era: 'Harmony', _w: FEATURE, power: 1 },
  sevenths: { era: 'Harmony', _w: FEATURE, seventh: 1 },
  extended: { era: 'Harmony', _w: FEATURE, ext: 0.85, seventh: 0.9 },
  chromatic: { era: 'Harmony', _w: FEATURE, chromatic: 0.85, chroma: 0.4 },
  diatonic: { era: 'Harmony', _w: FEATURE, chromatic: 0, chroma: 0 },
  pedalpoint: { era: 'Harmony', _w: FEATURE, pedal: 0.9 },
  drone: { era: 'Harmony', _w: FEATURE, pedal: 1, bass: { drone: 6 } },
  modulating: { era: 'Harmony', _w: FEATURE, modulate: 0.9 },
  fastchanges: { era: 'Harmony', _w: FEATURE, hr: -1.5 },
  slowchanges: { era: 'Harmony', _w: FEATURE, hr: 1.5 },
  vamp: { era: 'Harmony', _w: FEATURE, hr: 2, grammar: { modal: 3 } },
  openvoicings: { era: 'Harmony', _w: FEATURE, spread: 0.95 },
  closevoicings: { era: 'Harmony', _w: FEATURE, spread: 0.05 },
  quartal: { era: 'Harmony', _w: FEATURE, quartal: 1 },
  parallel: { era: 'Harmony', _w: FEATURE, parallel: 1 },
  anticipations: { era: 'Harmony', _w: FEATURE, push: 0.85 },
  bluenotes: { era: 'Harmony', _w: FEATURE, blue: 0.95 },
  twelvebar: { era: 'Harmony', _w: FEATURE, grammar: { blues12: 8 }, seventh: 1 },
  andalusian: { era: 'Harmony', _w: FEATURE, grammar: { andalusian: 8 } },
  pachelbel: { era: 'Harmony', _w: FEATURE, grammar: { pachelbel: 8 } },
  lament: { era: 'Harmony', _w: FEATURE, grammar: { lament: 8 } },
  iivi: { era: 'Harmony', _w: FEATURE, grammar: { jazz: 8 }, seventh: 1 },

  // Voices
  walkingbass: { era: 'Voices', _w: FEATURE, bass: { walking: 8 } },
  pedalbass: { era: 'Voices', _w: FEATURE, bass: { pedal: 8 } },
  octavebass: { era: 'Voices', _w: FEATURE, bass: { octave: 8 } },
  rootfifth: { era: 'Voices', _w: FEATURE, bass: { rootfifth: 8 } },
  eighthbass: { era: 'Voices', _w: FEATURE, bass: { eighths: 8 } },
  subbass: { era: 'Voices', _w: FEATURE, bass: { sub: 8 } },
  continuo: { era: 'Voices', _w: FEATURE, bass: { continuo: 8 } },
  nobass: { era: 'Voices', _w: 4, bass: { none: 20 } },
  arpeggios: { era: 'Voices', _w: FEATURE, comp: { arpeggio: 8 } },
  pads: { era: 'Voices', _w: FEATURE, comp: { pad: 8 } },
  strummed: { era: 'Voices', _w: FEATURE, comp: { strum: 8 } },
  stabs: { era: 'Voices', _w: FEATURE, comp: { stab: 8 } },
  tremolo: { era: 'Voices', _w: FEATURE, comp: { tremolo: 8 } },
  chugs: { era: 'Voices', _w: FEATURE, comp: { chug: 8 }, bass: { chug: 4 } },
  alberti: { era: 'Voices', _w: FEATURE, comp: { alberti: 8 } },
  blockchords: { era: 'Voices', _w: FEATURE, comp: { block: 8 } },
  skank: { era: 'Voices', _w: FEATURE, comp: { skank: 8 } },
  comping: { era: 'Voices', _w: FEATURE, comp: { comp: 8 } },
  nochords: { era: 'Voices', _w: 4, comp: { none: 20 } },
  unaccompanied: { era: 'Voices', _w: 4, comp: { none: 20 }, bass: { none: 20 } },
  chant: { era: 'Voices', _w: FEATURE, melody: { chant: 8 }, step: 0.9, recite: 0.5 },
  lyrical: { era: 'Voices', _w: FEATURE, melody: { lyric: 8 }, step: 0.8 },
  riffs: { era: 'Voices', _w: FEATURE, melody: { riff: 8 }, repeat: 0.8 },
  sequences: { era: 'Voices', _w: FEATURE, melody: { sequence: 8 } },
  ornamented: { era: 'Voices', _w: FEATURE, ornament: 0.8 },
  catchy: { era: 'Voices', _w: FEATURE, repeat: 0.9, step: 0.75 },
  stepwise: { era: 'Voices', _w: FEATURE, step: 0.92 },
  angular: { era: 'Voices', _w: FEATURE, step: 0.3, range: 0.9 },
  busymelody: { era: 'Voices', _w: FEATURE, melDensity: 0.88 },
  sparsemelody: { era: 'Voices', _w: FEATURE, melDensity: 0.18 },
  highmelody: { era: 'Voices', _w: FEATURE, register: 0.85 },
  lowmelody: { era: 'Voices', _w: FEATURE, register: 0.2 },
  nomelody: { era: 'Voices', _w: 4, melody: { none: 20 } },

  // Tuning (only applied when microtones are on; "microtonal" asks for them)
  microtonal: { era: 'Tuning', _w: FEATURE, micro: 1 },
  equal: { era: 'Tuning', _w: FEATURE, micro: 0, tuning: { '12tet': 20 } },
  justintonation: { era: 'Tuning', _w: FEATURE, micro: 1, tuning: { just: 20 } },
  quartertones: { era: 'Tuning', _w: FEATURE, micro: 1, tuning: { '24edo': 20 } },
  meantone: { era: 'Tuning', _w: FEATURE, micro: 1, tuning: { meantone: 20 } },
  welltempered: { era: 'Tuning', _w: FEATURE, micro: 1, tuning: { werckmeister: 20 } },
  pythagorean: { era: 'Tuning', _w: FEATURE, micro: 1, tuning: { pythagorean: 20 } },
  edo19: { era: 'Tuning', _w: FEATURE, micro: 1, tuning: { '19edo': 20 } },
  edo22: { era: 'Tuning', _w: FEATURE, micro: 1, tuning: { '22edo': 20 } },
  edo31: { era: 'Tuning', _w: FEATURE, micro: 1, tuning: { '31edo': 20 } },
  edo53: { era: 'Tuning', _w: FEATURE, micro: 1, tuning: { '53edo': 20 } },
};

// Every scale is also a descriptor ("dorian", "harmonic minor", "maqam bayati").
for (const id of Object.keys(SCALES)) H_STYLES[`scale:${id}`] = { _w: SCALE_W, scale: { [id]: 20 } };

H_STYLES.waltz = { era: 'Baroque & classical', grammar: { functional: 2, romantic: 1 }, bass: { rootfifth: 4 }, comp: { block: 3 }, melody: { lyric: 3 }, sus: 0, seventh: 0.25, melSync: 0.05, pComp: { 0: 2 }, pBass: { 0: 1 }, pMel: { 40: 1, 73: 1 }, tempo: 150 };

// Time signatures each style suggests when the meter is on auto (weights; drawn per seed).
const H_METERS = {
  gregorian: { '4/4': 2 }, organum: { '4/4': 1, '6/8': 1 }, medieval: { '6/8': 2, '3/4': 1 }, renaissance: { '4/4': 1, '2/2': 1, '3/4': 1 }, chorale: { '4/4': 2 },
  baroque: { '4/4': 2, '3/4': 1.5, '12/8': 0.5 }, passacaglia: { '3/4': 4 }, classical: { '4/4': 2, '3/4': 1.5, '6/8': 0.5 }, romantic: { '3/4': 1.5, '4/4': 1.5, '6/8': 1, '12/8': 0.5 },
  waltz: { '3/4': 10 }, cinematic: { '4/4': 2, '6/8': 0.5 }, impressionist: { '4/4': 1, '3/4': 1, '6/8': 0.5 }, minimalist: { '4/4': 2, '7/8': 0.5, '12/8': 0.5 },
  serial: { '4/4': 1, '5/4': 1, '3/4': 1 }, ambient: { '4/4': 2 }, blues: { '12/8': 2, '4/4': 2 }, jazz: { '4/4': 3, '3/4': 0.5 }, bebop: { '4/4': 4 }, modaljazz: { '4/4': 3 },
  bossa: { '4/4': 2, '2/2': 1 }, gospel: { '4/4': 2, '12/8': 2, '6/8': 1 }, soul: { '4/4': 3, '12/8': 0.5 }, lofi: { '4/4': 4 }, funk: { '4/4': 4 }, pop: { '4/4': 4 },
  rock: { '4/4': 4, '12/8': 0.3 }, hardrock: { '4/4': 4, '12/8': 0.3 }, punk: { '4/4': 4 }, metal: { '4/4': 3 }, thrash: { '4/4': 3 }, death: { '4/4': 3 }, blackmetal: { '4/4': 2, '3/4': 1, '6/8': 1 },
  doom: { '4/4': 2, '3/4': 1, '6/8': 1 }, djent: { '4/4': 2, '7/8': 1 }, prog: { '7/8': 1.5, '5/4': 1, '4/4': 1, '13/8': 0.5 }, postrock: { '4/4': 2, '6/8': 1, '5/4': 0.5 },
  country: { '4/4': 3, '3/4': 1 }, folk: { '4/4': 2, '3/4': 1, '6/8': 1 }, reggae: { '4/4': 4 }, disco: { '4/4': 5 }, edm: { '4/4': 5 }, trance: { '4/4': 5 }, synthwave: { '4/4': 5 }, hiphop: { '4/4': 4 },
  flamenco: { '12/8 (3+3+2+2+2)': 3, '3/4': 1, '4/4': 0.5 }, klezmer: { '4/4': 2, '2/4': 1 }, celtic: { '6/8': 2, '4/4': 1, '9/8': 1 },
  maqam: { '10/8 (3+2+2+3)': 1, '4/4': 1, '8/8 (3+3+2)': 1 }, makam: { '9/8 (2+2+2+3)': 2, '10/8 (3+2+2+3)': 1, '7/8 (3+2+2)': 1 },
  raga: { '7/8 (3+2+2)': 1, '4/4': 1, '10/8 (2+3+2+3)': 1 }, gamelan: { '4/4': 3 }, japanese: { '4/4': 1, '3/4': 1 }, chinese: { '4/4': 2, '2/4': 1 },
  afrobeat: { '4/4': 2, '12/8': 2 }, latin: { '4/4': 2, '2/2': 1, '6/8': 1 }, tango: { '2/4': 2, '4/4': 1 },
};
for (const [name, m] of Object.entries(H_METERS)) H_STYLES[name].meter = m;

export const H_DISPLAY = {
  hardrock: 'hard rock', blackmetal: 'black metal', death: 'death metal', modaljazz: 'modal jazz', postrock: 'post-rock',
  powerchords: 'power chords', pedalpoint: 'pedal point', fastchanges: 'fast changes', slowchanges: 'slow changes',
  openvoicings: 'open voicings', closevoicings: 'close voicings', bluenotes: 'blue notes', twelvebar: '12-bar blues', iivi: 'ii-V-I',
  walkingbass: 'walking bass', pedalbass: 'pedal bass', octavebass: 'octave bass', rootfifth: 'root-fifth bass', eighthbass: 'eighth-note bass',
  subbass: 'sub bass', nobass: 'no bass', blockchords: 'block chords', nochords: 'no chords', busymelody: 'busy melody',
  sparsemelody: 'sparse melody', highmelody: 'high melody', lowmelody: 'low melody', nomelody: 'no melody', equal: 'equal temperament',
  justintonation: 'just intonation', quartertones: 'quarter tones', welltempered: 'well-tempered', edo19: '19-EDO', edo22: '22-EDO',
  edo31: '31-EDO', edo53: '53-EDO', gregorian: 'gregorian chant', edm: 'EDM', lofi: 'lo-fi', hiphop: 'hip-hop',
};
for (const [id, s] of Object.entries(SCALES)) H_DISPLAY[`scale:${id}`] = s.name.replace(/ \(.*\)$/, '').toLowerCase();
export const hDisplayName = (name) => H_DISPLAY[name] || name;

export const H_GROUPS = (() => {
  const g = {};
  for (const [name, d] of Object.entries(H_STYLES)) if (d.era) (g[d.era] ||= []).push(name);
  return Object.entries(g);
})();

const P = {
  chant: 'gregorian', 'gregorian chant': 'gregorian', plainchant: 'gregorian', plainsong: 'gregorian', 'plain chant': 'gregorian',
  sacred: 'chorale', hymn: 'chorale', hymns: 'chorale', choral: 'chorale', choir: 'chorale', church: 'chorale', 'parallel organum': 'organum',
  'middle ages': 'medieval', mediaeval: 'medieval', troubadour: 'medieval', 'ars nova': 'medieval', estampie: 'medieval',
  madrigal: 'renaissance', palestrina: 'renaissance', polyphony: 'renaissance', polyphonic: 'renaissance', lute: 'renaissance',
  bach: 'baroque', vivaldi: 'baroque', handel: 'baroque', harpsichord: 'baroque', fugue: 'baroque', fugal: 'baroque', counterpoint: 'baroque', contrapuntal: 'baroque',
  chaconne: 'passacaglia', 'ground bass': 'passacaglia', mozart: 'classical', haydn: 'classical', sonata: 'classical', 'classical period': 'classical',
  beethoven: ['classical', 'romantic'], chopin: 'romantic', 'late romantic': ['romantic', 'chromatic'], wagner: ['romantic', 'chromatic'], nocturne: 'romantic', orchestral: 'cinematic',
  film: 'cinematic', 'film score': 'cinematic', soundtrack: 'cinematic', score: 'cinematic', 'movie score': 'cinematic', trailer: ['cinematic', 'epic'],
  debussy: 'impressionist', ravel: 'impressionist', impressionism: 'impressionist', impressionistic: 'impressionist', minimalism: 'minimalist', minimal: 'minimalist',
  glass: 'minimalist', reich: 'minimalist', 'twelve tone': 'serial', '12 tone': 'serial', dodecaphonic: 'serial', atonal: 'serial', schoenberg: 'serial', serialism: 'serial',
  ambience: 'ambient', drone: 'drone', droning: 'drone', 'new age': 'ambient',
  bluesy: 'blues', 'delta blues': 'blues', 'chicago blues': 'blues', jazzy: 'jazz', 'big band': 'jazz', 'cool jazz': 'modaljazz', 'modal jazz': 'modaljazz',
  waltzes: 'waltz', valse: 'waltz', jig: 'celtic', jigs: 'celtic',
  'bossa nova': 'bossa', samba: 'bossa', 'r&b': 'soul', rnb: 'soul', motown: 'soul', 'neo soul': 'lofi', 'lo fi': 'lofi', chillhop: 'lofi', funky: 'funk',
  'pop rock': ['pop', 'rock'], 'classic rock': 'rock', 'indie rock': 'rock', indie: 'rock', 'alt rock': 'rock', 'alternative': 'rock', 'hard rock': 'hardrock',
  'heavy rock': 'hardrock', 'blues rock': ['hardrock', 'blues'], grunge: ['hardrock', 'dark'], 'stoner rock': ['doom', 'hardrock'], 'pop punk': ['punk', 'pop'],
  hardcore: 'punk', 'heavy metal': 'metal', metalcore: ['metal', 'chugs'], 'nu metal': ['metal', 'chugs'], 'groove metal': 'metal', 'power metal': ['metal', 'epic'],
  'speed metal': 'thrash', 'death metal': 'death', 'tech death': ['death', 'chromatic'], 'black metal': 'blackmetal', 'doom metal': 'doom', sludge: 'doom',
  stoner: 'doom', 'funeral doom': ['doom', 'sad'], 'post metal': ['doom', 'postrock'], mathcore: ['djent', 'chromatic'], 'math rock': ['prog', 'angular'],
  progressive: 'prog', 'prog rock': 'prog', 'prog metal': ['prog', 'metal'], 'post rock': 'postrock', shoegaze: ['postrock', 'dreamy'],
  americana: 'country', bluegrass: ['country', 'folk'], 'singer songwriter': 'folk', acoustic: 'folk', dub: 'reggae', ska: ['reggae', 'skank'],
  house: 'edm', techno: ['edm', 'minimalist'], dance: 'edm', electronic: 'edm', electronica: 'edm', club: 'edm', dubstep: ['edm', 'dark'], 'drum and bass': 'edm',
  retrowave: 'synthwave', outrun: 'synthwave', vaporwave: ['synthwave', 'lofi'], 'hip hop': 'hiphop', rap: 'hiphop', trap: ['hiphop', 'dark'], 'boom bap': 'hiphop',
  spanish: 'flamenco', gypsy: ['flamenco', 'klezmer'], jewish: 'klezmer', irish: 'celtic', scottish: 'celtic', jig: 'celtic', reel: 'celtic',
  arabic: 'maqam', arab: 'maqam', 'middle eastern': 'maqam', egyptian: 'maqam', persian: 'maqam', turkish: 'makam', ottoman: 'makam',
  indian: 'raga', hindustani: 'raga', carnatic: 'raga', sitar: 'raga', balinese: 'gamelan', javanese: 'gamelan', indonesian: 'gamelan',
  japan: 'japanese', koto: 'japanese', chinese: 'chinese', china: 'chinese', african: 'afrobeat', highlife: 'afrobeat', salsa: 'latin', cuban: 'latin', mambo: 'latin',
  argentine: 'tango', 'film noir': ['jazz', 'dark'],
  grind: 'death', grindcore: 'death', ritual: ['minimalist', 'dark'], hypnotic: 'minimalist', chaotic: 'tense', crystalline: 'minimalist',
  darker: 'dark', gloomy: 'dark', ominous: 'dark', evil: 'dark', sinister: 'dark', happy: 'bright', uplifting: 'bright', joyful: 'bright', cheerful: 'bright', major: 'scale:major',
  melancholy: 'sad', melancholic: 'sad', mournful: 'sad', somber: 'sad', sombre: 'sad', depressive: 'sad', depressing: 'sad', dreary: 'sad', bleak: 'sad',
  eerie: 'mysterious', spooky: 'mysterious', creepy: 'mysterious', haunting: 'mysterious', mystical: 'mysterious', suspense: 'tense', suspenseful: 'tense', dissonant: 'tense',
  dreamlike: 'dreamy', ethereal: 'dreamy', lush: 'extended', heroic: 'epic', majestic: 'epic', grand: 'epic', oriental: 'exotic',
  'power chord': 'powerchords', 'power chords': 'powerchords', 'seventh chords': 'sevenths', '7th chords': 'sevenths', '7ths': 'sevenths', sevenths: 'sevenths',
  'extended chords': 'extended', 'extended harmony': 'extended', jazzier: 'extended', ninths: 'extended', '9ths': 'extended', 'jazz chords': 'extended',
  chromaticism: 'chromatic', 'pedal point': 'pedalpoint', 'pedal tone': 'pedalpoint', modulation: 'modulating', modulations: 'modulating', 'key changes': 'modulating',
  'fast harmonic rhythm': 'fastchanges', 'fast chord changes': 'fastchanges', 'slow harmonic rhythm': 'slowchanges', 'slow chord changes': 'slowchanges',
  'one chord': 'vamp', 'static harmony': 'vamp', vamping: 'vamp', 'open voicings': 'openvoicings', 'open voicing': 'openvoicings', 'wide voicings': 'openvoicings',
  'close voicings': 'closevoicings', 'close harmony': 'closevoicings', 'quartal harmony': 'quartal', fourths: 'quartal', planing: 'parallel', 'parallel chords': 'parallel',
  pushes: 'anticipations', anticipation: 'anticipations', 'blue note': 'bluenotes', 'blue notes': 'bluenotes', '12 bar blues': 'twelvebar', 'twelve bar blues': 'twelvebar',
  '12 bar': 'twelvebar', 'twelve bar': 'twelvebar', 'andalusian cadence': 'andalusian', 'pachelbel canon': 'pachelbel', canon: 'pachelbel', 'lament bass': 'lament',
  'ii v i': 'iivi', 'ii v': 'iivi', '2 5 1': 'iivi',
  'walking bass': 'walkingbass', 'walking bassline': 'walkingbass', 'walking bass line': 'walkingbass', 'pedal bass': 'pedalbass', 'octave bass': 'octavebass',
  'octave bassline': 'octavebass', 'root fifth': 'rootfifth', 'oom pah': 'rootfifth', 'boom chick': 'rootfifth', 'eighth note bass': 'eighthbass', 'driving bass': 'eighthbass',
  'sub bass': 'subbass', '808': 'subbass', '808s': 'subbass', 'basso continuo': 'continuo', 'no bass': 'nobass', 'without bass': 'nobass', bassless: 'nobass',
  arpeggio: 'arpeggios', arpeggiated: 'arpeggios', arps: 'arpeggios', 'broken chords': 'arpeggios', pad: 'pads', 'synth pads': 'pads', 'sustained chords': 'pads',
  strumming: 'strummed', strum: 'strummed', 'acoustic guitar': 'strummed', stab: 'stabs', 'chord stabs': 'stabs', 'horn stabs': 'stabs', 'tremolo picking': 'tremolo',
  'tremolo picked': 'tremolo', chug: 'chugs', chugging: 'chugs', 'palm muted': 'chugs', 'palm mutes': 'chugs', 'palm muting': 'chugs', 'alberti bass': 'alberti',
  'block chord': 'blockchords', homophonic: 'blockchords', 'offbeat chords': 'skank', 'off beat chords': 'skank', comp: 'comping', 'jazz comping': 'comping',
  'no chords': 'nochords', 'without chords': 'nochords', 'a cappella': 'unaccompanied', acapella: 'unaccompanied', monophonic: 'unaccompanied', solo: 'unaccompanied',
  chanting: 'chant', lyric: 'lyrical', singable: 'lyrical', vocal: 'lyrical', song: 'lyrical', melodic: 'lyrical', riff: 'riffs', riffing: 'riffs', 'guitar riffs': 'riffs',
  sequence: 'sequences', fortspinnung: 'sequences', ornaments: 'ornamented', ornamentation: 'ornamented', trills: 'ornamented', trill: 'ornamented', melismatic: 'ornamented',
  hooky: 'catchy', hook: 'catchy', hooks: 'catchy', repetitive: 'catchy', smooth: 'stepwise', conjunct: 'stepwise', leaps: 'angular', leaping: 'angular', jagged: 'angular', disjunct: 'angular',
  'busy melody': 'busymelody', 'fast melody': 'busymelody', shredding: 'busymelody', shred: 'busymelody', 'sparse melody': 'sparsemelody', 'simple melody': 'sparsemelody',
  'high melody': 'highmelody', soaring: 'highmelody', 'low melody': 'lowmelody', 'no melody': 'nomelody', 'without melody': 'nomelody', 'no lead': 'nomelody',
  microtones: 'microtonal', microtone: 'microtonal', xenharmonic: 'microtonal', 'equal temperament': 'equal', '12 tet': 'equal', '12 edo': 'equal', 'twelve tone equal': 'equal',
  'just intonation': 'justintonation', just: 'justintonation', 'pure intervals': 'justintonation', 'quarter tones': 'quartertones', 'quarter tone': 'quartertones',
  '24 edo': 'quartertones', '24 tet': 'quartertones', 'mean tone': 'meantone', 'well tempered': 'welltempered', werckmeister: 'welltempered', 'well temperament': 'welltempered',
  pythagorean: 'pythagorean', '19 edo': 'edo19', '19 tet': 'edo19', '22 edo': 'edo22', '22 tet': 'edo22', '31 edo': 'edo31', '31 tet': 'edo31', '53 edo': 'edo53', '53 tet': 'edo53',
  // Scales and modes
  ionian: 'scale:major', 'major scale': 'scale:major', 'major key': 'scale:major', minor: 'scale:minor', aeolian: 'scale:minor', 'natural minor': 'scale:minor', 'minor key': 'scale:minor',
  dorian: 'scale:dorian', phrygian: 'scale:phrygian', lydian: 'scale:lydian', mixolydian: 'scale:mixolydian', locrian: 'scale:locrian',
  'harmonic minor': 'scale:harmonicMinor', 'melodic minor': 'scale:melodicMinor', 'jazz minor': 'scale:melodicMinor', pentatonic: ['scale:majorPentatonic', 'scale:minorPentatonic'],
  'major pentatonic': 'scale:majorPentatonic', 'minor pentatonic': 'scale:minorPentatonic', 'blues scale': 'scale:blues', 'major blues': 'scale:majorBlues',
  'whole tone': 'scale:wholeTone', 'whole tone scale': 'scale:wholeTone', octatonic: 'scale:octatonic', 'diminished scale': 'scale:octatonic', 'chromatic scale': 'scale:chromatic',
  'phrygian dominant': 'scale:phrygianDominant', freygish: 'scale:phrygianDominant', hijaz: 'scale:phrygianDominant', 'spanish phrygian': 'scale:phrygianDominant',
  'double harmonic': 'scale:doubleHarmonic', byzantine: 'scale:doubleHarmonic', bhairav: 'scale:doubleHarmonic', 'hungarian minor': 'scale:hungarianMinor',
  'gypsy scale': 'scale:hungarianMinor', 'ukrainian dorian': 'scale:ukrainianDorian', misheberakh: 'scale:ukrainianDorian', 'lydian dominant': 'scale:lydianDominant',
  'acoustic scale': 'scale:lydianDominant', 'neapolitan minor': 'scale:neapolitanMinor', 'persian scale': 'scale:persian', todi: 'scale:todi', marwa: 'scale:marwa',
  yaman: 'scale:lydian', kafi: 'scale:dorian', bhairavi: 'scale:phrygian', khamaj: 'scale:mixolydian', nahawand: 'scale:harmonicMinor', kurd: 'scale:phrygian', ajam: 'scale:major',
  hirajoshi: 'scale:hirajoshi', 'in scale': 'scale:in', miyako: 'scale:in', 'yo scale': 'scale:yo', insen: 'scale:insen',
  rast: 'scale:rast', 'maqam rast': ['maqam', 'scale:rast'], bayati: 'scale:bayati', 'maqam bayati': ['maqam', 'scale:bayati'], saba: 'scale:saba', 'maqam saba': ['maqam', 'scale:saba'],
  'maqam sikah': ['maqam', 'scale:sikah'], 'maqam hijaz': ['maqam', 'scale:phrygianDominant'], 'makam huzam': ['makam', 'scale:huzam'],
  sikah: 'scale:sikah', segah: 'scale:sikah', huzam: 'scale:huzam', 'neutral thirds': 'scale:neutral', zalzalian: 'scale:neutral', slendro: 'scale:slendro', pelog: 'scale:pelog',
  'harmonic series': 'scale:harmonicSeries', overtone: 'scale:harmonicSeries', 'overtone scale': 'scale:harmonicSeries', 'quarter tone scale': 'scale:quarterTone',
};
for (const name of Object.keys(H_STYLES)) P[name] ??= name;
for (const [name, label] of Object.entries(H_DISPLAY)) {
  const key = label.toLowerCase().replace(/-/g, ' ');
  // Short labels like "in" or "yo" are ordinary words; those scales need "in scale" / "yo scale".
  if (key.length > 2) P[key] ??= name;
}

const H_STOP = new Set([...STOPWORDS, 'chords', 'chord', 'harmony', 'harmonies', 'melody', 'melodies', 'progression', 'progressions', 'changes', 'key', 'scale', 'mode',
  'lead', 'line', 'lines', 'voicing', 'voicings', 'notes', 'note', 'guitar', 'guitars', 'piano', 'keys', 'synth', 'bassline', 'in', 'era', 'period', 'century', 'age', 'old', 'school']);

export const H_VOCAB = { phrases: P, params: H_BASE, stop: H_STOP, dyn: {} };
export const isHarmonyName = (name) => name in H_STYLES;

// "in D minor", "key of F#", "A dorian", "Bb phrygian dominant", "in E"
const MODE_WORDS = 'major|minor|dorian|phrygian(?: dominant)?|lydian(?: dominant)?|mixolydian|aeolian|ionian|locrian|harmonic minor|melodic minor|blues|pentatonic|hijaz|bayati|rast|saba|sikah|freygish';
const KEY_RE = new RegExp(`(?:\\bkey of\\s+([A-Ga-g])(#|♯|b|♭)?)|(?:\\b([A-Ga-g])(#|♯|b|♭|-sharp|-flat| sharp| flat)?[ -](?=(?:${MODE_WORDS})\\b))|(?:\\bin ([A-G])(#|♯|b|♭)?(?![\\w']))`, 'g');

export function findKey(text) {
  const t = String(text || '');
  let m, found = null;
  KEY_RE.lastIndex = 0;
  while ((m = KEY_RE.exec(t))) {
    const letter = m[1] || m[3] || m[5];
    const acc = (m[2] || m[4] || m[6] || '').trim().replace(/^-/, '');
    const pc = parseKey(letter + (acc === 'sharp' ? '#' : acc === 'flat' ? 'b' : acc));
    if (pc != null) found = { pc, start: m.index, end: m.index + m[0].length };
  }
  return found;
}

// Free text -> harmony items + key + unknown words.
export function interpretHarmony(input, weightScale = 1) {
  const text = Array.isArray(input) ? input.join(', ') : String(input || '');
  const r = interpretWith(H_VOCAB, text, weightScale);
  const key = findKey(text);
  if (key) r.unknown = r.unknown.filter((u) => u.start < key.start || u.start >= key.end);
  r.key = key;
  return r;
}

export function blendHarmony(items, overrides = {}) {
  const out = { ...H_BASE, cats: Object.fromEntries(CATS.map((c) => [c, { ...BASE_CATS[c] }])) };
  const sums = {}, totals = {}, banned = Object.fromEntries(CATS.map((c) => [c, new Set()]));
  let tSum = 0, tW = 0;
  for (const it of items) {
    const d = H_STYLES[it.name];
    if (!d) continue;
    const w = Math.min(3, Math.max(0.1, it.weight));
    const pull = Math.min(2, w);
    const share = (d._w ?? ERA) * w;
    for (const [k, v] of Object.entries(d)) {
      if (k === '_w' || k === 'era') continue;
      if (CATS.includes(k)) {
        for (const [c, x] of Object.entries(v)) {
          if (it.negate) banned[k].add(c);
          else out.cats[k][c] = (out.cats[k][c] || 0) + x * w;
        }
        continue;
      }
      if (k === 'tempo') { if (!it.negate) { tSum += v * share; tW += share; } continue; }
      const b = H_BASE[k] ?? 0;
      const lo = k === 'hr' ? -2 : 0, hi = k === 'hr' ? 2 : 1;
      const val = Math.max(lo, Math.min(hi, it.negate ? b - (v - b) * pull : b + (v - b) * pull));
      sums[k] = (sums[k] || 0) + val * share;
      totals[k] = (totals[k] || 0) + share;
    }
  }
  for (const k of Object.keys(sums)) out[k] = sums[k] / totals[k];
  for (const c of CATS) for (const b of banned[c]) delete out.cats[c][b];
  // Explicit picks (style-specific weights) beat the generic base.
  for (const c of CATS) {
    const keys = Object.keys(out.cats[c]);
    const specific = keys.some((k) => out.cats[c][k] > (BASE_CATS[c][k] || 0) + 1e-9 && !(k in BASE_CATS[c]));
    if (specific) for (const k of Object.keys(BASE_CATS[c])) if (out.cats[c][k] === BASE_CATS[c][k]) out.cats[c][k] *= 0.15;
  }
  Object.assign(out, overrides);
  return { params: out, tempoHint: tW ? Math.round(tSum / tW / 5) * 5 : null };
}

export function argmax(map) {
  let best = null, bw = -Infinity;
  for (const [k, w] of Object.entries(map || {})) if (w > bw) { bw = w; best = k; }
  return best;
}

export function applyHarmonyRole(hp, role) {
  const p = { ...hp, cats: hp.cats };
  switch (role) {
    case 'variation': break;
    case 'contrast': p.chromatic = Math.min(1, p.chromatic + 0.15); p.register = Math.min(1, p.register + 0.1); break;
    case 'build': p.melDensity = Math.min(1, p.melDensity + 0.15); p.compDensity = Math.min(1, p.compDensity + 0.2); p.pedal = Math.max(p.pedal, 0.5); break;
    case 'breakdown': p.hr = Math.min(2, p.hr + 1); p.melDensity *= 0.5; p.compDensity *= 0.6; p.pedal = Math.max(p.pedal, 0.4); break;
    case 'fill': p.hr = Math.max(-2, p.hr - 1); break;
  }
  return p;
}

// ---------- per-voice specs (like lane specs: plain words override the style) ----------

const VOICE_WORDS = {
  bass: {
    follow: ['follow', 'follow kick', 'kick', 'with kick', 'locked'], chug: ['chug', 'chugs', 'palm muted'], walking: ['walking', 'walk'], continuo: ['continuo'],
    pedal: ['pedal', 'pedal tone'], drone: ['drone'], octave: ['octave', 'octaves', 'disco'], rootfifth: ['root fifth', 'oom pah', 'boom chick', 'two feel'],
    sub: ['sub', '808', 'long'], eighths: ['eighths', '8ths', 'driving', 'eighth notes'], none: ['none', 'off', 'silent', 'mute'],
  },
  comp: {
    pad: ['pad', 'pads', 'sustain', 'sustained'], block: ['block', 'blocks', 'hymn', 'chorale'], stab: ['stab', 'stabs', 'on snare', 'with snare'], power: ['power', 'power chords'],
    chug: ['chug', 'chugs', 'palm muted'], strum: ['strum', 'strummed', 'strumming', 'on hats'], arpeggio: ['arpeggio', 'arpeggios', 'arp', 'arps', 'broken'],
    alberti: ['alberti'], tremolo: ['tremolo'], comp: ['comp', 'comping', 'jazz'], skank: ['skank', 'offbeat', 'offbeats', 'reggae'], organum: ['organum', 'parallel fifths', 'parallel fourths'],
    drone: ['drone'], tanpura: ['tanpura'], none: ['none', 'off', 'silent', 'mute'],
  },
  melody: {
    lyric: ['lyric', 'lyrical', 'song', 'vocal', 'singable'], chant: ['chant'], sequence: ['sequence', 'sequences', 'baroque'], bebop: ['bebop', 'jazz'], riff: ['riff', 'riffs'],
    arp: ['arp', 'arpeggio', 'arpeggiated'], minimal: ['minimal', 'cell', 'ostinato'], ornate: ['ornate', 'ornamented', 'ornaments'], row: ['row', 'twelve tone', '12 tone', 'serial'],
    none: ['none', 'off', 'silent', 'mute'],
  },
};
const MOD_WORDS = {
  busy: { bassDensity: 0.85, compDensity: 0.85, melDensity: 0.88 }, sparse: { bassDensity: 0.15, compDensity: 0.2, melDensity: 0.2 },
  high: { reg: 0.85 }, low: { reg: 0.15 }, short: { legato: 0.4 }, staccato: { legato: 0.35 }, legato: { legato: 1 }, smooth: { legato: 1, step: 0.92 },
  stepwise: { step: 0.92 }, leaps: { step: 0.35 }, angular: { step: 0.3 }, ornaments: { ornament: 0.8 }, ornamented: { ornament: 0.8 }, trills: { ornament: 0.8 },
  open: { spread: 0.95 }, close: { spread: 0.05 }, quartal: { quartal: 1 }, rootless: { rootless: 1 }, catchy: { repeat: 0.9 }, repetitive: { repeat: 0.95 },
  'follow snare': { src: 'snare' }, 'follow kick': { src: 'kick' }, 'with kick': { src: 'kick' }, 'on snare': { src: 'snare' }, 'follow hats': { src: 'hats' },
};

export function parseVoiceSpec(voice, text) {
  const out = { raw: text || '', style: null, mods: {}, chart: null, understood: [], warnings: [] };
  let t = ` ${String(text || '').toLowerCase().replace(/[,;]+/g, ' ').replace(/\s+/g, ' ')} `;
  if (!t.trim() || t.trim() === 'auto') return out;
  if (voice === 'progression') {
    out.chart = String(text).trim().split(/[\s,|-]+/).filter(Boolean);
    return out;
  }
  const take = (w) => {
    const re = new RegExp(`\\s${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`);
    if (!re.test(t)) return false;
    t = t.replace(re, ' ');
    return true;
  };
  const styles = VOICE_WORDS[voice] || {};
  const all = Object.entries(styles).flatMap(([s, ws]) => ws.map((w) => [s, w])).sort((a, b) => b[1].length - a[1].length);
  for (const [s, w] of all) if (!out.style && take(w)) { out.style = s; out.understood.push(s); }
  for (const [w, m] of Object.entries(MOD_WORDS).sort((a, b) => b[0].length - a[0].length)) if (take(w)) { Object.assign(out.mods, m); out.understood.push(w); }
  const left = t.trim();
  if (left) out.warnings.push(`didn't recognize: ${left}`);
  return out;
}
