// Half 2: "How far away are your viewers?" (sketch A's picker). A small second canvas that renders only while on screen.
// Each distance puts the real footage on a wall sized and pitched for that place; switching wipes the new picture in column by column.
import * as THREE from 'three';
const BX = window.BX;

(function picker() {
  const $ = (id) => document.getElementById(id);
  const canvas = $('pgl'), box = $('pbox');
  const RM = BX.reduced;
  // every line below comes from research/facts-2026-10-31.md
  const PRESETS = {
    board: { video: 'v-board', prod: 'Krystl', spec: 'Indoor · 0.4 mm and up', pitch: 0.9, W: 4.0, H: 2.25, dist: 3.0,
      fact: 'Vinson & Elkins are big users of Krystl: 16 screens across 5 locations.', label: 'about 3 m' },
    visit: { video: 'v-visit', prod: 'Versa', spec: 'Indoor and outdoor · 2.5 mm and up', pitch: 2.5, W: 6.4, H: 3.6, dist: 8.0,
      fact: 'Kennedy Space Center uses Versa throughout the site: over 200 sqm, seen by over 1.5 million visitors a year.', label: 'about 8 m' },
    stadium: { video: 'v-stadium', prod: 'Dura', spec: 'Outdoor · IP67 · up to 10,000 nits', pitch: 10, W: 9.0, H: 5.0, dist: 40.0,
      fact: 'Plymouth Argyle: a 45 sqm big screen at Home Park.', label: '40 m and more' },
  };

  // contact panel (sketch A's), opened from here and from the closing section
  const panel = $('panel'), scrim = $('scrim');
  let opener = null;
  const openPanel = (e) => { opener = e && e.currentTarget; panel.classList.add('open'); scrim.classList.add('on'); panel.setAttribute('aria-hidden', 'false'); $('close').focus(); };
  const closePanel = () => { panel.classList.remove('open'); scrim.classList.remove('on'); panel.setAttribute('aria-hidden', 'true'); (opener || $('talk2')).focus(); };
  $('talk').addEventListener('click', openPanel); $('talk2').addEventListener('click', (e) => { $('pctx').textContent = 'Tell us about your venue. Every project starts with a free site survey.'; openPanel(e); });
  $('close').addEventListener('click', closePanel); scrim.addEventListener('click', closePanel);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('open')) closePanel(); });

  let renderer = null;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) { /* the chips and card still work without the picture */ }

  const texs = {};
  for (const k in PRESETS) { const t = new THREE.VideoTexture(BX.video(PRESETS[k].video)); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; texs[k] = t; }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.05, 400);
  const wallU = { mapA: { value: texs.board }, mapB: { value: texs.board }, sweep: { value: 1 }, cells: { value: new THREE.Vector2(4444, 2500) } };
  const wallMat = new THREE.ShaderMaterial({
    uniforms: wallU,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D mapA, mapB; uniform float sweep; uniform vec2 cells; varying vec2 vUv;
      void main(){
        vec2 g = vUv * cells; vec2 id = floor(g); vec2 f = fract(g) - 0.5; vec2 cuv = (id + 0.5) / cells;
        // a scan-line wipe in diode steps: the new picture arrives column by column, like a real wall being fed
        float col = id.x / cells.x;
        vec3 c = col < sweep ? texture2D(mapB, cuv).rgb : texture2D(mapA, cuv).rgb;
        float edge = smoothstep(0.02, 0.0, abs(col - sweep)) * step(sweep, 0.999);
        float px = length(fwidth(g)); float d = length(f);
        vec3 lit = c * (smoothstep(0.30, 0.20, d) * 1.55 + exp(-d * d * 14.0) * 0.45);
        vec3 colr = mix(lit, c, smoothstep(0.22, 0.62, px));
        colr += vec3(0.25, 1.0, 0.55) * edge * 0.6;
        gl_FragColor = vec4(colr, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  wallMat.extensions = { derivatives: true };
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMat); scene.add(wall);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x0a0b0b })); scene.add(frame);
  const floorU = { map: { value: texs.board }, W: { value: 4 }, H: { value: 2.25 } };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.ShaderMaterial({
    uniforms: floorU,
    vertexShader: `varying vec3 wp; void main(){ vec4 w = modelMatrix * vec4(position,1.0); wp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D map; uniform float W, H; varying vec3 wp;
      void main(){ float u = clamp(wp.x / W + 0.5, 0.0, 1.0);
        // a soft pool, not streaks: the wall's lower rows averaged across a band around this point
        vec3 c = vec3(0.0); for (int i = -3; i <= 3; i++) c += texture2D(map, vec2(clamp(u + float(i) * 0.06, 0.0, 1.0), 0.15)).rgb; c /= 7.0;
        float fall = exp(-max(wp.z, 0.0) / (H * 0.55)) * smoothstep(0.65, 0.4, abs(wp.x / W));
        gl_FragColor = vec4(c * fall * 0.16 + vec3(0.006), 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  let chosen = 'board', sweepT = 1;
  const size = { W: 4.0, H: 2.25, pitch: 0.9, dist: 3.0 }; let target = PRESETS.board;
  function setSize(s) {
    wall.scale.set(s.W, s.H, 1); wall.position.set(0, s.H / 2 + 0.6, 0);
    frame.scale.set(s.W + 0.06, s.H + 0.06, 0.12); frame.position.set(0, s.H / 2 + 0.6, -0.09);
    floorU.W.value = s.W; floorU.H.value = s.H;
    wallU.cells.value.set(Math.round(s.W * 1000 / s.pitch), Math.round(s.H * 1000 / s.pitch));
  }
  setSize(size);

  function choose(k) {
    const p = PRESETS[k]; if (!p || k === chosen) return;
    document.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
    $('prod').textContent = p.prod; $('spec').textContent = p.spec; $('fact').textContent = p.fact;
    $('pdist').innerHTML = `Viewers at <b>${p.label}</b>`;
    $('pctx').textContent = `You told us your viewers are ${p.label} away. That points to ${p.prod}.`;
    // the new picture wipes in over the old, then the wall re-sizes for the place
    wallU.mapA.value = wallU.sweep.value >= 1 ? wallU.mapB.value : wallU.mapA.value;
    wallU.mapB.value = texs[k]; floorU.map.value = wallU.mapA.value;
    sweepT = RM ? 1 : 0; wallU.sweep.value = sweepT; if (RM) { wallU.mapA.value = texs[k]; floorU.map.value = texs[k]; }
    BX.pause(PRESETS[chosen].video); chosen = k; target = p;
    if (visible) BX.play(p.video);
  }
  document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => choose(b.dataset.k)));

  let visible = false;
  new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    if (visible) { BX.play(PRESETS[chosen].video); if (RM) { const v = BX.video(PRESETS[chosen].video); v.pause(); } }
    else for (const k in PRESETS) BX.pause(PRESETS[k].video);
  }, { threshold: 0 }).observe(box);

  function fit() {
    if (!renderer) return;
    const w = box.clientWidth, h = box.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(w, h, false);
    camera.aspect = w / h;
  }
  fit(); addEventListener('resize', fit);

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (visible && renderer) {
      const k = 1 - Math.pow(0.02, dt);
      size.W += (target.W - size.W) * k; size.H += (target.H - size.H) * k; size.pitch += (target.pitch - size.pitch) * k; size.dist += (target.dist - size.dist) * k;
      setSize(size);
      if (sweepT < 1) { sweepT = Math.min(1, sweepT + dt / 1.1); wallU.sweep.value = sweepT; if (sweepT >= 1) { wallU.mapA.value = wallU.mapB.value; floorU.map.value = wallU.mapA.value; } }
      // a viewer's eye at 1.6 m, standing at the chosen distance; the lens is chosen so the wall fills the frame the same way each time
      const d = size.dist, cy = size.H / 2 + 0.6;
      const visW = Math.max(size.W / 0.8, (size.H / 0.7) * camera.aspect);
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(visW / camera.aspect / 2 / d));
      camera.position.set(0, 1.6 + (cy - 1.6) * 0.35, d); camera.lookAt(0, cy - size.H * 0.08, 0);
      camera.near = Math.max(0.05, d * 0.02); camera.far = d + 200; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  window.__picker = { choose, get chosen() { return chosen; } };
})();
