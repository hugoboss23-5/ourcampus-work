// D1 "The website is a screen". The whole viewport is one Bendac LED wall.
// Pass 1 (the processor): footage + the page's type are composed into a picture at render resolution, with mipmaps.
// Pass 2 (the wall): every fragment finds its diode; far from the eye the picture is smooth, inside the loupe and at
// coarse pitch each diode is drawn as three chips (R, G, B) in a black-face package on a black mask, with bloom.
// Scroll is pixel pitch: 0.4 mm (boardroom) to 2.5 mm (shops) to 10 mm (stadium), then Start a project.
// Facts: research/facts-2026-10-31.md. Footage: Bendac brand film 320fd8 (wixvideo), see tools/v4d1-media.sh.
import * as THREE from 'three';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s) => document.querySelector(s);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const MM = 0.75; // CSS px per mm of pitch: 0.4 mm = 0.3 px (finer than any phone pixel), 10 mm = 7.5 px

/* ---------- the stops (every visible fact is in research/facts-2026-10-31.md) ---------- */
const STOPS = [
  { pitch: 0.4, video: 'v0', focus: [0.30, 0.5], caption: { touch: 'Touch the screen to see its diodes. Scroll to change the pitch.', mouse: 'Move over the screen to see its diodes. Scroll to change the pitch.' } },
  { pitch: 2.5, video: 'v1', focus: [0.5, 0.5], caption: 'Versa, from 2.5 mm. Kennedy Space Center uses it across its site.' },
  { pitch: 10, video: 'v2', focus: [0.5, 0.5], caption: 'Stadiums. Outdoor, IP67, up to 10,000 nits.' },
  { pitch: 6, video: 'v0', focus: [0.30, 0.5], caption: '' },   // full circle: the opening picture again, now at 6 mm
];

/* ---------- renderer ---------- */
const canvas = $('#wall');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.PlaneGeometry(2, 2);

let VW = innerWidth, VH = innerHeight, CS = 1, phone = VW < 900;
const vids = STOPS.map((s) => document.getElementById(s.video));
const vtexOf = new Map();
const vtex = vids.map((v) => { if (vtexOf.has(v)) return vtexOf.get(v); const t = new THREE.VideoTexture(v); vtexOf.set(v, t); t.colorSpace = THREE.NoColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; });

/* type layers: one canvas per stop, drawn at render resolution so the wall's diodes sample real glyph edges */
const tcan = STOPS.map(() => document.createElement('canvas'));
const ttex = tcan.map((c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; });
const boxes = STOPS.map(() => ({ x: 0, y: 0, w: 1, h: 1 })); // headline box per stop, css px, y down (the loupe's idle path)

/* ---------- pass 1: the processor ---------- */
let rt = null;
const compU = {
  vA: { value: vtex[0] }, vB: { value: vtex[0] }, tA: { value: ttex[0] }, tB: { value: ttex[0] },
  fitA: { value: new THREE.Vector4(1, 1, 0, 0) }, fitB: { value: new THREE.Vector4(1, 1, 0, 0) },
  wipe: { value: 0 }, view: { value: new THREE.Vector2(1, 1) }, band: { value: 3 },
};
const compMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3, uniforms: compU, depthTest: false, depthWrite: false,
  vertexShader: `out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    precision highp float;
    uniform sampler2D vA, vB, tA, tB; uniform vec4 fitA, fitB; uniform float wipe, band; uniform vec2 view;
    in vec2 vUv; out vec4 o;
    vec3 layer(sampler2D v, vec4 fit, sampler2D t, vec2 uv){
      vec3 c = texture(v, uv * fit.xy + fit.zw).rgb;
      vec4 tx = texture(t, uv);           // premultiplied: black keyline, white fill
      return c * (1.0 - tx.a) + tx.rgb;
    }
    void main(){
      // the next picture is fed in from the bottom row up, like a processor refreshing the wall
      float y = vUv.y;
      vec3 c = y < wipe ? layer(vB, fitB, tB, vUv) : layer(vA, fitA, tA, vUv);
      float live = step(0.0005, wipe) * step(wipe, 0.9995);
      float d = abs(y - wipe) * view.y;
      c += vec3(0.85, 1.0, 0.9) * live * (exp(-d / band) * 0.55);
      o = vec4(c, 1.0);
    }`,
});
const compScene = new THREE.Scene(); compScene.add(new THREE.Mesh(quad, compMat));

/* ---------- pass 2: the wall ---------- */
const wallU = {
  comp: { value: null }, view: { value: new THREE.Vector2(1, 1) }, cs: { value: 1 }, cell: { value: 0.3 },
  L: { value: new THREE.Vector2() }, S: { value: new THREE.Vector2() }, R: { value: 80 }, M: { value: 60 }, Me: { value: 10 }, lead: { value: 0 }, open: { value: 0 },
  scan: { value: 0 }, norm: { value: 1 }, dotN: { value: 1 }, pkg: { value: 0 }, louver: { value: 0 }, light: { value: new THREE.Vector2(-0.4, 0.6) }, time: { value: 0 },
};
const wallMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3, uniforms: wallU, depthTest: false, depthWrite: false,
  vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    precision highp float;
    uniform sampler2D comp; uniform vec2 view, L, S, light; uniform float cs, cell, R, M, Me, lead, open, scan, norm, dotN, pkg, louver, time;
    out vec4 o;
    vec3 toLin(vec3 c){ return c * c; }                  // cheap gamma 2: light adds up in linear
    vec3 toGam(vec3 c){ return sqrt(max(c, 0.0)); }
    float sdBox(vec2 p, vec2 b){ vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    // one diode cell. f: position in the cell (-0.5..0.5), c: the cell's colour (linear), aa: cell units per pixel
    vec3 diode(vec2 f, vec3 c, vec3 glow, float aa, vec2 lightDir, float lit, float cellPx, float gain){
      // black-face SMD package (coarse pitch) or bare chips on the board (fine pitch, chip on board)
      float hp = mix(0.0, 0.3, pkg);
      float sp = sdBox(f, vec2(hp)) - 0.06 * pkg;
      float inPkg = smoothstep(aa, -aa, sp) * step(0.01, pkg);
      // three dies in a row; red sits slightly lower, as in a real 3-in-1 package
      vec2 dh = mix(vec2(0.05, 0.07), vec2(0.036, 0.052), pkg);
      float gap = mix(0.16, 0.12, pkg);
      float hk = mix(22.0, 48.0, smoothstep(8.0, 30.0, cellPx));
      vec3 e = vec3(0.0);
      vec3 col[3]; col[0] = vec3(1.0, 0.06, 0.03); col[1] = vec3(0.06, 1.0, 0.24); col[2] = vec3(0.08, 0.22, 1.0);
      float I[3]; I[0] = c.r; I[1] = c.g; I[2] = c.b;
      for (int k = 0; k < 3; k++) {
        vec2 off = vec2((float(k) - 1.0) * gap, k == 0 ? -0.012 : 0.0);
        float sd = sdBox(f - off, dh);
        float core = smoothstep(aa, -aa, sd);
        float halo = exp(-max(sd, 0.0) * hk);
        e += col[k] * I[k] * (core * 4.0 + halo * 1.1);
      }
      e *= vec3(1.0 / 1.14, 1.0 / 1.28, 1.0 / 1.27);   // white balance: the three dies together make white
      // light diffusing through the package's epoxy
      float dc = length(f);
      e += c * inPkg * (0.12 + 1.1 * exp(-dc * dc * 26.0));
      e *= gain;
      // seen from further away a diode is a soft round dot (its chips merge); the dot carries the same light
      float dotS = exp(-dc * dc * 11.0);
      vec3 ed = c * dotS * gain * dotN;
      e = mix(ed, e, smoothstep(7.0, 15.0, cellPx));
      // bloom of the neighbourhood over the mask: strong when diodes are small on screen, faint in close-up
      float gk = mix(0.10, 0.012, smoothstep(4.0, 22.0, cellPx));
      e += glow * gk * (0.5 + 0.8 * exp(-dc * dc * 6.0));
      // unlit surfaces: the black mask with a faint grain, the glossy package edge catching the light
      vec3 mask = vec3(0.005, 0.0055, 0.006) * (0.75 + 0.5 * hash(floor(f * 9.0 + 31.0)));
      float rim = smoothstep(2.0 * aa, 0.0, abs(sp)) * inPkg * (0.5 + 0.5 * dot(normalize(f + 1e-4), lightDir));
      vec3 surf = mask + vec3(0.02) * rim * pkg + vec3(0.006) * inPkg;
      // outdoor sun louvres above each row (10 mm): a dark ledge with a lit lip
      float ledge = smoothstep(0.30, 0.34, f.y) * louver;
      float lip = exp(-pow((f.y - 0.335) / 0.018, 2.0)) * louver;
      e *= 1.0 - ledge * 0.55;
      surf = surf * (1.0 - ledge * 0.5) + vec3(0.018) * lip;
      return surf + e * lit;
    }

    void main(){
      vec2 p = gl_FragCoord.xy / cs;                 // css px, y up
      vec2 d = p - L; float r = length(d);
      float Rr = R * open;
      bool inside = r < Rr;
      float rn = r / max(Rr, 1e-3);
      // inside the loupe: a bubble lens. The centre is magnified M times (single chips), the rim much less, so the
      // diodes at the centre and the letter or picture they belong to are both in view.
      vec2 src = inside ? S + d / M * (1.0 + 0.12 * rn * rn) : p;
      vec2 w = src / cell;
      vec2 fw = fwidth(w);
      float cellPx = inside ? 1.0 / max(1e-5, max(fw.x, fw.y)) : cell * cs;   // render pixels per diode
      vec2 uv = src / view;
      vec3 sm = textureLod(comp, uv, 0.0).rgb;       // the smooth picture
      float onS = step(1.0 - (src.y / view.y), scan);
      vec3 col = sm * onS;
      float vis = smoothstep(1.35, 3.4, cellPx);       // diode structure becomes visible when a diode spans ~2+ pixels
      if (vis > 0.0) {
        vec2 id = floor(w); vec2 f = w - id - 0.5;
        vec2 cuv = (id + 0.5) * cell / view;
        float lc = log2(cell * cs);
        vec3 cc = textureLod(comp, cuv, max(0.0, lc - 0.3)).rgb;      // what the processor sends this diode (area average)
        vec3 gl = textureLod(comp, uv, max(0.0, lc + 1.2)).rgb;      // the blurred neighbourhood, for bloom
        // power on: rows light from the top, one row at a time
        float row = 1.0 - (id.y + 0.5) * cell / view.y;
        float on = step(row, scan);
        vec3 led = diode(f, toLin(cc), toLin(gl) * on, 1.0 / cellPx, normalize(light), on, cellPx, inside ? norm * mix(1.0, 0.75, smoothstep(6.0, 24.0, cellPx)) : norm);
        // hot cores: far away they bloom to white like a camera sees them; in the loupe they keep their colour
        float m = max(led.r, max(led.g, led.b));
        vec3 hue = m > 1.0 ? led / m * (1.0 + 0.35 * log(m)) : led;
        vec3 hot = led + max(m - 1.0, 0.0) * 0.5;
        led = mix(hot, hue, inside ? 0.92 : 0.75);
        col = mix(col, toGam(led), vis);
      }
      // the power-on scan line: a thin bright row where the wall is switching on
      float sl = 1.0 - (src.y / view.y);
      col += vec3(0.75, 1.0, 0.85) * exp(-abs(sl - scan) * view.y / 2.5) * step(scan, 1.0) * 0.8;
      // the callout: a hairline from the magnified spot to the loupe, and a small ring on the spot
      if (lead > 0.01) {
        vec2 dir = normalize(L - S + 1e-4);
        vec2 a = S + dir * 7.0, bb = L - dir * Rr;
        vec2 pa = p - a, ba = bb - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
        float dl = length(pa - ba * h);
        float lineA = smoothstep(0.55 + 0.9 / cs, 0.0, dl);
        float ringA = smoothstep(0.55 + 0.9 / cs, 0.0, abs(length(p - S) - 6.0));
        col = mix(col, vec3(1.0), max(lineA * 0.7, ringA * 0.9) * lead * (inside ? 0.0 : 1.0));
      }
      // the loupe's glass: a thin rim, a highlight arc, a faint sheen that follows the pointer
      if (Rr > 1.0) {
        float aa = 1.2 / cs;
        float ring = smoothstep(aa, 0.0, abs(r - Rr) - 0.7);
        float ang = dot(normalize(d + 1e-4), normalize(vec2(-0.6, 0.8)));
        col = mix(col, vec3(1.0), ring * (0.42 + 0.4 * smoothstep(0.2, 1.0, ang)));
        float inner = smoothstep(aa, 0.0, abs(r - (Rr - 2.2)) - 0.5) * (inside ? 1.0 : 0.0);
        col *= 1.0 - inner * 0.35;
        if (inside) {
          float sheen = exp(-pow(length(d / Rr - light * 0.55) / 0.5, 2.0)) * 0.04;
          col += sheen;
        }
      }
      o = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
});
const wallScene = new THREE.Scene(); wallScene.add(new THREE.Mesh(quad, wallMat));

/* the diode shape's average light, so the wall is as bright as the smooth picture when it turns to dots (mirrors the shader) */
function diodeMean(pkg) {
  const N = 96; let sum = 0;
  const sdBox = (x, y, bx, by) => { const qx = Math.abs(x) - bx, qy = Math.abs(y) - by; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0); };
  const hp = 0.3 * pkg, dhx = 0.05 + (0.036 - 0.05) * pkg, dhy = 0.07 + (0.052 - 0.07) * pkg, gap = 0.16 + (0.12 - 0.16) * pkg;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N - 0.5, y = (j + 0.5) / N - 0.5;
    let e = 0;
    for (let k = 0; k < 3; k++) { const sd = sdBox(x - (k - 1) * gap, y - (k === 0 ? -0.012 : 0), dhx, dhy); e += (sd < 0 ? 4 : 0) + Math.exp(-Math.max(sd, 0) * 22) * 1.1; }
    e /= 3; // each die carries one channel; on white the three add to one unit per channel
    if (pkg > 0.01 && sdBox(x, y, hp, hp) - 0.06 * pkg < 0) { const dc = Math.hypot(x, y); e += 0.12 + 1.1 * Math.exp(-dc * dc * 26); }
    sum += e;
  }
  return sum / (N * N);
}
const DOTN = (() => { const N = 96; let m = 0; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = (i + 0.5) / N - 0.5, y = (j + 0.5) / N - 0.5; m += Math.exp(-(x * x + y * y) * 11); } return 1.0 / (m / (N * N)); })();
const normCache = new Map();
const normFor = (pkg) => { const k = Math.round(pkg * 20) / 20; if (!normCache.has(k)) normCache.set(k, 0.92 / diodeMean(k)); return normCache.get(k); };

/* ---------- type: the page's words, drawn into the picture the wall shows ---------- */
function drawType() {
  const W = Math.round(VW * CS), H = Math.round(VH * CS);
  const pad = Math.max(18, Math.min(36, VW * 0.044));
  const short = VH < 720 && phone;
  const fit = (ctx, text, font, maxW, size) => { ctx.font = `${size}px ${font}`; const w = ctx.measureText(text).width; return w > maxW ? size * maxW / w : size; };
  tcan.forEach((c, i) => {
    c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.setTransform(CS, 0, 0, CS, 0, 0); ctx.clearRect(0, 0, VW, VH);
    ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    const pitchPx = STOPS[i].pitch * MM;
    // a keyline of unlit diodes around every letter keeps it readable on any footage, as broadcast graphics do
    const key = pitchPx > 1.5 ? Math.max(1.4, pitchPx * 1.25) : 0.7;
    const lines = [];
    let sub = null;
    if (i === 0) {
      const size = phone ? fit(ctx, 'PIXEL PEOPLE', 'Michroma', VW - pad * 2, 40) : fit(ctx, 'PIXEL PEOPLE', 'Michroma', Math.min(VW * 0.52, 760), 74);
      const top = phone ? VH * (short ? 0.30 : 0.33) : VH * 0.36;
      lines.push({ t: 'THE PERFECT', f: 'Michroma', s: size, x: pad, y: top });
      lines.push({ t: 'PIXEL PEOPLE', f: 'Michroma', s: size, x: pad, y: top + size * 1.18 });
      const ss = phone ? 15.5 : 19;
      sub = { t: phone ? ['LED screens, designed, built and', 'installed by Bendac.'] : ['LED screens, designed, built and installed by Bendac.'], f: '500 ' + ss + 'px Inter', s: ss, x: pad + 2, y: top + size * 1.18 + size * 0.95 + ss * 0.6 };
    } else if (i === 1) {
      const size = phone ? fit(ctx, '2.5 MM', 'Michroma', VW - pad * 2, 64) : 110;
      const top = phone ? VH * 0.36 : VH * 0.42;
      lines.push({ t: '2.5 MM', f: 'Michroma', s: size, x: pad, y: top });
      const s2 = phone ? 21 : 34;
      lines.push({ t: 'SHOPS AND', f: 'Michroma', s: s2, x: pad + 2, y: top + s2 * 2.0 });
      lines.push({ t: 'VISITOR CENTRES', f: 'Michroma', s: s2, x: pad + 2, y: top + s2 * 3.35 });
    } else if (i === 2) {
      const size = phone ? fit(ctx, '10 MM', 'Michroma', VW - pad * 2, 96) : 200;
      const top = phone ? VH * 0.47 : VH * 0.56;
      lines.push({ t: '10 MM', f: 'Michroma', s: size, x: pad - size * 0.04, y: top });
    } else {
      const size = phone ? fit(ctx, 'PROJECT', 'Michroma', VW - pad * 2, 54) : 96;
      const top = phone ? VH * (short ? 0.27 : 0.30) : VH * 0.36;
      lines.push({ t: 'START A', f: 'Michroma', s: size, x: pad, y: top });
      lines.push({ t: 'PROJECT', f: 'Michroma', s: size, x: pad, y: top + size * 1.22 });
    }
    // keyline first (black, premultiplied alpha 1), then the white fill over it
    const paint = (fn) => { lines.forEach(fn); if (sub) sub.t.forEach((t, k) => fn({ t, f: null, font: sub.f, s: sub.s, x: sub.x, y: sub.y + k * sub.s * 1.32 })); };
    ctx.strokeStyle = 'rgba(0,0,0,0.92)'; ctx.fillStyle = '#ffffff';
    paint((l) => { ctx.font = l.font || `${l.s}px ${l.f}`; ctx.lineWidth = key * 2 * (l.f ? 1 : 0.75); ctx.strokeText(l.t, l.x, l.y); });
    // at coarse pitch, fatten the strokes so every stroke covers at least one whole diode (stadium screens do the same)
    const fat = pitchPx > 2 ? pitchPx * 0.6 : 0;
    ctx.strokeStyle = '#ffffff';
    paint((l) => { ctx.font = l.font || `${l.s}px ${l.f}`; ctx.fillText(l.t, l.x, l.y); if (fat && l.f) { ctx.lineWidth = fat; ctx.strokeText(l.t, l.x, l.y); } });
    // headline box for the loupe's idle path
    ctx.font = `${lines[0].s}px ${lines[0].f}`;
    const w0 = Math.max(...lines.slice(0, 2).map((l) => { ctx.font = `${l.s}px ${l.f}`; return ctx.measureText(l.t).width; }));
    ctx.font = `${lines[0].s}px ${lines[0].f}`; const cap = ctx.measureText('T').actualBoundingBoxAscent || lines[0].s * 0.7;
    const yTop = lines[0].y - cap, yBot = lines[Math.min(1, lines.length - 1)].y;
    const yb = sub ? sub.y + (sub.t.length - 1) * sub.s * 1.32 + sub.s * 0.3 : yBot + 6;
    boxes[i] = { x: lines[0].x, y: yTop, w: w0, h: yBot - yTop, cap, y2: lines[Math.min(1, lines.length - 1)].y - cap, yb };
    // the top edge of the first headline line, column by column: the loupe's idle path rides it, half on the letter,
    // half on the picture, so it always shows lit letter diodes next to picture diodes
    const bx = Math.max(0, Math.floor(boxes[i].x * CS)), by = Math.max(0, Math.floor((yTop - 6) * CS));
    const bw = Math.min(W - bx, Math.ceil(boxes[i].w * CS)), bh = Math.min(H - by, Math.ceil((cap + 10) * CS));
    const edge = new Float32Array(Math.ceil(boxes[i].w) + 1).fill(-1);
    if (bw > 0 && bh > 0) {
      const px = ctx.getImageData(bx, by, bw, bh).data;
      for (let x = 0; x < edge.length; x++) {
        const cx = Math.min(bw - 1, Math.round(x * CS));
        for (let y = 0; y < bh; y++) { const k = (y * bw + cx) * 4; if (px[k + 3] > 200 && px[k] > 200) { const ey = (by + y) / CS; if (ey < yTop + 2.5) edge[x] = ey; break; } }
      }
    }
    boxes[i].edge = edge;
    ttex[i].needsUpdate = true;
  });
}

/* ---------- size ---------- */
function fitFor(i) {
  const v = vids[i]; const va = (v.videoWidth || 16) / (v.videoHeight || 9); const a = VW / VH; const [fx, fy] = STOPS[i].focus;
  if (a < va) { const su = a / va; return new THREE.Vector4(su, 1, (1 - su) * fx, 0); }
  const sv = va / a; return new THREE.Vector4(1, sv, 0, (1 - sv) * (1 - fy));
}
function resize() {
  VW = innerWidth; VH = innerHeight; phone = VW < 900;
  CS = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(CS); renderer.setSize(VW, VH, false);
  const W = Math.round(VW * CS), H = Math.round(VH * CS);
  if (rt) rt.dispose();
  rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false });
  rt.texture.colorSpace = THREE.NoColorSpace;
  wallU.comp.value = rt.texture; wallU.view.value.set(VW, VH); wallU.cs.value = CS; compU.view.value.set(VW, VH);
  R_FULL = phone ? Math.round(Math.min(78, VW * 0.2)) : 116; if (Rsm < 0) Rsm = R_FULL;
  drawType();
}

/* ---------- pointer: the loupe ---------- */
const touchUI = matchMedia('(hover: none)').matches;
const P = { mode: 'idle', x: 0, y: 0, lastMove: -1e9, down: false };
canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { P.mode = 'mouse'; P.x = e.clientX; P.y = e.clientY; P.lastMove = performance.now(); } }, { passive: true });
document.addEventListener('mouseleave', () => { if (P.mode === 'mouse') P.mode = 'idle'; });
const onTouch = (e) => { const t = e.touches[0]; if (!t) return; P.mode = 'touch'; P.down = true; P.x = t.clientX; P.y = t.clientY; P.lastMove = performance.now(); };
addEventListener('touchstart', onTouch, { passive: true });
addEventListener('touchmove', onTouch, { passive: true });
addEventListener('touchend', () => { P.down = false; P.lastMove = performance.now(); }, { passive: true });
// pointer devices other than touch and mouse (pen) behave like the mouse
canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'pen') { P.mode = 'mouse'; P.x = e.clientX; P.y = e.clientY; } }, { passive: true });

/* ---------- scroll: pitch ---------- */
let sp = 0, sTarget = 0;
const readScroll = () => { sTarget = Math.max(0, Math.min(STOPS.length - 1, scrollY / Math.max(1, document.querySelector('section.stop').offsetHeight))); };
addEventListener('scroll', readScroll, { passive: true });
const goTo = (i) => { const el = document.getElementById('s' + i); el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); };
document.querySelectorAll('.stopbtn').forEach((b) => b.addEventListener('click', () => goTo(+b.dataset.go)));
$('#talkbtn').addEventListener('click', () => goTo(3));

/* ---------- HUD ---------- */
const pv = $('#pv'), mark = $('#mark'), cap = $('#caption'), lens = $('#lens'), cta = $('#cta');
const stopBtns = [...document.querySelectorAll('.stopbtn')];
const L0 = Math.log(0.4), L1 = Math.log(10);
let capKey = '';
function setCaption(i) {
  const c = STOPS[i].caption; const txt = typeof c === 'string' ? c : (touchUI ? c.touch : c.mouse);
  if (txt === capKey) return; capKey = txt;
  cap.style.opacity = '0';
  setTimeout(() => { cap.textContent = txt; cap.style.opacity = txt ? '1' : '0'; }, reduce ? 0 : 180);
}

/* ---------- start: fonts and the first frame of footage, then power on ---------- */
const playing = new Set();
// every clip keeps playing once started: pausing a blob video makes WebKit cancel its load (a failed request);
// they are small (one 1080p, two 960 px), and only the stops in view are uploaded to the GPU
function want(set) { set.forEach((i) => { const v = vids[i]; if (v.paused) v.play().catch(() => {}); }); }
const kick = () => vids[Math.round(sp)].play().catch(() => {});
addEventListener('touchstart', kick, { once: true, passive: true }); addEventListener('pointerdown', kick, { once: true });

let t0 = -1, ready = false;
const frames = []; const probe = { frames, videoTimes: [], ready: false, state: null };
window.__probe = probe;
async function start() {
  try { await Promise.race([Promise.all([document.fonts.load('40px Michroma'), document.fonts.load('500 16px Inter'), document.fonts.load('11px "Space Mono"')]), new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}
  resize();
  await new Promise((r) => { const v = vids[0]; if (v.readyState >= 2) r(); else { v.addEventListener('loadeddata', r, { once: true }); setTimeout(r, 4000); } v.play().catch(() => {}); });
  compU.fitA.value.copy(fitFor(0)); compU.fitB.value.copy(fitFor(0));
  ready = true; probe.ready = true;
}
addEventListener('resize', () => { if (ready) { resize(); } });
start();

/* ---------- frame loop ---------- */
let last = performance.now();
const L = new THREE.Vector2(), S = new THREE.Vector2(), Ls = new THREE.Vector2(-1, -1), Ss = new THREE.Vector2(-1, -1);
let R_FULL = 78, Rsm = -1, Rwant = 78;
let open = 0, Msm = 60, lensShown = false, curIdx = 0, lead = 0, edgeY = -1;
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000); frames.push(now - last); last = now;
  if (!ready) { renderer.setRenderTarget(null); renderer.clear(); return; }
  if (t0 < 0) t0 = now;
  const T = (now - t0) / 1000;

  // scroll, smoothed; the stop we are at and the one we are heading to
  sp += (sTarget - sp) * (reduce ? 1 : 1 - Math.pow(0.035, dt));
  if (Math.abs(sTarget - sp) < 1e-4) sp = sTarget;
  const i0 = Math.min(STOPS.length - 2, Math.floor(sp)), k = clamp01(sp - i0);
  const pitch = Math.exp(Math.log(STOPS[i0].pitch) + (Math.log(STOPS[i0 + 1].pitch) - Math.log(STOPS[i0].pitch)) * ease(k));
  const cell = pitch * MM;
  // content: A is this stop, B the next; B is fed in from the bottom across the middle of the move
  const wipe = smooth(0.18, 0.82, k);
  const near = k < 0.5 ? i0 : i0 + 1;
  compU.vA.value = vtex[i0]; compU.tA.value = ttex[i0]; compU.fitA.value.copy(fitFor(i0));
  compU.vB.value = vtex[i0 + 1]; compU.tB.value = ttex[i0 + 1]; compU.fitB.value.copy(fitFor(i0 + 1));
  compU.wipe.value = wipe; compU.band.value = Math.max(2, cell * 1.2);
  want(new Set(wipe > 0 && wipe < 1 ? [i0, i0 + 1] : [wipe >= 1 ? i0 + 1 : i0]));

  // the diode style follows the pitch: chip-on-board below ~1.5 mm, black-face SMD above, sun louvres outdoors
  const pkg = smooth(1.2, 3.0, pitch), louver = smooth(6.5, 9.5, pitch);
  wallU.cell.value = cell; wallU.pkg.value = pkg; wallU.louver.value = louver; wallU.norm.value = normFor(pkg); wallU.dotN.value = DOTN / wallU.norm.value;
  wallU.scan.value = reduce ? 2 : smooth(0.15, 1.05, T) * 1.06;
  wallU.time.value = T;

  // the loupe
  const R = R_FULL;
  const target = phone ? 12 : 15;
  const Mt = Math.min(70, Math.max(2.4, target / cell));
  Msm += (Mt - Msm) * (1 - Math.pow(0.002, dt));
  wallU.M.value = Msm; wallU.Me.value = Math.max(1.5, Msm / 6.5);
  const b = boxes[near];
  let sx, sy, lx, ly;
  const idleT = T * (reduce ? 0 : 1);
  // idle: the loupe glides along the top edge of the headline's letters, so it always shows lit diodes beside unlit ones
  const ph = (Math.max(0, idleT - 3.2) * 0.045) % 2, lane = ph < 1 ? 0 : 1, u = lane ? 2 - ph : ph;   // first it rests on the T's top bar
  // desktop: the loupe sits right of the headline, so its path keeps to the last word and the hairline stays short
  const span = phone ? [0.035, 0.965] : [0.56, 0.985];
  const ix = b.x + b.w * (span[0] + (span[1] - span[0]) * (0.5 - 0.5 * Math.cos(u * Math.PI)));
  let ey = -1; if (b.edge) { const c = Math.round(ix - b.x); for (let o = 0; o < 40 && ey < 0; o++) { ey = b.edge[Math.min(b.edge.length - 1, c + o)] ?? -1; if (ey < 0) ey = b.edge[Math.max(0, c - o)] ?? -1; } }
  if (ey < 0) ey = b.y;
  edgeY = edgeY < 0 ? ey : edgeY + (ey - edgeY) * (1 - Math.pow(0.02, dt));
  const iy = edgeY - 0.35;
  const sinceMove = now - P.lastMove;
  if (P.mode === 'mouse') { sx = lx = P.x; sy = ly = P.y; }   // the mouse loupe stays until the pointer leaves the window
  else if (P.mode === 'touch' && (P.down || sinceMove < 2600)) {
    sx = P.x; sy = P.y; lx = P.x;
    // like the iOS text loupe: show what is under the finger just above it, so the finger never hides it
    const lift = P.down ? R + 30 : 0; ly = P.y - lift; if (ly < R + 8) ly = P.y + R + 30;
  } else {
    if (P.mode !== 'mouse') P.mode = 'idle'; sx = ix; sy = iy;
    // idle, the loupe is a callout: it floats in clear space and a hairline points at the letters it magnifies,
    // so the headline stays readable while the diodes are shown
    if (!phone) { lx = b.x + b.w + R + Math.min(70, VW * 0.04); ly = b.y - R * 0.45; }
    else {
      lx = Math.min(VW - R - 14, Math.max(R + 14, sx + (VW * 0.5 - sx) * 0.35));
      // short phones: a smaller loupe still fits in the sky above the headline, so its hairline never crosses words
      Rwant = Math.max(44, Math.min(R, (b.y - 54 - 20) / 2));
      ly = b.y - Rwant - 20;
      if (ly - Rwant < 52) { Rwant = R; ly = b.yb + R + 26; }
    }
  }
  const idleNow = P.mode === 'idle';
  if (!idleNow || !phone) Rwant = R;
  Rsm += (Rwant - Rsm) * (1 - Math.pow(0.01, dt)); wallU.R.value = Rsm;
  const follow = idleNow ? 1 - Math.pow(0.05, dt) : 1 - Math.pow(0.0000005, dt);
  if (Ls.x < 0) { Ls.set(lx, ly); Ss.set(sx, sy); }
  Ls.x += (lx - Ls.x) * follow; Ls.y += (ly - Ls.y) * follow; Ss.x += (sx - Ss.x) * follow; Ss.y += (sy - Ss.y) * follow;
  wallU.L.value.set(Ls.x, VH - Ls.y); wallU.S.value.set(Ss.x, VH - Ss.y);
  // idle, the loupe only shows on the first stop; further on the diodes are already visible, it comes back on touch
  const wantOpen = T > 1.0 && (!idleNow || sp < 0.5) ? 1 : 0;
  open += (wantOpen - open) * (reduce ? 1 : 1 - Math.pow(wantOpen ? 0.004 : 0.0005, dt));
  wallU.open.value = open;
  const leadT = Math.hypot(Ls.x - Ss.x, Ls.y - Ss.y) > Rsm * open + 8 ? 1 : 0;
  lead += (leadT - lead) * (1 - Math.pow(0.001, dt)); wallU.lead.value = lead * open;
  const lx2 = (Ls.x / VW - 0.5), ly2 = (Ls.y / VH - 0.5);
  wallU.light.value.set(-0.45 - lx2 * 0.8, 0.65 + ly2 * 0.8);

  // HUD
  const ptxt = pitch < 1 ? pitch.toFixed(1) : pitch < 9.95 ? pitch.toFixed(1) : Math.round(pitch).toString();
  const html = `${ptxt}<small>MM</small>`; if (pv.innerHTML !== html) pv.innerHTML = html;
  const gp = clamp01((Math.log(Math.min(10, pitch)) - L0) / (L1 - L0)); mark.style.left = (gp * 100).toFixed(2) + '%';
  const at = Math.round(sp);
  if (at !== curIdx || !capKey) { curIdx = at; stopBtns.forEach((bt, j) => bt.setAttribute('aria-current', String(j === Math.min(2, at)))); setCaption(at); }
  cta.classList.toggle('on', sp > 2.6);
  const show = open > 0.6;
  if (show !== lensShown) { lensShown = show; lens.style.opacity = show ? '1' : '0'; }
  if (show) {
    const ox = Ls.x + Rsm * 0.74 + 6, oy = Ls.y + Rsm * 0.74 + 2;
    const flip = ox + 60 > VW;
    lens.style.transform = `translate(${(flip ? Ls.x - Rsm * 0.74 - 52 : ox).toFixed(1)}px, ${oy.toFixed(1)}px)`;
    const t = `×${Math.round(Msm)}`; if (lens.textContent !== t) lens.textContent = t;
  }

  renderer.setRenderTarget(rt); renderer.render(compScene, camera);
  renderer.setRenderTarget(null); renderer.render(wallScene, camera);
  probe.state = { sp: +sp.toFixed(3), pitch: +pitch.toFixed(2), M: +Msm.toFixed(1), L: [Math.round(Ls.x), Math.round(Ls.y)], S: [Math.round(Ss.x), Math.round(Ss.y)] };
  if (frames.length % 30 === 0) probe.videoTimes.push(vids[near].currentTime);
}
requestAnimationFrame(tick);
