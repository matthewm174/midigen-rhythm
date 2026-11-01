import { LANES, LANE_LABELS, DEFAULT_MAP, DEFAULT_ART } from '../core/drummap.js';
import { DESCRIPTOR_GROUPS, ROLES, interpretDescriptors, describeItems, displayName, descriptorNames } from '../core/descriptors.js';
import { LANE_SPEC_HELP, parseLaneSpec } from '../core/lanespec.js';
import { generateRhythm } from '../engine/generate.js';
import { finalize, TPQ } from '../engine/finalize.js';
import { writeMidi } from '../io/midi.js';
import { toAscii } from '../io/ascii.js';
import { renderGrid, renderAnalysis } from './grid.js';
import { Player } from './audio.js';

const STORE = 'midigen-rhythm-cfg-v1';
const UI_STORE = 'midigen-rhythm-ui-v1';
const GEN_ORDER = ['kick', 'snare', 'hihat', 'ride', 'toms', 'cymbals', 'crash'];
const ARTS = Object.fromEntries(Object.entries(DEFAULT_MAP).map(([lane, m]) => [lane, Object.keys(m)]));

const part = (name, bars, role, descriptors = '', tension = '') => ({ name, bars, role, descriptors, tension });
const STD_PARTS = [part('A', 4, 'groove'), part("A'", 4, 'variation'), part('B', 2, 'contrast'), part('turn', 1, 'fill')];

const PRESETS = {
  'Tribal 7/8': { tempo: 132, meter: '7/8 (2+2+3)', resolution: 16, descriptors: 'tribal, polymetric', parts: STD_PARTS },
  Grindcore: { tempo: 240, meter: '4/4', resolution: 16, descriptors: 'grindcore', parts: [part('blast', 2, 'groove'), part('blast 2', 2, 'variation'), part('crawl', 2, 'breakdown'), part('turn', 1, 'fill')] },
  'Djent 4/4': { tempo: 118, meter: '4/4', resolution: 16, descriptors: 'djent, math', parts: [part('riff', 4, 'groove'), part("riff'", 4, 'variation'), part('breakdown', 4, 'breakdown'), part('turn', 1, 'fill')] },
  'Polymetric pocket': { tempo: 102, meter: '4/4', resolution: 16, descriptors: 'musical, groove, polymetric', parts: STD_PARTS },
  'Hypnotic ritual 12/8': { tempo: 84, meter: '12/8', resolution: 24, descriptors: 'ritual, hypnotic, phasing', parts: [part('A', 4, 'groove'), part('drift', 4, 'variation'), part('rise', 2, 'build')] },
  'Crystal chaos 5/4': { tempo: 150, meter: '5/4', resolution: 16, descriptors: 'chaotic, crystalline, polyrhythmic', parts: STD_PARTS },
  'Spec example': {
    tempo: 140, meter: '4/4', resolution: 16, descriptors: 'downbeat, tribal', parts: STD_PARTS,
    lanes: { hihat: 'grid 1/8, accent &', kick: 'group 3/16 from each 1' },
  },
};

function defaultCfg() {
  return applyPreset({ seed: 1, overrides: {}, lanes: {}, drumMap: null }, 'Tribal 7/8');
}

function applyPreset(cfg, name) {
  const p = PRESETS[name];
  cfg.tempo = p.tempo;
  cfg.meter = p.meter;
  cfg.resolution = p.resolution;
  cfg.descriptors = p.descriptors;
  cfg.parts = p.parts.map((x) => ({ ...x }));
  cfg.overrides = {};
  cfg.lanes = Object.fromEntries(LANES.map((l) => [l, { spec: p.lanes?.[l] || '', locked: false, muted: false, salt: 0 }]));
  return cfg;
}

function normalizeCfg(c) {
  c.lanes = c.lanes || {};
  for (const l of LANES) c.lanes[l] = { spec: '', locked: false, muted: false, salt: 0, ...c.lanes[l] };
  c.overrides = c.overrides || {};
  return c;
}

function load() {
  try {
    const c = JSON.parse(localStorage.getItem(STORE));
    if (c && Array.isArray(c.parts) && c.lanes) return normalizeCfg(c);
  } catch { /* fall through to defaults */ }
  return defaultCfg();
}

// ---------- user presets ----------

const PRESET_STORE = 'midigen-rhythm-presets-v1';
const PRESET_KEYS = ['tempo', 'meter', 'resolution', 'descriptors', 'parts', 'overrides', 'seed', 'lanes', 'drumMap', 'midiLayout'];
const isPreset = (p) => p && typeof p === 'object' && Array.isArray(p.parts);

function loadUserPresets() {
  try {
    const p = JSON.parse(localStorage.getItem(PRESET_STORE));
    if (p && typeof p === 'object' && !Array.isArray(p)) return p;
  } catch { /* none saved */ }
  return {};
}

let userPresets = loadUserPresets();

function storeUserPresets() {
  try {
    localStorage.setItem(PRESET_STORE, JSON.stringify(userPresets));
    return true;
  } catch {
    showError('Could not save presets: browser storage is full or disabled. Use "Export my presets" to keep a file copy.');
    return false;
  }
}

// Settings plus the exact hits of locked lanes, so hand edits come back as they were.
function snapshotPreset() {
  const snap = JSON.parse(JSON.stringify(Object.fromEntries(PRESET_KEYS.map((k) => [k, cfg[k] ?? null]))));
  const locked = LANES.filter((l) => cfg.lanes[l].locked);
  if (result && locked.length) {
    const pick = (o) => Object.fromEntries(locked.map((l) => [l, o[l]]));
    snap.pinned = JSON.parse(JSON.stringify({
      barLen: result.meter.barLen, resolution: result.meter.resolution,
      parts: result.parts.map((p) => ({ len: p.len, lanes: pick(p.lanes), base: pick(p.base), info: pick(p.info) })),
    }));
  }
  return snap;
}

function applyUserPreset(name) {
  const { pinned, ...rest } = JSON.parse(JSON.stringify(userPresets[name]));
  for (const k of PRESET_KEYS) if (rest[k] !== undefined) cfg[k] = rest[k];
  normalizeCfg(cfg);
  cfg.presetName = name;
  // Locked lanes are restored from the snapshot through the normal "keep" path.
  result = pinned ? { meter: { barLen: pinned.barLen, resolution: pinned.resolution }, parts: pinned.parts } : null;
}

// Inline bar under the header (window.prompt/confirm are unavailable in some embedded browsers).
// mode: 'save' asks for a name, 'confirm' asks yes/no, 'info' just shows a message.
let barTimer = null;
function presetBar(mode, { msg = '', value = '', ok = 'Save', onOk = null } = {}) {
  const bar = $('preset-bar'), name = $('preset-name');
  clearTimeout(barTimer);
  bar.hidden = false;
  $('preset-msg').textContent = msg;
  name.hidden = mode !== 'save';
  $('preset-ok').hidden = mode === 'info';
  $('preset-ok').textContent = ok;
  $('preset-cancel').textContent = mode === 'info' ? 'OK' : 'Cancel';
  bar.onsubmit = (e) => { e.preventDefault(); if (onOk?.(name.value.trim()) !== false) bar.hidden = true; };
  if (mode === 'save') {
    name.value = value;
    const relabel = () => { $('preset-ok').textContent = userPresets[name.value.trim()] && name.value.trim() !== cfg.presetName ? 'Overwrite' : 'Save'; };
    name.oninput = relabel;
    relabel();
    name.focus();
    name.select();
  } else if (mode === 'info') barTimer = setTimeout(() => (bar.hidden = true), 4000);
}

function savePresetAs() {
  const suggested = cfg.presetName || descriptorNames(cfg.descriptors).slice(0, 3).map(displayName).join(' ') || 'My rhythm';
  presetBar('save', {
    msg: 'Save as', value: suggested,
    onOk: (name) => {
      if (!name) return false;
      userPresets[name] = snapshotPreset();
      if (!storeUserPresets()) return true;
      cfg.presetName = name;
      save();
      renderPresetMenu();
      flash('btn-save-preset', 'Saved');
      return true;
    },
  });
}

function deleteCurrentPreset() {
  const name = cfg.presetName;
  presetBar('confirm', {
    msg: `Delete your preset “${name}”?`, ok: 'Delete',
    onOk: () => {
      delete userPresets[name];
      storeUserPresets();
      cfg.presetName = null;
      save();
      renderPresetMenu();
    },
  });
}

function exportPresets() {
  const data = JSON.stringify({ app: 'midigen-rhythm', version: 1, presets: userPresets }, null, 1);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = el('a');
  a.href = url;
  a.download = 'midigen-rhythm-presets.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function importPresets() {
  const input = el('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      // Accepts an exported preset file, or a single settings blob from "Copy JSON".
      const incoming = isPreset(data) ? { [data.presetName || file.name.replace(/\.json$/i, '')]: data } : data?.presets ?? data;
      const valid = Object.entries(incoming || {}).filter(([, p]) => isPreset(p));
      if (!valid.length) throw new Error('no presets found in that file');
      for (const [name, p] of valid) userPresets[name] = p;
      if (storeUserPresets()) {
        showError(null);
        renderPresetMenu();
        presetBar('info', { msg: `Imported ${valid.length} preset${valid.length === 1 ? '' : 's'}.` });
      }
    } catch (err) {
      showError(`Import presets: ${err.message}`);
    }
  };
  input.click();
}

function renderPresetMenu() {
  const sel = $('preset');
  sel.replaceChildren(new Option('Presets…', ''));
  const group = (label, entries) => {
    const g = document.createElement('optgroup');
    g.label = label;
    for (const [text, value] of entries) g.append(new Option(text, value));
    sel.append(g);
  };
  const mine = Object.keys(userPresets).sort((a, b) => a.localeCompare(b));
  group('My presets', mine.length ? mine.map((n) => [n, `u:${n}`]) : [['(none saved yet)', 'none']]);
  group('Examples', Object.keys(PRESETS).map((n) => [n, `b:${n}`]));
  const manage = [['Save current as preset…', 'act:save']];
  if (cfg.presetName && userPresets[cfg.presetName]) manage.push([`Delete “${cfg.presetName}”`, 'act:delete']);
  if (mine.length) manage.push(['Export my presets…', 'act:export']);
  manage.push(['Import presets…', 'act:import']);
  group('Manage', manage);
  sel.querySelector('option[value="none"]')?.setAttribute('disabled', '');
}

let cfg = load();
let result = null;
let final = null;
const player = new Player();

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text != null) d.textContent = text;
  return d;
};

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch { /* storage full or disabled */ }
}

function showError(msg) {
  const e = $('error');
  e.hidden = !msg;
  e.textContent = msg || '';
}

function generate({ newSeed = false, keep = null } = {}) {
  if (newSeed) cfg.seed = Math.floor(Math.random() * 1000000);
  $('seed').value = cfg.seed;
  const k = keep ?? LANES.filter((l) => cfg.lanes[l].locked);
  try {
    result = generateRhythm(cfg, { previous: result, keep: k });
    showError(null);
  } catch (err) {
    showError(err.message);
    return;
  }
  refinalize();
}

function refinalize() {
  final = finalize(result, cfg);
  render();
  save();
  if (player.playing) startPlay();
}

function render() {
  document.documentElement.style.setProperty('--cell-w', `${$('zoom').value}px`);
  renderGrid($('grid'), result, final, cfg);
  renderAnalysis($('analysis'), result, final);
  renderLaneInfo();
  renderChips();
  renderUnderstood();
  renderSummaries();
  for (const s of document.querySelectorAll('.slider')) syncSlider(s);
  const hint = $('tempo-hint');
  hint.replaceChildren();
  const m = result.meter;
  if (m.irrational || m.approx) {
    hint.append(el('div', null, `${m.text}: each 1/${m.den} note is a 1/${m.unit} sped up ×${+m.tempoScale.toFixed(4)}. `
      + `Exported as ${m.num}/${m.unit} at ${+result.playTempo.toFixed(2)} bpm (sounds identical)${m.approx ? '; fractional numerator rounded to 1/16 of a beat' : ''}.`));
  }
  if (result.tempoHint && Math.abs(result.tempoHint - cfg.tempo) > 15) {
    hint.append(`This description usually lives around ${result.tempoHint} bpm. `);
    const b = el('button', 'mini', 'use');
    b.onclick = () => { cfg.tempo = result.tempoHint; $('tempo').value = cfg.tempo; generate(); };
    hint.append(b);
  }
}

// ---------- collapsible panels ----------

function initPanels() {
  let state = {};
  try { state = JSON.parse(localStorage.getItem(UI_STORE)) || {}; } catch { /* use defaults */ }
  for (const d of document.querySelectorAll('details[data-panel]')) {
    const key = d.dataset.panel;
    if (key in state) d.open = !!state[key];
    d.addEventListener('toggle', () => {
      state[key] = d.open;
      try { localStorage.setItem(UI_STORE, JSON.stringify(state)); } catch { /* storage disabled */ }
    });
  }
}

function renderSummaries() {
  const desc = descriptorNames(cfg.descriptors).map(displayName);
  $('sum-rhythm').textContent = `${cfg.tempo} bpm · ${cfg.meter}${desc.length ? ` · ${desc.slice(0, 3).join(', ')}${desc.length > 3 ? '…' : ''}` : ''}`;

  const set = ['tension', 'density', 'humanize', 'swing', 'feet', 'hands']
    .filter((k) => cfg.overrides[k] !== null && cfg.overrides[k] !== undefined && cfg.overrides[k] !== '')
    .map((k) => `${k} ${Number(cfg.overrides[k]).toFixed(2)}`);
  $('sum-feel').textContent = set.length ? set.join(' · ') : 'all auto';

  const bars = cfg.parts.reduce((n, p) => n + (Number(p.bars) || 0), 0);
  $('sum-parts').textContent = `${cfg.parts.length} part${cfg.parts.length === 1 ? '' : 's'} · ${bars} bars · ${cfg.parts.map((p) => p.name).join(' → ')}`;

  const count = (fn) => LANES.filter((l) => fn(cfg.lanes[l])).length;
  const flags = [[count((L) => L.spec), 'custom'], [count((L) => L.locked), 'locked'], [count((L) => L.muted), 'muted']]
    .filter(([n]) => n).map(([n, label]) => `${n} ${label}`);
  $('sum-lanes').textContent = `${LANES.length} lanes${flags.length ? ` · ${flags.join(' · ')}` : ' · all auto'}`;

  $('sum-drummap').textContent = cfg.drumMap ? 'custom' : 'GM defaults';
}

// ---------- controls ----------

function syncControls() {
  $('tempo').value = cfg.tempo;
  $('meter').value = cfg.meter;
  $('resolution').value = String(cfg.resolution || 16);
  $('seed').value = cfg.seed;
  $('midi-layout').value = cfg.midiLayout === 'combined' ? 'combined' : 'tracks';
  $('descriptors').value = Array.isArray(cfg.descriptors) ? cfg.descriptors.join(', ') : cfg.descriptors;
  $('drummap').value = JSON.stringify(cfg.drumMap || DEFAULT_MAP, null, 1);
  for (const s of document.querySelectorAll('.slider')) syncSlider(s);
  renderParts();
  renderLanes();
}

function syncSlider(s) {
  const key = s.dataset.key;
  const v = cfg.overrides[key];
  const auto = v === null || v === undefined || v === '';
  s.classList.toggle('auto', auto);
  // On auto, show what the song description produced for the first part.
  const derived = result?.parts?.[0]?.params?.[key];
  const shown = auto ? derived : Number(v);
  s.querySelector('output').textContent = shown == null ? '–' : Number(shown).toFixed(2);
  if (shown != null) s.querySelector('input').value = shown;
}

function bindControls() {
  $('tempo').onchange = (e) => { cfg.tempo = Number(e.target.value) || 120; generate(); };
  $('meter').onchange = (e) => { cfg.meter = e.target.value; generate(); };
  $('resolution').onchange = (e) => { cfg.resolution = Number(e.target.value); generate(); };
  $('seed').onchange = (e) => { cfg.seed = Math.max(0, Math.floor(Number(e.target.value) || 0)); generate(); };
  const desc = $('descriptors');
  desc.onchange = () => { cfg.descriptors = desc.value; generate(); };
  desc.oninput = () => renderUnderstood(desc.value);
  desc.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); desc.blur(); } };
  $('zoom').oninput = () => render();

  for (const s of document.querySelectorAll('.slider')) {
    const input = s.querySelector('input');
    input.oninput = () => { s.querySelector('output').textContent = Number(input.value).toFixed(2); s.classList.remove('auto'); };
    input.onchange = () => { cfg.overrides[s.dataset.key] = Number(input.value); generate(); };
    s.querySelector('button').onclick = () => { cfg.overrides[s.dataset.key] = null; syncSlider(s); generate(); };
  }

  $('btn-new').onclick = () => generate({ newSeed: true });
  $('btn-regen').onclick = () => generate();
  $('btn-play').onclick = togglePlay;
  $('btn-midi').onclick = exportMidi;
  $('midi-layout').onchange = (e) => { cfg.midiLayout = e.target.value; save(); };
  $('btn-ascii').onclick = () => copy(toAscii(result), 'btn-ascii');
  $('btn-json').onclick = () => copy(JSON.stringify(cfg, null, 2), 'btn-json');
  $('btn-add-part').onclick = () => {
    cfg.parts.push(part(String.fromCharCode(65 + cfg.parts.length), 2, 'variation'));
    renderParts();
    generate();
  };

  const preset = $('preset');
  renderPresetMenu();
  $('btn-save-preset').onclick = savePresetAs;
  $('preset-cancel').onclick = () => { $('preset-bar').hidden = true; };
  $('preset-name').onkeydown = (e) => { if (e.key === 'Escape') $('preset-bar').hidden = true; };
  preset.onchange = () => {
    const v = preset.value;
    preset.value = '';
    const [kind, name] = [v.slice(0, v.indexOf(':')), v.slice(v.indexOf(':') + 1)];
    if (kind === 'act') {
      if (name === 'save') savePresetAs();
      else if (name === 'export') exportPresets();
      else if (name === 'import') importPresets();
      else if (name === 'delete') deleteCurrentPreset();
      return;
    }
    if (kind === 'b' && PRESETS[name]) { applyPreset(cfg, name); cfg.presetName = null; result = null; }
    else if (kind === 'u' && userPresets[name]) applyUserPreset(name);
    else return;
    renderPresetMenu();
    syncControls();
    generate();
  };

  $('drummap').onchange = (e) => {
    try {
      const m = JSON.parse(e.target.value);
      for (const [lane, arts] of Object.entries(m)) {
        if (!LANES.includes(lane) || typeof arts !== 'object') throw new Error(`Unknown lane "${lane}"`);
        for (const [art, n] of Object.entries(arts)) {
          if (!Number.isInteger(n) || n < 0 || n > 127) throw new Error(`${lane}.${art} must be a note number 0-127`);
        }
      }
      cfg.drumMap = m;
      showError(null);
      refinalize();
    } catch (err) {
      showError(`Drum map: ${err.message}`);
    }
  };
  $('btn-map-reset').onclick = () => { cfg.drumMap = null; $('drummap').value = JSON.stringify(DEFAULT_MAP, null, 1); refinalize(); };

  const help = $('help');
  for (const [code, text] of LANE_SPEC_HELP) {
    const tr = el('tr');
    const c = el('td');
    c.append(el('code', null, code));
    tr.append(c, el('td', null, text));
    help.append(tr);
  }

  $('grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    const row = e.target.closest('[data-lane]');
    if (cell && row) editCell(row.dataset.lane, Number(cell.dataset.t), e.shiftKey);
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'n') generate({ newSeed: true });
    else if (e.key === 'r') generate();
  });
}

function setDescriptors(text) {
  cfg.descriptors = text;
  $('descriptors').value = text;
  generate();
}

function tidy(text) {
  return text.replace(/\s*,(\s*,)+/g, ',').replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s{2,}/g, ' ');
}

function renderChips() {
  const parsed = interpretDescriptors(cfg.descriptors);
  const on = new Set(parsed.items.filter((it) => !it.negate).map((it) => it.name));
  const chips = $('chips');
  chips.replaceChildren();
  for (const [group, names] of DESCRIPTOR_GROUPS) {
    const row = el('div', 'chip-group');
    row.append(el('span', 'chip-label', group));
    for (const name of names) {
      const c = el('span', `chip${on.has(name) ? ' on' : ''}`, displayName(name));
      c.onclick = () => {
        const text = String(cfg.descriptors || '');
        if (on.has(name)) {
          const spans = parsed.items.filter((it) => it.name === name && !it.negate).sort((a, b) => b.start - a.start);
          let out = text;
          for (const s of spans) out = out.slice(0, s.start) + out.slice(s.end);
          setDescriptors(tidy(out));
        } else {
          setDescriptors(tidy(`${text}, ${displayName(name)}`));
        }
      };
      row.append(c);
    }
    chips.append(row);
  }
}

function understoodLine(box, parsed, emptyText) {
  box.replaceChildren();
  const said = describeItems(parsed.items);
  if (!said.length && !parsed.unknown.length && parsed.tempo == null && !Object.keys(parsed.overrides).length) {
    if (emptyText) box.append(el('span', 'u-empty', emptyText));
    return;
  }
  box.append(el('span', 'u-label', 'Heard:'));
  parsed.items.forEach((it, i) => box.append(el('span', `u-item${it.negate ? ' neg' : ''}${it.weight > 1.05 ? ' strong' : it.weight < 0.95 ? ' weak' : ''}`, said[i])));
  for (const [k, v] of Object.entries(parsed.overrides)) box.append(el('span', 'u-item', `${k} = ${v}`));
  if (parsed.tempo != null) box.append(el('span', 'u-item', `${parsed.tempo} bpm`));
  if (parsed.unknown.length) box.append(el('span', 'u-unknown', `didn't recognize: ${parsed.unknown.map((u) => u.word).join(', ')}`));
}

function renderUnderstood(text = cfg.descriptors) {
  understoodLine($('understood'), interpretDescriptors(text), 'Nothing yet: describe genre, feel, kick style, dynamics… or pick from the list below.');
}

function renderParts() {
  const box = $('parts');
  box.replaceChildren();
  cfg.parts.forEach((p, i) => {
    const row = el('div', 'part-row');
    const name = el('input');
    name.value = p.name;
    name.title = 'Part name';
    name.onchange = () => { p.name = name.value; generate(); };
    const bars = el('input');
    bars.type = 'number'; bars.min = 1; bars.max = 64; bars.value = p.bars; bars.title = 'Bars';
    bars.onchange = () => { p.bars = Math.max(1, Math.min(64, Number(bars.value) || 1)); generate(); };
    const role = el('select');
    for (const r of ROLES) role.append(new Option(r, r));
    role.value = p.role;
    role.onchange = () => { p.role = role.value; generate(); };
    const rm = el('button', 'mini', '×');
    rm.title = 'Remove part';
    rm.disabled = cfg.parts.length <= 1;
    rm.onclick = () => { cfg.parts.splice(i, 1); renderParts(); result = null; generate(); };
    const extra = el('div', 'part-extra');
    const desc = el('input');
    desc.placeholder = 'how this part differs, e.g. busier, loud hands';
    desc.value = p.descriptors || '';
    const heard = el('div', 'understood small');
    const showHeard = () => understoodLine(heard, interpretDescriptors(desc.value, 1.5), '');
    desc.oninput = showHeard;
    desc.onchange = () => { p.descriptors = desc.value; generate(); };
    const tension = el('input');
    tension.type = 'number'; tension.min = 0; tension.max = 1; tension.step = 0.05;
    tension.placeholder = 'tension';
    tension.title = 'Tension 0–1 (blank = from the description)';
    tension.value = p.tension ?? '';
    tension.onchange = () => { p.tension = tension.value; generate(); };
    extra.append(desc, tension, heard);
    showHeard();
    row.append(name, bars, role, rm, extra);
    box.append(row);
  });
}

function renderLaneNlp(lane, text) {
  const box = $(`nlp-${lane}`);
  if (!box) return;
  box.replaceChildren();
  if (!text || !text.trim()) return;
  const spec = parseLaneSpec(text, lane);
  if (spec.understood.length) {
    box.append(el('span', 'u-label', 'Heard:'));
    for (const u of spec.understood) box.append(el('span', 'u-item', u));
  }
  if (spec.warnings.length) box.append(el('span', 'u-unknown', spec.warnings.join('; ')));
}

function renderLanes() {
  const box = $('lanes');
  box.replaceChildren();
  for (const lane of GEN_ORDER) {
    const L = cfg.lanes[lane];
    const wrap = el('div', 'lane');
    wrap.dataset.lane = lane;
    const head = el('div', 'lane-head');
    const spec = el('input');
    spec.placeholder = lane === 'kick' ? 'auto · try "double bass"' : lane === 'snare' ? 'auto · try "backbeat, ghosts"' : 'auto';
    spec.value = L.spec;
    spec.title = 'Describe this lane in plain English or the lane language (see "Lane language")';
    spec.oninput = () => renderLaneNlp(lane, spec.value);
    spec.onchange = () => { L.spec = spec.value; L.locked = false; renderLanes(); generate(); };
    const mute = el('button', `mini${L.muted ? ' on' : ''}`, 'M');
    mute.title = 'Mute (excluded from playback and MIDI)';
    mute.onclick = () => { L.muted = !L.muted; mute.classList.toggle('on', L.muted); refinalize(); };
    const lock = el('button', `mini${L.locked ? ' on' : ''}`, 'lock');
    lock.title = 'Keep this lane when regenerating';
    lock.onclick = () => { L.locked = !L.locked; lock.classList.toggle('on', L.locked); save(); renderSummaries(); };
    const roll = el('button', 'mini', 're-roll');
    roll.title = 'Regenerate only this lane, in context of the others';
    roll.onclick = () => {
      L.salt = (L.salt || 0) + 1;
      L.locked = false;
      lock.classList.remove('on');
      generate({ keep: LANES.filter((l) => l !== lane) });
    };
    head.append(el('span', null, LANE_LABELS[lane]), spec, mute, lock, roll);
    const nlp = el('div', 'understood small');
    nlp.id = `nlp-${lane}`;
    const info = el('div', 'lane-info');
    info.id = `info-${lane}`;
    wrap.append(head, nlp, info);
    box.append(wrap);
    renderLaneNlp(lane, L.spec);
  }
}

function renderLaneInfo() {
  for (const lane of LANES) {
    const box = $(`info-${lane}`);
    if (!box) continue;
    const algos = [...new Set(result.parts.map((p) => p.info[lane]?.algo).filter(Boolean))];
    const first = result.parts.find((p) => p.info[lane] && !p.info[lane].algo.startsWith('motif'))?.info[lane];
    box.replaceChildren(el('b', null, algos.join(' / ')));
    if (first?.detail) box.append(` — ${first.detail}`);
    box.title = result.parts.map((p) => `${p.name}: ${p.info[lane]?.algo} ${p.info[lane]?.detail || ''}`).join('\n');
    const lockBtn = box.parentElement.querySelector('.lane-head button:nth-of-type(2)');
    lockBtn?.classList.toggle('on', !!cfg.lanes[lane].locked);
  }
}

function editCell(lane, t, shift) {
  const p = result.parts.find((x) => t >= x.start && t < x.start + x.len);
  if (!p) return;
  const i = t - p.start;
  const arr = p.lanes[lane];
  const arts = ARTS[lane];
  if (shift) {
    if (arr[i]) arr[i] = { ...arr[i], art: arts[(arts.indexOf(arr[i].art) + 1) % arts.length] };
    else arr[i] = { s: 0.85, art: arts[0] };
  } else {
    arr[i] = arr[i] ? null : { s: 0.85, art: DEFAULT_ART[lane] };
  }
  p.base[lane][i] = arr[i] && { ...arr[i] };
  cfg.lanes[lane].locked = true;
  refinalize();
}

// ---------- output ----------

function startPlay() {
  player.play({
    events: final.events, tempo: result.playTempo ?? result.tempo, ppq: TPQ,
    totalTicks: result.total * final.tpt, totalTatums: result.total,
  }, (pos) => {
    const ph = $('playhead');
    ph.hidden = false;
    const labelW = 120;
    ph.style.left = `${labelW + pos * Number($('zoom').value)}px`;
  });
  $('btn-play').textContent = 'Stop';
}

function togglePlay() {
  if (player.playing) {
    player.stop();
    $('playhead').hidden = true;
    $('btn-play').textContent = 'Play';
  } else if (final) startPlay();
}

function fileName() {
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const desc = slug(descriptorNames(cfg.descriptors).slice(0, 3).map(displayName).join('-')) || 'rhythm';
  return `${desc}_${slug(result.meter.text)}_${result.tempo}bpm_s${cfg.seed}.mid`;
}

function exportMidi() {
  if (!result) return;
  const bytes = writeMidi({
    events: final.events, tempo: result.playTempo ?? result.tempo, meter: result.meter, parts: result.parts,
    lanes: GEN_ORDER, labels: LANE_LABELS, ppq: TPQ, tpt: final.tpt, totalTatums: result.total,
    title: `midigen ${descriptorNames(cfg.descriptors).map(displayName).join(' ')} seed ${cfg.seed}`,
    combine: cfg.midiLayout === 'combined',
  });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
  const a = el('a');
  a.href = url;
  a.download = fileName();
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function copy(text, btnId) {
  const b = $(btnId);
  const label = b.textContent;
  try {
    await navigator.clipboard.writeText(text);
    b.textContent = 'Copied';
  } catch {
    b.textContent = 'Copy failed';
  }
  setTimeout(() => (b.textContent = label), 1200);
}

function flash(btnId, text) {
  const b = $(btnId);
  const label = b.textContent;
  b.textContent = text;
  setTimeout(() => (b.textContent = label), 1200);
}

initPanels();
bindControls();
syncControls();
generate();
