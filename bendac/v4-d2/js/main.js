// D2 "The perfect pixel, as an object". One Bendac LED cabinet as a studio product shot: die-cast back built from Bendac's own
// renders, a face of 200 x 200 lens-covered RGB diodes playing Bendac footage, macro depth of field, pointer light, drag to turn.
// Scroll 1 takes it apart into its layers; scroll 2 multiplies it into a wall that becomes one picture; the end is Start a project.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (t) => 1 - Math.pow(1 - clamp01(t), 3);
// average colour of the footage, 10 per second (tools/v4d2-media.sh), for the light the diodes throw on the hardware
const AVG = [[67,69,86],[69,70,87],[70,71,88],[71,72,89],[72,73,90],[73,73,92],[74,74,93],[75,74,94],[76,74,95],[77,75,96],[78,75,97],[78,75,97],[78,76,98],[79,76,98],[78,76,99],[78,76,99],[78,77,100],[77,77,100],[77,77,100],[77,77,101],[76,77,101],[76,77,101],[75,77,101],[74,77,101],[74,77,101],[74,77,101],[73,77,101],[73,77,101],[73,77,101],[73,77,101],[71,33,43],[89,44,56],[107,62,77],[116,72,88],[123,79,95],[128,84,102],[132,89,108],[137,94,113],[140,98,118],[142,102,123],[144,107,128],[15,62,36],[15,61,36],[15,59,35],[54,93,58],[57,97,54],[59,99,55],[62,105,60],[66,112,66],[67,115,71],[68,117,73],[71,124,78],[72,127,79],[75,131,80],[79,139,82],[83,147,89],[83,149,91]];

// ------------------------------------------------------------------ renderer
const canvas = $('gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }); }
catch (e) { $('nogl').style.display = 'flex'; throw e; }
renderer.toneMapping = THREE.NoToneMapping;          // tone mapping and colour encoding happen in the final pass
renderer.setClearColor(0x050506, 1);
const gl2 = renderer.capabilities.isWebGL2;
const HDR = gl2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
const RT_TYPE = HDR ? THREE.HalfFloatType : THREE.UnsignedByteType;

const view = { w: innerWidth, h: innerHeight, dpr: 1, q: 1 };
const isPhone = () => view.w < 900;

// ------------------------------------------------------------------ studio light: softboxes rendered into the environment
function studio() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: 0x020203, side: THREE.BackSide })));
  const box = (w, h, I, col, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(I), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
  };
  box(7.5, 2.4, 3.4, 0xfff4e8, [0.6, 7.5, 3.2]);     // overhead key, warm
  box(1.2, 9.0, 9.0, 0xffffff, [-7.5, 1.0, 3.0]);    // tall strip, left front
  box(1.2, 9.0, 7.0, 0xdfe9ff, [7.5, 2.0, -2.0]);    // rim strip, right back, cool
  box(1.6, 9.0, 3.2, 0xffffff, [-6.5, 1.0, -5.0]);   // side light: draws the die-cast side in the hero
  box(12, 1.4, 0.45, 0xffffff, [0, -6.0, 6.5]);      // low bounce card
  box(4.0, 0.5, 2.2, 0x2bea66, [-5.0, -1.4, -7.0]);  // Bendac green kicker behind
  return s;
}
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(studio(), 0.015).texture;

const scene = new THREE.Scene();
scene.environment = envTex;
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);

// ------------------------------------------------------------------ shared uniforms
const U = {
  uFocus: { value: 1.5 }, uDofK: { value: 0 },
  uVideo: { value: null }, uPower: { value: 0 }, uGain: { value: 1.0 }, uLeak: { value: 0 },
  uRectA: { value: new THREE.Vector4(0.21875, 0, 0.5625, 1) },   // the hero shows the centre square of the 16:9 footage
  uRectB: { value: new THREE.Vector4(0.5, 0.5, 0.0, 0.0) }, uUnify: { value: 0 }, uTime: { value: 0 }, uGloss: { value: 1 },
};
const video = $('vid');
const vtex = new THREE.VideoTexture(video);
vtex.colorSpace = THREE.SRGBColorSpace; vtex.minFilter = vtex.magFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
U.uVideo.value = vtex;

// every material writes its circle of confusion into alpha, for the depth of field pass
let keyN = 0;
function patch(mat, extra) {
  const key = 'p' + (keyN++);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = 'uniform float uFocus; uniform float uDofK;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n  gl_FragColor.a = clamp(uDofK * abs(vViewPosition.z - uFocus) / max(vViewPosition.z, 0.01), 0.0, 1.0);');
    if (extra) extra(sh);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// ------------------------------------------------------------------ procedural surface textures
function ctex(w, h, draw, srgb = true, rep = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; return t;
}
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// die-cast powder coat: fine orange-peel grain plus soft casting variation (roughness in green)
const castRough = ctex(256, 256, (g, w, h) => {
  const im = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = 150 + (rnd() - 0.5) * 70 + Math.sin(x * 0.07 + y * 0.04) * 10;
    const i = (y * w + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
}, false, 6);
// carbon twill for the panels between the ribs (Bendac's Pro Range back)
const carbonMap = ctex(256, 256, (g, w) => {
  g.fillStyle = '#08090a'; g.fillRect(0, 0, w, w);
  const n = 16, s = w / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const horiz = ((i + j) % 4) < 2;
    const gr = horiz ? g.createLinearGradient(0, j * s, 0, j * s + s) : g.createLinearGradient(i * s, 0, i * s + s, 0);
    gr.addColorStop(0, '#060707'); gr.addColorStop(0.5, horiz ? '#22252a' : '#15171a'); gr.addColorStop(1, '#060707');
    g.fillStyle = gr; g.fillRect(i * s + 0.5, j * s + 0.5, s - 1, s - 1);
  }
}, true, 1);
carbonMap.repeat.set(36, 36);
// module board back: black solder mask, driver chips, connectors, silkscreen
const pcbBack = ctex(512, 512, (g, w) => {
  g.fillStyle = '#0b0c0d'; g.fillRect(0, 0, w, w);
  g.strokeStyle = 'rgba(120,110,80,.18)'; g.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) { const y = 10 + i * 12.5; g.beginPath(); g.moveTo(0, y); g.lineTo(w * (0.3 + 0.5 * rnd()), y); g.lineTo(w * (0.35 + 0.5 * rnd()), y + 6); g.lineTo(w, y + 6); g.stroke(); }
  for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
    const x = 40 + c * 118, y = 36 + r * 78; g.fillStyle = '#151618'; g.fillRect(x, y, 46, 22);
    g.fillStyle = '#9ea3a6'; for (let k = 0; k < 7; k++) { g.fillRect(x + 4 + k * 6, y - 3, 2.5, 3); g.fillRect(x + 4 + k * 6, y + 22, 2.5, 3); }
    g.fillStyle = 'rgba(230,230,225,.55)'; g.font = '7px monospace'; g.fillText('BD' + (r * 4 + c), x + 2, y + 34);
  }
  g.fillStyle = '#d9d6cc'; g.fillRect(200, 236, 112, 36); g.fillStyle = '#1b1b1b'; for (let k = 0; k < 10; k++) g.fillRect(206 + k * 10.4, 244, 6, 20);
  g.fillStyle = '#b8954a'; for (let k = 0; k < 12; k++) g.fillRect(150 + k * 18, 470, 10, 22);
});

// ------------------------------------------------------------------ materials
const P = (o) => patch(new THREE.MeshPhysicalMaterial(o));
const M = {
  cast: P({ color: 0x30343a, metalness: 0.6, roughness: 0.42, roughnessMap: castRough, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 1.0 }),
  castEdge: P({ color: 0x3a3e44, metalness: 0.62, roughness: 0.36, roughnessMap: castRough, clearcoat: 0.3, clearcoatRoughness: 0.3 }),
  carbon: P({ color: 0xffffff, map: carbonMap, metalness: 0.2, roughness: 0.42, clearcoat: 1.0, clearcoatRoughness: 0.09, envMapIntensity: 0.9 }),
  steel: P({ color: 0xc9cdd2, metalness: 1.0, roughness: 0.2, envMapIntensity: 1.1 }),
  anod: P({ color: 0x17181b, metalness: 0.85, roughness: 0.26, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
  plastic: P({ color: 0x0b0b0c, metalness: 0.0, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  pcbEdge: P({ color: 0x1a1c1a, metalness: 0.1, roughness: 0.5 }),
  pcbBack: P({ color: 0xffffff, map: pcbBack, metalness: 0.15, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
  magnet: P({ color: 0xb9bcc0, metalness: 1.0, roughness: 0.18 }),
  glow: P({ color: 0x050505, emissive: 0x2bea66, emissiveIntensity: 3.2, roughness: 0.2, clearcoat: 1 }),
};

// ------------------------------------------------------------------ the LED face: diodes, lenses and mask on a physical material
// FACE_MODE 0 = assembled face (mask + lensed diodes), 1 = the mask lifted off (holes, light leaking through), 2 = diode board
const LED_PARS = /* glsl */`
uniform sampler2D uVideo; uniform float uPower; uniform float uGain; uniform float uLeak; uniform float uTime; uniform float uGloss;
varying vec2 vCab; varying vec4 vRect; varying vec3 vT; varying vec3 vB; varying float vOn;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 ledEmit; float ledDome; float ledPkg; float ledFar; float ledTilt; vec3 ledN; vec3 ledC;
void ledEval(){
  vec2 cells = vec2(128.0);
  vec2 g = vCab * cells; vec2 cid = floor(g); vec2 f = g - cid - 0.5;
  vec2 fw = fwidth(g); float w = max(max(fw.x, fw.y), 1e-4);
  ledFar = smoothstep(0.2, 0.42, w);                 // cells smaller than ~2.5 px: show the picture itself
  ledTilt = 1.0 - smoothstep(0.07, 0.3, w);           // lens shape only where a lens is several pixels wide (no glitter)
  vec2 cuv = (cid + 0.5) / cells;
  vec3 c = texture2D(uVideo, vRect.xy + mix(cuv, vCab, ledFar) * vRect.zw).rgb;
  float hv = h21(cid);
  c *= 0.965 + 0.07 * hv;                               // binning: no two diodes are quite the same
  float dly = length(cuv - vec2(0.02, 0.02)) * 0.70 + hv * 0.14;
  float on = smoothstep(dly, dly + 0.09, uPower) * vOn;
  c *= on * uGain;
  ledC = c;
  float r = length(f); float aa = w * 0.8;
  ledDome = 1.0 - smoothstep(0.29 - aa, 0.29 + aa, r);
  ledPkg = 1.0 - smoothstep(0.35 - aa, 0.35 + aa, max(abs(f.x), abs(f.y)));
  vec2 q = f / 0.29; float zz = sqrt(max(0.0, 1.0 - dot(q, q)));
  ledN = normalize(vec3(q * 0.85, zz + 0.2));
  // three dies under each lens, red over green over blue; their light is blurred by the pixel footprint and keeps its energy
  float s0 = 0.0022; float s2 = s0 + 0.16 * w * w; float k = s0 / s2;
  vec2 dR = f - vec2(-0.006, 0.105), dG = f - vec2(0.008, 0.0), dB = f + vec2(0.004, 0.105);
  vec3 dies = vec3(exp(-dot(dR, dR) / (2.0 * s2)), exp(-dot(dG, dG) / (2.0 * s2)), exp(-dot(dB, dB) / (2.0 * s2))) * k;
  float g0 = 0.009; float g2 = g0 + 0.16 * w * w;
  float glow = exp(-r * r / (2.0 * g2)) * (g0 / g2);
  // averages: each gaussian integrates to 2 pi sigma^2, so the cell's mean light equals the footage colour
  vec3 pat = c * (dies * (0.62 / (6.2832 * s0)) + glow * (0.38 / (6.2832 * g0)));
  ledEmit = mix(pat, c, ledFar);
}`;
function faceMaterial(mode) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0.0, roughness: 0.32, clearcoat: 1.0, clearcoatRoughness: 0.2, envMapIntensity: 1.0 });
  return patch(m, (sh) => {
    sh.defines = sh.defines || {}; sh.defines.FACE_MODE = mode;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aCab; varying vec2 vCab; varying vec4 vRect; varying vec3 vT; varying vec3 vB; varying float vOn;
        uniform vec4 uRectA; uniform vec4 uRectB; uniform float uUnify;
        #ifdef USE_INSTANCING
          attribute vec4 aRect; attribute float aOn;
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCab = aCab;
        #ifdef USE_INSTANCING
          vRect = mix(uRectA, aRect, uUnify); vOn = aOn;
          mat3 im3 = mat3(instanceMatrix);
          vT = normalize(mat3(modelViewMatrix) * (im3 * vec3(1.0, 0.0, 0.0)));
          vB = normalize(mat3(modelViewMatrix) * (im3 * vec3(0.0, 1.0, 0.0)));
        #else
          vRect = mix(uRectA, uRectB, uUnify); vOn = 1.0;
          vT = normalize(mat3(modelViewMatrix) * vec3(1.0, 0.0, 0.0));
          vB = normalize(mat3(modelViewMatrix) * vec3(0.0, 1.0, 0.0));
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + LED_PARS)
      .replace('#include <roughnessmap_fragment>', `
        ledEval();
        #if FACE_MODE == 0
          diffuseColor.rgb = mix(vec3(0.016), vec3(0.006), ledPkg);
        #elif FACE_MODE == 1
          diffuseColor.rgb = mix(vec3(0.016), vec3(0.0), ledDome * (1.0 - ledFar));
        #else
          diffuseColor.rgb = mix(vec3(0.012, 0.013, 0.012), vec3(0.006), ledPkg);
        #endif
        #include <roughnessmap_fragment>
        #if FACE_MODE == 1
          roughnessFactor = 0.42;
        #else
          roughnessFactor = mix(mix(0.36, 0.3, ledPkg), mix(0.42, 0.07, ledTilt), ledDome * (1.0 - ledFar));
        #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #if FACE_MODE != 1
          normal = normalize(mat3(normalize(vT), normalize(vB), normal) * mix(vec3(0.0, 0.0, 1.0), ledN, ledDome * ledTilt));
        #endif`)
      .replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>
        #ifdef USE_CLEARCOAT
          clearcoatNormal = normal;
        #endif`)
      .replace('#include <emissivemap_fragment>', `
        #if FACE_MODE == 1
          totalEmissiveRadiance = ledEmit * uLeak;
        #else
          totalEmissiveRadiance = ledEmit;
          float nv = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
          totalEmissiveRadiance *= mix(0.45, 1.0, smoothstep(0.0, 0.5, nv));
        #endif`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat = mix(0.55, 1.0, ledDome * (1.0 - ledFar)) * uGloss;
          material.clearcoatRoughness = mix(0.22, mix(0.4, 0.035, ledTilt), ledDome * (1.0 - ledFar));
        #endif`);
  });
}
const FACE = [faceMaterial(0), faceMaterial(1), faceMaterial(2)];

// ------------------------------------------------------------------ geometry helpers
function rrect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function rpath(pts, r, path) {   // a polygon with filleted corners
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ra = Math.min(r, da * 0.45), rb = Math.min(r, db * 0.45);
    const p1 = [p[0] + (a[0] - p[0]) / da * ra, p[1] + (a[1] - p[1]) / da * ra], p2 = [p[0] + (b[0] - p[0]) / db * rb, p[1] + (b[1] - p[1]) / db * rb];
    if (i === 0) path.moveTo(...p1); else path.lineTo(...p1);
    path.quadraticCurveTo(p[0], p[1], ...p2);
  }
  path.closePath(); return path;
}
function clip(poly, nx, ny, d) {  // keep the part of a polygon where nx*x + ny*y <= d
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const fp = nx * p[0] + ny * p[1] - d, fq = nx * q[0] + ny * q[1] - d;
    if (fp <= 0) out.push(p);
    if ((fp <= 0) !== (fq <= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
function slab(shape, depth, bevel, segs = 3) {   // extrude with rounded edges, centred on z
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, depth - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 6 });
  g.translate(0, 0, -(depth - 2 * bevel) / 2); g.computeVertexNormals(); return g;
}
function roundBox(w, h, d, r, b) { return slab(rrect(w - 2 * b, h - 2 * b, Math.max(0.0005, r - b)), d, b); }
function cabUv(geo, ox, oy) {   // cabinet-space 0..1 coordinates from positions, for every face of a part
  const p = geo.attributes.position, a = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { a[i * 2] = (p.getX(i) + ox) / S + 0.5; a[i * 2 + 1] = (p.getY(i) + oy) / S + 0.5; }
  geo.setAttribute('aCab', new THREE.BufferAttribute(a, 2)); return geo;
}

// ------------------------------------------------------------------ the cabinet (metres): 500 x 500 mm, four 250 mm modules
const S = 0.5, MOD = 0.2496, RIM = 0.016;
const rig = new THREE.Group(); scene.add(rig);          // pose (scroll, pointer, drag)
const cab = new THREE.Group(); rig.add(cab);           // the cabinet, centred
const L = [0, 1, 2, 3].map(() => { const g = new THREE.Group(); cab.add(g); return g; });
const QUADS = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
const modMasks = [], modBoards = [];
for (const [qx, qy] of QUADS) {
  const ox = qx * S / 4, oy = qy * S / 4;
  // mask: 3 mm black plate, its front is the LED face shader
  const mg = cabUv(new THREE.BoxGeometry(MOD, MOD, 0.003), ox, oy);
  const mask = new THREE.Mesh(mg, [M.plastic, M.plastic, M.plastic, M.plastic, FACE[0], M.plastic]);
  mask.position.set(ox, oy, -0.0015); mask.userData.base = new THREE.Vector3(ox, oy, -0.0015); L[0].add(mask); modMasks.push(mask);
  // diode board: 1.6 mm PCB, diodes on the front, drivers on the back, four magnets
  const bg = cabUv(new THREE.BoxGeometry(MOD - 0.002, MOD - 0.002, 0.0016), ox, oy);
  const board = new THREE.Group(); board.position.set(ox, oy, -0.0042); board.userData.base = board.position.clone();
  board.add(new THREE.Mesh(bg, [M.pcbEdge, M.pcbEdge, M.pcbEdge, M.pcbEdge, FACE[2], M.pcbBack]));
  const shell = new THREE.Mesh(roundBox(MOD - 0.006, MOD - 0.006, 0.008, 0.006, 0.0015), M.plastic); shell.position.z = -0.0052; board.add(shell);
  for (const [mx, my] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const mag = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.004, 20), M.magnet);
    mag.rotation.x = Math.PI / 2; mag.position.set(mx * 0.085, my * 0.085, -0.0105); board.add(mag);
  }
  L[1].add(board); modBoards.push(board);
}
// die-cast frame: rim, back plate with spine and diagonal ribs (Bendac Pro Range), carbon panels, cam-lock levers, side tabs, pins
{
  const F = L[2];
  const rimShape = rrect(S, S, 0.007); rimShape.holes.push(rrect(S - 2 * RIM, S - 2 * RIM, 0.004));
  const rim = new THREE.Mesh(slab(rimShape, 0.058, 0.0022), M.castEdge); rim.position.z = -0.0145 - 0.029; F.add(rim);
  // back plate windows: quadrants between the spine (|x| < 0.052), the centre rib (|y| < 0.011) and the rim, split by a diagonal rib
  const IN = S / 2 - RIM, RIB = 0.0075, SP = 0.052, CR = 0.011;
  const back = rrect(S - 0.004, S - 0.004, 0.006); const wins = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x0 = SP + RIB, x1 = IN - RIB, y0 = CR + RIB, y1 = IN - RIB;
    const rect = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    // diagonal from the outer corner (IN, IN) to the spine at the centre rib (SP, 0)
    const dx = IN - SP, dy = IN, len = Math.hypot(dx, dy), nx = dy / len, ny = -dx / len, d = nx * SP;
    const A = clip(rect, nx, ny, d - RIB), B = clip(rect, -nx, -ny, -d - RIB);
    for (const poly of [A, B]) if (poly.length >= 3) wins.push(poly.map(([x, y]) => [x * sx, y * sy]));
  }
  for (const wpoly of wins) { const ordered = wpoly; back.holes.push(rpath(ordered, 0.009, new THREE.Path())); }
  const plate = new THREE.Mesh(slab(back, 0.009, 0.0018), M.cast); plate.position.z = -0.0725 + 0.0045 - 0.0005; F.add(plate);
  for (const wpoly of wins) {
    const pg = new THREE.ShapeGeometry(rpath(wpoly, 0.009, new THREE.Shape()), 4);
    const panel = new THREE.Mesh(pg, M.carbon); panel.position.z = -0.0665; F.add(panel);
    const pf = panel.clone(); pf.rotation.y = Math.PI; pf.position.z = -0.0655; F.add(pf);   // the side you see from the front, when it is open
  }
  // cam-lock levers on the side rails and locating pins under the bottom edge (Bendac renders and Dura photo)
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const piv = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.01, 24), M.steel);
    piv.rotation.x = Math.PI / 2; piv.position.set(sx * 0.226, sy * 0.15, -0.0785); F.add(piv);
    const lev = new THREE.Mesh(roundBox(0.012, 0.062, 0.006, 0.005, 0.0016), M.anod);
    lev.position.set(sx * 0.212, sy * 0.15 - sy * 0.012, -0.0815); lev.rotation.z = sx * sy * 0.18; F.add(lev);
    const tab = new THREE.Mesh(roundBox(0.006, 0.032, 0.022, 0.002, 0.001), M.castEdge);
    tab.position.set(sx * (S / 2 + 0.002), sy * 0.12, -0.05); F.add(tab);
  }
  for (const px of [-0.15, 0.15]) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.014, 20), M.steel); pin.position.set(px, -S / 2 - 0.006, -0.042); F.add(pin);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.0048, 0.0048, 0.002, 20), M.plastic); hole.position.set(px, S / 2 + 0.0002, -0.042); F.add(hole);
  }
}
// processing spine: receiving card and power behind one cover, Bendac badge, status light, power and data connectors
{
  const B = L[3];
  const spine = new THREE.Mesh(roundBox(0.096, 0.43, 0.022, 0.014, 0.004), M.cast); spine.position.z = -0.0835; B.add(spine);
  const ridge = new THREE.Mesh(roundBox(0.06, 0.2, 0.006, 0.01, 0.002), M.castEdge); ridge.position.set(0, 0.03, -0.0955); B.add(ridge);
  const badge = ctex(512, 160, (g, w, h) => { g.fillStyle = '#16181b'; g.fillRect(0, 0, w, h); });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.084, 0.0256), patch(new THREE.MeshPhysicalMaterial({ map: badge, metalness: 0.5, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 })));
  plate.rotation.y = Math.PI; plate.position.set(0, 0.168, -0.0948); B.add(plate);
  const img = new Image(); img.onload = () => { const g = badge.image.getContext('2d'); g.drawImage(img, 26, 14, 460, 140); badge.needsUpdate = true; }; img.src = 'media/logo-bendac-white.webp';
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0016, 12, 40), M.glow); ring.position.set(0, -0.12, -0.0985); B.add(ring);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.002, 32), M.anod); lens.rotation.x = Math.PI / 2; lens.position.set(0, -0.12, -0.0975); B.add(lens);
  for (const [y, w] of [[-0.172, 0.026], [-0.196, 0.026]]) {
    const c = new THREE.Mesh(roundBox(w, 0.016, 0.008, 0.003, 0.001), M.steel); c.position.set(-0.016, y, -0.0975); B.add(c);
    const d = new THREE.Mesh(roundBox(0.016, 0.014, 0.008, 0.002, 0.001), M.plastic); d.position.set(0.022, y, -0.0975); B.add(d);
  }
}
const LAYER_GAP = [0.52, 0.26, 0.0, -0.21];       // exploded offsets along the cabinet's depth
// light the diodes throw onto the hardware when the layers are apart
const spill = new THREE.PointLight(0xffffff, 0, 1.6, 2); cab.add(spill);
// direct light: a key for crisp edge highlights, and the pointer's own small light
const key = new THREE.DirectionalLight(0xfff3e6, 1.3); key.position.set(-2, 3, 2.5); scene.add(key);
const plight = new THREE.PointLight(0xffffff, 0, 2.2, 2); scene.add(plight);

// ------------------------------------------------------------------ the wall: copies of the cabinet that come out of the first one
const WALL = { cols: 15, rows: 9 };
const MAXN = 15 * 9;
const wallFaceGeo = (() => { const g = new THREE.PlaneGeometry(S - 0.0012, S - 0.0012); cabUv(g, 0, 0); return g; })();
const aRect = new Float32Array(MAXN * 4), aOn = new Float32Array(MAXN);
wallFaceGeo.setAttribute('aRect', new THREE.InstancedBufferAttribute(aRect, 4));
const aOnAttr = new THREE.InstancedBufferAttribute(aOn, 1); aOnAttr.setUsage(THREE.DynamicDrawUsage); wallFaceGeo.setAttribute('aOn', aOnAttr);
const wallFaces = new THREE.InstancedMesh(wallFaceGeo, FACE[0], MAXN); wallFaces.frustumCulled = false; wallFaces.count = 0; scene.add(wallFaces);
const bodyGeo = roundBox(S - 0.001, S - 0.001, 0.07, 0.007, 0.0022); bodyGeo.translate(0, 0, -0.036);
const wallBodies = new THREE.InstancedMesh(bodyGeo, M.castEdge, MAXN); wallBodies.frustumCulled = false; wallBodies.count = 0; scene.add(wallBodies);
let slots = [];
function layoutWall() {
  const ph = isPhone(); WALL.cols = ph ? 7 : 15; WALL.rows = 9;
  const ar = WALL.cols / WALL.rows, fw = Math.min(1, ar / (16 / 9)), x0 = (1 - fw) / 2;
  const hc = (WALL.cols - 1) / 2, hr = (WALL.rows - 1) / 2;
  slots = [];
  for (let r = 0; r < WALL.rows; r++) for (let c = 0; c < WALL.cols; c++) {
    const rect = [x0 + c / WALL.cols * fw, 1 - (r + 1) / WALL.rows, fw / WALL.cols, 1 / WALL.rows];
    const pos = new THREE.Vector3((c - hc) * S, (hr - r) * S, 0);
    const ring = Math.max(Math.abs(c - hc), Math.abs(r - hr));
    if (c === hc && r === hr) { U.uRectB.value.set(...rect); continue; }
    slots.push({ c, r, rect, pos, ring, d: ring + Math.hypot(c - hc, r - hr) * 0.15, j: rnd() });
  }
  slots.sort((a, b) => a.d - b.d);
  const maxD = slots[slots.length - 1].d;
  slots.forEach((s, i) => { s.delay = (s.d - 1) / maxD * 0.7 + s.j * 0.04; aRect.set(s.rect, i * 4); });
  wallFaceGeo.attributes.aRect.needsUpdate = true;
  WALL.w = WALL.cols * S; WALL.h = WALL.rows * S;
}

// ------------------------------------------------------------------ backdrop: graphite seamless with a soft lift behind the object
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { uC: { value: new THREE.Vector2(0.5, 0.5) }, uAsp: { value: 1 }, uLift: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.99999, 1.0); }',
  fragmentShader: `uniform vec2 uC; uniform float uAsp; uniform float uLift; varying vec2 vUv;
    void main(){ vec2 d = (vUv - uC) * vec2(uAsp, 1.0); float r = length(d);
      vec3 c = vec3(0.0022, 0.0023, 0.0027) + vec3(0.034, 0.035, 0.038) * exp(-r * r * 1.9) * uLift + vec3(0.004) * (1.0 - vUv.y);
      gl_FragColor = vec4(c, 1.0); }`,
  depthWrite: false, depthTest: false,
}));
backdrop.frustumCulled = false; backdrop.renderOrder = -1000; scene.add(backdrop);

// ------------------------------------------------------------------ post: depth of field from the alpha CoC, bloom, neutral tone map
const quad = new THREE.BufferGeometry(); quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
const pcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const VS = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function pass(fs, uniforms, defines) {
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, ...(defines ? { defines } : {}) });
  const s = new THREE.Scene(); const me = new THREE.Mesh(quad, m); me.frustumCulled = false; s.add(me);
  return { u: uniforms, run(t) { renderer.setRenderTarget(t); renderer.render(s, pcam); } };
}
const mkRT = (samples = 0) => new THREE.WebGLRenderTarget(4, 4, { type: RT_TYPE, samples, depthBuffer: samples > 0, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const RT = { scene: mkRT(gl2 ? 4 : 0), dof: mkRT(), b1: mkRT(), b2: mkRT(), b3: mkRT(), u2: mkRT(), u1: mkRT() };
RT.scene.depthBuffer = true;
const DOF = pass(`uniform sampler2D tScene; uniform vec2 uPx; uniform float uMaxR; varying vec2 vUv;
  void main(){
    vec4 c0 = texture2D(tScene, vUv); float r0 = c0.a * uMaxR;
    vec3 acc = c0.rgb; float ws = 1.0;
    if (r0 > 0.75) {
      for (int i = 0; i < TAPS; i++) {
        float fi = float(i) + 0.5; float rad = sqrt(fi / float(TAPS)) * r0; float th = fi * 2.39996323;
        vec4 s = texture2D(tScene, vUv + vec2(cos(th), sin(th)) * rad * uPx);
        float w = clamp(s.a * uMaxR - rad + 1.0, 0.0, 1.0);
        float l = max(s.r, max(s.g, s.b));
        s.rgb *= min(1.0, 2.5 / max(l, 1e-4));                            // no single lens glint may dominate a disc
        w *= 1.0 + min(l, 2.5) * 0.25;
        acc += s.rgb * w; ws += w;
      }
    }
    gl_FragColor = vec4(acc / ws, c0.a);
  }`, { tScene: { value: null }, uPx: { value: new THREE.Vector2() }, uMaxR: { value: 20 } }, { TAPS: innerWidth < 900 ? 16 : 22 });
const DOWN = pass(`uniform sampler2D tIn; uniform vec2 uPx; uniform float uThr; varying vec2 vUv;
  void main(){
    vec3 c = (texture2D(tIn, vUv + uPx * vec2(-1.0, -1.0)).rgb + texture2D(tIn, vUv + uPx * vec2(1.0, -1.0)).rgb
            + texture2D(tIn, vUv + uPx * vec2(-1.0, 1.0)).rgb + texture2D(tIn, vUv + uPx * vec2(1.0, 1.0)).rgb) * 0.25;
    if (uThr > 0.0) { float l = max(c.r, max(c.g, c.b)); c *= max(l - uThr, 0.0) / max(l, 1e-4); }
    gl_FragColor = vec4(c, 1.0);
  }`, { tIn: { value: null }, uPx: { value: new THREE.Vector2() }, uThr: { value: 0 } });
const UP = pass(`uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 uPx; varying vec2 vUv;
  void main(){
    vec3 b = texture2D(tLow, vUv + uPx * vec2(-1.0, -1.0)).rgb + texture2D(tLow, vUv + uPx * vec2(1.0, -1.0)).rgb
           + texture2D(tLow, vUv + uPx * vec2(-1.0, 1.0)).rgb + texture2D(tLow, vUv + uPx * vec2(1.0, 1.0)).rgb;
    gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + b * 0.25, 1.0);
  }`, { tLow: { value: null }, tHigh: { value: null }, uPx: { value: new THREE.Vector2() } });
const FINAL = pass(`uniform sampler2D tScene; uniform sampler2D tDof; uniform sampler2D tBloom; uniform float uBloom; uniform float uMaxR; uniform float uTime; uniform float uExp;
  varying vec2 vUv;
  vec3 neutral(vec3 color){
    const float sc = 0.76; const float desat = 0.15;
    float x = min(color.r, min(color.g, color.b)); float off = x < 0.08 ? x - 6.25 * x * x : 0.04; color -= off;
    float peak = max(color.r, max(color.g, color.b)); if (peak < sc) return color;
    const float d = 1.0 - sc; float np = 1.0 - d * d / (peak + d - sc); color *= np / peak;
    float g = 1.0 - 1.0 / (desat * (peak - np) + 1.0); return mix(color, vec3(np), g);
  }
  vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    vec4 s = texture2D(tScene, vUv); vec4 d = texture2D(tDof, vUv);
    float t = smoothstep(0.7, 2.2, s.a * uMaxR);
    vec3 c = mix(s.rgb, d.rgb, t) + texture2D(tBloom, vUv).rgb * uBloom;
    c = srgb(clamp(neutral(max(c * uExp, 0.0)), 0.0, 1.0));
    c += (h(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * (1.6 / 255.0);
    gl_FragColor = vec4(c, 1.0);
  }`, { tScene: { value: null }, tDof: { value: null }, tBloom: { value: null }, uBloom: { value: 0.32 }, uMaxR: { value: 20 }, uTime: { value: 0 }, uExp: { value: 1 } });

function resize() {
  view.w = innerWidth; view.h = innerHeight;
  const base = Math.min(devicePixelRatio || 1, isPhone() ? 2 : 1.5);
  view.dpr = base * view.q;
  renderer.setPixelRatio(view.dpr); renderer.setSize(view.w, view.h, false);
  const W = Math.round(view.w * view.dpr), H = Math.round(view.h * view.dpr);
  RT.scene.setSize(W, H);
  const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1);
  RT.dof.setSize(hw, hh); RT.b1.setSize(W >> 2, H >> 2); RT.b2.setSize(W >> 3, H >> 3); RT.b3.setSize(W >> 4, H >> 4);
  RT.u2.setSize(W >> 3, H >> 3); RT.u1.setSize(W >> 2, H >> 2);
  DOF.u.uPx.value.set(1 / W, 1 / H);
  const maxR = H * 0.022;            // the largest blur disc, in device pixels
  DOF.u.uMaxR.value = maxR; FINAL.u.uMaxR.value = maxR;
  camera.aspect = view.w / view.h;
  camera.fov = isPhone() ? 42 : 30;
  camera.updateProjectionMatrix();
  backdrop.material.uniforms.uAsp.value = view.w / view.h;
  layoutWall(); measure();
}

// ------------------------------------------------------------------ layout: where on screen the object may sit, per chapter
const free = { hero: null, open: null, wall: null };
function rectOf(id) { return $(id).getBoundingClientRect(); }
function measure() {
  const W = view.w, H = view.h, ph = isPhone();
  if (ph) {
    const top1 = rectOf('hero').bottom + 8, bot1 = rectOf('cues').top - 70;
    free.hero = { x0: 10, x1: W - 10, y0: top1, y1: Math.max(top1 + 160, bot1) };
    const top2 = rectOf('c2').bottom + 12, bot2 = rectOf('specs').top - 12;
    free.open = { x0: 4, x1: W * 0.64, y0: top2, y1: bot2 };
    const top3 = rectOf('c3').bottom + 14, bot3 = rectOf('c4').top - 14;
    free.wall = { x0: 14, x1: W - 14, y0: top3, y1: Math.max(top3 + 120, rectOf('cues').top - 10) };
    free.end = { x0: 14, x1: W - 14, y0: rectOf('bar').bottom + 18, y1: Math.max(top3 + 120, bot3) };
  } else {
    free.hero = { x0: W * 0.36, x1: W * 0.98, y0: 70, y1: H - 40 };
    free.open = { x0: W * 0.3, x1: W * 0.74, y0: 70, y1: H - 90 };
    free.wall = { x0: W * 0.04, x1: W * 0.96, y0: 80, y1: rectOf('c4').top - 30 };
    free.end = free.wall;
  }
  fits();
}
// distance and view offset that fit a posed box (its projected corners, with perspective) inside a screen rectangle
const HERO_ROT = [-0.2, 0.62, 0.05], OPEN_ROT = [-1.13, 0.4, 0.0];
function openRot_() { return isPhone() ? [-1.13, 0.2, 0.0] : OPEN_ROT; }
const A = {}, B = {}, C = {}, E = {};
function fitBox(r, rot, min, max, out) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ'));
  const pts = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) pts.push(new THREE.Vector3(x, y, z).applyQuaternion(q));
  const T = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), H = view.h;
  const rw = (r.x1 - r.x0) / H * 2 * T, rh = (r.y1 - r.y0) / H * 2 * T;
  let d = 3, bx0, bx1, by0, by1;
  for (let it = 0; it < 12; it++) {
    bx0 = by0 = 1e9; bx1 = by1 = -1e9;
    for (const p of pts) { const k = 1 / (d - p.z); bx0 = Math.min(bx0, p.x * k); bx1 = Math.max(bx1, p.x * k); by0 = Math.min(by0, p.y * k); by1 = Math.max(by1, p.y * k); }
    d *= Math.max((bx1 - bx0) / rw, (by1 - by0) / rh);
  }
  const px = H / (2 * T);
  out.d = d; out.cx = (r.x0 + r.x1) / 2 - (bx0 + bx1) / 2 * px; out.cy = (r.y0 + r.y1) / 2 + (by0 + by1) / 2 * px;
  return out;
}
function fits() {
  const mid = (LAYER_GAP[0] + LAYER_GAP[3]) / 2;
  fitBox(free.hero, HERO_ROT, [-0.255, -0.262, -0.1], [0.255, 0.262, 0.004], A);
  fitBox(free.open, openRot_(), [-0.255, -0.262, -0.1 + LAYER_GAP[3] - mid], [0.255, 0.262, 0.004 + LAYER_GAP[0] - mid], B);
  fitBox(free.wall, [0, 0, 0], [-WALL.w / 2, -WALL.h / 2, -0.07], [WALL.w / 2, WALL.h / 2, 0.003], C);
  fitBox(free.end, [0, 0, 0], [-WALL.w / 2, -WALL.h / 2, -0.07], [WALL.w / 2, WALL.h / 2, 0.003], E);
}

// ------------------------------------------------------------------ input: pointer light, tilt, drag to turn
const ptr = { x: 0, y: 0, tx: 0, ty: 0, inside: false };
const spin = { a: 0, v: 0, drag: false, lx: 0, idle: 9 };
addEventListener('pointermove', (e) => {
  ptr.tx = (e.clientX / view.w) * 2 - 1; ptr.ty = -((e.clientY / view.h) * 2 - 1); ptr.inside = true;
  if (spin.drag) { const dx = e.clientX - spin.lx; spin.lx = e.clientX; spin.a += dx * 0.0085; spin.v = dx * 0.0085 * 60; spin.idle = 0; }
}, { passive: true });
canvas.addEventListener('pointerdown', (e) => { spin.drag = true; spin.lx = e.clientX; spin.v = 0; kick(); });
addEventListener('pointerup', () => { spin.drag = false; });
addEventListener('pointercancel', () => { spin.drag = false; });
function kick() { if (video.paused) video.play().catch(() => {}); }
addEventListener('touchstart', kick, { passive: true });
if ('ontouchstart' in window) $('turn').textContent = 'Swipe sideways to turn';

$('go').addEventListener('click', () => scrollTo({ top: document.documentElement.scrollHeight, behavior: RM ? 'auto' : 'smooth' }));

// ------------------------------------------------------------------ chapters
const el = { hero: $('hero'), cues: $('cues'), c2: $('c2'), specs: $('specs'), c3: $('c3'), c4: $('c4'), chap: $('chap'), count: $('count'), cn: $('cn') };
const tags = [0, 1, 2, 3].map((i) => $('t' + i));
const CHAPS = ['01 · The pixel', '02 · Inside', '03 · The wall', '04 · Your project'];
let chapNow = -1;
const setOn = (e, on) => { if (e.classList.contains('on') !== on) e.classList.toggle('on', on); };

// ------------------------------------------------------------------ frame loop
const clock = new THREE.Clock();
let ps = 0, tPow = 0, started = false, t0 = 0, intro = 0;
const SHOTFAST = /[?&]skip/.test(location.search);
const probe = window.__probe = { frames: [], videoTimes: [], long: [], q: () => view.q, dpr: () => view.dpr };
const pose = { d: 1, cx: 0, cy: 0 };
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpM = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
let lastT = performance.now(), slowN = 0;
window.__d2 = { progress: () => ps, setProgress: (p) => { ps = p; }, U, spin, ptr };

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(); const dtms = now - lastT; lastT = now; probe.frames.push(dtms);
  if (probe.frames.length > 4000) probe.frames.splice(0, 2000);
  const dt = Math.min(0.05, clock.getDelta()); const t = clock.elapsedTime; U.uTime.value = t;
  if (dtms > 60 && probe.frames.length > 3) (probe.long = probe.long || []).push([+dtms.toFixed(0), +ps.toFixed(3), +(video.currentTime || 0).toFixed(2)]);
  // scroll progress, eased
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const p = clamp01(scrollY / max);
  ps += (p - ps) * (RM ? 1 : 1 - Math.exp(-dt * 7));
  // power on: the face lights diode by diode, from the near corner, as the loader
  if (!started && video.readyState >= 2) { started = true; t0 = t; }
  if (started) tPow = RM || SHOTFAST ? 1.2 : Math.min(1.2, (t - t0 - 0.15) / 2.2 * 1.2);
  U.uPower.value = Math.max(0, tPow);
  const lit = clamp01(U.uPower.value / 1.02);
  el.cn.textContent = Math.round(Math.pow(lit, 1.6) * 16384).toLocaleString('en-GB');
  el.count.style.opacity = started && (t - t0) < 3.6 && ps < 0.04 ? 1 : 0;

  // intro: start in macro on the first diodes to light, then pull back to the whole cabinet (scrolling finishes it at once)
  if (started && !RM) intro = Math.min(1, intro + dt / 2.7 + (ps > 0.01 ? dt * 3 : 0)); else if (RM || SHOTFAST) intro = 1;
  const kI = intro < 1 ? (intro < 0.12 ? 0 : (1 - Math.cos(Math.PI * (intro - 0.12) / 0.88)) / 2) : 1;
  // chapter weights
  const eOpen = smooth(0.07, 0.33, ps);                // layers apart
  const eClose = smooth(0.45, 0.58, ps);               // back together
  const eMult = smooth(0.55, 0.8, ps);                 // copies arrive
  const eOne = smooth(0.79, 0.89, ps);                 // one picture
  const explode = eOpen * (1 - smooth(0.0, 0.42, eClose));   // layers close first
  const eTurn = smooth(0.3, 1.0, eClose);                     // then it turns to face you, whole and lit
  const chap = ps < 0.06 ? 0 : ps < 0.5 ? 1 : ps < 0.9 ? 2 : 3;
  if (chap !== chapNow) { chapNow = chap; el.chap.textContent = CHAPS[chap]; }
  setOn(el.hero, ps < 0.05 && kI > 0.86); setOn(el.cues, ps < 0.05 && kI > 0.97);
  setOn(el.c2, ps > 0.2 && ps < 0.48); setOn(el.specs, ps > 0.24 && ps < 0.48);
  setOn(el.c3, ps > 0.8 && (ps < 0.9 || !isPhone())); setOn(el.c4, ps > 0.9);

  // pointer and drag
  ptr.x += (ptr.tx - ptr.x) * (1 - Math.exp(-dt * 4)); ptr.y += (ptr.ty - ptr.y) * (1 - Math.exp(-dt * 4));
  if (!spin.drag) {
    spin.idle += dt; spin.a += spin.v * dt; spin.v *= Math.exp(-dt * 2.6);
    if (spin.idle > 1.6) { const home = Math.round(spin.a / (Math.PI * 2)) * Math.PI * 2; spin.a += (home - spin.a) * (1 - Math.exp(-dt * 1.4)); }
  }
  const heroW = 1 - smooth(0.0, 0.3, ps) ;              // pointer tilt and idle drift belong to the hero
  const idleY = RM ? 0 : Math.sin(t * 0.33) * 0.05, bob = RM ? 0 : Math.sin(t * 0.8) * 0.004;

  // rig pose per chapter: hero three-quarter, open lying back so the stack rises, wall facing you
  const heroRot = [HERO_ROT[0] - ptr.y * 0.1, HERO_ROT[1] + idleY + ptr.x * 0.2, HERO_ROT[2]];
  const openRot = openRot_();
  const wallRot = [0, 0, 0];
  const kOpen = eOpen * (1 - eClose), kWall = eClose;
  let rx = lerp(lerp(heroRot[0], openRot[0], ease(eOpen)), wallRot[0], ease(eTurn));
  let ry = lerp(lerp(heroRot[1], openRot[1], ease(eOpen)), wallRot[1], ease(eTurn));
  let rz = lerp(lerp(heroRot[2], openRot[2], ease(eOpen)), wallRot[2], ease(eTurn));
  ry += spin.a * (1 - kWall);
  rig.rotation.set(rx, ry, rz, 'XYZ');
  rig.position.set(0, bob * heroW, 0);
  cab.position.set(0, 0, 0);
  // explode the layers along the cabinet's depth; the four modules also part a little
  const ex = ease(explode);
  L.forEach((g, i) => { g.position.z = LAYER_GAP[i] * ex; });
  const partM = 0.012 * smooth(0.45, 1.0, ex);
  modMasks.forEach((m, i) => { const [qx, qy] = QUADS[i]; m.position.set(m.userData.base.x + qx * partM, m.userData.base.y + qy * partM, m.userData.base.z); });
  modBoards.forEach((m, i) => { const [qx, qy] = QUADS[i]; m.position.set(m.userData.base.x + qx * partM * 0.6, m.userData.base.y + qy * partM * 0.6, m.userData.base.z); });
  const apart = ex > (eClose > 0 ? 0.12 : 0.004);   // closing: the face is whole again before it turns to you
  modMasks.forEach((m) => { m.material[4] = apart ? FACE[1] : FACE[0]; });
  modBoards.forEach((b) => { b.visible = apart; });
  U.uLeak.value = 1 - 0.985 * smooth(eClose > 0 ? 0.12 : 0.02, 0.5, ex);
  // stack centre: keep the opened stack centred on screen
  const stackMid = (LAYER_GAP[0] + LAYER_GAP[3]) / 2 * ex;
  cab.position.z = -stackMid;

  // camera framing: each chapter's fit, blended; the wall framing comes in as the copies arrive
  const kC = eClose, wallBlend = ease(eMult), eEnd = ease(smooth(0.88, 0.96, ps));
  const CW = { d: lerp(C.d, E.d, eEnd), cx: lerp(C.cx, E.cx, eEnd), cy: lerp(C.cy, E.cy, eEnd) };
  const dW = lerp(A.d * 1.7, CW.d, wallBlend), cxW = lerp(view.w / 2, CW.cx, wallBlend), cyW = lerp((CW.cy + A.cy) / 2, CW.cy, wallBlend);
  pose.d = lerp(lerp(A.d, B.d, ease(eOpen)), dW, ease(kC));
  pose.cx = lerp(lerp(A.cx, B.cx, ease(eOpen)), cxW, ease(kC));
  pose.cy = lerp(lerp(A.cy, B.cy, ease(eOpen)), cyW, ease(kC));
  if (kI < 1) {
    const corner = new THREE.Vector3(-0.2, -0.17, 0.0).applyEuler(new THREE.Euler(...HERO_ROT, 'XYZ'));
    rig.position.addScaledVector(corner, -(1 - kI));
    const dm = 0.105;
    pose.d = Math.exp(lerp(Math.log(dm), Math.log(pose.d), kI));
    pose.cx = lerp(view.w / 2, pose.cx, kI); pose.cy = lerp(view.h * 0.5, pose.cy, kI);
  }
  camera.position.set(0, 0, pose.d);
  camera.lookAt(0, 0, 0);
  const ox = Math.round(view.w / 2 - pose.cx), oy = Math.round(view.h / 2 - pose.cy);
  camera.setViewOffset(view.w, view.h, ox, oy, view.w, view.h);

  // depth of field: macro on the hero, softer when open, none on the wall
  const dofHero = isPhone() ? 1.6 : 1.15, dofOpen = 0.4;
  U.uDofK.value = lerp(lerp(dofHero, dofOpen, ease(eOpen)), 0, ease(kC)) * (RM ? 0.6 : 1);
  // focus on the nearest third of the face in the hero, on the stack centre when open
  rig.updateMatrixWorld(true);
  const fLocal = new THREE.Vector3(lerp(lerp(-0.2, -0.12, kI), 0, eOpen), lerp(lerp(-0.17, -0.02, kI), 0, eOpen), lerp(0.0, LAYER_GAP[1] * ex, eOpen));
  const fWorld = fLocal.applyMatrix4(cab.matrixWorld);
  camera.updateMatrixWorld(true);
  U.uFocus.value = -fWorld.applyMatrix4(camera.matrixWorldInverse).z;
  backdrop.material.uniforms.uC.value.set(pose.cx / view.w, 1 - pose.cy / view.h);
  backdrop.material.uniforms.uLift.value = 1 - 0.6 * ease(kC);

  // lights: key fixed, pointer light glides over the face, spill colour follows the footage
  const vt = video.currentTime || 0; const ci = AVG[Math.min(AVG.length - 1, Math.floor(vt * 10))] || AVG[0];
  spill.color.setRGB(ci[0] / 255, ci[1] / 255, ci[2] / 255, THREE.SRGBColorSpace);
  spill.intensity = apart ? 1.5 * ex * U.uPower.value : 0; spill.position.set(0, 0, LAYER_GAP[1] * ex * 0.8);
  const camR = tmpV.set(1, 0, 0);
  plight.position.set(ptr.x * 0.55 * pose.d * 0.4, ptr.y * 0.5 * pose.d * 0.4, 0.42).add(new THREE.Vector3(0, 0, 0));
  plight.intensity = (ptr.inside ? 0.5 : 0.0) * heroW * (1 - eOpen);

  // the wall: copies slide out from behind the first cabinet, ring by ring, then become one picture
  const n = slots.length; wallFaces.count = wallBodies.count = n;
  const multT = eMult;
  for (let i = 0; i < n; i++) {
    const s = slots[i];
    const k = ease(clamp01((multT - s.delay) / 0.22));
    if (k <= 0) { tmpM.makeScale(0, 0, 0); wallFaces.setMatrixAt(i, tmpM); wallBodies.setMatrixAt(i, tmpM); aOn[i] = 0; continue; }
    tmpV.set(lerp(0, s.pos.x, k), lerp(0, s.pos.y, k), lerp(-0.085, 0, Math.min(1, k * 1.6)) - 0.0 );
    tmpQ.identity();
    const sc = lerp(0.94, 1, k);
    tmpM.compose(tmpV, tmpQ, new THREE.Vector3(sc, sc, sc));
    wallFaces.setMatrixAt(i, tmpM); wallBodies.setMatrixAt(i, tmpM);
    aOn[i] = smooth(0.15, 0.6, k);
  }
  wallFaces.instanceMatrix.needsUpdate = wallBodies.instanceMatrix.needsUpdate = true; aOnAttr.needsUpdate = true;
  wallFaces.visible = wallBodies.visible = multT > 0.001;
  U.uUnify.value = ease(eOne);
  U.uGloss.value = 1 - 0.8 * ease(eMult);

  // labels on the layers
  const tagK = smooth(0.2, 0.3, ps) * (1 - smooth(0.42, 0.47, ps));
  tags.forEach((tg, i) => {
    const a = new THREE.Vector3(S / 2 + 0.01, i === 3 ? 0.0 : 0.0, LAYER_GAP[i] * ex + [0, -0.004, -0.04, -0.09][i]).applyMatrix4(cab.matrixWorld).project(camera);
    const x = (a.x * 0.5 + 0.5) * view.w, y = (-a.y * 0.5 + 0.5) * view.h;
    const tw = tg.offsetWidth || 150;
    tg.style.transform = `translate(${Math.min(x, view.w - tw - 10).toFixed(1)}px, ${(y - 7).toFixed(1)}px)`;
    tg.style.opacity = (tagK * smooth(0.0, 0.3, ex)).toFixed(3);
  });

  // render
  renderer.setRenderTarget(RT.scene); renderer.render(scene, camera);
  DOF.u.tScene.value = RT.scene.texture; DOF.run(RT.dof);
  DOWN.u.tIn.value = RT.dof.texture; DOWN.u.uPx.value.set(1 / RT.dof.width, 1 / RT.dof.height); DOWN.u.uThr.value = 1.0; DOWN.run(RT.b1);
  DOWN.u.tIn.value = RT.b1.texture; DOWN.u.uPx.value.set(1 / RT.b1.width, 1 / RT.b1.height); DOWN.u.uThr.value = 0; DOWN.run(RT.b2);
  DOWN.u.tIn.value = RT.b2.texture; DOWN.u.uPx.value.set(1 / RT.b2.width, 1 / RT.b2.height); DOWN.run(RT.b3);
  UP.u.tLow.value = RT.b3.texture; UP.u.tHigh.value = RT.b2.texture; UP.u.uPx.value.set(0.5 / RT.b3.width, 0.5 / RT.b3.height); UP.run(RT.u2);
  UP.u.tLow.value = RT.u2.texture; UP.u.tHigh.value = RT.b1.texture; UP.u.uPx.value.set(0.5 / RT.u2.width, 0.5 / RT.u2.height); UP.run(RT.u1);
  FINAL.u.tScene.value = RT.scene.texture; FINAL.u.tDof.value = RT.dof.texture; FINAL.u.tBloom.value = RT.u1.texture; FINAL.u.uTime.value = t;
  FINAL.run(null);
  if (probe.frames.length % 15 === 0) probe.videoTimes.push(vt);

  // adaptive resolution: if frames run long for a while, render fewer pixels
  if (dtms > 24 && t > 3) { if (++slowN > (dtms > 80 ? 4 : 45) && view.q > 0.5) { view.q = Math.max(0.5, view.q - (dtms > 80 ? 0.25 : 0.1)); slowN = 0; resize(); } } else slowN = Math.max(0, slowN - 1);
}

addEventListener('resize', resize);
document.fonts.ready.then(measure);
resize();
(function precompile() {
  modBoards.forEach((b) => { b.visible = true; }); wallFaces.count = wallBodies.count = 1;
  [castRough, carbonMap, pcbBack].forEach((t) => renderer.initTexture(t));
  renderer.compile(scene, camera);
  modMasks.forEach((m) => { m.material[4] = FACE[1]; }); renderer.compile(scene, camera);
  modMasks.forEach((m) => { m.material[4] = FACE[0]; }); modBoards.forEach((b) => { b.visible = false; }); wallFaces.count = wallBodies.count = 0;
  for (const ps_ of [DOF, DOWN, UP, FINAL]) { renderer.setRenderTarget(RT.u2); ps_.run(RT.u2); }
  renderer.setRenderTarget(null);
})();
video.play().catch(() => {});
document.body.classList.add('ready');
requestAnimationFrame(frame);
