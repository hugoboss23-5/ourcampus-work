// Shared set-up for the film: one renderer on the film canvas, shared video textures, small helpers.
// Every act module registers a factory on window.BX.acts; director.js builds them on this renderer.
import * as THREE from 'three';

const BX = window.BX = window.BX || { acts: {} };
BX.THREE = THREE;
BX.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (BX.reduced) document.body.classList.add('rm');

const film = document.getElementById('film');
const canvas = document.getElementById('gl');
BX.film = film; BX.canvas = canvas;

let renderer = null;
try {
  const desk = innerWidth >= 900;
  // MSAA only where pixels are coarse: a 2x desktop canvas is already millions of pixels
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !(desk && (devicePixelRatio || 1) >= 2), powerPreference: 'high-performance' });
} catch (e) { document.getElementById('nogl').style.display = 'flex'; }
BX.renderer = renderer;
if (renderer) {
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // only standard materials (act 3's metal) use it; shader materials tone-map themselves
}

// size of the film (not the window): the film is a block at the top of the page
BX.size = { w: film.clientWidth, h: film.clientHeight, dpr: Math.min(devicePixelRatio || 1, 2) };
BX.isPhone = () => BX.size.w / BX.size.h < 0.9;
BX.resizeRenderer = () => {
  BX.size.w = film.clientWidth; BX.size.h = film.clientHeight;
  if (renderer) { renderer.setPixelRatio(BX.size.dpr); renderer.setSize(BX.size.w, BX.size.h, false); }
};
BX.resizeRenderer();

// shared video textures (one per <video>), so two acts showing the same footage upload it once
const vtex = {};
BX.video = (id) => document.getElementById(id);
BX.vtex = (id) => {
  if (vtex[id]) return vtex[id];
  const t = new THREE.VideoTexture(BX.video(id));
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return (vtex[id] = t);
};
// a paused video never fires requestVideoFrameCallback; push its current frame to the GPU by hand
BX.pushFrame = (id) => { const t = vtex[id]; if (!t) return; let n = 0; const go = () => { t.needsUpdate = true; if (++n < 4) requestAnimationFrame(go); }; go(); };
BX.play = (id) => { const v = BX.video(id); if (v && v.paused) v.play().catch(() => {}); };
BX.pause = (id) => { const v = BX.video(id); if (v && !v.paused) v.pause(); };

BX.clamp01 = (x) => Math.min(1, Math.max(0, x));
BX.smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
BX.lerp = (a, b, k) => a + (b - a) * k;
BX.win = (t, a, b, f = 0.035) => BX.smooth(a, a + f, t) * (1 - BX.smooth(b - f, b, t));

// the hero light's sprite, shared by act 1 (where the wall collapses into it) and act 2 (where it lands in the stadium)
BX.sparkShader = {
  vertexShader: `uniform vec3 uSparkP; uniform float uSize; varying vec2 vUv;
    void main(){ vUv = uv; vec4 mv = viewMatrix * vec4(uSparkP, 1.0); mv.xy += position.xy * uSize; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uA; varying vec2 vUv;
    void main(){ vec2 q = (vUv - 0.5) * 2.0; float r = length(q);
      float core = smoothstep(0.075, 0.035, r); float halo = exp(-r * r * 22.0) * 0.9 + exp(-r * r * 4.5) * 0.18;
      vec3 c = vec3(1.0) * core * 1.6 + vec3(0.25, 1.0, 0.45) * halo;
      gl_FragColor = vec4(c * uA, 1.0); }`,
};
BX.SPARK_PX = 70; // the light's on-screen size in CSS pixels when far away; act 1 ends at exactly this size so act 2 can take over
