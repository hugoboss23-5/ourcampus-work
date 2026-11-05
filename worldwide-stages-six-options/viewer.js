import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

const $=id=>document.getElementById(id),host=$('viewport');
const assets=new URL('./assets/',import.meta.url),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const state=window.__campus={loaded:false,error:null,option:null,meshes:0,drawCalls:0,triangles:0,lighting:'day',camera:[],target:[],measuredFrameRate:null};
let renderer,model,manifest,selectedOption,modelLights=[],presets={},generation=0,transition,frameId,lastTime=0,captureBusy=false,toastTimer,manualShadows=null;
const roofs=[],emissionMaterials=new Map(),frameIntervals=[];
function assetURL(path){const url=new URL(String(path),assets);if(!url.href.startsWith(assets.href))throw new Error('Asset path is outside the planning package');return url.href;}
function setStatus(title,detail,error=false){$('loading').hidden=false;$('load-title').textContent=title;$('load-detail').textContent=detail;$('retry').hidden=!error;$('progress').hidden=error;}
function showError(error){console.error(error);state.error=String(error.message||error);setStatus('This option could not open','Check the connection and try again.',true);}
$('retry').onclick=()=>selectedOption?loadOption(selectedOption.id):location.reload();
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,logarithmicDepthBuffer:true,powerPreference:'high-performance'});}catch(error){showError(error);throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
renderer.info.autoReset=false;renderer.shadowMap.enabled=false;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','3D planning option. Drag to rotate; scroll to zoom.');host.appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();showError(new Error('Graphics context lost'));});renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
const scene=new THREE.Scene();scene.background=new THREE.Color('#93aab4');
const camera=new THREE.PerspectiveCamera(40,1,.1,5000);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=!reducedMotion;controls.dampingFactor=.11;controls.minDistance=1;controls.maxDistance=2600;controls.maxPolarAngle=Math.PI*.72;controls.zoomToCursor=true;controls.screenSpacePanning=true;controls.rotateSpeed=.62;controls.zoomSpeed=.8;controls.autoRotateSpeed=.55;controls.listenToKeyEvents(renderer.domElement);
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.06);scene.environment=environment.texture;scene.environmentIntensity=.20;room.dispose();pmrem.dispose();
const sky=new THREE.HemisphereLight(0xe5efff,0x777c70,.62),sun=new THREE.DirectionalLight(0xfff1dd,1.9),fill=new THREE.DirectionalLight(0xdae8ff,.22);
sun.position.set(-230,380,-220);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-420,right:420,top:420,bottom:-420,near:1,far:1400});sun.shadow.bias=-.00008;sun.shadow.normalBias=.11;sun.shadow.radius=2;fill.position.set(250,100,220);scene.add(sky,sun,sun.target,fill);
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.24,.65,1.3);bloom.enabled=false;composer.addPass(bloom);composer.addPass(new OutputPass());
function draw(){renderer.info.reset();const start=performance.now();composer.render();state.lastRenderMs=performance.now()-start;}
function requestRender(){if(!frameId&&!captureBusy)frameId=requestAnimationFrame(render);}
function render(now){frameId=null;if(captureBusy)return;const delta=Math.min(.05,(now-lastTime)/1000||.016);lastTime=now;if(transition){let t=transition.duration?Math.min(1,(now-transition.start)/transition.duration):1;t=t*t*(3-2*t);camera.position.lerpVectors(transition.p,transition.endP,t);controls.target.lerpVectors(transition.t,transition.endT,t);if(t>=1)transition=null;}const changed=controls.update(delta);draw();if(state.lastFrameAt&&now-state.lastFrameAt<500){frameIntervals.push(now-state.lastFrameAt);if(frameIntervals.length>60)frameIntervals.shift();}state.lastFrameAt=now;if(frameIntervals.length>=10)state.measuredFrameRate=1000/(frameIntervals.reduce((sum,n)=>sum+n,0)/frameIntervals.length);state.frameSamples=frameIntervals.length;state.drawCalls=renderer.info.render.calls;state.triangles=renderer.info.render.triangles;state.camera=camera.position.toArray();state.target=controls.target.toArray();renderer.domElement.dataset.renderCalls=String(state.drawCalls);renderer.domElement.dataset.frameRate=state.measuredFrameRate?.toFixed(1)||'waiting';renderer.domElement.dataset.renderMs=state.lastRenderMs.toFixed(1);renderer.domElement.dataset.presentationMeshes=String(state.batching?.presentationMeshes||state.meshes);if(transition||controls.autoRotate||changed)requestRender();}
function resize(){if(captureBusy)return;const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);composer.setSize(w,h);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();if(state.loaded&&isSiteView(state.selectedView))selectView(state.selectedView,true);requestRender();}new ResizeObserver(resize).observe(host);resize();
function setLighting(mode){const night=mode==='night';state.lighting=mode;sky.intensity=night?.24:.62;sun.intensity=night?.12:1.9;sun.color.set(night?0x94b9fa:0xfff1dd);fill.intensity=night?.16:.22;scene.background.set(night?'#071321':'#93aab4');scene.environmentIntensity=night?.12:.20;renderer.toneMappingExposure=night?1.12:.86;bloom.enabled=night;emissionMaterials.forEach((value,material)=>material.emissiveIntensity=night?Math.max(value,2):value*.05);modelLights.forEach(({light,intensity},i)=>{const step=Math.max(1,Math.ceil(modelLights.length/18));light.visible=night&&i%step===0;light.intensity=light.visible?intensity:0;});$('day').setAttribute('aria-pressed',String(!night));$('night').setAttribute('aria-pressed',String(night));renderer.shadowMap.needsUpdate=true;requestRender();}
function setShadows(enabled){state.shadowsVisible=enabled;$('shadows-toggle').checked=enabled;if(renderer.shadowMap.enabled===enabled)return;renderer.shadowMap.enabled=enabled;renderer.shadowMap.needsUpdate=true;scene.traverse(object=>{if(object.isMesh)for(const material of [].concat(object.material))material.needsUpdate=true;});requestRender();}
$('day').onclick=()=>setLighting('day');$('night').onclick=()=>setLighting('night');$('shadows-toggle').onchange=event=>{manualShadows=event.target.checked;setShadows(manualShadows);};
$('roofs-toggle').onchange=event=>{roofs.forEach(roof=>roof.visible=event.target.checked);state.roofsVisible=event.target.checked;renderer.shadowMap.needsUpdate=true;requestRender();};
function stopSpin(){controls.autoRotate=false;$('spin').setAttribute('aria-pressed','false');$('spin').textContent='Rotate';}
function isSiteView(name){return name==='above'||name==='overview';}
function fitSiteCamera(view){
  const w=host.clientWidth,h=host.clientHeight,margin=18;
  let left=margin,right=w-margin,top=margin,bottom=h-margin;
  const visibleRect=selector=>{const element=document.querySelector(selector);if(!element||!element.getClientRects().length)return null;const r=element.getBoundingClientRect();return r.width&&r.height?r:null;};
  const header=visibleRect('.top'),panel=visibleRect('.campus-panel');
  if(header)top=Math.max(top,header.bottom+margin);
  if(panel){if(panel.width>w*.55)top=Math.max(top,panel.bottom+margin);else left=Math.max(left,panel.right+margin);}
  for(const selector of ['.bottom','.instructions','.view-label','.orbit-tools']){const r=visibleRect(selector);if(r)bottom=Math.min(bottom,r.top-margin);}
  const usableW=Math.max(80,right-left),usableH=Math.max(80,bottom-top),cx=(left+right)/2,cy=(top+bottom)/2;
  const target=new THREE.Vector3(...view.t),direction=new THREE.Vector3(...view.p).sub(target).normalize();
  const horizontal=new THREE.Vector3().crossVectors(camera.up,direction);if(horizontal.lengthSq()<1e-10)horizontal.set(1,0,0);horizontal.normalize();
  const vertical=new THREE.Vector3().crossVectors(direction,horizontal).normalize(),tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/camera.zoom;
  const tanX=tanV*camera.aspect*usableW/w,tanY=tanV*usableH/h;
  let distance=50;
  for(const x of [state.bounds.min[0],state.bounds.max[0]])for(const y of [state.bounds.min[1],state.bounds.max[1]])for(const z of [state.bounds.min[2],state.bounds.max[2]]){
    const delta=new THREE.Vector3(x,y,z).sub(target),depth=delta.dot(direction);
    distance=Math.max(distance,depth+Math.abs(delta.dot(horizontal))/tanX,depth+Math.abs(delta.dot(vertical))/tanY);
  }
  distance*=1.06;controls.maxDistance=Math.max(2600,distance*1.2);camera.far=Math.max(5000,distance+new THREE.Vector3(...state.bounds.max).sub(new THREE.Vector3(...state.bounds.min)).length()*1.2);
  camera.setViewOffset(w,h,w/2-cx,h/2-cy,w,h);
  state.siteFraming={view:state.selectedView,usableRect:[left,top,right,bottom],distance,viewport:[w,h]};
  return target.clone().addScaledVector(direction,distance);
}
function selectView(name,immediate=false){if(!presets[name])return;const view=presets[name],target=new THREE.Vector3(...view.t);let position=new THREE.Vector3(...view.p);camera.clearViewOffset();controls.maxDistance=2600;camera.far=5000;state.selectedView=name;if(isSiteView(name)&&state.bounds)position=fitSiteCamera(view);else{state.siteFraming=null;if(position.y>30)position.sub(target).multiplyScalar(Math.max(1,Math.min(2.5,1.25/camera.aspect))).add(target);}camera.updateProjectionMatrix();stopSpin();controls.update();setShadows(manualShadows??false);transition={start:performance.now(),duration:immediate||reducedMotion?0:650,p:camera.position.clone(),t:controls.target.clone(),endP:position,endT:target};$('view-title').textContent=view.label||name;document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===name)));requestRender();}
function markCustom(){transition=null;state.selectedView=null;stopSpin();$('view-title').textContent='Your view';document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));}controls.addEventListener('start',markCustom);controls.addEventListener('change',requestRender);
function zoom(factor){markCustom();const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);controls.update();requestRender();}$('zoom-in').onclick=()=>zoom(1/1.3);$('zoom-out').onclick=()=>zoom(1.3);$('spin').onclick=()=>{transition=null;controls.autoRotate=!controls.autoRotate;$('spin').setAttribute('aria-pressed',String(controls.autoRotate));$('spin').textContent=controls.autoRotate?'Pause':'Rotate';requestRender();};
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();renderer.domElement.addEventListener('dblclick',event=>{if(!model)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(model,true).find(hit=>{for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;return true;});if(!hit)return;markCustom();const direction=camera.position.clone().sub(controls.target).normalize(),distance=THREE.MathUtils.clamp(camera.position.distanceTo(hit.point)*.35,12,100);transition={start:performance.now(),duration:reducedMotion?0:600,p:camera.position.clone(),t:controls.target.clone(),endP:hit.point.clone().addScaledVector(direction,distance),endT:hit.point.clone()};$('view-title').textContent='Detail view';requestRender();});
function batchStaticGeometry(root){
  root.updateMatrixWorld(true);
  const groups=new Map(),sources=[];
  root.traverse(object=>{
    if(!object.isMesh||object.isSkinnedMesh||object.isInstancedMesh||Array.isArray(object.material)||object.material.transparent)return;
    let isRoof=false;for(let parent=object;parent&&parent!==root;parent=parent.parent)if(/^Roof_/i.test(parent.name)||parent.userData.kind==='roof')isRoof=true;
    const geometry=object.geometry;
    const attributes=Object.keys(geometry.attributes).sort().map(name=>{const a=geometry.attributes[name];return name+':'+a.itemSize+':'+a.normalized+':'+a.array.constructor.name;}).join('|');
    const key=[object.material.uuid,isRoof,!!geometry.index,attributes,object.castShadow,object.receiveShadow].join(';');
    if(!groups.has(key))groups.set(key,{material:object.material,isRoof,castShadow:object.castShadow,receiveShadow:object.receiveShadow,objects:[]});
    groups.get(key).objects.push(object);sources.push(object);
  });
  const mergedGroup=new THREE.Group();mergedGroup.name='Runtime presentation batches';
  let batchedSources=0;
  for(const entry of groups.values()){
    if(entry.objects.length<2)continue;
    // Bake each object's world transform into vertices. No authored asset is changed.
    const geometries=entry.objects.map(object=>{
      const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
      if(object.matrixWorld.determinant()<0&&geometry.index){const indices=geometry.index.array;for(let i=0;i<indices.length;i+=3){const swap=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=swap;}}
      return geometry;
    });
    const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
    if(!geometry)continue;
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,entry.material);mesh.name=(entry.isRoof?'Roof_':'Batch_')+entry.material.name;
    mesh.castShadow=entry.castShadow;mesh.receiveShadow=entry.receiveShadow;mesh.userData.kind=entry.isRoof?'roof':'presentation';mergedGroup.add(mesh);
    for(const object of entry.objects){object.removeFromParent();batchedSources++;}
  }
  root.add(mergedGroup);roofs.length=0;let visibleMeshes=0;
  root.traverse(object=>{if(object.isMesh)visibleMeshes++;if(/^Roof_/i.test(object.name)||object.userData.kind==='roof')roofs.push(object);});
  state.batching={sourceMeshes:state.meshes,mergedSources:batchedSources,presentationMeshes:visibleMeshes,batchCount:mergedGroup.children.length};
  state.roofs=roofs.length;
  root.updateMatrixWorld(true);
}

function disposeModel(root){if(!root)return;const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(object=>{if(object.isMesh){geometries.add(object.geometry);[].concat(object.material).forEach(m=>materials.add(m));}});for(const m of materials)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();}
function clearModel(){stopSpin();transition=null;disposeModel(model);model=null;roofs.length=0;emissionMaterials.clear();modelLights=[];state.loaded=false;state.selectedView=null;state.meshes=0;state.bounds=null;state.presets={};state.triangles=0;state.lights=0;state.roofs=0;state.authoredRoofs=0;state.batching=null;state.measuredFrameRate=null;state.lastFrameAt=null;frameIntervals.length=0;document.body.dataset.loaded='false';$('views').replaceChildren();$('roofs-toggle').checked=true;for(const id of ['roofs-toggle','shadows-toggle','day','night','zoom-in','zoom-out','spin','capture'])$(id).disabled=true;$('glb-download').hidden=true;$('preview-open').hidden=true;$('gallery-items').replaceChildren();if($('preview').open)$('preview').close();document.querySelectorAll('[data-download]').forEach(link=>link.hidden=true);draw();}
function integer(value){return Number(value).toLocaleString('en-US',{maximumFractionDigits:0});}
function decimal(value){return Number(value).toLocaleString('en-US',{maximumFractionDigits:1});}
function parkingLabel(option){const p=option.parking||{};if(p.strategy==='garage')return 'Garage only · '+integer(p.garage_spaces)+' spaces';if(p.strategy==='surface')return 'Surface only · '+integer(p.surface_spaces)+' spaces';return 'Parking strategy unresolved';}
function showSummary(option){$('selected-number').textContent=option.id.replace('option-','Option ')+' · Drawing package '+option.id.replace('option-','');$('selected-title').textContent=option.title;$('selected-design').textContent=option.design||'';$('parking-strategy').textContent=parkingLabel(option);$('facts').replaceChildren();const facts=option.facts||{},entries=[];if(Number.isFinite(facts.main_halls))entries.push([integer(facts.main_halls),'main halls']);if(Number.isFinite(facts.building_area_sf))entries.push([integer(facts.building_area_sf),'sq ft · main halls']);if(Number.isFinite(facts.site_area_acres))entries.push([decimal(facts.site_area_acres),'acres · site used']);if(Number.isFinite(facts.footprint_acres))entries.push([decimal(facts.footprint_acres),'acres · building footprint']);if(Number.isFinite(facts.parking_structures))entries.push([integer(facts.parking_structures),'parking structures']);for(const [value,label] of entries){const item=document.createElement('div'),number=document.createElement('strong'),name=document.createElement('span');number.textContent=value;name.textContent=label;item.append(number,name);$('facts').append(item);}document.querySelectorAll('[data-option]').forEach(button=>button.setAttribute('aria-checked',String(button.dataset.option===option.id)));}
async function refreshGallery(option,epoch){
  const choices=Array.isArray(option.renders)&&option.renders.length?option.renders:option.render?[{file:option.render,label:'Campus overview'}]:[];
  const unique=[...new Map(choices.filter(item=>item?.file).map(item=>[item.file,item])).values()];
  const checks=await Promise.allSettled(unique.map(async item=>{const href=assetURL(item.file),response=await fetch(href,{method:'HEAD',cache:'no-cache'});return response.ok?{...item,href}:null;}));
  if(epoch!==generation)return;
  const figures=[];
  for(const result of checks){
    if(result.status!=='fulfilled'||!result.value)continue;
    const item=result.value,figure=document.createElement('figure'),link=document.createElement('a'),img=document.createElement('img'),caption=document.createElement('figcaption');
    link.href=item.href;link.target='_blank';link.rel='noopener';link.setAttribute('aria-label','Open '+(item.label||'rendered view')+' image');
    img.src=item.href;img.alt=option.title+' · '+(item.label||'Rendered view');img.loading='lazy';img.decoding='async';
    img.onerror=()=>{figure.remove();if(!$('gallery-items').children.length){$('preview-open').hidden=true;if($('preview').open)$('preview').close();}};
    caption.textContent=item.label||'Rendered view';link.append(img);figure.append(link,caption);figures.push(figure);
  }
  $('gallery-items').replaceChildren(...figures);$('preview-title').textContent=option.title;$('preview-open').hidden=!figures.length;
  state.renderedViews=figures.length;
}
async function refreshComparisonDownload(){
  try{const href=assetURL('six-options-comparison.pdf'),response=await fetch(href,{method:'HEAD',cache:'no-cache'});document.querySelectorAll('[data-comparison-pdf]').forEach(link=>{link.hidden=!response.ok;if(response.ok){link.href=href;link.download='six-options-comparison.pdf';}});}catch{document.querySelectorAll('[data-comparison-pdf]').forEach(link=>link.hidden=true);}
}
async function refreshDownloads(option,epoch){
  const entries=Object.entries(option.downloads||{});
  await Promise.allSettled([refreshGallery(option,epoch),...entries.map(async([type,path])=>{const href=assetURL(path),response=await fetch(href,{method:'HEAD',cache:'no-cache'});if(!response.ok||epoch!==generation)return;document.querySelectorAll('[data-download="'+type+'"]').forEach(link=>{link.href=href;link.download=path.split('/').at(-1);link.hidden=false;});})]);
}
function buildViews(bounds,option){const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),distance=Math.max(size.x,size.z)*1.10;presets={overview:{p:[center.x+distance*.72,Math.max(150,distance*.6),center.z+distance*.85],t:[center.x,0,center.z],label:'Whole option'},above:{p:[center.x,Math.max(500,distance*1.4),center.z+.01],t:[center.x,0,center.z],label:'Site from above'}};for(const [name,view] of Object.entries(option.views||{}))if(view.p?.length===3&&view.t?.length===3)presets[name]={...view};state.presets=Object.fromEntries(Object.entries(presets).map(([name,p])=>[name,{...p,p:[...p.p],t:[...p.t]}]));const labels={overview:'Whole option',sports:'Sports hall',events:'Events hall',garage:'Garage',parking:'Parking',arrival:'Arrival',gardens:'Gardens',stage:'Stage',above:'Above'};$('views').replaceChildren();for(const [name,view] of Object.entries(presets)){const button=document.createElement('button');button.dataset.view=name;button.textContent=labels[name]||view.label||name;button.setAttribute('aria-pressed','false');button.onclick=()=>selectView(name);$('views').append(button);}}
async function loadOption(id){const option=manifest.options.find(item=>item.id===id);if(!option)return;if(captureBusy){toast('Finishing the image save…');return;}const epoch=++generation;selectedOption=option;clearModel();state.option=option.id;state.modelURL=assetURL(option.model);state.error=null;showSummary(option);setStatus('Opening '+option.title,'Loading this planning option in 3D…');$('progress').removeAttribute('value');$('progress').hidden=false;refreshDownloads(option,epoch);try{const gltf=await new GLTFLoader().loadAsync(assetURL(option.model),event=>{if(epoch!==generation)return;if(event.total){$('progress').max=event.total;$('progress').value=event.loaded;$('load-detail').textContent='Loading the 3D option · '+Math.round(event.loaded/event.total*100)+'%';}});if(epoch!==generation){disposeModel(gltf.scene);return;}model=gltf.scene;model.traverse(object=>{if(/^Roof_/i.test(object.name)||object.userData.kind==='roof')roofs.push(object);if(object.isLight){if(object.isPointLight||object.isSpotLight)modelLights.push({light:object,intensity:Math.min(object.intensity,120)});object.intensity=0;object.visible=false;}if(object.isMesh){state.meshes++;object.castShadow=true;object.receiveShadow=true;for(const material of [].concat(object.material))if(material.emissive&&(material.emissive.r>0||material.emissive.g>0||material.emissive.b>0)&&!emissionMaterials.has(material))emissionMaterials.set(material,material.emissiveIntensity);}});state.authoredRoofs=roofs.length;state.lights=modelLights.length;batchStaticGeometry(model);const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());state.bounds={min:bounds.min.toArray(),max:bounds.max.toArray()};const radius=Math.max(size.x,size.z)*.56;sun.target.position.copy(center);sun.position.copy(center).add(new THREE.Vector3(-230,380,-220));Object.assign(sun.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:1,far:1400});sun.shadow.camera.updateProjectionMatrix();buildViews(bounds,option);scene.add(model);setLighting(state.lighting);selectView('overview',true);renderer.shadowMap.needsUpdate=true;$('load-detail').textContent='Preparing the selected option…';await renderer.compileAsync(scene,camera);if(epoch!==generation)return;draw();state.loaded=true;state.error=null;document.body.dataset.loaded='true';$('loading').hidden=true;for(const id of ['shadows-toggle','day','night','zoom-in','zoom-out','spin','capture'])$(id).disabled=false;$('roofs-toggle').disabled=!roofs.length;$('glb-download').href=assetURL(option.model);$('glb-download').download=option.model.split('/').at(-1);$('glb-download').hidden=false;const url=new URL(location.href);url.searchParams.set('option',id);history.replaceState(null,'',url);requestRender();}catch(error){if(epoch===generation)showError(error);}}
function buildPicker(){const picker=$('option-picker');picker.replaceChildren();for(const [index,option] of manifest.options.entries()){const button=document.createElement('button'),number=document.createElement('span'),title=document.createElement('span'),parking=document.createElement('small');button.className='option-choice';button.dataset.option=option.id;button.setAttribute('role','radio');button.setAttribute('aria-checked','false');number.className='option-number';number.textContent='OPTION '+String(index+1).padStart(2,'0');title.className='option-title';title.textContent=option.title;parking.textContent=option.parking?.strategy==='garage'?'Garage only':'Surface only';button.append(number,title,parking);button.onclick=()=>loadOption(option.id);picker.append(button);}$('option-counter').textContent=manifest.options.length+' options';$('compare-open').disabled=false;$('compare-menu').disabled=false;}
async function buildComparison(){const body=$('comparison-rows');body.replaceChildren();for(const option of manifest.options){const row=document.createElement('tr'),nameCell=document.createElement('td'),button=document.createElement('button');button.textContent=option.id.replace('option-','')+' · '+option.title;button.onclick=()=>{$('comparison').close();loadOption(option.id);};nameCell.append(button);row.append(nameCell);const f=option.facts||{},values=[option.design||'—',parkingLabel(option),Number.isFinite(f.main_halls)?integer(f.main_halls):'—',Number.isFinite(f.building_area_sf)?integer(f.building_area_sf)+' sq ft':'—',Number.isFinite(f.site_area_acres)?decimal(f.site_area_acres)+' acres':'—'];for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}const drawing=document.createElement('td');drawing.textContent='Preparing package';row.append(drawing);body.append(row);if(option.downloads?.pdf){const href=assetURL(option.downloads.pdf);fetch(href,{method:'HEAD',cache:'no-cache'}).then(response=>{if(!response.ok)return;const link=document.createElement('a');link.href=href;link.download=option.downloads.pdf.split('/').at(-1);link.textContent='Dimensioned plan';drawing.replaceChildren(link);}).catch(()=>{});}}}
function openSheet(id){if(id==='comparison')refreshComparisonDownload();if(id==='preview'&&selectedOption)refreshGallery(selectedOption,generation);$(id).showModal();$('more').open=false;}document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());for(const id of ['comparison','assumptions','preview'])$(id).addEventListener('click',event=>{if(event.target===$(id)){const r=$(id).getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$(id).close();}});$('compare-open').onclick=()=>openSheet('comparison');$('compare-menu').onclick=()=>openSheet('comparison');$('assumptions-open').onclick=()=>openSheet('assumptions');$('scope-note').onclick=()=>openSheet('assumptions');$('preview-open').onclick=()=>openSheet('preview');
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}function downloadBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function centerFullSiteCapture(w,h){
  const direction=camera.position.clone().sub(controls.target).normalize(),center=new THREE.Vector3(...state.bounds.min).add(new THREE.Vector3(...state.bounds.max)).multiplyScalar(.5);
  const horizontal=new THREE.Vector3().crossVectors(camera.up,direction);if(horizontal.lengthSq()<1e-10)horizontal.set(1,0,0);horizontal.normalize();
  const vertical=new THREE.Vector3().crossVectors(direction,horizontal).normalize(),tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/camera.zoom;
  const projected=[];
  for(const x of [state.bounds.min[0],state.bounds.max[0]])for(const y of [state.bounds.min[1],state.bounds.max[1]])for(const z of [state.bounds.min[2],state.bounds.max[2]]){
    const delta=new THREE.Vector3(x,y,z).sub(center);projected.push({x:delta.dot(horizontal),y:delta.dot(vertical),depth:delta.dot(direction)});
  }
  const extents=distance=>{const xx=projected.map(p=>p.x/((distance-p.depth)*tanV*camera.aspect)),yy=projected.map(p=>p.y/((distance-p.depth)*tanV));return {left:Math.min(...xx),right:Math.max(...xx),bottom:Math.min(...yy),top:Math.max(...yy)};};
  const fits=e=>Math.max(e.right-e.left,e.top-e.bottom)<=1.84;
  let lo=Math.max(...projected.map(p=>p.depth))+camera.near*2,hi=Math.max(50,lo+50);
  while(!fits(extents(hi)))hi*=2;
  for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(fits(extents(mid)))hi=mid;else lo=mid;}
  const distance=hi,e=extents(distance);camera.clearViewOffset();camera.far=Math.max(camera.far,distance+new THREE.Vector3(...state.bounds.max).sub(new THREE.Vector3(...state.bounds.min)).length()*1.2);
  camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);
  // Center the projected campus silhouette, without the interactive UI margins.
  camera.setViewOffset(w,h,(e.left+e.right)*w/4,-(e.bottom+e.top)*h/4,w,h);camera.updateMatrixWorld(true);
}
$('capture').onclick=async()=>{
  if(!state.loaded||captureBusy)return;
  const savedCamera=camera.clone(),savedTarget=controls.target.clone(),savedTransition=transition,savedAutoRotate=controls.autoRotate,savedEnabled=controls.enabled,savedMaxDistance=controls.maxDistance;
  const savedSpinLabel=$('spin').textContent,savedSpinPressed=$('spin').getAttribute('aria-pressed'),fullSite=isSiteView(state.selectedView)&&!!state.bounds;
  transition=null;stopSpin();controls.enabled=false;captureBusy=true;if(frameId){cancelAnimationFrame(frameId);frameId=null;}
  const ratio=renderer.getPixelRatio(),size=renderer.getSize(new THREE.Vector2()),limit=Math.min(3840,renderer.capabilities.maxTextureSize),scale=limit/Math.max(size.x,size.y),w=Math.round(size.x*scale),h=Math.round(size.y*scale);
  $('capture').disabled=true;
  try{
    renderer.setPixelRatio(1);renderer.setSize(w,h,false);composer.setPixelRatio(1);composer.setSize(w,h);camera.aspect=w/h;if(fullSite)centerFullSiteCapture(w,h);else camera.updateProjectionMatrix();draw();
    const blob=await new Promise((resolve,reject)=>renderer.domElement.toBlob(value=>value?resolve(value):reject(new Error('Image export failed')),'image/png'));
    downloadBlob(blob,'Worldwide Stages - '+selectedOption.id+' - '+new Date().toISOString().replace(/[:.]/g,'-')+'.png');state.lastCapture={width:w,height:h,bytes:blob.size,option:selectedOption.id,composition:fullSite?'centered full site':'current angle'};toast('Image saved · '+w+' × '+h);
  }catch(error){console.error(error);toast('Image could not be saved. Please try again.');}
  finally{
    renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);composer.setPixelRatio(ratio);composer.setSize(size.x,size.y);
    camera.copy(savedCamera);controls.target.copy(savedTarget);controls.autoRotate=savedAutoRotate;controls.enabled=savedEnabled;controls.maxDistance=savedMaxDistance;transition=savedTransition;$('spin').textContent=savedSpinLabel;$('spin').setAttribute('aria-pressed',savedSpinPressed);
    captureBusy=false;$('capture').disabled=false;if(host.clientWidth!==size.x||host.clientHeight!==size.y)resize();else{draw();requestRender();}
  }
};
function cleanMode(enabled){document.body.classList.toggle('clean',enabled);$('restore').hidden=!enabled;$('more').open=false;}$('clean').onclick=()=>cleanMode(true);$('restore').onclick=()=>cleanMode(false);document.addEventListener('keydown',event=>{if(event.key==='Escape')cleanMode(false);if(event.key.toLowerCase()==='h'&&!event.metaKey&&!event.ctrlKey)cleanMode(!document.body.classList.contains('clean'));});$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{cleanMode(true);toast('Controls hidden for an unobstructed view');}$('more').open=false;};document.addEventListener('fullscreenchange',resize);document.addEventListener('pointerdown',event=>{if(!$('more').contains(event.target))$('more').open=false;});document.addEventListener('visibilitychange',()=>{if(document.hidden){if(frameId)cancelAnimationFrame(frameId);frameId=null;}else requestRender();});
async function start(){try{const response=await fetch(new URL('./assets/options.json',import.meta.url),{cache:'no-cache'});if(!response.ok)throw new Error('Planning index unavailable');manifest=await response.json();if(!Array.isArray(manifest.options)||!manifest.options.length)throw new Error('No planning options in the index');state.manifest=manifest;buildPicker();buildComparison();refreshComparisonDownload();$('assumptions-list').replaceChildren();const inputs=manifest.assumptions?.length?manifest.assumptions:['Site boundaries, ownership, topography, zoning and setbacks are unresolved.','Structure, foundations, fire safety, accessibility and engineering design need licensed review.','Utility capacity, including the requested power allowance, remains unverified.'];for(const input of inputs){const li=document.createElement('li');li.textContent=input;$('assumptions-list').append(li);}const requested=new URLSearchParams(location.search).get('option');await loadOption(manifest.options.some(option=>option.id===requested)?requested:manifest.options[0].id);}catch(error){showError(error);}}
state.selectOption=loadOption;state.selectView=selectView;state.setLighting=setLighting;state.depthMode='logarithmic';start();
