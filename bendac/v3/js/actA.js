// Act 1, "One light" (from sketch A). Time-driven: t goes 0 to 1 over the act.
// One LED as its red, green and blue chips; the camera steps back on its own until the AccuVision picture
// resolves on a wall; then the wall's picture collapses into one green pixel, which act 2 takes over as its light.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
const BX = window.BX;

BX.acts.A = function createActA() {
  const { clamp01, smooth } = BX;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 400);
  const acc = BX.vtex('v-acc');

  // ---------- the wall: every diode drawn in the shader (sketch A's shader, plus the collapse tint)
  const wallU = { map: { value: acc }, cells: { value: new THREE.Vector2(2560, 1440) }, power: { value: 1 }, tint: { value: 0 } };
  const wallMat = new THREE.ShaderMaterial({
    uniforms: wallU,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D map; uniform float power, tint; uniform vec2 cells; varying vec2 vUv;
      void main(){
        vec2 g = vUv * cells; vec2 id = floor(g); vec2 f = fract(g) - 0.5; vec2 cuv = (id + 0.5) / cells;
        vec3 c = texture2D(map, cuv).rgb;
        float px = length(fwidth(g));
        float d = length(f);
        // up close, one pixel is three chips: red, green and blue, side by side under a lens
        vec3 chips = vec3(0.0);
        for (int k = 0; k < 3; k++) {
          vec2 o = f - vec2(0.0, (float(k) - 1.0) * 0.105);
          vec2 q = abs(o) - vec2(0.055, 0.032);
          float r = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
          float die = smoothstep(0.012, 0.0, r);
          float halo = exp(-max(r, 0.0) * 38.0) * 0.55;
          vec3 ch = k == 0 ? vec3(1.0, 0.08, 0.05) * c.r : (k == 1 ? vec3(0.1, 1.0, 0.25) * c.g : vec3(0.12, 0.25, 1.0) * c.b);
          chips += ch * (die * 2.2 + halo);
        }
        float lens = smoothstep(0.30, 0.27, d);
        float near = 1.0 - smoothstep(0.004, 0.05, px);
        float diode = smoothstep(0.30, 0.20, d);
        float bloom = exp(-d * d * 14.0) * 0.45;
        vec3 round = c * (diode * 1.55 + bloom);
        vec3 lit = mix(round, chips * (0.35 + 0.65 * lens) + c * bloom * 0.25, near);
        float resolve = smoothstep(0.22, 0.62, px);
        vec3 colr = mix(lit, c, resolve) * power;
        // the collapse: as the picture squeezes to a point, its light turns into one green pixel
        float lum = dot(colr, vec3(0.3, 0.55, 0.15));
        colr = mix(colr, vec3(0.3, 1.0, 0.5) * (0.6 + lum), tint);
        gl_FragColor = vec4(colr, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  wallMat.extensions = { derivatives: true };
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMat);
  scene.add(wall);
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x0a0b0b, toneMapped: false });
  const frameBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), frameMat);
  scene.add(frameBox);
  // the floor takes the wall's light (colour from the wall's lower rows)
  const floorU = { map: { value: acc }, W: { value: 6.4 }, H: { value: 3.6 }, power: { value: 1 } };
  const floorMat = new THREE.ShaderMaterial({
    uniforms: floorU,
    vertexShader: `varying vec3 wp; void main(){ vec4 w = modelMatrix * vec4(position,1.0); wp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform sampler2D map; uniform float W, H, power; varying vec3 wp;
      void main(){
        float u = clamp(wp.x / W + 0.5, 0.0, 1.0);
        vec3 c = texture2D(map, vec2(u, 0.12)).rgb;
        float inside = smoothstep(0.62, 0.45, abs(wp.x / W));
        float fall = exp(-max(wp.z, 0.0) / (H * 0.9)) * inside;
        vec3 col = c * fall * 0.32 * power + vec3(0.006) * power;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), floorMat);
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  const W = 6.4, H = 3.6, PITCH = 2.5, CY = H / 2 + 0.6;
  wallU.cells.value.set(Math.round(W * 1000 / PITCH), Math.round(H * 1000 / PITCH));

  // the built screen: a box-truss goal post around the wall, as Bendac rig it (same build as act 3's truss),
  // so stepping all the way back shows a real installed screen, not a picture filling the phone
  const pmrem = new THREE.PMREMGenerator(BX.renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(BX.renderer), 0.04).texture;
  const trussMat = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 0.92, roughness: 0.33, envMapIntensity: 0.55, transparent: true, opacity: 0 });
  const segs = [];
  function trussRun(a, b, size = 0.29) {
    const dir = b.clone().sub(a); const L = dir.length(); dir.normalize();
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(size / 2), v = new THREE.Vector3().crossVectors(dir, u).normalize().multiplyScalar(size / 2);
    const corners = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), u.clone().negate().add(v)];
    for (const cn of corners) segs.push([a.clone().add(cn), b.clone().add(cn), 0.024]);
    const n = Math.round(L / size);
    for (let f = 0; f < 4; f++) { const c0 = corners[f], c1 = corners[(f + 1) % 4];
      for (let i = 0; i < n; i++) { const p0 = a.clone().lerp(b, i / n).add(i % 2 ? c0 : c1), p1 = a.clone().lerp(b, (i + 1) / n).add(i % 2 ? c1 : c0); segs.push([p0, p1, 0.009]); } }
  }
  const TW = W / 2 + 0.45, TH = CY + H / 2 + 0.45, TZ = -0.25;
  trussRun(new THREE.Vector3(-TW, 0, TZ), new THREE.Vector3(-TW, TH, TZ));
  trussRun(new THREE.Vector3(TW, 0, TZ), new THREE.Vector3(TW, TH, TZ));
  trussRun(new THREE.Vector3(-TW - 0.15, TH, TZ), new THREE.Vector3(TW + 0.15, TH, TZ));
  const truss = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), trussMat, segs.length);
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    segs.forEach(([a, b, r], i) => { const d = b.clone().sub(a); q.setFromUnitVectors(Y, d.clone().normalize()); m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(r, d.length(), r)); truss.setMatrixAt(i, m); }); }
  scene.add(truss);
  // the wall lights the truss from inside the frame, and a soft fill shows the floor and legs
  const glow = new THREE.PointLight(0xcfe3ff, 6, 14, 1.6); glow.position.set(0, CY, 1.2); scene.add(glow);
  scene.add(new THREE.HemisphereLight(0x9aa3ad, 0x050606, 0.25));

  // the green pixel the wall collapses into
  const sparkU = { uSparkP: { value: new THREE.Vector3(0, CY, 0.02) }, uSize: { value: 1 }, uA: { value: 0 } };
  const spark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: sparkU, ...BX.sparkShader, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  spark.frustumCulled = false; spark.renderOrder = 10; scene.add(spark);

  // ---------- overlay
  const ov = null;
  const c1 = document.getElementById('a-c1'), c2 = document.getElementById('a-c2'), dist = document.querySelector('#a-dist b'), distEl = document.getElementById('a-dist');
  const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const band = (x, a, b, c, d) => clamp01((x - a) / (b - a)) * (1 - clamp01((x - c) / (d - c)));
  let px = 0, py = 0;

  function frame(t, dt, time, ptr) {
    const { w, h } = BX.size;
    camera.aspect = w / h;
    px += (ptr.x * 0.5 - px) * 0.06; py += (ptr.y * -0.5 - py) * 0.06;

    // 0.105 to 0.585: the walk back, 6 mm to 6.5 m (exponential, so it feels even)
    const walk = ease(clamp01((t - 0.105) / 0.615));
    // 0.585 to 0.72: keep stepping back until the whole built screen, truss and floor, sits in the free area
    // (on a phone that is far: the wall is wide and the phone is narrow), then hold it to 0.80
    const free = BX.free || { top: 0, bottom: 0, left: 0 };
    const fw = (w - (free.left || 0)) / w, fh = Math.max(0.3, (h - (free.top || 0) - (free.bottom || 0)) / h);
    const vf = THREE.MathUtils.degToRad(45) / 2, hf = Math.atan(Math.tan(vf) * w / h);
    const needW = (2 * TW + 0.6) / (0.9 * fw), needH = (TH + 0.5) / (0.8 * fh);
    const dEnd = Math.max(6.5, needW / (2 * Math.tan(hf)), needH / (2 * Math.tan(vf)));
    // one continuous move, 6 mm to the whole built screen: exponential in distance so every moment feels the
    // same speed, eased only at its very start and very end (Hugo 2026-11-01: no stop at 6.5 m on the way out)
    const d = 0.006 * Math.pow(dEnd / 0.006, walk);
    const pull = clamp01(Math.log(Math.max(d, 1) / 6.5) / Math.log(dEnd / 6.5));
    trussMat.opacity = smooth(3.0, 7.0, d) * (1 - smooth(0.79, 0.85, t)); truss.visible = trussMat.opacity > 0.002; trussMat.depthWrite = trussMat.opacity > 0.98;
    glow.intensity = 6 * (1 - smooth(0.78, 0.84, t));
    // 0.80 to 0.97: the picture collapses, first to a line, then to a point
    const cy1 = smooth(0.80, 0.88, t), cx1 = smooth(0.87, 0.95, t);
    const sy = Math.max(0.0015, 1 - cy1), sx = Math.max(0.0015, 1 - cx1);
    wall.scale.set(W * sx, H * sy, 1); wall.position.set(0, CY, 0);
    frameBox.scale.set((W + 0.06) * (1 - smooth(0.78, 0.86, t)) + 0.0001, (H + 0.06) * (1 - smooth(0.78, 0.86, t)) + 0.0001, 0.12); frameBox.position.set(0, CY, -0.09);
    wall.visible = t < 0.965;
    wallU.tint.value = smooth(0.84, 0.93, t);
    // the energy of the whole picture is squeezed into what is left of it
    wallU.power.value = (0.35 + 0.65 * clamp01(t / 0.03 + 0.35)) * (1 + 1.6 * cy1) * (1 - smooth(0.9, 0.965, t) * 0.5);
    floorMat.uniforms.power.value = (0.35 + 0.65 * clamp01(t / 0.03 + 0.35)) * (1 + 0.8 * pull) * (1 - smooth(0.79, 0.85, t));   // the spill goes before the picture starts to squeeze

    // camera: starts on one diode off-centre, ends square to the wall's centre (where the light will be)
    const eye = 1.6;
    const near = 1 - clamp01(walk * 1.4);
    // the first frame looks at the centre of one diode (cells are 2.5 mm, so offset half a cell from the grid line)
    const fx = 0.21125 * near, fy = CY + 0.11125 * near;
    const yLook0 = fy + (CY - fy) * (1 - near);
    const yLook = yLook0 + ((TH / 2) - yLook0) * pull * (1 - smooth(0.78, 0.86, t));
    const square = smooth(0.78, 0.88, t);
    const camY = (yLook + (eye - yLook) * clamp01((d - 1.5) / 6) * 0.6) * (1 - square) + CY * square;
    const sway = BX.reduced ? 0 : Math.min(d, 6) * 0.05 * (1 - square);
    camera.near = Math.max(0.0008, d * 0.02); camera.far = d + 400;
    camera.fov = 45;
    camera.position.set(fx + px * sway * 2, camY - py * sway, d);
    camera.lookAt(fx, yLook, 0);
    camera.updateProjectionMatrix();
    BX.applyFree(camera);

    // the light: a fixed size on screen, the same size act 2's light has on its first frame
    const pxPerM = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.distanceTo(sparkU.uSparkP.value));
    sparkU.uSize.value = (BX.sparkStartPx || BX.SPARK_PX) / pxPerM;
    sparkU.uA.value = smooth(0.89, 0.97, t);

    // words
    const o1 = 1 - smooth(0.2, 0.25, t), o2 = band(t, 0.33, 0.38, 0.985, 1.0);
    c1.style.opacity = o1.toFixed(3); c1.style.transform = `translateY(${((1 - o1) * -6).toFixed(1)}px)`;
    c2.style.opacity = o2.toFixed(3); c2.style.transform = `translateY(${((1 - o2) * 6).toFixed(1)}px)`;
    distEl.style.opacity = (1 - smooth(0.76, 0.82, t)).toFixed(3);
    const txt = d < 1 ? `${Math.max(1, Math.round(d * 1000))} mm` : `${d < 10 ? d.toFixed(1) : Math.round(d)} m`;
    if (dist.textContent !== txt) dist.textContent = txt;

    BX.renderer.render(scene, camera);
  }

  return {
    id: 'A', duration: 11, ov, videos: ['v-acc'], stillT: 0.6,
    label: 'One light',
    frame,
    compile() { camera.aspect = BX.size.w / BX.size.h; camera.position.set(0, CY, 3); camera.lookAt(0, CY, 0); BX.renderer.compile(scene, camera); },
  };
};
