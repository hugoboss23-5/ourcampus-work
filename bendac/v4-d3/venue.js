// D3 venue geometry. Builds plain BufferGeometries; main.js gives them materials.
// Every surface of the stands carries its light-map coordinate (p across the bowl, s along the section profile).
import * as THREE from 'three';
const D3 = window.D3, B = D3.BOWL, S = D3.SEC;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
D3.rnd = rnd;

// albedos (linear)
const C = {
  conc: [0.20, 0.20, 0.205], concDark: [0.11, 0.11, 0.115], wall: [0.05, 0.11, 0.08], white: [0.55, 0.56, 0.57],
  steel: [0.30, 0.31, 0.32], dark: [0.022, 0.023, 0.025], glass: [0.02, 0.025, 0.03], nosing: [0.55, 0.42, 0.02],
  roof: [0.33, 0.34, 0.35], roofTop: [0.05, 0.052, 0.055], black: [0.008, 0.008, 0.009],
};
D3.COL = C;

// ---------------------------------------------------------------- merged builder for the stands
class Builder {
  constructor() { this.P = []; this.N = []; this.A = []; this.L = []; this.I = []; this.K = []; this.X = []; }
  vert(x, y, z, nx, ny, nz, col, lp, ls, ix, iz, kind) {
    this.P.push(x, y, z); this.N.push(nx, ny, nz); this.A.push(col[0], col[1], col[2]); this.L.push(lp, ls); this.I.push(ix, iz); this.K.push(kind);
    return this.P.length / 3 - 1;
  }
  tri(a, b, c) { this.X.push(a, b, c); }
  quadIdx(a, b, c, d) { this.X.push(a, b, c, a, c, d); }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('alb', new THREE.Float32BufferAttribute(this.A, 3));
    g.setAttribute('lmc', new THREE.Float32BufferAttribute(this.L, 2));
    g.setAttribute('inw', new THREE.Float32BufferAttribute(this.I, 2));
    g.setAttribute('kind', new THREE.Float32BufferAttribute(this.K, 1));
    g.setIndex(this.X);
    g.computeBoundingSphere();
    return g;
  }
}

// a band of surface along the bowl: from pa to pb, its cross-section a straight piece from (d0,y0) to (d1,y1)
// normal mode: 'up', 'in', 'down', 'out' or an explicit [nIn, nUp] pair in the section plane
function band(bld, pa, pb, d0, y0, d1, y1, col, nrm, kind = 0, maxStep = 2.0) {
  const dm = (d0 + d1) / 2;
  const kMid = B.at((pa + pb) / 2, dm).k;
  const n = Math.max(1, Math.ceil((pb - pa) * kMid / maxStep));
  const rows = [];
  for (let i = 0; i <= n; i++) {
    const p = pa + (pb - pa) * i / n;
    const q0 = B.at(p, d0), q1 = B.at(p, d1);
    const ix = -q0.nx, iz = -q0.nz; // inward
    let nn;
    if (nrm === 'up') nn = [0, 1, 0]; else if (nrm === 'down') nn = [0, -1, 0];
    else if (nrm === 'in') nn = [ix, 0, iz]; else if (nrm === 'out') nn = [-ix, 0, -iz];
    else { const [a, b] = nrm; nn = [ix * a, b, iz * a]; }
    const lp = p / B.P;
    const a = bld.vert(q0.x, y0, q0.z, nn[0], nn[1], nn[2], col, lp, S.sOf(d0, y0), ix, iz, kind);
    const b = bld.vert(q1.x, y1, q1.z, nn[0], nn[1], nn[2], col, lp, S.sOf(d1, y1), ix, iz, kind);
    rows.push([a, b]);
  }
  for (let i = 0; i < n; i++) bld.quadIdx(rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]);
}
// vertical wall across the bowl at a fixed p (vomitory sides): polygon in the (d, y) plane
function crossWall(bld, p, pts, col, side) {
  const q = B.at(p, 0); const tx = -q.nz * side, tz = q.nx * side; // tangent direction (normal of this wall)
  const base = bld.P.length / 3;
  for (const [d, y] of pts) { const r = B.at(p, d); bld.vert(r.x, y, r.z, tx, 0, tz, col, p / B.P, S.sOf(d, y), -q.nx, -q.nz, 0); }
  for (let i = 1; i < pts.length - 1; i++) side > 0 ? bld.tri(base, base + i, base + i + 1) : bld.tri(base, base + i + 1, base + i);
}

// ---------------------------------------------------------------- aisles, blocks, vomitories
const aisles = []; // { p, vom }
for (let si = 0; si < 8; si++) {
  const s = B.segs[si];
  aisles.push({ p: s.p0, vom: false });
  if (s.t === 'S') {
    const nb = s.len > 80 ? 7 : 4, bl = s.len / nb;
    for (let k = 1; k < nb; k++) aisles.push({ p: s.p0 + bl * k, vom: nb === 7 ? (k === 2 || k === 5) : k === 2 });
  }
}
aisles.sort((a, b) => a.p - b.p);
D3.aisles = aisles;
const AHW = 0.6, VHW = 1.45, VOM0 = 6, VOM1 = 14;   // aisle half width, vomitory half width, vomitory rows
// blocks between aisles with the half widths in metres converted to p at that radius
function blocks(d, row, tier) {
  const out = [];
  for (let i = 0; i < aisles.length; i++) {
    const a = aisles[i], b = aisles[(i + 1) % aisles.length];
    let pa = a.p, pb = b.p; if (pb <= pa) pb += B.P;
    const k = B.at((pa + pb) / 2, d).k;
    const vomRow = tier === 'low' && row >= VOM0 && row < VOM1;
    const ha = (vomRow && a.vom ? VHW : AHW) / B.at(pa + 0.5, d).k, hb = (vomRow && b.vom ? VHW : AHW) / B.at(pb - 0.5, d).k;
    out.push({ pa: pa + ha, pb: pb - hb, i, k });
  }
  return out;
}

// ---------------------------------------------------------------- the stands
const seats = [];   // seat instances
D3.buildStands = function () {
  const bld = new Builder();
  const P = B.P;
  // pitch-side wall: face and cap, dark green-black padded like a real perimeter wall
  band(bld, 0, P, 0, 0, 0, S.wall, C.wall, 'in', 0, 3);
  band(bld, 0, P, 0, S.wall, S.low.d0, S.wall, C.concDark, 'up', 0, 3);
  for (const tier of ['low', 'up']) {
    const T = S[tier];
    for (let r = 0; r < T.rows; r++) {
      const d = T.d0 + r * T.dep, y = T.y0 + r * T.rise;
      for (const bk of blocks(d + T.dep / 2, r, tier)) {
        band(bld, bk.pa, bk.pb, d, y, d + T.dep, y, C.conc, 'up');                       // tread
        band(bld, bk.pa, bk.pb, d + T.dep, y, d + T.dep, y + T.rise, C.concDark, 'in');   // riser
        // seats along the row, 0.5 m apart
        const len = (bk.pb - bk.pa) * bk.k, n = Math.floor((len - 0.1) / 0.5);
        for (let j = 0; j < n; j++) {
          const p = bk.pa + ((j + 0.5) / n) * (bk.pb - bk.pa);
          const q = B.at(p, d + 0.40);
          seats.push({ x: q.x, y, z: q.z, ix: -q.nx, iz: -q.nz, p, d: d + 0.40, row: r, tier, block: bk.i, nrow: T.rows });
        }
      }
      // aisle steps: two half steps per row, yellow nosing on each edge
      for (const a of aisles) {
        if (tier === 'low' && a.vom && r >= VOM0 && r < VOM1) continue;
        const k = B.at(a.p, d).k, hw = AHW / k;
        const pa = a.p - hw, pb = a.p + hw;
        const hd = T.dep / 2, hr = T.rise / 2;
        band(bld, pa, pb, d, y, d + hd, y, C.conc, 'up', 0, 4);
        band(bld, pa, pb, d + hd, y, d + hd, y + hr, C.concDark, 'in', 0, 4);
        band(bld, pa, pb, d + hd, y + hr, d + T.dep, y + hr, C.conc, 'up', 0, 4);
        band(bld, pa, pb, d + T.dep, y + hr, d + T.dep, y + T.rise, C.concDark, 'in', 0, 4);
        band(bld, pa, pb, d, y + 0.004, d + 0.06, y + 0.004, C.nosing, 'up', 0, 4);
        band(bld, pa, pb, d + hd, y + hr + 0.004, d + hd + 0.06, y + hr + 0.004, C.nosing, 'up', 0, 4);
      }
    }
  }
  // vomitories: a flat floor cut into the lower tier, side walls, and the dark tunnel mouth at the back
  const T = S.low;
  for (const a of aisles) if (a.vom) {
    const d0 = T.d0 + VOM0 * T.dep, d1 = T.d0 + VOM1 * T.dep, yf = T.y0 + VOM0 * T.rise - 0.02, y1 = T.y0 + VOM1 * T.rise;
    const hw = VHW / B.at(a.p, d0).k;
    band(bld, a.p - hw, a.p + hw, d0, yf, d1, yf, C.concDark, 'up', 0, 4);
    band(bld, a.p - hw, a.p + hw, d1, yf, d1, y1, C.black, 'in', 3, 4);
    const side = [[d0, yf], [d1, yf], [d1, y1 + 0.9], [d0, yf + T.rise + 0.9]];
    crossWall(bld, a.p - hw, side, C.conc, 1);
    crossWall(bld, a.p + hw, side, C.conc, -1);
    // wall caps
    for (const sg of [-1, 1]) {
      const pp = a.p + sg * hw;
      band(bld, pp - (sg < 0 ? 0.18 / B.at(pp, d0).k : 0), pp + (sg > 0 ? 0.18 / B.at(pp, d0).k : 0), d0, yf + T.rise + 0.9, d1, y1 + 0.9, C.conc, 'up', 0, 4);
    }
  }
  // back of the lower tier, concourse, glass boxes, soffit, upper fascia (the ribbon sits on it), upper back wall
  const lowTop = T.y0 + T.rows * T.rise, lowBack = T.d0 + T.rows * T.dep;
  band(bld, 0, P, lowBack, lowTop, S.boxD, lowTop, C.concDark, 'up', 0, 3);
  band(bld, 0, P, S.boxD, lowTop, S.boxD, S.boxY1, C.glass, 'in', 1, 1.8);
  band(bld, 0, P, S.boxD, S.boxY1, S.fasD, S.boxY1, C.concDark, 'down', 0, 3);
  band(bld, 0, P, S.fasD, S.boxY1, S.fasD, S.ribY0 - 0.02, C.white, 'in', 0, 3);
  band(bld, 0, P, S.fasD, S.ribY1 + 0.02, S.fasD, S.up.y0, C.white, 'in', 0, 3);
  band(bld, 0, P, S.fasD, S.up.y0, S.up.d0, S.up.y0, C.concDark, 'up', 0, 3);
  // glass balustrade rail on the upper front
  band(bld, 0, P, S.up.d0 - 0.05, S.up.y0, S.up.d0 - 0.05, S.up.y0 + 0.95, C.glass, 'in', 1, 3);
  const upTop = S.up.y0 + S.up.rows * S.up.rise, upBack = S.up.d0 + S.up.rows * S.up.dep;
  band(bld, 0, P, upBack, upTop, S.backD, upTop, C.concDark, 'up', 0, 3);
  band(bld, 0, P, S.backD, upTop, S.backD, S.backY, C.wall, 'in', 0, 3);
  band(bld, 0, P, S.backD, S.backY, S.extD, S.backY, C.concDark, 'up', 0, 3);
  // outer wall and its cap
  band(bld, 0, P, S.extD, 0, S.extD, S.backY, [0.07, 0.075, 0.08], 'out', 4, 3);
  // roof: corrugated underside, white front fascia, dark top
  band(bld, 0, P, S.roofB.d, S.roofB.y, S.roofF.d, S.roofF.y, C.roof, 'down', 2, 1.5);
  band(bld, 0, P, S.roofF.d, S.roofF.y - 1.35, S.roofF.d, S.roofF.y + 0.35, C.white, 'in', 0, 1.5);
  band(bld, 0, P, S.roofF.d, S.roofF.y - 1.35, S.roofF.d + 0.6, S.roofF.y - 1.35, C.white, 'down', 0, 1.5);
  band(bld, 0, P, S.roofF.d, S.roofF.y + 0.35, S.roofB.d + 0.3, S.roofB.y + 0.75, C.roofTop, [0.05, 0.999], 5, 1.5);
  band(bld, 0, P, S.roofB.d + 0.3, S.roofB.y + 0.75, S.roofB.d + 0.3, S.roofB.y - 0.3, C.roofTop, 'out', 4, 1.5);
  return bld.geo();
};

// ---------------------------------------------------------------- seats and crowd (instanced)
D3.buildSeatsAndCrowd = function () {
  const N = seats.length;
  // block fill: centre blocks fuller, a quieter corner, an away end in one corner
  const blockFill = {}; for (let i = 0; i < 64; i++) blockFill[i] = 0.62 + 0.36 * rnd();
  const sp = new Float32Array(N * 3), si = new Float32Array(N * 2), sc = new Float32Array(N * 3), sf = new Float32Array(N), sl = new Float32Array(N * 2);
  const cp = [], ci = [], ccl = [], csk = [], cmi = [], clm = [], cwv = [];
  const awayP = B.cornerMid(5);
  const palHome = [[0.020, 0.026, 0.045], [0.012, 0.012, 0.014], [0.05, 0.05, 0.055], [0.30, 0.31, 0.33], [0.015, 0.06, 0.20], [0.42, 0.42, 0.42], [0.10, 0.02, 0.02], [0.03, 0.04, 0.03]];
  const palAway = [[0.50, 0.36, 0.01], [0.012, 0.012, 0.014], [0.45, 0.32, 0.01], [0.02, 0.02, 0.025]];
  const skins = [[0.62, 0.43, 0.33], [0.48, 0.30, 0.21], [0.30, 0.18, 0.12], [0.70, 0.52, 0.42], [0.16, 0.10, 0.07]];
  const ribL = D3.RIB.L, ribStartP = B.cornerMid(3);
  seats.forEach((s, i) => {
    sp.set([s.x, s.y, s.z], i * 3); si.set([s.ix, s.iz], i * 2);
    const v = 0.85 + 0.3 * rnd();
    sc.set([0.022 * v, 0.095 * v, 0.080 * v], i * 3);
    const lp = s.p / B.P, ls = S.sOf(s.d, s.y + 0.6);
    sl.set([lp, ls], i * 2);
    // who is here
    let fill = blockFill[(s.block * 3 + (s.tier === 'up' ? 1 : 0)) % 64];
    if (s.tier === 'up' && s.row > s.nrow - 3) fill *= 0.75;
    const dp = Math.abs(((s.p - awayP + B.P / 2) % B.P) - B.P / 2);
    const away = dp < 14;
    if (away) fill = 0.9;
    const occ = rnd() < fill;
    sf[i] = occ ? 0 : (rnd() < 0.55 ? 1 : 0);
    if (!occ) return;
    cp.push(s.x + s.ix * 0.05, s.y + 0.40, s.z + s.iz * 0.05); ci.push(s.ix, s.iz);
    const pal = away ? palAway : palHome; const cl = pal[Math.floor(rnd() * pal.length)]; const b = 0.75 + 0.5 * rnd();
    ccl.push(cl[0] * b, cl[1] * b, cl[2] * b);
    const sk = skins[Math.floor(rnd() * skins.length)]; csk.push(sk[0], sk[1], sk[2]);
    cmi.push(0.88 + 0.2 * rnd(), rnd() * 6.283, rnd(), s.tier === 'up' ? 1 : 0);
    clm.push(lp, ls);
    // distance round the ribbon loop from where the ribbon starts (the crowd's wave follows that edge)
    let dd = ((s.p - ribStartP) % B.P + B.P) % B.P; dd = Math.min(dd, B.P - dd);
    cwv.push(dd / B.P * ribL);
  });
  // seat model: pan + back, local x along the row, z towards the back, y up; attribute part: 0 pan, 1 back
  const seatGeo = new THREE.InstancedBufferGeometry();
  {
    const P = [], N = [], Pt = [], X = [];
    const box = (cx, cy, cz, sx, sy, sz, part, tiltX = 0) => {
      const b = P.length / 3;
      const c = Math.cos(tiltX), s = Math.sin(tiltX);
      const rot = (x, y, z) => [x, y * c - z * s, y * s + z * c];
      const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
      const hs = [sx / 2, sy / 2, sz / 2];
      for (const [n, u, v] of faces) {
        const o = P.length / 3;
        for (const [a, bb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const lx = n[0] * hs[0] + u[0] * a * hs[0] + v[0] * bb * hs[0];
          const ly = n[1] * hs[1] + u[1] * a * hs[1] + v[1] * bb * hs[1];
          const lz = n[2] * hs[2] + u[2] * a * hs[2] + v[2] * bb * hs[2];
          const r = rot(lx, ly, lz); P.push(cx + r[0], cy + r[1], cz + r[2]);
          const rn = rot(n[0], n[1], n[2]); N.push(rn[0], rn[1], rn[2]); Pt.push(part);
        }
        X.push(o, o + 1, o + 2, o, o + 2, o + 3);
      }
      return b;
    };
    box(0, 0.42, -0.02, 0.44, 0.05, 0.40, 0);          // pan
    box(0, 0.66, 0.20, 0.44, 0.44, 0.045, 1, -0.2);    // back, leaning back
    box(0, 0.22, 0.18, 0.06, 0.40, 0.06, 2);           // stem
    seatGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    seatGeo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    seatGeo.setAttribute('part', new THREE.Float32BufferAttribute(Pt, 1));
    seatGeo.setIndex(X);
  }
  seatGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(sp, 3));
  seatGeo.setAttribute('iIn', new THREE.InstancedBufferAttribute(si, 2));
  seatGeo.setAttribute('iCol', new THREE.InstancedBufferAttribute(sc, 3));
  seatGeo.setAttribute('iFold', new THREE.InstancedBufferAttribute(sf, 1));
  seatGeo.setAttribute('iLM', new THREE.InstancedBufferAttribute(sl, 2));
  seatGeo.instanceCount = N;
  // crowd: one camera-facing card per person
  const crowdGeo = new THREE.InstancedBufferGeometry();
  crowdGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  crowdGeo.setIndex([0, 1, 2, 0, 2, 3]);
  crowdGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(cp), 3));
  crowdGeo.setAttribute('iIn', new THREE.InstancedBufferAttribute(new Float32Array(ci), 2));
  crowdGeo.setAttribute('iCloth', new THREE.InstancedBufferAttribute(new Float32Array(ccl), 3));
  crowdGeo.setAttribute('iSkin', new THREE.InstancedBufferAttribute(new Float32Array(csk), 3));
  crowdGeo.setAttribute('iMisc', new THREE.InstancedBufferAttribute(new Float32Array(cmi), 4));
  crowdGeo.setAttribute('iLM', new THREE.InstancedBufferAttribute(new Float32Array(clm), 2));
  crowdGeo.setAttribute('iWave', new THREE.InstancedBufferAttribute(new Float32Array(cwv), 1));
  crowdGeo.instanceCount = cp.length / 3;
  D3.stats = { seats: N, people: cp.length / 3 };
  return { seatGeo, crowdGeo };
};

// ---------------------------------------------------------------- steel: trusses, purlins, masts, rods (instanced boxes)
D3.buildSteel = function () {
  const mats = [], cols = [], lms = [];
  const up = V3(0, 1, 0), m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const member = (A, Bp, t, col, lm = [-1, -1], t2 = t) => {
    const d = Bp.clone().sub(A); const L = d.length(); if (L < 1e-3) return;
    q.setFromUnitVectors(up, d.normalize());
    m.compose(A.clone().add(Bp).multiplyScalar(0.5), q, V3(t, L, t2));
    mats.push(...m.elements); cols.push(...col); lms.push(...lm);
  };
  const W = (p, d, y) => { const r = B.at(p, d); return V3(r.x, y, r.z); };
  const lmAt = (p, d, y) => [p / B.P, S.sOf(d, y)];
  // truss positions round the bowl
  const tp = [];
  for (const s of B.segs) {
    const n = s.t === 'S' ? Math.round(s.len / 9.8) : 5;
    for (let i = 0; i < n; i++) tp.push(s.p0 + s.len * (s.t === 'S' ? (i + 0.5) / n : (i + 0.5) / n));
  }
  tp.sort((a, b) => a - b);
  const steel = C.steel;
  const yTop = (d) => S.yR(d) - 0.14, yBot = (d) => S.yR(d) - (0.75 + (d - S.roofF.d) / (S.roofB.d - S.roofF.d) * 2.6);
  for (const p of tp) {
    const ds = []; for (let d = S.roofF.d + 0.3; d <= S.roofB.d - 0.4; d += 3.0) ds.push(d);
    member(W(p, ds[0], yTop(ds[0])), W(p, ds[ds.length - 1], yTop(ds[ds.length - 1])), 0.34, steel, lmAt(p, 18, 25.5));
    member(W(p, ds[0], yBot(ds[0])), W(p, ds[ds.length - 1], yBot(ds[ds.length - 1])), 0.30, steel, lmAt(p, 18, 24.5));
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i]; member(W(p, d, yTop(d)), W(p, d, yBot(d)), 0.16, steel, lmAt(p, d, 25));
      if (i < ds.length - 1) { const a = i % 2 ? d : ds[i + 1], b = i % 2 ? ds[i + 1] : d; member(W(p, a, yTop(a)), W(p, b, yBot(b)), 0.14, steel, lmAt(p, (a + b) / 2, 25)); }
    }
    // post down to the back wall
    member(W(p, S.backD + 0.8, S.backY), W(p, S.backD + 0.8, yBot(S.backD + 0.8)), 0.45, steel, lmAt(p, S.backD, 25));
  }
  // purlins between trusses
  for (let d = S.roofF.d + 1.5; d < S.roofB.d - 1; d += 4.0) for (let i = 0; i < tp.length; i++) {
    const a = tp[i], b = i + 1 < tp.length ? tp[i + 1] : tp[0] + B.P;
    member(W(a, d, yTop(d) - 0.12), W(b, d, yTop(d) - 0.12), 0.12, [0.26, 0.27, 0.28], lmAt((a + b) / 2, d, 26), 0.2);
  }
  // floodlight masts: four lattice towers outside the corners, heads tilted at the pitch (switched off)
  const mastTop = [];
  for (const ci of [1, 3, 5, 7]) {
    const p = B.cornerMid(ci), r = B.at(p, 44);
    const base = V3(r.x, 0, r.z), Hm = 50, inw = V3(-r.nx, 0, -r.nz);
    const side = V3(-r.nz, 0, r.nx);
    const leg = (k, h) => { const w = 1.6 - 0.95 * h / Hm; const sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1; return base.clone().addScaledVector(side, sx * w).addScaledVector(inw, sz * w).setY(h); };
    const col = [0.24, 0.25, 0.26];
    for (let k = 0; k < 4; k++) member(leg(k, 0), leg(k, Hm), 0.38, col);
    for (let h = 0; h < Hm - 0.1; h += 3.2) {
      const h1 = Math.min(Hm, h + 3.2);
      const order = [0, 1, 3, 2];
      for (let f = 0; f < 4; f++) {
        const a = order[f], b = order[(f + 1) % 4];
        member(leg(a, h), leg(b, h), 0.14, col);
        member(leg(a, h), leg(b, h1), 0.11, col);
        member(leg(b, h), leg(a, h1), 0.11, col);
      }
    }
    // head frame: 6 x 4 lamps on a grid, tilted 28 degrees down at the pitch
    const hc = base.clone().setY(Hm + 2.6).addScaledVector(inw, 0.8);
    const tilt = THREE.MathUtils.degToRad(28);
    const fwd = inw.clone().multiplyScalar(Math.cos(tilt)).add(V3(0, -Math.sin(tilt), 0));
    const hu = new THREE.Vector3().crossVectors(side, fwd).normalize(); if (hu.y < 0) hu.negate();
    for (let i = -3; i <= 3; i++) member(hc.clone().addScaledVector(side, i * 1.15).addScaledVector(hu, -2.4), hc.clone().addScaledVector(side, i * 1.15).addScaledVector(hu, 2.4), 0.1, col);
    for (let j = -2; j <= 2; j++) member(hc.clone().addScaledVector(side, -3.6).addScaledVector(hu, j * 1.2), hc.clone().addScaledVector(side, 3.6).addScaledVector(hu, j * 1.2), 0.1, col);
    member(base.clone().setY(Hm), hc.clone().addScaledVector(hu, -2.4), 0.25, col);
    mastTop.push({ hc, side, hu, fwd });
  }
  // big screen hangers: two rods from the top of each screen to the truss above
  for (const s of D3.SCR) for (const k of [-0.36, 0.36]) {
    const a = s.c.clone().addScaledVector(s.r, k * s.w).addScaledVector(s.u, s.h / 2 + 0.15).addScaledVector(s.n, -0.4);
    member(a, a.clone().setY(S.yR(s.d) - 1.6), 0.07, [0.2, 0.2, 0.21], lmAt(s.p, s.d, 24));
  }
  const g = new THREE.InstancedBufferGeometry();
  const bx = new THREE.BoxGeometry(1, 1, 1);
  g.index = bx.index; g.setAttribute('position', bx.attributes.position); g.setAttribute('normal', bx.attributes.normal);
  const n = mats.length / 16, M = new Float32Array(mats);
  for (let c = 0; c < 4; c++) { const a = new Float32Array(n * 4); for (let i = 0; i < n; i++) for (let r = 0; r < 4; r++) a[i * 4 + r] = M[i * 16 + c * 4 + r]; g.setAttribute('iM' + c, new THREE.InstancedBufferAttribute(a, 4)); }
  g.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(cols), 3));
  g.setAttribute('iLM', new THREE.InstancedBufferAttribute(new Float32Array(lms), 2));
  g.instanceCount = n;
  D3.mastTop = mastTop;
  return g;
};

// ---------------------------------------------------------------- lamps on the mast heads (dark glass faces)
D3.buildLamps = function () {
  const P = [], N = [], X = [];
  for (const h of D3.mastTop) for (let i = -2.5; i <= 2.5; i++) for (let j = -1.5; j <= 1.5; j++) {
    const c = h.hc.clone().addScaledVector(h.side, i * 1.15).addScaledVector(h.hu, j * 1.2).addScaledVector(h.fwd, 0.15);
    const o = P.length / 3, r = 0.42;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const v = c.clone().addScaledVector(h.side, a * r).addScaledVector(h.hu, b * r); P.push(v.x, v.y, v.z); N.push(h.fwd.x, h.fwd.y, h.fwd.z); }
    X.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(X); return g;
};

// ---------------------------------------------------------------- LED faces
// perimeter and ribbon: one quad strip per straight piece, with loop distance s and height v
D3.buildLoopFace = function (L, y0, kindTilt) {
  const P = [], A = [], X = [];
  for (const g of L.segs) {
    const n = g.n; const tg = g.B.clone().sub(g.A).normalize();
    const upv = new THREE.Vector3().crossVectors(n, tg).normalize(); if (upv.y < 0) upv.negate();
    const base0 = g.A.clone(), base1 = g.B.clone();
    if (y0 !== null) { base0.y = y0; base1.y = y0; } else { base0.addScaledVector(upv, -L.H / 2); base1.addScaledVector(upv, -L.H / 2); }
    const o = P.length / 3;
    const v0 = base0, v1 = base1, v2 = base1.clone().addScaledVector(upv, L.H), v3 = base0.clone().addScaledVector(upv, L.H);
    for (const v of [v0, v1, v2, v3]) P.push(v.x, v.y, v.z);
    A.push(g.s0, 0, g.s1, 0, g.s1, 1, g.s0, 1);
    X.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('sv', new THREE.Float32BufferAttribute(A, 2)); geo.setIndex(X);
  geo.computeBoundingSphere(); return geo;
};

// small objects lit by the point lights: board housings, screen frames, goals, flags (merged, per-vertex albedo)
D3.buildMisc = function () {
  const P = [], N = [], Al = [], X = [];
  const box = (c, ax, ay, az, col) => { // centre and three half-axis vectors
    const faces = [[ax, ay, az], [ax.clone().negate(), az, ay], [ay, az, ax], [ay.clone().negate(), ax, az], [az, ax, ay], [az.clone().negate(), ay, ax]];
    for (const [n, u, v] of faces) {
      const o = P.length / 3, nn = n.clone().normalize();
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = c.clone().add(n).addScaledVector(u, a).addScaledVector(v, b); P.push(p.x, p.y, p.z); N.push(nn.x, nn.y, nn.z); Al.push(...col); }
      const cr = new THREE.Vector3().crossVectors(u, v);
      cr.dot(n) > 0 ? X.push(o, o + 1, o + 2, o, o + 2, o + 3) : X.push(o, o + 2, o + 1, o, o + 3, o + 2);
    }
  };
  const cyl = (A, Bp, r, col, seg = 8) => {
    const d = Bp.clone().sub(A); const L = d.length(); const dir = d.clone().normalize();
    const t = Math.abs(dir.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0); const u = new THREE.Vector3().crossVectors(dir, t).normalize(); const v = new THREE.Vector3().crossVectors(dir, u);
    const o = P.length / 3;
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; const n = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
      for (const e of [A, Bp]) { const p = e.clone().addScaledVector(n, r); P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); Al.push(...col); } }
    for (let i = 0; i < seg; i++) { const k = o + i * 2; X.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  };
  // perimeter board housings: black body behind each face, padded grey top
  for (const g of D3.PER.segs) {
    const n = g.n, nh = V3(n.x, 0, n.z).normalize(), tg = g.B.clone().sub(g.A); const L = tg.length(); tg.normalize();
    const c = g.A.clone().add(g.B).multiplyScalar(0.5).setY(0.48).addScaledVector(nh, -0.52); // behind the face's top edge (the face leans back 12 deg)
    box(c, tg.clone().multiplyScalar(L / 2 + 0.02), V3(0, 0.48, 0), nh.clone().multiplyScalar(0.26), C.dark);
    box(c.clone().setY(1.05).addScaledVector(nh, 0.04), tg.clone().multiplyScalar(L / 2 + 0.02), V3(0, 0.035, 0), nh.clone().multiplyScalar(0.3), [0.05, 0.05, 0.055]);
  }
  // ribbon housing lip
  for (const g of D3.RIB.segs) {
    const n = g.n, nh = V3(n.x, 0, n.z).normalize(), tg = g.B.clone().sub(g.A); const L = tg.length(); tg.normalize();
    const c = g.A.clone().add(g.B).multiplyScalar(0.5).addScaledVector(nh, -0.3); // clear of the face, which leans 7 deg
    box(c, tg.clone().multiplyScalar(L / 2 + 0.01), V3(0, D3.RIB.H / 2 + 0.06, 0), nh.clone().multiplyScalar(0.2), C.dark);
  }
  // big screens: deep black cabinet body and frame lip
  for (const s of D3.SCR) {
    box(s.c.clone().addScaledVector(s.n, -0.48), s.r.clone().multiplyScalar(s.w / 2 + 0.2), s.u.clone().multiplyScalar(s.h / 2 + 0.2), s.n.clone().multiplyScalar(0.45), C.dark);
    box(s.c.clone().addScaledVector(s.u, -s.h / 2 - 0.55).addScaledVector(s.n, -0.25), s.r.clone().multiplyScalar(s.w / 2 + 0.2), s.u.clone().multiplyScalar(0.35), s.n.clone().multiplyScalar(0.25), [0.03, 0.03, 0.032]);
  }
  // goals: posts, bar, net supports
  const W = [0.8, 0.8, 0.8];
  for (const sx of [-1, 1]) {
    const x = sx * 52.5;
    cyl(V3(x, 0, -3.66), V3(x, 2.44, -3.66), 0.06, W); cyl(V3(x, 0, 3.66), V3(x, 2.44, 3.66), 0.06, W);
    cyl(V3(x, 2.44, -3.72), V3(x, 2.44, 3.72), 0.06, W);
    for (const z of [-3.66, 3.66]) { cyl(V3(x, 2.44, z), V3(x + sx * 1.0, 2.2, z), 0.025, [0.5, 0.5, 0.5], 5); cyl(V3(x + sx * 1.0, 2.2, z), V3(x + sx * 2.0, 0, z), 0.025, [0.5, 0.5, 0.5], 5); }
  }
  // corner flags
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(V3(sx * 52.5, 0, sz * 34), V3(sx * 52.5, 1.5, sz * 34), 0.02, [0.7, 0.7, 0.7], 5);
    box(V3(sx * 52.5 + 0.2, 1.35, sz * 34), V3(0.2, 0, 0), V3(0, 0.14, 0), V3(0, 0, 0.01), [0.5, 0.42, 0.02]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('alb', new THREE.Float32BufferAttribute(Al, 3)); g.setIndex(X);
  return g;
};
// goal nets: planes with a mesh pattern (alpha-tested)
D3.buildNets = function () {
  const P = [], U = [], X = [];
  const quad = (a, b, c, d, uw, vh) => { const o = P.length / 3; for (const v of [a, b, c, d]) P.push(v.x, v.y, v.z); U.push(0, 0, uw, 0, uw, vh, 0, vh); X.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  for (const sx of [-1, 1]) {
    const x0 = sx * 52.5, x1 = sx * 54.5, xm = sx * 53.5;
    quad(V3(x1, 0, -3.66), V3(x1, 0, 3.66), V3(xm, 2.2, 3.66), V3(xm, 2.2, -3.66), 7.32, 2.4);
    quad(V3(x0, 2.44, -3.66), V3(x0, 2.44, 3.66), V3(xm, 2.2, 3.66), V3(xm, 2.2, -3.66), 7.32, 1.0);
    for (const z of [-3.66, 3.66]) { quad(V3(x0, 0, z), V3(x1, 0, z), V3(xm, 2.2, z), V3(x0, 2.44, z), 2.0, 2.44); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(X); return g;
};
