// 2026-09-05 — plan-local interior tours. One host renderer, no extra animation loop.
import * as THREE from 'three';
import {buildInteriorScene} from './interior-scene.js';
import {buildRoute} from './interior-navigation.js';

const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const clock=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
export function createInteriorViewer({renderer,onEnter=()=>{},onExit=()=>{}}){
  const root=document.createElement('section');
  root.id='interiorOverlay';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','interiorTitle');
  root.innerHTML=`
    <div class="iv-stage" tabindex="0" aria-label="3D interior. Drag to look around. W and S move along the checked route. Arrow keys look around."></div>
    <header class="iv-head">
      <button class="iv-back" type="button" aria-label="Back to campus">← <span>Campus</span></button>
      <div class="iv-brand"><span>OURCAMPUS / INSIDE</span><small>TEST SITE · SOURCE-BASED RECONSTRUCTION</small></div>
      <label class="iv-select-label"><span class="iv-sr">Building and floor</span><select id="interiorRoom" aria-label="Building and floor"><option>Loading spaces…</option></select></label>
      <label class="iv-route-label" hidden><span class="iv-sr">Route within this building</span><select class="iv-route" aria-label="Route within this building"></select></label>
      <button class="iv-source-toggle" type="button" aria-expanded="false" aria-controls="interiorSources">Sources <span aria-hidden="true">↗</span></button>
    </header>
    <div class="iv-loading" role="status"><span class="iv-loader"></span><p>Building the interior…</p></div>
    <div class="iv-caption"><span class="iv-eyebrow">AT EYE LEVEL</span><h1 id="interiorTitle">Inside the buildings</h1><p class="iv-summary"></p><p class="iv-limit">Reconstruction, not an indoor scan. Some dimensions and finishes are approximate.</p></div>
    <div class="iv-map" aria-label="Floor plan with tour route and current location"><span>PLAN / YOUR POSITION</span><svg viewBox="0 0 240 150" role="img" aria-label="Checked route through the floor plan"></svg></div>
    <div class="iv-transport">
      <div class="iv-progress"><input type="range" min="0" max="1000" value="0" aria-label="Position along the tour" step="1"></div>
      <div class="iv-controls"><button class="iv-play" type="button" aria-label="Pause tour">Pause</button><button class="iv-restart" type="button" aria-label="Restart tour">↺</button><span class="iv-time">0:00 / 0:00</span><span class="iv-control-spacer"></span><label class="iv-speed-label"><span class="iv-sr">Tour speed</span><select class="iv-speed" aria-label="Tour speed"><option value="0.6">Slow</option><option value="1" selected>Walk</option><option value="1.6">Glide</option></select></label><button class="iv-center" type="button">Face forward</button></div>
      <p class="iv-help"><span class="iv-desktop-help">Drag to look · W / S to travel · Space to pause · Esc to return</span><span class="iv-touch-help">Drag to look · Play to move · Slide to explore</span></p>
    </div>
    <aside id="interiorSources" class="iv-sources" hidden aria-label="Reconstruction sources"><div class="iv-source-head"><h2>The evidence</h2><button class="iv-source-close" type="button" aria-label="Close sources">×</button></div><div class="iv-source-content"></div></aside>`;
  document.body.append(root);
  const $=s=>root.querySelector(s),stage=$('.iv-stage'),select=$('#interiorRoom'),loading=$('.iv-loading'),slider=$('input[type=range]'),play=$('.iv-play'),time=$('.iv-time'),map=$('.iv-map svg'),sources=$('.iv-sources'),sourceToggle=$('.iv-source-toggle');
  const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.035,1000);
  camera.rotation.order='YXZ';
  let active=false,room=null,built=null,route=null,registry=null,fetchPromise=null,token=0,distance=0,playing=false,speed=1,yaw=0,pitch=.045,drag=null,lastUI=-1,rendererState=null,restoreFocus=null,previousHash='',previousTitle='',inertState=[];
  const held=new Set(),desiredQ=new THREE.Quaternion(),orientationCamera=new THREE.PerspectiveCamera();
  const clearInput=()=>{held.clear();if(drag){try{stage.releasePointerCapture(drag.id);}catch{}drag=null;}};
  const baseSpeed=()=>room?.office?1:1.5;
  function setPlaying(value){playing=!!value&&!!route;play.textContent=playing?'Pause':'Play';play.setAttribute('aria-label',playing?'Pause tour':'Play tour');root.classList.toggle('iv-playing',playing);}
  function showSources(show){clearInput();sources.hidden=!show;stage.inert=show;$('.iv-transport').inert=show;sourceToggle.setAttribute('aria-expanded',String(show));root.classList.toggle('iv-sources-open',show);if(show){setPlaying(false);fillSources();$('.iv-source-close').focus();}else sourceToggle.focus();}
  async function getRooms(){
    if(registry)return registry;
    if(!fetchPromise)fetchPromise=fetch(new URL('./interior-rooms.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('The room source data could not be loaded.');return r.json();}).then(d=>{registry=d.rooms;return registry;}).catch(e=>{fetchPromise=null;throw e;});
    return fetchPromise;
  }
  function fillSources(){
    if(!room)return;
    const photos=room.photos||[];
    $('.iv-source-content').innerHTML=`<p class="iv-source-kicker">${escapeHTML(room.name)} / 5 SEPTEMBER 2026</p><p>Built from the supplied studio plans and photographs. This is a reconstruction—not a measured scan or a guarantee of present condition.</p><h3>Scale and height evidence</h3><p>${escapeHTML(room.scaleEvidence||'Published ceiling height and plan-local footprint; support centers digitized from the drawings.')}</p><p>${escapeHTML(room.heightEvidence||'Height is approximate.')}</p><h3>What remains approximate</h3><ul>${(room.notes||[]).map(n=>'<li>'+escapeHTML(n)+'</li>').join('')}</ul><p>Material colors, fixture spacing, lighting, structural member sizes and camera paths are interpretations. Use the original documents for decisions about fit or clearance.</p>${photos.length?'<h3>Original photographs</h3>'+photos.map(p=>`<figure><img loading="lazy" src="${escapeHTML(p.url)}" alt="${escapeHTML(p.caption||room.name+' supplied photograph')}"><figcaption>${escapeHTML(p.caption||'Supplied studio photograph')}</figcaption></figure>`).join(''):'<p class="iv-no-photo">No room-specific interior photograph is available. Finishes are a neutral plan study.</p>'}${room.planUrl?`<h3>Published floor plan</h3><a href="${escapeHTML(room.planUrl)}" target="_blank" rel="noopener"><img loading="lazy" class="iv-plan-source" src="${escapeHTML(room.planUrl)}" alt="Original ${escapeHTML(room.name)} floor plan"></a>`:''}${room.pdfUrl?`<a class="iv-pdf" href="${escapeHTML(room.pdfUrl)}" target="_blank" rel="noopener">Open original specification sheet ↗</a>`:''}`;
  }
  function drawMap(){
    if(!room||!route)return;
    const footprint=room.footprint, xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[1]);
    const x0=Math.min(...xs),z0=Math.min(...zs),w=Math.max(...xs)-x0,d=Math.max(...zs)-z0,s=Math.min(212/w,122/d),ox=(240-w*s)/2,oz=(150-d*s)/2;
    const p=([x,z])=>`${(ox+(x-x0)*s).toFixed(2)},${(oz+(z-z0)*s).toFixed(2)}`;
    const segments=(room.walls||[]).flatMap(w=>{
      const len=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]),gaps=(w.doors||[]).map(d=>[clamp(d.t-d.width/len/2,0,1),clamp(d.t+d.width/len/2,0,1)]).sort((a,b)=>a[0]-b[0]);
      let end=0;const solid=[],at=t=>[w.a[0]+(w.b[0]-w.a[0])*t,w.a[1]+(w.b[1]-w.a[1])*t];for(const [a,b]of gaps){if(a>end)solid.push([at(end),at(a)]);end=Math.max(end,b);}if(end<1)solid.push([at(end),at(1)]);return solid;
    });
    map.innerHTML=`<polygon class="iv-map-floor" points="${footprint.map(p).join(' ')}"/>${(room.obstacles||[]).map(o=>`<polygon class="iv-map-obstacle" points="${o.polygon.map(p).join(' ')}"/>`).join('')}${segments.map(([a,b])=>`<polyline class="iv-map-wall" points="${p(a)} ${p(b)}"/>`).join('')}${(room.columns||[]).map(c=>`<circle class="iv-map-column" cx="${ox+(c.x-x0)*s}" cy="${oz+(c.z-z0)*s}" r="2"/>`).join('')}<polyline class="iv-map-route" points="${route.points.map(p).join(' ')}"/><circle class="iv-map-dot" r="4"/><path class="iv-map-view" d="M0 0 L-6 -13 Q0 -17 6 -13Z"/>`;
    map._project=([x,z])=>[ox+(x-x0)*s,oz+(z-z0)*s];
  }
  function syncCamera(dt=1,immediate=false){
    if(!route||!room)return;
    const p=route.sample(distance),next=route.sample(Math.min(route.length,distance+Math.max(.75,baseSpeed()*1.2))),prev=route.sample(Math.max(0,distance-1));
    if(!p)return;
    let dx=next[0]-p[0],dz=next[1]-p[1];
    if(Math.hypot(dx,dz)<1e-6){dx=p[0]-prev[0];dz=p[1]-prev[1];}
    const heading=Math.atan2(dx,dz)+yaw;
    camera.position.set(p[0],room.eyeHeight||1.65,p[1]);
    orientationCamera.position.copy(camera.position);
    orientationCamera.lookAt(p[0]+Math.sin(heading)*Math.cos(pitch),camera.position.y+Math.sin(pitch),p[1]+Math.cos(heading)*Math.cos(pitch));
    desiredQ.copy(orientationCamera.quaternion);
    if(immediate)camera.quaternion.copy(desiredQ);else camera.quaternion.slerp(desiredQ,1-Math.exp(-dt*6));
    camera.updateMatrixWorld();
    const dot=$('.iv-map-dot'),cone=$('.iv-map-view');
    if(dot&&map._project){const q=map._project(p);dot.setAttribute('cx',q[0]);dot.setAttribute('cy',q[1]);const direction=new THREE.Vector3();camera.getWorldDirection(direction);cone.setAttribute('transform',`translate(${q[0]} ${q[1]}) rotate(${180-Math.atan2(direction.x,direction.z)*180/Math.PI})`);}
  }
  function syncUI(force=false){
    if(!route)return;
    const rate=baseSpeed()*speed,second=Math.floor(distance/rate);if(second===lastUI&&!force)return;lastUI=second;
    slider.value=String(Math.round(distance/route.length*1000));slider.setAttribute('aria-valuetext',`${clock(distance/rate)} of ${clock(route.length/rate)}`);
    time.textContent=`${clock(distance/rate)} / ${clock(route.length/rate)}`;
    root.style.setProperty('--iv-progress',`${distance/route.length*100}%`);
  }
  function routeFor(selected,waypoints=selected.waypoints){
    return buildRoute({footprint:selected.footprint,walls:selected.walls||[],obstacles:selected.obstacles||[],circles:(selected.columns||[]).map(c=>({...c,radius:c.radius??.55})),waypoints,clearance:selected.navigationClearance??selected.clearance??.28});
  }
  async function open(id='ace6'){
    const thisToken=++token;
    if(!active){
      restoreFocus=document.activeElement;previousTitle=document.title;previousHash=location.hash.startsWith('#inside=')?'#model':location.hash;
      onEnter();active=true;root.hidden=false;document.body.classList.add('interiorOpen');
      inertState=[...document.body.children].filter(e=>e!==root&&e!==renderer.domElement&&!['SCRIPT','STYLE','LINK'].includes(e.tagName)).map(e=>({e,inert:e.inert}));inertState.forEach(({e})=>e.inert=true);
      rendererState={toneMappingExposure:renderer.toneMappingExposure,autoClear:renderer.autoClear,shadowAutoUpdate:renderer.shadowMap.autoUpdate};
      renderer.toneMappingExposure=1;renderer.autoClear=true;renderer.shadowMap.autoUpdate=false;
    }
    clearInput();setPlaying(false);loading.hidden=false;loading.innerHTML='<span class="iv-loader"></span><p>Building the interior…</p>';
    root.classList.add('iv-is-loading');sources.hidden=true;sourceToggle.setAttribute('aria-expanded','false');root.classList.remove('iv-sources-open');
    $('.iv-stage').inert=true;$('.iv-transport').inert=true;$('.iv-back').focus({preventScroll:true});
    try{
      const rooms=await getRooms();if(!active||token!==thisToken)return;
      select.innerHTML=rooms.map(r=>`<option value="${escapeHTML(r.id)}">${escapeHTML(r.name)}</option>`).join('');
      const selected=rooms.find(r=>r.id===id);if(!selected){select.selectedIndex=-1;throw Error('This building does not have an interior tour. Choose a listed space.');}select.value=id;
      if(![selected.width,selected.depth,selected.height,selected.eyeHeight??1.65].every(n=>Number.isFinite(n)&&n>0))throw Error('This room has incomplete scale data.');
      const nextRoute=routeFor(selected);
      if(!nextRoute.validation.valid||nextRoute.length<.5)throw Error('This route did not pass the clearance check. Choose another room.');
      // Give the loading status a paint before synchronous geometry compilation.
      await new Promise(resolve=>requestAnimationFrame(()=>resolve()));if(!active||token!==thisToken)return;
      const nextBuilt=buildInteriorScene(selected);
      if(!active||token!==thisToken){nextBuilt.dispose();return;}
      if(built)built.dispose();built=nextBuilt;room=selected;route=nextRoute;distance=0;yaw=0;pitch=.045;lastUI=-1;
      renderer.shadowMap.needsUpdate=true;
      camera.far=Math.max(250,Math.hypot(room.width,room.depth)*3);resize(innerWidth,innerHeight);
      $('#interiorTitle').textContent=room.name;
      document.title=room.name+' — OurCampus Test Site';
      const planStudy=room.office||room.id.startsWith('539');
      $('.iv-summary').textContent=planStudy?'Follow the published floor plan.':room.upperLevel?'Follow the L-shaped mezzanine overlooking the warehouse.':'A guided route through the '+(room.id.startsWith('m')?'stage.':'warehouse.');
      $('.iv-eyebrow').textContent=planStudy?'PLAN RECONSTRUCTION':room.upperLevel?'MEZZANINE / ESTIMATED ELEVATION':room.heightEvidence?.startsWith('SOURCED:')?`${Math.round(room.height/.3048*10)/10} FT PUBLISHED CEILING · ${(room.columns||[]).length} PLAN SUPPORTS`:'PLAN-BASED LAYOUT / APPROXIMATE SCALE';
      $('.iv-limit').textContent=planStudy?'Layout from plans. Unverified finishes and heights are approximate.':room.id==='ace2'?'Plan-based geometry. Supplied photos are duplicated under Ace Four.':room.upperLevel?'Deck height is estimated. This is a separate level, not a measured stair ascent.':'Source-based reconstruction. Details and some dimensions are approximate.';
      $('.iv-route-label').hidden=!room.routeVariants?.length;
      $('.iv-route').innerHTML=(room.routeVariants||[]).map((v,i)=>`<option value="${i}">${escapeHTML(v.name)}</option>`).join('');
      drawMap();syncCamera(1,true);syncUI(true);setPlaying(!reduced.matches);
      history.replaceState(null,'',`#inside=${encodeURIComponent(id)}`);
      root.classList.remove('iv-is-loading');loading.hidden=true;stage.inert=false;$('.iv-transport').inert=false;stage.focus({preventScroll:true});
      return room;
    }catch(error){
      if(!active||token!==thisToken)return;
      if(built){built.dispose();built=null;}room=null;route=null;root.classList.add('iv-is-loading');
      loading.hidden=false;loading.innerHTML='<p>Unable to open this interior.</p><small>'+escapeHTML(error.message)+'</small><button type="button" class="iv-error-back">Back to campus</button>';
      $('.iv-error-back').onclick=close;
      $('.iv-error-back').focus();
      console.error('Interior tour:',error);
    }
  }
  function close(restoreHash=true){
    if(!active)return;++token;clearInput();setPlaying(false);active=false;root.hidden=true;document.body.classList.remove('interiorOpen');
    if(built){built.dispose();built=null;}room=null;route=null;
    inertState.forEach(({e,inert})=>{if(e.isConnected)e.inert=inert;});inertState=[];
    if(rendererState){renderer.toneMappingExposure=rendererState.toneMappingExposure;renderer.autoClear=rendererState.autoClear;renderer.shadowMap.autoUpdate=rendererState.shadowAutoUpdate;rendererState=null;}
    renderer.setRenderTarget(null);renderer.shadowMap.needsUpdate=true;document.title=previousTitle;if(restoreHash)history.replaceState(null,'',location.pathname+location.search+previousHash);onExit();
    if(restoreFocus?.isConnected&&!restoreFocus.closest('[inert]'))restoreFocus.focus({preventScroll:true});
  }
  function resize(w,h){camera.aspect=w/h;camera.updateProjectionMatrix();}
  function update(dt){
    if(!active||!built||!route||!sources.hidden||root.classList.contains('iv-is-loading'))return;
    if(document.hidden){setPlaying(false);clearInput();return;}
    const direction=(held.has('w')?1:0)-(held.has('s')?1:0);
    if(direction){setPlaying(false);distance=clamp(distance+direction*baseSpeed()*speed*dt,0,route.length);}
    else if(playing){distance=clamp(distance+baseSpeed()*speed*dt,0,route.length);if(distance>=route.length)setPlaying(false);}
    yaw+=((held.has('arrowleft')?1:0)-(held.has('arrowright')?1:0))*dt*.85;
    pitch=clamp(pitch+((held.has('arrowup')?1:0)-(held.has('arrowdown')?1:0))*dt*.6,-1.05,1.15);
    syncCamera(dt);syncUI();
  }
  function render(){
    if(!active)return;renderer.setRenderTarget(null);renderer.clear();if(built)renderer.render(built.scene,camera);
  }
  $('.iv-back').onclick=close;play.onclick=()=>{if(route&&distance>=route.length)distance=0;setPlaying(!playing);};
  $('.iv-restart').onclick=()=>{distance=0;yaw=0;pitch=.045;syncCamera(1,true);syncUI(true);setPlaying(!reduced.matches);};
  $('.iv-center').onclick=()=>{yaw=0;pitch=.045;};
  select.onchange=()=>open(select.value);$('.iv-speed').onchange=e=>{speed=Number(e.target.value);syncUI(true);};
  $('.iv-route').onchange=e=>{const next=routeFor(room,room.routeVariants[Number(e.target.value)].waypoints);if(!next.validation.valid)return;clearInput();route=next;distance=0;yaw=0;pitch=.045;drawMap();syncCamera(1,true);syncUI(true);setPlaying(!reduced.matches);stage.focus();};
  slider.addEventListener('input',()=>{if(!route)return;setPlaying(false);distance=Number(slider.value)/1000*route.length;syncCamera(1,true);syncUI(true);});
  sourceToggle.onclick=()=>showSources(sources.hidden);$('.iv-source-close').onclick=()=>showSources(false);
  stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;clearInput();drag={id:e.pointerId,x:e.clientX,y:e.clientY};stage.setPointerCapture(e.pointerId);stage.focus({preventScroll:true});setPlaying(false);});
  stage.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;yaw-=(e.clientX-drag.x)*.0032;pitch=clamp(pitch+(e.clientY-drag.y)*.0032,-1.05,1.15);drag.x=e.clientX;drag.y=e.clientY;});
  stage.addEventListener('pointerup',clearInput);stage.addEventListener('pointercancel',clearInput);stage.addEventListener('lostpointercapture',()=>drag=null);
  stage.addEventListener('blur',clearInput);
  stage.addEventListener('wheel',e=>{e.preventDefault();if(!route)return;setPlaying(false);distance=clamp(distance+clamp(e.deltaY,-100,100)*.025,0,route.length);syncUI(true);},{passive:false});
  // Window capture gives the interior sole ownership of Escape before the old menus.
  addEventListener('keydown',e=>{
    if(!active)return;
    const key=e.key.toLowerCase(),editable=e.target.matches('input,select,textarea,button,a');
    if(e.metaKey||e.ctrlKey||e.altKey){clearInput();return;}
    if(key==='escape'){e.preventDefault();e.stopImmediatePropagation();if(!sources.hidden)showSources(false);else close();return;}
    if(key==='tab'){
      const focusScope=sources.hidden?root:sources;
      const nodes=[...focusScope.querySelectorAll('button,select,input,a,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length&&!n.closest('[hidden],[inert]'));
      const first=nodes[0],last=nodes[nodes.length-1];if(!sources.hidden&&!sources.contains(document.activeElement)){e.preventDefault();first?.focus();}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}e.stopImmediatePropagation();return;
    }
    if(!editable&&sources.hidden){
      if(key===' '){e.preventDefault();if(!e.repeat){if(route&&distance>=route.length)distance=0;setPlaying(!playing);}}
      else if(['w','s','arrowleft','arrowright','arrowup','arrowdown'].includes(key)){e.preventDefault();held.add(key);}
      else if(key==='r'){yaw=0;pitch=.045;}
    }
    e.stopImmediatePropagation();
  },true);
  addEventListener('keyup',e=>{if(active){held.delete(e.key.toLowerCase());e.stopImmediatePropagation();}},true);
  addEventListener('blur',()=>{clearInput();if(active)setPlaying(false);});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(active)setPlaying(false);}});
  addEventListener('hashchange',()=>{if(location.hash.startsWith('#inside=')){let id;try{id=decodeURIComponent(location.hash.slice(8));}catch{id='invalid';}if(id!==room?.id)open(id);}else if(active)close(false);});
  return {open,close,resize,update,render,get active(){return active;},get state(){return {active,room:room?.id,playing,distance,length:route?.length,camera:camera.position.toArray(),held:[...held],route:route?.validation,stats:built?.stats,memory:{...renderer.info.memory},render:{...renderer.info.render}};},get rooms(){return registry;},get route(){return route;},get camera(){return camera;},get scene(){return built?.scene;}};
}
