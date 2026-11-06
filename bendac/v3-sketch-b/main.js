// Sketch B, "Lights on". A dark stadium at night; scroll switches Bendac screens on one at a time.
// One world, one camera path. The hero light (one green diode) flies to each screen and switches it on,
// and every lit screen really lights the grass, seats, goal and haze around it (light probed from the video).
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPhone = () => innerWidth / innerHeight < 0.9;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) { $('fallback').style.display = 'flex'; throw e; }
let dprCap = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(dprCap);
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 1500);

// ---------- video: one atlas, Home Park footage on top (1280x720), green band for the perimeter below (1280x160)
const video = $('v');
const V_SPLIT = 160 / 880; // uv v below this is the perimeter band
const vtex = new THREE.VideoTexture(video);
vtex.colorSpace = THREE.SRGBColorSpace;
vtex.minFilter = THREE.LinearFilter; vtex.magFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
const kick = () => { if (!reduced) video.play().catch(() => {}); };
kick();
['pointerdown', 'touchstart', 'scroll', 'keydown'].forEach((e) => addEventListener(e, kick, { once: true, passive: true }));
// reduced motion: the screens hold one still frame of the real footage instead of playing it.
// A paused video never fires requestVideoFrameCallback, so the frame is pushed to the GPU by hand.
if (reduced) {
  video.pause();
  video.addEventListener('loadeddata', () => { video.currentTime = 1.0; }, { once: true });
  video.addEventListener('seeked', () => { video.pause(); let n = 0; const push = () => { vtex.needsUpdate = true; if (++n < 4) requestAnimationFrame(push); }; push(); });
}

const logoTex = new THREE.TextureLoader().load('media/logo-bendac-white.webp');
logoTex.colorSpace = THREE.SRGBColorSpace;

// ---------- light probe: the video averaged into 8x3 colours on the GPU every frame.
// rows 0,1 = top and bottom half of the big-screen picture (4 columns each), row 2 = 8 slices of the perimeter band
const probeRT = new THREE.WebGLRenderTarget(8, 3, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, type: THREE.HalfFloatType });
const probeScene = new THREE.Scene();
const probeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
probeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { uVid: { value: vtex }, uSplit: { value: V_SPLIT } },
  vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D uVid; uniform float uSplit;
    void main(){
      vec2 c = floor(gl_FragCoord.xy);
      vec2 u0, u1;
      if (c.y < 1.5) { // big screen: row 0 top half, row 1 bottom half
        float x0 = floor(c.x / 2.0) / 4.0; // 4 columns spread over 8 texels (pairs repeat)
        float mid = (1.0 + uSplit) * 0.5;
        u0 = vec2(x0, c.y < 0.5 ? mid : uSplit); u1 = vec2(x0 + 0.25, c.y < 0.5 ? 1.0 : mid);
      } else { u0 = vec2(c.x / 8.0, 0.0); u1 = vec2((c.x + 1.0) / 8.0, uSplit); }
      vec3 s = vec3(0.0);
      for (int j = 0; j < 6; j++) for (int i = 0; i < 6; i++) s += texture2D(uVid, mix(u0, u1, (vec2(i, j) + 0.5) / 6.0)).rgb;
      gl_FragColor = vec4(s / 36.0, 1.0);
    }`,
  depthTest: false, depthWrite: false,
})));

// ---------- world layout (metres). x along the pitch (east +), z across (south +), y up.
const SCR = { c: new THREE.Vector3(-70.0, 11.6, 0), w: 9, h: 5, tilt: THREE.MathUtils.degToRad(6) }; // 45 sqm
SCR.n = new THREE.Vector3(Math.cos(SCR.tilt), -Math.sin(SCR.tilt), 0);
SCR.r = new THREE.Vector3(0, 0, -1).multiplyScalar(SCR.w / 2); // screen's right as seen from the pitch is north (-z)
SCR.u = new THREE.Vector3(Math.sin(SCR.tilt), Math.cos(SCR.tilt), 0).multiplyScalar(SCR.h / 2);
const RIB = { a: new THREE.Vector3(-48, 0.53, 36.3), d: new THREE.Vector3(1, 0, 0), len: 96, h: 0.9, tilt: THREE.MathUtils.degToRad(10) };
RIB.n = new THREE.Vector3(0, Math.sin(RIB.tilt), -Math.cos(RIB.tilt));

const U = {
  uProbe: { value: probeRT.texture },
  uScrC: { value: SCR.c }, uScrR: { value: SCR.r }, uScrU: { value: SCR.u }, uScrN: { value: SCR.n }, uScrOn: { value: 0 },
  uRibA: { value: RIB.a }, uRibD: { value: RIB.d }, uRibN: { value: RIB.n }, uRibLen: { value: RIB.len }, uRibFront: { value: 0 },
  uSparkP: { value: new THREE.Vector3() }, uSparkC: { value: new THREE.Vector3(0.55, 1.0, 0.62) }, uSparkI: { value: 1 },
  uCamP: { value: camera.position }, uTime: { value: 0 }, uGloss: { value: 1 },
};

const LIGHT = /* glsl */`
uniform sampler2D uProbe;
uniform vec3 uScrC, uScrR, uScrU, uScrN; uniform float uScrOn;
uniform vec3 uRibA, uRibD, uRibN; uniform float uRibLen, uRibFront;
uniform vec3 uSparkP, uSparkC; uniform float uSparkI;
uniform vec3 uCamP; uniform float uTime;
vec3 probe(int i, int j){ return texture2D(uProbe, vec2((float(i) + 0.5) / 8.0, (float(j) + 0.5) / 3.0)).rgb; }
// big screen as 4x2 small area lights, each with the colour of its part of the picture
vec3 screenLight(vec3 P, vec3 N, float omni){
  vec3 E = vec3(0.0);
  if (uScrOn < 0.002) return E;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 4; i++){
    vec2 st = vec2((float(i) + 0.5) * 0.5 - 1.0, float(j) - 0.5);
    vec3 S = uScrC + uScrR * st.x + uScrU * st.y;
    vec3 L = S - P; float d2 = dot(L, L); vec3 l = L * inversesqrt(d2);
    float cr = mix(max(dot(N, l), 0.0), 1.0, omni);
    float ce = max(dot(uScrN, -l), 0.0);
    E += probe(i * 2, 1 - j) * cr * ce / (d2 + 6.0);
  }
  return E * uScrOn * 520.0;
}
// perimeter ribbon as 8 line-light segments, integrated in closed form (no banding along 96 m)
vec3 ribbonLight(vec3 P, vec3 N, float omni){
  vec3 E = vec3(0.0);
  if (uRibFront < 0.01) return E;
  vec3 AP = P - uRibA; float t0 = dot(AP, uRibD); float h = max(length(AP - uRibD * t0), 0.35);
  float segL = uRibLen / 8.0;
  for (int k = 0; k < 8; k++){
    float s0 = float(k) * segL; float s1 = min(s0 + segL, uRibFront);
    if (s1 > s0) {
      vec3 Q = uRibA + uRibD * clamp(t0, s0, s1); vec3 l = normalize(Q - P);
      float cr = mix(max(dot(N, l), 0.0), 1.0, omni); float ce = max(dot(uRibN, -l), 0.0);
      float I = (atan((s1 - t0) / h) - atan((s0 - t0) / h)) / h;
      E += (probe(k, 2) * 0.75 + vec3(0.05)) * cr * (0.15 + 0.85 * ce) * I;
    }
  }
  return E * 3.8;
}
vec3 sparkLight(vec3 P, vec3 N){
  vec3 L = uSparkP - P; float d2 = dot(L, L);
  return uSparkC * uSparkI * max(dot(N, L * inversesqrt(d2)), 0.0) * 4.0 / (d2 + 0.35);
}
vec3 skyAmb(vec3 N){ return vec3(0.0011, 0.0014, 0.0024) * (0.45 + 0.55 * N.y); }
vec3 finish(vec3 col, vec3 P){
  float d = length(P - uCamP);
  float f = 1.0 - exp(-d * d * 0.0000045);
  col = mix(col, vec3(0.006, 0.008, 0.012), f);
  return 1.0 - exp(-col * 1.35);
}
`;

const litVS = /* glsl */`
${LIGHT}
attribute vec3 alb;
varying vec3 vW; varying vec3 vN; varying vec3 vAlb; varying vec3 vL;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vAlb = alb;
  vL = screenLight(vW, vN, 0.0) + ribbonLight(vW, vN, 0.0) + skyAmb(vN);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const litFS = /* glsl */`
${LIGHT}
varying vec3 vW; varying vec3 vN; varying vec3 vAlb; varying vec3 vL;
void main(){
  vec3 N = normalize(vN);
  vec3 col = vAlb * (vL + sparkLight(vW, N));
  gl_FragColor = vec4(finish(col, vW), 1.0);
  #include <colorspace_fragment>
}`;

// ---------- geometry builder: one merged mesh of boxes and quads with per-vertex albedo
class Builder {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  quad(o, u, v, nu, nv, col, nrm) { // origin, edge vectors, subdivisions
    const N = nrm || new THREE.Vector3().crossVectors(u, v).normalize();
    const base = this.p.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const a = i / nu, b = j / nv;
      this.p.push(o.x + u.x * a + v.x * b, o.y + u.y * a + v.y * b, o.z + u.z * a + v.z * b);
      this.n.push(N.x, N.y, N.z); this.c.push(col[0], col[1], col[2]);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = base + j * (nu + 1) + i;
      this.i.push(k, k + 1, k + nu + 1, k + 1, k + nu + 2, k + nu + 1);
    }
  }
  box(cx, cy, cz, sx, sy, sz, col, seg = 1) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const x0 = cx - sx / 2, y0 = cy - sy / 2, z0 = cz - sz / 2;
    const sx_ = Math.max(1, Math.round(sx / seg)), sy_ = Math.max(1, Math.round(sy / seg)), sz_ = Math.max(1, Math.round(sz / seg));
    this.quad(V(x0, y0, z0 + sz), V(sx, 0, 0), V(0, sy, 0), sx_, sy_, col); // +z
    this.quad(V(x0 + sx, y0, z0), V(-sx, 0, 0), V(0, sy, 0), sx_, sy_, col); // -z
    this.quad(V(x0 + sx, y0, z0 + sz), V(0, 0, -sz), V(0, sy, 0), sz_, sy_, col); // +x
    this.quad(V(x0, y0, z0), V(0, 0, sz), V(0, sy, 0), sz_, sy_, col); // -x
    this.quad(V(x0, y0 + sy, z0 + sz), V(sx, 0, 0), V(0, 0, -sz), sx_, sz_, col); // +y
    this.quad(V(x0, y0, z0), V(sx, 0, 0), V(0, 0, sz), sx_, sz_, col); // -y
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('alb', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    return new THREE.Mesh(g, mat);
  }
}
const litMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: litVS, fragmentShader: litFS });

const CONC = [0.16, 0.16, 0.17], DARK = [0.05, 0.05, 0.055], STEEL = [0.11, 0.115, 0.12], WHITE = [0.8, 0.8, 0.8];
const SEAT = [0.03, 0.15, 0.12], SEAT_W = [0.55, 0.58, 0.58];
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const world = new Builder();

// a stand: rows climb away from the pitch. F = unit vector pointing at the pitch, S = along the stand.
function stand({ front, F, S, len, rows, d = 0.8, rise = 0.38, y0 = 1.0, roofY = 0, roofFront = 2.6, letters = null }) {
  const B = F.clone().negate();
  const start = front.clone().addScaledVector(S, -len / 2);
  const segs = Math.round(len / 3);
  world.quad(start.clone(), S.clone().multiplyScalar(len), V3(0, y0, 0), segs, 1, CONC, F); // front wall
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * rise;
    const o = start.clone().addScaledVector(B, r * d).setY(y);
    world.quad(o, B.clone().multiplyScalar(d), S.clone().multiplyScalar(len), 1, segs, CONC, V3(0, 1, 0)); // tread
    world.quad(o.clone().addScaledVector(B, d), S.clone().multiplyScalar(len), V3(0, rise, 0), segs, 1, CONC, F); // riser
    for (let s = 0.4; s < len - 0.3; s += 0.52) {
      if ((s % 13) < 1.3) continue; // aisle
      const white = letters && letters(s / len, r / rows);
      const col = white ? SEAT_W : SEAT;
      const p = start.clone().addScaledVector(S, s).addScaledVector(B, r * d + 0.3).setY(y + 0.42);
      const w = S.clone().multiplyScalar(0.44);
      world.quad(p.clone().addScaledVector(S, -0.22), w, B.clone().multiplyScalar(0.38), 1, 1, col, V3(0, 1, 0)); // pan
      const bk = p.clone().addScaledVector(S, -0.22).addScaledVector(B, 0.38);
      world.quad(bk, w, V3(0, 0.46, 0).addScaledVector(B, 0.08), 1, 1, col, F.clone().add(V3(0, 0.15, 0)).normalize()); // back
    }
  }
  const top = y0 + rows * rise, back = start.clone().addScaledVector(B, rows * d);
  const wallTop = roofY || top + 1.2;
  world.quad(back.clone().setY(top), S.clone().multiplyScalar(len), V3(0, wallTop - top, 0), segs, 2, DARK, F); // back wall
  if (roofY) {
    const r0 = start.clone().addScaledVector(F, roofFront).setY(roofY);
    const depth = rows * d + roofFront + 0.4;
    world.quad(r0, S.clone().multiplyScalar(len), B.clone().multiplyScalar(depth), segs, Math.round(depth / 3), DARK, V3(0, -1, 0)); // underside
    world.quad(r0.clone().setY(roofY + 0.3).addScaledVector(B, depth), S.clone().multiplyScalar(len), F.clone().multiplyScalar(depth), segs, 2, STEEL, V3(0, 1, 0)); // top
    world.quad(r0.clone().setY(roofY - 1.0), S.clone().multiplyScalar(len), V3(0, 1.3, 0), segs, 1, [0.2, 0.21, 0.22], F); // fascia
    for (let s = 8; s < len; s += 16) { // roof columns at the back
      const c = start.clone().addScaledVector(S, s).addScaledVector(B, rows * d + 0.2);
      world.box(c.x, roofY / 2, c.z, 0.35, roofY, 0.35, STEEL, 3);
    }
  }
}
// "PA" in white seats on the north stand, like Home Park
const PA = (u, v) => { const x = (u - 0.38) * 34, y = v * 8; // crude letter mask in seat units
  const P = (x > 0 && x < 1.2 && y > 1 && y < 7) || (x > 0 && x < 4 && y > 5.8 && y < 7) || (x > 3 && x < 4.2 && y > 4 && y < 7) || (x > 0 && x < 4 && y > 3.8 && y < 5);
  const xa = x - 7; const A = (xa > 0 && xa < 1.2 && y > 1 && y < 7) || (xa > 3 && xa < 4.2 && y > 1 && y < 7) || (xa > 0 && xa < 4.2 && y > 5.8 && y < 7) || (xa > 0 && xa < 4.2 && y > 3.6 && y < 4.8);
  return P || A; };
stand({ front: V3(0, 0, 39.6), F: V3(0, 0, -1), S: V3(-1, 0, 0), len: 104, rows: 24, roofY: 15.2 });
stand({ front: V3(0, 0, -39.6), F: V3(0, 0, 1), S: V3(1, 0, 0), len: 104, rows: 24, roofY: 15.2, letters: PA });
stand({ front: V3(-58, 0, 0), F: V3(1, 0, 0), S: V3(0, 0, -1), len: 66, rows: 14 });
stand({ front: V3(58, 0, 0), F: V3(-1, 0, 0), S: V3(0, 0, 1), len: 66, rows: 14, roofY: 11.5 });

// goals
for (const sx of [-1, 1]) {
  const x = sx * 52.5;
  world.box(x, 1.22, -3.66, 0.12, 2.44, 0.12, WHITE); world.box(x, 1.22, 3.66, 0.12, 2.44, 0.12, WHITE);
  world.box(x, 2.44, 0, 0.12, 0.12, 7.44, WHITE, 1);
  world.box(x + sx * 1.8, 1.22, -3.66, 0.06, 2.44, 0.06, [0.4, 0.4, 0.4]); world.box(x + sx * 1.8, 1.22, 3.66, 0.06, 2.44, 0.06, [0.4, 0.4, 0.4]);
}
// floodlight masts at the corners (switched off; they read as silhouettes)
for (const [mx, mz] of [[-66, -50], [66, -50], [-66, 50], [66, 50]]) {
  world.box(mx, 19, mz, 0.9, 38, 0.9, STEEL, 4);
  world.box(mx, 38.5, mz, 7, 3.6, 0.7, STEEL, 1);
}
// big screen: housing and gantry behind the west stand
{
  const c = SCR.c;
  world.box(c.x - 0.7, c.y, c.z, 0.6, SCR.h + 0.1, SCR.w + 0.16, DARK, 1); // sits behind the tilted face so it never covers it
  for (const z of [-3.2, 3.2]) world.box(c.x - 0.6, (c.y - SCR.h / 2) / 2, z, 0.4, c.y - SCR.h / 2, 0.4, STEEL, 2);
  world.box(c.x - 0.6, c.y - SCR.h / 2 - 0.3, 0, 0.45, 0.45, 8, STEEL, 2);
}
// perimeter housing (padded top, black body) behind the LED face
world.box(0, 0.55, RIB.a.z + 0.32, RIB.len + 0.3, 1.1, 0.5, DARK, 2);
scene.add(world.mesh(litMat));

// ---------- pitch with stripes and markings, lit like everything else, plus a wet sheen that mirrors the screens
const pitchGeo = new THREE.PlaneGeometry(124, 88, 124, 88); pitchGeo.rotateX(-Math.PI / 2);
const al = new Float32Array(pitchGeo.attributes.position.count * 3).fill(1);
pitchGeo.setAttribute('alb', new THREE.BufferAttribute(al, 3));
const pitchMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uVid: { value: vtex }, uLogo: { value: logoTex } },
  vertexShader: litVS,
  fragmentShader: /* glsl */`
    ${LIGHT}
    uniform float uGloss;
    varying vec3 vW; varying vec3 vN; varying vec3 vAlb; varying vec3 vL;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
    float lineD(vec2 p){
      vec2 a = abs(p);
      float d = 1e3;
      d = min(d, max(abs(a.y - 34.0), a.x - 52.5));            // touchlines
      d = min(d, max(abs(a.x - 52.5), a.y - 34.0));            // goal lines
      d = min(d, max(abs(p.x), a.y - 34.0));                   // halfway
      d = min(d, abs(length(p) - 9.15));                       // centre circle
      d = min(d, max(abs(a.x - 36.0), a.y - 20.16));           // penalty box front
      d = min(d, max(abs(a.y - 20.16), max(36.0 - a.x, a.x - 52.5)));
      d = min(d, max(abs(a.x - 47.0), a.y - 9.16));            // six yard box
      d = min(d, max(abs(a.y - 9.16), max(47.0 - a.x, a.x - 52.5)));
      d = min(d, max(abs(length(vec2(a.x - 41.5, p.y)) - 9.15), a.x - 36.0)); // arc
      d = min(d, length(vec2(a.x - 41.5, p.y)) - 0.1);        // spot
      d = min(d, length(p) - 0.1);
      return d;
    }
    void main(){
      vec2 p = vW.xz;
      float stripe = mod(floor((p.x + 52.5) / 5.25), 2.0);
      float n = vnoise(p * 1.7) * 0.45 + vnoise(p * 0.31) * 0.55;
      vec3 grass = mix(vec3(0.03, 0.082, 0.028), vec3(0.042, 0.108, 0.036), stripe) * (0.82 + 0.36 * n);
      float d = lineD(p); float fw = fwidth(d) + 0.001;
      float lm = 1.0 - smoothstep(0.06 - fw, 0.06 + fw, d);
      vec3 alb = mix(grass, vec3(0.62), lm);
      vec3 N = vec3(0.0, 1.0, 0.0);
      vec3 col = alb * (vL + sparkLight(vW, N));
      // dew sheen: a blurred mirror of the lit screens on the wet grass, stretched toward the viewer
      vec3 V = normalize(vW - uCamP); vec3 R = reflect(V, N);
      vec3 sheen = vec3(0.0);
      if (uScrOn > 0.01 && R.x < -0.05) {
        float t = (uScrC.x + 0.3 - vW.x) / R.x; vec3 H = vW + R * t;
        vec2 q = vec2((uScrC.z - H.z) / ${(SCR.w / 2).toFixed(2)}, (H.y - uScrC.y) / ${(SCR.h / 2).toFixed(2)});
        float m = exp(-pow(max(abs(q.x) - 0.85, 0.0) * 3.0, 2.0)) * exp(-pow(max(abs(q.y) - 0.8, 0.0) * 0.9, 2.0));
        int ci = int(clamp((q.x * 0.5 + 0.5) * 4.0, 0.0, 3.0)) * 2;
        sheen += (probe(ci, 0) + probe(ci, 1)) * 0.5 * m * uScrOn * 0.55;
      }
      if (uRibFront > 0.01 && R.z > 0.02) {
        float t = (uRibA.z - vW.z) / R.z; vec3 H = vW + R * t;
        float s = H.x - uRibA.x;
        float m = exp(-pow((H.y - 0.5) / 1.6, 2.0)) * smoothstep(-8.0, 3.0, s) * smoothstep(uRibFront + 3.0, uRibFront - 6.0, s) * smoothstep(uRibLen + 8.0, uRibLen - 3.0, s);
        int k = int(clamp(s / 12.0, 0.0, 7.0));
        sheen += (probe(k, 2) + vec3(0.04)) * m * 0.32;
      }
      float fres = pow(1.0 - max(dot(-V, N), 0.0), 5.0);
      col += sheen * 0.5 * fres * uGloss;
      gl_FragColor = vec4(finish(col, vW), 1.0);
      #include <colorspace_fragment>
    }`,
});
pitchMat.extensions = { derivatives: true };
scene.add(new THREE.Mesh(pitchGeo, pitchMat));

// ---------- sky: night, a faint glow of town light at the horizon
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `varying vec3 vD; void main(){
    float h = max(vD.y, 0.0);
    vec3 c = mix(vec3(0.0042, 0.0046, 0.0058), vec3(0.0009, 0.001, 0.0018), pow(h, 0.4));
    c = 1.0 - exp(-c * 1.35);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`,
}));
scene.add(sky);

// ---------- the big screen surface: diodes on a black mask, switching on outward from where the light touched it
const scrMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uVid: { value: vtex }, uSplit: { value: V_SPLIT }, uWave: { value: 0 }, uHit: { value: new THREE.Vector2(0.5, 0.5) }, uCells: { value: new THREE.Vector2(900, 500) } },
  vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: /* glsl */`
    ${LIGHT}
    uniform sampler2D uVid; uniform float uSplit, uWave; uniform vec2 uHit, uCells;
    varying vec2 vUv; varying vec3 vW;
    void main(){
      vec2 g = vUv * uCells; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
      vec2 cuv = (id + 0.5) / uCells;
      vec3 c = texture2D(uVid, vec2(cuv.x, mix(uSplit, 1.0, cuv.y))).rgb;
      float px = length(fwidth(g));
      float diode = smoothstep(0.34, 0.2, length(f));
      float resolve = smoothstep(0.3, 0.8, px);
      float shape = mix(diode * 2.2, 1.0, resolve);
      float d = length((cuv - uHit) * vec2(1.8, 1.0));
      float on = smoothstep(uWave, uWave - 0.12, d);
      float edge = exp(-pow((d - uWave) / 0.035, 2.0)) * step(0.001, uWave) * step(uWave, 1.3);
      vec3 col = c * on * 1.5 * shape + vec3(0.35, 1.0, 0.55) * edge * 2.5 * shape;
      // switched-off mask: near black, catching a little of the hero light
      vec3 mask = vec3(0.0035) * (1.0 + sparkLight(vW, ${'vec3(' + SCR.n.x.toFixed(3) + ',' + SCR.n.y.toFixed(3) + ',0.0)'}) * 6.0);
      col += mask * (1.0 - on);
      gl_FragColor = vec4(finish(col, vW), 1.0);
      #include <colorspace_fragment>
    }`,
});
scrMat.extensions = { derivatives: true };
{
  const g = new THREE.PlaneGeometry(SCR.w, SCR.h);
  const m = new THREE.Mesh(g, scrMat);
  m.position.copy(SCR.c);
  m.lookAt(SCR.c.clone().add(SCR.n));
  scene.add(m);
}

// ---------- the perimeter ribbon (IMPAKT): 8 mm diodes, panels alternate Bendac's AccuVision racing film and the Bendac logo
const ribMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uVid: { value: vtex }, uSplit: { value: V_SPLIT }, uLogo: { value: logoTex }, uCells: { value: new THREE.Vector2(12000, 112) }, uScroll: { value: 0 } },
  vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: /* glsl */`
    ${LIGHT}
    uniform sampler2D uVid, uLogo; uniform float uSplit, uScroll; uniform vec2 uCells;
    varying vec2 vUv; varying vec3 vW;
    void main(){
      vec2 g = vUv * uCells; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
      vec2 cuv = (id + 0.5) / uCells;
      // plane u runs east to west (reads left to right from the pitch); xm is metres from the west end
      float xm = (1.0 - cuv.x) * uRibLen;
      float panel = floor(cuv.x * uRibLen / 12.0); float pu = fract(cuv.x * uRibLen / 12.0);
      vec3 c;
      if (mod(panel, 2.0) < 0.5) {
        c = texture2D(uVid, vec2(fract(pu * 1.6), cuv.y * uSplit * 0.98 + 0.001)).rgb * 0.9; // AccuVision film, two windows per panel at true aspect
      } else {
        float p3 = fract(pu * 3.0);
        vec2 lu = vec2((p3 - 0.5) / 0.52 + 0.5, (cuv.y - 0.5) / 0.66 + 0.5);
        float inside = step(0.0, lu.x) * step(lu.x, 1.0) * step(0.0, lu.y) * step(lu.y, 1.0);
        vec4 lg = texture2D(uLogo, clamp(lu, 0.0, 1.0));
        c = vec3(0.004, 0.02, 0.01) + lg.rgb * lg.a * inside * 1.1;
      }
      float px = length(fwidth(g));
      float shape = mix(smoothstep(0.36, 0.2, length(f)) * 2.0, 1.0, smoothstep(0.3, 0.8, px));
      float on = smoothstep(uRibFront + 0.15, uRibFront - 0.4, xm);
      float edge = exp(-pow((xm - uRibFront) / 0.5, 2.0)) * step(0.01, uRibFront) * step(uRibFront, uRibLen - 0.01);
      vec3 col = c * on * 1.45 * shape + vec3(0.35, 1.0, 0.55) * edge * 2.0;
      col += vec3(0.01) * (1.0 + sparkLight(vW, vec3(0.0, 0.17, -0.98)) * 5.0) * (1.0 - on);
      gl_FragColor = vec4(finish(col, vW), 1.0);
      #include <colorspace_fragment>
    }`,
});
ribMat.extensions = { derivatives: true };
{
  const g = new THREE.PlaneGeometry(RIB.len, RIB.h);
  const m = new THREE.Mesh(g, ribMat);
  m.position.copy(RIB.a).addScaledVector(RIB.d, RIB.len / 2);
  m.lookAt(m.position.clone().add(RIB.n));
  scene.add(m);
}

// ---------- haze: light scattered in the night air around each lit screen (additive, no depth write)
const hazeScr = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    ${LIGHT}
    varying vec2 vUv; varying vec3 vC;
    void main(){
      vUv = uv;
      vec3 c = vec3(0.0); for (int i = 0; i < 4; i++) c += probe(i * 2, 0) + probe(i * 2, 1);
      vec3 toCam = normalize(uCamP - uScrC);
      vC = c / 8.0 * uScrOn * smoothstep(-0.1, 0.5, dot(toCam, uScrN));
      vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam)); vec3 up = normalize(cross(toCam, right));
      vec3 P = uScrC + uScrN * 0.6 + (right * position.x * 40.0 + up * position.y * 28.0);
      gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
    }`,
  fragmentShader: `
    varying vec2 vUv; varying vec3 vC;
    void main(){
      vec2 q = (vUv - 0.5) * vec2(40.0 / 9.0, 28.0 / 5.0) * 2.0;
      vec2 o = max(abs(q) - vec2(0.9), 0.0);
      float r2 = dot(o, o);
      vec2 e = abs(vUv - 0.5) * 2.0;
      float a = (exp(-r2 * 3.0) * 0.55 + exp(-r2 * 0.35) * 0.3 + exp(-dot(q, q) * 0.08) * 0.1) * smoothstep(1.0, 0.55, max(e.x, e.y));
      vec3 c = vC * a * 0.22;
      gl_FragColor = vec4(1.0 - exp(-c), 1.0);
    }`,
}));
hazeScr.frustumCulled = false; scene.add(hazeScr);

const hazeRib = (() => {
  const n = 48; const pos = []; const idx = [];
  for (let i = 0; i <= n; i++) for (const o of [-1, 1]) pos.push(i / n, o, 0);
  for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      ${LIGHT}
      varying float vO; varying vec3 vC;
      void main(){
        float s = position.x * (uRibLen + 6.0) - 3.0;
        vec3 A = uRibA + uRibD * s;
        vec3 toCam = normalize(uCamP - A);
        vec3 side = normalize(cross(uRibD, toCam));
        vO = position.y;
        int k = int(clamp(s / 12.0, 0.0, 7.0));
        float lit = smoothstep(uRibFront + 1.0, uRibFront - 2.0, s) * step(0.01, uRibFront);
        float ends = smoothstep(-3.0, 1.0, s) * smoothstep(uRibLen + 3.0, uRibLen - 1.0, s);
        vC = (probe(k, 2) + vec3(0.05)) * lit * ends * smoothstep(-0.2, 0.3, dot(toCam, uRibN));
        gl_Position = projectionMatrix * viewMatrix * vec4(A + side * position.y * 3.2 + vec3(0.0, 0.25, 0.0), 1.0);
      }`,
    fragmentShader: `varying float vO; varying vec3 vC;
      void main(){ float a = exp(-vO * vO * 9.0) * 0.6 + exp(-vO * vO * 2.2) * 0.25; vec3 c = vC * a * 1.1; gl_FragColor = vec4(1.0 - exp(-c), 1.0); }`,
  }));
  m.frustumCulled = false; scene.add(m); return m;
})();

// ---------- the hero light: one green diode with a soft halo; stays a fixed minimum size on screen when far away
const spark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
  uniforms: { ...U, uSize: { value: 1 }, uA: { value: 1 } }, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  vertexShader: `uniform vec3 uSparkP, uCamP; uniform float uSize; varying vec2 vUv;
    void main(){ vUv = uv; vec4 mv = viewMatrix * vec4(uSparkP, 1.0); mv.xy += position.xy * uSize; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uA; varying vec2 vUv;
    void main(){ vec2 q = (vUv - 0.5) * 2.0; float r = length(q);
      float core = smoothstep(0.075, 0.035, r); float halo = exp(-r * r * 22.0) * 0.9 + exp(-r * r * 4.5) * 0.18;
      vec3 c = vec3(1.0) * core * 1.6 + vec3(0.25, 1.0, 0.45) * halo;
      gl_FragColor = vec4(c * uA, 1.0); }`,
}));
spark.frustumCulled = false; spark.renderOrder = 10; scene.add(spark);

// ---------- the story: t in [0,1] from scroll. Keyframes for the camera, the light and each screen.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
function pathAt(keys, t) { // keys: [t, Vector3]; Catmull-Rom through points, eased within each span
  if (t <= keys[0][0]) return keys[0][1].clone();
  const n = keys.length;
  if (t >= keys[n - 1][0]) return keys[n - 1][1].clone();
  let i = 0; while (t > keys[i + 1][0]) i++;
  const k = (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
  const p0 = keys[Math.max(0, i - 1)][1], p1 = keys[i][1], p2 = keys[i + 1][1], p3 = keys[Math.min(n - 1, i + 2)][1];
  const t2 = k * k, t3 = t2 * k;
  return new THREE.Vector3(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * k + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * k + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * ((2 * p1.z) + (-p0.z + p2.z) * k + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3));
}
const HIT = SCR.c.clone().addScaledVector(SCR.n, 0.25);
const EXIT = SCR.c.clone().addScaledVector(SCR.u, -1).addScaledVector(SCR.r, -1).addScaledVector(SCR.n, 0.3); // bottom corner nearest the perimeter
const RIB0 = RIB.a.clone().addScaledVector(RIB.n, 0.12), RIB1 = RIB0.clone().addScaledVector(RIB.d, RIB.len);
const T = { flyA: 0.10, hit: 0.28, waveB: 0.345, l2a: 0.345, l2b: 0.535, leave: 0.535, ribA: 0.67, ribB: 0.855, l3a: 0.75, l3b: 0.885, endA: 0.91 };
const sparkKeys = [
  [0.0, V3(16, 1.25, 4.6)], [T.flyA, V3(16, 1.3, 4.6)], [0.16, V3(-12, 4.2, 3.2)], [0.215, V3(-50, 6.8, 1.2)],
  [0.252, V3(-62, 9.5, 0.4)], [T.hit, HIT],
];
// after the ribbon the light comes back to the centre spot and waits there, ready for the next screen
const sparkKeys3 = [[T.ribB, RIB1], [0.925, V3(30, 4.5, 20)], [0.985, V3(0, 2.2, 0)]];
const sparkKeys2 = [[T.leave, EXIT], [0.605, V3(-58, 4.5, 24)], [T.ribA, RIB0]];
// camera: [t, position, target, phone pull-back]
const camKeys = [
  [0.00, V3(24, 1.75, 7.2), V3(4, 1.3, 2.5), 1.0],
  [T.flyA, V3(22.5, 1.8, 6.8), V3(-6, 2.0, 2.0), 1.0],
  [0.20, V3(8, 2.6, 5.2), V3(-50, 6.0, 1.0), 1.0],
  [T.hit, V3(-14, 3.4, 3.2), V3(-70, 10.6, 0), 1.0],
  [0.39, V3(-36, 3.6, 2.6), V3(-70, 8.4, 0), 1.0],
  [0.5, V3(-41, 3.4, 4.8), V3(-70, 8.8, -0.5), 1.0],
  [0.6, V3(-44, 3.4, 12), V3(-60, 4.5, 22), 1.0],
  [T.ribA, V3(-55, 1.9, 22.5), V3(-36, 0.8, 36.4), 1.0],
  [0.78, V3(-36, 1.6, 25), V3(-6, 0.8, 36.4), 1.0],
  [T.ribB, V3(-14, 1.9, 25), V3(16, 1.0, 36), 1.0],
  [0.94, V3(30, 12, 2), V3(-14, 1.5, 12), 1.0, V3(40, 24, 14), V3(-24, 1, 16)],
  [1.00, V3(64, 28, -14), V3(-24, 0, 10), 1.0, V3(74, 52, 12), V3(-22, 0, 14)],
];
const camPosKeys = camKeys.map((k) => [k[0], k[1]]);
const camTgtKeys = camKeys.map((k) => [k[0], k[2]]);
const camPosKeysP = camKeys.map((k) => [k[0], k[4] || k[1]]);
const camTgtKeysP = camKeys.map((k) => [k[0], k[5] || k[2]]);
function pullAt(t) { let i = 0; while (i < camKeys.length - 1 && t > camKeys[i + 1][0]) i++; const a = camKeys[i], b = camKeys[Math.min(i + 1, camKeys.length - 1)]; return a === b ? a[3] : lerp(a[3], b[3], smooth(a[0], b[0], t)); }

// ---------- input: scroll drives t; the cursor or a dragging finger steers the look and carries the first light
// the story plays over #track; after it, the closing "Start a project" screen scrolls in over the last frame
let target = 0, cur = 0, closing = 0;
const trackEl = $('track'), startEl = $('start'), cta = $('cta');
const storyMax = () => Math.max(1, trackEl.offsetHeight - innerHeight);
const readScroll = () => { const m = storyMax(); target = Math.min(1, Math.max(0, scrollY / m)); closing = Math.min(1, Math.max(0, (scrollY - m) / (innerHeight * 0.8))); };
window.__storyScroll = (t) => t > 1 ? document.documentElement.scrollHeight - innerHeight : storyMax() * t;
cta.addEventListener('click', (e) => { e.preventDefault(); startEl.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); history.replaceState(null, '', '#start'); });
addEventListener('scroll', readScroll, { passive: true });
const ptr = { x: 0, y: 0, tx: 0, ty: 0, active: false };
const setPtr = (cx, cy) => { ptr.tx = (cx / innerWidth) * 2 - 1; ptr.ty = -((cy / innerHeight) * 2 - 1); ptr.active = true; };
addEventListener('mousemove', (e) => setPtr(e.clientX, e.clientY), { passive: true });
addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) setPtr(t.clientX, t.clientY); }, { passive: true });
addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) setPtr(t.clientX, t.clientY); }, { passive: true });
addEventListener('touchend', () => { ptr.tx = 0; ptr.ty = 0; ptr.active = false; }, { passive: true });
document.addEventListener('mouseleave', () => { ptr.tx = 0; ptr.ty = 0; });

function resize() {
  const ph = isPhone();
  camera.fov = ph ? 64 : 40; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setPixelRatio(dprCap); renderer.setSize(innerWidth, innerHeight, false);
}
addEventListener('resize', resize); resize();

// ---------- overlay: labels fade in attached to their screen by a thin leader line
const labs = { l1: $('l1'), l2: $('l2'), l3: $('l3') };
const scrim = $('scrim');
const endEl = $('end'), hint = $('hint'), cn = $('cn'), ll = $('ll'), lc = $('lc');
const ribAnchor = V3(-30, 0.98, 36.25);
const screenAnchor = SCR.c.clone().addScaledVector(SCR.u, -1.0).addScaledVector(SCR.r, 0.35);
function win(t, a, b, f = 0.035) { return smooth(a, a + f, t) * (1 - smooth(b - f, b, t)); }
const tmp = new THREE.Vector3();
function project(p) { tmp.copy(p).project(camera); return { x: (tmp.x * 0.5 + 0.5) * innerWidth, y: (-tmp.y * 0.5 + 0.5) * innerHeight, ok: tmp.z < 1 && tmp.z > -1 }; }
let lastCn = '';
function overlay(t, sparkP) {
  const o1 = 1 - smooth(0.06, 0.11, t), o2 = win(t, T.l2a, T.l2b), o3 = win(t, T.l3a, T.l3b), oe = smooth(T.endA, T.endA + 0.05, t);
  const set = (el, o) => { el.style.opacity = o.toFixed(3); el.style.transform = (innerWidth >= 900 ? 'translateY(calc(-50% + ' : 'translateY(calc(0px + ') + ((1 - o) * 14).toFixed(1) + 'px))'; };
  set(labs.l1, o1 * intro); set(labs.l2, o2); set(labs.l3, o3);
  const away = 1 - smooth(0.0, 0.45, closing);
  scrim.style.opacity = (Math.max(o1 * intro, o2, o3, oe) * away).toFixed(3);
  endEl.style.opacity = (oe * away).toFixed(3);
  $('count').style.opacity = away.toFixed(3);
  cta.style.opacity = (1 - smooth(0.5, 0.85, closing)).toFixed(3); cta.style.pointerEvents = closing > 0.8 ? 'none' : 'auto';
  hint.style.opacity = ((1 - smooth(0.005, 0.03, t)) * intro).toFixed(3);
  const c = t < T.hit ? '01' : t < 0.63 ? '02' : '03'; if (c !== lastCn) { cn.textContent = c; lastCn = c; }
  // leader line from the visible label to its object
  let el = null, anchor = null, o = 0;
  if (o1 * intro > 0.02) { el = labs.l1; anchor = sparkP; o = o1 * intro; }
  else if (o2 > 0.02) { el = labs.l2; anchor = screenAnchor; o = o2; }
  else if (o3 > 0.02) { el = labs.l3; anchor = ribAnchor; o = o3; }
  if (!el) { ll.setAttribute('opacity', 0); lc.setAttribute('opacity', 0); return; }
  const a = project(anchor); const r = el.getBoundingClientRect();
  const wide = innerWidth >= 900;
  const sx = wide ? r.right + 14 : r.left + 0.5, sy = wide ? r.top + 6 : r.top - 12;
  const vis = a.ok && a.x > -20 && a.x < innerWidth + 20 && a.y > -20 && a.y < innerHeight + 20;
  ll.setAttribute('x1', sx); ll.setAttribute('y1', sy); ll.setAttribute('x2', a.x); ll.setAttribute('y2', a.y);
  ll.setAttribute('opacity', vis ? (o * 0.9).toFixed(3) : 0); lc.setAttribute('cx', a.x); lc.setAttribute('cy', a.y); lc.setAttribute('opacity', vis ? o.toFixed(3) : 0);
}

// ---------- loop
const frames = []; const videoTimes = [];
window.__probe = { frames, videoTimes };
window.__state = () => { const q = sparkP.clone().project(camera); return { target, cur, dpr: renderer.getPixelRatio(), spark: sparkP.toArray().map((v) => +v.toFixed(2)), sparkScreen: [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(3)], cam: camera.position.toArray().map((v) => +v.toFixed(1)), sparkA: spark.material.uniforms.uA.value, sparkSize: spark.material.uniforms.uSize.value }; };
let last = performance.now(), t0 = last, intro = 0, nFrames = 0, slowAcc = 0;
const sparkP = new THREE.Vector3(), camP = new THREE.Vector3(), camT = new THREE.Vector3(), look = new THREE.Vector3();
readScroll(); cur = target;

function tick(now) {
  const dt = now - last; frames.push(dt); last = now; nFrames++;
  const time = (now - t0) / 1000;
  intro = Math.min(1, intro + dt / 900);
  cur += (target - cur) * (reduced ? 0.25 : 0.085);
  if (Math.abs(target - cur) < 1e-5) cur = target;
  const t = cur;
  ptr.x += (ptr.tx - ptr.x) * 0.06; ptr.y += (ptr.ty - ptr.y) * 0.06;

  // the hero light
  if (t <= T.hit) sparkP.copy(pathAt(sparkKeys, t));
  else if (t < T.leave) sparkP.copy(HIT);
  else if (t < T.ribA) sparkP.copy(pathAt(sparkKeys2, t));
  else if (t < T.ribB) sparkP.copy(RIB0).addScaledVector(RIB.d, RIB.len * smooth(T.ribA, T.ribB, t));
  else sparkP.copy(pathAt(sparkKeys3, t));
  const carry = (1 - smooth(T.flyA - 0.03, T.flyA + 0.02, t)) * (reduced ? 0 : 1);
  sparkP.z += -ptr.x * 2.6 * carry; sparkP.y += ptr.y * 1.1 * carry;
  if (!reduced) sparkP.y += Math.sin(time * 1.7) * 0.06 * (t < T.flyA ? 1 : 0.3);
  const atScreen = smooth(T.hit - 0.01, T.hit + 0.02, t) * (1 - smooth(T.leave - 0.02, T.leave + 0.005, t));
  const pulse = t > T.ribB + 0.06 ? 0.8 + 0.35 * Math.sin(time * 2.4) * (reduced ? 0 : 1) : 1;
  const flight = smooth(T.flyA, T.flyA + 0.04, t) * (1 - smooth(T.hit - 0.05, T.hit, t)) + smooth(T.leave, T.leave + 0.02, t) * (1 - smooth(T.ribA - 0.02, T.ribA, t)) * 0.6;
  U.uSparkI.value = (1 - atScreen * 0.92) * pulse * (1 + 10 * flight);
  U.uSparkP.value.copy(sparkP);
  spark.material.uniforms.uA.value = (1 - atScreen * 0.9) * pulse * Math.min(1, intro * 1.5);

  // screens
  const wave = smooth(T.hit, T.waveB, t);
  scrMat.uniforms.uWave.value = reduced ? (wave > 0 ? 1.4 : 0) * wave : wave * 1.3;
  U.uScrOn.value = Math.min(1, wave * wave * 1.2) * (reduced ? 1 : 1);
  U.uRibFront.value = RIB.len * smooth(T.ribA, T.ribB, t) + (t > T.ribB ? 0.5 : 0);

  // camera
  const ph = isPhone();
  camP.copy(pathAt(ph ? camPosKeysP : camPosKeys, t)); camT.copy(pathAt(ph ? camTgtKeysP : camTgtKeys, t));
  if (ph) { const k = pullAt(t); camP.sub(camT).multiplyScalar(k).add(camT); }
  // while the light travels, the camera keeps it in view: it is the guide through the venue
  const follow = 0.3 * win(t, T.flyA + 0.01, T.hit - 0.01, 0.03) + 0.92 * win(t, T.leave - 0.01, T.ribA + 0.035, 0.06)
    + (ph ? 0.55 : 0.3) * win(t, T.ribA + 0.02, T.ribB + 0.03, 0.05);
  camT.lerp(sparkP, follow);
  camera.position.copy(camP);
  look.copy(camT).sub(camP);
  const dist = look.length();
  if (!reduced) {
    const right = new THREE.Vector3().crossVectors(look, camera.up).normalize();
    look.addScaledVector(right, ptr.x * dist * 0.07 * (1 - carry * 0.6)).addScaledVector(camera.up, ptr.y * dist * 0.045 * (1 - carry * 0.6));
    camera.position.y += Math.sin(time * 0.6) * 0.03;
  }
  camera.lookAt(camera.position.clone().add(look));
  U.uCamP.value.copy(camera.position);
  U.uTime.value = time;

  // spark sprite size: real size close up, never smaller than a few pixels far away
  const sd = camera.position.distanceTo(sparkP);
  const pxPerM = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * sd);
  spark.material.uniforms.uSize.value = Math.max(0.55, 70 / pxPerM);

  renderer.setRenderTarget(probeRT); renderer.render(probeScene, probeCam); renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  overlay(t, sparkP);

  if (nFrames % 30 === 0) videoTimes.push(video.currentTime);
  // adaptive quality: if the device cannot hold ~45 fps, render fewer pixels
  if (nFrames > 40 && dt < 200) { slowAcc = slowAcc * 0.95 + (dt > 24 ? 1 : 0) * 0.05; if (slowAcc > 0.5 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.5); resize(); slowAcc = 0; } }
  requestAnimationFrame(tick);
}
// compile every shader before the first frame so nothing stalls mid-scroll
renderer.compile(scene, camera); renderer.compile(probeScene, probeCam);
requestAnimationFrame(tick);
