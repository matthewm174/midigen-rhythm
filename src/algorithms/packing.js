// Packing: partition a cycle into groupings (e.g. 16 = 3+3+3+3+2+2) and tile a cycle with translates of a motif.

export function compositions(n, parts, rng, prefer = {}) {
  const ok = new Array(n + 1).fill(false);
  ok[0] = true;
  for (let i = 1; i <= n; i++) ok[i] = parts.some((p) => p <= i && ok[i - p]);
  if (!ok[n]) return null;
  const out = [];
  let r = n;
  while (r > 0) {
    const choices = parts.filter((p) => p <= r && ok[r - p]);
    const p = rng.weighted(choices, (c) => prefer[c] ?? 1);
    out.push(p);
    r -= p;
  }
  return out;
}

export function groupsToPattern(groups, len) {
  const out = new Array(len).fill(0);
  let s = 0;
  groups.forEach((g, i) => {
    if (s < len) out[s] = i === 0 ? 1 : 0.85;
    s += g;
  });
  return out;
}

// Groupings of `size` that restart at each restart point ("group 3/16 from each 1").
export function restartGroups(size, len, restarts) {
  const out = new Array(len).fill(0);
  const pts = restarts.concat([len]);
  for (let i = 0; i < restarts.length; i++) {
    for (let t = pts[i], j = 0; t < pts[i + 1]; t += size, j++) out[t] = j === 0 ? 1 : 0.8;
  }
  return out;
}

// Exact tiling: find translations B so that motif ⊕ B covers Z_n exactly once (rhythmic tiling canon).
export function tile(motif, n, maxNodes = 5000) {
  const covered = new Array(n).fill(false);
  const shifts = [];
  let nodes = 0;
  const solve = () => {
    if (++nodes > maxNodes) return false;
    const u = covered.indexOf(false);
    if (u < 0) return true;
    for (const a of motif) {
      const b = (((u - a) % n) + n) % n;
      const cells = motif.map((m) => (m + b) % n);
      if (cells.some((c) => covered[c])) continue;
      cells.forEach((c) => (covered[c] = true));
      shifts.push(b);
      if (solve()) return true;
      shifts.pop();
      cells.forEach((c) => (covered[c] = false));
    }
    return false;
  };
  return solve() ? shifts : null;
}

export const TILE_MOTIFS = [[0, 1], [0, 2], [0, 3], [0, 1, 2], [0, 2, 4], [0, 3, 6], [0, 1, 4, 5], [0, 4], [0, 1, 3, 4]];
