// built-from: three.js r160 (MIT) WebGLRenderer, CylinderGeometry, VideoTexture, Reflector, EffectComposer,
// UnrealBloomPass, OutputPass (https://threejs.org/examples/#webgl_mirror, #webgl_postprocessing_unreal_bloom).
// The LED diode look is a per-cell sampling shader (classic LED-matrix technique: sample once per cell, draw a round
// emitter, black mask between). Content: Bendac's own brand film from bendac.tech.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const R = 8;            // wall radius (m)
const ARC = 1.25;       // radians of arc
const H = 3.8;          // wall height (m)
const WALL_W = R * ARC; // arc length
const FLOOR_Y = -1.6;
const WALL_Y = FLOOR_Y + H / 2;

const wallVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = vec2(1.0 - uv.x, uv.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const wallFrag = /* glsl */`
  precision highp float;
  uniform sampler2D uVideo;
  uniform float uRows;        // LED rows on the wall (coarse = big pitch)
  uniform vec2 uWall;         // wall size in metres
  uniform vec2 uMouse;        // loupe centre in wall uv
  uniform float uLoupe;       // loupe radius in metres (0 = off)
  uniform float uVideoAspect; // 16/9
  uniform float uTime;
  uniform float uReady;       // 0..1 fade in
  uniform float uGain;
  varying vec2 vUv;

  vec3 film(vec2 uv) {
    // cover-fit the 16:9 film on the wide wall
    float wallAspect = uWall.x / uWall.y;
    vec2 v = vec2(uv.x, 0.5 + (uv.y - 0.5) * (uVideoAspect / wallAspect));
    return texture2D(uVideo, v).rgb;
  }

  vec3 led(vec2 uv, float rows) {
    vec2 grid = vec2(rows * uWall.x / uWall.y, rows);
    vec2 g = uv * grid;
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    float ppc = 1.0 / max(fwidth(g.x), 1e-5);           // screen pixels per LED cell
    vec3 c = film((cell + 0.5) / grid);
    float aa = 1.2 / max(ppc, 1.0);
    // SMD emitter: a rounded square with three sub-dies visible when large
    float body = 1.0 - smoothstep(0.30 - aa, 0.30 + aa, max(abs(f.x), abs(f.y)) * 0.86 + length(f) * 0.32);
    vec3 dies = vec3(
      1.0 - smoothstep(0.075, 0.075 + aa * 2.0, length(f - vec2(-0.12, 0.07))),
      1.0 - smoothstep(0.075, 0.075 + aa * 2.0, length(f - vec2(0.12, 0.07))),
      1.0 - smoothstep(0.075, 0.075 + aa * 2.0, length(f - vec2(0.0, -0.13)))
    );
    float big = smoothstep(16.0, 34.0, ppc);
    vec3 sub = c * mix(vec3(body), mix(vec3(body) * 0.55, dies * 2.4, 0.75), big);
    float halo = exp(-dot(f, f) * 9.0) * 0.22;
    vec3 diode = sub + c * halo;
    // cabinet seams every 0.5 m
    vec2 m = fract(uv * uWall / 0.5);
    float seam = smoothstep(0.0, 0.006, m.x) * smoothstep(0.0, 0.006, 1.0 - m.x) * smoothstep(0.0, 0.01, m.y) * smoothstep(0.0, 0.01, 1.0 - m.y);
    diode *= mix(0.35, 1.0, seam);
    // as cells shrink below a few pixels, the eye integrates them: blend to the continuous image
    float fill = 1.0 - smoothstep(1.6, 5.0, ppc);
    return mix(diode, film(uv) * 0.92, fill);
  }

  void main() {
    vec2 uv = vUv;
    vec3 col = led(uv, uRows);
    // loupe: 0.4 mm-class detail under the pointer
    vec2 dm = (uv - uMouse) * uWall;
    float d = length(dm);
    if (uLoupe > 0.0) {
      float inside = 1.0 - smoothstep(uLoupe - 0.02, uLoupe, d);
      vec3 fine = led(uv, 520.0) * 1.08;
      col = mix(col, fine, inside);
      float ring = exp(-pow((d - uLoupe) / 0.012, 2.0));
      col += vec3(0.12, 0.9, 0.5) * ring * 0.9;
    }
    // black louvre sheen from the pointer light
    float sheen = exp(-d * d * 0.35) * 0.035;
    col += vec3(sheen * 0.8, sheen, sheen * 0.9);
    gl_FragColor = vec4(col * uGain * uReady, 1.0);
  }
`;

const floorFrag = /* glsl */`
  precision highp float;
  varying vec3 vPos;
  uniform vec2 uMouse;
  void main() {
    float dz = clamp((vPos.z + 5.0) / 10.0, 0.0, 1.0);    // 0 at wall foot, 1 toward camera
    float a = mix(0.42, 0.93, smoothstep(0.0, 0.9, dz));
    float side = smoothstep(4.5, 9.0, abs(vPos.x));
    a = max(a, side);
    // faint floor tile grid
    vec2 g = abs(fract(vPos.xz * 1.0) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.012, min(0.5 - g.x, 0.5 - g.y));
    vec3 c = vec3(0.004, 0.006, 0.005) + vec3(0.02, 0.05, 0.035) * line * (1.0 - dz);
    gl_FragColor = vec4(c, a);
  }
`;
const floorVert = /* glsl */`
  varying vec3 vPos;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;

export function createLedWall({ canvas, video, onPitch }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  } catch (e) {
    return null;
  }
  if (!renderer.getContext()) return null;

  const isSmall = () => innerWidth < 760;
  let dpr = Math.min(devicePixelRatio || 1, isSmall() ? 1.5 : 1.6);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x020303, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020303, 0.018);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);

  // LED wall
  const vtex = new THREE.VideoTexture(video);
  vtex.colorSpace = THREE.SRGBColorSpace;
  vtex.minFilter = THREE.LinearFilter; vtex.magFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
  const uniforms = {
    uVideo: { value: vtex }, uRows: { value: 18 }, uWall: { value: new THREE.Vector2(WALL_W, H) },
    uMouse: { value: new THREE.Vector2(0.62, 0.55) }, uLoupe: { value: 0.0 }, uVideoAspect: { value: 16 / 9 },
    uTime: { value: 0 }, uReady: { value: 0 }, uGain: { value: 1.55 },
  };
  const wallMat = new THREE.ShaderMaterial({ vertexShader: wallVert, fragmentShader: wallFrag, uniforms, side: THREE.BackSide, extensions: { derivatives: true } });
  const wallGeo = new THREE.CylinderGeometry(R, R, H, 200, 1, true, Math.PI - ARC / 2, ARC);
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, WALL_Y, 3);
  scene.add(wall);

  // the wall's black frame (top truss + base plinth)
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0b0d0c, roughness: 0.55, metalness: 0.6 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.08, 200, 1, true, Math.PI - ARC / 2 - 0.01, ARC + 0.02), frameMat);
  top.material.side = THREE.DoubleSide; top.position.set(0, WALL_Y + H / 2 + 0.04, 3); scene.add(top);
  const plinth = top.clone(); plinth.position.y = FLOOR_Y + 0.04; scene.add(plinth);
  scene.add(new THREE.AmbientLight(0x223322, 0.6));
  const wallLight = new THREE.PointLight(0x7fffc0, 6, 14, 1.6); wallLight.position.set(0, WALL_Y, -3); scene.add(wallLight);

  // mirror floor + tinted overlay: a glossy studio floor that reflects the wall
  const mirror = new Reflector(new THREE.PlaneGeometry(40, 30), { textureWidth: 1024, textureHeight: 1024, color: 0x8a8f8c, clipBias: 0.003 });
  mirror.rotation.x = -Math.PI / 2; mirror.position.y = FLOOR_Y; scene.add(mirror);
  const floorOverlay = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.ShaderMaterial({ vertexShader: floorVert, fragmentShader: floorFrag, transparent: true, depthWrite: false, uniforms: { uMouse: uniforms.uMouse } }));
  floorOverlay.rotation.x = -Math.PI / 2; floorOverlay.position.y = FLOOR_Y + 0.002; scene.add(floorOverlay);

  // air: slow motes lit by the wall, pushed by the pointer
  const N = isSmall() ? 260 : 520;
  const pos = new Float32Array(N * 3), base = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    base[i * 3] = (Math.random() - 0.5) * 11; base[i * 3 + 1] = FLOOR_Y + Math.random() * 4.4; base[i * 3 + 2] = -4.6 + Math.random() * 7;
    pos.set(base.subarray(i * 3, i * 3 + 3), i * 3);
  }
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.022, color: 0xbfffe0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const motes = new THREE.Points(pGeo, pMat); scene.add(motes);

  // post
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.85, 0.55, 0.62);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // state
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false, last: 0, world: new THREE.Vector3(0, 0, -99) };
  const loupeUv = new THREE.Vector2(0.62, 0.55), loupeTarget = new THREE.Vector2(0.62, 0.55);
  let progress = 0, visible = true, running = false, ready = 0, w = 0, h = 0, portrait = false;

  function resize() {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
    portrait = h > w * 1.05;
    camera.aspect = w / h;
    camera.fov = portrait ? 66 : 38;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.strength = portrait ? 0.7 : 0.85;
  }
  resize();
  addEventListener('resize', resize);

  function pitchFor(t) { return 10 * Math.pow(0.04, t); } // 10 mm -> 0.4 mm, log scale

  function hitWall(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(wall, false)[0];
    if (hit && hit.uv) { loupeTarget.set(1 - hit.uv.x, hit.uv.y); pointer.world.copy(hit.point); return true; }
    return false;
  }
  function onMove(e) {
    const r = canvas.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);
    pointer.active = hitWall(e.clientX, e.clientY);
    pointer.last = performance.now();
  }
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onMove);
  canvas.addEventListener('pointerleave', () => { pointer.active = false; });

  const clock = new THREE.Clock();
  let frames = 0, acc = 0, lowered = false;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    ready = Math.min(1, ready + dt * 0.8);
    uniforms.uReady.value = ready * ready * (3 - 2 * ready);
    uniforms.uTime.value = t;

    // idle loupe drift so touch users see it without touching
    const idle = performance.now() - pointer.last > 3500;
    if (idle) {
      loupeTarget.set(0.5 + Math.sin(t * 0.33) * (portrait ? 0.16 : 0.28), 0.5 + Math.sin(t * 0.51) * 0.18);
    }
    loupeUv.lerp(loupeTarget, 1 - Math.pow(0.0008, dt));
    uniforms.uMouse.value.copy(loupeUv);
    uniforms.uLoupe.value += ((portrait ? 0.42 : 0.55) - uniforms.uLoupe.value) * (1 - Math.pow(0.02, dt));

    // pitch from scroll
    const p = pitchFor(progress);
    uniforms.uRows.value = 18 * (10 / p);
    if (onPitch) onPitch(p, progress);

    // camera: dolly with scroll, tilt a few degrees with the pointer
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.pow(0.02, dt));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.pow(0.02, dt));
    const e = progress * progress * (3 - 2 * progress);
    const z0 = portrait ? 10.5 : 13.5, z1 = portrait ? 5.4 : 5.3;
    const camZ = z0 + (z1 - z0) * e;
    const amp = 0.45 + (1 - e) * 0.55;
    const ly0 = portrait ? -1.2 : -1.75, ly1 = WALL_Y - 0.1;
    camera.position.set(pointer.x * amp, (portrait ? 1.1 : 1.25) - (portrait ? 1.0 : 1.1) * e + pointer.y * 0.2, camZ);
    camera.lookAt(pointer.x * 0.15, ly0 + (ly1 - ly0) * e + pointer.y * 0.05, -5);
    bloom.strength = (portrait ? 0.7 : 0.85) * (1 - 0.45 * e);
    uniforms.uGain.value = 1.55 - 0.4 * e;

    // light follows the loupe across the wall
    const ang = Math.PI - ARC / 2 + (1 - loupeUv.x) * ARC;
    wallLight.position.set(R * Math.sin(ang) * 0.82, FLOOR_Y + loupeUv.y * H, 3 + R * Math.cos(ang) * 0.82);

    // motes drift up; the pointer pushes them away
    const pr = pointer.world;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      base[k + 1] += dt * (0.03 + (i % 7) * 0.006);
      if (base[k + 1] > FLOOR_Y + 4.6) base[k + 1] = FLOOR_Y;
      const dx = pos[k] - pr.x, dy = pos[k + 1] - pr.y, dz = pos[k + 2] - pr.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (pointer.active && d2 < 2.2) { const f = (2.2 - d2) * 0.9 * dt; vel[k] += dx * f; vel[k + 1] += dy * f; vel[k + 2] += dz * f; }
      vel[k] *= 0.94; vel[k + 1] *= 0.94; vel[k + 2] *= 0.94;
      pos[k] += (base[k] + Math.sin(t * 0.2 + i) * 0.05 - pos[k]) * 0.04 + vel[k];
      pos[k + 1] += (base[k + 1] - pos[k + 1]) * 0.04 + vel[k + 1];
      pos[k + 2] += (base[k + 2] - pos[k + 2]) * 0.04 + vel[k + 2];
    }
    pGeo.attributes.position.needsUpdate = true;

    composer.render();

    // adaptive quality: drop pixel ratio, then bloom, if frames are slow
    frames++; acc += dt;
    if (frames === 90) {
      const avg = acc / frames;
      if (avg > 0.024 && dpr > 0.9) { dpr = Math.max(0.85, dpr - 0.3); renderer.setPixelRatio(dpr); composer.setPixelRatio && composer.setPixelRatio(dpr); resize(); }
      else if (avg > 0.03 && !lowered) { lowered = true; bloom.enabled = false; }
      frames = 0; acc = 0;
    }
  }

  return {
    start() { if (!running) { running = true; clock.getDelta(); requestAnimationFrame(frame); } },
    setProgress(t) { progress = Math.max(0, Math.min(1, t)); },
    setVisible(v) { visible = v; },
    pitchFor,
    renderOnce() { composer.render(); },
  };
}
