// D3 main: render pipeline, materials, the story clock and the camera.
// Passes per frame: probe (screen content colours) -> light maps (stands, pitch) -> mirror (lit LED only, for the wet pitch)
// -> scene into an HDR target (alpha = distance) -> bloom chain -> composite (haze from every lit screen, depth of field,
// tone map). Nothing in the venue is lit by anything but the Bendac screens and the green switch-on light.
import * as THREE from 'three';
const D3 = window.D3, B = D3.BOWL, S = D3.SEC, SCR = D3.SCR, PER = D3.PER, RIB = D3.RIB;
const qs = new URLSearchParams(location.search);
const SHOT = qs.has('shot');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches && !SHOT;

// ---------------------------------------------------------------- renderer and sizes
const canvas = document.getElementById('gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: SHOT }); }
catch (e) { document.getElementById('nogl').style.display = 'flex'; throw e; }
renderer.setClearColor(0x000000, 1);
renderer.autoClear = true;
const isPhoneish = () => innerWidth / innerHeight < 0.9;
const size = { w: 1, h: 1, dpr: 1, scale: 1 };
const desk = () => innerWidth >= 900;
function baseDpr() { const d = devicePixelRatio || 1; return desk() ? Math.min(d, 1.5) : Math.min(d, 2); }

// ---------------------------------------------------------------- textures: video, logo, panels
const video = document.getElementById('vid');
const vtex = new THREE.VideoTexture(video);
vtex.colorSpace = THREE.NoColorSpace; vtex.generateMipmaps = true; vtex.minFilter = THREE.LinearMipmapLinearFilter; vtex.magFilter = THREE.LinearFilter;
const SEGT = [0, 2.2, 6.2, 7.45], VDUR = 9.4;
const logoImg = document.getElementById('logo-src');
const logoTex = new THREE.Texture(logoImg); logoTex.colorSpace = THREE.NoColorSpace; logoTex.generateMipmaps = true; logoTex.minFilter = THREE.LinearMipmapLinearFilter;
const panelCv = document.createElement('canvas'); panelCv.width = 2048; panelCv.height = 512;
const panelTex = new THREE.CanvasTexture(panelCv); panelTex.colorSpace = THREE.NoColorSpace; panelTex.generateMipmaps = true; panelTex.minFilter = THREE.LinearMipmapLinearFilter; panelTex.anisotropy = 8;
function drawPanels() {
  const g = panelCv.getContext('2d'); g.clearRect(0, 0, 2048, 512);
  const row = (i) => i * 170 + 8, H = 154;
  // 0: Bendac logo on black, three times along the board so any 3 m stretch carries the mark
  g.fillStyle = '#000'; g.fillRect(0, row(0), 2048, H);
  const lh = H * 0.5, lw = lh * logoImg.naturalWidth / logoImg.naturalHeight;
  g.globalAlpha = 0.6; for (const cx of [341, 1024, 1707]) g.drawImage(logoImg, cx - lw / 2, row(0) + (H - lh) / 2, lw, lh); g.globalAlpha = 1;
  // 1: the tagline, white on black with a green rule
  g.fillStyle = '#000'; g.fillRect(0, row(1), 2048, H);
  g.fillStyle = '#fff'; g.font = '400 64px Michroma, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('THE PERFECT PIXEL PEOPLE', 1024, row(1) + H / 2 - 4);
  g.fillStyle = '#029046'; g.fillRect(1024 - 560, row(1) + H - 24, 1120, 8);
  // 2 (canvas row 2): premium LED screens on Bendac green
  g.fillStyle = '#029046'; g.fillRect(0, row(2), 2048, H);
  g.fillStyle = '#fff'; g.font = '400 64px Michroma, sans-serif';
  g.fillText('PREMIUM LED SCREENS', 1024, row(2) + H / 2 + 2);
  panelTex.needsUpdate = true;
}

// ---------------------------------------------------------------- shared uniforms
const LMB = D3.LMB, LMP = D3.LMP;
const rtLMB = new THREE.WebGLRenderTarget(LMB.W, LMB.BAND * 3, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
const rtLMP = new THREE.WebGLRenderTarget(LMP.W, LMP.H, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const rtProbe = new THREE.WebGLRenderTarget(64, 4, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
const U = {
  uVid: { value: vtex }, uLogo: { value: logoTex }, uPanels: { value: panelTex },
  uLogoOn: { value: 1 }, uPage: { value: 0 }, uPage2: { value: 1 }, uWipe: { value: 0 }, uTime: { value: 0 },
  uProbe: { value: rtProbe.texture }, uSeg: { value: D3.segTex },
  uScrC: { value: SCR.map((s) => s.c) }, uScrR: { value: SCR.map((s) => s.r) }, uScrU: { value: SCR.map((s) => s.u) }, uScrN: { value: SCR.map((s) => s.n) },
  uScrWH: { value: SCR.map((s) => new THREE.Vector2(s.w, s.h)) }, uScrOn: { value: [0, 0] },
  uFrontP: { value: 0 }, uFrontR: { value: 0 },
  uHLPos: { value: D3.hlPos }, uHLN: { value: D3.hlN }, uHLOn: { value: D3.hlOn }, uHLPow: { value: D3.hlPow },
  uLScr: { value: 40.0 }, uLPer: { value: 30.0 }, uLRib: { value: 22.0 }, uLPt: { value: 9.0 },
  uLMB: { value: rtLMB.texture }, uLMP: { value: rtLMP.texture },
  uCam: { value: new THREE.Vector3() }, uGain: { value: 2.4 }, uWave: { value: -100 },
};
const G = D3.GLSL_COMMON + D3.GLSL_CONTENT + D3.GLSL_LIGHT;

// ---------------------------------------------------------------- full-screen pass helper
const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsGeo = new THREE.PlaneGeometry(2, 2);
function pass(fs, extra = {}) {
  const m = new THREE.ShaderMaterial({ uniforms: { ...U, ...extra }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: fs, depthTest: false, depthWrite: false });
  const sc = new THREE.Scene(); sc.add(new THREE.Mesh(fsGeo, m)); return { sc, m, u: m.uniforms };
}
function run(p, rt) { renderer.setRenderTarget(rt); renderer.render(p.sc, fsCam); }

// probe: average content colour for each light region
const probePass = pass(D3.GLSL_COMMON + D3.GLSL_CONTENT + /* glsl */`
  uniform sampler2D uSeg; uniform float uPerL, uRibL;
  varying vec2 vUv;
  vec4 segS(int j){ return texelFetch(uSeg, ivec2(j, 4), 0); }
  void main(){
    gLodV = 4.0; gLodL = 3.0; gLodP = 4.0;
    ivec2 c = ivec2(gl_FragCoord.xy);
    vec3 s = vec3(0.0);
    if (c.y == 0) {
      if (c.x >= 8) { gl_FragColor = vec4(0.0); return; }
      int k = c.x / 4, cell = c.x - k * 4; vec2 o = vec2(float(cell - (cell / 2) * 2), float(cell / 2)) * 0.5;
      for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) s += contentBig(o + (vec2(i, j) + 0.5) / 8.0);
      s /= 16.0;
    } else if (c.y == 1 || c.y == 2) {
      int j = c.y == 1 ? c.x : ${D3.NPER} + c.x;
      if ((c.y == 1 && c.x >= ${D3.NPER}) || (c.y == 2 && c.x >= ${D3.NRIB})) { gl_FragColor = vec4(0.0); return; }
      vec4 r = segS(j);
      for (int i = 0; i < 8; i++) for (int v = 0; v < 2; v++) {
        float ss = mix(r.x, r.y, (float(i) + 0.5) / 8.0), vv = 0.3 + 0.4 * float(v);
        s += c.y == 1 ? contentPer(ss, vv) : contentRib(ss, vv);
      }
      s /= 16.0;
    } else {
      if (c.x < 2) { for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) s += contentBig((vec2(i, j) + 0.5) / 4.0); s /= 16.0; }
      else if (c.x < 18) {
        bool per = c.x < 10; float L = per ? uPerL : uRibL; float k = float(per ? c.x - 2 : c.x - 10);
        for (int i = 0; i < 16; i++) { float ss = (k + (float(i) + 0.5) / 16.0) * L / 8.0; s += per ? contentPer(ss, 0.5) : contentRib(ss, 0.5); }
        s /= 16.0;
      }
    }
    gl_FragColor = vec4(s, 1.0);
  }`, { uPerL: { value: PER.L }, uRibL: { value: RIB.L } });

// add the absolute loop range of each segment as a fifth row of the segment table
{
  const t = D3.segTex, N = t.userData.N, old = t.image.data, data = new Float32Array(N * 5 * 4); data.set(old);
  [...PER.segs, ...RIB.segs].forEach((g, j) => { const o = (4 * N + j) * 4; data[o] = g.s0; data[o + 1] = g.s1; });
  t.image = { data, width: N, height: 5 }; t.needsUpdate = true;
}

// light maps: each texel is a point of the stands (or pitch) with a basis normal; sum every lit LED source
const lmbPass = pass(G + D3.GLSL_BOWL + /* glsl */`
  void main(){
    ivec2 c = ivec2(gl_FragCoord.xy);
    float p = (float(c.x) + 0.5) / ${LMB.W}.0 * ${B.P.toFixed(4)};
    int band = c.y / ${LMB.BAND}; int si = c.y - band * ${LMB.BAND};
    float s = float(si) / ${LMB.BAND - 1}.0 * ${S.profL.toFixed(4)};
    vec2 dy = profAt(s);
    vec4 b = bowlAt(p, dy.x);
    vec3 P = vec3(b.x, dy.y + 0.3, b.y);
    vec3 N = band == 0 ? vec3(0, 1, 0) : (band == 1 ? vec3(-b.z, 0.0, -b.w) : vec3(0, -1, 0));
    if (band == 2) P.y -= 0.6;
    gl_FragColor = vec4(lightAt(P, N), 1.0);
  }`);
const lmpPass = pass(G + /* glsl */`
  void main(){
    vec2 c = gl_FragCoord.xy;
    vec3 P = vec3((c.x / ${LMP.W}.0 * 2.0 - 1.0) * ${LMP.X}.0, 0.02, (c.y / ${LMP.H}.0 * 2.0 - 1.0) * ${LMP.Z}.0);
    gl_FragColor = vec4(lightAt(P, vec3(0.0, 1.0, 0.0)), 1.0);
  }`);

// ---------------------------------------------------------------- materials
const DIST = 'gl_FragColor = vec4(col, length(vW - cameraPosition));';
const LMSAMPLE = /* glsl */`
  uniform sampler2D uLMB;
  vec3 lmBowl(vec2 lmc, vec3 N, vec3 inw){
    float sv = clamp(lmc.y, 0.0, 1.0) * ${LMB.BAND - 1}.0 + 0.5;
    vec3 eU = texture2D(uLMB, vec2(lmc.x, sv / ${LMB.BAND * 3}.0)).rgb;
    vec3 eI = texture2D(uLMB, vec2(lmc.x, (sv + ${LMB.BAND}.0) / ${LMB.BAND * 3}.0)).rgb;
    vec3 eD = texture2D(uLMB, vec2(lmc.x, (sv + ${2 * LMB.BAND}.0) / ${LMB.BAND * 3}.0)).rgb;
    float wu = max(N.y, 0.0), wd = max(-N.y, 0.0), wi = max(dot(N, inw), 0.0);
    float wo = max(-dot(N, inw), 0.0);
    return eU * wu + eD * wd + eI * wi + (eU + eI + eD) * (0.035 + 0.05 * wo);
  }
  vec3 skyAmb(vec3 N){ return vec3(0.0006, 0.0008, 0.0014) * (0.6 + 0.4 * N.y); }
  // light bounced off the lit grass onto the lower stands and the wall behind the boards
  uniform sampler2D uLMP;
  vec3 bounce(vec3 W, vec3 N, vec3 inw){
    vec2 q = clamp(W.xz + inw.xz * 6.0, vec2(-55.0, -36.5), vec2(55.0, 36.5));
    vec3 e = texture2D(uLMP, vec2(q.x / ${LMP.X}.0 * 0.5 + 0.5, q.y / ${LMP.Z}.0 * 0.5 + 0.5)).rgb;
    return e * vec3(0.05, 0.11, 0.045) * (0.35 + 0.65 * max(dot(N, inw), 0.0) + 0.3 * max(-N.y, 0.0)) * exp(-max(W.y, 0.0) / 7.0);
  }`;

// the stands: concrete, glass, roof steel, all lit from the light map
const standsMat = new THREE.ShaderMaterial({
  uniforms: U, side: THREE.DoubleSide,
  vertexShader: /* glsl */`
    attribute vec3 alb; attribute vec2 lmc; attribute vec2 inw; attribute float kind;
    varying vec3 vW, vN, vAlb, vIn; varying vec2 vLM; varying float vK;
    void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; vAlb = alb; vIn = vec3(inw.x, 0.0, inw.y); vLM = lmc; vK = kind;
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: G + LMSAMPLE + /* glsl */`
    varying vec3 vW, vN, vAlb, vIn; varying vec2 vLM; varying float vK;
    void main(){
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      if (dot(N, V) < 0.0 && vK < 0.5) N = -N;
      vec3 E = lmBowl(vLM, N, vIn) + bounce(vW, N, vIn);
      vec3 alb = vAlb;
      float k = vK;
      float pm = vLM.x * ${B.P.toFixed(3)};
      // weathered concrete
      float n = fbm(vW.xz * 0.35 + vW.y * 0.2);
      alb *= 0.82 + 0.36 * n;
      vec3 col;
      if (k > 0.5 && k < 1.5) { // glass: dark, with mullions and the bowl's light mirrored in it
        float ml = smoothstep(0.06, 0.0, abs(fract(pm / 1.8) - 0.5) * 1.8 - 0.84);
        float tr = smoothstep(0.04, 0.0, abs(vW.y - 10.25));
        float fr = 0.04 + 0.96 * pow(1.0 - abs(dot(N, V)), 5.0);
        col = alb * E + (E * 0.9 + vec3(0.002)) * fr * 0.6 + vec3(0.16) * E * max(ml, tr);
      } else if (k > 1.5 && k < 2.5) { // roof underside: corrugated sheet and panel joints
        float rib = 0.75 + 0.25 * smoothstep(0.2, 0.8, abs(fract(pm / 0.25) - 0.5) * 2.0);
        float jn = 1.0 - 0.5 * smoothstep(0.03, 0.0, abs(fract(length(vW.xz) / 6.0) - 0.5) - 0.47);
        col = alb * rib * jn * E;
      } else if (k > 2.5 && k < 3.5) { col = vec3(0.0); }
      else if (k > 3.5 && k < 4.5) { // outside cladding: vertical ribs, night sky only
        float rib = 0.8 + 0.2 * step(0.5, fract(pm / 0.6));
        col = alb * rib * (skyAmb(N) * 5.0 + lightCheap(vW, vec3(0.0, 1.0, 0.0)) * 0.025);
      } else if (k > 4.5) { // roof top seen from the drone: ribbed dark metal, the bowl's glow along its inner edge
        float rib = 0.7 + 0.3 * smoothstep(0.15, 0.5, abs(fract(pm / 0.9) - 0.5));
        float panel = 0.85 + 0.15 * step(0.04, fract(length(vW.xz) / 7.0));
        vec3 spill = lightCheap(vW, vec3(0.0, -1.0, 0.0));
        float dIn = length(vW.xz); // rough: the inner edge is brighter, the bowl's light rises past it
        vec3 base = vec3(0.0075, 0.008, 0.0095) * rib * panel;
        float fr = pow(1.0 - abs(dot(N, V)), 3.0);
        col = base + spill * (0.012 * rib + 0.03 * fr) + vec3(0.002, 0.0024, 0.0032) * fr;
      } else col = alb * E + alb * skyAmb(N);
      ${qs.has('dbgroof') ? 'col = k > 4.5 ? vec3(0.0, 0.0, 0.3) : (k > 1.5 && k < 2.5 ? vec3(0.3, 0.3, 0.0) : vec3(0.3, 0.0, 0.0));' : ''}
      ${DIST}
    }`,
});

// seats: plastic, folded up where empty
const seatMat = new THREE.ShaderMaterial({
  uniforms: U, side: THREE.DoubleSide,
  vertexShader: /* glsl */`
    attribute float part; attribute vec3 iPos, iCol; attribute vec2 iIn, iLM; attribute float iFold;
    varying vec3 vW, vN, vCol, vIn; varying vec2 vLM;
    void main(){
      vec3 p = position, n = normal;
      if (part < 0.5 && iFold > 0.5) { // fold the pan up about its back hinge
        vec2 yz = p.yz - vec2(0.43, 0.17); float a = 1.35; float c = cos(a), s = sin(a);
        p.yz = vec2(yz.x * c - yz.y * s, yz.x * s + yz.y * c) + vec2(0.43, 0.17);
        n.yz = vec2(n.y * c - n.z * s, n.y * s + n.z * c);
      }
      vec3 bk = vec3(-iIn.x, 0.0, -iIn.y), tg = vec3(bk.z, 0.0, -bk.x);
      vec3 w = iPos + tg * p.x + vec3(0.0, p.y, 0.0) + bk * p.z;
      vW = w; vN = tg * n.x + vec3(0.0, n.y, 0.0) + bk * n.z; vCol = iCol; vIn = vec3(iIn.x, 0.0, iIn.y); vLM = iLM;
      gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
    }`,
  fragmentShader: G + LMSAMPLE + /* glsl */`
    varying vec3 vW, vN, vCol, vIn; varying vec2 vLM;
    void main(){
      vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW); if (dot(N, V) < 0.0) N = -N;
      vec3 E = lmBowl(vLM, N, vIn);
      float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
      vec3 col = vCol * E + E * fr * 0.08;
      ${DIST}
    }`,
});

// the crowd: one card per person, a silhouette with head, shoulders and arms that go up in the wave
const crowdMat = new THREE.ShaderMaterial({
  uniforms: U, side: THREE.DoubleSide,
  vertexShader: /* glsl */`
    attribute vec3 iPos, iCloth, iSkin; attribute vec2 iIn, iLM; attribute vec4 iMisc; attribute float iWave;
    uniform float uWave, uTime;
    varying vec3 vW, vCloth, vSkin, vIn; varying vec2 vLM, vQ; varying float vH, vArm, vSeed;
    void main(){
      float h = iMisc.x;
      float wv = exp(-pow((uWave - iWave - 3.0) / 6.0, 2.0));
      float up = wv * (0.85 + 0.3 * iMisc.z);
      vec3 toC = cameraPosition - iPos; toC.y = 0.0; vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toC + vec3(1e-4))));
      float H = 0.86 * h + up * 0.5;
      vec3 c = iPos + vec3(0.0, up * 0.42 + sin(uTime * 1.3 + iMisc.y) * 0.012, 0.0);
      vec3 w = c + rt * position.x * 0.62 + vec3(0.0, position.y * H, 0.0);
      vW = w; vCloth = iCloth; vSkin = iSkin; vIn = vec3(iIn.x, 0.0, iIn.y); vLM = iLM; vQ = vec2(position.x * 0.62, position.y * H);
      vH = 0.86 * h; vArm = clamp(up, 0.0, 1.0); vSeed = iMisc.z;
      gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
    }`,
  fragmentShader: G + LMSAMPLE + /* glsl */`
    varying vec3 vW, vCloth, vSkin, vIn; varying vec2 vLM, vQ; varying float vH, vArm, vSeed;
    float sdBox(vec2 p, vec2 b, float r){ vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
    void main(){
      vec2 q = vQ;
      float s1 = vSeed, s2 = fract(s1 * 7.31 + 0.13), s3 = fract(s1 * 13.7 + 0.71), s4 = fract(s1 * 31.3 + 0.37);
      float build = 0.84 + 0.32 * s2;
      float headR = 0.083 + 0.02 * s3;
      float headY = vH - headR - 0.005;
      float shY = vH - 2.0 * headR - 0.075;
      float hw = mix(0.165, 0.2 - 0.02 * s4, clamp(q.y / shY, 0.0, 1.0)) * build;
      float dTorso = sdBox(q - vec2(0.0, (shY + 0.03) * 0.5), vec2(hw, (shY + 0.03) * 0.5), 0.075 * build);
      float dNeck = sdBox(q - vec2(0.0, shY + 0.05), vec2(0.04, 0.05), 0.015);
      float dHead = length((q - vec2(0.0, headY)) / vec2(headR * 0.9, headR * 1.12)) - 1.0;
      bool scarf = s4 < 0.05;
      float arm = max(vArm, scarf ? 0.75 : 0.0);
      float dArm = 1e3, dScarf = 1e3;
      if (arm > 0.02) {
        float ax = hw - 0.02; vec2 a0 = vec2(ax, shY - 0.03), a1 = vec2(ax + 0.05 - (scarf ? 0.06 : 0.0), shY + 0.5 * arm);
        for (int s = -1; s <= 1; s += 2) { vec2 A = a0 * vec2(float(s), 1.0), Bq = a1 * vec2(float(s), 1.0);
          vec2 pa = q - A, ba = Bq - A; float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); dArm = min(dArm, length(pa - ba * t) - 0.04); }
        if (scarf) dScarf = sdBox(q - vec2(0.0, shY + 0.5 * arm), vec2(a1.x + 0.03, 0.05), 0.01);
      }
      float inside = max(max(step(dHead, 0.0), step(min(dTorso, dNeck), 0.0)), max(step(dArm, 0.0), step(dScarf, 0.0)));
      if (inside < 0.5) discard;
      vec3 hair = mix(vec3(0.012, 0.009, 0.007), vec3(0.16, 0.10, 0.05), step(0.8, s3));
      vec3 alb = vCloth;
      if (dHead < 0.0) {
        float top = (q.y - headY) / headR;
        alb = top > 0.25 - 0.3 * s4 ? hair : vSkin;
        if (s3 < 0.16) alb = top > 0.15 ? vCloth * 0.7 : alb;           // beanie
        if (s2 > 0.88 && abs(q.x) > headR * 0.55) alb = vCloth;           // hood framing the face
      } else if (dNeck < 0.0 && dTorso > 0.0) alb = vSkin * 0.8;
      else if (dScarf < 0.0) alb = mix(vec3(0.5, 0.02, 0.03), vec3(0.9), step(0.5, fract(q.x * 9.0)));
      else if (dArm < 0.0 && dTorso > 0.0) alb = q.y > shY + 0.4 * arm ? vSkin : vCloth;
      alb *= 0.7 + 0.3 * smoothstep(0.0, vH * 0.6, q.y);
      vec3 N = normalize(vIn + vec3(0.0, 0.45, 0.0));
      vec3 E = lmBowl(vLM, N, vIn);
      vec3 col = alb * E * 1.15;
      ${DIST}
    }`,
});

// steel: trusses, purlins, masts, hangers (instanced boxes)
const steelMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: /* glsl */`
    attribute vec4 iM0, iM1, iM2, iM3; attribute vec3 iCol; attribute vec2 iLM;
    varying vec3 vW, vN, vCol, vIn; varying vec2 vLM;
    void main(){ mat4 M = mat4(iM0, iM1, iM2, iM3); vec4 w = M * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(M) * normal); vCol = iCol; vLM = iLM;
      vIn = normalize(vec3(-w.x, 0.0, -w.z)); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: G + LMSAMPLE + /* glsl */`
    varying vec3 vW, vN, vCol, vIn; varying vec2 vLM;
    void main(){
      vec3 N = normalize(vN);
      vec3 E = vLM.x >= 0.0 ? lmBowl(vLM, N, vIn) : lightCheap(vW, N) + skyAmb(N) * 2.0;
      vec3 col = vCol * E;
      ${DIST}
    }`,
});

// small objects lit per vertex by the point lights
const miscMat = new THREE.ShaderMaterial({
  uniforms: U, side: THREE.DoubleSide,
  vertexShader: G + /* glsl */`
    attribute vec3 alb; varying vec3 vW, vC;
    void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
      vC = alb * (lightCheap(w.xyz, normalize(normal)) + vec3(0.0006, 0.0008, 0.0014));
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`varying vec3 vW, vC; void main(){ vec3 col = vC; ${DIST} }`,
});
const lampMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: G + /* glsl */`varying vec3 vW, vC; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
      vec3 V = normalize(cameraPosition - w.xyz); float fr = pow(1.0 - max(dot(normal, V), 0.0), 3.0);
      vC = lightCheap(w.xyz, normal) * 0.06 + vec3(0.003, 0.0035, 0.004) * (0.3 + fr); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`varying vec3 vW, vC; void main(){ vec3 col = vC; ${DIST} }`,
});
const netMat = new THREE.ShaderMaterial({
  uniforms: U, side: THREE.DoubleSide,
  vertexShader: G + /* glsl */`varying vec3 vW, vC; varying vec2 vUv; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vUv = uv;
      vC = vec3(0.6) * (lightCheap(w.xyz, vec3(0.0, 0.7, 0.7)) + lightCheap(w.xyz, vec3(0.0, 0.7, -0.7)) + lightCheap(w.xyz, vec3(0.7, 0.7, 0.0)) * 0.5 + lightCheap(w.xyz, vec3(-0.7, 0.7, 0.0)) * 0.5);
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`varying vec3 vW, vC; varying vec2 vUv;
    void main(){ vec2 g = abs(fract(vUv / 0.12) - 0.5); float w = fwidth(vUv.x / 0.12) * 0.8 + 0.03; float m = max(step(0.5 - w, g.x), step(0.5 - w, g.y));
      if (m < 0.5) discard; vec3 col = vC; ${DIST} }`,
});

// LED faces: diodes on a black mask, switched on by the running edge, cabinet by cabinet
const LED = /* glsl */`
  vec3 ledFace(vec2 gm, float pitch, vec3 cNear, vec3 cFar){
    vec2 g = gm / pitch; vec2 f = fract(g) - 0.5;
    float px = max(length(fwidth(g)), 1e-4);
    float spot = smoothstep(0.31, 0.15, length(f));
    vec3 near = cNear * spot * 4.4;
    float vclose = 1.0 - smoothstep(0.035, 0.09, px);
    if (vclose > 0.0) {
      vec3 dies = vec3(smoothstep(0.085, 0.045, length(f - vec2(-0.085, -0.05))), smoothstep(0.085, 0.045, length(f - vec2(0.085, -0.05))), smoothstep(0.085, 0.045, length(f - vec2(0.0, 0.08))));
      near = mix(near, cNear * dies * 13.0 + cNear * spot * 0.9, vclose);
    }
    float w = 1.0 - smoothstep(0.16, 0.55, px);
    return mix(cFar, near, w);
  }
  vec3 maskLit(vec3 W, vec3 N, vec2 gm, float pitch){ // the dark face when off: louvres catch a little light
    float lv = 0.6 + 0.4 * smoothstep(0.2, 0.5, abs(fract(gm.y / pitch) - 0.5));
    return vec3(0.07) * lv * lightCheap(W, N);
  }`;
function loopFaceMat(L, kind) {
  const isPer = kind === 1;
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uLoopL: { value: L.L }, uHole: { value: 0 }, uHoleS: { value: new THREE.Vector2(-1, -1) }, uCabGlow: { value: new THREE.Vector3() } }, side: THREE.DoubleSide,
    vertexShader: 'attribute vec2 sv; varying vec2 vSV; varying vec3 vW, vN; void main(){ vSV = sv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: G + LED + /* glsl */`
      uniform float uLoopL, uGain, uHole; uniform vec2 uHoleS; uniform vec3 uCabGlow;
      varying vec2 vSV; varying vec3 vW, vN;
      void main(){
        float s = vSV.x, v = vSV.y;
        float H = ${L.H.toFixed(3)}, pitch = ${L.pitch.toFixed(4)};
        vec2 gm = vec2(s, v * H);
        vec2 cm = (floor(gm / pitch) + 0.5) * pitch;
        float fs = max(fwidth(s), 1e-5);
        gLodV = 0.0; gLodP = 0.45;
        vec3 cN = ${isPer ? 'contentPer(cm.x, cm.y / H)' : 'contentRib(cm.x, cm.y / H)'};
        gLodV = log2(max(fs * ${isPer ? '107.0' : '80.0'}, 1.0)); gLodP = log2(max(fs * ${isPer ? '170.0' : '140.0'}, 1.0));
        vec3 cF = ${isPer ? 'contentPer(s, v)' : 'contentRib(s, v)'};
        float front = ${isPer ? 'uFrontP' : 'uFrontR'};
        float D = min(s, uLoopL - s);
        float cab = floor(s / 0.96);
        float lag = hash11(cab * 1.37 + ${kind}.0) * 0.9;
        float since = front - D - lag;
        float on = step(0.0, since) * step(0.001, front);
        float flash = 1.0 + 1.6 * exp(-max(since, 0.0) / 1.1);
        vec3 col = ledFace(gm, pitch, cN, cF) * on * flash * uGain;
        float edge = exp(-pow((D - front) / 0.45, 2.0)) * step(0.001, front) * step(front, uLoopL * 0.5 + 0.2);
        col += vec3(0.05, 1.0, 0.32) * edge * 7.0;
        vec3 N = normalize(vN);
        col += maskLit(vW, N, gm, pitch) * (1.0 - on);
        ${isPer ? `// the empty bay left by the cabinet that was pulled out: deep black, two rails catching its glow
        if (uHole > 0.0 && s > uHoleS.x && s < uHoleS.y) {
          float rails = smoothstep(0.012, 0.0, abs(v - 0.12) - 0.01) + smoothstep(0.012, 0.0, abs(v - 0.88) - 0.01);
          col = mix(col, uCabGlow * (0.004 + 0.02 * rails) + vec3(0.0004), uHole);
        }` : ''}
        ${DIST}
      }`,
  });
}
const perMat = loopFaceMat(PER, 1), ribMat = loopFaceMat(RIB, 2);

// ---------------------------------------------------------------- one IMPAKT cabinet: pulled out of the board, shown off, then seen in macro
// The cabinet is a real square of the perimeter (0.96 m, 120 x 120 diodes at 8 mm). Its face is drawn in 3D inside the shader:
// horizontal louvres 4.5 mm deep over each row, black SMD packages, an epoxy window with red, green and blue dies under it.
// Far away it resolves to exactly the colour the board shows, so it leaves the board without a seam.
const CAB = (() => {
  const W = PER.cab, k = Math.floor(50.6 / W), s0 = k * W, s1 = s0 + W;
  const A = new THREE.Vector3(), Bv = new THREE.Vector3();
  const g = D3.loopPoint(PER, s0 + 1e-3, A); D3.loopPoint(PER, s1 - 1e-3, Bv);
  A.y = Bv.y = PER.y0;
  const n = g.n.clone().normalize();
  let X = Bv.clone().sub(A).normalize();
  const Y = new THREE.Vector3().crossVectors(n, X).normalize(); if (Y.y < 0) Y.negate();
  let Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  let sDir = 1, sStart = s0;
  if (Z.dot(n) < 0) { X.negate(); Z = new THREE.Vector3().crossVectors(X, Y).normalize(); sDir = -1; sStart = s1; }
  const qBase = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  const centre = A.clone().add(Bv).multiplyScalar(0.5).addScaledVector(Y, PER.H / 2);
  const nh = new THREE.Vector3(n.x, 0, n.z).normalize();
  const qUp = new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(0, 1, 0)); // stands it upright as it leaves
  return { W, k, s0, s1, sDir, sStart, X, Y, Z, n, nh, qBase, qUp, centre, region: Math.min(7, Math.floor((s0 + W / 2) / (PER.L / 8))), LZ: 0.0045, YAW: 0.42, OUT: 0.78, LIFT: 0.24, CAMYAW: -0.5, MX: 0.52, DOFM: 1.3, EXPM: 0.6, BLOOMM: 0.15, FILL: 0.009 };
})();
const cabU = {
  uInv: { value: new THREE.Matrix4() }, uRotW: { value: new THREE.Matrix3() }, uS0: { value: CAB.sStart }, uSDir: { value: CAB.sDir },
  uFull: { value: 0 }, uPullK: { value: 0 }, uFillI: { value: 0 }, uBoardN: { value: CAB.n.clone() }, uBoardP: { value: CAB.centre.clone() },
};
const CABGLSL = /* glsl */`
  #define PP 0.008
  #define LZ ${CAB.LZ.toFixed(4)}
  #define HW 0.48
  #define TH 0.0007
  uniform mat4 uInv; uniform mat3 uRotW; uniform float uS0, uSDir, uFull, uPullK, uGain, uFillI; uniform vec3 uBoardN, uBoardP;
  // a ring light on the camera, as a macro photographer would use: it only matters within a few centimetres
  vec3 fill(vec3 P, vec3 N){ vec3 L = cameraPosition - P; float d2 = dot(L, L); return vec3(0.9, 0.95, 1.0) * uFillI * max(dot(N, L * inversesqrt(d2)), 0.0) / d2; }
  vec3 boardC(){ return probe(${2 + CAB.region}, 3) * uGain; }
  // what glossy surfaces mirror: the night sky above, the lit boards along the horizon, the wet grass below
  vec3 envW(vec3 R){
    vec3 c = vec3(0.0016, 0.0019, 0.0026) * smoothstep(-0.1, 0.9, R.y);
    c += boardC() * exp(-pow((R.y + 0.03) / 0.09, 2.0)) * 0.55;
    c += vec3(0.0015, 0.004, 0.0015) * smoothstep(0.05, -0.6, R.y);
    return c;
  }
`;
const cabFaceMat = new THREE.ShaderMaterial({
  uniforms: { ...U, ...cabU },
  vertexShader: /* glsl */`
    uniform mat4 uInv; varying vec3 vW, vL, vCL;
    void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vCL = (uInv * vec4(cameraPosition, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: G + CABGLSL + /* glsl */`
    varying vec3 vW, vL, vCL;
    float gLodB = 0.0, gLodF = 0.0;
    // the face's own share of the stadium light: one probe read instead of every light (it is black plastic, 2 cm from bright LEDs)
    vec3 ambC(vec3 N){ return boardC() * 0.035 * (0.6 + 0.4 * max(dot(N, uBoardN), 0.0)) + vec3(0.0006, 0.0008, 0.0014); }
    vec3 cabContent(vec2 q){ // q: metres from the cabinet's bottom left, 0..0.96
      gLodV = gLodB; gLodP = 0.45 + gLodB;
      vec3 b = contentPer(uS0 + uSDir * q.x, q.y / 0.96);
      if (uFull < 0.001) return b;
      gLodV = gLodF;
      vec3 f = vidAt(vec2(0.21875 + 0.5625 * q.x / 0.96, q.y / 0.96)) * 1.1;
      return mix(b, f, uFull);
    }
    float sdRBox(vec2 p, float h, float r){ vec2 d = abs(p) - vec2(h - r); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
    vec3 die(vec2 f, vec2 c, float sg){ vec2 e = f - c; return vec3(exp(-dot(e, e) / (2.0 * sg * sg)) / (6.2832 * sg * sg)); }
    void main(){
      vec3 d = normalize(vL - vCL);
      d.z = min(d.z, -1e-3);
      vec3 Pm = vL + d * (LZ / -d.z);            // where the ray meets the mask, behind the louvre fronts
      vec2 q0 = vL.xy + HW, qm = clamp(Pm.xy + HW, 0.0, 0.96);
      float fs = max(length(fwidth(vL.xy)), 1e-7);
      float px = fs / PP;                         // cells per screen pixel
      gLodB = log2(max(fs * 107.0, 1.0)); gLodF = log2(max(fs * 750.0, 1.0));
      vec3 cF = cabContent(clamp(q0, 0.0, 0.96));
      float grazing = abs(d.y) / -d.z;
      vec3 far = cF * uGain * (1.0 - 0.8 * smoothstep(1.1, 2.6, grazing));
      vec3 col = far;
      float wN = 1.0 - smoothstep(0.09, 0.26, px);
      if (wN > 0.0) {
        vec3 near;
        float jF = floor(q0.y / PP), jM = floor((Pm.y + HW) / PP); // unclamped: a clamped hit point invents a crossing at the top edge
        if (jF != jM) {
          // the ray meets a louvre before the mask: its top seen from above, its underside from below,
          // lit by the LED of the row it shades (row jF in both cases)
          float b = (d.y < 0.0 ? jF : jF + 1.0) * PP;
          float t = (b - q0.y) / d.y;
          vec3 H = vec3(q0.x + d.x * t, b, clamp(LZ + d.z * t, 0.0, LZ));
          float iH = clamp(floor(H.x / PP), 0.0, 119.0); float jL = clamp(jF, 0.0, 119.0);
          gLodV = 0.0; gLodP = 0.45; gLodF = 2.5; gLodB = 0.0;
          vec3 cL = cabContent((vec2(iH, jL) + 0.5) * PP) * uGain;
          float dx = H.x - (iH + 0.5) * PP, dy = PP * 0.5, z = max(H.z, 0.0003);
          float r2 = dx * dx + dy * dy + z * z;
          vec3 E = cL * PP * PP / 3.1416 * z * dy / (r2 * r2);
          // the two neighbours along the row add a little
          float dxl = dx + PP, dxr = dx - PP;
          E += cL * PP * PP / 3.1416 * z * dy * (1.0 / pow(dxl * dxl + dy * dy + z * z, 2.0) + 1.0 / pow(dxr * dxr + dy * dy + z * z, 2.0)) * 0.9;
          vec3 Nl = vec3(0.0, d.y < 0.0 ? 1.0 : -1.0, 0.0);
          vec3 Nw = normalize(uRotW * Nl);
          float grain = 0.85 + 0.3 * vnoise(vec2(H.x * 2600.0, H.z * 900.0 + jF * 7.0));
          vec3 alb = vec3(0.03) * grain;
          vec3 Hw = vW + uRotW * (H - vL);
          near = alb * (E * 0.7 + ambC(Nw) + vec3(0.0006, 0.0008, 0.0014) + fill(Hw, Nw));
          vec3 R = reflect(d, Nl);
          near += envW(uRotW * R) * (0.04 + 0.5 * pow(1.0 - abs(d.y), 5.0)) * 0.7;
          // gloss: the LED it shades smears across the plastic, brightest at the root
          near += cL * (d.y < 0.0 ? 0.25 : 1.1) * exp(-H.z / LZ * 2.2) * exp(-dx * dx / (PP * PP * 0.12));
        } else {
          // the mask: matte black face, the SMD package, its epoxy window and the three dies
          vec2 cell = clamp(floor(qm / PP), 0.0, 119.0);
          vec2 f = qm / PP - cell - 0.5;
          gLodV = 0.0; gLodP = 0.45; gLodB = 0.0; gLodF = 2.5;
          vec3 cN = cabContent((cell + 0.5) * PP);
          float aa = max(px, 0.004) * 0.9;
          float pkg = 1.0 - smoothstep(-aa, aa, sdRBox(f, 0.215, 0.045));
          float r = length(f - vec2(0.0, -0.01));
          float win = 1.0 - smoothstep(0.155 - aa, 0.155 + aa, r);
          float sg = max(0.026, aa * 0.75);
          vec3 dies = vec3(die(f, vec2(-0.062, -0.04), sg).r, die(f, vec2(0.0, 0.05), sg).g, die(f, vec2(0.062, -0.04), sg).b);
          float r2d = dot(f - vec2(0.0, -0.01), f - vec2(0.0, -0.01));
          float prof = win * (0.3 + 0.7 * exp(-r2d / 0.0045));
          // integral of that profile over the window (0.0325): 0.3 * pi * 0.155^2 + 0.7 * pi * 0.0045 * (1 - exp(-0.155^2 / 0.0045))
          vec3 emit = cN * uGain * (0.35 * dies + 0.65 * prof / 0.03249);
          // the dies are brighter than anything near them: a whisper of white where all three overlap
          vec3 Nd = normalize(vec3(f * 1.6 * win, 1.0));
          vec3 Nl = normalize(mix(vec3(0.0, 0.0, 1.0), Nd, win));
          vec3 Nw = normalize(uRotW * Nl);
          float tex = 0.75 + 0.5 * vnoise(qm / 0.00018) * vnoise(qm / 0.0011 + 3.0);
          vec3 alb = mix(vec3(0.02) * tex, vec3(0.012), pkg);
          vec3 own = cN * uGain * 0.5 * exp(-max(r - 0.155, 0.0) * 9.0) * (1.0 - win) * (1.0 - 0.6 * pkg);
          // the louvre above each row shades the top of the cell
          float ao = mix(0.35, 1.0, smoothstep(0.5, 0.18, f.y));
          vec3 Pw = vW + uRotW * (Pm - vL);
          vec3 lit = (alb * (ambC(Nw) + vec3(0.0006, 0.0008, 0.0014) + fill(Pw, Nw)) + own) * ao;
          vec3 R = reflect(d, Nl);
          float F = 0.04 + 0.96 * pow(1.0 - max(dot(-d, Nl), 0.0), 5.0);
          vec3 spec = envW(uRotW * R) * F * mix(0.25, 1.4, max(pkg * 0.6, win)) * ao;
          // the ring light mirrored in each epoxy dome and package top
          vec3 Lc = normalize(cameraPosition - Pw);
          spec += vec3(0.9, 0.95, 1.0) * uFillI / dot(cameraPosition - Pw, cameraPosition - Pw) * pow(max(dot(uRotW * R, Lc), 0.0), 90.0) * 0.004 * max(win, pkg * 0.5) * ao;
          near = lit + spec + emit;
          // louvre front edges seen end on
        }
        float fe = abs(fract(q0.y / PP + 0.5) - 0.5) * PP;
        float ea = fwidth(q0.y) * 0.8;
        float edge = 1.0 - smoothstep(TH * 0.5 - ea, TH * 0.5 + ea, fe);
        vec3 Nfe = normalize(uRotW * vec3(0.0, 0.0, 1.0));
        vec3 edgeCol = vec3(0.025) * (ambC(Nfe) + vec3(0.0008) + fill(vW, Nfe)) + envW(uRotW * reflect(d, vec3(0.0, 0.0, 1.0))) * 0.05;
        near = mix(near, edgeCol, edge);
        col = mix(far, near, wN);
      }
      ${DIST}
    }`,
});
// the die-cast body: near-black powder coat with machined edges, a grab slot in each side
const cabBodyMat = new THREE.ShaderMaterial({
  uniforms: { ...U, ...cabU },
  vertexShader: /* glsl */`
    varying vec3 vW, vNw, vL, vNl;
    void main(){ vL = position; vNl = normal; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vNw = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: G + CABGLSL + /* glsl */`
    varying vec3 vW, vNw, vL, vNl;
    void main(){
      vec3 N = normalize(vNw), nl = normalize(vNl), V = normalize(cameraPosition - vW);
      vec3 hb = vec3(0.479, 0.479, 0.0575), c0 = vec3(0.0, 0.0, LZ - 0.0006 - 0.0575);
      vec3 p = vL - c0, e = hb - abs(p);
      // within 3 mm of two faces: the machined chamfer
      float ex = step(e.x, 0.003), ey = step(e.y, 0.003), ez = step(e.z, 0.003);
      float edge = clamp(ex * ey + ex * ez + ey * ez, 0.0, 1.0);
      vec3 alb = vec3(0.05, 0.052, 0.056) * (0.9 + 0.2 * vnoise(vL.xy * 900.0 + vL.z * 300.0));
      float slot = 0.0;
      if (abs(nl.x) > 0.5) slot = (1.0 - smoothstep(0.0, 0.003, sdRBoxC(vec2(p.y, p.z), vec2(0.08, 0.016), 0.012)));
      alb *= 1.0 - 0.75 * slot;
      float dB = max(dot(vW - uBoardP, uBoardN), 0.0);
      vec3 fillB = boardC() * 0.5 * (0.5 - 0.5 * dot(N, uBoardN)) / (1.0 + dB * dB * 1.4) * uPullK;
      vec3 E = lightCheap(vW, N) + fillB + vec3(0.0006, 0.0008, 0.0014) * (0.6 + 0.4 * N.y) + fill(vW, N);
      vec3 col = alb * E;
      // chamfer normal: lean towards each face the point is near (a safe sign: sign(0) would make a NaN line across the face)
      vec3 sp = vec3(p.x >= 0.0 ? 1.0 : -1.0, p.y >= 0.0 ? 1.0 : -1.0, p.z >= 0.0 ? 1.0 : -1.0);
      vec3 Nn = normalize(N + uRotW * (vec3(ex, ey, ez) * sp * 0.6));
      vec3 R = reflect(-V, mix(N, normalize(Nn), edge));
      float F = 0.05 + 0.95 * pow(1.0 - max(dot(V, N), 0.0), 5.0);
      col += envW(R) * mix(F * 0.55, 0.9, edge) * (1.0 - slot * 0.8);
      ${DIST}
    }`.replace('void main(){', 'float sdRBoxC(vec2 p, vec2 h, float r){ vec2 d = abs(p) - h + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }\n    void main(){'),
});
const cabGroup = new THREE.Group(), cabRefl = new THREE.Group();
{
  const fg = new THREE.PlaneGeometry(CAB.W, CAB.W, 1, 1); fg.translate(0, 0, CAB.LZ);
  const bg = new THREE.BoxGeometry(CAB.W - 0.002, CAB.W - 0.002, 0.115); bg.translate(0, 0, CAB.LZ - 0.0006 - 0.0575);
  for (const gp of [cabGroup, cabRefl]) {
    const f = new THREE.Mesh(fg, cabFaceMat), b = new THREE.Mesh(bg, cabBodyMat);
    f.frustumCulled = b.frustumCulled = false; gp.add(f, b); gp.visible = false;
  }
}
const cabPose = { pull: 0, spin: 0 };
const qTmp = new THREE.Quaternion(), qYaw = new THREE.Quaternion(), vUp = new THREE.Vector3(0, 1, 0);
// place the cabinet for a pull (0 in the bay .. 1 out and turned) and a spin from the finger; writes into obj
function cabPlace(pull, spin, obj) {
  const out = sstep(0.0, 0.3, pull), go = sstep(0.18, 1.0, pull);
  obj.position.copy(CAB.centre).addScaledVector(CAB.n, 0.14 * out).addScaledVector(CAB.nh, (CAB.OUT - 0.14) * go).addScaledVector(vUp, CAB.LIFT * go);
  qTmp.identity().slerp(CAB.qUp, go);
  qYaw.setFromAxisAngle(vUp, CAB.YAW * go + spin);
  obj.quaternion.copy(qYaw).multiply(qTmp).multiply(CAB.qBase);
  obj.updateMatrixWorld(true);
  return obj;
}
function bigMat(k) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uBoot: { value: 0 }, uSwap: { value: 0 }, uK: { value: k } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW, vN; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: G + LED + /* glsl */`
      uniform float uBoot, uSwap, uGain; uniform int uK;
      varying vec2 vUv; varying vec3 vW, vN;
      void main(){
        vec2 wh = uScrWH[uK]; float pitch = 0.010;
        vec2 gm = vUv * wh; vec2 cm = (floor(gm / pitch) + 0.5) * pitch;
        vec2 cab = floor(vUv * vec2(12.0, 7.0));
        float r = hash21(cab + float(uK) * 7.0);
        float tOn = 0.08 + 0.55 * (cab.y / 6.0) + 0.25 * r;
        float on = step(tOn, uBoot);
        float flash = 1.0 + 1.8 * exp(-max(uBoot - tOn, 0.0) / 0.05);
        float tSw = 0.1 + 0.6 * cab.x / 11.0 + 0.12 * r;
        float dip = 1.0 - exp(-pow((uSwap - tSw) / 0.05, 2.0)) * step(0.001, uSwap) * step(uSwap, 0.999);
        float fu = max(fwidth(vUv.x), 1e-6);
        gLodV = 0.0; gLodL = 0.6;
        vec3 cNear = contentBig(cm / wh);
        gLodV = log2(max(fu * 1280.0, 1.0)); gLodL = log2(max(fu * 992.0 / 0.58, 1.0));
        vec3 c = ledFace(gm, pitch, cNear, contentBig(vUv));
        vec3 col = c * on * flash * dip * uGain * 1.15;
        // first light of a cabinet: a green fill for a blink
        col += vec3(0.05, 1.0, 0.32) * 2.5 * on * exp(-max(uBoot - tOn, 0.0) / 0.025) * step(uBoot, 0.999);
        col += maskLit(vW, normalize(vN), gm, pitch) * (1.0 - on);
        // frame seam between cabinets, visible only up close
        vec2 sf = abs(fract(vUv * vec2(12.0, 7.0)) - 0.5);
        col *= 1.0 - 0.35 * smoothstep(0.497, 0.4995, max(sf.x, sf.y)) * (1.0 - smoothstep(0.003, 0.02, length(fwidth(vUv))));
        ${DIST}
      }`,
  });
}

// the pitch: striped grass, markings, dew; the lit boards and screens mirror in it
const rtRefl = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
const reflMatrix = new THREE.Matrix4();
const pitchMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uRefl: { value: rtRefl.texture }, uReflM: { value: reflMatrix }, uWet: { value: 1.0 } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: G + /* glsl */`
    uniform sampler2D uLMP, uRefl; uniform mat4 uReflM; uniform float uWet;
    varying vec3 vW;
    float lineD(vec2 p){
      vec2 a = abs(p); float d = 1e3;
      d = min(d, max(abs(a.y - 34.0), a.x - 52.5)); d = min(d, max(abs(a.x - 52.5), a.y - 34.0));
      d = min(d, max(abs(p.x), a.y - 34.0)); d = min(d, abs(length(p) - 9.15));
      d = min(d, max(abs(a.x - 36.0), a.y - 20.16)); d = min(d, max(abs(a.y - 20.16), max(36.0 - a.x, a.x - 52.5)));
      d = min(d, max(abs(a.x - 47.0), a.y - 9.16)); d = min(d, max(abs(a.y - 9.16), max(47.0 - a.x, a.x - 52.5)));
      d = min(d, max(abs(length(vec2(a.x - 41.5, p.y)) - 9.15), a.x - 36.0));
      d = min(d, length(vec2(a.x - 41.5, p.y)) - 0.11); d = min(d, length(p) - 0.11);
      d = min(d, max(abs(length(vec2(a.x - 52.5, a.y - 34.0)) - 1.0), max(a.x - 52.5, a.y - 34.0)));
      return d;
    }
    void main(){
      vec2 p = vW.xz;
      vec2 lu = vec2(p.x / ${LMP.X}.0 * 0.5 + 0.5, p.y / ${LMP.Z}.0 * 0.5 + 0.5);
      vec3 E = texture2D(uLMP, lu).rgb;
      E /= 1.0 + max(E.r, max(E.g, E.b)) * 0.5; // the grass right at a board would clip; roll it off
      float inPitch = step(abs(p.x), 55.5) * step(abs(p.y), 36.5);
      float stripe = mod(floor((p.x + 52.5) / 5.25), 2.0);
      float n = vnoise(p * 2.3) * 0.4 + vnoise(p * 0.37) * 0.6;
      vec3 grass = mix(vec3(0.028, 0.075, 0.024), vec3(0.040, 0.100, 0.032), stripe) * (0.8 + 0.4 * n);
      vec3 apron = vec3(0.03, 0.07, 0.025) * (0.8 + 0.4 * n);
      vec3 alb = mix(apron, grass, inPitch);
      // track of tarmac behind the boards
      float behind = smoothstep(0.0, 0.3, max(abs(p.x) - 57.3, abs(p.y) - 38.8));
      alb = mix(alb, vec3(0.03, 0.03, 0.032) * (0.7 + 0.6 * n), behind);
      float d = lineD(p); float fw = fwidth(d) + 0.002;
      alb = mix(alb, vec3(0.55), (1.0 - smoothstep(0.06 - fw, 0.06 + fw, d)) * inPitch);
      vec3 col = alb * E + alb * vec3(0.0006, 0.0008, 0.0014);
      // the wet sheen: a blurred, vertically smeared mirror of every lit LED surface
      vec3 V = normalize(cameraPosition - vW);
      float fres = 0.02 + 0.98 * pow(1.0 - max(V.y, 0.0), 5.0);
      float wet = (0.35 + 0.65 * smoothstep(0.35, 0.75, fbm(p * 0.09 + 3.0))) * uWet * mix(0.6, 1.0, behind);
      vec4 rp = uReflM * vec4(vW, 1.0);
      vec2 ruv = rp.xy / rp.w;
      ruv += (vec2(vnoise(p * 7.0), vnoise(p * 7.0 + 9.0)) - 0.5) * 0.004;
      vec3 R = vec3(0.0); float wsum = 0.0;
      for (int i = 0; i < 6; i++) { float t = float(i) / 5.0; float wgt = 1.0 - t * 0.7;
        R += textureLod(uRefl, ruv + vec2(0.0, -t * 0.035), 1.0 + t * 3.0).rgb * wgt; wsum += wgt; }
      R /= wsum;
      col += R * fres * wet * 0.9;
      ${DIST}
    }`,
});

// sky: night, clouds lit from below by the stadium, faint town glow, a few stars
const skyMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uGlow: { value: new THREE.Vector3() } }, side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
  fragmentShader: G + /* glsl */`
    uniform vec3 uGlow; varying vec3 vD;
    void main(){
      vec3 D = normalize(vD); float h = max(D.y, 0.0);
      vec3 col = mix(vec3(0.0045, 0.0052, 0.0078), vec3(0.0010, 0.0012, 0.0022), pow(h, 0.45));
      col += vec3(0.010, 0.0065, 0.004) * exp(-h * 18.0) * 0.8; // sodium glow of the town on the horizon
      if (D.y > 0.01) {
        float t = (700.0 - cameraPosition.y) / D.y; vec2 H = cameraPosition.xz + D.xz * t;
        float cl = smoothstep(0.42, 0.85, fbm(H / 900.0 + vec2(uTime * 0.004, 0.0)));
        float r = length(H) / 520.0;
        vec3 lit = uGlow / (1.0 + r * r * 2.5) + vec3(0.004, 0.0036, 0.0034) * exp(-h * 3.0);
        col = mix(col, col * 0.6 + lit * 0.55, cl * smoothstep(0.0, 0.08, D.y));
        vec2 sc = D.xz / (D.y + 0.3) * 260.0; float st = step(0.9965, hash21(floor(sc))) * smoothstep(0.35, 0.05, length(fract(sc) - 0.5));
        col += vec3(0.05) * st * (1.0 - cl) * smoothstep(0.05, 0.3, D.y);
      }
      gl_FragColor = vec4(col, 5000.0);
    }`,
});
const groundMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: G + /* glsl */`varying vec3 vW; void main(){ float n = fbm(vW.xz * 0.05); vec3 col = vec3(0.0006, 0.0007, 0.0009) * (0.6 + 0.8 * n);
    float r = length(vW.xz); col += vec3(0.004, 0.0028, 0.0018) * smoothstep(300.0, 900.0, r) * n * 0.5; ${DIST} }`,
});
// distant town lights
function buildTown() {
  const P = [], C = [];
  const r = D3.rnd;
  for (let i = 0; i < 2600; i++) {
    const a = r() * Math.PI * 2, d = 420 + Math.pow(r(), 0.7) * 1800;
    const cluster = Math.sin(a * 7.0) * 0.5 + 0.5;
    if (r() > 0.25 + 0.75 * cluster) continue;
    P.push(Math.cos(a) * d, r() < 0.85 ? 0.5 + r() * 6 : 6 + r() * 40, Math.sin(a) * d);
    const sod = r() < 0.6; C.push(...(sod ? [1.0, 0.55, 0.22] : [0.85, 0.9, 1.0]).map((x) => x * (0.3 + r() * 0.7)));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 } },
    vertexShader: 'attribute vec3 color; uniform float uPx; varying vec3 vC; varying vec3 vW; void main(){ vC = color; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv; gl_PointSize = uPx * clamp(900.0 / -mv.z, 1.0, 3.0); }',
    fragmentShader: 'varying vec3 vC; varying vec3 vW; void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(q)); if (a < 0.05) discard; gl_FragColor = vec4(vC * a * 0.35, length(vW - cameraPosition)); }',
  }));
}
// the green light: a hot point with a halo; additive, leaves the distance channel alone
const pktMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uP: { value: new THREE.Vector3() }, uSz: { value: 1 }, uA: { value: 0 } }, transparent: true, depthWrite: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  vertexShader: 'uniform vec3 uP; uniform float uSz; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = viewMatrix * vec4(uP, 1.0); mv.xy += position.xy * uSz; gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform float uA; varying vec2 vUv; void main(){ vec2 q = (vUv - 0.5) * 2.0; float r = length(q); float core = smoothstep(0.08, 0.03, r); float halo = exp(-r * r * 20.0) * 0.9 + exp(-r * r * 4.0) * 0.15; vec3 c = vec3(1.0) * core * 6.0 + vec3(0.05, 1.0, 0.32) * halo * 3.0; gl_FragColor = vec4(c * uA, 0.0); }',
});

// ---------------------------------------------------------------- build the scene
const scene = new THREE.Scene();
const refl = new THREE.Scene();
const add = (m, both) => { scene.add(m); if (both) { const c = new THREE.Mesh(m.geometry, m.material); c.matrixAutoUpdate = false; c.matrix.copy(m.matrix); c.matrixWorld.copy(m.matrixWorld); c.frustumCulled = false; refl.add(c); } return m; };
add(new THREE.Mesh(D3.buildStands(), standsMat));
const { seatGeo, crowdGeo } = D3.buildSeatsAndCrowd();
const seatsM = add(new THREE.Mesh(seatGeo, seatMat)); seatsM.frustumCulled = false;
const crowdM = add(new THREE.Mesh(crowdGeo, crowdMat)); crowdM.frustumCulled = false;
const steelM = add(new THREE.Mesh(D3.buildSteel(), steelMat)); steelM.frustumCulled = false;
add(new THREE.Mesh(D3.buildLamps(), lampMat));
add(new THREE.Mesh(D3.buildMisc(), miscMat));
add(new THREE.Mesh(D3.buildNets(), netMat));
add(new THREE.Mesh(D3.buildLoopFace(PER, PER.y0), perMat), true);
add(new THREE.Mesh(D3.buildLoopFace(RIB, null), ribMat), true);
const bigMats = SCR.map((s, k) => {
  const m = bigMat(k);
  const g = new THREE.PlaneGeometry(s.w, s.h, 1, 1);
  const mesh = new THREE.Mesh(g, m);
  const basis = new THREE.Matrix4().makeBasis(s.r, s.u, s.n);
  mesh.quaternion.setFromRotationMatrix(basis); mesh.position.copy(s.c); mesh.updateMatrixWorld();
  add(mesh, true); return m;
});
{
  const g = new THREE.PlaneGeometry(2 * LMP.X, 2 * LMP.Z, 1, 1); g.rotateX(-Math.PI / 2);
  add(new THREE.Mesh(g, pitchMat));
  const gg = new THREE.PlaneGeometry(9000, 9000, 1, 1); gg.rotateX(-Math.PI / 2); const gm = new THREE.Mesh(gg, groundMat); gm.position.y = -0.3; add(gm);
}
const sky = add(new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), skyMat)); sky.frustumCulled = false; sky.renderOrder = -1;
const town = add(buildTown());
const pkt = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pktMat)); pkt.frustumCulled = false; pkt.renderOrder = 5;
{ const pr = new THREE.Mesh(pkt.geometry, pktMat); pr.frustumCulled = false; refl.add(pr); }
scene.add(cabGroup); refl.add(cabRefl);
scene.traverse((o) => { o.updateMatrixWorld(); });

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 9000);
const rCam = new THREE.PerspectiveCamera(36, 1, 0.1, 9000);

// ---------------------------------------------------------------- post: bloom chain and composite
const rtMain = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: qs.has('msaa') ? +qs.get('msaa') : (desk() ? 2 : 4) });
const bloomRT = []; for (let i = 0; i < 6; i++) bloomRT.push(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
const bloomUp = []; for (let i = 0; i < 5; i++) bloomUp.push(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
const downPass = pass(/* glsl */`
  uniform sampler2D uSrc; uniform vec2 uTx; uniform float uFirst; varying vec2 vUv;
  vec3 tap(vec2 o){ vec3 c = texture2D(uSrc, vUv + o * uTx).rgb; if (uFirst > 0.5) { float l = max(c.r, max(c.g, c.b)); c *= max(l - 0.9, 0.0) / max(l, 1e-4); c = min(c, vec3(60.0)); } return c; }
  void main(){ vec3 c = tap(vec2(0.0)) * 0.5 + (tap(vec2(-1, -1)) + tap(vec2(1, -1)) + tap(vec2(-1, 1)) + tap(vec2(1, 1))) * 0.125; gl_FragColor = vec4(c, 1.0); }`,
{ uSrc: { value: null }, uTx: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
const upPass = pass(/* glsl */`
  uniform sampler2D uSrc, uAdd; uniform vec2 uTx; varying vec2 vUv;
  void main(){ vec3 c = vec3(0.0);
    c += texture2D(uSrc, vUv + vec2(-1, 0) * uTx).rgb + texture2D(uSrc, vUv + vec2(1, 0) * uTx).rgb + texture2D(uSrc, vUv + vec2(0, -1) * uTx).rgb + texture2D(uSrc, vUv + vec2(0, 1) * uTx).rgb;
    c = c * 0.125 + texture2D(uSrc, vUv).rgb * 0.5;
    gl_FragColor = vec4(c + texture2D(uAdd, vUv).rgb, 1.0); }`,
{ uSrc: { value: null }, uAdd: { value: null }, uTx: { value: new THREE.Vector2() } });
if (qs.has('dbgroof')) console.log('dbg');

// haze at half resolution: light from every lit source scattered along the view ray, integrated in closed form
const rtHaze = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
const hazePass = pass(G + /* glsl */`
  uniform sampler2D uMain; uniform mat4 uInvProj, uCamW; uniform vec3 uCam; uniform vec2 uMRes;
  varying vec2 vUv;
  void main(){
    // the nearest of the four full-res depths under this texel (keeps foreground edges crisp)
    vec2 px = 0.5 / uMRes; float dist = 1e5;
    for (int j = -1; j <= 1; j += 2) for (int i = -1; i <= 1; i += 2) dist = min(dist, texture2D(uMain, vUv + vec2(i, j) * px).a);
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 vr = uInvProj * vec4(ndc, 1.0, 1.0); vec3 Dv = normalize(vr.xyz / vr.w);
    vec3 D = normalize(mat3(uCamW) * Dv); vec3 O = uCam;
    float L = min(dist, 420.0);
    vec3 sc = vec3(0.0);
    for (int i = 0; i < ${qs.has('nohaze') ? 0 : D3.NHL}; i++) {
      if (uHLOn[i] < 0.003) continue;
      vec3 Sp = uHLPos[i]; vec3 OS = Sp - O; float tc = dot(OS, D);
      float h = max(length(OS - D * tc), 0.8);
      float I = (atan((L - tc) / h) + atan(tc / h)) / h;
      vec3 Pc = O + D * clamp(tc, 0.0, L);
      float cosE = i < 18 ? max(dot(uHLN[i], normalize(Pc - Sp)), 0.0) * 0.8 + 0.2 : 1.0;
      float k = i < 2 ? uHLPow[i] * 0.02 : (i < 18 ? uHLPow[i] * 0.012 : 0.05);
      sc += hlCol(i) * uHLOn[i] * I * k * cosE;
    }
    vec3 Pm = O + D * min(L, 70.0);
    float nz = 0.55 + 0.9 * fbm(Pm.xz * 0.025 + vec2(uTime * 0.02, Pm.y * 0.03));
    gl_FragColor = vec4(sc * nz, L);
  }`, { uMain: { value: rtMain.texture }, uInvProj: { value: new THREE.Matrix4() }, uCamW: { value: new THREE.Matrix4() }, uMRes: { value: new THREE.Vector2() } });
const compPass = pass(G + /* glsl */`
  uniform sampler2D uMain, uBloom; uniform mat4 uInvProj, uCamW; uniform vec2 uRes; uniform vec3 uCam;
  uniform float uExpo, uBloomK, uHazeK, uDof, uFocus, uGrain; uniform sampler2D uHaze; uniform vec2 uHRes;
  varying vec2 vUv;
  vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  void main(){
    vec4 m = texture2D(uMain, vUv);
    vec3 c = m.rgb; float dist = m.a;
    ${qs.has('dbgnan') ? 'if (any(isnan(m)) || any(isinf(m)) || m.r > 60000.0 || m.g > 60000.0 || m.b > 60000.0) { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); return; } if (m.r < 0.0 || m.g < 0.0 || m.b < 0.0) { gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0); return; }' : ''}
    if (uDof > 0.001) { // gather depth of field round the focus distance
      float coc = clamp(abs(dist - uFocus) / max(dist, 0.1) * uDof * 26.0, 0.0, 22.0);
      if (coc > 0.6) {
        vec3 acc = c; float wsum = 1.0;
        for (int i = 1; i < 24; i++) {
          float r = sqrt(float(i) / 24.0) * coc; float a = float(i) * 2.39996;
          vec2 o = vec2(cos(a), sin(a)) * r / uRes;
          vec4 s = texture2D(uMain, vUv + o);
          float sc = clamp(abs(s.a - uFocus) / max(s.a, 0.1) * uDof * 26.0, 0.0, 22.0);
          float w = smoothstep(r - 1.0, r + 1.0, sc + 0.5);
          acc += s.rgb * w; wsum += w;
        }
        c = acc / wsum;
      }
    }
    // haze, computed at half resolution, joined back with a depth-aware upsample
    float L = min(dist, 420.0);
    vec2 hp = vUv * uHRes - 0.5; vec2 hb = floor(hp), hf = hp - hb;
    vec3 hz = vec3(0.0); float hw = 0.0;
    for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
      vec4 h = texture2D(uHaze, (hb + vec2(i, j) + 0.5) / uHRes);
      float w = (i == 0 ? 1.0 - hf.x : hf.x) * (j == 0 ? 1.0 - hf.y : hf.y) + 1e-4;
      w *= exp(-abs(h.a - L) / (0.06 * L + 0.5));
      hz += h.rgb * w; hw += w;
    }
    c += hz / max(hw, 1e-4) * uHazeK;
    c = c * exp(-L * 0.0009) + vec3(0.0009, 0.001, 0.0014) * (1.0 - exp(-L * 0.0009));
    c += texture2D(uBloom, vUv).rgb * uBloomK;
    c *= uExpo;
    c = aces(c);
    float vg = smoothstep(1.25, 0.35, length((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0)) * 1.1);
    c *= mix(0.62, 1.0, vg);
    c = toSRGB(c);
    c += (hash21(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * uGrain;
    gl_FragColor = vec4(c, 1.0);
  }`,
{ uMain: { value: rtMain.texture }, uBloom: { value: bloomUp[0].texture }, uInvProj: { value: new THREE.Matrix4() }, uCamW: { value: new THREE.Matrix4() },
  uRes: { value: new THREE.Vector2() }, uExpo: { value: 1.55 }, uBloomK: { value: qs.has('dbgroof') ? 0 : 0.42 }, uHazeK: { value: qs.has('dbgroof') ? 0 : 0.5 }, uHaze: { value: rtHaze.texture }, uHRes: { value: new THREE.Vector2() }, uDof: { value: 0 }, uFocus: { value: 10 }, uGrain: { value: 0.012 } });

function resize() {
  const w = innerWidth, h = innerHeight;
  size.w = w; size.h = h; size.dpr = baseDpr() * size.scale;
  renderer.setPixelRatio(1); renderer.setSize(Math.round(w * size.dpr), Math.round(h * size.dpr), false);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const W = Math.round(w * size.dpr), H = Math.round(h * size.dpr);
  rtMain.setSize(W, H);
  rtRefl.setSize(Math.max(2, Math.round(W / 3)), Math.max(2, Math.round(H / 3)));
  let bw = W, bh = H;
  for (let i = 0; i < 6; i++) { bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); bloomRT[i].setSize(bw, bh); if (i < 5) bloomUp[i].setSize(bw, bh); }
  compPass.u.uRes.value.set(W, H);
  rtHaze.setSize(Math.max(1, W >> 1), Math.max(1, H >> 1)); compPass.u.uHRes.value.set(rtHaze.width, rtHaze.height); hazePass.u.uMRes.value.set(W, H);
  camera.aspect = w / h; rCam.aspect = w / h;
  town.material.uniforms.uPx.value = size.dpr;
  document.documentElement.style.setProperty('--vh', h + 'px');
  layoutScroll();
  buildCloseKeys();
}

// ---------------------------------------------------------------- story: one clock u (0..1 switch-on, 1..2 and 2..3 the two scroll moves)
const T = { bootA: [0.0, 0.07], p1: [0.09, 0.165], per: [0.165, 0.42], p2: [0.42, 0.485], rib: [0.485, 0.76], p3: [0.77, 0.865], bootB: [0.865, 0.935] };
const INTRO_S = 10.5;
// the board panel in front of the close-up camera (12 m panels from the loop start) must show footage (type 2)
const CLOSE_S = CAB.s0 + CAB.W / 2, CLOSE_PAGE = ((1 - Math.floor(CLOSE_S / 12)) % 5 + 5) % 5;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lin01 = (a, b, x) => clamp01((x - a) / (b - a));
const sstep = (a, b, x) => { const t = lin01(a, b, x); return t * t * (3 - 2 * t); };
const ease = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tmpV = new THREE.Vector3();
// the green light's three flights
const A0 = SCR[0].c.clone().addScaledVector(SCR[0].u, -SCR[0].h / 2 - 0.6).addScaledVector(SCR[0].n, 0.6);
const perStart = V(PER.start[0], 0.55, PER.start[1]); const perMeet = new THREE.Vector3(); D3.loopPoint(PER, PER.L / 2, perMeet); perMeet.y = 0.55;
const ribStart = new THREE.Vector3(); D3.loopPoint(RIB, 0, ribStart); const ribMeet = new THREE.Vector3(); D3.loopPoint(RIB, RIB.L / 2, ribMeet);
const curve = (pts) => { const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5); c.arcLengthDivisions = 300; return c; };
const fly1 = curve([A0, A0.clone().add(V(-4, -6, -3)), perStart.clone().add(V(-3, 3.5, -2)), perStart.clone().add(V(-0.5, 0.4, -0.3))]);
const fly2 = curve([perMeet.clone().add(V(0.5, 0.4, 0.3)), perMeet.clone().add(V(-3, 4, -2)), ribStart.clone().add(V(4, -2, 3)), ribStart.clone().add(V(1.0, 0, 0.8))]);
const B0 = SCR[1].c.clone().addScaledVector(SCR[1].n, 0.8);
const fly3 = curve([ribMeet.clone().add(V(-1, 0, -0.8)), ribMeet.clone().add(V(-14, 9, -10)), V(0, 30, 0), B0.clone().add(V(14, 4, 10)), B0]);

// camera rails: [u, position, target] for wide (desktop) and tall (phone) frames
const camKeysW = [
  [0.00, V(34, 2.3, 17.5), V(62, 18.5, 43)],
  [0.08, V(32.5, 2.4, 16.5), V(61, 17, 42.5)],
  [0.165, V(33, 2.6, 19), V(54, 3.2, 36)],
  [0.27, V(30, 5.5, 29), V(-5, 0.8, 38.5)],
  [0.36, V(0, 11, 22), V(-50, 1, 30)],
  [0.44, V(-22, 17, 6), V(-55, 2, -28)],
  [0.52, V(-28, 24, -8), V(-70, 13, -50)],
  [0.64, V(-110, 60, -40), V(0, 6, 5)],
  [0.76, V(-125, 62, 10), V(20, 8, 10)],
  [0.87, V(-120, 55, 40), V(0, 14, -10)],
  [1.00, V(-130, 62, -38), V(6, 2, 6)],
  [1.35, V(-60, 30, 10), V(0, 2, 25)],
  [1.70, V(-14, 3.5, 33), V(7, 0.6, 38.5)],
  [2.00, V(4.6, 0.30, 37.25), V(7.3, 0.66, 38.5)],
];
const endW = [[3.78, V(20, 50, 60), V(0, 4, 0)], [4.00, V(-12, 128, 140), V(0, -2, -6)]];
const camKeysT = [
  [0.00, V(40, 1.9, 23.5), V(62, 14.5, 43)],
  [0.08, V(39.2, 2.0, 23), V(61, 13.8, 42.5)],
  [0.165, V(36, 2.6, 21), V(54, 3.4, 36)],
  [0.27, V(32, 6, 28), V(-2, 0.8, 38.5)],
  [0.36, V(2, 12, 22), V(-48, 1, 30)],
  [0.44, V(-20, 18, 6), V(-55, 2, -28)],
  [0.52, V(-26, 25, -6), V(-70, 13, -50)],
  [0.64, V(-140, 80, -10), V(0, 4, 0)],
  [0.76, V(-150, 95, 30), V(10, 4, -5)],
  [0.87, V(-150, 85, 20), V(0, 10, -10)],
  [1.00, V(-150, 92, -22), V(6, -6, 2)],
  [1.35, V(-60, 34, 8), V(0, 1, 26)],
  [1.70, V(-10, 3.0, 33.5), V(7, 0.6, 38.5)],
  [2.00, V(4.9, 0.3, 37.35), V(7.0, 0.62, 38.5)],
];
const endT = [[3.78, V(60, 70, 30), V(0, 2, 0)], [4.00, V(200, 150, 10), V(-10, -22, -2)]];
function rail(keys) {
  const us = keys.map((k) => k[0]);
  const pc = new THREE.CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal', 0.5);
  const tc = new THREE.CatmullRomCurve3(keys.map((k) => k[2]), false, 'centripetal', 0.5);
  return (u, P, Tg) => {
    let i = 0; while (i < us.length - 2 && u > us[i + 1]) i++;
    const k = lin01(us[i], us[i + 1], u);
    const t = (i + k) / (us.length - 1);
    pc.getPoint(t, P); tc.getPoint(t, Tg);
  };
}
const railW = rail(camKeysW), railT = rail(camKeysT);

// ---------------------------------------------------------------- the close section (u 1.70..4.00): one pose curve
// A pose is the point looked at, the direction to the camera (yaw, pitch) and the log of the distance. Interpolating the log of
// the distance makes the dive a steady zoom (equal ratios for equal scroll) and can never put the camera through the face.
const poseOf = (P, Tg) => { const D = P.clone().sub(Tg), d = D.length(); return [Tg.x, Tg.y, Tg.z, Math.atan2(D.x, D.z), Math.asin(D.y / d), Math.log(d)]; };
function poseApply(k, P, Tg) { Tg.set(k[0], k[1], k[2]); const c = Math.cos(k[4]), d = Math.exp(k[5]); P.set(Math.sin(k[3]) * c, Math.sin(k[4]), Math.cos(k[3]) * c).multiplyScalar(d).add(Tg); }
// Hermite through the keys with tangents that cannot overshoot: zero where a channel turns round (the macro is the closest point,
// not a point the camera passes on its way back), gentle at the scroll stops, Catmull-Rom elsewhere. Smooth in u itself.
const STOPS = [2.0, 3.0];
function tangents(ts, vs) {
  return vs.map((v, i) => {
    if (i === 0 || i === vs.length - 1) return 0;
    const a = v - vs[i - 1], b = vs[i + 1] - v;
    if (a * b <= 0) return 0;
    let m = (vs[i + 1] - vs[i - 1]) / (ts[i + 1] - ts[i - 1]);
    // Fritsch and Carlson: keep the segment monotone
    m = Math.sign(m) * Math.min(Math.abs(m), 3 * Math.abs(a) / (ts[i] - ts[i - 1]), 3 * Math.abs(b) / (ts[i + 1] - ts[i]));
    return STOPS.some((k) => Math.abs(ts[i] - k) < 1e-6) ? m * 0.35 : m;
  });
}
function herm(t, ts, vs, ms) {
  let i = 0; while (i < ts.length - 2 && t > ts[i + 1]) i++;
  const h = ts[i + 1] - ts[i], x = Math.min(1, Math.max(0, (t - ts[i]) / h)), x2 = x * x, x3 = x2 * x;
  return (2 * x3 - 3 * x2 + 1) * vs[i] + (x3 - 2 * x2 + x) * h * ms[i] + (-2 * x3 + 3 * x2) * vs[i + 1] + (x3 - x2) * h * ms[i + 1];
}
let closeKeys = null;
const cabTmp = new THREE.Object3D();
function buildCloseKeys() {
  const tall = isPhoneish();
  const fov = tall ? 58 : 36, asp = innerWidth / innerHeight;
  const tv = Math.tan(THREE.MathUtils.degToRad(fov / 2)), th = tv * asp;
  const keys = [];
  const P = new THREE.Vector3(), Tg = new THREE.Vector3();
  const rl = tall ? railT : railW;
  rl(1.45, P, Tg); keys.push([1.45, poseOf(P, Tg)]);
  rl(1.70, P, Tg); keys.push([1.70, poseOf(P, Tg)]);
  // stop 2: the whole cabinet out of the board, three quarters on, the stadium soft behind it
  cabPlace(1, 0, cabTmp);
  const Cc = cabTmp.position.clone(), Zc = new THREE.Vector3(0, 0, 1).applyQuaternion(cabTmp.quaternion);
  const d2 = Math.max(0.44 / ((tall ? 0.8 : 0.46) * th), 0.5 / ((tall ? 0.5 : 0.6) * tv));
  const D2 = Zc.clone().applyAxisAngle(vUp, CAB.CAMYAW); D2.y += 0.42; D2.normalize();
  const T2 = Cc.clone();
  if (tall) T2.y += d2 * tv * 0.1; else T2.addScaledVector(new THREE.Vector3().crossVectors(vUp, D2).normalize(), -d2 * th * 0.3); // cabinet right of centre, clear of the words
  keys.push([2.0, poseOf(T2.clone().addScaledVector(D2, d2), T2)]);
  // macro: a point on its face, the camera a few centimetres away, a little below and to the side, looking across the rows
  const T4 = new THREE.Vector3(0.07, -0.05, CAB.LZ).applyMatrix4(cabTmp.matrixWorld);
  const D4 = new THREE.Vector3(CAB.MX, -0.3, 0.8).normalize().applyQuaternion(cabTmp.quaternion);
  const d4 = tall ? 0.062 : 0.075;
  // between: nearly square on to the face, half a metre off
  const T3 = Cc.clone().lerp(T4, 0.7), D3v = Zc.clone().applyAxisAngle(vUp, CAB.CAMYAW * 0.25); D3v.y += 0.04; D3v.normalize();
  keys.push([2.5, poseOf(T3.clone().addScaledVector(D3v, 0.42), T3)]);
  keys.push([3.0, poseOf(T4.clone().addScaledVector(D4, d4), T4)]);
  // out of the macro: back to the whole cabinet, square on, before it slides home
  const D45 = Zc.clone().applyAxisAngle(vUp, CAB.CAMYAW * 0.5); D45.y += 0.25; D45.normalize();
  keys.push([3.24, poseOf(Cc.clone().addScaledVector(D45, d2 * 0.75), Cc)]);
  // pull back: the cabinet slides home, the camera backs off over the grass
  const T5 = CAB.centre.clone().addScaledVector(vUp, 0.4), D5 = CAB.nh.clone().applyAxisAngle(vUp, CAB.CAMYAW * 0.5); D5.y = 0.6; D5.normalize();
  keys.push([3.5, poseOf(T5.clone().addScaledVector(D5, 9), T5)]);
  for (const [u, Pk, Tk] of (tall ? endT : endW)) keys.push([u, poseOf(Pk, Tk)]);
  const last = keys[keys.length - 1][1].slice(); last[5] += 0.1; keys.push([4.3, last]);
  // unwrap the yaw so each step turns the short way round
  for (let i = 1; i < keys.length; i++) { const a = keys[i - 1][1][3]; let b = keys[i][1][3]; while (b - a > Math.PI) b -= 2 * Math.PI; while (b - a < -Math.PI) b += 2 * Math.PI; keys[i][1][3] = b; }
  const ts = keys.map((k) => k[0]), ch = [0, 1, 2, 3, 4, 5].map((c) => keys.map((k) => k[1][c]));
  closeKeys = { ts, ch, ms: ch.map((v) => tangents(ts, v)) };
}
const poseNow = [0, 0, 0, 0, 0, 0], cP = new THREE.Vector3(), cT = new THREE.Vector3();
function closePose(u, P, Tg) {
  for (let c = 0; c < 6; c++) poseNow[c] = herm(u, closeKeys.ts, closeKeys.ch[c], closeKeys.ms[c]);
  poseApply(poseNow, P, Tg);
}

// ---------------------------------------------------------------- state
const st = { spin: 0, spinS: 0, drag: null, u: 0, uv: 0, auto: 0, scrollU: 1, time: 0, ptr: new THREE.Vector2(), ptrS: new THREE.Vector2(), page: 0, wipe: 0, wiping: false, swap: 0, swapping: false, last: performance.now(), lmFlip: 0 };
if (reduced) st.auto = 1;
window.__probe = { frames: [] };

function storyUniforms(u) {
  // screens
  const bootA = SHOT && u >= T.bootA[1] ? 1 : lin01(T.bootA[0], T.bootA[1], u);
  const bootB = lin01(T.bootB[0], T.bootB[1], u);
  bigMats[0].uniforms.uBoot.value = u >= 1 ? 1 : bootA * 1.0;
  bigMats[1].uniforms.uBoot.value = u >= 1 ? 1 : bootB;
  U.uScrOn.value[0] = u >= 1 ? 1 : sstep(0.15, 0.95, bootA);
  U.uScrOn.value[1] = u >= 1 ? 1 : sstep(0.15, 0.95, bootB);
  // running edges
  const fp = u >= 1 ? PER.L / 2 + 2 : ease(lin01(T.per[0], T.per[1], u) * 1.0) * (PER.L / 2 + 2);
  const fr = u >= 1 ? RIB.L / 2 + 2 : ease(lin01(T.rib[0], T.rib[1], u)) * (RIB.L / 2 + 2);
  U.uFrontP.value = u >= T.per[0] ? Math.max(fp, 0.001) : 0;
  U.uFrontR.value = u >= T.rib[0] ? Math.max(fr, 0.001) : 0;
  U.uWave.value = u >= T.rib[0] ? lin01(T.rib[0], T.rib[1] + 0.06, u) * (RIB.L / 2 + 30) : -100;
  // point lights: screens, regions lit by the edges, the green light, the four edges
  const on = D3.hlOn;
  on[0] = U.uScrOn.value[0]; on[1] = U.uScrOn.value[1];
  for (let k = 0; k < 8; k++) {
    const sp = (k + 0.5) * PER.L / 8, dp = Math.min(sp, PER.L - sp);
    on[2 + k] = clamp01((U.uFrontP.value - dp + PER.L / 16) / (PER.L / 8));
    const sr = (k + 0.5) * RIB.L / 8, dr = Math.min(sr, RIB.L - sr);
    on[10 + k] = clamp01((U.uFrontR.value - dr + RIB.L / 16) / (RIB.L / 8));
  }
  // green light position
  let pk = 0;
  if (u >= T.p1[0] && u < T.p1[1]) { fly1.getPointAt(ease(lin01(T.p1[0], T.p1[1], u)), D3.hlPos[18]); pk = 1; }
  else if (u >= T.p2[0] && u < T.p2[1]) { fly2.getPointAt(ease(lin01(T.p2[0], T.p2[1], u)), D3.hlPos[18]); pk = 1; }
  else if (u >= T.p3[0] && u < T.p3[1]) { fly3.getPointAt(ease(lin01(T.p3[0], T.p3[1], u)), D3.hlPos[18]); pk = 1; }
  else if (u >= T.bootA[1] && u < T.p1[0]) { D3.hlPos[18].copy(A0); pk = sstep(T.bootA[1], T.p1[0], u); }
  const fade = (a) => sstep(a[0], a[0] + 0.01, u) * (1 - sstep(a[1] - 0.008, a[1], u));
  on[18] = pk * (u < T.p1[0] ? 1 : Math.max(fade(T.p1), fade(T.p2), fade(T.p3)));
  pktMat.uniforms.uP.value.copy(D3.hlPos[18]); pktMat.uniforms.uA.value = on[18];
  // edges as moving lights while they run
  const edgeOn = (f, L) => f > 0.01 && f < L / 2 ? 1 : 0;
  const g1 = D3.loopPoint(PER, U.uFrontP.value, D3.hlPos[19]); D3.hlPos[19].addScaledVector(g1.n, 0.3);
  const g2 = D3.loopPoint(PER, PER.L - U.uFrontP.value, D3.hlPos[20]); D3.hlPos[20].addScaledVector(g2.n, 0.3);
  const g3 = D3.loopPoint(RIB, U.uFrontR.value, D3.hlPos[21]); D3.hlPos[21].addScaledVector(g3.n, 0.3);
  const g4 = D3.loopPoint(RIB, RIB.L - U.uFrontR.value, D3.hlPos[22]); D3.hlPos[22].addScaledVector(g4.n, 0.3);
  on[19] = on[20] = edgeOn(U.uFrontP.value, PER.L) * 0.25; on[21] = on[22] = edgeOn(U.uFrontR.value, RIB.L) * 0.25;
  // the cabinet: out of the board on the way down, home again on the way up
  const pull = sstep(1.78, 1.98, u) * (1 - sstep(3.24, 3.5, u));
  const vis = pull > 0.0005;
  cabGroup.visible = cabRefl.visible = vis;
  perMat.uniforms.uHole.value = vis ? 1 : 0; perMat.uniforms.uHoleS.value.set(CAB.s0, CAB.s1); perMat.uniforms.uCabGlow.value.setScalar(pull);
  if (vis) {
    cabPlace(pull, st.spinS * sstep(0.9, 1.0, pull), cabGroup);
    cabRefl.position.copy(cabGroup.position); cabRefl.quaternion.copy(cabGroup.quaternion); cabRefl.updateMatrixWorld(true);
    cabU.uInv.value.copy(cabGroup.matrixWorld).invert(); cabU.uRotW.value.setFromMatrix4(cabGroup.matrixWorld);
    cabU.uFull.value = sstep(1.9, 2.0, u) * (1 - sstep(3.26, 3.4, u)); cabU.uPullK.value = pull;
  }
}

const camP = new THREE.Vector3(), camT = new THREE.Vector3();
function placeCamera(u) {
  const tall = isPhoneish();
  if (u < 1.8) (tall ? railT : railW)(u, camP, camT);
  if (u > 1.7) {
    closePose(Math.min(u, 4), cP, cT);
    if (u < 1.8) { const k = sstep(1.7, 1.8, u); camP.lerp(cP, k); camT.lerp(cT, k); } else { camP.copy(cP); camT.copy(cT); }
  }
  if (st.camOv) { camP.fromArray(st.camOv[0]); camT.fromArray(st.camOv[1]); }
  camera.fov = tall ? 58 : 36;
  // slow drone drift and the pointer
  const calm = reduced ? 0 : 1;
  const look = camT.clone().sub(camP); const dist = look.length();
  const yaw = (st.ptrS.x * 0.07 + Math.sin(st.time * 0.13) * 0.012) * calm, pit = (st.ptrS.y * 0.045 + Math.sin(st.time * 0.17) * 0.006) * calm;
  const closeK = 1 - 0.72 * sstep(1.75, 1.95, u) * (1 - sstep(3.2, 3.45, u));
  const off = camP.clone().sub(camT);
  off.applyAxisAngle(V(0, 1, 0), yaw * closeK);
  const right = new THREE.Vector3().crossVectors(off, V(0, 1, 0)).normalize();
  off.applyAxisAngle(right, pit * closeK);
  camera.position.copy(camT).add(off);
  camera.position.y = Math.max(camera.position.y, 0.22);
  camera.near = Math.min(0.1, Math.max(0.004, dist * 0.06)); camera.far = dist < 0.6 ? 2500 : 9000;
  camera.aspect = size.w / size.h; camera.updateProjectionMatrix();
  camera.lookAt(camT);
  camera.updateMatrixWorld();
  // depth of field only in the close look at the diodes
  // the cabinet is shot like a product: the stadium soft behind it, then macro depth of field on the diodes
  const inClose = sstep(1.8, 1.97, u) * (1 - sstep(3.26, 3.48, u));
  const macroK = sstep(Math.log(0.9), Math.log(0.09), Math.log(dist));
  const dof = inClose * (0.95 + (CAB.DOFM - 0.95) * macroK);
  // the opening: focus on the big screen, the nearest crowd a little soft
  const hero = 1 - sstep(0.07, 0.11, u);
  compPass.u.uDof.value = Math.max(dof, hero * 0.24);
  compPass.u.uFocus.value = hero > dof ? camera.position.distanceTo(SCR[0].c) : dist;
  // like a real camera, exposure comes down when it is close to a bright board
  compPass.u.uExpo.value = 1.55 * (1 - 0.3 * inClose) * (1 - CAB.EXPM * macroK * inClose);
  cabU.uFillI.value = CAB.FILL * inClose;
  if (!qs.has('dbgroof')) compPass.u.uBloomK.value = 0.42 * (1 - CAB.BLOOMM * macroK * inClose);
}

// mirror camera under the pitch
function updateReflection() {
  rCam.copy(camera);
  rCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
  const tgt = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position); tgt.y = -tgt.y;
  rCam.up.set(0, 1, 0);
  rCam.lookAt(tgt); rCam.updateMatrixWorld(); rCam.updateProjectionMatrix();
  reflMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  reflMatrix.multiply(rCam.projectionMatrix).multiply(rCam.matrixWorldInverse);
}

// ---------------------------------------------------------------- content clock: logo, board pages, swaps
function contentClock(dt) {
  const vt = video.currentTime || 0;
  U.uLogoOn.value = vt < SEGT[1] ? sstep(0.05, 0.35, vt) * (1 - sstep(SEGT[1] - 0.25, SEGT[1] - 0.02, vt)) : 0;
  // boards change page every 6.5 s with a wipe (or on a tap); in the close-up the panel in front of the camera shows footage
  st.pageT = (st.pageT || 0) + dt;
  const pin = st.uv > 1.55 && st.uv < 3.4 ? CLOSE_PAGE : -1;
  if (!st.wiping && ((pin < 0 && st.pageT > 6.5) || (pin >= 0 && st.page !== pin))) { st.wiping = true; st.wipe = 0; st.next = pin >= 0 ? pin : (st.page + 1) % 5; }
  if (st.wiping) { st.wipe += dt / 0.7; if (st.wipe >= 1) { st.wiping = false; st.wipe = 0; st.page = st.next; st.pageT = 0; } }
  U.uPage.value = st.page; U.uPage2.value = st.wiping ? st.next : st.page; U.uWipe.value = st.wiping ? ease(st.wipe) : 0;
  if (st.swapping) { st.swap += dt / 0.65; if (st.swap >= 1) { st.swapping = false; st.swap = 0; } }
  for (const m of bigMats) m.uniforms.uSwap.value = st.swapping ? st.swap : 0;
}
function tapSwitch() {
  if (st.u < T.bootA[1]) return;
  if (!st.wiping && !(st.uv > 1.55 && st.uv < 3.4)) { st.wiping = true; st.wipe = 0; st.next = (st.page + 1) % 5; }
  if (!st.swapping) {
    st.swapping = true; st.swap = 0;
    const vt = video.currentTime || 0; let i = SEGT.findIndex((s) => s > vt + 0.05); if (i < 0) i = 0;
    setTimeout(() => { try { video.currentTime = SEGT[i]; } catch (e) {} }, 260);
  }
  hint(false);
}

// ---------------------------------------------------------------- one frame
function render(dt) {
  storyUniforms(st.uv);
  placeCamera(st.uv);
  U.uCam.value.copy(camera.position);
  U.uTime.value = st.time;
  // stadium glow on the clouds
  const g = new THREE.Vector3();
  // approximate: weighted lit amount in Bendac green-white
  const lit = (D3.hlOn[0] + D3.hlOn[1]) * 0.5 + D3.hlOn.slice(2, 18).reduce((a, b) => a + b, 0) / 16;
  g.set(0.010, 0.012, 0.011).multiplyScalar(lit);
  skyMat.uniforms.uGlow.value.copy(g);
  // passes
  run(probePass, rtProbe);
  const phone = !desk();
  st.lmFlip ^= 1;
  // light maps alternate: stands on one frame, pitch on the next (light changes smoothly; halves the cost)
  if (SHOT) { run(lmbPass, rtLMB); run(lmpPass, rtLMP); } else if (st.lmFlip) run(lmbPass, rtLMB); else run(lmpPass, rtLMP);
  updateReflection();
  renderer.setRenderTarget(rtRefl); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(refl, rCam);
  renderer.setRenderTarget(rtMain); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
  // bloom
  let src = rtMain.texture, sw = rtMain.width, sh = rtMain.height;
  for (let i = 0; i < 6; i++) {
    downPass.u.uSrc.value = src; downPass.u.uTx.value.set(1 / sw, 1 / sh); downPass.u.uFirst.value = i === 0 ? 1 : 0;
    run(downPass, bloomRT[i]); src = bloomRT[i].texture; sw = bloomRT[i].width; sh = bloomRT[i].height;
  }
  let lower = bloomRT[5];
  for (let i = 4; i >= 0; i--) {
    upPass.u.uSrc.value = lower.texture; upPass.u.uAdd.value = bloomRT[i].texture; upPass.u.uTx.value.set(1 / lower.width, 1 / lower.height);
    run(upPass, bloomUp[i]); lower = bloomUp[i];
  }
  hazePass.u.uInvProj.value.copy(camera.projectionMatrixInverse); hazePass.u.uCamW.value.copy(camera.matrixWorld); hazePass.u.uCam.value.copy(camera.position);
  if (!st.low || st.lmFlip || SHOT) run(hazePass, rtHaze);
  compPass.u.uInvProj.value.copy(camera.projectionMatrixInverse);
  compPass.u.uCamW.value.copy(camera.matrixWorld);
  run(compPass, null);
}

// ---------------------------------------------------------------- overlay (words appear by u; never over a lit screen)
const $ = (id) => document.getElementById(id);
const ov = { cab: $('ov-cab'), turn: $('turn'), hero: $('ov-hero'), close: $('ov-close'), end: $('ov-end'), cue: $('cue'), hintEl: $('hint') };
let hintShown = true, turnShown = true;
if (matchMedia('(hover: hover) and (pointer: fine)').matches) { ov.hintEl.textContent = 'Click to switch the picture'; ov.turn.querySelector('span').textContent = 'Drag to turn it'; }
function hint(v) { hintShown = v; }
const dots = [...document.querySelectorAll('#rail button')];
function overlay(u) {
  const set = (el, o) => { el.style.opacity = o.toFixed(3); el.style.visibility = o < 0.01 ? 'hidden' : 'visible'; el.style.transform = `translateY(${((1 - o) * 10).toFixed(1)}px)`; };
  // the headline holds for the first seconds, steps aside while the boards light (never over a lit board), returns over the lit bowl
  set(ov.hero, sstep(0.0, 0.05, u) * (1 - sstep(0.2, 0.25, u)) + sstep(0.9, 0.97, u) * (1 - sstep(1.08, 1.3, u)));
  set(ov.cab, sstep(1.86, 1.97, u) * (1 - sstep(2.1, 2.28, u)));
  set(ov.turn, (turnShown ? 1 : 0) * sstep(1.93, 1.99, u) * (1 - sstep(2.04, 2.12, u)));
  set(ov.close, sstep(2.82, 2.96, u) * (1 - sstep(3.05, 3.16, u)));
  set(ov.end, sstep(3.62, 3.9, u));
  const cueAt = (a) => sstep(a - 0.05, a + 0.02, u) * (1 - sstep(a + 0.05, a + 0.15, u));
  set(ov.cue, sstep(0.9, 1.0, u) * (1 - sstep(1.05, 1.2, u)) + cueAt(2.0) + cueAt(3.0));
  set(ov.hintEl, (hintShown ? 1 : 0) * sstep(0.95, 1.0, u) * (1 - sstep(1.1, 1.25, u)));
  const ch = u < 1.5 ? 0 : (u < 2.5 ? 1 : (u < 3.5 ? 2 : 3));
  dots.forEach((d, i) => d.setAttribute('aria-current', i === ch ? 'true' : 'false'));
  ov.end.classList.toggle('live', u > 3.7);
}

// ---------------------------------------------------------------- scroll, pointer, taps
const track = $('track');
function layoutScroll() { track.style.height = (innerHeight * 4) + 'px'; }
function scrollU() { const m = document.documentElement.scrollHeight - innerHeight; return 1 + 3 * (m > 0 ? clamp01(scrollY / m) : 0); }
addEventListener('scroll', () => { st.scrollU = scrollU(); }, { passive: true });
dots.forEach((d, i) => d.addEventListener('click', () => { scrollTo({ top: i * innerHeight, behavior: 'smooth' }); if (i === 0) st.auto = 1; }));
$('cue').addEventListener('click', () => { const i = Math.min(3, Math.floor(st.uv + 0.5)); scrollTo({ top: i * innerHeight, behavior: 'smooth' }); });
addEventListener('pointermove', (e) => { st.ptr.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1)); });
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), lx: e.clientX, spin: false }; unlockVideo(); });
// sideways drag turns the cabinet while it is out of the board; it settles back when let go
addEventListener('pointermove', (e) => {
  if (!down || Math.abs(st.uv - 2) > 0.3) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  if (!down.spin && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) down.spin = true;
  if (down.spin) { st.spin = Math.max(-0.85, Math.min(0.85, st.spin + (e.clientX - down.lx) / Math.min(innerWidth, 900) * 2.6)); turnShown = false; }
  down.lx = e.clientX;
});
addEventListener('pointerup', () => { if (down && down.spin) down = null; });
addEventListener('pointercancel', () => { down = null; });
canvas.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && performance.now() - down.t < 500) tapSwitch(); down = null; });
addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) st.ptr.set(t.clientX / innerWidth * 2 - 1, -(t.clientY / innerHeight * 2 - 1)); }, { passive: true });
addEventListener('keydown', (e) => { if (e.key === ' ' && e.target === document.body) { e.preventDefault(); tapSwitch(); } });
// contact sheet
const sheet = $('sheet');
const openSheet = (v) => { sheet.classList.toggle('open', v); sheet.setAttribute('aria-hidden', v ? 'false' : 'true'); if (v) $('sheet-close').focus(); };
$('start').addEventListener('click', () => openSheet(true));
$('sheet-close').addEventListener('click', () => openSheet(false));
sheet.addEventListener('click', (e) => { if (e.target === sheet) openSheet(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') openSheet(false); });

// ---------------------------------------------------------------- video: start muted inline; any tap unlocks it
function unlockVideo() { if (video.paused) video.play().catch(() => {}); }
video.play().catch(() => {});
setInterval(() => { if (!SHOT && video.paused && document.visibilityState === 'visible') video.play().catch(() => {}); }, 700);

// ---------------------------------------------------------------- loop
let started = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - st.last) / 1000); st.last = now;
  if (!SHOT) {
    st.time += dt;
    if (started) st.auto = Math.min(1, st.auto + dt / INTRO_S);
    const target = Math.max(st.auto, st.scrollU > 1.002 ? st.scrollU : st.auto);
    // the drone: a critically damped follow, quicker when far behind
    const k = 1 - Math.exp(-dt * (Math.abs(target - st.uv) > 0.3 ? 3.2 : 2.4));
    st.uv += (target - st.uv) * k;
    st.ptrS.lerp(st.ptr, 1 - Math.exp(-dt * 3));
    if (!(down && down.spin)) st.spin *= Math.exp(-dt * (Math.abs(st.uv - 2) > 0.3 ? 4.0 : 0.9));
    st.spinS += (st.spin - st.spinS) * (1 - Math.exp(-dt * 8));
    contentClock(dt);
  }
  st.u = st.uv;
  render(dt);
  overlay(st.uv);
  const fm = window.__probe.frames; fm.push(dt * 1000); if (dt > 0.04) (window.__probe.spikes = window.__probe.spikes || []).push([+(dt * 1000).toFixed(0), +st.uv.toFixed(3), +(performance.now() / 1000).toFixed(2)]); if (fm.length > 4000) fm.splice(0, 2000);
  adapt(dt);
}
// adaptive resolution: if the phone cannot hold 50 fps, render fewer pixels (never below 70%)
const adaptBuf = [];
function adapt(dt) {
  if (SHOT || qs.has('noadapt')) return;
  adaptBuf.push(dt * 1000); if (adaptBuf.length < 90) return;
  const s = adaptBuf.slice().sort((a, b) => a - b); const p90 = s[Math.floor(s.length * 0.9)]; adaptBuf.length = 0;
  if (p90 > 19 && size.scale > 0.7) { size.scale = Math.max(0.7, size.scale * 0.88); resize(); }
  else if (p90 > 26 && size.scale <= 0.7 && !st.low) st.low = true; // weak GPU: light maps and haze update less often
}

// ---------------------------------------------------------------- start
async function start() {
  try { await document.fonts.load('400 40px Michroma'); } catch (e) {}
  if (!logoImg.complete) await new Promise((r) => logoImg.addEventListener('load', r, { once: true }));
  logoTex.needsUpdate = true; drawPanels();
  resize(); addEventListener('resize', resize);
  st.scrollU = scrollU();
  // compile everything before the first frame so the opening does not stutter
  storyUniforms(1); placeCamera(1); renderer.compile(scene, camera);
  // the cabinet is hidden until the close-up: compile and draw it once now, or its first frame stalls mid-scroll
  st.uv = 2.0; storyUniforms(2.0); placeCamera(2.0); renderer.compile(scene, camera); renderer.compile(refl, rCam); render(0.016); st.uv = 0;
  // warm every pass once (programs compile on first use) so the opening does not stall on black
  render(0.016); st.uv = 0; render(0.016);
  st.last = performance.now(); started = true;
  document.body.classList.add('ready');
  requestAnimationFrame(frame);
}
start();

// ---------------------------------------------------------------- hooks for the proof tools
window.__d3 = {
  spin: () => st.spin,
  camAt(u) { st.ptrS.set(0, 0); const t = st.time; st.time = 0; storyUniforms(u); placeCamera(u); st.time = t;
    const q = camera.quaternion; return [camera.position.x, camera.position.y, camera.position.z, q.x, q.y, q.z, q.w, camT.distanceTo(camera.position)]; },
  stats: D3.stats, scene, camera, scale: () => +(size.scale * size.dpr / size.scale).toFixed(2) + 'x' + size.scale.toFixed(2),
  readRT(name) {
    const rt = { lmb: rtLMB, lmp: rtLMP, probe: rtProbe }[name];
    const a = new Uint16Array(rt.width * rt.height * 4); renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, a);
    const f = (h) => { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; return e === 0 ? s * m * 2 ** -24 : s * (1 + m / 1024) * 2 ** (e - 15); };
    let mx = 0, sum = 0; const rows = [];
    for (let y = 0; y < rt.height; y++) { let rs = 0; for (let x = 0; x < rt.width; x++) { const v = f(a[(y * rt.width + x) * 4 + 1]); mx = Math.max(mx, v); sum += v; rs += v; } rows.push(+(rs / rt.width).toFixed(5)); }
    return { w: rt.width, h: rt.height, max: mx, mean: sum / (rt.width * rt.height), rows: rt.height <= 8 ? rows : rows.filter((_, i) => i % 10 === 0) };
  },
  async shot(u, opts = {}) {
    st.uv = st.u = u; st.time = opts.time ?? 3.0;
    st.camOv = opts.cam || null;
    if (opts.ptr) st.ptrS.set(opts.ptr[0], opts.ptr[1]); else st.ptrS.set(0, 0);
    if (opts.vt !== undefined) { video.pause(); await new Promise((r) => { const done = () => r(); video.addEventListener('seeked', done, { once: true }); video.currentTime = opts.vt; setTimeout(done, 1500); }); }
    vtex.needsUpdate = true;
    st.page = opts.page ?? (u > 1.55 && u < 3.4 ? CLOSE_PAGE : 0); st.spin = st.spinS = opts.spin ?? 0; st.wiping = false; contentClock(0);
    for (let i = 0; i < 3; i++) { render(0.016); overlay(u); await new Promise((r) => requestAnimationFrame(r)); }
    render(0.016); overlay(u);
    return true;
  },
};
