import { LANES, LANE_LABELS, SYMBOLS } from '../core/drummap.js';

export function toAscii(result) {
  const { meter, parts } = result;
  const pad = 15;
  const head = `${meter.text} @ ${result.tempo} bpm, 1/${meter.resolution} grid, seed ${result.seed}`;
  const plays = meter.irrational ? ` (plays as ${meter.num}/${meter.unit} @ ${+result.playTempo.toFixed(2)} bpm)` : '';
  const h = result.harmony;
  const lines = [head + plays];
  if (h) lines.push(`${h.keyName} ${h.scaleName}${h.micro ? `, ${h.tuningName}` : ''}`);
  lines.push('');
  for (const p of parts) {
    lines.push(`== ${p.name} (${p.role}, ${p.bars} bar${p.bars > 1 ? 's' : ''}) ==`);
    const hp = h?.parts?.[p.index];
    if (hp) lines.push(`Chords: ${hp.prog.chords.map((c) => c.sym).join(' | ')}`);
    let head = ''.padEnd(pad) + '|';
    for (let b = 0; b < p.bars; b++) {
      for (let i = 0; i < meter.barLen; i++) {
        const bi = meter.beatStarts.indexOf(i);
        head += bi >= 0 ? String((bi + 1) % 10) : '.';
      }
      head += '|';
    }
    lines.push(head);
    for (const lane of LANES) {
      let row = LANE_LABELS[lane].padEnd(pad) + '|';
      for (let b = 0; b < p.bars; b++) {
        for (let i = 0; i < meter.barLen; i++) {
          const h = p.lanes[lane][b * meter.barLen + i];
          row += h ? SYMBOLS[h.art] || 'x' : '-';
        }
        row += '|';
      }
      lines.push(row);
    }
    lines.push('');
  }
  return lines.join('\n');
}
