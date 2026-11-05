import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

const $=id=>document.getElementById(id), host=$('viewport');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#acbcc8');
const camera=new THREE.PerspectiveCamera(40,1,.15,3000);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.1;controls.minDistance=2;controls.maxDistance=1300;
controls.maxPolarAngle=Math.PI*.495;controls.zoomToCursor=true;controls.screenSpacePanning=true;
controls.rotateSpeed=.65;controls.zoomSpeed=.85;
const pmrem=new THREE.PMREMGenerator(renderer), room=new RoomEnvironment();
scene.environment=pmrem.fromScene(room,.04).texture;scene.environmentIntensity=.45;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xe2f1ff,0x817254,2));
const sun=new THREE.DirectionalLight(0xffeed8,3.5);sun.position.set(-160,260,190);sun.castShadow=true;
Object.assign(sun.shadow.camera,{left:-350,right:350,top:350,bottom:-350,near:1,far:900});sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0007;sun.shadow.normalBias=.5;scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000),new THREE.MeshStandardMaterial({color:'#7d8b69',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-8;floor.receiveShadow=true;scene.add(floor);
const views={
 aerial:{p:[228,212,-288],t:[5,3,-40],name:'Campus aerial'},
 front:{p:[260,105,-280],t:[20,7,-35],name:'Parking-side façade'},
 rear:{p:[-245,115,260],t:[-15,7,-10],name:'Rear / pond-side façade'},
 entry:{p:[-210,70,-215],t:[-55,7,-65],name:'Building 400 arrival'},
 roof:{p:[0,460,-41],t:[0,0,-40],name:'Roof plan'}
};
let transition=null,currentView='aerial';
function view(name,immediate=false){const v=views[name];currentView=name;transition={start:performance.now(),p:camera.position.clone(),t:controls.target.clone(),endP:new THREE.Vector3(...v.p),endT:new THREE.Vector3(...v.t),duration:immediate?0:550};document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$('view-title').textContent=v.name;}
view('aerial',true);
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view(b.dataset.view);setRender(b.dataset.view);});
$('reset').onclick=()=>view(currentView);$('closer').onclick=()=>{transition=null;camera.position.sub(controls.target).multiplyScalar(1/1.35).add(controls.target);controls.update();};$('farther').onclick=()=>{transition=null;camera.position.sub(controls.target).multiplyScalar(1.35).add(controls.target);controls.update();};
controls.addEventListener('start',()=>transition=null);
let full=null,building=null,showSite=true;
const loader=new GLTFLoader();
function prepare(root){
 root.updateMatrixWorld(true);const groups=new Map();
 root.traverse(o=>{if(!o.isMesh)return;o.castShadow=!/terrain|parking|apron|marking|pavement|ground|drives/i.test(o.name);o.receiveShadow=true;const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){m.side=THREE.DoubleSide;}
 const key=o.geometry.uuid+':'+materials.map(m=>m.uuid).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);});
 // Repeated trees and cars retain their meshes; shared instances reduce drawing overhead.
 for(const meshes of groups.values()){if(meshes.length<3)continue;const first=meshes[0],inst=new THREE.InstancedMesh(first.geometry,first.material,meshes.length);inst.name=first.name+' (shared geometry)';inst.castShadow=true;inst.receiveShadow=true;meshes.forEach((m,i)=>{inst.setMatrixAt(i,m.matrixWorld);m.removeFromParent();});inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();root.add(inst);}
 return root;
}
async function load(){try{
 const b=await loader.loadAsync('../Worldwide Stages - Building Only.glb');building=prepare(b.scene);scene.add(building);$('loading').classList.add('hidden');$('status').textContent='Building ready · loading grounds';
 const g=await loader.loadAsync('../Worldwide Stages - Existing Campus.glb',e=>{if(e.total)$('status').textContent='Building ready · grounds '+Math.round(e.loaded/e.total*100)+'%';});
 full=prepare(g.scene);scene.add(full);building.visible=false;$('status').textContent=document.body.classList.contains('orbit-mode')?'3D geometry ready':'Blender materials preserved in the master file';
 }catch(error){console.error(error);$('loading').textContent='The model could not be opened. Reload this page.';$('status').textContent=error.message;}}
load();
$('site').onclick=()=>{if(!full)return;showSite=!showSite;full.visible=showSite;building.visible=!showSite;floor.visible=showSite;$('site').textContent=showSite?'Grounds on':'Building only';$('site').setAttribute('aria-pressed',String(showSite));};
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
renderer.domElement.addEventListener('dblclick',e=>{const rect=host.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const target=full?.visible?full:building;if(!target)return;const hit=ray.intersectObject(target,true)[0];if(!hit)return;const direction=camera.position.clone().sub(controls.target).normalize();transition={start:performance.now(),p:camera.position.clone(),t:controls.target.clone(),endP:hit.point.clone().addScaledVector(direction,Math.max(9,Math.min(50,camera.position.distanceTo(hit.point)*.4))),endT:hit.point.clone(),duration:550};$('view-title').textContent='Detail view';});
function resize(){const r=host.getBoundingClientRect();renderer.setSize(r.width,r.height);camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(host);
let frames=0,last=performance.now();
renderer.setAnimationLoop(now=>{if(transition){let t=transition.duration?Math.min(1,(now-transition.start)/transition.duration):1;t=t*t*(3-2*t);camera.position.lerpVectors(transition.p,transition.endP,t);controls.target.lerpVectors(transition.t,transition.endT,t);if(t===1)transition=null;}controls.update();renderer.render(scene,camera);frames++;if(now-last>2000){document.body.dataset.fps=String(Math.round(frames*1000/(now-last)));frames=0;last=now;}document.body.dataset.camera=camera.position.toArray().map(v=>v.toFixed(1)).join(',');});

const refs={
 aerial:{file:'Operator aerial.png',caption:'Worldwide Stages, Building 400 directions PDF. Published January 2023; photo date unknown. Original 4,000 × 2,250 image.',alt:'Operator aerial of the existing Worldwide Stages campus'},
 overhead:{file:'Appraisal overhead.png',caption:'A&M draft appraisal, August 2026, page 56. Underlying aerial image date unknown. Use to compare the site layout.',alt:'Overhead campus image from the draft appraisal'},
 survey:{file:'Survey building outline.png',caption:'Topographic survey, revised 2021. The building outline used to construct this model. This is a drawing, not a photograph.',alt:'Topographic survey showing the building outline'}
};
let photoScale=1,photoX=0,photoY=0,drag=null;
function photoTransform(){$('reference').style.transform=`translate(${photoX}px,${photoY}px) scale(${photoScale})`;}
function photoZoom(factor){photoScale=Math.min(12,Math.max(1,photoScale*factor));if(photoScale===1)photoX=photoY=0;photoTransform();}
function resetPhoto(){photoScale=1;photoX=photoY=0;photoTransform();}
document.querySelectorAll('[data-ref]').forEach(b=>b.onclick=()=>{const r=refs[b.dataset.ref],url='../References/'+encodeURIComponent(r.file);$('reference').src=url;$('reference').alt=r.alt;$('original-photo').href=url;$('photo-caption').textContent=r.caption;document.querySelectorAll('[data-ref]').forEach(x=>x.classList.toggle('active',x===b));resetPhoto();});
$('photo-plus').onclick=()=>photoZoom(1.5);$('photo-minus').onclick=()=>photoZoom(1/1.5);$('photo-reset').onclick=resetPhoto;
$('expand-photo').onclick=()=>{document.body.classList.toggle('photo-expanded');$('expand-photo').textContent=document.body.classList.contains('photo-expanded')?'×':'⤢';resetPhoto();};
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.body.classList.remove('photo-expanded');});
$('photo-stage').addEventListener('wheel',e=>{e.preventDefault();photoZoom(Math.exp(-e.deltaY*.002));},{passive:false});
$('photo-stage').addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,px:photoX,py:photoY};$('photo-stage').setPointerCapture(e.pointerId);});
$('photo-stage').addEventListener('pointermove',e=>{if(!drag)return;photoX=drag.px+e.clientX-drag.x;photoY=drag.py+e.clientY-drag.y;photoTransform();});
$('photo-stage').addEventListener('pointerup',()=>drag=null);

// These are the actual Cycles outputs from the native master, not browser shading.
let renderScale=1,renderX=0,renderY=0,renderDrag=null;
const renderFiles={aerial:'01 - Campus Aerial.png',rear:'02 - Pond and Atrium.png',entry:'03 - Building 400 Arrival.png'};
function renderTransform(){$('blender-render').style.transform=`translate(${renderX}px,${renderY}px) scale(${renderScale})`;}
function renderFit(){renderScale=1;renderX=renderY=0;renderTransform();}
function renderZoom(f){renderScale=Math.min(8,Math.max(1,renderScale*f));if(renderScale===1)renderX=renderY=0;renderTransform();}
function setRender(name){if(renderFiles[name]){$('blender-render').src='../'+encodeURIComponent(renderFiles[name]);renderFit();}}
function mode(orbit){$('status').textContent=orbit?'3D geometry · simpler material preview':'Blender materials preserved in the master file';document.body.classList.toggle('orbit-mode',orbit);document.querySelector('.model-panel').classList.toggle('orbit',orbit);$('orbit-mode').classList.toggle('active',orbit);$('render-mode').classList.toggle('active',!orbit);$('quality-note').textContent=orbit?'Same exported geometry · simpler materials':'Original Blender materials and lighting';$('interaction-hint').textContent=orbit?'Drag to rotate · Scroll to zoom · Right-drag to pan · Double-click to inspect':'Blender image: scroll to zoom · Drag to pan · Choose Rear / pond to compare the back';if(!orbit&&!renderFiles[currentView]){view('aerial');setRender('aerial');}resize();}
$('render-mode').onclick=()=>mode(false);$('orbit-mode').onclick=()=>mode(true);
$('render-plus').onclick=()=>renderZoom(1.5);$('render-minus').onclick=()=>renderZoom(1/1.5);$('render-fit').onclick=renderFit;
$('render-stage').addEventListener('wheel',e=>{e.preventDefault();renderZoom(Math.exp(-e.deltaY*.002));},{passive:false});
$('render-stage').addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;renderDrag={x:e.clientX,y:e.clientY,px:renderX,py:renderY};$('render-stage').setPointerCapture(e.pointerId);});
$('render-stage').addEventListener('pointermove',e=>{if(!renderDrag)return;renderX=renderDrag.px+e.clientX-renderDrag.x;renderY=renderDrag.py+e.clientY-renderDrag.y;renderTransform();});
$('render-stage').addEventListener('pointerup',()=>renderDrag=null);
mode(true);

// Capture the actual current 3D angle at 3,840 pixels wide.
$('save-picture').onclick=async()=>{
 const button=$('save-picture');button.disabled=true;button.textContent='Saving…';
 try{
  if(!document.body.classList.contains('orbit-mode')){const a=document.createElement('a');a.href=$('blender-render').src;a.download='Worldwide Stages - working render.png';a.click();return;}
  const size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio();
  const canvas=document.createElement('canvas');canvas.width=3840;canvas.height=Math.round(3840/camera.aspect);
  try{renderer.setPixelRatio(1);renderer.setSize(canvas.width,canvas.height,false);renderer.render(scene,camera);const ctx=canvas.getContext('2d');ctx.drawImage(renderer.domElement,0,0);ctx.fillStyle='#05070dd9';ctx.fillRect(0,canvas.height-58,canvas.width,58);ctx.fillStyle='#e9f1f6';ctx.font='22px sans-serif';ctx.fillText('WORLDWIDE STAGES · WORKING MODEL · Site layout under correction · 15 Sep 2026',30,canvas.height-22);}
  finally{renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);}
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Image capture failed');
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Worldwide Stages - working view.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(e){$('status').textContent='Could not save picture: '+e.message;}
 finally{button.disabled=false;button.textContent='Save picture';}
};
$('blender-render').onload=()=>{document.querySelector('.render-label').textContent='BLENDER · '+$('blender-render').naturalWidth.toLocaleString()+' × '+$('blender-render').naturalHeight.toLocaleString();};
