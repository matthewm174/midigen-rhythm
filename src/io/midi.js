// Standard MIDI File writer.
// Drums are on channel 10. Pitched voices (melody, rhythm section, bass) get their own tracks, channels and GM programs.
// Microtones: each note's offset from the nearest key is sent as pitch bend (range ±2 semitones, set by RPN 0),
// and notes that need different bends at the same time are spread over several channels.
// The full midigen state can be embedded as a sequencer-specific meta event so the file can be loaded back.
// Default: type 1 with tempo map + markers on track 0. combine: true -> type 0 with everything on one track.

const enc = new TextEncoder();
export const STATE_TAG = 'midigen:';
export const BEND_RANGE = 2;

export function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

function meta(type, data) {
  const out = [0xff, type, ...vlq(data.length)];
  for (let i = 0; i < data.length; i++) out.push(data[i]);
  return out;
}

function track(events, endTick) {
  // events: [{ tick, order, bytes }]
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out = [0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 0];
  let last = 0;
  for (const e of events) {
    for (const b of vlq(e.tick - last)) out.push(b);
    for (let i = 0; i < e.bytes.length; i++) out.push(e.bytes[i]);
    last = e.tick;
  }
  out.push(...vlq(Math.max(0, endTick - last)), ...meta(0x2f, []));
  const len = out.length - 8;
  out[4] = (len >>> 24) & 255; out[5] = (len >>> 16) & 255; out[6] = (len >>> 8) & 255; out[7] = len & 255;
  return out;
}

// Pitched notes [{ tick, dur, pitch (float), vel }] -> channel events.
function pitchedEvents({ notes, program = 0, channels }, endTick) {
  const micro = notes.some((n) => Math.abs(n.pitch - Math.round(n.pitch)) > 0.004);
  const pool = micro ? channels : [channels[0]];
  const out = [];
  for (const ch of pool) {
    out.push({ tick: 0, order: 1, bytes: [0xc0 | ch, program & 127] });
    if (micro) {
      // RPN 0 (pitch bend sensitivity) = BEND_RANGE semitones, then RPN null.
      for (const [cc, v] of [[101, 0], [100, 0], [6, BEND_RANGE], [38, 0], [101, 127], [100, 127]]) out.push({ tick: 0, order: 1, bytes: [0xb0 | ch, cc, v] });
      out.push({ tick: 0, order: 1, bytes: [0xe0 | ch, 0, 64] });
    }
  }
  const state = pool.map((ch) => ({ ch, bend: 8192, until: 0, used: -1, keys: new Map() }));
  const placed = [];
  const sorted = notes.slice().sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
  sorted.forEach((n, i) => {
    const key = Math.max(0, Math.min(127, Math.round(n.pitch)));
    const bend = Math.max(0, Math.min(16383, 8192 + Math.round(((n.pitch - key) / BEND_RANGE) * 8192)));
    let s;
    if (!micro) s = state[0];
    else {
      s = state.find((x) => x.bend === bend && !((x.keys.get(key) ?? 0) > n.tick))
        || state.filter((x) => x.until <= n.tick).sort((a, b) => a.used - b.used)[0]
        || state.slice().sort((a, b) => a.until - b.until)[0];
      if (s.bend !== bend) {
        out.push({ tick: n.tick, order: 3, bytes: [0xe0 | s.ch, bend & 0x7f, bend >> 7] });
        s.bend = bend;
      }
    }
    const off = Math.min(endTick + 480, n.tick + Math.max(1, n.dur));
    s.until = Math.max(s.until, off);
    s.used = i;
    s.keys.set(key, off);
    placed.push({ ch: s.ch, key, on: n.tick, off, vel: Math.max(1, Math.min(127, n.vel)) });
  });
  // A repeated key on one channel ends the earlier note; an exact duplicate (same start) is dropped.
  const byKey = new Map();
  const kept = [];
  for (const p of placed) {
    const k = `${p.ch}:${p.key}`;
    const prev = byKey.get(k);
    if (prev && prev.on === p.on) { prev.off = Math.max(prev.off, p.off); prev.vel = Math.max(prev.vel, p.vel); continue; }
    if (prev && prev.off > p.on) prev.off = p.on;
    byKey.set(k, p);
    kept.push(p);
  }
  for (const p of kept) {
    out.push({ tick: p.on, order: 5, bytes: [0x90 | p.ch, p.key, p.vel] });
    out.push({ tick: p.off, order: 4, bytes: [0x80 | p.ch, p.key, 64] });
  }
  return out;
}

export function writeMidi({
  events, tempo, meter, parts, lanes, labels, ppq = 480, tpt, totalTatums, title = 'midigen rhythm', combine = false, pitched = [], state = null,
}) {
  const endTick = totalTatums * tpt;
  const usPerQuarter = Math.round(60000000 / tempo);
  const clocks = meter.compound ? 36 : Math.max(1, Math.round(96 / (meter.unit ?? meter.den)));

  const conductor = [
    { tick: 0, order: 0, bytes: meta(0x03, [...enc.encode(title)]) },
    { tick: 0, order: 1, bytes: meta(0x51, [(usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255]) },
    // MIDI can only notate power-of-two denominators; irrational meters are written as num/unit at a scaled tempo.
    { tick: 0, order: 2, bytes: meta(0x58, [meter.num, Math.log2(meter.unit ?? meter.den), clocks, 8]) },
    ...parts.map((p) => ({ tick: p.start * tpt, order: 3, bytes: meta(0x06, [...enc.encode(`${p.name} (${p.role})`)]) })),
  ];
  // Sequencer-specific meta, manufacturer ID 0x7D (non-commercial), carrying the JSON state.
  if (state) conductor.push({ tick: 0, order: 2, bytes: meta(0x7f, [0x7d, ...enc.encode(STATE_TAG + JSON.stringify(state))]) });

  const dur = Math.max(1, Math.min(60, Math.floor(tpt / 2)));
  const noteEvents = (evs) => {
    const list = [];
    evs.forEach((e, i) => {
      let off = e.tick + dur;
      for (let j = i + 1; j < evs.length && evs[j].tick < off; j++) if (evs[j].note === e.note) { off = evs[j].tick; break; }
      off = Math.min(Math.max(off, e.tick + 1), endTick + dur);
      list.push({ tick: e.tick, order: 5, bytes: [0x99, e.note, e.vel] });
      list.push({ tick: off, order: 4, bytes: [0x89, e.note, 64] });
    });
    return list;
  };
  const named = (name, evs) => [{ tick: 0, order: 0, bytes: meta(0x03, [...enc.encode(name)]) }, ...evs];
  const pitchedTracks = pitched.filter((p) => p.notes.length).map((p) => ({ name: p.name, evs: pitchedEvents(p, endTick) }));

  let tracks;
  if (combine) {
    const merged = events.filter((e) => lanes.includes(e.lane)).sort((a, b) => a.tick - b.tick);
    tracks = [track([...conductor, ...noteEvents(merged), ...pitchedTracks.flatMap((p) => p.evs)], endTick)];
  } else {
    tracks = [track(conductor, endTick)];
    for (const p of pitchedTracks) tracks.push(track(named(p.name, p.evs), endTick));
    for (const lane of lanes) tracks.push(track(named(labels[lane] || lane, noteEvents(events.filter((e) => e.lane === lane))), endTick));
  }

  const format = combine ? 0 : 1;
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, format, 0, tracks.length, (ppq >> 8) & 255, ppq & 255];
  const bytes = new Uint8Array(header.length + tracks.reduce((n, t) => n + t.length, 0));
  bytes.set(header, 0);
  let off = header.length;
  for (const t of tracks) { bytes.set(t, off); off += t.length; }
  return bytes;
}
