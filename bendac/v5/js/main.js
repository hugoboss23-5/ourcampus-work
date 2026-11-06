// Bendac v5 "Day": a real matchday (Bendac's own photograph of The Rec, Bath) with Bendac footage on the pitchside boards,
// then one IMPAKT perimeter cabinet in a real daylight stadium (Poly Haven "Stadium 01", CC0, lit by its own HDR),
// then its face in macro. One clock u: 0..1 the boards switch on by themselves, 1..4 the three scroll moves.
//
// The cabinet follows Bendac's own IMPAKT render (bendac.tech/impakt): a wide thin slab, flat face to the edges, a thin black
// top strip, grey aluminium end plates with two handle slots and three lock blocks, two flat bar feet each on a short post.
// Bendac publishes no dimensions; 1920 x 960 mm is the working size (it divides evenly by every pitch quoted for IMPAKT:
// 6.67, 8 and 10 mm) until Bendac's datasheet arrives. Change CAB below and everything follows.
import * as THREE from 'three';
import { RGBELoader } from '../vendor/RGBELoader.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const SHOT = qs.has('shot');
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches && !SHOT;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lin01 = (a, b, x) => clamp01((x - a) / (b - a));
const sstep = (a, b, x) => { const t = lin01(a, b, x); return t * t * (3 - 2 * t); };
const ease = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const mix = (a, b, k) => a + (b - a) * k;

// ------------------------------------------------------------------ the cabinet (metres)
const CAB = { W: 1.92, H: 0.96, D: 0.08, PITCH: 0.008, LIFT: 0.10, FOOT_L: 0.52, FOOT_X: [-0.50, 0.50] };
CAB.NX = Math.round(CAB.W / CAB.PITCH); CAB.NY = Math.round(CAB.H / CAB.PITCH);

// ------------------------------------------------------------------ renderer
const canvas = $('gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: SHOT }); }
catch (e) { $('nogl').style.display = 'flex'; throw e; }
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const gl2 = renderer.capabilities.isWebGL2;
const RT_TYPE = THREE.HalfFloatType;
const view = { w: innerWidth, h: innerHeight, dpr: 1, q: 1 };
const isPhone = () => view.w < 900;
const tall = () => view.w / view.h < 0.9;

// ------------------------------------------------------------------ media
const video = $('vid');
const vtex = new THREE.VideoTexture(video);
vtex.colorSpace = THREE.NoColorSpace; vtex.generateMipmaps = true; vtex.minFilter = THREE.LinearMipmapLinearFilter; vtex.magFilter = THREE.LinearFilter;
const imgTex = (id, srgb, mip = true) => {
  const t = new THREE.Texture($(id)); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; return t;
};
// Bendac's own advert for the boards: their tagline, white Michroma on Bendac green (drawn once the font has loaded)
const tagCv = document.createElement('canvas'); tagCv.width = 2048; tagCv.height = 256;
const tagTex = new THREE.CanvasTexture(tagCv); tagTex.colorSpace = THREE.NoColorSpace; tagTex.generateMipmaps = true; tagTex.minFilter = THREE.LinearMipmapLinearFilter; tagTex.anisotropy = 8;
function drawTag() {
  const g = tagCv.getContext('2d'); g.fillStyle = '#029046'; g.fillRect(0, 0, 2048, 256);
  g.fillStyle = '#ffffff'; g.font = '400 92px Michroma'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('THE PERFECT PIXEL PEOPLE', 1024, 132); tagTex.needsUpdate = true;
}
const photoTex = imgTex('photo-src'), maskTex = imgTex('mask-src', false, false), skyTex = imgTex('sky-src'), logoTex = imgTex('logo-src');
skyTex.wrapS = THREE.RepeatWrapping;
const BOARD = { y0: 0.8520946138500998, y1: 0.9296095753776005, pt: [0.0482013747932289, -0.05172192374802249, 0.004632619338032531, 0.8677356452841791],
  pb: [0.004834856053082644, -0.004579171905264195, -0.0013130294721049398, 0.9133317566033574], xEnd: 0.9659889796693901, aspect: 5263 / 3509 };
// where the camera dives in the photograph: the board panel showing the Bendac mark (photo coords, y from the top)
const DIVE = { x: 0.505, y: 0.8876 };

// ------------------------------------------------------------------ shared GLSL: what Bendac's screens show
const U = {
  uVid: { value: vtex }, uLogo: { value: logoTex }, uTag: { value: tagTex }, uTime: { value: 0 }, uPage: { value: 0 }, uWipe: { value: 0 }, uOn: { value: 0 },
  uFocus: { value: 2 }, uDofK: { value: 0 }, uSky: { value: skyTex }, uSkyK: { value: 1.075 }, uCapH: { value: 1.6 },
  uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Vector3(1, 1, 1) },
};
const CONTENT = /* glsl */`
  uniform sampler2D uVid, uLogo, uTag; uniform float uTime, uPage, uWipe, uOn;
  vec3 lin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
  float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  // a panel of content in [0,1]^2 (v from the bottom), aspect = width / height of the panel
  vec3 panel(float kind, vec2 q, float aspect, float lod){
    if (kind < 0.5) { // the Bendac mark on black
      vec2 lu = vec2(0.5 + (q.x - 0.5) * aspect / (0.62 * 3.285), 0.5 + (q.y - 0.5) / 0.62);
      float a = (lu.x > 0.0 && lu.x < 1.0 && lu.y > 0.0 && lu.y < 1.0) ? textureLod(uLogo, lu, lod).a : 0.0;
      return vec3(0.82) * a;
    }
    if (kind > 1.5) { // the tagline on Bendac green, its 8:1 artwork fitted to the panel's height
      vec2 tu = vec2(0.5 + (q.x - 0.5) * aspect / 8.0, q.y);
      vec3 g = lin(vec3(0.008, 0.565, 0.275));
      return (tu.x > 0.0 && tu.x < 1.0) ? lin(textureLod(uTag, tu, lod).rgb) : g;
    }
    // Bendac's footage, cropped to fill the panel (the band with the most going on: the crest and the sky)
    vec2 vq = q; float va = 16.0 / 9.0;
    if (aspect > va) vq.y = 0.7 + (q.y - 0.5) * va / aspect; else vq.x = 0.5 + (q.x - 0.5) * aspect / va;
    return lin(textureLod(uVid, vq, lod).rgb) * 1.08;
  }
`;

// every 3D material writes its circle of confusion into alpha, for the depth of field pass
let keyN = 0;
function patch(mat, extra) {
  const key = 'p' + (keyN++);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = 'uniform float uFocus; uniform float uDofK;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n  gl_FragColor.a = clamp(uDofK * abs(vViewPosition.z - uFocus) / max(vViewPosition.z, 0.005), 0.0, 1.0);');
    if (extra) extra(sh);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// ------------------------------------------------------------------ scene: the daylight stadium
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 2000);
// the photographed stadium, projected onto the ground it was shot from so the cabinet can stand on its grass
const skyMat = new THREE.ShaderMaterial({
  uniforms: U, side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w * 0.99999; }',
  fragmentShader: /* glsl */`
    uniform sampler2D uSky; uniform float uSkyK, uCapH, uFocus, uDofK;
    varying vec3 vW;
    vec3 sky(vec3 D){ vec2 uv = vec2(atan(D.z, D.x) / 6.2831853 + 0.5, asin(clamp(D.y, -1.0, 1.0)) / 3.1415927 + 0.5);
      vec3 c = texture2D(uSky, uv).rgb; return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
    void main(){
      vec3 V = normalize(vW - cameraPosition);
      vec3 D = V; float dist = 300.0;
      if (V.y < -0.0005) { // the ray meets the grass: look that point up from where the panorama was shot
        float t = cameraPosition.y / -V.y; vec3 P = cameraPosition + V * t; dist = t;
        D = normalize(P - vec3(0.0, uCapH, 0.0));
      }
      vec3 col = sky(D) * uSkyK;
      gl_FragColor = vec4(col, clamp(uDofK * abs(dist - uFocus) / dist, 0.0, 1.0));
    }`,
});
const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(500, 64, 32), skyMat); skyMesh.frustumCulled = false; scene.add(skyMesh);

// ------------------------------------------------------------------ the IMPAKT cabinet
const cab = new THREE.Group(); scene.add(cab);
const P = (o) => { delete o.clearcoat; delete o.clearcoatRoughness; return patch(new THREE.MeshStandardMaterial(o)); };
const ctex = (w, h, draw, srgb = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const grain = ctex(256, 256, (g, w, h) => { const im = g.createImageData(w, h); for (let i = 0; i < w * h; i++) { const v = 140 + (rnd() - 0.5) * 60; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } g.putImageData(im, 0, 0); }, false);
// brushed aluminium: fine horizontal streaks
const brushed = ctex(512, 64, (g, w, h) => { g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { const y = rnd() * h; g.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},0)`; g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; g.fillRect(0, y, w, 0.6 + rnd()); } }, false);
const M = {
  coat: P({ color: 0x15171a, metalness: 0.35, roughness: 0.55, roughnessMap: grain, clearcoat: 0.15, clearcoatRoughness: 0.5 }),
  alu: P({ color: 0x9da2a8, metalness: 0.95, roughness: 0.34, roughnessMap: brushed }),
  aluDark: P({ color: 0x1b1d20, metalness: 0.6, roughness: 0.5 }),
  rubber: P({ color: 0x0c0d0e, metalness: 0.0, roughness: 0.82, roughnessMap: grain }),
  foot: P({ color: 0x121a2a, metalness: 0.5, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
  chrome: P({ color: 0xd6dade, metalness: 1.0, roughness: 0.12 }),
};
const Y0 = CAB.LIFT, YC = CAB.LIFT + CAB.H / 2;
// a run of cabinets along the touchline, joined end to end, the way perimeter boards stand; the middle one is the hero
CAB.N = 5; CAB.HERO = 2; CAB.GAP = 0.002;
const cabX = (i) => (i - (CAB.N - 1) / 2) * (CAB.W + CAB.GAP);
function buildCabinet(i) {
  const ox = cabX(i);
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(ox + x, y, z); cab.add(b); return b; };
  // body: the back shell, set in from the face by the end plates
  box(CAB.W - 0.012, CAB.H - 0.004, CAB.D - 0.006, M.coat, 0, YC, -CAB.D / 2 - 0.003);
  // end plates: grey aluminium, two handle slots, three lock blocks (as in Bendac's render)
  for (const sx of [-1, 1]) {
    const x = sx * (CAB.W / 2 - 0.003);
    box(0.006, CAB.H, CAB.D, M.alu, x, YC, -CAB.D / 2);
    const outer = (sx < 0 && i === 0) || (sx > 0 && i === CAB.N - 1);
    if (!outer) continue; // between cabinets the plates meet; only the run's two ends show their slots and blocks
    for (const sy of [-1, 1]) {
      box(0.004, 0.17, 0.034, M.aluDark, x + sx * 0.0015, YC + sy * 0.33, -CAB.D / 2);
      box(0.002, 0.19, 0.046, M.alu, x + sx * 0.0035, YC + sy * 0.33, -CAB.D / 2);
    }
    for (const yy of [-0.17, 0, 0.17]) box(0.012, yy === 0 ? 0.14 : 0.05, 0.03, M.alu, x + sx * 0.006, YC + yy, -CAB.D / 2 + 0.006);
  }
  // top: a thin black rubber cap in sections (the notches in the render)
  const n = 16, gap = 0.004, w = (CAB.W - gap * (n - 1)) / n;
  for (let k = 0; k < n; k++) box(w, 0.012, CAB.D + 0.004, M.rubber, -CAB.W / 2 + w / 2 + k * (w + gap), Y0 + CAB.H + 0.006, -CAB.D / 2 + 0.002);
  box(CAB.W - 0.01, 0.004, CAB.D - 0.01, M.rubber, 0, Y0 + CAB.H + 0.002, -CAB.D / 2);
  // feet: a flat bar across the depth, chamfered, on a short chrome post
  for (const fx of CAB.FOOT_X) {
    const bar = new THREE.Shape(); const L = CAB.FOOT_L, t = 0.016, c = 0.03;
    bar.moveTo(-L / 2, 0); bar.lineTo(L / 2, 0); bar.lineTo(L / 2 - c, t); bar.lineTo(-L / 2 + c, t); bar.lineTo(-L / 2, 0);
    const g = new THREE.ExtrudeGeometry(bar, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
    g.translate(0, 0, -0.035); g.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(g, M.foot); m.position.set(ox + fx, 0.001, -CAB.D / 2 + 0.03); cab.add(m);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, CAB.LIFT - 0.016, 24), M.chrome);
    post.position.set(ox + fx, 0.016 + (CAB.LIFT - 0.016) / 2, -CAB.D / 2); cab.add(post);
  }
  // the face: its uv runs across the whole board, so one picture spans every cabinet
  const fg = new THREE.PlaneGeometry(CAB.W, CAB.H); const uv = fg.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / CAB.N);
  const face = new THREE.Mesh(fg, faceMat); face.position.set(ox, YC, 0.0005); cab.add(face);
}

// the face: a soft rubber mask with shallow ridges and SMD packages (grey epoxy that glows the mixed colour, three small dies
// inside); physically lit by the stadium. Far away it resolves to the plain picture; close up every package, ridge and die shows.
const faceMat = P({ color: 0xffffff, metalness: 0.0, roughness: 0.8 }); faceMat.defines = { USE_UV: '' };
const faceGLSL = /* glsl */`
  uniform float uPitch, uNX, uNY, uN;
  varying vec3 vFT, vFB, vFN;
  ${CONTENT}
  float sdRBox(vec2 p, float h, float r){ vec2 d = abs(p) - vec2(h - r); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
  // the run's advert: the Bendac mark on the first cabinet, Bendac footage across the rest
  vec3 runContent(vec2 q, float lod){
    float c0 = q.x * uN;
    if (c0 < 1.0) return panel(0.0, vec2(c0, q.y), uNX / uN / uNY, lod);
    return panel(2.0, vec2((c0 - 1.0) / (uN - 1.0), q.y), (uN - 1.0) * uNX / uN / uNY, lod);
  }
`;
const facePatch = (sh) => {
  Object.assign(sh.uniforms, { uPitch: { value: CAB.PITCH }, uNX: { value: CAB.NX * CAB.N }, uNY: { value: CAB.NY }, uN: { value: CAB.N } });
  faceMat.userData.sh = sh;
  sh.vertexShader = 'varying vec3 vFT, vFB, vFN;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vFT = normalize((viewMatrix * vec4(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0), 0.0)).xyz); vFB = normalize((viewMatrix * vec4(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0), 0.0)).xyz); vFN = normalize((viewMatrix * vec4(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0), 0.0)).xyz);');
  sh.fragmentShader = faceGLSL + sh.fragmentShader
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 cg = vUv * vec2(uNX, uNY); vec2 cell = floor(cg); vec2 f = fract(cg) - 0.5;
      float px = max(length(fwidth(cg)), 1e-4);               // cells per screen pixel
      float near = 1.0 - smoothstep(0.12, 0.35, px);
      float aa = max(px, 0.004) * 0.9;
      float pkg = (1.0 - smoothstep(-aa, aa, sdRBox(f, 0.17, 0.04))) * near;    // 2727-size package on an 8 mm cell
      float ridge = smoothstep(0.32, 0.46, abs(f.y + 0.02)) * near;                 // the mask's shallow horizontal ridge
      vec3 maskC = vec3(0.022, 0.023, 0.025), pkgC = vec3(0.16, 0.16, 0.155);
      diffuseColor.rgb = mix(maskC * (1.0 - 0.3 * ridge), pkgC, pkg);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(0.86, 0.28, pkg) * mix(1.0, 0.9, ridge); `)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { // bumps: the package's rounded edges and the mask ridge, on this flat face
        vec2 e = f; vec2 slope = vec2(0.0);
        slope.x += (smoothstep(0.13, 0.17, abs(e.x)) * sign(e.x)) * (1.0 - smoothstep(0.15, 0.2, abs(e.y))) * 0.9;
        slope.y += (smoothstep(0.13, 0.17, abs(e.y)) * sign(e.y)) * (1.0 - smoothstep(0.15, 0.2, abs(e.x))) * 0.9;
        slope.y += (smoothstep(0.32, 0.40, abs(e.y + 0.02)) - smoothstep(0.42, 0.5, abs(e.y + 0.02))) * sign(e.y + 0.02) * 0.6;
        slope *= near;
        vec3 tN = normalize(vec3(-slope, 1.0));
        normal = normalize(vFT * tN.x + vFB * tN.y + vFN * tN.z);
      }`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec2 cc = (cell + 0.5) / vec2(uNX, uNY);
        float fs = max(length(fwidth(vUv)), 1e-6);
        vec3 cN = runContent(cc, 2.0);
        vec3 cF = runContent(vUv, log2(max(fs * 1280.0 / uN, 1.0)));
        // the light: the package epoxy glows the mixed colour, the three dies are small bright points inside it.
        // Both shares are normalised by their areas, so the near pattern averages to exactly the far picture.
        float sg = max(0.011, aa * 0.75);
        vec2 dR = f - vec2(-0.055, -0.035), dG = f - vec2(0.0, 0.05), dB = f - vec2(0.055, -0.035);
        float gk = 1.0 / (6.2831853 * sg * sg);
        vec3 dies = vec3(exp(-dot(dR, dR) / (2.0 * sg * sg)), exp(-dot(dG, dG) / (2.0 * sg * sg)), exp(-dot(dB, dB) / (2.0 * sg * sg))) * gk;
        float glow = pkg * (0.6 + 0.4 * exp(-dot(f, f) / 0.01));
        vec3 nearE = cN * (0.3 * dies + 0.7 * glow / 0.082);
        totalEmissiveRadiance = mix(cF, nearE, near) * uOn * 2.6;
      }`);
};
faceMat.onBeforeCompile = ((orig) => (sh) => { orig(sh); facePatch(sh); })(faceMat.onBeforeCompile);
for (let i = 0; i < CAB.N; i++) buildCabinet(i);
// one draw per material: merge every part of the run (positions baked into world space of the group)
{
  const byMat = new Map();
  cab.updateMatrixWorld(true);
  for (const m of [...cab.children]) { if (!byMat.has(m.material)) byMat.set(m.material, []); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix); byMat.get(m.material).push(g); cab.remove(m); }
  for (const [mat, gs] of byMat) {
    const n = gs.reduce((a, g) => a + g.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
    for (const g of gs) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(mg, mat); mesh.frustumCulled = false; cab.add(mesh);
  }
}
// soft contact shadow under the cabinet and feet, cast long by the low sun (drawn once the sun is known)
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false });
shadowMat.blending = THREE.CustomBlending; shadowMat.blendEquation = THREE.AddEquation;
shadowMat.blendSrc = THREE.ZeroFactor; shadowMat.blendDst = THREE.OneMinusSrcAlphaFactor;
shadowMat.blendSrcAlpha = THREE.ZeroFactor; shadowMat.blendDstAlpha = THREE.OneFactor;
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; scene.add(shadow);
function drawShadow(sun) {
  // project the slab and feet along the sun onto the ground, in a 2D canvas, blurred by the sun's size and the distance
  const ext = 16, N = 1024, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  const toPx = (x, z) => [(x / ext + 0.5) * N, (z / ext + 0.5) * N];
  const proj = (p) => { const t = p.y / Math.max(sun.y, 0.05); return toPx(p.x - sun.x * t, p.z - sun.z * t); };
  g.clearRect(0, 0, N, N);
  const poly = (pts, a, blur) => { g.filter = `blur(${blur}px)`; g.fillStyle = `rgba(0,0,0,${a})`; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.closePath(); g.fill(); };
  const w = CAB.N * (CAB.W + CAB.GAP) / 2, d0 = -CAB.D, d1 = 0;
  const slab = [[-w, Y0, d1], [w, Y0, d1], [w, Y0 + CAB.H, d1], [-w, Y0 + CAB.H, d1], [-w, Y0 + CAB.H, d0], [w, Y0 + CAB.H, d0], [w, Y0, d0], [-w, Y0, d0]].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  // convex hull of the projected slab corners
  const pts = slab.map(proj); const hull = (P) => { P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = []; for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of P.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } up.pop(); lo.pop(); return lo.concat(up); };
  poly(hull(pts), 0.55, 7);
  for (let ci = 0; ci < CAB.N; ci++) for (const fx0 of CAB.FOOT_X) { const fx = fx0 + cabX(ci); const a = toPx(fx - 0.04, -CAB.D / 2 - CAB.FOOT_L / 2), b = toPx(fx + 0.04, -CAB.D / 2 + CAB.FOOT_L / 2); g.filter = 'blur(2px)'; g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
  // ambient occlusion right under the slab
  const a = toPx(-w - 0.05, -CAB.D - 0.08), b = toPx(w + 0.05, 0.08); g.filter = 'blur(10px)'; g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
  const t = new THREE.CanvasTexture(c); shadowMat.alphaMap = null; shadowMat.map = null;
  shadowMat.onBeforeCompile = (sh) => { sh.uniforms.tSh = { value: t }; sh.fragmentShader = 'uniform sampler2D tSh;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor = vec4(0.0, 0.0, 0.0, texture2D(tSh, vUv).a * 0.85);'); };
  shadowMat.defines = { USE_UV: '' }; shadowMat.needsUpdate = true;
  shadow.scale.set(ext, ext, 1);
}

// ------------------------------------------------------------------ the photograph, with live boards (a full-screen pass)
const quad = new THREE.BufferGeometry(); quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
const pcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const VS = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function pass(fs, uniforms, defines) {
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, ...(defines ? { defines } : {}) });
  const s = new THREE.Scene(); const me = new THREE.Mesh(quad, m); me.frustumCulled = false; s.add(me);
  return { u: uniforms, m, run(t) { renderer.setRenderTarget(t); renderer.render(s, pcam); } };
}
const PHOTO = pass(/* glsl */`
  uniform sampler2D uPhoto, uMask; uniform vec4 uWin; uniform vec2 uRes; uniform vec4 uPt, uPb; uniform vec3 uBand;
  ${CONTENT}
  varying vec2 vUv;
  float poly(vec4 c, float x){ return ((c.x * x + c.y) * x + c.z) * x + c.w; }
  void main(){
    // uWin: photo window centre (x, y from the top) and size (w, h) in photo units
    vec2 p = uWin.xy + (vec2(vUv.x, 1.0 - vUv.y) - 0.5) * uWin.zw;
    vec3 c = texture2D(uPhoto, vec2(p.x, 1.0 - p.y)).rgb;
    c = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
    if (p.y > uBand.x && p.y < uBand.y && p.x < uBand.z) {
      float m = texture2D(uMask, vec2(p.x, 1.0 - (p.y - uBand.x) / (uBand.y - uBand.x))).r;
      if (m > 0.002) {
        float t = poly(uPt, p.x), b = poly(uPb, p.x);
        float v = clamp((p.y - t) / (b - t), 0.0, 1.0), su = p.x / uBand.z;
        // the run is cut into panels; they switch on from the left, then change page with a wipe
        float runH = (b - t) / ${(1 / BOARD.aspect).toFixed(6)};            // board height in photo-width units
        float plen = runH * 6.5, idx = floor(p.x / plen), lu = fract(p.x / plen);
        float k = mod(idx + uPage, 4.0), k2 = mod(idx + uPage + 1.0, 4.0);
        float kind = k < 0.5 ? 0.0 : (k < 1.5 ? 2.0 : (k < 2.5 ? 1.0 : 2.0)), kind2 = k2 < 0.5 ? 0.0 : (k2 < 1.5 ? 2.0 : (k2 < 2.5 ? 1.0 : 2.0));
        float fsx = fwidth(p.x) / plen;
        vec3 led = lu < uWipe ? panel(kind2, vec2(lu, 1.0 - v), 6.5, log2(max(fsx * 1280.0, 1.0))) : panel(kind, vec2(lu, 1.0 - v), 6.5, log2(max(fsx * 1280.0, 1.0)));
        led += vec3(0.05, 0.9, 0.35) * 1.2 * exp(-pow((lu - uWipe) * plen / (runH * 0.3), 2.0)) * step(0.001, uWipe) * step(uWipe, 0.999);
        // switch-on: a green edge runs along the board from the left
        float front = uOn * 1.15 - su;
        float on = smoothstep(0.0, 0.01, front);
        // up close the 8 mm pixel grid shows (120 rows on the board); far away it averages to the plain picture
        vec2 g = vec2(p.x * ${BOARD.aspect.toFixed(5)} * 120.0 / (b - t), v * 120.0);
        float pxs = length(fwidth(g));
        float dotp = smoothstep(0.40, 0.12, length(fract(g) - 0.5)) / 0.30;
        led *= mix(1.0, dotp, 1.0 - smoothstep(0.12, 0.45, pxs));
        // in daylight the black face reflects the sky a little
        vec3 board = led * 1.25 + vec3(0.030, 0.034, 0.040);
        c = mix(c, board, m * on) + vec3(0.05, 1.0, 0.35) * 2.0 * exp(-pow(front / 0.008, 2.0)) * step(uOn, 0.999) * m;
      }
    }
    gl_FragColor = vec4(c, 1.0);
  }`, { ...U, uPhoto: { value: photoTex }, uMask: { value: maskTex }, uWin: { value: new THREE.Vector4(0.5, 0.5, 1, 1) }, uRes: { value: new THREE.Vector2() },
  uPt: { value: new THREE.Vector4(...BOARD.pt) }, uPb: { value: new THREE.Vector4(...BOARD.pb) }, uBand: { value: new THREE.Vector3(BOARD.y0, BOARD.y1, BOARD.xEnd) } });

// ------------------------------------------------------------------ post: depth of field from the alpha CoC, bloom, neutral tone map
const mkRT = (samples = 0, depth = false) => new THREE.WebGLRenderTarget(4, 4, { type: RT_TYPE, samples, depthBuffer: depth, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const RT = { scene: mkRT(gl2 ? 2 : 0, true), photo: mkRT(), dof: mkRT(), b1: mkRT(), b2: mkRT(), b3: mkRT(), u2: mkRT(), u1: mkRT() };
const DOF = pass(`uniform sampler2D tScene; uniform vec2 uPx; uniform float uMaxR; varying vec2 vUv;
  void main(){
    vec4 c0 = texture2D(tScene, vUv); float r0 = c0.a * uMaxR;
    vec3 acc = c0.rgb; float ws = 1.0;
    if (r0 > 0.75) {
      for (int i = 0; i < TAPS; i++) {
        float fi = float(i) + 0.5; float rad = sqrt(fi / float(TAPS)) * r0; float th = fi * 2.39996323;
        vec4 s = texture2D(tScene, vUv + vec2(cos(th), sin(th)) * rad * uPx);
        float w = clamp(s.a * uMaxR - rad + 1.0, 0.0, 1.0);
        float l = max(s.r, max(s.g, s.b)); s.rgb *= min(1.0, 3.0 / max(l, 1e-4));
        acc += s.rgb * w; ws += w;
      }
    }
    gl_FragColor = vec4(acc / ws, c0.a);
  }`, { tScene: { value: null }, uPx: { value: new THREE.Vector2() }, uMaxR: { value: 20 } }, { TAPS: isPhone() ? 12 : 18 });
const DOWN = pass(`uniform sampler2D tIn; uniform vec2 uPx; uniform float uThr; varying vec2 vUv;
  void main(){
    vec3 c = (texture2D(tIn, vUv + uPx * vec2(-1.0, -1.0)).rgb + texture2D(tIn, vUv + uPx * vec2(1.0, -1.0)).rgb
            + texture2D(tIn, vUv + uPx * vec2(-1.0, 1.0)).rgb + texture2D(tIn, vUv + uPx * vec2(1.0, 1.0)).rgb) * 0.25;
    if (uThr > 0.0) { float l = max(c.r, max(c.g, c.b)); c *= max(l - uThr, 0.0) / max(l, 1e-4); c = min(c, vec3(40.0)); }
    gl_FragColor = vec4(c, 1.0);
  }`, { tIn: { value: null }, uPx: { value: new THREE.Vector2() }, uThr: { value: 0 } });
const UP = pass(`uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 uPx; varying vec2 vUv;
  void main(){
    vec3 b = texture2D(tLow, vUv + uPx * vec2(-1.0, -1.0)).rgb + texture2D(tLow, vUv + uPx * vec2(1.0, -1.0)).rgb
           + texture2D(tLow, vUv + uPx * vec2(-1.0, 1.0)).rgb + texture2D(tLow, vUv + uPx * vec2(1.0, 1.0)).rgb;
    gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + b * 0.25, 1.0);
  }`, { tLow: { value: null }, tHigh: { value: null }, uPx: { value: new THREE.Vector2() } });
const FINAL = pass(`uniform sampler2D tScene, tDof, tBloom, tPhoto; uniform float uBloom, uMaxR, uTime, uExp, uMix, uFade;
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
    vec3 c3 = vec3(0.0);
    if (uMix > 0.001) {
      vec4 s = texture2D(tScene, vUv); vec4 d = texture2D(tDof, vUv);
      float t = smoothstep(0.7, 2.2, s.a * uMaxR);
      c3 = mix(s.rgb, d.rgb, t) + texture2D(tBloom, vUv).rgb * uBloom;
      c3 = clamp(neutral(max(c3 * uExp, 0.0)), 0.0, 1.0);
    }
    vec3 cp = uMix < 0.999 ? clamp(texture2D(tPhoto, vUv).rgb, 0.0, 1.0) : vec3(0.0);
    vec3 c = srgb(mix(cp, c3, uMix)) * uFade;
    c += (h(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * (1.4 / 255.0);
    gl_FragColor = vec4(c, 1.0);
  }`, { tScene: { value: null }, tDof: { value: null }, tBloom: { value: null }, tPhoto: { value: RT.photo.texture }, uBloom: { value: 0.18 }, uMaxR: { value: 20 },
  uTime: { value: 0 }, uExp: { value: 0.93 }, uMix: { value: 0 }, uFade: { value: 1 } });

function resize() {
  view.w = innerWidth; view.h = innerHeight;
  const base = Math.min(devicePixelRatio || 1, isPhone() ? 1.7 : 1.1);
  view.dpr = base * view.q;
  renderer.setPixelRatio(view.dpr); renderer.setSize(view.w, view.h, false);
  const W = Math.round(view.w * view.dpr), H = Math.round(view.h * view.dpr);
  RT.scene.setSize(W, H); RT.photo.setSize(W, H); RT.dof.setSize(W, H);
  RT.b1.setSize(W >> 1, H >> 1); RT.u1.setSize(W >> 1, H >> 1); RT.b2.setSize(W >> 2, H >> 2); RT.u2.setSize(W >> 2, H >> 2); RT.b3.setSize(W >> 3, H >> 3);
  DOF.u.uPx.value.set(1 / W, 1 / H); DOF.u.uMaxR.value = FINAL.u.uMaxR.value = Math.round(14 * view.dpr);
  PHOTO.u.uRes.value.set(W, H);
  camera.aspect = view.w / view.h; camera.updateProjectionMatrix();
  document.documentElement.style.setProperty('--vh', view.h + 'px');
  $('track').style.height = (view.h * 4) + 'px';
}

// ------------------------------------------------------------------ story
// photo window: (centre x, centre y from the top, height) in photo units; the width follows the screen
function photoWin(u, out) {
  const sa = view.w / view.h, pa = BOARD.aspect;
  const hFull = Math.min(1, pa / sa);                       // the tallest window that still covers the screen
  // matchday: the whole stand, or on a phone a slow pan across it; the dive: into the Bendac panel on the board
  const pan = tall() ? mix(0.70, 0.56, ease(lin01(0, 1, u))) : 0.5;
  const w0 = { x: pan, y: 0.68, h: Math.min(hFull, 0.64) };   // the lower stand: its dark band mid-screen carries the words
  const zoom = tall() ? 0.16 : 0.12;                         // window height at the deepest point of the dive
  const k = ease(lin01(1.05, 1.82, u)), kOut = ease(lin01(3.18, 3.9, u));
  let x = mix(w0.x, DIVE.x, k), y = mix(w0.y, DIVE.y, k), h = Math.exp(mix(Math.log(w0.h), Math.log(zoom), k));
  if (u > 3.0) { const wEnd = { x: tall() ? 0.42 : 0.5, y: 0.68, h: Math.min(hFull, 0.64) }; x = mix(DIVE.x, wEnd.x, kOut); y = mix(DIVE.y, wEnd.y, kOut); h = Math.exp(mix(Math.log(zoom * 0.6), Math.log(wEnd.h), kOut)); }
  const w = h * sa / pa;
  // keep the window inside the photograph
  x = Math.min(1 - w / 2, Math.max(w / 2, x)); y = Math.min(1 - h / 2, Math.max(h / 2, y));
  out.set(x, y, w, h);
}
// 3D camera: a pose curve around the cabinet: (target, yaw, pitch, log distance) keyed in u
const key = (u, tx, ty, tz, yaw, pitch, d) => ({ u, t: new THREE.Vector3(tx, ty, tz), yaw, pitch, ld: Math.log(d) });
function keys3d() {
  const ph = tall();
  const d2 = ph ? 5.6 : 3.4;
  return [
    key(1.70, 0.25, YC, 0, 0.0, 0.0, ph ? 0.32 : 0.28),            // arriving: square on, the face filling the frame
    key(2.00, ph ? 0.0 : -0.42, ph ? YC + 0.42 : YC - 0.05, 0, -0.62, 0.16, d2),    // stop 2: three quarters, the stadium behind
    key(2.50, 0.30, YC - 0.12, 0, -0.28, 0.06, 0.6),
    key(3.00, 0.36, YC - 0.17, 0, -0.95, 0.38, ph ? 0.07 : 0.085), // stop 3: macro across the face, from above and the side
    key(3.20, 0.20, YC, 0, -0.5, 0.2, 1.2),
  ];
}
let K3 = null;
function pose3d(u) {
  const K = K3; let i = 0; while (i < K.length - 2 && u > K[i + 1].u) i++;
  const a = K[i], b = K[i + 1], k = ease(lin01(a.u, b.u, u));
  const T = a.t.clone().lerp(b.t, k), yaw = mix(a.yaw, b.yaw, k), pitch = mix(a.pitch, b.pitch, k), d = Math.exp(mix(a.ld, b.ld, k));
  const D = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  return { T, P: T.clone().addScaledVector(D, d), d };
}
const st = { u: 0, uv: 0, auto: 0, scrollU: 1, time: 0, ptr: new THREE.Vector2(), ptrS: new THREE.Vector2(), spin: 0, spinS: 0, page: 0, pageT: 0, wipe: 0, wiping: false, last: performance.now() };
if (RM) st.auto = 1;
window.__probe = { frames: [] };
const win = new THREE.Vector4();

function frameAt(u, dt) {
  // the boards switch on (u 0.15..0.85), then change page every 6 s
  U.uOn.value = SHOT && u >= 0.85 ? 1 : lin01(0.12, 0.85, u);
  U.uTime.value = st.time;
  photoWin(u, win); win.x += st.ptrS.x * 0.004 * (u < 1.05 ? 1 : 0); PHOTO.u.uWin.value.copy(win);
  // 3D: in from the board at u 1.70..1.85, out again 3.05..3.2
  const m3 = sstep(1.70, 1.84, u) * (1 - sstep(3.08, 3.22, u));
  FINAL.u.uMix.value = m3;
  if (m3 > 0.001) {
    const p = pose3d(Math.min(Math.max(u, 1.7), 3.2));
    // finger and drift: orbit a little round the target
    const off = p.P.clone().sub(p.T);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), st.ptrS.x * 0.06 + Math.sin(st.time * 0.21) * 0.01);
    camera.position.copy(p.T).add(off); camera.lookAt(p.T);
    camera.fov = tall() ? 50 : 34; camera.near = Math.max(0.003, p.d * 0.05); camera.far = 1200; camera.updateProjectionMatrix();
    cab.rotation.y = cabYaw + st.spinS * sstep(1.9, 2.0, u) * (1 - sstep(2.05, 2.2, u));
    const macro = sstep(Math.log(0.8), Math.log(0.09), Math.log(p.d));
    U.uFocus.value = p.d; U.uDofK.value = mix(0.4, 0.7, macro) * sstep(1.8, 1.95, u);
    FINAL.u.uExp.value = 0.93 * (1 - 0.25 * macro);
      }
  return m3;
}

function render(dt) {
  const m3 = frameAt(st.uv, dt);
  if (m3 < 0.999) PHOTO.run(RT.photo);
  if (m3 > 0.001) {
    renderer.setRenderTarget(RT.scene); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
    DOF.u.tScene.value = RT.scene.texture; DOF.run(RT.dof);
    const W = RT.scene.width, H = RT.scene.height;
    DOWN.u.tIn.value = RT.scene.texture; DOWN.u.uPx.value.set(1 / W, 1 / H); DOWN.u.uThr.value = 1.0; DOWN.run(RT.b1);
    DOWN.u.tIn.value = RT.b1.texture; DOWN.u.uPx.value.set(2 / W, 2 / H); DOWN.u.uThr.value = 0; DOWN.run(RT.b2);
    DOWN.u.tIn.value = RT.b2.texture; DOWN.u.uPx.value.set(4 / W, 4 / H); DOWN.run(RT.b3);
    UP.u.tLow.value = RT.b3.texture; UP.u.tHigh.value = RT.b2.texture; UP.u.uPx.value.set(8 / W, 8 / H); UP.run(RT.u2);
    UP.u.tLow.value = RT.u2.texture; UP.u.tHigh.value = RT.b1.texture; UP.u.uPx.value.set(4 / W, 4 / H); UP.run(RT.u1);
    FINAL.u.tScene.value = RT.scene.texture; FINAL.u.tDof.value = RT.dof.texture; FINAL.u.tBloom.value = RT.u1.texture;
  }
  FINAL.u.uTime.value = st.time;
  FINAL.run(null);
}

// ------------------------------------------------------------------ overlay
const ov = { hero: $('ov-hero'), cab: $('ov-cab'), close: $('ov-close'), end: $('ov-end'), cue: $('cue'), turn: $('turn'), hint: $('hint') };
const dots = [...document.querySelectorAll('#rail button')];
let turnShown = true;
if (matchMedia('(hover: hover) and (pointer: fine)').matches) ov.turn.querySelector('span').textContent = 'Drag to turn it';
ov.hint.style.display = 'none';
function overlay(u) {
  const set = (el, o) => { el.style.opacity = o.toFixed(3); el.style.visibility = o < 0.01 ? 'hidden' : 'visible'; el.style.transform = `translateY(${((1 - o) * 10).toFixed(1)}px)`; };
  set(ov.hero, sstep(0.0, 0.08, u) * (1 - sstep(1.05, 1.25, u)));
  set(ov.cab, sstep(1.86, 1.97, u) * (1 - sstep(2.1, 2.28, u)));
  set(ov.turn, (turnShown ? 1 : 0) * sstep(1.93, 1.99, u) * (1 - sstep(2.04, 2.12, u)));
  set(ov.close, sstep(2.82, 2.96, u) * (1 - sstep(3.05, 3.16, u)));
  set(ov.end, sstep(3.62, 3.9, u));
  const cueAt = (a) => sstep(a - 0.05, a + 0.02, u) * (1 - sstep(a + 0.05, a + 0.15, u));
  set(ov.cue, sstep(0.9, 1.0, u) * (1 - sstep(1.05, 1.2, u)) + cueAt(2.0) + cueAt(3.0));
  const ch = u < 1.5 ? 0 : (u < 2.5 ? 1 : (u < 3.5 ? 2 : 3));
  dots.forEach((d, i) => d.setAttribute('aria-current', i === ch ? 'true' : 'false'));
  ov.end.classList.toggle('live', u > 3.7);
}

// ------------------------------------------------------------------ input
function scrollU() { const m = document.documentElement.scrollHeight - innerHeight; return 1 + 3 * (m > 0 ? clamp01(scrollY / m) : 0); }
addEventListener('scroll', () => { st.scrollU = scrollU(); }, { passive: true });
dots.forEach((d, i) => d.addEventListener('click', () => { scrollTo({ top: i * innerHeight, behavior: 'smooth' }); if (i === 0) st.auto = 1; }));
$('cue').addEventListener('click', () => { const i = Math.min(3, Math.floor(st.uv + 0.5)); scrollTo({ top: i * innerHeight, behavior: 'smooth' }); });
addEventListener('pointermove', (e) => { st.ptr.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1)); });
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, lx: e.clientX, t: performance.now(), spin: false }; kick(); });
addEventListener('pointermove', (e) => {
  if (!down || Math.abs(st.uv - 2) > 0.3) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  if (!down.spin && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) down.spin = true;
  if (down.spin) { st.spin = Math.max(-0.7, Math.min(0.7, st.spin + (e.clientX - down.lx) / Math.min(innerWidth, 900) * 2.4)); turnShown = false; }
  down.lx = e.clientX;
});
canvas.addEventListener('pointerup', (e) => { if (down && !down.spin && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && performance.now() - down.t < 500) nextPage(); down = null; });
addEventListener('pointerup', () => { down = null; }); addEventListener('pointercancel', () => { down = null; });
function nextPage() { if (!st.wiping) { st.wiping = true; st.wipe = 0; } }
const sheet = $('sheet');
const openSheet = (v) => { sheet.classList.toggle('open', v); sheet.setAttribute('aria-hidden', v ? 'false' : 'true'); if (v) $('sheet-close').focus(); };
$('start').addEventListener('click', () => openSheet(true));
$('sheet-close').addEventListener('click', () => openSheet(false));
sheet.addEventListener('click', (e) => { if (e.target === sheet) openSheet(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') openSheet(false); });
function kick() { if (video.paused) video.play().catch(() => {}); }
video.play().catch(() => {});
setInterval(() => { if (!SHOT && video.paused && document.visibilityState === 'visible') video.play().catch(() => {}); }, 700);

// ------------------------------------------------------------------ loop
let started = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - st.last) / 1000); st.last = now;
  if (!SHOT) {
    st.time += dt;
    if (started) st.auto = Math.min(1, st.auto + dt / 6.5);
    const target = Math.max(st.auto, st.scrollU > 1.002 ? st.scrollU : st.auto);
    st.uv += (target - st.uv) * (1 - Math.exp(-dt * (Math.abs(target - st.uv) > 0.3 ? 3.2 : 2.4)));
    st.ptrS.lerp(st.ptr, 1 - Math.exp(-dt * 3));
    if (!(down && down.spin)) st.spin *= Math.exp(-dt * (Math.abs(st.uv - 2) > 0.3 ? 4 : 0.9));
    st.spinS += (st.spin - st.spinS) * (1 - Math.exp(-dt * 8));
    st.pageT += dt; if (!st.wiping && st.pageT > 6 && (st.uv < 1.1 || st.uv > 3.3)) nextPage();
    if (st.uv > 1.1 && st.uv < 3.3 && st.page !== 0 && !st.wiping) nextPage();
    if (st.wiping) { st.wipe += dt / 0.8; if (st.wipe >= 1) { st.wiping = false; st.wipe = 0; st.page = (st.page + 1) % 4; st.pageT = 0; } }
    U.uPage.value = st.page; U.uWipe.value = st.wiping ? ease(st.wipe) : 0;
  }
  st.u = st.uv;
  render(dt); overlay(st.uv);
  const fm = window.__probe.frames; fm.push(dt * 1000); if (fm.length > 4000) fm.splice(0, 2000);
  if (dt > 0.04) (window.__probe.spikes = window.__probe.spikes || []).push([Math.round(dt * 1000), +st.uv.toFixed(3), +view.q.toFixed(2), +FINAL.u.uMix.value.toFixed(2)]);
  adapt(dt);
}
const adaptBuf = [];
function adapt(dt) {
  if (SHOT || !qs.has('adapt') || FINAL.u.uMix.value < 0.5) return; // off: resizing every buffer mid-scroll costs more than it saves
  adaptBuf.push(dt * 1000); if (adaptBuf.length < 60) return;
  const s = adaptBuf.slice().sort((a, b) => a - b); const p90 = s[Math.floor(s.length * 0.9)]; adaptBuf.length = 0;
  if (p90 > 19 && view.q > 0.7) { view.q = Math.max(0.7, view.q * 0.88); resize(); }
}

// ------------------------------------------------------------------ start: light from the stadium's own HDR, the sun found in it
async function start() {
  try { await document.fonts.load('400 40px Michroma'); } catch (e) {}
  drawTag();
  for (const id of ['photo-src', 'mask-src', 'sky-src', 'logo-src']) { const im = $(id); if (!im.complete) await new Promise((r) => im.addEventListener('load', r, { once: true })); }
  photoTex.needsUpdate = maskTex.needsUpdate = skyTex.needsUpdate = logoTex.needsUpdate = true;
  // the HDR comes as a URL when served, or as raw bytes when packed into one page (the artifact policy blocks fetching blobs)
  const hdrSrc = 'media/env.hdr';
  const hdrBuf = typeof hdrSrc === 'string' ? await (await fetch(hdrSrc)).arrayBuffer() : hdrSrc;
  const hd = new RGBELoader().setDataType(THREE.FloatType).parse(hdrBuf);
  const hdr = new THREE.DataTexture(hd.data, hd.width, hd.height, THREE.RGBAFormat, THREE.FloatType);
  hdr.colorSpace = THREE.LinearSRGBColorSpace; hdr.flipY = true; hdr.minFilter = hdr.magFilter = THREE.LinearFilter; hdr.generateMipmaps = false; hdr.needsUpdate = true;
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  // the sun: the brightest texel of the panorama
  { const { data, width, height } = hdr.image; let best = 0, bi = 0;
    for (let i = 0; i < width * height; i++) { const l = data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722; if (l > best) { best = l; bi = i; } }
    const r = Math.floor(bi / width), cx = bi % width; const uu = (cx + 0.5) / width, vv = 1 - (r + 0.5) / height;
    const phi = (uu - 0.5) * Math.PI * 2, th = (vv - 0.5) * Math.PI;
    U.uSun.value.set(Math.cos(th) * Math.cos(phi), Math.sin(th), Math.cos(th) * Math.sin(phi)).normalize();
    window.__sun = { best, dir: U.uSun.value.toArray() }; }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(hdr).texture;
  // the cabinet faces the sun a little from the side, so the face reads and the shadow falls behind and away
  const sun = U.uSun.value; const sunYaw = Math.atan2(sun.x, sun.z);
  cab.rotation.y = 0; scene.rotation.y = 0;
  cabYaw = sunYaw + Math.PI - 0.55; cab.rotation.y = cabYaw; // the low sun behind the board: rim light on its top, its shadow towards the camera
  drawShadow(sun.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -cabYaw));
  shadow.rotation.z = cabYaw;
  K3 = keys3d().map((k) => { k.t.applyAxisAngle(new THREE.Vector3(0, 1, 0), cabYaw); k.yaw += cabYaw; return k; });
  resize(); addEventListener('resize', () => { resize(); K3 = keys3d().map((k) => { k.t.applyAxisAngle(new THREE.Vector3(0, 1, 0), cabYaw); k.yaw += cabYaw; return k; }); });
  st.scrollU = scrollU();
  // compile and draw every pass once so the first scroll into the cabinet does not stall
  st.uv = 1.77; render(0.016); st.uv = 2.0; render(0.016); st.uv = 2.5; render(0.016); st.uv = 3.0; render(0.016); st.uv = 3.15; render(0.016); st.uv = 0; render(0.016);
  st.last = performance.now(); started = true;
  document.body.classList.add('ready');
  requestAnimationFrame(frame);
}
let cabYaw = 0;
start();

// ------------------------------------------------------------------ hooks for the proof tools
window.__v5 = {
  spin: () => st.spin, scale: () => view.dpr.toFixed(2), page: () => st.page + (st.wiping ? 0.5 : 0),
  async shot(u, opts = {}) {
    st.uv = st.u = u; st.time = opts.time ?? 3; st.ptrS.set(0, 0); st.spin = st.spinS = opts.spin ?? 0; st.page = opts.page ?? 0; st.wiping = false; U.uWipe.value = 0; U.uPage.value = st.page;
    if (opts.vt !== undefined) { video.pause(); await new Promise((r) => { const done = () => r(); video.addEventListener('seeked', done, { once: true }); video.currentTime = opts.vt; setTimeout(done, 1500); }); }
    vtex.needsUpdate = true;
    for (let i = 0; i < 3; i++) { render(0.016); overlay(u); await new Promise((r) => requestAnimationFrame(r)); }
    render(0.016); overlay(u);
    return true;
  },
};
