// A drummer has two hands and two feet. Remove what a human couldn't play.
import { HAND_LANES } from '../core/drummap.js';

const MIN_SEC = { snare: 0.045, hihat: 0.05, ride: 0.06, toms: 0.045, crash: 0.12, cymbals: 0.1 };

function priority(lane, h, timekeeper) {
  if (lane === 'crash') return 6;
  if (lane === 'snare') return h.art === 'ghost' ? 2.5 : 5;
  if (lane === 'toms') return 4.5;
  if (lane === 'cymbals') return 4;
  if (lane === 'ride') return (h.art === 'bell' ? 3.5 : 3) + (timekeeper === 'ride' ? 0.5 : 0);
  return 2 + (timekeeper === 'hihat' ? 0.5 : 0);
}

export function enforcePlayability(part, tatumSec, params, kept = [], typed = []) {
  const L = part.lanes;
  const len = part.len;
  let removed = 0;
  const bonus = (lane) => (kept.includes(lane) ? 10 : typed.includes(lane) ? 3 : 0);

  const minSec = { ...MIN_SEC, kick: params.doubleKick > 0.5 ? 0.05 : 0.1 };
  for (const [lane, sec] of Object.entries(minSec)) {
    const arr = L[lane];
    if (!arr || kept.includes(lane)) continue;
    const gap = Math.ceil(sec / tatumSec - 1e-6);
    if (gap <= 1) continue;
    let last = -1;
    for (let t = 0; t < len; t++) {
      if (!arr[t] || (lane === 'hihat' && arr[t].art === 'pedal')) continue;
      if (last >= 0 && t - last < gap) {
        if (arr[t].s > arr[last].s) { arr[last] = null; last = t; } else arr[t] = null;
        removed++;
      } else last = t;
    }
  }

  for (let t = 0; t < len; t++) {
    const hands = HAND_LANES.filter((l) => L[l]?.[t] && !(l === 'hihat' && L[l][t].art === 'pedal'));
    if (L.hihat?.[t] && L.ride?.[t] && L.hihat[t].art !== 'pedal') {
      const drop = part.timekeeper === 'ride' ? 'hihat' : 'ride';
      if (!kept.includes(drop)) { L[drop][t] = null; hands.splice(hands.indexOf(drop), 1); removed++; }
    }
    if (hands.length > 2) {
      hands.sort((a, b) => priority(b, L[b][t], part.timekeeper) + bonus(b) - priority(a, L[a][t], part.timekeeper) - bonus(a));
      for (const l of hands.slice(2)) { L[l][t] = null; removed++; }
    }
  }
  return removed;
}
