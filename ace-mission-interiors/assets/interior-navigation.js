// 2026-09-05. Plan-local metres; no DOM, Three.js, random values or dependencies.
// Door t is normalized along wall a -> b; width is metres, centred on t.
// Walls are zero-thickness centre lines. Include wall thickness in clearance or
// use an obstacle polygon where it matters. Unsafe inputs/paths fail closed.

const EPS = 1e-9;
const MAX_CELLS = 180000;
const sq = x => x * x;
const finitePoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function pointSegment2(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], dd = dx * dx + dz * dz;
  const t = dd ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / dd)) : 0;
  return sq(p[0] - a[0] - t * dx) + sq(p[1] - a[1] - t * dz);
}
function onSegment(p, a, b) {
  return Math.abs(cross(a, b, p)) <= EPS && p[0] >= Math.min(a[0], b[0]) - EPS &&
    p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
}
function intersects(a, b, c, d) {
  const p = cross(a, b, c), q = cross(a, b, d), r = cross(c, d, a), s = cross(c, d, b);
  return ((p > EPS && q < -EPS || p < -EPS && q > EPS) && (r > EPS && s < -EPS || r < -EPS && s > EPS)) ||
    onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}
function segmentDistance2(a, b, c, d) {
  if (intersects(a, b, c, d)) return 0;
  return Math.min(pointSegment2(a, c, d), pointSegment2(b, c, d), pointSegment2(c, a, b), pointSegment2(d, a, b));
}
function inPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
const edge = (a, b) => ({a, b, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1])});
const edgesOf = polygon => polygon.map((a, i) => edge(a, polygon[(i + 1) % polygon.length]));
const disjoint = (a, b, pad) => a.x1 + pad < b.x0 || a.x0 - pad > b.x1 || a.z1 + pad < b.z0 || a.z0 - pad > b.z1;

function polygonInput(input, label, errors) {
  if (!Array.isArray(input) || !input.every(finitePoint)) { errors.push(`${label}: expected finite [x,z] vertices.`); return []; }
  const p = input.map(v => v.slice());
  if (p.length > 1 && same(p[0], p[p.length - 1])) p.pop();
  if (p.length < 3) { errors.push(`${label}: at least three vertices required.`); return []; }
  let area = 0;
  for (let i = 0; i < p.length; i++) {
    const b = p[(i + 1) % p.length]; area += p[i][0] * b[1] - b[0] * p[i][1];
    if (same(p[i], b)) errors.push(`${label}: zero-length edge.`);
    for (let j = i + 1; j < p.length; j++) {
      if (j === i + 1 || i === 0 && j === p.length - 1) continue;
      if (intersects(p[i], b, p[j], p[(j + 1) % p.length])) errors.push(`${label}: polygon is not simple.`);
    }
  }
  if (Math.abs(area) <= EPS) errors.push(`${label}: zero-area polygon.`);
  return p;
}

class MinHeap {
  constructor() { this.items = []; }
  before(a, b) { return a.f < b.f || a.f === b.f && (a.h < b.h || a.h === b.h && a.id < b.id); }
  push(value) {
    const a = this.items; a.push(value); let i = a.length - 1;
    while (i) { const p = (i - 1) >> 1; if (!this.before(value, a[p])) break; a[i] = a[p]; i = p; }
    a[i] = value;
  }
  pop() {
    const a = this.items, result = a[0], last = a.pop(); if (!a.length) return result;
    let i = 0;
    while (i * 2 + 1 < a.length) {
      let c = i * 2 + 1; if (c + 1 < a.length && this.before(a[c + 1], a[c])) c++;
      if (!this.before(a[c], last)) break; a[i] = a[c]; i = c;
    }
    a[i] = last; return result;
  }
}

export function buildRoute(options = {}) {
  const errors = [], warnings = [];
  const validation = {valid: false, errors, warnings, clearance: options?.clearance ?? 0.35,
    algorithm: 'exact-clearance visibility + deterministic grid A* with door portals',
    units: 'metres', waypointCount: 0, segmentCount: 0, segmentChecks: 0, expandedNodes: 0, searches: []};
  const failure = (isSafe, isSegmentSafe) => ({points: [], length: 0, sample: () => null,
    isSafe: isSafe || (() => false), isSegmentSafe: isSegmentSafe || (() => false), validation});
  if (!options || typeof options !== 'object') { errors.push('Expected route options.'); return failure(); }
  const clearance = options.clearance ?? 0.35;
  if (!Number.isFinite(clearance) || clearance < 0) errors.push('Clearance must be a finite nonnegative distance.');
  // Even clearance zero must not permit a segment to cross a boundary.
  const buffer = Math.max(clearance, 1e-7), buffer2 = buffer * buffer;
  const footprint = polygonInput(options.footprint, 'Footprint', errors);
  const wallInput = options.walls ?? [], obstacleInput = options.obstacles ?? [], circleInput = options.circles ?? [], waypointInput = options.waypoints ?? [];
  if (![wallInput, obstacleInput, circleInput, waypointInput].every(Array.isArray)) {
    errors.push('Walls, obstacles, circles and waypoints must be arrays.'); return failure();
  }
  const solids = [], portals = [];
  wallInput.forEach((wall, i) => {
    if (!wall || !finitePoint(wall.a) || !finitePoint(wall.b) || same(wall.a, wall.b) || !Array.isArray(wall.doors ?? [])) {
      errors.push(`Wall ${i}: finite distinct endpoints and a doors array required.`); return;
    }
    const a = wall.a.slice(), b = wall.b.slice(), len = distance(a, b), intervals = [];
    for (const door of wall.doors ?? []) {
      if (!door || !Number.isFinite(door.t) || door.t < 0 || door.t > 1 || !Number.isFinite(door.width) || door.width <= 0) {
        errors.push(`Wall ${i}: door t must be 0..1 and width must be positive metres.`); continue;
      }
      const half = door.width / (2 * len);
      intervals.push([Math.max(0, door.t - half), Math.min(1, door.t + half)]);
    }
    intervals.sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]); else merged.push(interval.slice());
    }
    const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    let previous = 0;
    for (const [lo, hi] of merged) {
      if (lo > previous) solids.push(edge(at(previous), at(lo)));
      portals.push({p: at((lo + hi) / 2), normal: [-(b[1] - a[1]) / len, (b[0] - a[0]) / len]});
      previous = hi;
    }
    if (previous < 1) solids.push(edge(at(previous), b));
  });
  const obstacles = obstacleInput.map((v, i) => polygonInput(v?.polygon, `Obstacle ${i}`, errors));
  const circles = circleInput.map((c, i) => {
    if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z) || !Number.isFinite(c.radius) || c.radius < 0) {
      errors.push(`Circle ${i}: finite centre and nonnegative radius required.`); return null;
    }
    const radius = c.radius + buffer;
    return {p: [c.x, c.z], radius2: radius * radius, x0: c.x - radius, x1: c.x + radius, z0: c.z - radius, z1: c.z + radius};
  }).filter(Boolean);
  if (!waypointInput.length || !waypointInput.every(finitePoint)) errors.push('At least one finite [x,z] waypoint is required.');
  const waypoints = waypointInput.filter(finitePoint).map(p => p.slice());
  validation.waypointCount = waypoints.length;
  if (errors.length) return failure();
  const boundary = edgesOf(footprint), blockers = [...boundary, ...solids, ...obstacles.flatMap(edgesOf)];
  const xs = footprint.map(p => p[0]), zs = footprint.map(p => p[1]);
  const bbox = {x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs)};
  function isSafe(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || x < bbox.x0 + buffer || x > bbox.x1 - buffer || z < bbox.z0 + buffer || z > bbox.z1 - buffer) return false;
    const p = [x, z]; if (!inPolygon(p, footprint) || obstacles.some(o => inPolygon(p, o))) return false;
    for (const e of blockers) {
      if (x < e.x0 - buffer || x > e.x1 + buffer || z < e.z0 - buffer || z > e.z1 + buffer) continue;
      if (pointSegment2(p, e.a, e.b) < buffer2) return false;
    }
    for (const c of circles) {
      if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
      if (sq(x - c.p[0]) + sq(z - c.p[1]) < c.radius2) return false;
    }
    return true;
  }
  function lineSafe(a, b) {
    validation.segmentChecks++;
    if (!isSafe(...a) || !isSafe(...b)) return false;
    const bounds = edge(a, b);
    for (const e of blockers) if (!disjoint(bounds, e, buffer) && segmentDistance2(a, b, e.a, e.b) < buffer2) return false;
    for (const c of circles) if (!disjoint(bounds, c, 0) && pointSegment2(c.p, a, b) < c.radius2) return false;
    return true;
  }
  // This extra helper is for manual movement: safe endpoints alone do not mean
  // a move between them is safe (a thin wall may lie between those endpoints).
  const isSegmentSafe = (a, b) => finitePoint(a) && finitePoint(b) && lineSafe(a, b);
  waypoints.forEach((p, i) => { if (!isSafe(...p)) errors.push(`Waypoint ${i} is outside the clear navigable area.`); });
  if (errors.length) return failure(isSafe, isSegmentSafe);

  // Grid samples are only search nodes: every connecting edge is tested against
  // continuous geometry, so diagonal corner cutting cannot pass the validator.
  function search(start, end, step) {
    const x0 = bbox.x0 + buffer, z0 = bbox.z0 + buffer;
    const nx = Math.floor((bbox.x1 - bbox.x0 - 2 * buffer) / step) + 1;
    const nz = Math.floor((bbox.z1 - bbox.z0 - 2 * buffer) / step) + 1;
    const size = nx * nz;
    const stats = {step, cells: size, expanded: 0, found: false}; validation.searches.push(stats);
    if (size <= 0 || size > MAX_CELLS || !Number.isSafeInteger(size)) { stats.limit = 'grid-cell-budget'; return null; }
    const anchors = [start, end];
    for (const {p, normal} of portals) {
      for (const offset of [0, -(buffer + step), buffer + step]) {
        const q = [p[0] + normal[0] * offset, p[1] + normal[1] * offset];
        if (isSafe(...q) && !anchors.some(v => same(v, q))) anchors.push(q);
      }
    }
    const point = id => id >= size ? anchors[id - size] : [x0 + id % nx * step, z0 + Math.floor(id / nx) * step];
    const safeCache = new Int8Array(size);
    function gridSafe(id) {
      if (!safeCache[id]) safeCache[id] = isSafe(...point(id)) ? 1 : -1;
      return safeCache[id] === 1;
    }
    const links = Array.from({length: anchors.length}, () => []), reverse = new Map();
    for (let a = 0; a < anchors.length; a++) {
      const p = anchors[a], ix = Math.round((p[0] - x0) / step), iz = Math.round((p[1] - z0) / step);
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const x = ix + dx, z = iz + dz; if (x < 0 || x >= nx || z < 0 || z >= nz) continue;
        const id = z * nx + x;
        if (!gridSafe(id) || !lineSafe(p, point(id))) continue;
        links[a].push(id); if (!reverse.has(id)) reverse.set(id, []); reverse.get(id).push(size + a);
      }
      for (let b = 0; b < a; b++) if (lineSafe(p, anchors[b])) { links[a].push(size + b); links[b].push(size + a); }
    }
    const count = size + anchors.length, cost = new Float64Array(count), parent = new Int32Array(count), closed = new Uint8Array(count);
    cost.fill(Infinity); parent.fill(-1); cost[size] = 0;
    const heap = new MinHeap(), h0 = distance(start, end);
    heap.push({id: size, g: 0, h: h0, f: h0});
    while (heap.items.length) {
      const current = heap.pop(), id = current.id;
      if (closed[id] || current.g !== cost[id]) continue;
      closed[id] = 1; stats.expanded++; validation.expandedNodes++;
      if (id === size + 1) {
        const path = []; for (let n = id; n !== -1; n = parent[n]) path.push(point(n).slice());
        stats.found = true; return path.reverse();
      }
      const p = point(id), neighbors = [];
      if (id >= size) neighbors.push(...links[id - size]);
      else {
        const x = id % nx, z = Math.floor(id / nx);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dz) || x + dx < 0 || x + dx >= nx || z + dz < 0 || z + dz >= nz) continue;
          const next = (z + dz) * nx + x + dx;
          if (!closed[next] && gridSafe(next) && lineSafe(p, point(next))) neighbors.push(next);
        }
        if (reverse.has(id)) neighbors.push(...reverse.get(id));
      }
      for (const next of neighbors) {
        if (closed[next]) continue;
        const q = point(next), g = cost[id] + distance(p, q);
        if (g >= cost[next]) continue;
        cost[next] = g; parent[next] = id; const h = distance(q, end);
        heap.push({id: next, g, h, f: g + h});
      }
    }
    return null;
  }
  function simplify(path) {
    const result = [path[0]]; let i = 0;
    while (i < path.length - 1) {
      let j = path.length - 1; while (j > i + 1 && !lineSafe(path[i], path[j])) j--;
      result.push(path[j]); i = j;
    }
    return result;
  }
  const route = [waypoints[0]];
  const baseStep = Math.max(0.5, Math.sqrt((bbox.x1 - bbox.x0) * (bbox.z1 - bbox.z0) / (MAX_CELLS * 0.8)));
  for (let i = 1; i < waypoints.length; i++) {
    const start = waypoints[i - 1], end = waypoints[i]; if (same(start, end)) continue;
    let path = lineSafe(start, end) ? [start, end] : null;
    for (const step of [baseStep, baseStep / 2, baseStep / 4]) { if (path) break; path = search(start, end, step); }
    if (!path) {
      validation.failedLeg = [i - 1, i]; errors.push(`No verified safe route between waypoints ${i - 1} and ${i}; no partial route returned.`);
      warnings.push('A bounded grid search is conservative, not a proof that no continuous path exists.');
      return failure(isSafe, isSegmentSafe);
    }
    route.push(...simplify(path).slice(1));
  }
  // Never allow a simplifier or future search change to bypass the final gate.
  for (let i = 1; i < route.length; i++) if (!lineSafe(route[i - 1], route[i])) {
    errors.push('Final route failed continuous segment clearance validation.'); return failure(isSafe, isSegmentSafe);
  }
  const points = route.map(p => p.slice()), cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
  const length = cumulative[cumulative.length - 1];
  function sample(d) {
    if (!Number.isFinite(d)) return null;
    if (d <= 0 || !length) return points[0].slice();
    if (d >= length) return points[points.length - 1].slice();
    let lo = 1, hi = cumulative.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < d) lo = mid + 1; else hi = mid; }
    const a = points[lo - 1], b = points[lo], t = (d - cumulative[lo - 1]) / (cumulative[lo] - cumulative[lo - 1]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  validation.valid = true; validation.segmentCount = Math.max(0, points.length - 1);
  return {points: points.map(p => p.slice()), length, sample, isSafe, isSegmentSafe, validation};
}
