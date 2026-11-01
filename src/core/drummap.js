// Lanes and their articulations. Notes follow the GM layout that Superior Drummer 3's default map uses.

export const LANES = ['crash', 'cymbals', 'ride', 'hihat', 'toms', 'snare', 'kick'];

export const LANE_LABELS = {
  kick: 'Kick', snare: 'Snare', hihat: 'Hi-hat', ride: 'Ride',
  toms: 'Toms', crash: 'Crash', cymbals: 'Other cymbals',
};

export const DEFAULT_MAP = {
  kick: { kick: 36 },
  snare: { center: 38, ghost: 38, rim: 40, side: 37 },
  hihat: { closed: 42, open: 46, pedal: 44 },
  ride: { bow: 51, bell: 53 },
  toms: { t1: 48, t2: 47, t3: 45, f1: 43, f2: 41 },
  crash: { c1: 49, c2: 57 },
  cymbals: { china: 52, splash: 55 },
};

export const DEFAULT_ART = {
  kick: 'kick', snare: 'center', hihat: 'closed', ride: 'bow',
  toms: 't2', crash: 'c1', cymbals: 'china',
};

export const TOM_VOICES = ['t1', 't2', 't3', 'f1', 'f2'];

export const SYMBOLS = {
  kick: 'X', center: 'X', ghost: 'g', rim: 'R', side: 's',
  closed: 'x', open: 'o', pedal: 'p', bow: 'r', bell: 'b',
  t1: '1', t2: '2', t3: '3', f1: '4', f2: '5',
  c1: 'C', c2: 'c', china: 'H', splash: 'S',
};

export const BASE_VELOCITY = {
  kick: 112, snare: 112, hihat: 84, ride: 92, toms: 106, crash: 116, cymbals: 108,
};

export const HAND_LANES = ['snare', 'hihat', 'ride', 'toms', 'crash', 'cymbals'];
