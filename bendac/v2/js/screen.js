// built-from: Three.js r160 (MIT) standard physically lit meshes, TextureLoader, ShaderMaterial, CylinderGeometry.
// Screen content is Bendac's real media. Geometry is an illustrative LED cabinet assembly, not a product drawing.
import * as THREE from "three";
export function createDisplay(canvas, stage, reduced) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
  } catch {
    return null;
  }
  const mobile = matchMedia("(max-width:760px)").matches;
  let dpr = Math.min(devicePixelRatio || 1, mobile ? 1.4 : 1.6);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x080a09, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(mobile ? 39 : 32, 1, 0.1, 100);
  const assembly = new THREE.Group();
  scene.add(assembly);
  scene.add(new THREE.HemisphereLight(0xd1f5ba, 0x10170e, 2.5));
  const key = new THREE.DirectionalLight(0xf5fff0, 6);
  key.position.set(-3, 7, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa1ff60, 5);
  rim.position.set(5, 1, -4);
  scene.add(rim);
  const magenta = new THREE.PointLight(0xb25eec, 60, 20, 2);
  magenta.position.set(-5, 1, 4);
  scene.add(magenta);
  const cabinetMat = new THREE.MeshStandardMaterial({
    color: 0x222921,
    metalness: 0.72,
    roughness: 0.32,
  });
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x535c4b,
    metalness: 0.85,
    roughness: 0.3,
  });
  const loader = new THREE.TextureLoader();
  const sources = [
    "assets/img/prod-versa.webp",
    "assets/img/sport-smoke.webp",
    "assets/img/corp-corner.webp",
  ];
  let textures = [],
    current = 0,
    alive = true,
    visible = true,
    contextLost = false;
  const loading = sources.map((src, i) =>
    loader.load(src, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      textures[i] = t;
      if (current === i) {
        shared.uMap.value = t;
        shared.uLoaded.value = 1;
        render();
      }
    }),
  );
  const shared = {
    uMap: { value: loading[0] },
    uLoaded: { value: 0 },
    uResolution: { value: mobile ? 320 : 480 },
    uBrightness: { value: 1 },
    uFade: { value: 1 },
    uArtwork: { value: 1 },
    uTime: { value: 0 },
  };
  const front = new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: `attribute vec2 tileUV;varying vec2 vUv;void main(){vUv=(uv+tileUV)/vec2(10.,6.);gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
    fragmentShader: `precision highp float;varying vec2 vUv;uniform sampler2D uMap;uniform float uLoaded;uniform float uResolution;uniform float uBrightness;uniform float uFade;uniform float uArtwork;uniform float uTime;
 void main(){vec2 grid=vec2(uResolution*1.7,uResolution);vec2 cell=floor(vUv*grid);vec2 f=fract(vUv*grid)-.5;vec2 sampleUv=(cell+.5)/grid;if(uArtwork>.5){sampleUv=vec2(.31+sampleUv.x*.37,.19+sampleUv.y*.61);sampleUv.x+=sin(sampleUv.y*7.+uTime*.3)*.018;}vec3 c=texture2D(uMap,sampleUv).rgb;float ppc=1./max(fwidth(vUv.y*grid.y),.001);float dotMask=1.-smoothstep(.24,.48,length(f));float fill=1.-smoothstep(1.,3.2,ppc);c*=mix(dotMask*.8+.22,1.,fill);vec3 ambient=vec3(.12,.23,.06);gl_FragColor=vec4(mix(ambient,c*uBrightness,uLoaded)*uFade,1.);}`,
    side: THREE.FrontSide,
    extensions: { derivatives: true },
  });
  const COLS = 10,
    ROWS = 6,
    W = 8.7,
    H = 4.65,
    CW = W / COLS,
    CH = H / ROWS;
  const tiles = [],
    count = COLS * ROWS;
  const cases = new THREE.InstancedMesh(
    new THREE.BoxGeometry(CW - 0.012, CH - 0.012, 0.18),
    cabinetMat,
    count,
  );
  const rails = new THREE.InstancedMesh(
    new THREE.BoxGeometry(CW * 0.66, CH * 0.065, 0.06),
    railMat,
    count * 2,
  );
  const sockets = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.19, 0.26, 0.065),
    cabinetMat,
    count,
  );
  const frontGeometry = new THREE.PlaneGeometry(CW - 0.026, CH - 0.026),
    uvOffsets = new Float32Array(count * 2);
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      uvOffsets[i * 2] = x;
      uvOffsets[i * 2 + 1] = ROWS - 1 - y;
      const tx = (x + 0.5 - COLS / 2) * CW,
        ty = (ROWS / 2 - y - 0.5) * CH,
        theta = tx * 0.14;
      tiles.push({
        x: Math.sin(theta) / 0.14,
        y: ty,
        z: -(1 - Math.cos(theta)) / 0.14,
        ry: -theta,
        spread: (x - COLS / 2) * 0.12,
      });
    }
  frontGeometry.setAttribute(
    "tileUV",
    new THREE.InstancedBufferAttribute(uvOffsets, 2),
  );
  const screens = new THREE.InstancedMesh(frontGeometry, front, count);
  for (const mesh of [cases, rails, sockets, screens]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    assembly.add(mesh);
  }
  const dummy = new THREE.Object3D(),
    offset = new THREE.Matrix4(),
    matrix = new THREE.Matrix4();
  function updateTiles(spread) {
    tiles.forEach((d, i) => {
      dummy.position.set(
        d.x * (1 + spread * 0.22),
        d.y * (1 + spread * 0.16),
        d.z + Math.sin(i * 0.7) * spread * 0.5,
      );
      dummy.rotation.set(0, d.ry + spread * d.spread, 0);
      dummy.updateMatrix();
      cases.setMatrixAt(i, dummy.matrix);
      offset.makeTranslation(0, 0, 0.099);
      matrix.multiplyMatrices(dummy.matrix, offset);
      screens.setMatrixAt(i, matrix);
      offset.makeTranslation(0, CH * 0.3, -0.12);
      matrix.multiplyMatrices(dummy.matrix, offset);
      rails.setMatrixAt(i * 2, matrix);
      offset.makeTranslation(0, -CH * 0.3, -0.12);
      matrix.multiplyMatrices(dummy.matrix, offset);
      rails.setMatrixAt(i * 2 + 1, matrix);
      offset.makeTranslation(0, 0, -0.14);
      matrix.multiplyMatrices(dummy.matrix, offset);
      sockets.setMatrixAt(i, matrix);
    });
    for (const mesh of [cases, rails, sockets, screens])
      mesh.instanceMatrix.needsUpdate = true;
  }
  updateTiles(0);
  // A real studio floor with a soft transparent contact shadow; no full-screen postprocessing on phones.
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const ctx = shadowCanvas.getContext("2d");
  const gr = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "rgba(0,0,0,.9)");
  gr.addColorStop(0.35, "rgba(0,0,0,.45)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(17, 8),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas),
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -3.05;
  scene.add(shadow);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({
      color: 0x12200d,
      metalness: 0.5,
      roughness: 0.36,
      transparent: true,
      opacity: 0.22,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.1;
  scene.add(floor);
  // Sparse studio lines expose the floor plane and scale without distracting from the LED.
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x63804a,
    transparent: true,
    opacity: 0.11,
  });
  for (let x = -12; x <= 12; x += 3) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, -3.08, -8),
      new THREE.Vector3(x, -3.08, 12),
    ]);
    scene.add(new THREE.Line(geo, lineMat));
  }
  let pointer = { x: 0, y: 0 },
    rotation = { x: 0, y: 0 },
    dragging = false,
    startX = 0,
    drag = 0,
    progress = 0,
    frames = 0,
    slowFrames = 0,
    last = 0,
    drawn = 0;
  const updateProgress = () => {
    progress = Math.min(1, Math.max(0, scrollY / innerHeight));
  };
  window.addEventListener("scroll", updateProgress, { passive: true });
  stage.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (dragging)
      drag = Math.max(
        -0.6,
        Math.min(0.6, ((e.clientX - startX) / r.width) * 1.4),
      );
  });
  stage.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    $("#stageHint")?.setAttribute("hidden", "");
  });
  stage.addEventListener("pointerup", () => (dragging = false));
  stage.addEventListener("pointercancel", () => (dragging = false));
  stage.addEventListener("pointerleave", () => {
    pointer.x = 0;
    pointer.y = 0;
    dragging = false;
  });
  function $(s) {
    return document.querySelector(s);
  }
  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const portrait = width < 760;
    if (portrait) {
      const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const distance = Math.max(W / (2 * halfFov * camera.aspect) * 1.1, H / (2 * halfFov) * 1.2);
      camera.position.set(0.1, 0.5, distance);
      camera.lookAt(0, -0.3, 0);
      assembly.scale.setScalar(1.05);
      assembly.position.set(-0.65, -0.1, 0);
    } else {
      camera.position.set(0.2, 0.8, 15);
      camera.lookAt(0, 0, 0);
      assembly.scale.setScalar(1);
      assembly.position.set(2, -0.1, 0);
    }
    render();
  }
  function render() {
    if (!alive || contextLost) return;
    renderer.render(scene, camera);
    drawn++;
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  const io = new IntersectionObserver(
    (es) => {
      visible = es[0].isIntersecting;
      if (visible) last = performance.now();
    },
    { rootMargin: "80px" },
  );
  io.observe(stage);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) last = performance.now();
  });
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    contextLost = true;
    stage.classList.remove("has-webgl");
    $("#renderMode").hidden = false;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    stage.classList.add("has-webgl");
    $("#renderMode").hidden = true;
  });
  const smooth = (a, b, t) => a + (b - a) * t;
  function frame(t) {
    if (!alive) return;
    requestAnimationFrame(frame);
    if (!visible || document.hidden || contextLost) return;
    const delta = last ? (t - last) / 1000 : 0.016;
    last = t;
    rotation.x = smooth(rotation.x, reduced ? 0 : pointer.y * 0.09, 0.045);
    rotation.y = smooth(
      rotation.y,
      reduced ? 0 : pointer.x * 0.16 + drag,
      0.045,
    );
    assembly.rotation.set(-0.07 + rotation.x, -0.33 + rotation.y, -0.075);
    assembly.position.y =
      (mobile ? -0.1 : -0.1) + (reduced ? 0 : Math.sin(t * 0.0006) * 0.09);
    shared.uTime.value = t * 0.001;
    const spread = reduced ? 0 : Math.max(0, 0.65 - progress * 2) * 0.32;
    updateTiles(spread);
    key.position.x = -3 + rotation.y * 8;
    shared.uResolution.value = mobile ? 310 : 450;
    if (
      !reduced ||
      frames === 0 ||
      Math.abs(rotation.x) + Math.abs(rotation.y) > 0.001
    )
      render();
    frames++;
    if (delta > 0.032) slowFrames++;
    if (frames === 120 && slowFrames > 45) {
      dpr = 1;
      renderer.setPixelRatio(1);
      resize();
      $("#renderMode").hidden = false;
      $("#renderMode").textContent = "Reduced effects · lighter on your device";
    }
  }
  resize();
  requestAnimationFrame(frame);
  return {
    setScene(i) {
      current = i;
      shared.uArtwork.value = i === 0 ? 1 : 0;
      shared.uMap.value = textures[i] || loading[i];
      shared.uLoaded.value = textures[i] ? 1 : 0;
      render();
    },
    stats() {
      return {
        drawn,
        dpr,
        visible,
        contextLost,
        drawCalls: renderer.info.render.calls,
        ready: shared.uLoaded.value === 1,
        rotation: { ...rotation },
        triangles: renderer.info.render.triangles,
        tiles: tiles.length,
        reduced,
      };
    },
    dispose() {
      alive = false;
      io.disconnect();
      resizeObserver.disconnect();
      renderer.dispose();
    },
  };
}
