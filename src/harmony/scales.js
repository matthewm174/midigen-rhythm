// Scales and modes. 12-tone scales are in semitones; microtonal ones in cents and carry a 12-tone fallback
// that is used whenever microtones are off.

const st = (...s) => s.map((x) => x * 100);

export const SCALES = {
  major: { name: 'Major (Ionian)', group: 'Diatonic', cents: st(0, 2, 4, 5, 7, 9, 11) },
  dorian: { name: 'Dorian', group: 'Diatonic', cents: st(0, 2, 3, 5, 7, 9, 10) },
  phrygian: { name: 'Phrygian', group: 'Diatonic', cents: st(0, 1, 3, 5, 7, 8, 10), tenor: 5 },
  lydian: { name: 'Lydian', group: 'Diatonic', cents: st(0, 2, 4, 6, 7, 9, 11) },
  mixolydian: { name: 'Mixolydian', group: 'Diatonic', cents: st(0, 2, 4, 5, 7, 9, 10) },
  minor: { name: 'Minor (Aeolian)', group: 'Diatonic', cents: st(0, 2, 3, 5, 7, 8, 10) },
  locrian: { name: 'Locrian', group: 'Diatonic', cents: st(0, 1, 3, 5, 6, 8, 10), tenor: 5 },
  harmonicMinor: { name: 'Harmonic minor', group: 'Minor', cents: st(0, 2, 3, 5, 7, 8, 11) },
  melodicMinor: { name: 'Melodic minor', group: 'Minor', cents: st(0, 2, 3, 5, 7, 9, 11) },
  majorPentatonic: { name: 'Major pentatonic', group: 'Pentatonic & blues', cents: st(0, 2, 4, 7, 9) },
  minorPentatonic: { name: 'Minor pentatonic', group: 'Pentatonic & blues', cents: st(0, 3, 5, 7, 10) },
  blues: { name: 'Blues', group: 'Pentatonic & blues', cents: st(0, 3, 5, 6, 7, 10) },
  majorBlues: { name: 'Major blues', group: 'Pentatonic & blues', cents: st(0, 2, 3, 4, 7, 9) },
  wholeTone: { name: 'Whole tone', group: 'Symmetric', cents: st(0, 2, 4, 6, 8, 10) },
  octatonic: { name: 'Octatonic (half-whole)', group: 'Symmetric', cents: st(0, 1, 3, 4, 6, 7, 9, 10) },
  chromatic: { name: 'Chromatic (12-tone)', group: 'Symmetric', cents: st(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11) },
  phrygianDominant: { name: 'Phrygian dominant (Hijaz, Freygish)', group: 'World (12-tone)', cents: st(0, 1, 4, 5, 7, 8, 10) },
  doubleHarmonic: { name: 'Double harmonic (Byzantine, Bhairav)', group: 'World (12-tone)', cents: st(0, 1, 4, 5, 7, 8, 11) },
  hungarianMinor: { name: 'Hungarian minor', group: 'World (12-tone)', cents: st(0, 2, 3, 6, 7, 8, 11) },
  ukrainianDorian: { name: 'Ukrainian dorian (Misheberakh)', group: 'World (12-tone)', cents: st(0, 2, 3, 6, 7, 9, 10) },
  lydianDominant: { name: 'Lydian dominant', group: 'World (12-tone)', cents: st(0, 2, 4, 6, 7, 9, 10) },
  neapolitanMinor: { name: 'Neapolitan minor', group: 'World (12-tone)', cents: st(0, 1, 3, 5, 7, 8, 11) },
  persian: { name: 'Persian', group: 'World (12-tone)', cents: st(0, 1, 4, 5, 6, 8, 11) },
  todi: { name: 'Todi (raga)', group: 'World (12-tone)', cents: st(0, 1, 3, 6, 7, 8, 11) },
  marwa: { name: 'Marwa (raga)', group: 'World (12-tone)', cents: st(0, 1, 4, 6, 7, 9, 11) },
  hirajoshi: { name: 'Hirajoshi', group: 'World (12-tone)', cents: st(0, 2, 3, 7, 8) },
  in: { name: 'In (Miyako-bushi)', group: 'World (12-tone)', cents: st(0, 1, 5, 7, 8) },
  yo: { name: 'Yo', group: 'World (12-tone)', cents: st(0, 2, 5, 7, 9) },
  insen: { name: 'Insen', group: 'World (12-tone)', cents: st(0, 1, 5, 7, 10) },
  // Microtonal (only with microtones on).
  rast: { name: 'Maqam Rast', group: 'Microtonal', micro: true, fallback: 'major', cents: [0, 200, 350, 500, 700, 900, 1050] },
  bayati: { name: 'Maqam Bayati', group: 'Microtonal', micro: true, fallback: 'phrygian', cents: [0, 150, 300, 500, 700, 800, 1000] },
  saba: { name: 'Maqam Saba', group: 'Microtonal', micro: true, fallback: 'phrygian', cents: [0, 150, 300, 400, 600, 800, 1000] },
  sikah: { name: 'Maqam Sikah', group: 'Microtonal', micro: true, fallback: 'phrygian', cents: [0, 150, 350, 500, 650, 850, 1050] },
  huzam: { name: 'Maqam Huzam', group: 'Microtonal', micro: true, fallback: 'phrygianDominant', cents: [0, 150, 350, 500, 700, 850, 1050] },
  neutral: { name: 'Neutral diatonic (Zalzalian)', group: 'Microtonal', micro: true, fallback: 'dorian', cents: [0, 200, 350, 500, 700, 850, 1050] },
  slendro: { name: 'Slendro', group: 'Microtonal', micro: true, fallback: 'majorPentatonic', cents: [0, 240, 480, 720, 960] },
  pelog: { name: 'Pelog', group: 'Microtonal', micro: true, fallback: 'in', cents: [0, 120, 270, 540, 670, 785, 950] },
  harmonicSeries: { name: 'Harmonic series 8-16', group: 'Microtonal', micro: true, fallback: 'lydianDominant', cents: [8, 9, 10, 11, 12, 13, 14, 15].map((h) => 1200 * Math.log2(h / 8)) },
  quarterTone: { name: 'Quarter-tone chromatic', group: 'Microtonal', micro: true, fallback: 'chromatic', cents: Array.from({ length: 24 }, (_, i) => i * 50) },
};
export const SCALE_IDS = Object.keys(SCALES);

// Mode family decides whether templates use their major or minor list.
export function isMinorish(cents) {
  const third = cents.find((c) => c > 250 && c < 450);
  return third === undefined ? true : third < 375;
}

// Reciting tone (tenor) degree for chant: the fifth, or the given index.
export function tenorDegree(id, cents) {
  if (SCALES[id]?.tenor != null) return SCALES[id].tenor;
  const i = cents.findIndex((c) => Math.abs(c - 700) < 40);
  return i >= 0 ? i : Math.floor(cents.length / 2);
}
