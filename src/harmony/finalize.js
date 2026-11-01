// Pitched voices -> timed MIDI-ready events, sharing swing and humanize with the drums.
import { Rng, hashString, clamp } from '../core/rng.js';
import { swingTicks } from '../engine/finalize.js';
import { PITCHED } from './generate.js';

const BASE_VEL = { bass: 100, comp: 80, melody: 96 };
const TIGHT = { bass: 0.4, comp: 0.8, melody: 0.7 };

export function finalizeHarmony(result, cfg, tpt) {
  const h = result.harmony;
  const events = [];
  if (!h) return events;
  const { meter } = result;
  for (const hp of h.parts) {
    const rp = result.parts[hp.index];
    if (!rp) continue;
    const params = rp.params;
    for (const voice of PITCHED) {
      if (cfg.harmony?.voices?.[voice]?.muted) continue;
      for (const n of hp.voices[voice] || []) {
        const T = rp.start + n.t;
        const g = new Rng(hashString(`${cfg.seed}:${voice}:${T}:${n.p}`));
        let tick = T * tpt + swingTicks(n.t, params, meter, tpt) + (n.o || 0) * tpt;
        tick += g.gauss() * params.humanize * tpt * 0.08 * TIGHT[voice];
        const endT = n.t + n.d;
        const end = (rp.start + endT) * tpt + (Number.isInteger(endT) ? swingTicks(endT, params, meter, tpt) : 0);
        const v = BASE_VEL[voice] * (0.55 + 0.45 * n.v) * (1 - params.dynamics * 0.12 * (1 - n.v)) + g.gauss() * params.humanize * 4;
        const start = Math.max(0, Math.round(tick));
        events.push({
          voice, t: T, tick: start, dur: Math.max(1, Math.round(end - start) - 2), pitch: n.p, vel: clamp(Math.round(v), 1, 127),
        });
      }
    }
  }
  return events.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
}
