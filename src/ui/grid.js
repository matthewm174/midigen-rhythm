import { LANES, LANE_LABELS, SYMBOLS } from '../core/drummap.js';
import { noteName } from '../harmony/tuning.js';
import { VOICE_LABELS } from '../harmony/generate.js';

const ROLL_H = { melody: 64, comp: 72, bass: 48 };

// Chord chart and piano rolls, positioned in cell units so zoom only needs --cell-w.
function renderHarmonyRows(frag, result, cfg, total, barLen) {
  const h = result.harmony;
  const strip = (cls, label, height) => {
    const r = el('div', `g-row g-roll ${cls}`);
    r.style.gridTemplateColumns = `var(--label-w) calc(var(--cell-w) * ${total})`;
    r.append(el('div', 'g-label', label));
    const body = el('div', 'roll-body');
    body.style.height = `${height}px`;
    body.style.backgroundSize = `calc(var(--cell-w) * ${barLen}) 100%`;
    r.append(body);
    frag.append(r);
    return body;
  };
  const place = (d, t, len) => {
    d.style.left = `calc(var(--cell-w) * ${t})`;
    d.style.width = `calc(var(--cell-w) * ${len} - 1px)`;
  };

  const chords = strip('g-chords', `${h.keyName} ${h.scaleName.replace(/ \(.*\)$/, '')}`, 22);
  chords.parentElement.title = `${h.keyName} ${h.scaleName} · ${h.tuningName}`;
  for (const p of h.parts) {
    for (const c of p.prog.chords) {
      const d = el('div', 'chord', c.sym);
      place(d, p.start + c.t, c.len);
      d.title = `${c.sym}${c.roman && c.roman !== c.sym ? ` (${c.roman})` : ''}${c.pedal != null ? ` over ${noteName(c.pedal)} pedal` : ''}`;
      chords.append(d);
    }
  }

  for (const voice of ['melody', 'comp', 'bass']) {
    const muted = cfg.harmony?.voices?.[voice]?.muted;
    const body = strip(`g-voice${muted ? ' muted' : ''}`, VOICE_LABELS[voice] + (muted ? ' (muted)' : ''), ROLL_H[voice]);
    body.parentElement.dataset.voice = voice;
    const all = h.parts.flatMap((p) => p.voices[voice].map((n) => ({ ...n, T: p.start + n.t })));
    if (!all.length) continue;
    const lo = Math.min(...all.map((n) => n.p)) - 1, hi = Math.max(...all.map((n) => n.p)) + 1;
    const H = ROLL_H[voice], nh = Math.max(3, Math.min(8, (H - 4) / Math.max(1, hi - lo)));
    for (const n of all) {
      const d = el('div', `note${Math.abs(n.p - Math.round(n.p)) > 0.01 ? ' micro' : ''}${n.orn ? ' orn' : ''}`);
      place(d, n.T, Math.max(0.35, n.d));
      d.style.top = `${2 + ((hi - n.p) / (hi - lo)) * (H - nh - 4)}px`;
      d.style.height = `${nh}px`;
      d.style.setProperty('--v', 0.35 + 0.65 * (n.v ?? 0.7));
      d.title = `${noteName(n.p, { octave: true })}${n.orn ? ` (${n.orn})` : ''}`;
      body.append(d);
    }
  }
}

function el(tag, cls, text) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text != null) d.textContent = text;
  return d;
}

export function renderGrid(container, result, final, cfg) {
  const { meter, parts, total } = result;
  const { barLen, beatStarts } = meter;
  const cols = `var(--label-w) repeat(${total}, var(--cell-w))`;
  const partStarts = new Set(parts.map((p) => p.start));
  const vel = new Map(final.events.map((e) => [`${e.lane}:${e.t}`, e.vel]));
  const frag = document.createDocumentFragment();

  const row = (cls, label) => {
    const r = el('div', `g-row ${cls}`);
    r.style.gridTemplateColumns = cols;
    r.append(el('div', 'g-label', label));
    frag.append(r);
    return r;
  };
  const edge = (t) => (partStarts.has(t) ? ' part' : t % barLen === 0 ? ' bar' : '');

  const ph = row('g-parts', '');
  for (const p of parts) {
    const d = el('div', `g-part role-${p.role}`, `${p.name} · ${p.role} · ${p.bars} bar${p.bars > 1 ? 's' : ''} · ${p.timekeeper}`);
    d.style.gridColumn = `span ${p.len}`;
    d.title = `tension ${p.params.tension.toFixed(2)}${p.fill ? `\nfill: ${p.fill.trace}` : ''}${p.blast ? `\nblast: ${p.blast.type}` : ''}`;
    ph.append(d);
  }

  const br = row('g-beats', '');
  for (let t = 0; t < total; t++) {
    const bi = beatStarts.indexOf(t % barLen);
    br.append(el('div', `g-beat${edge(t)}`, bi >= 0 ? String(bi + 1) : ''));
  }

  if (result.harmony) renderHarmonyRows(frag, result, cfg, total, barLen);

  for (const lane of LANES) {
    const muted = cfg.lanes?.[lane]?.muted;
    const r = row('g-lane', LANE_LABELS[lane] + (muted ? ' (muted)' : ''));
    r.dataset.lane = lane;
    const hits = final.lanesFull[lane];
    for (let t = 0; t < total; t++) {
      const inBar = t % barLen;
      const c = el('div', `cell${beatStarts.includes(inBar) ? ' beat' : ''}${edge(t)}`);
      c.dataset.t = t;
      const h = hits[t];
      if (h) {
        c.classList.add('hit');
        if (h.art === 'ghost') c.classList.add('ghost');
        c.textContent = SYMBOLS[h.art] || 'x';
        const v = vel.get(`${lane}:${t}`);
        c.style.setProperty('--v', muted ? 0.25 : Math.max(0.3, (v ?? 90) / 127));
        c.title = `${lane} ${h.art}${v ? ` vel ${v}` : ''}`;
      }
      r.append(c);
    }
  }

  const fr = row('g-field', 'interference');
  fr.title = 'Where lanes coincide on strong metric positions (accents & crashes gravitate here)';
  for (let t = 0; t < total; t++) {
    const c = el('div', `fcell${edge(t)}`);
    const bar = el('i');
    bar.style.height = `${Math.round(final.field[t] * 100)}%`;
    c.append(bar);
    fr.append(c);
  }

  container.replaceChildren(frag);
}

export function renderAnalysis(container, result, final) {
  const { analysis } = final;
  const frag = document.createDocumentFragment();
  const card = (title, note) => {
    const c = el('div', 'card');
    c.append(el('h3', null, title));
    if (note) c.append(el('p', null, note));
    frag.append(c);
    return c;
  };
  const table = (head, rows) => {
    const t = el('table');
    const tr = el('tr');
    head.forEach((h) => tr.append(el('th', null, h)));
    t.append(tr);
    for (const r of rows) {
      const row = el('tr');
      r.forEach((v) => {
        const td = el('td', typeof v === 'number' ? 'num' : v && v.cls ? v.cls : null, v && v.text != null ? v.text : v);
        row.append(td);
      });
      t.append(row);
    }
    return t;
  };
  const f2 = (x) => (x == null ? '–' : x.toFixed(2));

  const c1 = card('Parts', 'Alignment = how often kick, snare, toms and cymbals coincide (1 = locked together). Tension pushes it down.');
  c1.append(table(['part', 'role', 'tension', 'alignment', 'keeper', 'dropped', 'fill (L-system)'],
    analysis.parts.map((p) => [p.name, p.role, f2(p.targetTension), f2(p.alignment), p.timekeeper, p.removed, { cls: 'trace', text: p.fill || p.blast || '–' }])));

  const c2 = card('Lanes', 'What generated each lane, per part.');
  const rows = [];
  for (const p of result.parts) {
    for (const lane of LANES) {
      const i = p.info[lane];
      if (!i || i.algo === 'rest' || i.algo === 'off') continue;
      rows.push([p.name, lane, i.algo, i.cycle, { cls: 'trace', text: i.detail || '' }]);
    }
  }
  c2.append(table(['part', 'lane', 'algorithm', 'cycle', 'detail'], rows));

  const h = result.harmony;
  if (h) {
    const ch = card('Harmony & melody', `${h.keyName} ${h.scaleName} · ${h.tuningName}${h.micro ? ' (microtones on)' : ''} · grammar: ${h.grammar}. Bass follows the kick, the rhythm section the snare and hats.`);
    const tr = (s) => ({ cls: 'trace', text: s || '–' });
    ch.append(table(['part', 'key', 'chords', 'progression', 'bass', 'rhythm section', 'melody'], h.parts.map((p) => [
      p.name, p.keyName, tr(p.prog.chords.map((c) => c.sym).join(' ')), tr(p.info.progression?.detail), tr(p.info.bass?.detail), tr(p.info.comp?.detail), tr(p.info.melody?.detail),
    ])));
  }

  const c3 = card('Oscillators & beating',
    'Each polymetric lane is an oscillator against the bar. Like two tones beating at |f1 − f2|, they drift apart and realign every lcm(cycle, bar) steps.');
  if (analysis.oscillators.length) {
    c3.append(table(['part', 'lane', 'ratio', 'tenney', 'lane Hz', 'beat Hz', 'realign'],
      analysis.oscillators.map((o) => [o.part, o.lane, o.ratio, f2(o.tenney), o.laneHz.toFixed(3), o.beatHz.toFixed(3), `${+o.realignBars.toFixed(2)} bars / ${o.realignSec.toFixed(1)}s`])));
  } else c3.append(el('p', null, 'No polymetric lanes in this rhythm. Try "polymetric", "phasing" or a lane spec like "cycle 5/16".'));

  const c4 = card('Alignment matrix', 'Share of the sparser lane\'s hits that land together with the other lane.');
  const lanes = LANES.filter((l) => analysis.lanes[l].hits);
  c4.append(table(['', ...lanes], lanes.map((a) => [a, ...lanes.map((b) => f2(analysis.alignment[a][b]))])));
  c4.querySelector('table').classList.add('matrix');

  const c5 = card('Density & syncopation', 'Syncopation = mean off-grid weight of the onsets (0 = all on the downbeats).');
  c5.append(table(['lane', 'hits', 'per bar', 'syncopation'], LANES.map((l) => [l, analysis.lanes[l].hits, f2(analysis.lanes[l].perBar), f2(analysis.lanes[l].syncopation)])));

  const warns = [...result.warnings, ...(result.harmony?.warnings || [])];
  if (warns.length) {
    const c6 = card('Warnings');
    for (const w of warns) c6.append(el('p', 'warn', w));
  }
  container.replaceChildren(frag);
}
