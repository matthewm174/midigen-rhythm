// Standard MIDI File reader and importer.
// Files saved by midigen carry their full state (see midi.js) and are recalled exactly.
// Other files are imported best-effort: tempo, meter, markers -> parts, channel 10 -> drum lanes (via the drum map),
// other channels -> bass / rhythm section / melody, with the key and chords inferred so missing voices can be generated.
import { parseMeter } from '../core/meter.js';
import { LANES, DEFAULT_MAP, BASE_VELOCITY } from '../core/drummap.js';
import { ROLES } from '../core/descriptors.js';
import { QUALITIES, chordSymbol } from '../harmony/chords.js';
import { KEY_NAMES, pc12 } from '../harmony/tuning.js';
import { STATE_TAG } from './midi.js';

const dec = new TextDecoder();

export function parseMidi(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const str = (o, n) => String.fromCharCode(...b.slice(o, o + n));
  if (b.length < 14 || str(0, 4) !== 'MThd') throw new Error('Not a MIDI file (no MThd header).');
  const hlen = dv.getUint32(4);
  const format = dv.getUint16(8), ntrk = dv.getUint16(10), division = dv.getUint16(12);
  if (division & 0x8000) throw new Error('SMPTE-timed MIDI files are not supported.');
  const out = { format, ppq: division, tracks: [], tempos: [], timeSigs: [], markers: [], state: null };
  let off = 8 + hlen;
  for (let ti = 0; ti < ntrk && off + 8 <= b.length; ti++) {
    if (str(off, 4) !== 'MTrk') throw new Error(`Bad track header in track ${ti}.`);
    const end = Math.min(b.length, off + 8 + dv.getUint32(off + 4));
    let p = off + 8, tick = 0, status = 0;
    const tr = { name: '', events: [] };
    const vlq = () => { let v = 0, c; do { c = b[p++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80 && p < end); return v; };
    while (p < end) {
      tick += vlq();
      let s = b[p];
      if (s & 0x80) p++; else s = status;
      if (s === 0xff) {
        const type = b[p++];
        const len = vlq();
        const data = b.slice(p, p + len);
        p += len;
        if (type === 0x03 && !tr.name) tr.name = dec.decode(data);
        else if (type === 0x51 && len >= 3) out.tempos.push({ tick, us: (data[0] << 16) | (data[1] << 8) | data[2] });
        else if (type === 0x58 && len >= 2) out.timeSigs.push({ tick, num: data[0], den: 2 ** data[1] });
        else if (type === 0x06) out.markers.push({ tick, text: dec.decode(data) });
        else if (type === 0x7f && data[0] === 0x7d) {
          const text = dec.decode(data.slice(1));
          if (text.startsWith(STATE_TAG)) { try { out.state = JSON.parse(text.slice(STATE_TAG.length)); } catch { /* ignore a damaged state */ } }
        }
        continue;
      }
      if (s === 0xf0 || s === 0xf7) { p += vlq(); continue; }
      status = s;
      const kind = s & 0xf0, ch = s & 0x0f;
      const d1 = b[p++];
      const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : b[p++];
      tr.events.push({ tick, kind, ch, d1, d2 });
    }
    out.tracks.push(tr);
    off = end;
  }
  return out;
}

// Notes with exact (bent) pitch and duration per track.
export function midiNotes(mid) {
  const all = [];
  mid.tracks.forEach((tr, ti) => {
    const bend = new Array(16).fill(0), range = new Array(16).fill(2), rpn = new Array(16).fill([127, 127]).map(() => [127, 127]);
    const program = new Array(16).fill(null);
    const open = new Map();
    for (const e of tr.events) {
      if (e.kind === 0xe0) bend[e.ch] = (((e.d2 << 7) | e.d1) - 8192) / 8192;
      else if (e.kind === 0xc0) program[e.ch] ??= e.d1;
      else if (e.kind === 0xb0) {
        if (e.d1 === 101) rpn[e.ch][0] = e.d2;
        else if (e.d1 === 100) rpn[e.ch][1] = e.d2;
        else if (e.d1 === 6 && rpn[e.ch][0] === 0 && rpn[e.ch][1] === 0) range[e.ch] = e.d2 || 2;
      } else if (e.kind === 0x90 && e.d2 > 0) {
        const k = `${e.ch}:${e.d1}`;
        if (open.has(k)) close(open.get(k), e.tick);
        const n = { track: ti, trackName: tr.name, ch: e.ch, key: e.d1, pitch: e.d1 + bend[e.ch] * range[e.ch], vel: e.d2, tick: e.tick, dur: 0 };
        open.set(k, n);
        all.push(n);
      } else if (e.kind === 0x80 || (e.kind === 0x90 && e.d2 === 0)) {
        const k = `${e.ch}:${e.d1}`;
        if (open.has(k)) { close(open.get(k), e.tick); open.delete(k); }
      }
    }
    for (const n of open.values()) close(n, n.tick + mid.ppq);
    tr.programs = program;
  });
  function close(n, t) { n.dur = Math.max(1, t - n.tick); }
  return all;
}

const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Krumhansl–Kessler key finding: correlate the duration-weighted pitch-class histogram with the key profiles.
export function findKey(notes) {
  const h = new Array(12).fill(0);
  for (const n of notes) h[Math.round(pc12(n.pitch)) % 12] += n.dur || 1;
  const corr = (a, b) => {
    const ma = a.reduce((x, y) => x + y, 0) / 12, mb = b.reduce((x, y) => x + y, 0) / 12;
    let s = 0, sa = 0, sb = 0;
    for (let i = 0; i < 12; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
    return sa && sb ? s / Math.sqrt(sa * sb) : 0;
  };
  let best = { pc: 0, mode: 'major', r: -2 };
  for (let k = 0; k < 12; k++) {
    for (const [mode, prof] of [['major', KK_MAJOR], ['minor', KK_MINOR]]) {
      const r = corr(h, prof.map((_, i) => prof[(i - k + 12) % 12]));
      if (r > best.r) best = { pc: k, mode, r };
    }
  }
  return best;
}

const TEMPLATES = ['maj', 'min', '7', 'm7', 'maj7', 'dim', '5', 'sus4'];

// Best-fitting chord for a pitch-class histogram (with the lowest note as a root hint).
export function inferChord(hist, bassPc) {
  let best = null, bs = -Infinity;
  const total = hist.reduce((a, b) => a + b, 0) || 1;
  for (let r = 0; r < 12; r++) {
    for (const q of TEMPLATES) {
      const tones = QUALITIES[q].iv.map((x) => (r + x) % 12);
      let s = 0;
      for (let i = 0; i < 12; i++) s += tones.includes(i) ? hist[i] : -0.6 * hist[i];
      s = s / total - 0.04 * tones.length + (bassPc === r ? 0.25 : 0);
      if (s > bs) { bs = s; best = { root: r, q, iv: QUALITIES[q].iv.slice() }; }
    }
  }
  return best;
}

export function importMidi(bytes, { drumMap = DEFAULT_MAP, name = 'imported' } = {}) {
  const mid = parseMidi(bytes);
  if (mid.state && mid.state.cfg) return { fromState: true, state: mid.state, warnings: [] };
  const warnings = [];
  const notes = midiNotes(mid);
  if (!notes.length) throw new Error('No notes found in this MIDI file.');
  const ppq = mid.ppq || 480;
  const us = mid.tempos[0]?.us || 500000;
  const ts = mid.timeSigs[0] || { num: 4, den: 4 };
  if (mid.tempos.length > 1) warnings.push('Tempo changes were ignored (one tempo per song).');
  if (mid.timeSigs.length > 1) warnings.push('Meter changes were ignored (one meter per song).');
  const tempo = Math.round((60000000 / us) * 100) / 100;
  const meterText = `${ts.num}/${ts.den}`;

  // Pick the grid that fits the onsets best (16ths, triplets or 32nds).
  const errOf = (r) => {
    const tpt = (ppq * 4) / r;
    return notes.reduce((s, n) => s + Math.abs(n.tick / tpt - Math.round(n.tick / tpt)), 0) / notes.length;
  };
  const e16 = errOf(16), e24 = errOf(24), e32 = errOf(32);
  const resolution = e16 < 0.1 ? 16 : e24 < e16 * 0.6 && e24 <= e32 ? 24 : e32 < e16 * 0.6 ? 32 : 16;
  const meter = parseMeter(meterText, resolution);
  const tpt = (ppq * 4) / resolution;
  const endTick = Math.max(...notes.map((n) => n.tick + n.dur));
  const bars = Math.max(1, Math.ceil(endTick / tpt / meter.barLen - 1e-6));

  // Parts from markers ("A (groove)"), else chunks of up to 8 bars.
  let parts = [];
  const marks = mid.markers.map((m) => ({ bar: Math.round(m.tick / tpt / meter.barLen), text: m.text.trim() })).filter((m) => m.bar < bars);
  if (marks.length) {
    if (marks[0].bar > 0) marks.unshift({ bar: 0, text: 'intro' });
    const uniq = marks.filter((m, i) => i === 0 || m.bar > marks[i - 1].bar);
    uniq.forEach((m, i) => {
      const nb = (uniq[i + 1]?.bar ?? bars) - m.bar;
      const rm = /^(.*?)\s*\((\w+)\)\s*$/.exec(m.text);
      parts.push({ name: (rm ? rm[1] : m.text) || `Part ${i + 1}`, bars: nb, role: rm && ROLES.includes(rm[2]) ? rm[2] : i ? 'variation' : 'groove' });
    });
  } else {
    for (let b = 0, i = 0; b < bars; b += 8, i++) parts.push({ name: String.fromCharCode(65 + (i % 26)), bars: Math.min(8, bars - b), role: i ? 'variation' : 'groove' });
  }
  const split = [];
  for (const p of parts) for (let b = 0; b < p.bars; b += 64) split.push({ ...p, bars: Math.min(64, p.bars - b), descriptors: '', tension: '' });
  parts = split;
  let start = 0;
  const spans = parts.map((p) => { const s = { start, len: p.bars * meter.barLen }; start += s.len; return s; });
  const partOf = (T) => spans.findIndex((s) => T >= s.start && T < s.start + s.len);

  // Drums.
  const drums = notes.filter((n) => n.ch === 9);
  const rev = new Map();
  for (const lane of LANES) for (const [art, note] of Object.entries(drumMap[lane] || {})) if (!rev.has(note)) rev.set(note, [lane, art]);
  const pinned = { barLen: meter.barLen, resolution, parts: spans.map((s) => ({ len: s.len, lanes: {}, base: {}, info: {} })) };
  for (const p of pinned.parts) for (const lane of LANES) { p.lanes[lane] = new Array(p.len).fill(null); p.info[lane] = { algo: 'imported', detail: 'from MIDI', cycle: meter.barLen }; }
  let unmapped = 0;
  for (const n of drums) {
    const m = rev.get(n.key);
    if (!m) { unmapped++; continue; }
    const T = Math.round(n.tick / tpt), pi = partOf(T);
    if (pi < 0) continue;
    let [lane, art] = m;
    if (lane === 'snare' && art === 'center' && n.vel < 50) art = 'ghost';
    const s = Math.max(0, Math.min(1, (n.vel / (BASE_VELOCITY[lane] || 100) - 0.55) / 0.45));
    pinned.parts[pi].lanes[lane][T - spans[pi].start] = { s: Math.round(s * 100) / 100, art };
  }
  for (const p of pinned.parts) for (const lane of LANES) p.base[lane] = p.lanes[lane].map((h) => h && { ...h });
  if (unmapped) warnings.push(`${unmapped} drum note(s) aren't in the drum map and were skipped.`);

  // Pitched tracks -> voices.
  const pitched = notes.filter((n) => n.ch !== 9);
  const groups = new Map();
  for (const n of pitched) {
    const k = `${n.track}:${n.ch}`;
    if (!groups.has(k)) groups.set(k, { key: k, name: n.trackName, track: n.track, ch: n.ch, notes: [] });
    groups.get(k).notes.push(n);
  }
  const gs = [...groups.values()].map((g) => {
    const mean = g.notes.reduce((a, n) => a + n.pitch, 0) / g.notes.length;
    // Chordal = share of notes that start together with another note (melodies and bass lines rarely do).
    const on = g.notes.map((n) => n.tick).sort((a, b) => a - b);
    const tol = ppq / 16;
    const together = on.filter((t, i) => (i > 0 && t - on[i - 1] <= tol) || (i < on.length - 1 && on[i + 1] - t <= tol)).length;
    return { ...g, mean, chordal: together / on.length, program: mid.tracks[g.track].programs?.[g.ch] ?? null };
  });
  // In a single-track file the track name is the song title, so it says nothing about the voice.
  const useNames = mid.tracks.length > 1;
  const byName = (g) => (!useNames || g.track === 0 ? null : /bass/i.test(g.name) ? 'bass' : /(melody|lead|vocal|voice|solo|sax|flute|violin|trumpet|clarinet|whistle)/i.test(g.name) ? 'melody'
    : /(chord|comp|pad|piano|guitar|keys|organ|rhythm|strings|harp|synth)/i.test(g.name) ? 'comp' : null);
  const assigned = new Map(gs.map((g) => [g.key, byName(g)]));
  const free = gs.filter((g) => !assigned.get(g.key));
  for (const g of free) if (g.chordal >= 0.3) assigned.set(g.key, 'comp');
  const lines = free.filter((g) => !assigned.get(g.key)).sort((a, b) => a.mean - b.mean);
  if (lines.length && lines[0].mean < 55 && (lines.length > 1 || !gs.some((g) => assigned.get(g.key) === 'bass'))) assigned.set(lines.shift().key, 'bass');
  for (const g of lines) assigned.set(g.key, g.mean >= 55 || !gs.some((x) => assigned.get(x.key) === 'melody') ? 'melody' : 'bass');

  const voiceNotes = { bass: [], comp: [], melody: [] };
  const programs = {};
  for (const g of gs) {
    const v = assigned.get(g.key);
    voiceNotes[v].push(...g.notes);
    if (g.program != null && programs[v] == null) programs[v] = g.program;
  }
  const harmonyPinned = { barLen: meter.barLen, resolution, parts: spans.map((s) => ({ len: s.len, voices: { bass: [], comp: [], melody: [] }, info: {}, prog: null })) };
  for (const [v, list] of Object.entries(voiceNotes)) {
    for (const n of list) {
      const T = Math.round(n.tick / tpt), pi = partOf(T);
      if (pi < 0) continue;
      harmonyPinned.parts[pi].voices[v].push({ t: T - spans[pi].start, d: Math.max(0.25, Math.round((n.dur / tpt) * 100) / 100), p: Math.round(n.pitch * 1000) / 1000, v: Math.round((n.vel / 127) * 100) / 100 });
    }
  }
  for (const p of harmonyPinned.parts) {
    for (const v of Object.keys(p.voices)) {
      p.voices[v].sort((a, b) => a.t - b.t || a.p - b.p);
      p.info[v] = { style: 'imported', detail: `imported · ${p.voices[v].length} notes` };
    }
  }

  // Key and one chord per bar (from the rhythm section and bass, else the melody).
  const key = pitched.length ? findKey(pitched) : null;
  harmonyPinned.parts.forEach((p) => {
    const chords = [];
    let prev = key ? { root: key.pc, q: key.mode === 'minor' ? 'min' : 'maj', iv: QUALITIES[key.mode === 'minor' ? 'min' : 'maj'].iv.slice() } : { root: 0, q: 'maj', iv: [0, 4, 7] };
    for (let t = 0; t < p.len; t += meter.barLen) {
      const hist = new Array(12).fill(0);
      let low = null;
      const src = [...p.voices.comp, ...p.voices.bass].length ? [...p.voices.comp, ...p.voices.bass.map((n) => ({ ...n, w: 1.5 }))] : p.voices.melody;
      for (const n of src) {
        const a = Math.max(t, n.t), b = Math.min(t + meter.barLen, n.t + n.d);
        if (b <= a) continue;
        hist[Math.round(pc12(n.p)) % 12] += (b - a) * (n.w || 1);
        if (low === null || n.p < low) low = n.p;
      }
      const c = hist.some((x) => x > 0) ? inferChord(hist, low === null ? null : Math.round(pc12(low)) % 12) : prev;
      prev = c;
      const chord = { t, len: Math.min(meter.barLen, p.len - t), root: c.root, q: c.q, iv: c.iv };
      chord.sym = chordSymbol(chord);
      chord.roman = chord.sym;
      chord.tok = chord.sym;
      chords.push(chord);
    }
    p.prog = { chords, trace: 'inferred from MIDI', tokens: chords.map((c) => c.sym), template: 'imported' };
    p.info.progression = { detail: 'inferred from MIDI' };
  });

  const micro = pitched.some((n) => Math.abs(n.pitch - Math.round(n.pitch)) > 0.01);
  const hasDrums = drums.length - unmapped > 0;
  const voicesWithNotes = Object.keys(voiceNotes).filter((v) => voiceNotes[v].length);
  return {
    fromState: false, warnings,
    cfg: {
      tempo, meter: meterText, resolution, parts,
      harmony: key ? { key: KEY_NAMES[key.pc], scale: key.mode, microtones: micro ? 'on' : 'auto' } : {},
    },
    programs, pinned, harmonyPinned, hasDrums,
    lockVoices: pitched.length ? ['progression', ...voicesWithNotes] : [],
    summary: `${name}: ${bars} bar${bars === 1 ? '' : 's'} of ${meterText} at ${tempo} bpm · ${drums.length} drum notes · ${pitched.length} pitched notes${key ? ` · key ${KEY_NAMES[key.pc]} ${key.mode}` : ''}`,
  };
}
