// built-from: three.js r186 examples (GLTFLoader, RoomEnvironment, shadow-catcher plane with ShadowMaterial), owned camera and pointer code.
// The model is Hugo's own Worldwide Stages building (Sep 15, 2026), already public in this repo. Loads after the project list. 2026-11-05
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MODEL = 'worldwide-stages-existing-campus/Worldwide%20Stages%20-%20Building%20Only.glb';
const MODEL_BYTES = 1769616;

const canvas = document.getElementById('scene');
const stage = document.getElementById('stage');
const glow = document.getElementById('glow');
const loader = document.getElementById('loader');
const loaderN = document.getElementById('loader-n');
const loaderFill = document.getElementById('loader-fill');
const hint = document.getElementById('hint');
const copy = document.querySelector('.hero-copy');
const hero = document.getElementById('top');
const still = matchMedia('(prefers-reduced-motion:reduce)').matches;
const coarse = matchMedia('(pointer:coarse)').matches;
window.__hero = { ready: false, tune: {} };

if (coarse) hint.textContent = 'Live 3D model. Swipe sideways to change the light.';

function fail() {
  document.documentElement.classList.add('no-webgl');
  loader.classList.add('done');
  hint.textContent = 'Render of the campus model.';
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) { fail(); }

if (renderer) start();

function start() {
  const phone = () => innerWidth <= 700;
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail(); });

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.62;

  const camera = new THREE.PerspectiveCamera(24, 1, 5, 6000);
  const target = new THREE.Vector3(0, 5, 0);

  const sun = new THREE.DirectionalLight(0xffe2bd, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(phone() ? 1024 : 2048, phone() ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 230, bottom: -230, near: 10, far: 1400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xf7f2e8, 0xb9b09e, 0.55));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShadowMaterial({ color: 0x2d261c, opacity: 0.2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  let model = null, size = 260;
  const setProgress = f => {
    const v = Math.max(0, Math.min(1, f));
    loaderN.textContent = Math.round(v * 100);
    loaderFill.style.strokeDashoffset = String(188.5 * (1 - v));
  };

  new GLTFLoader().load(MODEL, gltf => {
    model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -box.min.y, -c.z);
    const s = box.getSize(new THREE.Vector3());
    size = Math.max(s.x, s.z);
    target.set(0, s.y * 0.35, 0);
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        const m = o.material;
        if (m && 'envMapIntensity' in m) m.envMapIntensity = 1;
      }
    });
    scene.add(model);
    model.updateMatrixWorld(true);
    // sample real vertices (about 600) so the fit hugs the building, not its bounding box
    let total = 0;
    model.traverse(o => { if (o.isMesh) total += o.geometry.attributes.position.count; });
    const every = Math.max(1, Math.floor(total / 600));
    let n = 0;
    model.traverse(o => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++, n++) if (n % every === 0) corners.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    });
    setProgress(1);
    resize();
    renderer.compile(scene, camera);
    requestAnimationFrame(() => {
      canvas.classList.add('ready');
      loader.classList.add('done');
      window.__hero.ready = true;
    });
  }, e => setProgress((e.loaded || 0) / (e.lengthComputable && e.total ? e.total : MODEL_BYTES)), () => fail());

  // pointer: mouse anywhere over the page top, touch by swiping sideways on the model
  const P = { x: 0, y: 0, tx: 0, ty: 0, touched: false };
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && !stage.contains(e.target) && e.target !== canvas) return;
    P.tx = (e.clientX / innerWidth) * 2 - 1;
    P.ty = (e.clientY / innerHeight) * 2 - 1;
    if (e.pointerType === 'touch') P.touched = true;
  }, { passive: true });
  stage.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { P.touched = true; P.tx = (e.clientX / innerWidth) * 2 - 1; } });

  let W = 0, H = 0;
  // Framing: the building is kept inside a box on screen (above the title on desktop, inside the picture on a phone).
  // Each frame about 600 of its vertices are projected; distance and offset ease until the box fits.
  const corners = [];
  let zoom = 1, ox = 0, oy = 0;
  function frameBox() {
    if (phone()) return { x0: W * 0.07, x1: W * 0.93, y0: 66, y1: H - 26 };
    const top = copy.getBoundingClientRect().top - stage.getBoundingClientRect().top;
    return { x0: W * 0.05, x1: W * 0.975, y0: 132, y1: Math.max(260, top - 28) };
  }
  const q = new THREE.Vector3();
  function place(az, el, gain) {
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const R = (size / Math.tan(vfov / 2)) * zoom;
    camera.position.set(target.x + R * Math.cos(el) * Math.sin(az), target.y + R * Math.sin(el), target.z + R * Math.cos(el) * Math.cos(az));
    camera.lookAt(target);
    camera.setViewOffset(W, H, ox, oy, W, H);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    if (!corners.length) return;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const c of corners) {
      q.copy(c).project(camera);
      const sx = (q.x + 1) / 2 * W, sy = (1 - q.y) / 2 * H;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const f = frameBox();
    const ratio = Math.max((x1 - x0) / (f.x1 - f.x0), (y1 - y0) / (f.y1 - f.y0));
    zoom *= 1 + (ratio - 1) * gain;
    ox += ((x0 + x1) / 2 - (f.x0 + f.x1) / 2) * gain;
    oy += ((y0 + y1) / 2 - (f.y0 + f.y1) / 2) * gain;
  }
  let lastAz = phone() ? 0.8 : 5.5, lastEl = phone() ? 0.46 : 0.36;
  function settle() { for (let i = 0; i < 80; i++) place(lastAz, lastEl, 0.35); }
  window.__hero.corners = corners;

  function resize() {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, phone() ? 1.75 : 2));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    settle();
  }
  addEventListener('resize', resize);
  new ResizeObserver(resize).observe(stage);
  resize();

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); }, { threshold: 0 }).observe(hero);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });

  const clock = new THREE.Clock();
  let t = 0, running = false;
  const v = new THREE.Vector3();
  function frame() {
    running = false;
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!still) t += dt;
    if (coarse && !P.touched && !still) { P.tx = Math.sin(t * 0.35) * 0.8; P.ty = -0.2; }
    const k = 1 - Math.pow(0.0025, dt);
    P.x += (P.tx - P.x) * k; P.y += (P.ty - P.y) * k;

    const heroH = hero.offsetHeight || innerHeight;
    const sp = Math.max(0, Math.min(1, scrollY / heroH));

    // camera: slow glide around the building; the pointer turns it a few degrees; scroll lowers and turns it
    const T = window.__hero.tune;
    const az = (T.az ?? (phone() ? 0.8 : 5.5)) + Math.sin(t * (T.spin ?? 0.11)) * 0.45 + P.x * 0.2 + sp * 0.5;
    const el = (T.el ?? (phone() ? 0.46 : 0.36)) - sp * 0.18 - P.y * 0.06;
    lastAz = az; lastEl = el;
    place(az, el, 0.18);

    // the sun follows the pointer: left to right swings it around, up and down raises it
    const sAz = az - 1.25 + P.x * 1.15;
    const sEl = 0.62 - P.y * 0.28;
    v.set(Math.cos(sEl) * Math.sin(sAz), Math.sin(sEl), Math.cos(sEl) * Math.cos(sAz)).multiplyScalar(600);
    sun.position.copy(target).add(v);
    sun.target.position.copy(target);
    sun.intensity = 2.4 + (1 - Math.abs(P.x)) * 0.9;

    glow.style.setProperty('--gx', (58 + P.x * 22).toFixed(1) + '%');
    glow.style.setProperty('--gy', (40 + P.y * 14).toFixed(1) + '%');
    if (!phone()) {
      copy.style.opacity = String(Math.max(0, 1 - sp * 1.6));
      copy.style.transform = `translateY(${(-sp * 60).toFixed(1)}px)`;
    }

    renderer.render(scene, camera);
    loop();
  }
  function loop() { if (!running) { running = true; requestAnimationFrame(frame); } }
  loop();
}
