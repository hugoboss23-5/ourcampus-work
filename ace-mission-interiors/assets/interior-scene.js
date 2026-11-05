// 2026-09-05. Plan-local interior renderer, Three.js r165.
// Appearance is sourced from the supplied photographs; framing member sizes,
// roof pitch, fixture spacing and service elevations are visual estimates.
// Owns no renderer, animation loop, navigation or external state.
import * as THREE from 'three';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const Y = new THREE.Vector3(0, 1, 0);
let areaLightUniformsInitialized = false;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const point = p => Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p.x), Number(p.z)];
const hash = s => [...s].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function inside(x, z, poly) {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}
function scan(poly, axis, at) {
  const hits = [], along = axis === 'x' ? 0 : 1, across = 1 - along;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[across] <= at && b[across] > at) || (b[across] <= at && a[across] > at)) {
      hits.push(a[along] + (at - a[across]) / (b[across] - a[across]) * (b[along] - a[along]));
    }
  }
  hits.sort((a, b) => a - b);
  return hits.reduce((out, n, i) => { if (!(i % 2) && hits[i + 1] - n > .02) out.push([n, hits[i + 1]]); return out; }, []);
}
function clipX(poly, x, greater) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ai = greater ? a[0] >= x : a[0] <= x, bi = greater ? b[0] >= x : b[0] <= x;
    if (ai) out.push(a);
    if (ai !== bi) out.push([x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])]);
  }
  return out;
}

// Procedural material maps are not photographic replacements. Tile size is a
// rendering estimate; fixed seeds make revisiting a room visually consistent.
function canvasMap(kind, seed, size = 512) {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') :
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : null;
  if (!canvas) return new THREE.DataTexture(new Uint8Array([205, 205, 205, 255]), 1, 1);
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), rng = random(seed);
  ctx.fillStyle = kind === 'concrete' ? '#c3c3bf' : '#d7d7d3'; ctx.fillRect(0, 0, size, size);
  if (kind === 'contact') {
    ctx.clearRect(0,0,size,size);const g=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size*.5);g.addColorStop(0,'rgba(0,0,0,.55)');g.addColorStop(.22,'rgba(0,0,0,.3)');g.addColorStop(.6,'rgba(0,0,0,.07)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,size,size);
  } else if (kind === 'tile' || kind === 'insulation') {
    ctx.fillStyle=kind==='tile'?'#ededE8':'#e5e5dc';ctx.fillRect(0,0,size,size);
    ctx.strokeStyle=kind==='tile'?'#c4c9c7':'#cfd0c8';ctx.lineWidth=kind==='tile'?4:1.5;ctx.strokeRect(1,1,size-2,size-2);
    for(let i=0;i<3500;i++){ctx.fillStyle='rgba(64,72,63,.03)';ctx.fillRect(rng()*size,rng()*size,.7,.7);}
  } else if (kind === 'carpet') {
    ctx.fillStyle='#c0b9aa';ctx.fillRect(0,0,size,size);
    for(let i=0;i<24000;i++){const v=80+Math.floor(rng()*100);ctx.fillStyle=`rgba(${v},${v-6},${v-12},.12)`;ctx.fillRect(rng()*size,rng()*size,.7,1.1);}
  } else if (kind === 'concrete') {
    for (let i = 0; i < 250; i++) {
      const x = rng() * size, y = rng() * size, r = 20 + rng() * 110;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, i % 2 ? 'rgba(255,255,255,.018)' : 'rgba(35,40,36,.012)'); g.addColorStop(1, 'rgba(100,100,100,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 17000; i++) {
      const v = 75 + Math.floor(rng() * 150);
      ctx.fillStyle = `rgba(${v},${v},${v},${.02 + rng() * .1})`; ctx.fillRect(rng() * size, rng() * size, rng() * 1.8, rng() * 1.5);
    }
    ctx.lineWidth = .6; ctx.strokeStyle = 'rgba(62,65,61,.2)';
    for (let i = 0; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * size / 2, 0); ctx.lineTo(i * size / 2, size); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * size / 2); ctx.lineTo(size, i * size / 2); ctx.stroke(); }
    for (let i = 0; i < 3; i++) {
      let x = rng() * size, z = rng() * size;
      ctx.beginPath(); ctx.moveTo(x, z);
      for (let n = 0; n < 8; n++) { x += (rng() - .45) * 13; z += 5 + rng() * 8; ctx.lineTo(x, z); }
      ctx.lineWidth = .35; ctx.strokeStyle = 'rgba(57,60,55,.20)'; ctx.stroke();
    }
  } else if (kind === 'timber') {
    ctx.fillStyle = '#b7a78e'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = `rgba(43,31,17,${.025 + rng() * .065})`; ctx.fillRect(rng() * size, rng() * size, 30 + rng() * 220, .3 + rng());
    }
    for (let z = 0; z < size; z += 64) { ctx.fillStyle = 'rgba(34,28,20,.4)'; ctx.fillRect(0, z, size, 2); }
    for (let i = 0; i < 18; i++) { ctx.strokeStyle = 'rgba(55,42,23,.12)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.ellipse(rng() * size, rng() * size, 7 + rng() * 12, 2 + rng() * 3, 0, 0, Math.PI * 2); ctx.stroke(); }
  } else if (kind === 'acoustic') {
    ctx.fillStyle = '#c2c3c1'; ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 64) for (let x = 0; x < size; x += 32) {
      const g = ctx.createLinearGradient(x, 0, x + 32, 0); g.addColorStop(0, '#aeb0ae'); g.addColorStop(.4, '#d0d1ce'); g.addColorStop(1, '#b9bab7'); ctx.fillStyle = g; ctx.fillRect(x + .8, y + 1, 30.4, 62);
    }
    for (let i = 0; i < 9000; i++) { ctx.fillStyle = 'rgba(45,50,47,.045)'; ctx.fillRect(rng() * size, rng() * size, 1, 2); }
  } else if (kind === 'chain') {
    ctx.clearRect(0, 0, size, size); ctx.strokeStyle = '#aab3b5'; ctx.lineWidth = 4;
    for (let p = -size; p <= size; p += size / 4) { ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p + size, size); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p + size, 0); ctx.lineTo(p, size); ctx.stroke(); }
  } else {
    // Corrugated underside, with continuous seams rather than generic wood.
    for (let x = 0; x < size; x += 32) { const g = ctx.createLinearGradient(x, 0, x + 32, 0); g.addColorStop(0, '#b7bcba'); g.addColorStop(.18, '#ecece5'); g.addColorStop(.5, '#d6d8d0'); g.addColorStop(.74, '#bcc2bd'); g.addColorStop(1, '#b0b7b2'); ctx.fillStyle = g; ctx.fillRect(x, 0, 32, size); }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

export function buildInteriorScene(room) {
  if (!room || !(room.width > 0) || !(room.depth > 0)) throw new Error('Interior room requires positive meter dimensions.');
  if (!areaLightUniformsInitialized) { RectAreaLightUniformsLib.init(); areaLightUniformsInitialized = true; }
  const W = room.width, D = room.depth, H = room.height > 0 ? room.height : (room.office ? 3.2 : 7);
  const rawId = String(room.id || ''), upper = !!room.upperLevel || /mezzanine/.test(rawId);
  const id = upper && /ace7|a7/.test(rawId) ? 'ace7' : rawId.replace(/^a([2-7])$/, 'ace$1');
  const office = !!room.office, stage = /^m[1-4]$/.test(id), wood = id === 'ace2' || id === 'ace3' || id === 'ace4';
  const openWeb = id === 'ace5' || id === 'ace7';
  const dark = stage && id !== 'm3';
  const app = room.appearance || {}, palette = app.finishes?.hexEstimates || {};
  const footprint = (room.footprint || [[0, 0], [W, 0], [W, D], [0, D]]).map(point);
  const balcony=upper&&id==='ace7',mezzanineLevel=Number(room.mezzanineHeight)||3.1;
  const envelopeFootprint=balcony?[[0,0],[W,0],[W,D],[0,D]]:footprint;
  const columns = (room.columns || []).map(c => ({x: point(c)[0], z: point(c)[1]})).filter(c => Number.isFinite(c.x + c.z));
  const scene = new THREE.Scene(); scene.name = `Interior: ${room.name || rawId}`;
  scene.background = new THREE.Color(stage ? '#9da9b1' : '#c9d9e3');
  const groups = {};
  for (const name of ['shell', 'structure', 'services', 'lights', 'details']) { groups[name] = new THREE.Group(); groups[name].name = name; scene.add(groups[name]); }
  const geometries = new Set(), materials = new Set(), textures = new Set(), instanced = new Map(), merged = new Map();
  const features = [], shadows = [], warnings = [];
  const stats = {roomId: rawId, columns: columns.length, contextColumns: 0, roofApertures: 0, physicalLampFixtures: 0, renderedDoors: 0, renderedWindows: 0, inferredDoorHeads: 0, wallSegments: 0, instancedMeshes: 0, instances: 0, mergedMeshes: 0, meshes: 0, triangles: 0, drawCallsEstimate: 0, textures: 0, lights: 0, approximateFeatures: features};
  const seed = hash(rawId);
  const ownGeo = g => (geometries.add(g), g);
  const ownTex = t => (textures.add(t), t);
  const carpet550=id==='550-level1', resilient550=id==='550-level2';
  const concreteMap = ownTex(canvasMap(carpet550?'carpet':'concrete', seed));
  const roofMap = ownTex(canvasMap(office?'tile':id==='m3'?'insulation':wood ? 'timber' : dark ? 'acoustic' : 'metal', seed + 2));
  const contactMap=ownTex(canvasMap('contact',seed,128));contactMap.wrapS=contactMap.wrapT=THREE.ClampToEdgeWrapping;
  const wallMap = stage ? ownTex(canvasMap('acoustic', seed + 3)) : null;
  function material(color, opts = {}) { const m = new THREE.MeshStandardMaterial({color, roughness: .78, metalness: .03, ...opts}); materials.add(m); return m; }
  const mats = {
    floor: material(carpet550?'#ad9e86':resilient550?'#cfba91':palette.floor || '#b8b7ac', {map: concreteMap, roughness: carpet550?.98:resilient550?.4:stage?.9:.86, metalness: 0}),
    wall: material(palette.wall || palette.wallLight || (stage ? '#20252a' : '#d8d6cc'), {map: wallMap, bumpMap: wallMap, bumpScale: .025}),
    wallDark: material(palette.wallDark || '#292e33'),
    roof: material(office ? '#f0f0e8' : palette.ceiling || palette.roofInsulation || palette.roof || palette.timber || (dark ? '#252a2d' : '#c5c8c0'), {map: roofMap, bumpMap: roofMap, bumpScale: wood ? .006 : .001, side: THREE.DoubleSide, emissive:office||id==='m3'?'#e0e5df':dark?'#252a2d':'#9fa8a3',emissiveIntensity:office?.2:id==='m3'?.24:dark?.055:.055}),
    steel: material(palette.steel || palette.girder || (wood ? '#67513a' : dark ? '#383834' : '#bfc6be'), {metalness: wood ? .03 : .3, roughness: .64}),
    column: material(palette.column || (stage ? '#d5d4c9' : '#a8aea8'), {metalness: .3, roughness: .55}),
    yellow: material(palette.guardYellow || palette.guard || '#dfb900', {roughness: .55}),
    blue: material(palette.guardBlue || '#173c79', {roughness: .55}),
    burgundy: material(palette.guardBurgundy || '#783c36'),
    black: material('#151a1c', {roughness: .56, metalness: .22}),
    trim: material('#777f7d', {metalness: .48, roughness: .45}),
    duct: material(palette.duct || '#aeb8b9', {metalness: id === 'm4' ? .28 : .68, roughness: .4}),
    rail: material(palette.mezzSteel || (id === 'm3' ? '#183d7b' : '#6e7b7b'), {metalness: .45, roughness: .52}),
    white: material('#dadbd2'),
    officeTrim: material(/^550/.test(id)?'#9b6a3f':'#dadbd2',{roughness:.65,metalness:0}),
    door: material(palette.door || (stage ? '#343d40' : '#8f9490'), {roughness: .62, metalness: .25}),
    tube: material('#f4f7ef', {emissive: '#f2f9ed', emissiveIntensity: 3.2, roughness: .4}),
    daylight: material('#d9e9f0', {emissive: '#d9eaff', emissiveIntensity: 1.25, side: THREE.DoubleSide}),
    red: material('#a32922', {roughness: .55}),
    green: material('#26794e', {emissive: '#287e50', emissiveIntensity: .4}),
    baseAO: new THREE.MeshBasicMaterial({map:contactMap,transparent:true,opacity:.6,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1})
  };
  materials.add(mats.baseAO);
  const boxGeo = ownGeo(new THREE.BoxGeometry(1, 1, 1));
  const cylGeo = ownGeo(new THREE.CylinderGeometry(1, 1, 1, 16));
  const ringGeo = ownGeo(new THREE.TorusGeometry(1, .018, 4, 20));
  const sphereGeo = ownGeo(new THREE.SphereGeometry(1, 8, 6));
  const contactGeo=ownGeo(new THREE.PlaneGeometry(1,1));
  const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
  function instance(geo, mat, position, scaling, rotation, group = 'structure', cast = true) {
    if (!position.every(Number.isFinite) || !scaling.every(n => n > 0 && Number.isFinite(n))) return;
    const key = `${geo.uuid}:${mat.uuid}:${group}:${cast}`;
    if (!instanced.has(key)) instanced.set(key, {geo, mat, group, cast, matrices: []});
    pos.fromArray(position); scale.fromArray(scaling);
    quat.copy(rotation || new THREE.Quaternion()); matrix.compose(pos, quat, scale);
    instanced.get(key).matrices.push(matrix.clone());
  }
  function box(x, y, z, w, h, d, mat, group = 'structure', rot = null, cast = true) { instance(boxGeo, mat, [x, y, z], [w, h, d], rot, group, cast); }
  function cylinder(x, y, z, radius, height, mat, group = 'services', rotation = null) { instance(cylGeo, mat, [x, y, z], [radius, height, radius], rotation, group); }
  function bar(a, b, width, depth, mat, group = 'structure') {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), dir = vb.clone().sub(va), len = dir.length();
    if (len < .005) return;
    dir.normalize();
    let up = Y.clone().addScaledVector(dir, -dir.y);
    if (up.lengthSq() < .001) up.set(1, 0, 0); else up.normalize();
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, up, side));
    const middle = va.add(vb).multiplyScalar(.5);
    instance(boxGeo, mat, middle.toArray(), [len, depth, width], q, group);
  }
  function pipe(a, b, radius, mat = mats.duct) {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), d = bv.clone().sub(av), length = d.length();
    if (length < .001) return;
    const q = new THREE.Quaternion().setFromUnitVectors(Y, d.normalize());
    instance(cylGeo, mat, av.add(bv).multiplyScalar(.5).toArray(), [radius, length, radius], q, 'services');
  }
  function custom(geometry, mat, group = 'shell', cast = true) {
    if (!geometry || !geometry.getAttribute('position')?.count) { geometry?.dispose(); return; }
    const key = `${mat.uuid}:${group}:${cast}`;
    if (!merged.has(key)) merged.set(key, {mat, group, cast, geometries: []});
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
    if (nonIndexed !== geometry) geometry.dispose();
    if (!nonIndexed.getAttribute('normal')) nonIndexed.computeVertexNormals();
    if (!nonIndexed.getAttribute('uv')) nonIndexed.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(nonIndexed.getAttribute('position').count * 2), 2));
    merged.get(key).geometries.push(nonIndexed);
  }
  function surface(poly, height, mat, holes = [], group = 'shell', cast = true) {
    if (poly.length < 3) return;
    const shape = new THREE.Shape(poly.map(p => new THREE.Vector2(...p)));
    for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(p => new THREE.Vector2(...p))));
    const geometry = new THREE.ShapeGeometry(shape), p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getY(i); p.setXYZ(i, x, typeof height === 'function' ? height(x, z) : height, z);const tile=mat===mats.roof&&office;uv.setXY(i,x/(tile?.61:8),z/(tile?1.22:8));
    }
    // XY triangulation becomes clockwise when mapped onto +Z ground plane.
    const index = geometry.index;
    for (let i = 0; i < index.count; i += 3) { const b = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, b); }
    geometry.computeVertexNormals(); custom(geometry, mat, group, cast);
  }
  function polygonWall(a, b, y0, h0, h1, mat, thickness = .2, group = 'shell') {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < .01 || Math.min(h0, h1) <= y0) return;
    const nx = -dz / len * thickness / 2, nz = dx / len * thickness / 2;
    const verts = [a[0]-nx,y0,a[1]-nz,b[0]-nx,y0,b[1]-nz,b[0]-nx,h1,b[1]-nz,a[0]-nx,h0,a[1]-nz,a[0]+nx,y0,a[1]+nz,b[0]+nx,y0,b[1]+nz,b[0]+nx,h1,b[1]+nz,a[0]+nx,h0,a[1]+nz];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex([0,2,1,0,3,2,4,5,6,4,6,7,0,4,7,0,7,3,1,2,6,1,6,5,3,7,6,3,6,2,0,1,5,0,5,4]);
    const uvs = [0,0,len/4,0,len/4,h1/4,0,h0/4,0,0,len/4,0,len/4,h1/4,0,h0/4];
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    // Duplicate each face's vertices before normals: joined 90-degree wall
    // corners must not interpolate like rounded cylinders.
    const hard=g.toNonIndexed();g.dispose();hard.computeVertexNormals();custom(hard,mat,group);stats.wallSegments++;
  }
  function rect(boxUV) { const [a,b,c,d] = boxUV; return [[a*W,b*D],[c*W,b*D],[c*W,d*D],[a*W,d*D]]; }
  function feature(name, extra = {}) { features.push({name, evidence: 'Source appearance; unmeasured member sizes/elevations/spacing are approximate.', ...extra}); }
  const roofRise = !upper && !office ? id === 'm3' ? Math.min(2.2, H * .2) : id === 'm4' ? Math.min(2.4, H * .22) : 0 : 0;
  const roofAt = (x, z) => H - roofRise * Math.abs(x - W / 2) / (W / 2);
  const holes = [], roofHoles = [], apertures = [];
  const loadingPits = id === 'm3' && !upper ? [[.655,.705,.952,.794],[.71,.835,.985,.975]] : [];
  for (const r of loadingPits) { const p = rect(r); if (p.every(([x,z]) => inside(x,z,footprint))) holes.push(p); }
  surface(footprint, 0, mats.floor, holes);
  if(balcony){
    surface(envelopeFootprint,-mezzanineLevel,mats.floor);
    for(let i=0;i<envelopeFootprint.length;i++)polygonWall(envelopeFootprint[i],envelopeFootprint[(i+1)%envelopeFootprint.length],-mezzanineLevel,H,H,mats.wall,.2);
    feature('Warehouse enclosure below and beyond Seven balcony',{groundFloorY:-mezzanineLevel,evidence:'Full rectangular ground envelope and two ground supports from Ace Seven plan; balcony elevation is estimated.'});
  }
  // Thin slab edge gives door thresholds/upper mezzanine an actual thickness.
  for (let i = 0; i < footprint.length; i++) polygonWall(footprint[i], footprint[(i+1)%footprint.length], -.16, 0, 0, mats.floor, .1);
  for (let k = 0; k < holes.length; k++) {
    const p = holes[k], depth = .75; surface(p, -depth, mats.floor);
    for (let i=0;i<p.length;i++) polygonWall(p[i],p[(i+1)%p.length],-depth,0,0,mats.trim,.12);
    feature('Mission Three loading recess', {polygon:p, floorY:-depth, collision:'Exclude from walkable floor; depth is estimated.'});
  }
  if (!office && !upper && ['ace5','ace6','ace7'].includes(id)) {
    const coords = id === 'ace6' ? [.25,.5,.75].flatMap(v=>[.31,.69].map(u=>[u,v])) : id === 'ace5' ? [.16,.34,.52,.70,.88].flatMap(u=>[.64,.85].map(v=>[u,v])) : [.2,.5,.8].flatMap(u=>[.28,.73].map(v=>[u,v]));
    const sw = id==='ace5'?2:1.8, sd = id==='ace6'?2.1:1.8;
    for (const [u,v] of coords) {
      const x=u*W,z=v*D,p=[[x-sw/2,z-sd/2],[x+sw/2,z-sd/2],[x+sw/2,z+sd/2],[x-sw/2,z+sd/2]];
      if (!p.every(([px,pz])=>inside(px,pz,footprint))) continue;
      roofHoles.push(p); apertures.push({x,z,w:sw,d:sd});
    }
  }
  if (upper && id==='ace7') {
    for (const [u,v] of [.2,.5,.8].flatMap(u=>[.28,.73].map(v=>[u,v]))) {
      const x=u*W,z=v*D,p=[[x-.65,z-.65],[x+.65,z-.65],[x+.65,z+.65],[x-.65,z+.65]];
      if (p.every(([px,pz])=>inside(px,pz,envelopeFootprint))) {roofHoles.push(p);apertures.push({x,z,w:1.3,d:1.3});}
    }
  }
  if (roofRise) { for (const side of [false,true]) surface(clipX(footprint,W/2,side),roofAt,mats.roof,[],'shell',true); }
  else surface(envelopeFootprint,H,mats.roof,roofHoles,'shell',true);
  stats.roofApertures=apertures.length;
  for (const a of apertures) {
    const y=H+.05;
    box(a.x,y+.3,a.z,a.w,.04,a.d,mats.daylight,'lights',null,false);
    for (const dx of [-a.w/2,a.w/2]) box(a.x+dx,y+.11,a.z,.1,.3,a.d+.12,mats.trim,'details');
    for (const dz of [-a.d/2,a.d/2]) box(a.x,y+.11,a.z+dz,a.w+.12,.3,.1,mats.trim,'details');
    bar([a.x,H-.02,a.z-a.d/2],[a.x,H-.02,a.z+a.d/2],.05,.055,mats.steel,'details');
  }
  function nearSkylight(x,z,margin=.2) {return apertures.some(a=>Math.abs(x-a.x)<a.w/2+margin&&Math.abs(z-a.z)<a.d/2+margin);}

  // Full wall input can include office/service partitions. Openings are gaps
  // in the wall geometry; supplied explicit door gaps remain untouched.
  const walls = (room.walls?.length ? room.walls : footprint.map((a,i)=>({a,b:footprint[(i+1)%footprint.length],kind:'perimeter'}))).map(w=>({...w,doors:[...(w.doors||[])]}));
  // Plan evidence indexes the original footprint boundary, not arbitrary
  // partition order. Project each source center onto the matching wall so
  // reversed and split perimeter segments are handled without moving the door.
  for(const opening of room.perimeterOpenings||[]) {
    if(opening.render===false||opening.closedByDrywall||opening.status==='drywalled'||opening.kind==='drywalled'||opening.kind==='infilled-connection')continue;
    const a=footprint[opening.edgeIndex],b=footprint[(opening.edgeIndex+1)%footprint.length];
    if(!a||!b)continue;
    const center=[THREE.MathUtils.lerp(a[0],b[0],opening.t),THREE.MathUtils.lerp(a[1],b[1],opening.t)];
    for(const wall of walls) {
      if(wall.kind!=='perimeter'&&!wall.perimeter)continue;
      const wa=point(wall.a),wb=point(wall.b),dx=wb[0]-wa[0],dz=wb[1]-wa[1],l2=dx*dx+dz*dz;
      const t=((center[0]-wa[0])*dx+(center[1]-wa[1])*dz)/l2;
      if(t<0||t>1||Math.abs((center[0]-wa[0])*dz-(center[1]-wa[1])*dx)/Math.sqrt(l2)>.04)continue;
      if(!wall.doors.some(d=>Math.abs((d.t-t)*Math.sqrt(l2))<.15))wall.doors.push({...opening,t,open:opening.open===true});
      break;
    }
  }
  if(room.perimeterOpenings?.length)feature('Source-plan perimeter door positions',{evidence:'Published opening counts/sizes where available; plan-digitized center locations are approximate.',count:room.perimeterOpenings.length});
  const wallCenter = [W/2,D/2];
  function doorDetails(a,b,lo,hi,bottom,height,door={},wallHeight=H) {
    const len=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len;
    const at=t=>[a[0]+dx*t,a[1]+dz*t],left=at(lo),right=at(hi),center=at((lo+hi)/2),wide=hi-lo;
    const yaw=new THREE.Quaternion().setFromAxisAngle(Y,-Math.atan2(dz,dx));
    const shutter=/dock|rollup|roller/i.test(door.kind||door.type||'')||(!door.kind&&!door.type&&wide>2);
    let nx=-dz,nz=dx;
    if (Math.hypot(center[0]+nx*.4-wallCenter[0],center[1]+nz*.4-wallCenter[1])>Math.hypot(center[0]-nx*.4-wallCenter[0],center[1]-nz*.4-wallCenter[1])) {nx=-nx;nz=-nz;}
    const trimMat=office?mats.officeTrim:mats.trim;
    for (const p of [left,right]) bar([p[0],bottom,p[1]],[p[0],bottom+height,p[1]],office?.07:.14,office?.09:.14,trimMat,'details');
    bar([left[0],bottom+height,left[1]],[right[0],bottom+height,right[1]],office?.07:.2,office?.09:.19,trimMat,'details');
    if (door.open !== true && !office && !door.passage && shutter) {
      // A closed ribbed shutter remains inset behind the cut opening.
      box(center[0]-nx*.12,bottom+height/2,center[1]-nz*.12,wide-.06,height,.055,mats.door,'details',yaw);
      for(let y=bottom+.18;y<bottom+height;y+=.19) bar([left[0]-nx*.16,y,left[1]-nz*.16],[right[0]-nx*.16,y,right[1]-nz*.16],.022,.014,mats.trim,'details');
      box(center[0],bottom+height+.14,center[1],wide+.3,.24,.27,mats.door,'details',yaw);
    if(id==='ace3'&&/dock/i.test(door.kind||'')) {
        // The source photographs distinguish this numbered dock bank from
        // the three plain connecting shutters on the opposite side.
        for(const t of [.22,.5,.78]){const p=at(lo+wide*t);box(p[0]+nx*.02,bottom+Math.min(2.0,height*.56),p[1]+nz*.02,Math.min(.62,wide*.19),.18,.065,mats.black,'details',yaw);}
        for(const p of [left,right])bar([p[0]+nx*.07,bottom,p[1]+nz*.07],[p[0]+nx*.07,bottom+height+.38,p[1]+nz*.07],.07,.08,mats.white,'details');
      }
    }
    if(door.open!==true&&!office&&!door.passage&&!door.window&&!shutter){
      box(center[0]-nx*.035,bottom+height/2,center[1]-nz*.035,wide-.04,height,.055,mats.door,'details',yaw);
      const handle=at(hi-.18);box(handle[0]+nx*.025,bottom+1.02,handle[1]+nz*.025,.09,.04,.08,mats.trim,'details',yaw);
      if(/double/.test(door.kind||'')){bar([center[0]+nx*.01,bottom,center[1]+nz*.01],[center[0]+nx*.01,bottom+height,center[1]+nz*.01],.025,.025,mats.trim,'details');bar([left[0]+nx*.04,bottom+1.02,left[1]+nz*.04],[right[0]+nx*.04,bottom+1.02,right[1]+nz*.04],.035,.035,mats.trim,'details');}
    }
    if (!office && shutter) {
      const guard=id==='m3'?mats.blue:mats.yellow;
      for(const p of [left,right]) cylinder(p[0]+nx*.38,.52,p[1]+nz*.38,.085,1.04,guard,'details');
    }
    if(!office&&!door.window&&wide<2&&bottom+height+.35<wallHeight) {box(center[0]+nx*.14,bottom+height+.3,center[1]+nz*.14,.35,.16,.05,mats.green,'details',yaw);}
    if(door.window)stats.renderedWindows++;else stats.renderedDoors++;
  }
  // Office plans encode doors as literal missing linework. A short collinear
  // gap bounded by two partition ends supports a door head, not a new wall.
  // Keep the passage clear and avoid guessing heads across broad hallways.
  if(office) {
    const segments=walls.filter(w=>w.kind==='partition'&&w.render!==false).map(w=>({w,a:point(w.a),b:point(w.b)}));
    const seen=new Set();
    for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
      const p=segments[i],q=segments[j],dx=p.b[0]-p.a[0],dz=p.b[1]-p.a[1],len=Math.hypot(dx,dz);
      if(len<.1)continue;
      const ux=dx/len,uz=dz/len,offset=v=>(v[0]-p.a[0])*uz-(v[1]-p.a[1])*ux;
      if(Math.abs(offset(q.a))>.035||Math.abs(offset(q.b))>.035)continue;
      const along=v=>(v[0]-p.a[0])*ux+(v[1]-p.a[1])*uz;
      const qa=along(q.a),qb=along(q.b),lo=Math.min(qa,qb),hi=Math.max(qa,qb);
      let start,end;if(lo>len){start=len;end=lo;}else if(hi<0){start=hi;end=0;}else continue;
      const gap=end-start;if(gap<.65||gap>1.6)continue;
      const a=[p.a[0]+ux*start,p.a[1]+uz*start],b=[p.a[0]+ux*end,p.a[1]+uz*end];
      const key=[...a,...b].map(v=>v.toFixed(2)).join(':');if(seen.has(key))continue;
      const crossed=walls.some(w=>{
        const c=point(w.a),d=point(w.b),vx=d[0]-c[0],vz=d[1]-c[1],den=ux*vz-uz*vx;
        if(Math.abs(den)<.0001)return false;
        const ex=c[0]-a[0],ez=c[1]-a[1],t=(ex*vz-ez*vx)/den,s=(ex*uz-ez*ux)/den;
        return t>.09&&t<gap-.09&&s>=0&&s<=1;
      });
      if(crossed)continue;seen.add(key);
      const head=Math.min(2.1,H-.3);polygonWall(a,b,head,H,H,mats.wall,.15);
      doorDetails(a,b,0,gap,0,head,{open:true,passage:true},H);stats.inferredDoorHeads++;
    }
    if(stats.inferredDoorHeads)feature('Office partition door heads',{count:stats.inferredDoorHeads,evidence:'Door gaps are explicit plan linework; 2.1 m head height and trim sizes are estimates.'});
    if(/^550/.test(id))warnings.push('550 finish-to-level registration is reasoned from the two source photographs and column counts, not a labelled photographic survey.');
  }
  for (const wall of walls) {
    if (wall.render === false || wall.kind === 'guardrail') continue;
    const a=point(wall.a),b=point(wall.b),len=Math.hypot(b[0]-a[0],b[1]-a[1]); if(len<.02)continue;
    const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    if(balcony&&wall.kind==='perimeter'&&(Math.abs(mid[0])<.01||Math.abs(mid[0]-W)<.01||Math.abs(mid[1])<.01||Math.abs(mid[1]-D)<.01))continue;
    // Upper Seven's inner L edges are an open balcony, not solid walls.
    if (upper&&id==='ace7'&&Math.abs(mid[1]/D-.207445)<.025&&mid[0]>.27*W) continue;
    const wh=(x,z)=>Math.min(wall.height||H,roofAt(x,z));
    const at=t=>[a[0]+(b[0]-a[0])*t/len,a[1]+(b[1]-a[1])*t/len];
    const wallMat=wall.color?material(wall.color):((id==='ace2'||id==='ace4')&&(mid[0]>.9*W||mid[1]>.9*D)?mats.wallDark:mats.wall);
    const suppliedOpenings=[...(wall.doors||[])];
    if(id==='ace5'&&!upper&&Math.abs(a[1]/D-.477)<.012&&Math.abs(b[1]/D-.477)<.012){
      for(let x=.15*W;x<W-.8;x+=2.3){const t=(x-a[0])/(b[0]-a[0]);if(t>.025&&t<.975)suppliedOpenings.push({t,width:1.9,height:.8,bottom:H-1.55,window:true,open:true});}
    }
    const openings=suppliedOpenings.map(d=>{const width=Math.max(.3,Number(d.width)||1);const center=clamp(Number(d.t??.5),0,1)*len;return {...d,lo:clamp(center-width/2,0,len),hi:clamp(center+width/2,0,len),bottom:Number(d.bottom)||0,height:Math.min(Number(d.height)||(width>2?Math.min(4.5,H*.65):2.2),Math.min(wh(...a),wh(...b))-.14)};}).sort((p,q)=>p.lo-q.lo);
    let cursor=0;
    for(const d of openings){
      const lo=Math.max(cursor,d.lo); if(d.hi<=lo)continue;
      if(lo>cursor+.01){const p=at(cursor),q=at(lo);polygonWall(p,q,0,wh(...p),wh(...q),wallMat,wall.thickness||.2);}
      const p=at(lo),q=at(d.hi),top=d.bottom+d.height;
      if(d.bottom>0)polygonWall(p,q,0,d.bottom,d.bottom,wallMat,wall.thickness||.2);
      if(top<Math.min(wh(...p),wh(...q)))polygonWall(p,q,top,wh(...p),wh(...q),wallMat,wall.thickness||.2);
      doorDetails(a,b,lo,d.hi,d.bottom,d.height,d,Math.min(wh(...p),wh(...q)));cursor=d.hi;
    }
    if(cursor<len-.01){const p=at(cursor);polygonWall(p,b,0,wh(...p),wh(...b),wallMat,wall.thickness||.2);}
    // Fine curb and wall-head conduit are physical edge detail, not HUD lines.
    for(const [lo,hi] of [[0,...openings.flatMap(d=>[d.lo,d.hi]),len]].flatMap(list=>{const out=[];for(let i=0;i<list.length-1;i+=2)out.push([list[i],list[i+1]]);return out;})) {
      if(hi-lo>.05){const p=at(lo),q=at(hi);bar([p[0],.1,p[1]],[q[0],.1,q[1]],.14,.2,mats.trim,'details');}
    }
    if(!office&&len>5) bar([a[0],Math.min(H*.7,4.5),a[1]],[b[0],Math.min(H*.7,4.5),b[1]],.026,.028,stage?mats.trim:mats.steel,'services');
  }
  for(const o of room.obstacles||[]) {
    if(o.render===false||!o.polygon?.length)continue;
    const poly=o.polygon.map(point),height=clamp(o.height||Math.min(3.2,H-.5),.2,H);
    surface(poly,height,mats.wall,[],'services');
    for(let i=0;i<poly.length;i++)polygonWall(poly[i],poly[(i+1)%poly.length],0,height,height,mats.wall,.14,'services');
  }

  // Structural shafts use source centers, never the enlarged support symbols
  // as real steel widths. Protective bases have room-specific shape/colors.
  const sortedColumns=[...columns].sort((a,b)=>a.x-b.x);
  for(const c of columns) {
    const height=roofAt(c.x,c.z)-.16;
    if(height<=0)continue;
    if(office||/^(524|539a|539b)$/.test(id)) {
      // The 550 photos show boxed white columns. Auxiliary buildings only
      // have plan evidence: neutral supports, no invented safety equipment.
      box(c.x,height/2,c.z,office?.4:.32,height,office?.4:.32,office?mats.white:mats.column);
      instance(contactGeo,mats.baseAO,[c.x,.009,c.z],[1.7,1.7,1],new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2),'details',false);
      continue;
    }
    const shaft=id==='ace6'?mats.black:(id==='m3'?mats.steel:mats.column);
    const shaftSize=stage?.23:.16;
    box(c.x,height/2,c.z,shaftSize,height,.045,shaft);
    for(const dz of [-.09,.09])box(c.x,height/2,c.z,shaftSize+.075,height,.036,shaft);
    if(!upper&&id!=='ace7'&&!office) {
      const baseHeight=stage?.86:.76, radius=stage?.43:.28;
      let guard=id==='ace6'?mats.black:id==='m3'?mats.blue:mats.yellow;
      if(id==='m2'&&(c===sortedColumns[0]||c===sortedColumns.at(-1)))guard=mats.burgundy;
      if(id==='ace6')box(c.x,baseHeight/2,c.z,.65,baseHeight,.65,guard);
      else cylinder(c.x,baseHeight/2,c.z,radius,baseHeight,guard,'structure');
      if(id==='m3')box(c.x,1.32,c.z,.32,1.5,.23,mats.blue);
      else if(id!=='ace6')box(c.x,.92,c.z,shaftSize+.015,1.6,.13,guard);
      box(c.x+.19,1.05,c.z,.15,.35,.11,mats.red,'details');
    }
    // Contact shadows remain visible with a shared renderer's shadows disabled.
    instance(contactGeo,mats.baseAO,[c.x,.009,c.z],[2.1,2.1,1],new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2),'details',false);
  }
  if(balcony)for(const [u,v] of [[.239022,.382196],[.626322,.382196]]){
    const x=u*W,z=v*D,h=H+mezzanineLevel-.16,y=(H-mezzanineLevel-.16)/2;
    box(x,y,z,.16,h,.045,mats.column);for(const dz of [-.09,.09])box(x,y,z+dz,.235,h,.036,mats.column);
    instance(contactGeo,mats.baseAO,[x,-mezzanineLevel+.009,z],[2.1,2.1,1],new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2),'details',false);stats.contextColumns++;
  }
  function iBeam(a,b,depth=.6,width=.22,mat=mats.steel) {
    bar(a,b,.055,depth,mat);
    for(const dy of [-depth/2,depth/2])bar([a[0],a[1]+dy,a[2]],[b[0],b[1]+dy,b[2]],width,.035,mat);
  }
  function truss(a,b,depth=.5,mat=mats.steel) {
    bar(a,b,.055,.065,mat);bar([a[0],a[1]-depth,a[2]],[b[0],b[1]-depth,b[2]],.055,.065,mat);
    const span=Math.hypot(b[0]-a[0],b[2]-a[2]),n=Math.max(2,Math.round(span/1.45));
    for(let i=0;i<n;i++){
      const t=i/n,t1=(i+1)/n,p=[THREE.MathUtils.lerp(a[0],b[0],t),THREE.MathUtils.lerp(a[1],b[1],t)-(i%2?depth:0),THREE.MathUtils.lerp(a[2],b[2],t)],q=[THREE.MathUtils.lerp(a[0],b[0],t1),THREE.MathUtils.lerp(a[1],b[1],t1)-(i%2?0:depth),THREE.MathUtils.lerp(a[2],b[2],t1)];bar(p,q,.036,.035,mat);
    }
  }
  function roofLine(axis,at,kind,depth=.45) {
    for(const [lo,hi] of scan(envelopeFootprint,axis,at)){
      const xy=n=>axis==='x'?[n,at]:[at,n], a=xy(lo+.04),b=xy(hi-.04);
      const p=[a[0],roofAt(...a)-.18,a[1]],q=[b[0],roofAt(...b)-.18,b[1]];
      if(kind==='gable'&&lo<W/2&&hi>W/2) {const peak=[W/2,H-.18,at];iBeam(p,peak,depth,.3);iBeam(peak,q,depth,.3);}
      else if(kind==='truss')truss(p,q,depth);
      else if(kind==='timber')bar(p,q,.15,depth,mats.steel);
      else iBeam(p,q,depth,.24);
    }
  }
  if(!office) {
    if(id==='m3'||id==='m4') {
      const zRows=id==='m3'?[.02*D,...columns.map(c=>c.z),.98*D]:Array.from({length:Math.max(5,Math.round(D/6.8))},(_,i)=>D*(.02+.96*i/(Math.max(5,Math.round(D/6.8))-1)));
      for(const z of zRows)roofLine('x',z,'gable',.65);
      for(let x=.6;x<W;x+=1.45)roofLine('z',x,'beam',.12);
    } else if(wood) {
      if(id==='ace3'){for(let z=1.5;z<D;z+=5.2)roofLine('x',z,'beam',1.05);for(let x=.5;x<W;x+=.72)roofLine('z',x,'timber',.18);}
      else {const xs=[...new Set(columns.map(c=>Number(c.x.toFixed(2))))];for(const x of xs)roofLine('z',x,'timber',.55);for(let z=.5;z<D;z+=.78)roofLine('x',z,'timber',.22);}
    } else if(id==='ace6') {
      const zs=[...new Set(columns.map(c=>Number(c.z.toFixed(2))))];for(const z of zs)roofLine('x',z,'beam',.65);for(let x=.6;x<W;x+=1.25)roofLine('z',x,'beam',.22);
    } else if(openWeb) {
      if(id==='ace7'&&!upper)for(const z of [...new Set(columns.map(c=>Number(c.z.toFixed(2))))])roofLine('x',z,'truss',.85);
      for(let x=.55;x<W;x+=upper?2.4:2.8)roofLine('z',x,'truss',upper?.27:.43);
      for(let z=.7;z<D;z+=4.4)roofLine('x',z,'beam',upper?.16:.28);
    } else if(stage) {
      for(const z of [...new Set(columns.map(c=>Number(c.z.toFixed(2))))])roofLine('x',z,'beam',.8);
      for(let x=1;x<W;x+=3.5)roofLine('z',x,'truss',.33);
    }
  }

  function rail(a,b,y=0,mat=mats.rail,height=1.05) {
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(length/2.25));
    for(let i=0;i<=n;i++){const t=i/n,x=THREE.MathUtils.lerp(a[0],b[0],t),z=THREE.MathUtils.lerp(a[1],b[1],t);bar([x,y,z],[x,y+height,z],.045,.045,mat,'details');}
    for(const h of [.18,.57,height])bar([a[0],y+h,a[1]],[b[0],y+h,b[1]],.038,.038,mat,'details');
  }
  function steps(a,b,rise,width=1,base=0) {
    const n=Math.max(3,Math.round(rise/.175)),dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    if(length<.1)return;
    const angle=-Math.atan2(dz,dx),q=new THREE.Quaternion().setFromAxisAngle(Y,angle);
    for(let i=0;i<n;i++) {const t=(i+.5)/n;box(a[0]+dx*t,base+rise*(i+.5)/n,a[1]+dz*t,length/n+.02,.065,width,mats.rail,'details',q);}
    const nx=-dz/length*width/2,nz=dx/length*width/2;
    for(const s of [-1,1]){bar([a[0]+nx*s,base+1,a[1]+nz*s],[b[0]+nx*s,base+rise+1,b[1]+nz*s],.045,.045,mats.rail,'details');bar([a[0]+nx*s,base-.05,a[1]+nz*s],[b[0]+nx*s,base+rise-.05,b[1]+nz*s],.055,.17,mats.rail,'details');}
  }
  if(id==='ace7') {
    const mx=(upper?.259:.25085639)*W,mz=(upper?.198:.20744458)*D,level=Number(room.mezzanineHeight)||3.1;
    if(!upper) {
      const mezz=[[0,0],[W,0],[W,mz],[mx,mz],[mx,D],[0,D]];
      surface(mezz,level,material(palette.mezzFloor||'#aaa18d',{map:concreteMap,roughness:.9}),[],'services');
      surface(mezz,level-.2,mats.steel,[],'services');
      for(const [a,b] of [[[mx,mz],[W,mz]],[[mx,mz],[mx,D]]])bar([a[0],level-.22,a[1]],[b[0],level-.22,b[1]],.18,.42,mats.rail,'services');
      rail([mx,mz],[W,mz],level);polygonWall([mx,mz],[mx,D],level,H,H,mats.white,.14,'services');
      const fenceMap=ownTex(canvasMap('chain',seed+8,128));fenceMap.repeat.set(Math.max(1,W*.14),2.4);
      const fenceMat=material('#858f8f',{map:fenceMap,alphaMap:fenceMap,transparent:true,alphaTest:.28,side:THREE.DoubleSide,roughness:.8,depthWrite:true});
      const cageX0=.15*W,cageX1=.94*W,cageZ=.205*D;
      const g=new THREE.PlaneGeometry(cageX1-cageX0,2.65);g.translate((cageX1+cageX0)/2,1.325,cageZ);custom(g,fenceMat,'details');
      for(let x=cageX0;x<=cageX1;x+=2.4){pipe([x,0,cageZ],[x,2.75,cageZ],.032,mats.trim);cylinder(x,.52,cageZ+.8,.075,1.04,mats.yellow,'details');}
      pipe([cageX0,2.72,cageZ],[cageX1,2.72,cageZ],.028,mats.trim);
      for(let x=.08*W;x<W;x+=3.1)bar([x,level-.27,0],[x,level-.27,mz],.07,.22,mats.rail,'services');
      const rx=.955*W,rz=.26*D;pipe([rx,0,rz],[rx,H-.4,rz],.075,mats.red);pipe([rx,1.05,rz],[rx-.75,1.05,rz],.05,mats.red);box(rx+.5,1.15,rz,.4,.42,.17,mats.red,'details');
      for(const stair of (room.obstacles||[]).filter(o=>/stair/i.test(o.name||'')&&o.polygon?.length)){
        const p=stair.polygon.map(point),x0=Math.min(...p.map(v=>v[0])),x1=Math.max(...p.map(v=>v[0])),z0=Math.min(...p.map(v=>v[1])),z1=Math.max(...p.map(v=>v[1]));
        const xLong=x1-x0>z1-z0,short=xLong?z1-z0:x1-x0,long=xLong?x1-x0:z1-z0,fw=(short-.15)/2,landing=Math.min(fw,.7);
        const local=(along,across)=>xLong?[x0+along,z0+across]:[x0+across,z0+along];
        steps(local(.1,fw/2+.04),local(long-landing,fw/2+.04),level/2,fw);
        steps(local(long-landing,short-fw/2-.04),local(.1,short-fw/2-.04),level/2,fw,level/2);
        const c=local(long-landing/2,short/2);box(c[0],level/2-.06,c[1],xLong?landing:short,.12,xLong?short:landing,mats.rail,'details');
      }
      feature('Ace Seven L mezzanine and storage cage',{elevation:level,elevationEvidence:'Estimate, not published.',polygon:mezz});
    } else {
      rail([mx,mz],[W,mz],0);feature('Ace Seven upper balcony rail',{elevationReference:'Local floor zero; upper room is a separate plan-local scene. Vertical L edge retains the supplied white office wall.'});
    }
  }
  if(id==='ace5'&&!upper) {
    const x0=.636*W,x1=W,z0=.477*D,z1=.624*D,yLow=1.0,yHigh=Math.min(H-.7,5.8);
    const rampY=x=>THREE.MathUtils.lerp(yHigh,yLow,(x-x0)/(x1-x0));
    const p=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
    surface(p,x=>rampY(x),mats.wall,[],'services');
    polygonWall([x0,z1],[x1,z1],0,yHigh,yLow,mats.wall,.14,'services');
    // The clerestory is a real aperture strip above the ramp/bay wall.
    const windowY=H-1.15;
    for(let x=.15*W;x<W-.8;x+=2.3){if(!inside(x,.48*D+.1,footprint))continue;box(x,windowY,.477*D,1.9,.8,.045,mats.daylight,'details',null,false);for(const dx of [-1,1])bar([x+dx,windowY-.45,.477*D],[x+dx,windowY+.45,.477*D],.065,.065,mats.trim,'details');}
    for(let x=.18*W;x<W-.4;x+=8){const z=.477*D+.14;box(x,1,z,.48,2,.48,mats.yellow);bar([x,1,z],[x,H-.3,z],.18,.18,mats.column);bar([x,H-1.5,z],[x,H-.4,z+1.5],.09,.14,mats.steel);}
    feature('Ace Five interior parking ramp and clerestory',{polygon:p,lowY:yLow,highY:yHigh,riseDirection:'negative x',elevationEvidence:'Unmeasured; visual estimate.'});
  }
  if(id==='m3')for(const p of holes){rail(p[0],p[1],.02,mats.blue);rail(p[0],p[3],.02,mats.blue);rail(p[1],p[2],.02,mats.blue);}

  // Fixed air-distribution systems: source-specific color/form, with routed
  // positions explicitly approximate. No operational HVAC claim is implied.
  function ductRun(axis,at,y,r=.3,mat=mats.duct) {
    for(const [lo,hi] of scan(footprint,axis,at)) {
      if(hi-lo<3)continue;
      const p=n=>axis==='x'?[n,y,at]:[at,y,n];pipe(p(lo+.5),p(hi-.5),r,mat);
      for(let n=lo+2;n<hi-1;n+=5.4){
        const a=p(n),b=[a[0],y-.52,a[2]];pipe(a,b,r*.57,mat);cylinder(b[0],b[1]-.04,b[2],r*1.3,.10,mat);cylinder(b[0],b[1]-.1,b[2],r*.78,.04,mats.black);
      }
      for(let n=lo+1;n<hi-1;n+=1.5){const a=p(n),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis==='x'?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1));instance(ringGeo,mat,a,[r,r,r],q,'details');}
    }
  }
  if(stage) {
    const y=Math.max(2.7,H-roofRise-1.4),r=id==='m4'?.31:.34;
    for(const u of [.18,.69])ductRun('z',u*W,y,r);
    for(const v of [.15,.8])ductRun('x',v*D,y-.4,r*.85);
    feature(`${room.name||id} round air ducts`,{routing:'Photo-based approximate route; not a service survey.',color:id==='m4'?'black':'galvanized silver'});
  } else if(['ace5','ace6','ace7'].includes(id)) {
    const drops=id==='ace6'?apertures.filter((_,i)=>i%1===0).map(a=>[a.x,a.z]):id==='ace5'?[.16,.34,.52,.70,.88].map(u=>[u*W,.74*D]):[[.34*W,.38*D],[.64*W,.38*D],[.84*W,.38*D]];
    for(const [x,z] of drops){if(!inside(x,z,footprint))continue;const y=H-(upper?.4:.65);box(x,y,z,.65,upper?.35:.7,.65,mats.white,'services');box(x,y-.25,z,.81,.2,.8,mats.trim,'services');for(const d of [-.32,.32])box(x+d,y-.25,z,.035,.14,.75,mats.black,'details');}
  } else if(wood) {
    const count=Math.min(8,Math.max(3,Math.round(W/7)));
    for(let i=0;i<count;i++){
      const x=W*(i+.5)/count,z=.22,y=H-.9;if(!inside(x,z,footprint))continue;
      box(x,y,z,1.9,.48,.42,mats.duct,'services');
      for(let f=0;f<4;f++)cylinder(x-.66+f*.44,y,z+.235,.155,.035,mats.black,'details',new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2));
    }
    feature('Legacy wall-top multi-fan cabinets',{placement:'Photographed form, unregistered wall assignment.',function:'Not evidence of operating air conditioning.'});
  }

  // Fixture bodies are instanced independently of a small bounded light set.
  // This preserves a believable roof rhythm without dozens of dynamic lights.
  const officeFixtureCenters=[];
  function officeFixture(x,z,angle=0){
    const ux=Math.sin(angle),uz=Math.cos(angle);
    const blocked=[-.85,0,.85].some(n=>walls.some(w=>{
      if(w.render===false)return false;
      const a=point(w.a),b=point(w.b),dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz;
      const px=x+ux*n,pz=z+uz*n,t=clamp(((px-a[0])*dx+(pz-a[1])*dz)/l2,0,1);
      return Math.hypot(px-a[0]-dx*t,pz-a[1]-dz*t)<.19;
    }));
    if(blocked||officeFixtureCenters.some(p=>Math.hypot(x-p[0],z-p[1])<2.3))return;
    const y=H-.35,q=new THREE.Quaternion().setFromAxisAngle(Y,angle);
    box(x,y,z,.13,.08,1.65,mats.white,'lights',q);box(x,y+.05,z,.11,.018,1.59,mats.tube,'lights',q,false);box(x,y-.045,z,.075,.01,1.59,mats.tube,'lights',q,false);
    for(const n of [-.6,.6])pipe([x+ux*n,y+.08,z+uz*n],[x+ux*n,H-.05,z+uz*n],.005,mats.trim);
    officeFixtureCenters.push([x,z]);stats.physicalLampFixtures++;
  }
  if(office){
    const points=(room.waypoints||[]).map(point);
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),angle=Math.atan2(dx,dz);
      for(let t=1.7;t<len-.8;t+=4.5)officeFixture(a[0]+dx*t/len,a[1]+dz*t/len,angle);
    }
  }
  const fixtureSpacing=office?4.5:stage?7:6;
  const nx=Math.max(1,Math.round(W/fixtureSpacing)),nz=Math.max(1,Math.round(D/fixtureSpacing));
  for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++){
    const x=W*(ix+.5)/nx,z=D*(iz+.5)/nz;if(!inside(x,z,envelopeFootprint)||nearSkylight(x,z,.45))continue;
    if(office){officeFixture(x,z);continue;}
    const y=roofAt(x,z)-(upper?.25:stage?.78:.48);
    if(stage){cylinder(x,y,z,.15,.12,mats.trim,'lights');cylinder(x,y-.065,z,.13,.016,mats.tube,'lights');}
    else {box(x,y,z,.34,.095,1.15,mats.trim,'lights');for(const dx of [-.11,0,.11])box(x+dx,y-.06,z,.045,.032,1.03,mats.tube,'lights',null,false);}
    pipe([x,y+.08,z],[x,roofAt(x,z)-.05,z],.009,mats.trim);stats.physicalLampFixtures++;
  }
  if(upper&&id==='ace7')for(let z=1;z<D;z+=1.3)if(inside(.11*W,z,footprint))box(.11*W,H-.23,z,.1,.045,1.25,mats.tube,'lights',null,false);
  const hemi=new THREE.HemisphereLight('#e5edf1','#a7b4b7',office?1.2:dark?.85:.95);scene.add(hemi);
  const ambient=new THREE.AmbientLight('#f2efe4',dark?.18:.12);scene.add(ambient);
  const lightCoords=office?[[.3,.3],[.7,.7],[.3,.7],[.7,.3]]:id==='ace5'?[[.18,.72],[.48,.72],[.78,.72],[.05,.2]]:[[.25,.25],[.75,.25],[.25,.75],[.75,.75],[.5,.5]];
  for(const [u,v] of lightCoords){const x=u*W,z=v*D;if(!inside(x,z,envelopeFootprint))continue;const l=new THREE.RectAreaLight('#fff8e9',dark?5.5:office?3.5:5,Math.min(14,W*.36),Math.min(12,D*.36));l.position.set(x,Math.max(2.5,roofAt(x,z)-.85),z);l.lookAt(x,balcony?-mezzanineLevel:0,z);groups.lights.add(l);}
  if(apertures.length){for(const a of apertures.filter((_,i)=>i%2===0).slice(0,3)){const l=new THREE.RectAreaLight('#dfefff',9,a.w*1.2,a.d*1.2);l.position.set(a.x,H-.05,a.z);l.lookAt(a.x,0,a.z);groups.lights.add(l);}}
  // A single broad shadow map adds beam/column contact when host enables it.
  const sun=new THREE.DirectionalLight('#fff6e7',apertures.length?1.6:.38);sun.position.set(W*.35,H*1.6,D*.2);sun.target.position.set(W*.53,0,D*.65);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-W*.65;sun.shadow.camera.right=W*.65;sun.shadow.camera.top=D*.65;sun.shadow.camera.bottom=-D*.65;sun.shadow.camera.near=.1;sun.shadow.camera.far=Math.max(W,D,H)*3;sun.shadow.bias=-.00035;sun.shadow.normalBias=.025;scene.add(sun,sun.target);shadows.push(sun.shadow);

  // Flush all repeated geometry into material/group batches.
  for(const b of instanced.values()){
    const mesh=new THREE.InstancedMesh(b.geo,b.mat,b.matrices.length);mesh.name=`${b.group} instanced ${b.matrices.length}`;
    b.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.castShadow=b.cast;mesh.receiveShadow=true;groups[b.group].add(mesh);stats.instancedMeshes++;stats.instances+=b.matrices.length;
  }
  for(const b of merged.values()){
    const geometry=mergeGeometries(b.geometries,false);b.geometries.forEach(g=>g.dispose());if(!geometry)throw new Error('Interior geometry merge failed.');ownGeo(geometry);
    const mesh=new THREE.Mesh(geometry,b.mat);mesh.castShadow=b.cast;mesh.receiveShadow=true;mesh.name=`${b.group} merged`;groups[b.group].add(mesh);stats.mergedMeshes++;
  }
  scene.updateMatrixWorld(true);
  scene.traverse(o=>{if(o.isMesh){stats.meshes++;stats.triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.getAttribute('position').count)/3*(o.isInstancedMesh?o.count:1);}if(o.isLight)stats.lights++;});
  stats.drawCallsEstimate=stats.meshes;stats.textures=textures.size;stats.geometries=geometries.size;stats.materials=materials.size;
  stats.bounds={min:[0,Math.min(balcony?-mezzanineLevel:0,...holes.map(()=>-.75)),0],max:[W,H+.4,D]};stats.geometryHeightMeters=H;stats.office=office;stats.upperLevel=upper;
  if(roofRise)warnings.push('Roof peak is the published height; eave drop/pitch is a photo-based estimate.');
  if(id==='ace2')warnings.push('Ace Two photographic identity is disputed: publisher reuses Ace Four photographs.');
  warnings.push('Member sizes, service routes, fixture positions and elevations without dimensions are approximate.');stats.warnings=warnings;
  scene.userData.interiorStats=stats;
  let disposed=false;
  function dispose(){if(disposed)return;disposed=true;scene.traverse(o=>{if(o.isInstancedMesh&&typeof o.dispose==='function')o.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());shadows.forEach(s=>s.dispose());scene.clear();instanced.clear();merged.clear();}
  return {scene,dispose,stats,bounds:stats.bounds,fixedFeatures:features};
}
