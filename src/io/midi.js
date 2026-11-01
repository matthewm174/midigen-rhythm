// Standard MIDI File writer, all notes on channel 10.
// Default: type 1 with tempo map + markers on track 0 and one track per drum lane.
// combine: true -> type 0 with everything merged into a single track.

const enc = new TextEncoder();

function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

function meta(type, data) {
  return [0xff, type, ...vlq(data.length), ...data];
}

function track(events, endTick) {
  // events: [{ tick, bytes }]
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out = [];
  let last = 0;
  for (const e of events) {
    out.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  out.push(...vlq(Math.max(0, endTick - last)), ...meta(0x2f, []));
  const len = out.length;
  return [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...out];
}

export function writeMidi({ events, tempo, meter, parts, lanes, labels, ppq = 480, tpt, totalTatums, title = 'midigen rhythm', combine = false }) {
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

  let tracks;
  if (combine) {
    const merged = events.filter((e) => lanes.includes(e.lane)).sort((a, b) => a.tick - b.tick);
    tracks = [track([...conductor, ...noteEvents(merged)], endTick)];
  } else {
    tracks = [track(conductor, endTick)];
    for (const lane of lanes) {
      const name = { tick: 0, order: 0, bytes: meta(0x03, [...enc.encode(labels[lane] || lane)]) };
      tracks.push(track([name, ...noteEvents(events.filter((e) => e.lane === lane))], endTick));
    }
  }

  const format = combine ? 0 : 1;
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, format, 0, tracks.length, (ppq >> 8) & 255, ppq & 255];
  return new Uint8Array([...header, ...tracks.flat()]);
}
