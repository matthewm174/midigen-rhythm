import { LANES, LANE_LABELS, DEFAULT_MAP, DEFAULT_ART } from '../core/drummap.js';
import { DESCRIPTOR_GROUPS, ROLES, interpretDescriptors, describeItems, displayName, descriptorNames } from '../core/descriptors.js';
import { LANE_SPEC_HELP, parseLaneSpec } from '../core/lanespec.js';
import { generateRhythm } from '../engine/generate.js';
import { finalize, TPQ } from '../engine/finalize.js';
import { writeMidi } from '../io/midi.js';
import { importMidi } from '../io/midiread.js';
import { toAscii } from '../io/ascii.js';
import { renderGrid, renderAnalysis } from './grid.js';
import { Player } from './audio.js';
import { generateHarmony, harmonySnapshot, defaultHarmonyCfg, normalizeHarmonyCfg, VOICES, PITCHED, VOICE_LABELS } from '../harmony/generate.js';
import { finalizeHarmony } from '../harmony/finalize.js';
import { interpretHarmony, H_GROUPS, hDisplayName, parseVoiceSpec } from '../harmony/styles.js';
import { SCALES } from '../harmony/scales.js';
import { TUNINGS, KEY_NAMES } from '../harmony/tuning.js';
import { GM_PROGRAMS } from '../harmony/gm.js';

const STORE = 'midigen-rhythm-cfg-v1';
const UI_STORE = 'midigen-rhythm-ui-v1';
const GEN_ORDER = ['kick', 'snare', 'hihat', 'ride', 'toms', 'cymbals', 'crash'];
const ARTS = Object.fromEntries(Object.entries(DEFAULT_MAP).map(([lane, m]) => [lane, Object.keys(m)]));

const part = (name, bars, role, descriptors = '', tension = '') => ({ name, bars, role, descriptors, tension });
const STD_PARTS = [part('A', 4, 'groove'), part("A'", 4, 'variation'), part('B', 2, 'contrast'), part('turn', 1, 'fill')];

// Presets are styles only. Meter, tempo and grid follow from the style (unless set by hand), the parts and the
// description are kept, so the description keeps modifying whichever style is loaded.
const PRESETS = {
  Metal: { style: 'metal' },
  'Hard rock': { style: 'hard rock, heavy, in E' },
  'Doom': { style: 'doom metal' },
  Djent: { style: 'djent, math' },
  Grindcore: { style: 'grindcore' },
  Punk: { style: 'punk' },
  Funk: { style: 'funk, groove' },
  Jazz: { style: 'jazz, ride, walking bass' },
  Blues: { style: 'blues, shuffle' },
  Synthwave: { style: 'synthwave, four on the floor' },
  Tribal: { style: 'tribal, polymetric' },
  'Polymetric pocket': { style: 'musical, groove, polymetric' },
  'Hypnotic ritual': { style: 'ritual, hypnotic, phasing' },
  'Crystal chaos': { style: 'chaotic, crystalline, polyrhythmic' },
  Baroque: { style: 'baroque, soft' },
  Waltz: { style: 'waltz, romantic' },
  'Celtic jig': { style: 'celtic, jig' },
  Flamenco: { style: 'flamenco' },
  'Gregorian chant': { style: 'gregorian chant, in D dorian, sparse', mute: true },
  'Maqam (microtonal)': { style: 'maqam bayati, tribal, microtonal' },
  'Spec example': { style: 'downbeat, tribal', lanes: { hihat: 'grid 1/8, accent &', kick: 'group 3/16 from each 1' } },
};

function defaultCfg() {
  return applyPreset({ seed: 1, overrides: {}, lanes: {}, drumMap: null, descriptors: '', parts: STD_PARTS.map((x) => ({ ...x })) }, 'Tribal');
}

function applyPreset(cfg, name) {
  const p = PRESETS[name];
  cfg.style = p.style;
  cfg.tempo = 'auto';
  cfg.meter = 'auto';
  cfg.resolution = 'auto';
  cfg.parts ||= STD_PARTS.map((x) => ({ ...x }));
  cfg.overrides = {};
  cfg.lanes = Object.fromEntries(LANES.map((l) => [l, { spec: p.lanes?.[l] || '', locked: false, muted: !!p.mute, salt: 0 }]));
  cfg.harmony = normalizeHarmonyCfg({ ...defaultHarmonyCfg(), descriptors: cfg.harmony?.descriptors || '' });
  return cfg;
}

function normalizeCfg(c) {
  c.lanes = c.lanes || {};
  for (const l of LANES) c.lanes[l] = { spec: '', locked: false, muted: false, salt: 0, ...c.lanes[l] };
  c.overrides = c.overrides || {};
  // Settings from before styles existed carried the whole style in the description: that becomes the style.
  if (c.style === undefined) { c.style = c.descriptors || ''; c.descriptors = ''; }
  c.descriptors ??= '';
  c.harmony = normalizeHarmonyCfg(c.harmony);
  return c;
}

const isAuto = (v) => v === null || v === undefined || v === '' || v === 'auto';
// Style plus description, for names and titles.
const songText = () => [cfg.style, cfg.descriptors].filter((s) => s && String(s).trim()).join(', ');

function load() {
  try {
    const c = JSON.parse(localStorage.getItem(STORE));
    if (c && Array.isArray(c.parts) && c.lanes) return normalizeCfg(c);
  } catch { /* fall through to defaults */ }
  return defaultCfg();
}

// ---------- user presets ----------

const PRESET_STORE = 'midigen-rhythm-presets-v1';
const PRESET_KEYS = ['tempo', 'meter', 'resolution', 'style', 'descriptors', 'parts', 'overrides', 'seed', 'lanes', 'drumMap', 'midiLayout', 'harmony'];
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
      barLen: result.meter.barLen, resolution: result.meter.resolution, text: result.meter.text,
      parts: result.parts.map((p) => ({ len: p.len, lanes: pick(p.lanes), base: pick(p.base), info: pick(p.info) })),
    }));
  }
  if (result?.harmony && VOICES.some((v) => cfg.harmony.voices[v].locked)) snap.harmonyPinned = harmonySnapshot(result.harmony);
  return snap;
}

function applyUserPreset(name) {
  const { pinned, harmonyPinned, ...rest } = JSON.parse(JSON.stringify(userPresets[name]));
  for (const k of PRESET_KEYS) if (rest[k] !== undefined) cfg[k] = rest[k];
  // Presets saved before styles existed carried everything in the description.
  if (rest.style === undefined) { cfg.style = rest.descriptors || ''; cfg.descriptors = ''; }
  normalizeCfg(cfg);
  cfg.presetName = name;
  // Locked lanes and voices are restored from the snapshot through the normal "keep" path.
  result = pinned ? { meter: { barLen: pinned.barLen, resolution: pinned.resolution, text: pinned.text }, parts: pinned.parts } : null;
  if (harmonyPinned) (result ||= { meter: {}, parts: [] }).harmony = harmonyPinned;
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
  const suggested = cfg.presetName || descriptorNames(songText()).slice(0, 3).map(displayName).join(' ') || 'My rhythm';
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

function generate({ newSeed = false, keep = null, hkeep = null } = {}) {
  if (newSeed) cfg.seed = Math.floor(Math.random() * 1000000);
  $('seed').value = cfg.seed;
  const k = keep ?? LANES.filter((l) => cfg.lanes[l].locked);
  const hk = hkeep ?? VOICES.filter((v) => cfg.harmony.voices[v].locked);
  try {
    const prevH = result?.harmony || null;
    result = generateRhythm(cfg, { previous: result, keep: k });
    result.harmony = generateHarmony(cfg, result, { previous: prevH, keep: hk });
    showError(null);
  } catch (err) {
    showError(err.message);
    return;
  }
  refinalize();
}

// Re-run only the pitched voices (after a drum edit, so the bass follows the new kick).
function regenHarmony(hkeep = null) {
  try {
    result.harmony = generateHarmony(cfg, result, { previous: result.harmony, keep: hkeep ?? VOICES.filter((v) => cfg.harmony.voices[v].locked) });
  } catch (err) {
    showError(err.message);
  }
}

function refinalize() {
  final = finalize(result, cfg);
  final.pitched = finalizeHarmony(result, cfg, final.tpt);
  render();
  save();
  if (player.playing) startPlay();
}

function render() {
  document.documentElement.style.setProperty('--cell-w', `${$('zoom').value}px`);
  renderGrid($('grid'), result, final, cfg);
  renderAnalysis($('analysis'), result, final);
  renderLaneInfo();
  renderVoiceInfo();
  renderChips();
  renderHarmonyChips();
  renderUnderstood();
  renderStyleUnderstood();
  renderHarmonyUnderstood();
  renderSummaries();
  for (const s of document.querySelectorAll('.slider')) syncSlider(s);
  const hint = $('tempo-hint');
  hint.replaceChildren();
  const m = result.meter;
  if (m.irrational || m.approx) {
    hint.append(el('div', null, `${m.text}: each 1/${m.den} note is a 1/${m.unit} sped up ×${+m.tempoScale.toFixed(4)}. `
      + `Exported as ${m.num}/${m.unit} at ${+result.playTempo.toFixed(2)} bpm (sounds identical)${m.approx ? '; fractional numerator rounded to 1/16 of a beat' : ''}.`));
  }
  // Auto fields show what the style decided; explicit ones get a nudge if the style usually lives elsewhere.
  const rs = result.resolved || {};
  $('tempo').placeholder = `auto · ${result.tempo}`;
  $('meter').placeholder = `auto · ${m.text}`;
  $('resolution').options[0].textContent = `auto · 1/${m.resolution}`;
  const tempoHint = result.tempoHint ?? result.harmony?.tempoHint;
  if (rs.sources?.tempo === 'set' && tempoHint && Math.abs(tempoHint - result.tempo) > 15) {
    hint.append(`This style usually lives around ${tempoHint} bpm. `);
    const b = el('button', 'mini', 'auto');
    b.onclick = () => { cfg.tempo = 'auto'; $('tempo').value = ''; generate(); };
    hint.append(b);
  }
  const hh = $('h-hint');
  hh.replaceChildren();
  const h = result.harmony;
  if (h && h.drumless > 0.6 && LANES.some((l) => !cfg.lanes[l].muted)) {
    hh.append('This style is usually played without drums. ');
    const b = el('button', 'mini', 'mute drums');
    b.onclick = () => { for (const l of LANES) cfg.lanes[l].muted = true; renderLanes(); refinalize(); };
    hh.append(b);
  }
  if (h?.micro) hh.append(el('div', null, `Microtones on: ${h.tuningName}. Exported with per-note pitch bend (±2 semitones) spread across channels, so use a multi-timbral or MPE-capable instrument.`));
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
  const desc = descriptorNames(songText()).map(displayName);
  const auto = (k) => (isAuto(cfg[k]) ? ' (auto)' : '');
  $('sum-rhythm').textContent = `${result ? result.tempo : cfg.tempo} bpm${auto('tempo')} · ${result ? result.meter.text : cfg.meter}${auto('meter')}${desc.length ? ` · ${desc.slice(0, 3).join(', ')}${desc.length > 3 ? '…' : ''}` : ''}`;

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

  const h = result?.harmony;
  const hf = VOICES.filter((v) => cfg.harmony.voices[v].locked).length;
  $('sum-harmony').textContent = h ? `${h.keyName} ${h.scaleName.replace(/ \(.*\)$/, '')}${h.micro ? ` · ${h.tuningName}` : ''} · ${h.grammar}${hf ? ` · ${hf} locked` : ''}` : '';
}

// ---------- controls ----------

function syncControls() {
  $('tempo').value = isAuto(cfg.tempo) ? '' : cfg.tempo;
  $('meter').value = isAuto(cfg.meter) ? '' : cfg.meter;
  $('resolution').value = isAuto(cfg.resolution) ? 'auto' : String(cfg.resolution);
  $('style').value = cfg.style || '';
  $('seed').value = cfg.seed;
  $('midi-layout').value = ['tracks', 'combined', 'drums', 'harmony'].includes(cfg.midiLayout) ? cfg.midiLayout : 'tracks';
  $('descriptors').value = Array.isArray(cfg.descriptors) ? cfg.descriptors.join(', ') : cfg.descriptors;
  $('drummap').value = JSON.stringify(cfg.drumMap || DEFAULT_MAP, null, 1);
  for (const s of document.querySelectorAll('.slider')) syncSlider(s);
  syncHarmonyControls();
  renderParts();
  renderLanes();
  renderVoices();
}

function syncHarmonyControls() {
  const H = cfg.harmony;
  const key = $('h-key');
  if (!key.options.length) {
    key.append(new Option('auto', 'auto'));
    for (const k of KEY_NAMES) key.append(new Option(k, k));
  }
  key.value = KEY_NAMES.includes(H.key) ? H.key : 'auto';
  const micro = H.microtones;
  $('h-micro').value = ['auto', 'off', 'on'].includes(micro) ? micro : 'auto';
  const scale = $('h-scale');
  scale.replaceChildren(new Option('auto (from style)', 'auto'));
  const groups = {};
  for (const [id, s] of Object.entries(SCALES)) (groups[s.group] ||= []).push([id, s]);
  for (const [g, list] of Object.entries(groups)) {
    const og = document.createElement('optgroup');
    og.label = g + (g === 'Microtonal' && micro === 'off' ? ' (needs microtones)' : '');
    for (const [id, s] of list) {
      const o = new Option(s.name, id);
      if (s.micro && micro === 'off') o.disabled = true;
      og.append(o);
    }
    scale.append(og);
  }
  scale.value = SCALES[H.scale] ? H.scale : 'auto';
  const tun = $('h-tuning');
  tun.replaceChildren(new Option('auto (from style)', 'auto'));
  for (const [id, t] of Object.entries(TUNINGS)) tun.append(new Option(t.name, id));
  tun.value = TUNINGS[H.tuning] ? H.tuning : 'auto';
  tun.disabled = micro === 'off';
  $('h-desc').value = H.descriptors || '';
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
  // Empty = auto (decided by the style).
  $('tempo').onchange = (e) => { const v = Number(e.target.value); cfg.tempo = e.target.value.trim() && v > 0 ? v : 'auto'; generate(); };
  $('meter').onchange = (e) => { cfg.meter = e.target.value.trim() || 'auto'; generate(); };
  $('resolution').onchange = (e) => { cfg.resolution = e.target.value === 'auto' ? 'auto' : Number(e.target.value); generate(); };
  const style = $('style');
  liveText(style, () => cfg.style, (v) => { cfg.style = v; cfg.styleName = null; }, renderStyleUnderstood);
  $('seed').onchange = (e) => { cfg.seed = Math.max(0, Math.floor(Number(e.target.value) || 0)); generate(); };
  const desc = $('descriptors');
  liveText(desc, () => cfg.descriptors, (v) => { cfg.descriptors = v; }, renderUnderstood);
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
  $('btn-open').onclick = openMidi;
  document.addEventListener('dragover', (e) => {
    if (![...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) return;
    e.preventDefault();
    document.body.classList.add('drop-target');
  });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('drop-target'); });
  document.addEventListener('drop', (e) => {
    document.body.classList.remove('drop-target');
    const f = [...(e.dataTransfer?.files || [])].find((x) => /\.(mid|midi|smf)$/i.test(x.name));
    if (!f) return;
    e.preventDefault();
    loadMidiFile(f);
  });

  $('h-key').onchange = (e) => { cfg.harmony.key = e.target.value; generate(); };
  $('h-scale').onchange = (e) => { cfg.harmony.scale = e.target.value; generate(); };
  $('h-micro').onchange = (e) => { cfg.harmony.microtones = e.target.value; syncHarmonyControls(); generate(); };
  $('h-tuning').onchange = (e) => { cfg.harmony.tuning = e.target.value; generate(); };
  const hd = $('h-desc');
  liveText(hd, () => cfg.harmony.descriptors, (v) => { cfg.harmony.descriptors = v; }, renderHarmonyUnderstood);
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
    if (kind === 'b' && PRESETS[name]) { applyPreset(cfg, name); cfg.presetName = null; cfg.styleName = name; result = null; }
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

// Description boxes apply as you type (after a short pause), on Enter, and on leaving the box.
function liveText(box, get, set, heard) {
  let timer = null;
  const apply = () => {
    clearTimeout(timer);
    if (box.value === (get() || '')) return;
    set(box.value);
    generate();
  };
  box.oninput = () => { heard(box.value); clearTimeout(timer); timer = setTimeout(apply, 700); };
  box.onchange = apply;
  box.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); apply(); } };
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
  const fromStyle = interpretDescriptors(cfg.style);
  const live = (p) => new Set(p.items.filter((it) => !it.negate).map((it) => it.name));
  const inDesc = live(parsed), inStyle = live(fromStyle);
  const chips = $('chips');
  chips.replaceChildren();
  for (const [group, names] of DESCRIPTOR_GROUPS) {
    const row = el('div', 'chip-group');
    row.append(el('span', 'chip-label', group));
    for (const name of names) {
      const on = inDesc.has(name) || inStyle.has(name);
      const c = el('span', `chip${on ? ' on' : ''}${inStyle.has(name) && !inDesc.has(name) ? ' style' : ''}`, displayName(name));
      if (inStyle.has(name)) c.title = 'From the style';
      // Chips add to the description (which modifies the style); turning one off removes it from wherever it is.
      c.onclick = () => {
        const strip = (text, p) => {
          let out = String(text || '');
          for (const s of p.items.filter((it) => it.name === name && !it.negate).sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + out.slice(s.end);
          return tidy(out);
        };
        if (inDesc.has(name)) setDescriptors(strip(cfg.descriptors, parsed));
        else if (inStyle.has(name)) { cfg.style = strip(cfg.style, fromStyle); $('style').value = cfg.style; generate(); }
        else setDescriptors(tidy(`${cfg.descriptors || ''}, ${displayName(name)}`));
      };
      row.append(c);
    }
    chips.append(row);
  }
}

function understoodLine(box, parsed, emptyText, harm = null) {
  box.replaceChildren();
  const said = describeItems(parsed.items);
  const hItems = harm?.items || [];
  if (!said.length && !hItems.length && !harm?.key && !parsed.meter && !parsed.unknown.length && parsed.tempo == null && !Object.keys(parsed.overrides).length) {
    if (emptyText) box.append(el('span', 'u-empty', emptyText));
    return;
  }
  box.append(el('span', 'u-label', 'Heard:'));
  parsed.items.forEach((it, i) => box.append(el('span', `u-item${it.negate ? ' neg' : ''}${it.weight > 1.05 ? ' strong' : it.weight < 0.95 ? ' weak' : ''}`, said[i])));
  if (harm?.key) box.append(el('span', 'u-item harm', `♪ key ${KEY_NAMES[harm.key.pc]}`));
  for (const it of hItems) {
    const amt = Math.abs(it.weight - 1) < 0.05 ? '' : ` ×${it.weight.toFixed(1)}`;
    const b = el('span', `u-item harm${it.negate ? ' neg' : ''}`, `♪ ${it.negate ? 'no ' : ''}${hDisplayName(it.name)}${amt}`);
    b.title = 'Harmony & melody';
    box.append(b);
  }
  for (const [k, v] of Object.entries(parsed.overrides)) box.append(el('span', 'u-item', `${k} = ${v}`));
  if (harm) for (const [k, v] of Object.entries(harm.overrides)) box.append(el('span', 'u-item harm', `♪ ${k} = ${v}`));
  if (parsed.tempo != null) box.append(el('span', 'u-item', `${parsed.tempo} bpm`));
  if (parsed.meter) box.append(el('span', 'u-item', `meter ${parsed.meter}`));
  // Only words that neither the drums nor the harmony understood.
  const unknown = harm ? parsed.unknown.filter((u) => harm.unknown.some((x) => x.start === u.start)) : parsed.unknown;
  if (unknown.length) box.append(el('span', 'u-unknown', `didn't recognize: ${unknown.map((u) => u.word).join(', ')}`));
}

function renderUnderstood(text = cfg.descriptors) {
  const empty = cfg.style ? `Type changes to the ${cfg.styleName || 'style'}: "swing", "slower", "in 7/8", "no double bass", "jazzier"…` : 'Describe genre, era, feel, kick style, dynamics… or pick from the lists.';
  understoodLine($('understood'), interpretDescriptors(text, 1.3), empty, interpretHarmony(text, 1.3));
}

function renderStyleUnderstood(text = cfg.style) {
  understoodLine($('style-understood'), interpretDescriptors(text), '', interpretHarmony(text));
}

function renderHarmonyUnderstood(text = cfg.harmony.descriptors) {
  const box = $('h-understood');
  const h = interpretHarmony(text, 1.2);
  understoodLine(box, { items: [], overrides: {}, unknown: h.unknown, tempo: null }, '', h);
}

function renderHarmonyChips() {
  const songH = interpretHarmony(cfg.descriptors, 1.3);
  const ownH = interpretHarmony(cfg.harmony.descriptors);
  const styleH = interpretHarmony(cfg.style);
  const on = new Set([...styleH.items, ...songH.items, ...ownH.items].filter((it) => !it.negate).map((it) => it.name));
  const box = $('h-chips');
  box.replaceChildren();
  const groups = [...H_GROUPS, ['Scales & modes', Object.keys(SCALES).map((id) => `scale:${id}`)]];
  for (const [group, names] of groups) {
    const row = el('div', 'chip-group');
    row.append(el('span', 'chip-label', group));
    for (const name of names) {
      const c = el('span', `chip${on.has(name) ? ' on' : ''}`, hDisplayName(name));
      c.onclick = () => {
        if (on.has(name)) {
          const strip = (text, parsed) => {
            let out = String(text || '');
            for (const s of parsed.items.filter((it) => it.name === name && !it.negate).sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + out.slice(s.end);
            return tidy(out);
          };
          cfg.style = strip(cfg.style, styleH);
          cfg.descriptors = strip(cfg.descriptors, songH);
          cfg.harmony.descriptors = strip(cfg.harmony.descriptors, ownH);
          $('style').value = cfg.style;
          $('descriptors').value = cfg.descriptors;
        } else cfg.harmony.descriptors = tidy(`${cfg.harmony.descriptors || ''}, ${hDisplayName(name)}`);
        $('h-desc').value = cfg.harmony.descriptors;
        generate();
      };
      row.append(c);
    }
    box.append(row);
  }
}

function renderVoices() {
  const box = $('voices');
  box.replaceChildren();
  for (const v of VOICES) {
    const V = cfg.harmony.voices[v];
    const wrap = el('div', 'voice');
    wrap.dataset.voice = v;
    const head = el('div', 'voice-head');
    const spec = el('input');
    spec.placeholder = { progression: 'auto · or a chart: i bVI III bVII · Am F C G', bass: 'auto · walking, pedal, octave…', comp: 'auto · pad, strum, arpeggio, power…', melody: 'auto · lyric, riff, chant, busy, high…' }[v];
    spec.value = V.spec;
    spec.title = v === 'progression' ? 'Roman numerals (I, bVII, V7/V, ii°), chord symbols (Am7, F#m7b5, C/E) or scale degrees 1-7, cycled over the chord slots' : 'Style and modifiers for this voice';
    const nlp = el('div', 'understood small');
    const showNlp = () => {
      nlp.replaceChildren();
      const s = parseVoiceSpec(v, spec.value);
      if (s.understood.length) { nlp.append(el('span', 'u-label', 'Heard:')); for (const u of s.understood) nlp.append(el('span', 'u-item harm', u)); }
      if (s.warnings.length) nlp.append(el('span', 'u-unknown', s.warnings.join('; ')));
    };
    spec.oninput = showNlp;
    spec.onchange = () => { V.spec = spec.value; V.locked = false; renderVoices(); generate(); };
    let progSel = el('span');
    if (v !== 'progression') {
      progSel = el('select');
      progSel.title = 'General MIDI instrument for this voice';
      progSel.append(new Option('auto instrument', ''));
      GM_PROGRAMS.forEach((name, i) => progSel.append(new Option(`${i} ${name}`, String(i))));
      progSel.value = V.program == null || V.program === '' ? '' : String(V.program);
      progSel.onchange = () => { V.program = progSel.value === '' ? null : Number(progSel.value); regenHarmony(VOICES); refinalize(); };
    }
    const mute = el('button', `mini${V.muted ? ' on' : ''}`, 'M');
    mute.title = 'Mute (excluded from playback and MIDI)';
    if (v === 'progression') mute.style.visibility = 'hidden';
    mute.onclick = () => { V.muted = !V.muted; mute.classList.toggle('on', V.muted); refinalize(); };
    const lock = el('button', `mini${V.locked ? ' on' : ''}`, 'lock');
    lock.title = 'Keep this voice when regenerating';
    lock.onclick = () => { V.locked = !V.locked; lock.classList.toggle('on', V.locked); save(); renderSummaries(); };
    const roll = el('button', 'mini', 're-roll');
    roll.title = v === 'progression' ? 'New chords (unlocked voices follow them)' : 'Regenerate only this voice, over the same chords and drums';
    roll.onclick = () => {
      V.salt = (V.salt || 0) + 1;
      V.locked = false;
      const keepV = v === 'progression' ? VOICES.filter((x) => x !== v && cfg.harmony.voices[x].locked) : VOICES.filter((x) => x !== v && !(v === 'melody' && x === 'comp' && result?.harmony?.styles?.comp === 'organum'));
      regenHarmony(keepV);
      refinalize();
    };
    head.append(el('span', null, VOICE_LABELS[v]), spec, mute, lock, roll);
    const info = el('div', 'lane-info');
    info.id = `vinfo-${v}`;
    wrap.append(head);
    if (v !== 'progression') wrap.append(progSel);
    wrap.append(nlp, info);
    box.append(wrap);
    showNlp();
  }
}

function renderVoiceInfo() {
  const h = result?.harmony;
  for (const v of VOICES) {
    const box = $(`vinfo-${v}`);
    if (!box || !h) continue;
    const first = h.parts[0]?.info[v];
    if (v === 'progression') box.replaceChildren(el('b', null, h.parts.map((p) => p.prog.chords.map((c) => c.sym).join(' ')).join(' ‖ ')));
    else box.replaceChildren(el('b', null, [...new Set(h.parts.map((p) => p.info[v]?.style).filter(Boolean))].join(' / ')), ` — ${first?.detail || ''}${v !== 'progression' ? ` · ${GM_PROGRAMS[h.programs[v]]}` : ''}`);
    box.title = h.parts.map((p) => `${p.name}: ${p.info[v]?.detail || ''}`).join('\n');
    const lockBtn = box.parentElement.querySelector('.voice-head button:nth-of-type(2)');
    lockBtn?.classList.toggle('on', !!cfg.harmony.voices[v].locked);
  }
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
    const showHeard = () => understoodLine(heard, interpretDescriptors(desc.value, 1.5), '', interpretHarmony(desc.value, 1.5));
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
  regenHarmony();
  refinalize();
}

// ---------- output ----------

function startPlay() {
  player.play({
    events: [...final.events, ...(final.pitched || [])], tempo: result.playTempo ?? result.tempo, ppq: TPQ,
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
  const words = [...descriptorNames(songText()).map(displayName), ...new Set(interpretHarmony(songText()).items.filter((it) => !it.negate).map((it) => hDisplayName(it.name)))];
  const desc = slug([...new Set(words)].slice(0, 3).join('-')) || 'rhythm';
  const key = result.harmony ? `_${slug(`${result.harmony.keyName}-${result.harmony.scale}`)}` : '';
  return `${desc}_${slug(result.meter.text)}_${result.tempo}bpm${key}_s${cfg.seed}.mid`;
}

// Everything needed to bring the song back exactly (settings plus every hit and note).
function stateSnapshot() {
  return {
    app: 'midigen', version: 1, cfg: JSON.parse(JSON.stringify({ ...cfg, presetName: undefined })),
    pinned: JSON.parse(JSON.stringify({
      barLen: result.meter.barLen, resolution: result.meter.resolution, text: result.meter.text,
      parts: result.parts.map((p) => ({ len: p.len, lanes: p.lanes, base: p.base, info: p.info })),
    })),
    harmony: harmonySnapshot(result.harmony),
  };
}

const CHANNELS = { melody: [0, 10, 11], bass: [1, 12], comp: [2, 3, 4, 5, 6, 7, 8, 13, 14, 15] };

function exportMidi() {
  if (!result) return;
  const layout = cfg.midiLayout || 'tracks';
  const h = result.harmony;
  const pitched = layout === 'drums' || !h ? [] : PITCHED.filter((v) => !cfg.harmony.voices[v].muted).map((v) => ({
    name: VOICE_LABELS[v], program: h.programs[v], channels: CHANNELS[v],
    notes: (final.pitched || []).filter((e) => e.voice === v),
  }));
  const bytes = writeMidi({
    events: final.events, tempo: result.playTempo ?? result.tempo, meter: result.meter, parts: result.parts,
    lanes: layout === 'harmony' ? [] : GEN_ORDER.filter((l) => !cfg.lanes[l].muted), labels: LANE_LABELS, ppq: TPQ, tpt: final.tpt, totalTatums: result.total,
    title: `midigen ${descriptorNames(songText()).map(displayName).join(' ')}${h ? ` in ${h.keyName} ${h.scaleName}` : ''} seed ${cfg.seed}`,
    combine: layout === 'combined', pitched, state: stateSnapshot(),
  });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
  const a = el('a');
  a.href = url;
  a.download = fileName();
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function openMidi() {
  const input = el('input');
  input.type = 'file';
  input.accept = '.mid,.midi,.smf,audio/midi,audio/x-midi';
  input.onchange = () => { if (input.files[0]) loadMidiFile(input.files[0]); };
  input.click();
}

async function loadMidiFile(file) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const imp = importMidi(bytes, { drumMap: { ...DEFAULT_MAP, ...(cfg.drumMap || {}) }, name: file.name });
    player.stop();
    $('btn-play').textContent = 'Play';
    $('playhead').hidden = true;
    if (imp.fromState) {
      const s = imp.state;
      cfg = normalizeCfg({ ...s.cfg, presetName: null });
      const pin = s.pinned || {};
      result = { meter: { barLen: pin.barLen, resolution: pin.resolution, text: pin.text }, parts: pin.parts || [], harmony: s.harmony || null };
      syncControls();
      renderPresetMenu();
      // First pass keeps every hit and note exactly as saved; later regenerations follow the locks as usual.
      generate({ keep: LANES, hkeep: VOICES });
      presetBar('info', { msg: `Recalled ${file.name} (seed ${cfg.seed}).` });
      return;
    }
    cfg.tempo = imp.cfg.tempo;
    cfg.meter = imp.cfg.meter;
    cfg.resolution = imp.cfg.resolution;
    cfg.parts = imp.cfg.parts;
    cfg.presetName = null;
    cfg.harmony = normalizeHarmonyCfg({ ...cfg.harmony, ...imp.cfg.harmony, voices: cfg.harmony.voices });
    for (const l of LANES) cfg.lanes[l] = { ...cfg.lanes[l], locked: imp.hasDrums, spec: imp.hasDrums ? '' : cfg.lanes[l].spec };
    for (const v of VOICES) {
      const V = cfg.harmony.voices[v];
      V.locked = imp.lockVoices.includes(v);
      if (V.locked) V.spec = '';
      if (imp.programs[v] != null) V.program = imp.programs[v];
    }
    result = { meter: { barLen: imp.pinned.barLen, resolution: imp.pinned.resolution, text: imp.cfg.meter }, parts: imp.pinned.parts, harmony: imp.harmonyPinned };
    syncControls();
    renderPresetMenu();
    generate();
    presetBar('info', { msg: `${imp.summary}. Imported parts are locked; unlock or re-roll to change them.${imp.warnings.length ? ` ${imp.warnings.join(' ')}` : ''}` });
  } catch (err) {
    showError(`Open MIDI: ${err.message}`);
  }
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
