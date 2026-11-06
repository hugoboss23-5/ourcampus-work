// D3 "Lights on, for real": shared world description (one source of truth for JS geometry and GLSL lighting).
// Units are metres. x runs along the pitch, z across it, y up. The bowl is a rounded rectangle; every point of
// the stands is addressed by (p, d): p = distance round the base curve, d = distance out from the pitch edge.
import * as THREE from 'three';
const D3 = window.D3 = window.D3 || {};
D3.THREE = THREE;

// ---------------------------------------------------------------- the bowl plan
const B = D3.BOWL = { HX: 62, HZ: 43, RC: 13 };
B.AX = B.HX - B.RC; B.AZ = B.HZ - B.RC;
const H = Math.PI / 2;
// 8 pieces round the pitch, counter-clockwise seen from above: +z side, corner, -x end, corner, -z side, corner, +x end, corner
B.segs = [
  { t: 'S', o: [B.AX, B.HZ], dir: [-1, 0], n: [0, 1], len: 2 * B.AX },
  { t: 'C', c: [-B.AX, B.AZ], a0: H, len: B.RC * H },
  { t: 'S', o: [-B.HX, B.AZ], dir: [0, -1], n: [-1, 0], len: 2 * B.AZ },
  { t: 'C', c: [-B.AX, -B.AZ], a0: 2 * H, len: B.RC * H },
  { t: 'S', o: [-B.AX, -B.HZ], dir: [1, 0], n: [0, -1], len: 2 * B.AX },
  { t: 'C', c: [B.AX, -B.AZ], a0: 3 * H, len: B.RC * H },
  { t: 'S', o: [B.HX, -B.AZ], dir: [0, 1], n: [1, 0], len: 2 * B.AZ },
  { t: 'C', c: [B.AX, B.AZ], a0: 0, len: B.RC * H },
];
let acc = 0; for (const s of B.segs) { s.p0 = acc; acc += s.len; s.p1 = acc; } B.P = acc;
// point on the plan at (p, d): x, z, outward normal, and k = how much longer a metre of p is at this d (corners fan out)
B.at = (p, d) => {
  p = ((p % B.P) + B.P) % B.P;
  let s = B.segs[0]; for (const q of B.segs) if (p >= q.p0 && p < q.p1) { s = q; break; }
  const l = p - s.p0;
  if (s.t === 'S') return { x: s.o[0] + s.dir[0] * l + s.n[0] * d, z: s.o[1] + s.dir[1] * l + s.n[1] * d, nx: s.n[0], nz: s.n[1], k: 1, seg: s };
  const a = s.a0 + l / B.RC, nx = Math.cos(a), nz = Math.sin(a);
  return { x: s.c[0] + nx * (B.RC + d), z: s.c[1] + nz * (B.RC + d), nx, nz, k: (B.RC + d) / B.RC, seg: s };
};
// the p of the middle of a corner (i = 1, 3, 5, 7)
B.cornerMid = (i) => B.segs[i].p0 + B.segs[i].len / 2;

// ---------------------------------------------------------------- the section (Plymouth / Chesterfield proportions)
const S = D3.SEC = {
  low: { rows: 22, d0: 0.6, dep: 0.8, y0: 1.25, rise: 0.36 },    // lower tier, about 24 degrees
  up: { rows: 17, d0: 18.0, dep: 0.8, y0: 14.5, rise: 0.47 },    // upper tier, about 30 degrees
  wall: 1.25,                                                    // pitch-side wall
  boxD: 18.9, boxY0: 9.17, boxY1: 12.9,                          // hospitality glass between the tiers
  fasD: 17.4, ribY0: 13.15, ribY1: 14.25,                        // upper tier front fascia, the LED ribbon on it
  backD: 32.0, backY: 24.6,                                      // upper tier back wall
  roofF: { d: 10.5, y: 27.4 }, roofB: { d: 35.0, y: 26.0 },       // roof sheet underside, front and back
  extD: 34.4,                                                    // outer wall
};
S.yR = (d) => S.roofF.y + (S.roofB.y - S.roofF.y) * (d - S.roofF.d) / (S.roofB.d - S.roofF.d);
// the profile the light maps follow, (d, y) from the pitch wall foot up the stands and back along the roof underside
S.prof = [[0, 0], [0, 1.25], [0.6, 1.25], [18.2, 9.17], [18.9, 9.17], [18.9, 12.9], [17.4, 12.9], [17.4, 14.5], [18.0, 14.5],
  [31.6, 22.49], [32.0, 22.49], [32.0, 24.6], [35.0, 26.0], [10.5, 27.4]];
{ let L = 0; S.profS = [0]; for (let i = 1; i < S.prof.length; i++) { L += Math.hypot(S.prof[i][0] - S.prof[i - 1][0], S.prof[i][1] - S.prof[i - 1][1]); S.profS.push(L); } S.profL = L; }
// nearest point on the profile, as a 0..1 coordinate
S.sOf = (d, y) => {
  let best = 1e9, bs = 0;
  for (let i = 1; i < S.prof.length; i++) {
    const [ax, ay] = S.prof[i - 1], [bx, by] = S.prof[i];
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    const t = Math.max(0, Math.min(1, ((d - ax) * ex + (y - ay) * ey) / l2));
    const qx = ax + ex * t - d, qy = ay + ey * t - y, dd = qx * qx + qy * qy;
    if (dd < best) { best = dd; bs = S.profS[i - 1] + t * Math.sqrt(l2); }
  }
  return bs / S.profL;
};

// ---------------------------------------------------------------- LED surfaces
// big screens hang under the roof in two opposite corners, facing the centre spot (Home Park's corner screen)
const SCR = D3.SCR = [];
for (const [ci, name] of [[7, 'A'], [3, 'B']]) {
  const p = B.cornerMid(ci), q = B.at(p, 12.5);
  const w = 11.52, h = 6.72, cy = 21.6, tilt = THREE.MathUtils.degToRad(9);
  const n = new THREE.Vector3(-q.nx * Math.cos(tilt), -Math.sin(tilt), -q.nz * Math.cos(tilt)); // faces in and a little down
  const r = new THREE.Vector3(q.nz, 0, -q.nx).multiplyScalar(-1);   // screen's right, seen from the pitch
  const up = new THREE.Vector3().crossVectors(n, r).normalize();
  if (up.y < 0) { up.negate(); r.negate(); }
  SCR.push({ name, c: new THREE.Vector3(q.x, cy, q.z), n, r: r.normalize(), u: up, w, h, p, d: 12.5 });
}
// a closed polyline that the switch-on edge runs along; returns segments with loop distances from the start point
function loop(points, startPt, maxLen, y, nOf) {
  // rotate so the loop starts at startPt (inserted on its edge)
  let bi = 0, bd = 1e9;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez;
    const t = Math.max(0, Math.min(1, ((startPt[0] - a[0]) * ex + (startPt[1] - a[1]) * ez) / l2));
    const dx = a[0] + ex * t - startPt[0], dz = a[1] + ez * t - startPt[1];
    if (dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; bi = i; }
  }
  const pts = [startPt];
  for (let k = 1; k <= points.length; k++) pts.push(points[(bi + k) % points.length]);
  pts.push(startPt);
  const segs = []; let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.01) continue;
    const n = Math.max(1, Math.ceil(L / maxLen));
    for (let j = 0; j < n; j++) {
      const t0 = j / n, t1 = (j + 1) / n;
      const A = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], Bp = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      segs.push({ A: new THREE.Vector3(A[0], y, A[1]), B: new THREE.Vector3(Bp[0], y, Bp[1]), s0: s + L * t0, s1: s + L * t1 });
    }
    s += L;
  }
  for (const g of segs) { g.L = s; g.n = nOf(g); }
  return { segs, L: s, dist: (x) => Math.min(x, s - x) };
}
// IMPAKT perimeter: 0.96 m boards of square cabinets, 4.5 m outside the lines, chamfered corners; starts under screen A
D3.PER = (() => {
  const zs = 38.5, xe = 57, xs = 48, ze = 24;
  const pts = [[xs, zs], [-xs, zs], [-xe, ze], [-xe, -ze], [-xs, -zs], [xs, -zs], [xe, -ze], [xe, ze]];
  const st = [(xs + xe) / 2, (zs + ze) / 2];
  const tiltBack = THREE.MathUtils.degToRad(12);
  const L = loop(pts, st, 20, 0.5, (g) => {
    const dx = g.B.x - g.A.x, dz = g.B.z - g.A.z, l = Math.hypot(dx, dz);
    let nx = dz / l, nz = -dx / l; // left normal; make it face the centre
    const mx = (g.A.x + g.B.x) / 2, mz = (g.A.z + g.B.z) / 2; if (nx * mx + nz * mz > 0) { nx = -nx; nz = -nz; }
    return new THREE.Vector3(nx * Math.cos(tiltBack), Math.sin(tiltBack), nz * Math.cos(tiltBack));
  });
  L.H = 0.96; L.y0 = 0.06; L.tilt = tiltBack; L.pitch = 0.008; L.start = st; L.cab = 0.96; // square 0.96 m cabinets, 120 x 120 diodes
  return L;
})();
// mid-tier ribbon round the whole bowl on the upper tier fascia; starts under screen B
D3.RIB = (() => {
  const d = S.fasD - 0.02, pts = [];
  for (const s of B.segs) {
    const n = s.t === 'S' ? 1 : 3;
    for (let j = 0; j < n; j++) { const q = B.at(s.p0 + s.len * j / n, d); pts.push([q.x, q.z]); }
  }
  const q = B.at(B.cornerMid(3), d);
  const tilt = THREE.MathUtils.degToRad(7);
  const L = loop(pts, [q.x, q.z], 26, (S.ribY0 + S.ribY1) / 2, (g) => {
    const mx = (g.A.x + g.B.x) / 2, mz = (g.A.z + g.B.z) / 2, dx = g.B.x - g.A.x, dz = g.B.z - g.A.z, l = Math.hypot(dx, dz);
    let nx = dz / l, nz = -dx / l; if (nx * mx + nz * mz > 0) { nx = -nx; nz = -nz; }
    return new THREE.Vector3(nx * Math.cos(tilt), -Math.sin(tilt), nz * Math.cos(tilt));
  });
  L.H = S.ribY1 - S.ribY0; L.pitch = 0.010;
  return L;
})();

// ---------------------------------------------------------------- point lights for haze and for small objects
// 0 A, 1 B, 2..9 perimeter regions, 10..17 ribbon regions, 18 the green light, 19..22 the four switch-on edges
D3.NHL = 23;
D3.hlPos = Array.from({ length: D3.NHL }, () => new THREE.Vector3());
D3.hlN = Array.from({ length: D3.NHL }, () => new THREE.Vector3());
D3.hlOn = new Float32Array(D3.NHL);
D3.hlPow = new Float32Array(D3.NHL);
// point on a loop at distance s from its start
D3.loopPoint = (L, s, out) => {
  s = ((s % L.L) + L.L) % L.L;
  for (const g of L.segs) if (s <= g.s1 + 1e-6) { const t = (s - g.s0) / (g.s1 - g.s0); out.copy(g.A).lerp(g.B, t); return g; }
  out.copy(L.segs[0].A); return L.segs[0];
};
{
  const tmp = new THREE.Vector3();
  D3.hlPos[0].copy(SCR[0].c).addScaledVector(SCR[0].n, 0.6); D3.hlN[0].copy(SCR[0].n); D3.hlPow[0] = SCR[0].w * SCR[0].h;
  D3.hlPos[1].copy(SCR[1].c).addScaledVector(SCR[1].n, 0.6); D3.hlN[1].copy(SCR[1].n); D3.hlPow[1] = SCR[1].w * SCR[1].h;
  for (let k = 0; k < 8; k++) {
    let g = D3.loopPoint(D3.PER, (k + 0.5) * D3.PER.L / 8, tmp); D3.hlPos[2 + k].copy(tmp).addScaledVector(g.n, 0.4); D3.hlN[2 + k].copy(g.n); D3.hlPow[2 + k] = D3.PER.L / 8 * D3.PER.H;
    g = D3.loopPoint(D3.RIB, (k + 0.5) * D3.RIB.L / 8, tmp); D3.hlPos[10 + k].copy(tmp).addScaledVector(g.n, 0.4); D3.hlN[10 + k].copy(g.n); D3.hlPow[10 + k] = D3.RIB.L / 8 * D3.RIB.H;
  }
  D3.hlPow[18] = 1; for (let k = 19; k < 23; k++) D3.hlPow[k] = 1;
}

// segment table texture for the light passes: per segment 4 texels (A, B, N, meta: dA, dB, kind, index)
D3.segTex = (() => {
  const all = [...D3.PER.segs.map((g, i) => ({ g, kind: 1, i, L: D3.PER })), ...D3.RIB.segs.map((g, i) => ({ g, kind: 2, i, L: D3.RIB }))];
  const N = all.length, data = new Float32Array(N * 4 * 4);
  all.forEach(({ g, kind, i, L }, j) => {
    const put = (k, a, b, c, d) => { const o = (k * N + j) * 4; data[o] = a; data[o + 1] = b; data[o + 2] = c; data[o + 3] = d; };
    put(0, g.A.x, g.A.y, g.A.z, 0); put(1, g.B.x, g.B.y, g.B.z, 0); put(2, g.n.x, g.n.y, g.n.z, 0);
    put(3, L.dist(g.s0), L.dist(g.s1), kind, i);
  });
  const t = new THREE.DataTexture(data, N, 4, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  t.userData.N = N; return t;
})();
D3.NSEG = D3.segTex.userData.N;
D3.NPER = D3.PER.segs.length; D3.NRIB = D3.RIB.segs.length;

// ---------------------------------------------------------------- GLSL
D3.GLSL_COMMON = /* glsl */`
#define PI 3.14159265
vec3 lin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

// the screen content: what Bendac's screens show (the programme video, the logo, the board panels)
D3.GLSL_CONTENT = /* glsl */`
uniform sampler2D uVid, uLogo, uPanels;
uniform float uLogoOn, uPage, uPage2, uWipe, uTime;
// explicit levels of detail: content is sampled at diode centres, so automatic mip selection would blur it
float gLodV = 0.0, gLodL = 0.0, gLodP = 0.0;
vec3 vidAt(vec2 uv){ return lin(textureLod(uVid, uv, gLodV).rgb); }
// the big screens: the programme, with Bendac's mark over the opening green
vec3 contentBig(vec2 uv){
  vec3 c = vidAt(uv);
  vec2 lu = (uv - vec2(0.5, 0.5)) / vec2(0.58, 0.58 * (16.0 / 9.0) / 3.285) + 0.5;
  if (uLogoOn > 0.001 && lu.x > 0.0 && lu.x < 1.0 && lu.y > 0.0 && lu.y < 1.0) {
    float a = textureLod(uLogo, lu, gLodL).a * uLogoOn;
    c = mix(c * (1.0 - 0.35 * uLogoOn), vec3(0.78), a);
  }
  return c;
}
// board panels: 0 logo on black, 1 tagline on green, 2 a band of the programme, 3 "premium LED screens"
vec3 panel(float type, float lu, float v, float aspect){
  if (type > 1.5 && type < 2.5) return vidAt(vec2(lu, 0.5 + (v - 0.5) * (16.0 / 9.0) / aspect)) * 1.1;
  float row = type < 0.5 ? 0.0 : (type < 1.5 ? 1.0 : 2.0);
  float cu = 0.5 + (lu - 0.5) * aspect / 13.3;
  vec3 c = vec3(0.0);
  if (cu > 0.0 && cu < 1.0) c = lin(textureLod(uPanels, vec2(cu, (row * 170.0 + 8.0 + v * 154.0) / 512.0), gLodP).rgb);
  else if (row > 1.5) c = lin(vec3(0.008, 0.565, 0.275));
  return c;
}
vec3 contentBoard(float s, float v, float plen, float aspect, float off){
  float idx = floor(s / plen), lu = fract(s / plen);
  // five-panel cycle: logo, footage, tagline, footage, green
  float ia = mod(idx + uPage + off, 5.0), ib = mod(idx + uPage2 + off, 5.0);
  float a = ia < 0.5 ? 0.0 : (ia < 1.5 ? 2.0 : (ia < 2.5 ? 1.0 : (ia < 3.5 ? 2.0 : 3.0)));
  float b = ib < 0.5 ? 0.0 : (ib < 1.5 ? 2.0 : (ib < 2.5 ? 1.0 : (ib < 3.5 ? 2.0 : 3.0)));
  vec3 c = lu < uWipe ? panel(b, lu, v, aspect) : panel(a, lu, v, aspect);
  c += vec3(0.05, 0.9, 0.35) * 2.0 * exp(-pow((lu - uWipe) * plen / 0.25, 2.0)) * step(0.001, uWipe) * step(uWipe, 0.999);
  return c;
}
vec3 contentPer(float s, float v){ return contentBoard(s, v, 12.0, 12.0 / 0.96, 0.0); }
vec3 contentRib(float s, float v){ return contentBoard(s, v, 16.0, 16.0 / 1.1, 2.0); }
`;

// lighting from every lit LED surface. Probe texture rows: 0 screens (2x2 cells each), 1 perimeter segs, 2 ribbon segs, 3 point lights
D3.GLSL_LIGHT = /* glsl */`
uniform sampler2D uProbe, uSeg;
uniform vec3 uScrC[2], uScrR[2], uScrU[2], uScrN[2];
uniform vec2 uScrWH[2];
uniform float uScrOn[2];
uniform float uFrontP, uFrontR;
uniform vec3 uHLPos[${D3.NHL}], uHLN[${D3.NHL}];
uniform float uHLOn[${D3.NHL}], uHLPow[${D3.NHL}];
uniform float uLScr, uLPer, uLRib, uLPt;
vec3 probe(int x, int y){ return texelFetch(uProbe, ivec2(x, y), 0).rgb; }
vec3 hlCol(int i){ return i == 18 || i > 18 ? vec3(0.05, 1.0, 0.32) * 3.0 : probe(i, 3); }
vec3 screenLight(vec3 P, vec3 N){
  vec3 E = vec3(0.0);
  for (int k = 0; k < 2; k++){
    if (uScrOn[k] < 0.003) continue;
    vec3 Ek = vec3(0.0);
    for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++){
      vec3 S = uScrC[k] + uScrR[k] * (float(i) - 0.5) * 0.5 * uScrWH[k].x + uScrU[k] * (float(j) - 0.5) * 0.5 * uScrWH[k].y;
      vec3 L = S - P; float d2 = dot(L, L); vec3 l = L * inversesqrt(d2);
      float ce = max(dot(uScrN[k], -l), 0.0);
      Ek += probe(k * 4 + j * 2 + i, 0) * max(dot(N, l), 0.0) * ce / (d2 + 4.0);
    }
    E += Ek * uScrOn[k];
  }
  return E * uLScr * 0.25 * ${(SCR[0].w * SCR[0].h).toFixed(1)};
}
// a straight run of board as a line light, integrated in closed form along its lit part
vec3 segLight(int j, vec3 P, vec3 N, float front){
  vec4 m = texelFetch(uSeg, ivec2(j, 3), 0);
  float dmin = min(m.x, m.y), dmax = max(m.x, m.y);
  float f = clamp((front - dmin) / max(dmax - dmin, 0.01), 0.0, 1.0);
  if (f <= 0.0) return vec3(0.0);
  vec3 A = texelFetch(uSeg, ivec2(j, 0), 0).xyz, Bq = texelFetch(uSeg, ivec2(j, 1), 0).xyz, nE = texelFetch(uSeg, ivec2(j, 2), 0).xyz;
  vec3 D = Bq - A; float Lg = length(D); vec3 dir = D / Lg;
  float s0 = m.x < m.y ? 0.0 : Lg * (1.0 - f), s1 = m.x < m.y ? Lg * f : Lg;
  vec3 AP = P - A; float t0 = dot(AP, dir); float h = max(length(AP - dir * t0), 0.6);
  vec3 Q = A + dir * clamp(t0, s0, s1); vec3 l = normalize(Q - P);
  float cr = max(dot(N, l), 0.0), ce = max(dot(nE, -l), 0.0);
  float I = (atan((s1 - t0) / h) - atan((s0 - t0) / h)) / h;
  int row = int(m.z + 0.5); int idx = int(m.w + 0.5);
  return probe(idx, row) * cr * (0.1 + 0.9 * ce) * I;
}
vec3 boardLight(vec3 P, vec3 N){
  vec3 E = vec3(0.0);
  if (uFrontP > 0.0) for (int j = 0; j < ${D3.NPER}; j++) E += segLight(j, P, N, uFrontP) * uLPer;
  if (uFrontR > 0.0) for (int j = ${D3.NPER}; j < ${D3.NSEG}; j++) E += segLight(j, P, N, uFrontR) * uLRib;
  return E;
}
// green light and the switch-on edges as small omni lights
vec3 pointLights(vec3 P, vec3 N){
  vec3 E = vec3(0.0);
  for (int i = 18; i < ${D3.NHL}; i++){
    if (uHLOn[i] < 0.003) continue;
    vec3 L = uHLPos[i] - P; float d2 = dot(L, L);
    E += hlCol(i) * uHLOn[i] * max(dot(N, L * inversesqrt(d2)), 0.0) / (d2 + 0.6);
  }
  return E * uLPt;
}
vec3 lightAt(vec3 P, vec3 N){ return screenLight(P, N) + boardLight(P, N) + pointLights(P, N); }
// cheap version for small things: every point light, each with its region's colour
vec3 lightCheap(vec3 P, vec3 N){
  vec3 E = vec3(0.0);
  for (int i = 0; i < ${D3.NHL}; i++){
    if (uHLOn[i] < 0.003) continue;
    vec3 L = uHLPos[i] - P; float d2 = dot(L, L); vec3 l = L * inversesqrt(d2);
    float ce = i < 18 ? max(dot(uHLN[i], -l), 0.0) * 0.85 + 0.15 : 1.0;
    float k = i < 18 ? uHLPow[i] * (i < 2 ? uLScr : (i < 10 ? uLPer : uLRib)) * 0.32 : uLPt;
    E += hlCol(i) * uHLOn[i] * k * max(dot(N, l), 0.0) * ce / (d2 + 1.0);
  }
  return E;
}
`;

// the bowl in GLSL (for the light map pass)
D3.GLSL_BOWL = /* glsl */`
vec4 bowlAt(float p, float d){ // xz position and outward normal
  p = mod(p, ${B.P.toFixed(4)});
  ${B.segs.map((s, i) => s.t === 'S'
    ? `if (p < ${s.p1.toFixed(4)}) { float l = p - ${s.p0.toFixed(4)}; return vec4(${s.o[0].toFixed(3)} + ${s.dir[0].toFixed(1)} * l + ${s.n[0].toFixed(1)} * d, ${s.o[1].toFixed(3)} + ${s.dir[1].toFixed(1)} * l + ${s.n[1].toFixed(1)} * d, ${s.n[0].toFixed(1)}, ${s.n[1].toFixed(1)}); }`
    : `if (p < ${s.p1.toFixed(4)}) { float a = ${s.a0.toFixed(5)} + (p - ${s.p0.toFixed(4)}) / ${B.RC.toFixed(1)}; vec2 n = vec2(cos(a), sin(a)); return vec4(vec2(${s.c[0].toFixed(3)}, ${s.c[1].toFixed(3)}) + n * (${B.RC.toFixed(1)} + d), n); }`).join('\n  ')}
  return vec4(0.0);
}
vec2 profAt(float s){ // s in metres along the profile -> (d, y)
  ${S.prof.slice(1).map((q, i) => `if (s < ${S.profS[i + 1].toFixed(4)}) return mix(vec2(${S.prof[i][0].toFixed(3)}, ${S.prof[i][1].toFixed(3)}), vec2(${q[0].toFixed(3)}, ${q[1].toFixed(3)}), (s - ${S.profS[i].toFixed(4)}) / ${(S.profS[i + 1] - S.profS[i]).toFixed(4)});`).join('\n  ')}
  return vec2(${S.prof[S.prof.length - 1][0].toFixed(3)}, ${S.prof[S.prof.length - 1][1].toFixed(3)});
}
`;
D3.LMB = { W: 512, BAND: 64 };   // bowl light map: p across, 3 bands (up, inward, down) of profile rows
D3.LMP = { W: 384, H: 270, X: 64, Z: 45 }; // pitch light map covering x -64..64, z -45..45
