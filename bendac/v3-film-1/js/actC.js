// Act 3, "Built to fit" (from sketch C). Time-driven: t goes 0 to 1 over the act; nothing here reads the scroll.
// It opens on act 2's last frame: the big screen's diodes fill the view, the screen falls back into the dark and one cabinet
// is left in front of you ("this screen is made of cabinets"). Then sketch C's story: the cabinet comes apart piece by piece,
// cabinets hang into a wall that plays Bendac's install time-lapse, and the wall re-forms as Google YouTube's staircase.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
const BX = window.BX;

BX.acts.C = function createActC() {
  const ov = document.getElementById('ovC');
  // ---------------------------------------------------------------- setup
  const RM = BX.reduced;
  const canvas = BX.canvas;
  const renderer = BX.renderer;

  const BG = new THREE.Color(0x040505);
  const scene = new THREE.Scene();
  scene.background = BG;
  scene.fog = new THREE.FogExp2(0x040505, 0.035);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.01, 120);
  scene.add(new THREE.HemisphereLight(0x9fb3c8, 0x050505, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xa8d8ff, 1.3); rim.position.set(4, 3, -4); scene.add(rim);
  const spill = new THREE.PointLight(0xffffff, 0, 14, 2); scene.add(spill);   // light the screens throw on metal

  const texLoader = new THREE.TextureLoader();
  const loadTex = (src) => { const t = texLoader.load(src); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  // the cabinet plays Bendac's AccuVision onboard footage (BMW M Motorsport simulator, seconds 19.3 to 23.6)
  // the first cabinet comes out of act 2's big screen, so it shows the same Home Park picture (top of the atlas video)
  const cabVideo = BX.video('v-venue');
  const testTex = BX.vtex('v-venue');
  const V_SPLIT = 160 / 880;
  const stairTex = loadTex('media/stair-risers.jpg');
  // the wall plays Bendac's install time-lapse (12.8 s clip: empty hall, truss, cabinets hung, wall lit)
  const video = BX.video('v-install');
  const vidTex = BX.vtex('v-install');
  const INSTALL_LEN = 12.8;

  // ---------------------------------------------------------------- world constants (metres)
  const CAB = 0.5, CAB_D = 0.075;                    // a 500 x 500 mm die-cast cabinet
  const COLS = 16, ROWS = 9;                         // flat wall: 8 m x 4.5 m, 16:9
  const WALL_Y = 0.6 + ROWS * CAB / 2;               // wall hangs 0.6 m off the floor
  const HERO_COL = 8, HERO_ROW = 4;
  const slotPos = (c, r) => new THREE.Vector3((c - (COLS - 1) / 2) * CAB, WALL_Y + ((ROWS - 1) / 2 - r) * CAB, 0);
  const HERO = slotPos(HERO_COL, HERO_ROW);
  const STEPS = 22, RISE = 0.185, GOING = 0.29, TREAD_T = 0.035, LED_H = RISE - TREAD_T, STAIR_COLS = 6, ZS = 1.4;
  const riserPos = (k, c) => new THREE.Vector3((c - (STAIR_COLS - 1) / 2) * CAB, RISE * k + LED_H / 2, ZS - GOING * k);
  const WALL_C = new THREE.Vector3(0, WALL_Y, 0);
  const STAIR_C = new THREE.Vector3(0, RISE * STEPS * 0.5, ZS - GOING * STEPS * 0.48);

  // ---------------------------------------------------------------- LED shading, shared by every lit surface
  const LED_GLSL = /* glsl */`
    // one LED surface: diodes on a black mask, resolving into the picture once each diode is smaller than a pixel
    vec3 ledSurface(vec2 uv, vec2 cells, vec2 mods, vec3 c, float lit, vec3 N, vec3 V, float modSize) {
      vec2 g = uv * cells; vec2 f = fract(g) - 0.5;
      float px = max(fwidth(g.x), fwidth(g.y));
      float d = length(f);
      c = pow(c, vec3(1.15));                             // LED punch: a touch more contrast than the source
      float diode = 1.0 - smoothstep(0.31 - px * 0.5, 0.31 + px * 0.5, d);
      float bloom = exp(-d * d * 10.0) * 0.6;
      float resolve = smoothstep(0.32, 0.8, px);
      vec3 emit = mix(c * (diode * 2.3 + bloom), c * 1.0, resolve) * lit;
      emit /= max(1.0, max(emit.r, max(emit.g, emit.b)));   // a bright diode clips without losing its colour
      float nv = clamp(dot(N, V), 0.0, 1.0);
      emit *= mix(0.4, 1.0, smoothstep(0.0, 0.55, nv));          // LEDs dim toward grazing angles
      float fres = pow(1.0 - nv, 5.0);
      vec3 mask = vec3(0.016, 0.017, 0.019) + vec3(0.12) * fres;   // matte black mask, sheen at grazing angles
      float pkg = (1.0 - smoothstep(0.24, 0.30, max(abs(f.x), abs(f.y)))) * (1.0 - resolve);
      mask += vec3(0.018) * pkg * (1.0 - lit);                    // unlit diode packages
      vec3 col = mask * (1.0 - diode * lit * (1.0 - resolve)) + emit;
      // module seams: a 0.6 mm physical gap, drawn at its true coverage so it fades with distance
      vec2 mg = uv * mods; vec2 toEdge = 0.5 - abs(fract(mg) - 0.5);
      vec2 mw = max(fwidth(mg), vec2(1e-5));
      float wphys = 0.0006 / modSize;
      vec2 cov = clamp(wphys / mw, 0.0, 1.0) * (1.0 - smoothstep(0.0, mw.x + wphys, toEdge));
      float seam = max(cov.x, cov.y);
      return col * (1.0 - 0.9 * seam);
    }`;

  // instanced cabinets (wall and staircase)
  const N_PIECES = COLS * ROWS;
  const faceMat = new THREE.ShaderMaterial({
    uniforms: { uVideo: { value: vidTex }, uStair: { value: stairTex }, uTest: { value: testTex }, uSplit: { value: V_SPLIT } },
    vertexShader: /* glsl */`
      attribute vec4 aWall; attribute vec4 aStair; attribute vec4 aState; attribute vec4 aCells;
      varying vec2 vUv; varying vec4 vWall; varying vec4 vStair; varying vec4 vState; varying vec4 vCells; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv; vWall = aWall; vStair = aStair; vState = aState; vCells = aCells;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix * instanceMatrix) * vec3(0.0, 0.0, 1.0));
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uVideo; uniform sampler2D uStair; uniform sampler2D uTest; uniform float uSplit;
      varying vec2 vUv; varying vec4 vWall; varying vec4 vStair; varying vec4 vState; varying vec4 vCells; varying vec3 vN; varying vec3 vV;
      ${LED_GLSL}
      void main() {
        vec2 cuv = (floor(vUv * vCells.xy) + 0.5) / vCells.xy;
        vec3 cw = texture2D(uVideo, vWall.xy + cuv * vWall.zw).rgb;
        vec3 cs = texture2D(uStair, vStair.xy + cuv * vStair.zw).rgb;
        vec3 ct = texture2D(uTest, vec2(cuv.x, mix(uSplit, 1.0, cuv.y))).rgb;
        // opening: every cabinet shows its own part of act 2's big-screen picture
        vec3 cv = texture2D(uTest, vec2(vWall.x + cuv.x * vWall.z, mix(uSplit, 1.0, vWall.y + cuv.y * vWall.w))).rgb;
        vec3 c = mix(mix(mix(cw, cs, vState.y), ct, vState.z), cv, vState.w);
        vec3 col = ledSurface(vUv, vCells.xy, vCells.zw, c, vState.x, normalize(vN), normalize(vV), 0.25);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const faceGeo = new THREE.PlaneGeometry(1, 1);
  const aWall = new Float32Array(N_PIECES * 4), aStair = new Float32Array(N_PIECES * 4), aState = new Float32Array(N_PIECES * 4), aCells = new Float32Array(N_PIECES * 4);
  faceGeo.setAttribute('aWall', new THREE.InstancedBufferAttribute(aWall, 4));
  faceGeo.setAttribute('aStair', new THREE.InstancedBufferAttribute(aStair, 4));
  const stateAttr = new THREE.InstancedBufferAttribute(aState, 4); stateAttr.setUsage(THREE.DynamicDrawUsage); faceGeo.setAttribute('aState', stateAttr);
  const cellsAttr = new THREE.InstancedBufferAttribute(aCells, 4); cellsAttr.setUsage(THREE.DynamicDrawUsage); faceGeo.setAttribute('aCells', cellsAttr);
  const faces = new THREE.InstancedMesh(faceGeo, faceMat, N_PIECES); faces.frustumCulled = false; scene.add(faces);

  const dieCast = new THREE.MeshStandardMaterial({ color: 0x121316, metalness: 0.5, roughness: 0.55, envMapIntensity: 0.25 });
  const frameGeo = new THREE.BoxGeometry(0.994, 0.994, 1); frameGeo.translate(0, 0, -0.503);   // body sits just behind its modules
  const bodies = new THREE.InstancedMesh(frameGeo, dieCast, N_PIECES); bodies.frustumCulled = false; scene.add(bodies);

  // pieces: each has a wall slot and (for 132 of them) a staircase slot
  const rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const pieces = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    const p = { i, c, r, wall: slotPos(c, r), hero: c === HERO_COL && r === HERO_ROW, stair: null, k: 0,
      start: null, startQ: null, rank: 0, color: new THREE.Color(), stairColor: new THREE.Color(), group: Math.min(3, Math.floor(c / 4)) + (r < 5 ? 0 : 4),
      pos: new THREE.Vector3(), q: new THREE.Quaternion(), size: new THREE.Vector3(CAB, CAB, CAB_D), lit: 0 };
    aWall.set([c / COLS, 1 - (r + 1) / ROWS, 1 / COLS, 1 / ROWS], i * 4);
    // they come off the floor in front of the wall, lying face up, as if lifted out of flight cases
    const out = p.wall.clone().sub(HERO); out.z = 0; if (out.lengthSq() < 1e-6) out.set(0, 1, 0); out.normalize();
    p.start = p.wall.clone().addScaledVector(out, 1.0 + rand() * 0.9).add(new THREE.Vector3(0, -0.15, 1.6 + rand() * 1.4));
    p.startQ = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.9, (rand() - 0.5) * 1.1, (rand() - 0.5) * 0.5));
    pieces.push(p);
  }
  // hang order: top row first, centre outwards (as in Bendac's own time-lapse, cabinets go up from the truss down)
  // build order: outward from the first cabinet, so the picture grows around it as the camera steps back
  pieces.forEach(p => { p.d = p.wall.distanceTo(HERO) + rand() * 0.35; });
  [...pieces].sort((a, b) => a.d - b.d).forEach((p, n) => { p.rank = n / (N_PIECES - 1); });
  // staircase: 22 risers x 6 cabinets; the 12 outermost upper cabinets are not needed and go back
  const extras = pieces.filter(p => (p.c === 0 || p.c === COLS - 1) && p.r < 6);
  const used = pieces.filter(p => !extras.includes(p)).sort((a, b) => (b.r - a.r) || (a.c - b.c));
  const stairSlots = []; for (let k = 0; k < STEPS; k++) for (let c = 0; c < STAIR_COLS; c++) stairSlots.push({ k, c });
  used.forEach((p, n) => {
    const s = stairSlots[n]; p.k = s.k; p.stair = riserPos(s.k, s.c);
    aStair.set([s.c / STAIR_COLS, (s.k + 0.1) / STEPS, 1 / STAIR_COLS, 0.8 / STEPS], p.i * 4);
  });
  extras.forEach(p => { p.k = -1; p.stair = p.wall.clone().add(new THREE.Vector3(0, -0.4, -2.5)); });
  faceGeo.attributes.aWall.needsUpdate = true; faceGeo.attributes.aStair.needsUpdate = true;

  // ---------------------------------------------------------------- the hero cabinet, modelled part by part
  function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  const pcbFront = canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#0b2418'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(70,120,90,.35)'; g.lineWidth = 1;
    for (let i = 0; i < 64; i += 3) { g.beginPath(); g.moveTo(0, i * 8 + 6.5); g.lineTo(w, i * 8 + 6.5); g.stroke(); }
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { g.fillStyle = '#6d5a35'; g.fillRect(x * 8 + 3, y * 8 + 3, 3, 3); }
    g.fillStyle = 'rgba(230,230,220,.75)'; for (const [x, y] of [[10, 10], [502, 10], [10, 502], [502, 502]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
  });
  const pcbBack = canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#0d2219'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(90,150,110,.28)'; g.lineWidth = 2;
    for (let i = 0; i < 26; i++) { g.beginPath(); const y = 20 + i * 19; g.moveTo(0, y); g.lineTo(140 + (i * 37) % 200, y); g.lineTo(170 + (i * 37) % 200, y + 14); g.lineTo(w, y + 14); g.stroke(); }
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {  // driver chips
      const x = 46 + c * 112, y = 60 + r * 112; g.fillStyle = '#111'; g.fillRect(x, y, 58, 26);
      g.fillStyle = '#9aa'; for (let k = 0; k < 8; k++) { g.fillRect(x + 4 + k * 7, y - 4, 3, 4); g.fillRect(x + 4 + k * 7, y + 26, 3, 4); }
    }
    g.fillStyle = '#e7e2d3'; g.fillRect(210, 230, 92, 30); g.fillStyle = '#222'; for (let k = 0; k < 8; k++) g.fillRect(216 + k * 10.5, 238, 6, 14);
    g.fillStyle = '#c9c9c9'; for (const [x, y] of [[30, 30], [482, 30], [30, 482], [482, 482]]) { g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); g.fillStyle = '#555'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.fillStyle = '#c9c9c9'; }
  });

  const hero = new THREE.Group(); hero.position.copy(HERO); scene.add(hero);
  const heroSpin = new THREE.Group(); hero.add(heroSpin);
  const MOD = 0.2492;
  const FAN = [0.24, 0.12, 0.04];   // layers fan out sideways as they lift, so the lit diodes are never hidden behind the mask                                  // 4 modules of 250 mm, with a hairline seam
  const quads = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
  const layer = { mask: [], diodes: [], board: [] };

  const heroMaskMat = new THREE.ShaderMaterial({
    uniforms: { uTest: { value: testTex }, uHoles: { value: 0 }, uLit: { value: 1 }, uBehind: { value: 1 }, uRg: { value: new THREE.Vector4(0, 0, 1, 1) }, uSplit: { value: V_SPLIT }, uCellsH: { value: 128 } },
    vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vN; varying vec3 vV; attribute vec2 uvCab;
      void main(){ vUv = uvCab; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`uniform sampler2D uTest; uniform float uHoles; uniform float uLit; uniform float uBehind; uniform vec4 uRg; uniform float uSplit; uniform float uCellsH; vec2 rgUV(vec2 u){ vec2 q = uRg.xy + u * uRg.zw; return vec2(q.x, mix(uSplit, 1.0, q.y)); } varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      ${LED_GLSL}
      void main(){
        vec2 cells = vec2(uCellsH); vec2 g = vUv * cells; vec2 f = fract(g) - 0.5; float px = max(fwidth(g.x), fwidth(g.y));
        // exploded: the mask is a black louvred plate with a hole over every diode
        if (uHoles > 0.5) {
          float d = length(f);
          float hr = 0.30 * (1.0 - smoothstep(0.22, 0.42, px));   // holes too small to resolve close up instead of shimmering
          if (uBehind < 0.5 && d < hr) discard;
          float nv = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
          float louvre = smoothstep(-0.5, -0.1, f.y) * (1.0 - smoothstep(-0.1, 0.0, f.y));
          vec3 m = vec3(0.008) + vec3(0.025) * louvre * (1.0 - smoothstep(0.3, 0.9, px)) + vec3(0.06) * pow(1.0 - nv, 5.0);
          // while the mask still sits on the diodes their light comes through it; it goes dark as it lifts away
          vec3 c = texture2D(uTest, rgUV((floor(g) + 0.5) / cells)).rgb;
          vec3 lit = ledSurface(vUv, cells, vec2(2.0), c, uLit, normalize(vN), normalize(vV), 0.25);
          gl_FragColor = vec4(mix(m, lit, uBehind), 1.0);
        } else {
          vec3 c = texture2D(uTest, rgUV((floor(g) + 0.5) / cells)).rgb;
          gl_FragColor = vec4(ledSurface(vUv, cells, vec2(2.0), c, uLit, normalize(vN), normalize(vV), 0.25), 1.0);
        }
        #include <colorspace_fragment>
      }`,
  });
  const diodeMat = new THREE.ShaderMaterial({
    uniforms: { uTest: { value: testTex }, uAlpha: { value: 0 }, uRg: { value: new THREE.Vector4(0, 0, 1, 1) }, uSplit: { value: V_SPLIT }, uCellsH: { value: 128 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`varying vec2 vUv; attribute vec2 uvCab; void main(){ vUv = uvCab; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`uniform sampler2D uTest; uniform float uAlpha; uniform vec4 uRg; uniform float uSplit; uniform float uCellsH; vec2 rgUV(vec2 u){ vec2 q = uRg.xy + u * uRg.zw; return vec2(q.x, mix(uSplit, 1.0, q.y)); } varying vec2 vUv;
      void main(){
        vec2 cells = vec2(uCellsH); vec2 g = vUv * cells; vec2 f = fract(g) - 0.5; float px = max(fwidth(g.x), fwidth(g.y));
        vec3 c = texture2D(uTest, rgUV((floor(g) + 0.5) / cells)).rgb * 0.85 + 0.06;
        float d = length(f);
        float dot_ = 1.0 - smoothstep(0.17 - px * 0.6, 0.17 + px * 0.6, d);
        float halo = exp(-d * d * 22.0) * 0.5;
        float body = (1.0 - smoothstep(0.26, 0.29 + px, max(abs(f.x), abs(f.y)))) * 0.06;   // the square SMD package
        float far = smoothstep(0.35, 0.9, px);
        vec3 col = mix(c * (dot_ * 2.0 + halo) + body, c * 0.8, far) * uAlpha;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.7, metalness: 0.1 });
  const pcbEdge = new THREE.MeshStandardMaterial({ color: 0x173826, roughness: 0.6 });
  const boardMats = [pcbEdge, pcbEdge, pcbEdge, pcbEdge,
    new THREE.MeshStandardMaterial({ map: pcbFront, roughness: 0.55, metalness: 0.15, envMapIntensity: 0.5 }),
    new THREE.MeshStandardMaterial({ map: pcbBack, roughness: 0.6, metalness: 0.1, envMapIntensity: 0.4 })];
  function quadUv(geo, qx, qy) {  // map each module's own 0..1 uvs into the cabinet's 0..1 space
    const uv = geo.attributes.uv, out = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) { out[i * 2] = (qx < 0 ? 0 : 0.5) + uv.getX(i) * 0.5; out[i * 2 + 1] = (qy < 0 ? 0 : 0.5) + uv.getY(i) * 0.5; }
    geo.setAttribute('uvCab', new THREE.BufferAttribute(out, 2)); return geo;
  }
  for (const [qx, qy] of quads) {
    const mg = quadUv(new THREE.BoxGeometry(MOD, MOD, 0.003), qx, qy);
    const mask = new THREE.Mesh(mg, [edgeMat, edgeMat, edgeMat, edgeMat, heroMaskMat, edgeMat]);
    mask.userData = { qx, qy }; heroSpin.add(mask); layer.mask.push(mask);
    const dg = quadUv(new THREE.PlaneGeometry(MOD, MOD), qx, qy);
    const di = new THREE.Mesh(dg, diodeMat); di.userData = { qx, qy }; di.renderOrder = 2; heroSpin.add(di); layer.diodes.push(di);
    const bd = new THREE.Mesh(new THREE.BoxGeometry(MOD, MOD, 0.0016), boardMats); bd.userData = { qx, qy }; heroSpin.add(bd); layer.board.push(bd);
  }
  // die-cast frame: rim, ribs, control box, handles, locks, locating pins
  const frameG = new THREE.Group(); heroSpin.add(frameG);
  const castMat = new THREE.MeshStandardMaterial({ color: 0x151619, metalness: 0.55, roughness: 0.48, envMapIntensity: 0.8 });
  const castLight = new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.7, roughness: 0.35, envMapIntensity: 1.0 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9da3a8, metalness: 0.95, roughness: 0.28, envMapIntensity: 1.2 });
  const addBox = (w, h, d, x, y, z, mat = castMat, rz = 0, round = 0) => {
    const m = new THREE.Mesh(round ? new RoundedBoxGeometry(w, h, d, 2, round) : new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.z = rz; frameG.add(m); return m; };
  const T = 0.012, FZ0 = -0.006, FD = CAB_D - 0.006, fz = FZ0 - FD / 2;
  addBox(CAB, T, FD, 0, CAB / 2 - T / 2, fz); addBox(CAB, T, FD, 0, -CAB / 2 + T / 2, fz);
  addBox(T, CAB - 2 * T, FD, -CAB / 2 + T / 2, 0, fz); addBox(T, CAB - 2 * T, FD, CAB / 2 - T / 2, 0, fz);
  const ribD = 0.042, ribZ = FZ0 - 0.004 - ribD / 2;
  addBox(CAB - 2 * T, 0.009, ribD, 0, 0, ribZ); addBox(0.009, CAB - 2 * T, ribD, 0, 0, ribZ);
  const diag = Math.hypot(CAB - 2 * T, CAB - 2 * T);
  addBox(diag, 0.008, ribD * 0.8, 0, 0, ribZ, castMat, Math.PI / 4); addBox(diag, 0.008, ribD * 0.8, 0, 0, ribZ, castMat, -Math.PI / 4);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.005, 6, 48), castMat); ring.position.z = ribZ; ring.scale.z = 4; frameG.add(ring);
  const boxZ = -CAB_D + 0.004;
  addBox(0.21, 0.15, 0.05, 0, -0.02, boxZ, castLight, 0, 0.006);                 // receiving card and power box
  for (let k = 0; k < 7; k++) addBox(0.004, 0.11, 0.008, -0.075 + k * 0.025, -0.02, boxZ - 0.029, castLight);   // cooling fins
  for (const x of [-0.07, -0.035]) { const cn = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.018, 20), steel); cn.rotation.x = Math.PI / 2; cn.position.set(x, -0.075, boxZ - 0.033); frameG.add(cn); }
  for (const x of [0.035, 0.07]) addBox(0.016, 0.013, 0.012, x, -0.075, boxZ - 0.03, new THREE.MeshStandardMaterial({ color: 0x777b80, metalness: 0.6, roughness: 0.4 }));
  for (const x of [-0.13, 0.13]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.0055, 8, 20, Math.PI), castLight); h.rotation.set(Math.PI / 2, 0, 0); h.position.set(x, 0.175, -CAB_D); frameG.add(h); }
  for (const s of [-1, 1]) for (const y of [-0.13, 0.13]) { addBox(0.012, 0.05, 0.026, s * (CAB / 2 + 0.006), y, -0.04, castLight); addBox(0.006, 0.012, 0.012, s * (CAB / 2 + 0.014), y + 0.012, -0.03, steel); }
  for (const x of [-0.19, 0.19]) { const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.016, 12), steel); pin.position.set(x, CAB / 2 + 0.008, -0.04); frameG.add(pin); }

  // ---------------------------------------------------------------- staircase parts (treads, side panels, handrails), truss
  const treadMat = new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.82, metalness: 0.1 });
  const nosingMat = new THREE.MeshStandardMaterial({ color: 0xa9aca9, roughness: 0.32, metalness: 0.9, envMapIntensity: 1.0 });
  const treads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), treadMat, STEPS);
  const nosings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), nosingMat, STEPS);
  scene.add(treads, nosings);
  const STAIR_W = STAIR_COLS * CAB + 0.06;
  const slopeLen = Math.hypot(GOING * STEPS, RISE * STEPS), slopeA = Math.atan2(RISE * STEPS, GOING * STEPS);
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.85, metalness: 0.05, transparent: true, opacity: 0 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.4, metalness: 0.8, transparent: true, opacity: 0 });
  const stairDeco = new THREE.Group(); scene.add(stairDeco);
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, slopeLen + 0.6), sideMat);
    panel.position.set(s * (STAIR_W / 2 + 0.03), RISE * STEPS / 2 + 0.25, ZS - GOING * STEPS / 2); panel.rotation.x = slopeA; stairDeco.add(panel);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, slopeLen + 0.4, 12), railMat);
    rail.rotation.x = slopeA - Math.PI / 2; rail.position.set(s * (STAIR_W / 2 - 0.07), RISE * STEPS / 2 + 0.95, ZS - GOING * STEPS / 2 + 0.05); stairDeco.add(rail);
  }
  // box truss goal post, like the one in the time-lapse
  const trussMat = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 0.92, roughness: 0.33, envMapIntensity: 1.0, transparent: true });
  const segs = [];
  function trussRun(a, b, size = 0.29) {  // a square box truss from a to b: 4 chords and zigzag braces
    const dir = b.clone().sub(a); const L = dir.length(); dir.normalize();
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(size / 2), v = new THREE.Vector3().crossVectors(dir, u).normalize().multiplyScalar(size / 2);
    const corners = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), u.clone().negate().add(v)];
    for (const cn of corners) segs.push([a.clone().add(cn), b.clone().add(cn), 0.024]);
    const n = Math.round(L / size);
    for (let f = 0; f < 4; f++) { const c0 = corners[f], c1 = corners[(f + 1) % 4];
      for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; const p0 = a.clone().lerp(b, t0).add(i % 2 ? c0 : c1), p1 = a.clone().lerp(b, t1).add(i % 2 ? c1 : c0); segs.push([p0, p1, 0.009]); } }
  }
  const TW = COLS * CAB / 2 + 0.45, TH = WALL_Y + ROWS * CAB / 2 + 0.45, TZ = -0.25;
  trussRun(new THREE.Vector3(-TW, 0, TZ), new THREE.Vector3(-TW, TH, TZ));
  trussRun(new THREE.Vector3(TW, 0, TZ), new THREE.Vector3(TW, TH, TZ));
  trussRun(new THREE.Vector3(-TW - 0.15, TH, TZ), new THREE.Vector3(TW + 0.15, TH, TZ));
  const truss = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), trussMat, segs.length);
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    segs.forEach(([a, b, r], i) => { const d = b.clone().sub(a); q.setFromUnitVectors(Y, d.clone().normalize()); m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(r, d.length(), r)); truss.setMatrixAt(i, m); }); }
  const trussG = new THREE.Group(); trussG.add(truss); scene.add(trussG);

  // ---------------------------------------------------------------- floor that catches the screens' light
  const N_EM = 8;
  const emP = Array.from({ length: N_EM }, () => new THREE.Vector3()), emC = Array.from({ length: N_EM }, () => new THREE.Vector3()), emN = Array.from({ length: N_EM }, () => new THREE.Vector3(0, 0, 1));
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uEP: { value: emP }, uEC: { value: emC }, uEN: { value: emN }, uBg: { value: new THREE.Vector3(BG.r, BG.g, BG.b) }, uFog: { value: 0.035 }, uGrid: { value: 1 } },
    vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uEP[${N_EM}]; uniform vec3 uEC[${N_EM}]; uniform vec3 uEN[${N_EM}]; uniform vec3 uBg; uniform float uFog; uniform float uGrid;
      varying vec3 vW;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
        vec3 diff = vec3(0.0), spec = vec3(0.0);
        for (int i = 0; i < ${N_EM}; i++) {
          vec3 L = uEP[i] - vW; float d2 = dot(L, L); vec3 Ln = L * inversesqrt(d2);
          float cosE = max(dot(uEN[i], -Ln), 0.0);
          diff += uEC[i] * cosE * max(Ln.y, 0.0) / (d2 + 0.6);
          spec += uEC[i] * cosE * pow(max(dot(R, Ln), 0.0), 60.0) / (1.0 + d2 * 0.08);
        }
        vec3 col = vec3(0.0035) + diff * 0.055 + spec * 0.05;          // polished concrete
        vec2 gg = abs(fract(vW.xz * 2.0 + 0.5) - 0.5) / fwidth(vW.xz * 2.0);
        float line = 1.0 - min(min(gg.x, gg.y), 1.0);
        col += vec3(0.010, 0.013, 0.012) * line * uGrid * exp(-length(vW.xz - cameraPosition.xz) * 0.08);
        float fd = length(vW - cameraPosition);
        col = mix(col, uBg, 1.0 - exp(-uFog * uFog * fd * fd));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat); floor.rotation.x = -Math.PI / 2; scene.add(floor);

  // ---------------------------------------------------------------- colours each surface emits (for the floor and the spill light)
  const lin = (v) => Math.pow(v / 255, 2.2);
  const sampler = document.createElement('canvas'); sampler.width = COLS; sampler.height = ROWS;
  const sctx = sampler.getContext('2d', { willReadFrequently: true });
  const testAvg = new THREE.Color(0.3, 0.3, 0.3);
  const imgAvg = (src, w, h, fn) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(im, 0, 0, w, h); fn(x.getImageData(0, 0, w, h).data); }; im.src = src; };
  const avgCanvas = document.createElement('canvas'); avgCanvas.width = avgCanvas.height = 1; const actx = avgCanvas.getContext('2d', { willReadFrequently: true });
  // colours come from a table made offline (tools/m5-colors.py), looked up by the video's own clock: no pixel read-back
  const COL = BX.colors, insBytes = Uint8Array.from(atob(COL.install), (ch) => ch.charCodeAt(0));
  function sampleCabinet() { const f = COL.venue[Math.floor(cabVideo.currentTime * COL.fps) % COL.venue.length]; testAvg.setRGB(lin(f[0]), lin(f[1]), lin(f[2])); }
  imgAvg('media/stair-risers.jpg', STAIR_COLS, STEPS, (d) => { used.forEach((p, n) => { const s = stairSlots[n]; const j = ((STEPS - 1 - s.k) * STAIR_COLS + s.c) * 4; p.stairColor.setRGB(lin(d[j]), lin(d[j + 1]), lin(d[j + 2])); }); });
  function sampleVideo() {
    const k = Math.min(COL.installFrames - 1, Math.floor(video.currentTime * COL.fps)) * COLS * ROWS * 3;
    for (const p of pieces) { const j = k + (p.r * COLS + p.c) * 3; p.color.setRGB(lin(insBytes[j]), lin(insBytes[j + 1]), lin(insBytes[j + 2])); }
  }

  // ---------------------------------------------------------------- scroll, story timeline and camera
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const easeOutBack = (t) => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const lerp = (a, b, t) => a + (b - a) * t;

  // camera stops: target, yaw, pitch, size of what must fit in the free part of the screen (w, h)
  const K = [
    { p: 0.00, t: HERO.clone(), yaw: 0.50, pitch: 0.10, w: 0.56, h: 0.56 },
    { p: 0.05, t: HERO.clone(), yaw: 0.50, pitch: 0.10, w: 0.56, h: 0.56 },
    { p: 0.23, t: HERO.clone().add(new THREE.Vector3(0.0, -0.03, 0.22)), yaw: 1.0, pitch: 0.26, w: 1.05, h: 0.95 },
    { p: 0.30, t: HERO.clone().add(new THREE.Vector3(0.0, -0.03, 0.22)), yaw: 1.06, pitch: 0.26, w: 1.05, h: 0.95 },
    { p: 0.38, t: HERO.clone(), yaw: 0.16, pitch: 0.05, w: 0.72, h: 0.72 },
    { p: 0.55, t: WALL_C.clone().add(new THREE.Vector3(0, -0.15, 0)), yaw: 0.10, pitch: 0.05, w: 9.0, h: 6.2 },
    { p: 0.70, t: WALL_C.clone().add(new THREE.Vector3(0, -0.15, 0)), yaw: -0.07, pitch: 0.04, w: 9.0, h: 6.2 },
    { p: 0.87, t: STAIR_C.clone(), yaw: -0.04, pitch: -0.03, w: 3.9, h: 4.7 },
    { p: 1.00, t: STAIR_C.clone(), yaw: 0.06, pitch: -0.03, w: 3.9, h: 4.7 },
    { p: 1.19, t: STAIR_C.clone().add(new THREE.Vector3(0, 0.5, 0)), yaw: 0.14, pitch: 0.02, w: 4.6, h: 5.6 },
  ];
  let W = BX.size.w, H = BX.size.h, phone = W < 900;
  // The free part of the screen, measured from the real copy blocks: on a phone the words own the bottom,
  // on desktop the right. The 3D subject is framed inside what is left, so it never sits under the words.
  const FREE = { top: 60, bottom: 600, fx: 0.86, fy: 0.62, reserve: -1, shift: -1 };
  function measureFree() {
    const fh = document.getElementById('fhead'); FREE.top = fh.offsetTop + fh.offsetHeight + 10;
    let copyTop = H;
    ov.querySelectorAll('.copy').forEach((el) => { copyTop = Math.min(copyTop, H - parseFloat(getComputedStyle(el).bottom) - el.offsetHeight); });
    FREE.bottom = phone ? copyTop - 40 : H - 24;   // 40 px: a clear gap above the words, the drag hint sits in it
    FREE.reserve = -1;
  }
  function applyView(reserve, shift = 0, blend = 1) {   // reserve: room under the subject for the exploded-view labels; shift: desktop subject to the right for the closing screen
    if (Math.abs(reserve - FREE.reserve) < 0.5 && Math.abs(shift - FREE.shift) < 0.002 && Math.abs(blend - FREE.blend) < 0.002) return; FREE.reserve = reserve; FREE.shift = shift; FREE.blend = blend;
    if (phone) {
      const bottom = FREE.bottom - reserve, cy = (FREE.top + bottom) / 2;
      camera.setViewOffset(W, H, 0, (H / 2 - cy) * blend, W, H); FREE.fy = (bottom - FREE.top) / H * 0.96; FREE.fx = 0.86;
      hint.style.top = `${Math.round(FREE.bottom + 12)}px`;
    } else { camera.setViewOffset(W, H, W * (0.15 - 0.38 * shift) * blend, 0, W, H); FREE.fy = 0.7; FREE.fx = 0.56; hint.style.top = ''; }
    camera.updateProjectionMatrix();
  }
  function layout() {
    W = BX.size.w; H = BX.size.h; phone = W < 900;
    camera.aspect = W / H;
    measureFree(); applyView(0, FREE.shift > 0 ? FREE.shift : 0);
  }
  const hint = document.getElementById('c-hint');
  layout();
  const fitDist = (w, h) => {
    const fov = THREE.MathUtils.degToRad(camera.fov), tanV = Math.tan(fov / 2), aspect = W / H;
    return Math.max(h / (2 * tanV * FREE.fy), w / (2 * tanV * aspect * FREE.fx));
  };
  const camT = new THREE.Vector3();
  function cameraAt(p, out) {
    let i = 0; while (i < K.length - 2 && p > K[i + 1].p) i++;
    const a = K[i], b = K[i + 1]; const s = smoother(clamp01((p - a.p) / (b.p - a.p)));
    camT.lerpVectors(a.t, b.t, s);
    const yaw = lerp(a.yaw, b.yaw, s) + drag.camYaw, pitch = lerp(a.pitch, b.pitch, s) + drag.camPitch;
    const d = Math.exp(lerp(Math.log(fitDist(a.w, a.h)), Math.log(fitDist(b.w, b.h)), s));
    out.set(camT.x + Math.sin(yaw) * Math.cos(pitch) * d, camT.y + Math.sin(pitch) * d, camT.z + Math.cos(yaw) * Math.cos(pitch) * d);
    return camT;
  }

  let cur = 0;                              // story progress, set from the act's t every frame
  const STORY = 1;

  // ---------------------------------------------------------------- finger and cursor
  const drag = { on: false, x: 0, y: 0, vx: 0, vy: 0, heroYaw: 0, heroPitch: 0, camYaw: 0, camPitch: 0, used: false, px: 0, py: 0 };
  canvas.addEventListener('pointerdown', (e) => { if (!active) return; drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.vx = drag.vy = 0; canvas.classList.add('dragging'); try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or lost pointer */ } });
  canvas.addEventListener('pointermove', (e) => {
    if (!active) return;
    drag.px = e.clientX / W * 2 - 1; drag.py = e.clientY / H * 2 - 1;
    if (!drag.on) return;
    const dx = (e.clientX - drag.x) / Math.min(W, 700) * 3.2, dy = (e.clientY - drag.y) / Math.min(W, 700) * 3.2;
    drag.x = e.clientX; drag.y = e.clientY; drag.vx = dx; drag.vy = e.pointerType === 'touch' ? 0 : dy;
    applyDrag(dx, e.pointerType === 'touch' ? 0 : dy);
    if (Math.abs(dx) > 0.02) drag.used = true;
  });
  const endDrag = () => { drag.on = false; canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag); canvas.addEventListener('pointerleave', () => { if (drag.on) endDrag(); });
  function applyDrag(dx, dy) {
    if (cur / STORY < 0.33) { drag.heroYaw += dx; drag.heroPitch = THREE.MathUtils.clamp(drag.heroPitch + dy, -0.9, 0.9); }
    else { drag.camYaw = THREE.MathUtils.clamp(drag.camYaw - dx * 0.45, -0.5, 0.5); drag.camPitch = THREE.MathUtils.clamp(drag.camPitch + dy * 0.25, -0.12, 0.2); }
  }

  // ---------------------------------------------------------------- per-frame story
  const tags = [...ov.querySelectorAll('.tag')];
  const lines = document.getElementById('c-lines');
  const lineEls = tags.map(() => { const ns = 'http://www.w3.org/2000/svg'; const line = document.createElementNS(ns, 'line'), dot = document.createElementNS(ns, 'circle'); dot.setAttribute('r', 2.5); lines.append(line, dot); return { line, dot }; });
  const copies = [...ov.querySelectorAll('.copy')];
  const m4 = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), ident = new THREE.Quaternion();
  const sizeWall = new THREE.Vector3(CAB, CAB, CAB_D), sizeStair = new THREE.Vector3(CAB, LED_H, 0.06);
  let frameN = 0, active = false, playing = true, tO = 1;
  const OPEN = 0.085, HERO_RG = [HERO_COL / COLS, 1 - (HERO_ROW + 1) / ROWS, 1 / COLS, 1 / ROWS];
  const openT = new THREE.Vector3(), openDir = new THREE.Vector3();
  const camPos = new THREE.Vector3();

  function frame(t, dtIn, time, ptrIn, isPlaying) {
    const dt = Math.min(0.05, dtIn); frameN++; playing = isPlaying;
    // the act: 0 to 0.1 the cabinet is pulled out of act 2's big screen; then sketch C's story runs from 0 to 1.04
    tO = BX.clamp01(t / OPEN);
    cur = Math.max(0, (t - OPEN) / (1 - OPEN)) * 1.04;
    const p = cur / STORY;                       // story progress; above 1 the camera keeps drifting while the close fades in
    const endT = 0;

    // drag inertia; the hero lets go of its spin once it heads for the wall, the camera springs back
    if (!drag.on) { if (Math.abs(drag.vx) > 1e-4) { applyDrag(drag.vx, drag.vy); drag.vx *= 0.92; drag.vy *= 0.92; } drag.camYaw *= 0.94; drag.camPitch *= 0.94; }
    const heroFree = 1 - sstep(0.30, 0.40, p);
    // whatever angle the visitor left it at, the cabinet turns back to face the camera for the exploded view and the wall
    // when let go it comes to rest at a three-quarter view of the front or the back, never edge-on
    const settle = Math.max(1 - heroFree, sstep(0.05, 0.16, p));
    if (!drag.on && Math.abs(drag.vx) < 0.006) {
      drag.heroYaw = Math.atan2(Math.sin(drag.heroYaw), Math.cos(drag.heroYaw));
      let goal = 0;
      if (settle <= 0) { let best = 9; for (const r of [0, 1.0, Math.PI, -Math.PI, 1 - Math.PI]) { const dd = Math.abs(drag.heroYaw - r); if (dd < best) { best = dd; goal = r; } } }
      const k = 1 - Math.exp(-dt * (settle > 0 ? 5 * settle + 2 : 4));
      drag.heroYaw += (goal - drag.heroYaw) * k; drag.heroPitch -= drag.heroPitch * k * 0.5;
    }

    // ---- 1. the cabinet, then its layers
    const e = RM ? (p > 0.1 && p < 0.33 ? 1 : 0) : sstep(0.07, 0.22, p) * (1 - sstep(0.30, 0.37, p));
    const idle = RM ? 0 : Math.sin(time * 0.45) * 0.10 * (1 - e) * heroFree;
    const parallax = (!phone && !RM) ? drag.px * 0.06 : 0;
    const openFree = sstep(0.55, 1, tO);
    heroSpin.rotation.set(drag.heroPitch * heroFree * openFree, ((drag.heroYaw + idle) * heroFree + parallax * heroFree) * openFree, 0);
    // its picture grows from its own part of the big screen to the whole frame as it comes out
    const kr = sstep(0.3, 0.9, tO);
    heroMaskMat.uniforms.uRg.value.set(lerp(HERO_RG[0], 0, kr), lerp(HERO_RG[1], 0, kr), lerp(HERO_RG[2], 1, kr), lerp(HERO_RG[3], 1, kr));
    diodeMat.uniforms.uRg.value.copy(heroMaskMat.uniforms.uRg.value);
    heroMaskMat.uniforms.uCellsH.value = diodeMat.uniforms.uCellsH.value = lerp(50, 128, sstep(0.2, 0.8, tO));
    const fe = sstep(0, 0.45, e);   // the sideways fan leads the lift, so the mask slides off the diodes first
    heroMaskMat.uniforms.uHoles.value = e > 0.02 ? 1 : 0;
    heroMaskMat.uniforms.uBehind.value = 1 - sstep(0.04, 0.32, e);
    diodeMat.uniforms.uAlpha.value = e > 0.02 ? 0.75 + 0.25 * sstep(0.02, 0.3, e) : 0;
    for (const m of layer.mask) m.position.set(-FAN[0] * fe + m.userData.qx * (MOD / 2 + 0.0004 + 0.03 * e), m.userData.qy * (MOD / 2 + 0.0004 + 0.03 * e), -0.0015 + 0.48 * e);
    for (const m of layer.diodes) { m.position.set(-FAN[1] * fe + m.userData.qx * (MOD / 2 + 0.0004 + 0.03 * e), m.userData.qy * (MOD / 2 + 0.0004 + 0.03 * e), -0.0032 + 0.32 * e); m.visible = e > 0.02; }
    for (const m of layer.board) m.position.set(-FAN[2] * fe + m.userData.qx * (MOD / 2 + 0.0004 + 0.03 * e), m.userData.qy * (MOD / 2 + 0.0004 + 0.03 * e), -0.0042 + 0.16 * e);
    const swap = p >= 0.555;            // the detailed cabinet hands over to its slot in the wall
    hero.visible = !swap;

    // ---- 2. cabinets lift off the floor and hang, top row first; 3. power on from the first cabinet outward
    const pD = clamp01((p - 0.345) / (0.545 - 0.345));
    const pF = clamp01((p - 0.70) / (0.865 - 0.70));
    let anyLit = false;
    for (const pc of pieces) {
      let s = 0, lit = 0, stairMix = 0, tc = 0, scale = 1;
      const wallLit = 1;
      if (pc.hero) {
        pc.pos.copy(pc.wall); pc.q.identity(); scale = swap ? 1 : 0; tc = 1 - sstep(0.555, 0.6, p); lit = 1;
      } else {
        const t = clamp01((pD - pc.rank * 0.72) / 0.28);
        if (RM) { pc.pos.copy(pc.wall); pc.q.identity(); scale = sstep(0, 0.5, t); }
        else {
          const k = easeOutBack(t), k2 = smoother(t);
          pc.pos.lerpVectors(pc.start, pc.wall, k2); pc.pos.z = lerp(pc.start.z, pc.wall.z, k);
          pc.q.slerpQuaternions(pc.startQ, ident, sstep(0.15, 0.85, t));
          scale = t > 0 ? 1 : 0;
        }
        lit = RM ? (t >= 1 ? 1 : 0) : sstep(0.78, 1.0, t);   // each cabinet powers on as it locks into place
      }
      pc.size.copy(sizeWall);
      if (pF > 0) {   // re-form into the staircase, bottom riser first
        const t = pc.k < 0 ? clamp01(pF / 0.5) : clamp01((pF - (pc.k / (STEPS - 1)) * 0.68) / 0.32);
        if (t > 0) {
          if (pc.k < 0) { pc.pos.lerpVectors(pc.wall, pc.stair, smoother(t)); scale = 1 - sstep(0.3, 1, t); lit = wallLit * (1 - sstep(0, 0.1, t)); }
          else if (RM) { const out = t < 0.5; pc.pos.copy(out ? pc.wall : pc.stair); scale = out ? 1 - sstep(0, 0.5, t) : sstep(0.5, 1, t); pc.size.lerpVectors(sizeWall, sizeStair, out ? 0 : 1); lit = out ? wallLit : 1; stairMix = out ? 0 : 1; tc = 0; }
          else {
            const k = smoother(t);
            pc.pos.lerpVectors(pc.wall, pc.stair, k); pc.pos.z += Math.sin(Math.PI * t) * 0.9; pc.pos.y += Math.sin(Math.PI * t) * 0.15;
            tmpQ.setFromEuler(new THREE.Euler(0, Math.sin(Math.PI * t) * 0.5 * (pc.c % 2 ? 1 : -1), 0)); pc.q.copy(tmpQ);
            pc.size.lerpVectors(sizeWall, sizeStair, sstep(0.2, 0.8, t));
            // the picture travels with each cabinet and turns into the staircase's own content mid-flight
            lit = (t < 0.5 ? wallLit : 1) * (1 - 0.75 * Math.exp(-Math.pow((t - 0.5) / 0.09, 2)));
            stairMix = t > 0.5 ? 1 : 0; tc = 0;
          }
        }
      }
      let open = 0;
      if (tO < 1 && !pc.hero) { // the rest of the big screen powers down and falls back into the dark
        const kz = sstep(0.12, 0.85, tO);
        pc.pos.copy(pc.wall); pc.pos.z -= 2.2 * kz * kz; pc.q.identity(); pc.size.copy(sizeWall);
        scale = 1 - sstep(0.75, 1.0, tO); lit = 1 - sstep(0.15, 0.6, tO); open = 1; stairMix = 0; tc = 0;
      }
      pc.lit = lit * (scale > 0.01 ? 1 : 0);
      if (pc.lit > 0.01) anyLit = true;
      // frame box + LED face
      tmpV.set(pc.size.x * scale, pc.size.y * scale, pc.size.z * scale);
      m4.compose(pc.pos, pc.q, tmpV); bodies.setMatrixAt(pc.i, m4);
      tmpV.z = 1; const off = new THREE.Vector3(0, 0, 0.001).applyQuaternion(pc.q).add(pc.pos);
      m4.compose(off, pc.q, tmpV); faces.setMatrixAt(pc.i, m4);
      aState[pc.i * 4] = pc.lit; aState[pc.i * 4 + 1] = stairMix; aState[pc.i * 4 + 2] = tc; aState[pc.i * 4 + 3] = open;
      const sm = stairMix > 0.5 || (pF > 0 && pc.size.y < CAB * 0.7);
      aCells[pc.i * 4] = open ? 50 : sm ? 200 : 128; aCells[pc.i * 4 + 1] = open ? 50 : sm ? 60 : 128; aCells[pc.i * 4 + 2] = 2; aCells[pc.i * 4 + 3] = sm ? 1 : 2;
    }
    bodies.instanceMatrix.needsUpdate = true; faces.instanceMatrix.needsUpdate = true; stateAttr.needsUpdate = true; cellsAttr.needsUpdate = true;

    // staircase parts arrive after their risers
    for (let k = 0; k < STEPS; k++) {
      const tk = RM ? sstep(0.6, 0.8, pF) : clamp01((pF - (k / (STEPS - 1)) * 0.6 - 0.3) / 0.12);
      const sx = Math.max(0.0001, smoother(tk));
      const zf = ZS - GOING * k + 0.028;
      m4.compose(tmpV.set(0, RISE * (k + 1) - TREAD_T / 2, zf - (GOING + 0.028) / 2), ident, new THREE.Vector3(STAIR_W * sx, TREAD_T, GOING + 0.028)); treads.setMatrixAt(k, m4);
      m4.compose(tmpV.set(0, RISE * (k + 1) - 0.006, zf - 0.016), ident, new THREE.Vector3(STAIR_W * sx, 0.014, 0.034)); nosings.setMatrixAt(k, m4);
    }
    treads.instanceMatrix.needsUpdate = true; nosings.instanceMatrix.needsUpdate = true;
    treads.visible = nosings.visible = pF > 0.2;
    const deco = sstep(0.55, 0.95, pF); sideMat.opacity = deco; railMat.opacity = deco; stairDeco.visible = deco > 0.01;
    sideMat.depthWrite = railMat.depthWrite = deco > 0.98;
    // truss goes up before the cabinets and comes down for the staircase
    const trussUp = RM ? (p > 0.37 && p < 0.75 ? 1 : 0) : sstep(0.36, 0.46, p);
    const trussOn = 1 - sstep(0.70, 0.76, p);
    const trussA = trussUp * trussOn; trussMat.opacity = trussA; trussMat.depthWrite = trussA > 0.98; trussG.visible = trussA > 0.001;

    // ---- video: the install time-lapse plays while the wall is in view, timed so the wall is lit before it re-forms
    const wantVideo = p > 0.34 && p < 0.88;
    const expect = Math.min(BX.clamp01((p - 0.345) / 0.355) * INSTALL_LEN, INSTALL_LEN - 0.1);
    if (wantVideo && !RM && playing) {
      video.playbackRate = 1.5;
      if (video.paused) { if (Math.abs(video.currentTime - expect) > 0.3) video.currentTime = expect; video.play().catch(() => {}); }
      else if (Math.abs(video.currentTime - expect) > 1.2 && expect < INSTALL_LEN - 0.3) video.currentTime = expect;
    } else if (!video.paused) video.pause();
    if ((RM || !playing) && wantVideo && video.readyState >= 2 && !video.seeking && Math.abs(video.currentTime - (RM ? 10 : expect)) > 0.5) { video.currentTime = RM ? 10 : expect; video.addEventListener('seeked', () => BX.pushFrame('v-install'), { once: true }); }
    if (frameN % 6 === 0 && wantVideo) sampleVideo();
    if (frameN % 6 === 3 && p < 0.62) sampleCabinet();

    // ---- light the screens throw: 8 emitters for the floor, one spill light for metal
    for (let g = 0; g < N_EM; g++) { emP[g].set(0, 0, 0); emC[g].set(0, 0, 0); emN[g].set(0, 0, 1); }
    const cnt = new Array(N_EM).fill(0); let tot = 0; const cen = new THREE.Vector3(), totC = new THREE.Vector3();
    for (const pc of pieces) {
      const g = pc.group; emP[g].add(pc.pos); cnt[g]++;
      if (pc.lit > 0.01) { const col = pc.size.y < CAB * 0.7 ? pc.stairColor : (pc.hero && aState[pc.i * 4 + 2] > 0.5 ? testAvg : pc.color);
        const a = pc.lit * pc.size.x * pc.size.y * 4; emC[g].x += col.r * a; emC[g].y += col.g * a; emC[g].z += col.b * a; }
    }
    for (let g = 0; g < N_EM; g++) { if (cnt[g]) emP[g].divideScalar(cnt[g]); }
    if (!swap) {   // the lone cabinet lights the floor under it
      const hg = pieces.find(q => q.hero).group; const hn = new THREE.Vector3(0, 0, 1).applyEuler(heroSpin.rotation);
      emP[hg].copy(HERO); emN[hg].copy(hn); emC[hg].set(testAvg.r, testAvg.g, testAvg.b).multiplyScalar(1.0);
    }
    for (let g = 0; g < N_EM; g++) { const w = emC[g].x + emC[g].y + emC[g].z; tot += w; cen.addScaledVector(emP[g], w); totC.add(emC[g]); }
    if (tot > 1e-4) { cen.divideScalar(tot); spill.position.copy(cen).add(new THREE.Vector3(0, 0, 1.6)); spill.color.setRGB(totC.x / tot * 3, totC.y / tot * 3, totC.z / tot * 3); spill.intensity = Math.min(tot * 2.2, 40); }
    else spill.intensity = 0;

    // ---- camera
    applyView(phone ? Math.round(100 * sstep(0.3, 0.9, e)) : 0, phone ? 0 : Math.round(endT * 200) / 200, Math.round(sstep(0.0, 0.95, tO) * 200) / 200);
    const tgt = cameraAt(p, camPos);
    if (tO < 1) { // from act 2's last frame (0.3 m from the diodes, square on) back to the first view of the cabinet
      const k = sstep(0.0, 0.95, tO), kd = Math.exp(lerp(Math.log(0.3), Math.log(camPos.distanceTo(tgt)), k));
      openT.lerpVectors(HERO, tgt, k); openDir.set(0, 0, 1).lerp(tmpV.copy(camPos).sub(tgt).normalize(), k).normalize();
      camPos.copy(openT).addScaledVector(openDir, kd); tgt.copy(openT);
      const f = lerp(BX.isPhone() ? 64 : 40, 36, k); if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
    } else if (camera.fov !== 36) { camera.fov = 36; camera.updateProjectionMatrix(); }
    if (!phone && !RM) { camPos.x += drag.px * 0.04 * camPos.distanceTo(tgt) * 0.1; camPos.y -= drag.py * 0.03 * camPos.distanceTo(tgt) * 0.1; }
    camera.position.copy(camPos); camera.lookAt(tgt);
    const nearD = Math.max(0.01, camPos.distanceTo(tgt) * 0.04); if (Math.abs(camera.near - nearD) > nearD * 0.1) { camera.near = nearD; camera.updateProjectionMatrix(); }
    renderer.render(scene, camera);

    // ---- words
    const show = [tO > 0.45 && p < 0.30, p > 0.565 && p < 0.72, p > 0.865];
    copies.forEach((c, i) => c.classList.toggle('on', show[i]));
    hint.style.opacity = (tO >= 1 && p < 0.07 && !drag.used && !RM) ? 1 : 0;
    document.getElementById('shade').classList.toggle('on', show.some(Boolean));
    const tagOn = e > 0.75 && p < 0.31;
    lines.style.opacity = tagOn ? 1 : 0;
    if (tagOn) {
      // exploded-view callouts: a dot on each layer's bottom edge, a line down to its name
      const zs = [-0.0015 + 0.48 * e, -0.0032 + 0.32 * e, -0.0042 + 0.16 * e, -0.04];
      const pts = zs.map((z, i) => { const a = i < 3 ? new THREE.Vector3(MOD / 2 + 0.03 * e - FAN[i] * fe, -MOD - 0.03 * e, z) : new THREE.Vector3(0.16, -CAB / 2, -0.02); heroSpin.localToWorld(a); a.project(camera); return { i, x: (a.x * 0.5 + 0.5) * W, y: (-a.y * 0.5 + 0.5) * H }; });
      const base = Math.min(Math.max(...pts.map(q => q.y)) + 22, FREE.bottom - 6 - 3 * 21);
      [...pts].sort((a, b) => a.x - b.x).forEach((q, j) => {
        const el = tags[q.i]; const ly = base + j * 21; const lx = Math.max(10, Math.min(q.x - 3, W - el.offsetWidth - 10));
        el.style.transform = `translate(${lx.toFixed(1)}px, ${(ly - 7).toFixed(1)}px)`; el.style.opacity = 1;
        const L = lineEls[q.i]; L.line.setAttribute('x1', q.x); L.line.setAttribute('y1', q.y); L.line.setAttribute('x2', q.x); L.line.setAttribute('y2', ly - 9);
        L.dot.setAttribute('cx', q.x); L.dot.setAttribute('cy', q.y);
      });
    } else tags.forEach(el => { el.style.opacity = 0; });

  }

  return {
    id: 'C', duration: 28, ov, videos: ['v-venue'], stillT: 0.32, label: 'Built to fit',
    frame,
    setActive(on) { active = on; if (on) { FREE.reserve = -1; layout(); } else { drag.on = false; if (!video.paused) video.pause(); } },
    resize() { if (active) { FREE.reserve = -1; layout(); } },
    compile() { cameraAt(0, camPos); camera.position.copy(camPos); camera.lookAt(HERO); renderer.compile(scene, camera); },
    get p() { return cur; },
  };
};
