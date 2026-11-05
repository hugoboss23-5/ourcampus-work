// OurCampus reconstruction, 2026-09-05. Geometry and photo references are kept
// in campus-geometry.json and the reconstruction evidence record. No random
// equipment, doors or parked cars: each architectural feature is explicit.
export function createCampus(THREE, scene, W, data) {
  const root=new THREE.Group();root.name='OurCampus • source reconstruction 2026-09-05';scene.add(root);
  const ft=data.worldUnitsPerFoot||0.1;
  const groups={},buildMats={},buildMeshes={},batches=new Map();
  let layer='shell';
  const setLayer=value=>{layer=value;};
  let seed=524;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const tex=(kind)=>{
    const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
    const base={concrete:[121,123,122],asphalt:[73,75,76],roof:[184,188,187],metal:[57,60,62],brick:[124,77,56],plaster:[148,148,139]}[kind];
    const im=g.createImageData(512,512);
    for(let i=0;i<im.data.length;i+=4){const n=(rand()-.5)*(kind==='asphalt'?22:12);for(let k=0;k<3;k++)im.data[i+k]=base[k]+n;im.data[i+3]=255;}
    g.putImageData(im,0,0);
    if(kind==='brick'){
      g.strokeStyle='#b1a48e';g.lineWidth=2;
      for(let y=0;y<512;y+=32){g.beginPath();g.moveTo(0,y);g.lineTo(512,y);g.stroke();for(let x=-(y%64?32:0);x<512;x+=64){g.beginPath();g.moveTo(x,y);g.lineTo(x,y+32);g.stroke();}}
    }
    if(kind==='metal'||kind==='roof'){
      for(let x=0;x<512;x+=16){g.fillStyle=kind==='metal'?'rgba(4,8,12,.12)':'rgba(55,62,64,.12)';g.fillRect(x,0,2,512);g.fillStyle='rgba(255,255,255,.09)';g.fillRect(x+2,0,2,512);}
    }
    if(kind==='concrete'){
      g.strokeStyle='rgba(45,48,50,.28)';g.lineWidth=1.5;g.strokeRect(0,0,512,512);
      for(let i=0;i<40;i++){const x=rand()*512;g.fillStyle='rgba(40,44,46,.025)';g.fillRect(x,0,rand()*12,512);}
    }
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;
  };
  const textures=Object.fromEntries(['concrete','asphalt','roof','metal','brick','plaster'].map(k=>[k,tex(k)]));
  const mat=(color,roughness=.83,metalness=0,map=null)=>{
    const m=new THREE.MeshStandardMaterial({color,roughness,metalness,map});
    if(map){
      const scale=map===textures.brick?1.1:map===textures.metal?1.0:0.32;
      m.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 vCampusPos; varying vec3 vCampusNormal;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          vec4 campusP=vec4(transformed,1.0);vec3 campusN=normal;
          #ifdef USE_INSTANCING
            campusP=instanceMatrix*campusP;campusN=mat3(instanceMatrix)*campusN;
          #endif
          vCampusPos=(modelMatrix*campusP).xyz;vCampusNormal=normalize(mat3(modelMatrix)*campusN);`);
        shader.fragmentShader='varying vec3 vCampusPos; varying vec3 vCampusNormal;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
          vec3 campusN=abs(vCampusNormal);
          vec2 campusUV=campusN.y>max(campusN.x,campusN.z)?vCampusPos.xz:(campusN.x>campusN.z?vCampusPos.zy:vCampusPos.xy);
          diffuseColor*=texture2D(map,campusUV*${scale.toFixed(3)});
          #endif`);
      };
      m.customProgramCacheKey=()=>`campus-world-uv-${scale}`;
    }return m;
  };
  const mats={
    concrete:mat(0xffffff,.92,0,textures.concrete),asphalt:mat(0xffffff,.95,0,textures.asphalt),
    roof:mat(0xffffff,.62,.18,textures.roof),metal:mat(0xffffff,.8,.13,textures.metal),
    brick:mat(0xffffff,.95,0,textures.brick),plaster:mat(0xffffff,.91,0,textures.plaster),
    charcoal:mat(0x333739,.86),white:mat(0xd6d7cf,.84),black:mat(0x15191d,.83),
    glass:mat(0x21303a,.24,.42),steel:mat(0x9ca4a7,.42,.65),yellow:mat(0xbba65a,.88),
    stripe:mat(0xc4c5b8,.91),red:mat(0x85372d,.92),shadow:mat(0x101315,1),soil:mat(0x716d5d,.95),
    leaves:mat(0x4d6243,.96),trunk:mat(0x625746,.95)
  };
  const mesh=(geo,material,name='')=>{
    const m=new THREE.Mesh(geo,material);m.castShadow=true;m.receiveShadow=true;
    m.userData.layer=layer;
    if(name){m.userData.space=name;(buildMeshes[name]??=[]).push(m);}
    root.add(m);return m;
  };
  const boxes=(material,x,y,z,w,h,d,space='',rot=0)=>{
    if(w<=0||h<=0||d<=0)throw new Error('Invalid feature dimensions');
    const key=material.uuid+'|'+space+'|'+layer;
    if(!batches.has(key))batches.set(key,{material,space,layer,values:[]});
    batches.get(key).values.push([x,y,z,w,h,d,rot]);
  };
  const atBox=(material,x,z,w,d,y,h,space='',rot=0)=>{const p=W(x,z);boxes(material,p.x,y+h/2,p.z,w*.1,h,d*.1,space,rot);};
  const line=(a,b,width,height,material,space='')=>{
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),len=av.distanceTo(bv);
    const p=av.add(bv).multiplyScalar(.5),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize());
    const key=material.uuid+'|'+space+'|'+layer;if(!batches.has(key))batches.set(key,{material,space,layer,values:[]});
    batches.get(key).values.push([p.x,p.y,p.z,width,height,len,0,q.toArray()]);
  };
  const bounds=pts=>({x0:Math.min(...pts.map(p=>p[0])),x1:Math.max(...pts.map(p=>p[0])),z0:Math.min(...pts.map(p=>p[1])),z1:Math.max(...pts.map(p=>p[1]))});
  const inside=(x,z,pts)=>{let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;};
  const shape=pts=>new THREE.Shape(pts.map(p=>{const v=W(...p);return new THREE.Vector2(v.x,-v.z);}));
  const slab=(pts,y,thick,material,name='',holes=[])=>{const outline=shape(pts);for(const hole of holes)outline.holes.push(new THREE.Path(hole.map(p=>{const q=W(...p);return new THREE.Vector2(q.x,-q.z);})));const m=mesh(new THREE.ExtrudeGeometry(outline,{depth:thick,bevelEnabled:false,curveSegments:24}),material,name);m.rotation.x=-Math.PI/2;m.position.y=y;return m;};
  function wall(a,b,y,h,material,space='',openings=[]) {
    const av=W(...a),bv=W(...b),dx=bv.x-av.x,dz=bv.z-av.z,len=Math.hypot(dx,dz),rot=-Math.atan2(dz,dx);
    if(len<.001)return;
    const box=(l,r,base,height,depth=.065)=>{if(r-l<.001||height<.001)return;boxes(material,av.x+dx*(l+r)/2,y+base+height/2,av.z+dz*(l+r)/2,(r-l)*len,height,depth,space,rot);};
    const holes=openings.map(o=>({...o,l:Math.max(0,o.t-o.w*ft/len/2),r:Math.min(1,o.t+o.w*ft/len/2),bottom:Math.max(0,(o.sill||0)*ft),top:Math.min(h,((o.sill||0)+o.h)*ft)})).filter(o=>o.r>o.l&&o.top>o.bottom);
    // Subtract the union of all 2D openings. A facade can have windows on
    // multiple floors with the same horizontal position.
    const cuts=[...new Set([0,1,...holes.flatMap(o=>[o.l,o.r])])].sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++){
      const l=cuts[i-1],r=cuts[i],mid=(l+r)/2;
      const covered=holes.filter(o=>o.l<mid&&o.r>mid).map(o=>[o.bottom,o.top]).sort((a,b)=>a[0]-b[0]);
      let bottom=0;
      for(const [lo,hi] of covered){if(lo>bottom)box(l,r,bottom,lo-bottom);bottom=Math.max(bottom,hi);}
      box(l,r,bottom,h-bottom);
    }
    for(const o of holes){
      if(o.open)continue;
      const {l,r,bottom}=o,oh=o.top-bottom,nx=dz/len,nz=-dx/len,x=av.x+dx*o.t,z=av.z+dz*o.t;
      boxes(o.glass?mats.glass:mats.shadow,x-nx*.025,y+bottom+oh/2,z-nz*.025,(r-l)*len,oh,.025,space,rot);
      if(!o.glass){
        boxes(mats.charcoal,x-nx*.012,y+bottom+oh/2,z-nz*.012,(r-l)*len-.035,oh-.025,.015,space,rot);
        for(let sy=.06;sy<oh;sy+=.055)boxes(mats.black,x+nx*.012,y+bottom+sy,z+nz*.012,(r-l)*len-.04,.009,.016,space,rot);
      }else{
        for(const t of [l,(l+r)/2,r])boxes(mats.plaster,av.x+dx*t+nx*.012,y+bottom+oh/2,av.z+dz*t+nz*.012,.025,oh,.075,space,rot);
        boxes(mats.plaster,x+nx*.012,y+bottom+oh*.45,z+nz*.012,(r-l)*len,.025,.075,space,rot);
      }
      boxes(mats.black,x+nx*.01,y+bottom+oh,z+nz*.01,(r-l)*len+.09,.055,.10,space,rot);
      if(o.dock){
        boxes(mats.concrete,x+nx*.18,y+bottom-.10,z+nz*.18,(r-l)*len+.15,.2,.48,space,rot);
        for(const s of [-1,1])boxes(mats.black,x+dx/len*s*(r-l)*len*.4+nx*.39,y+bottom-.03,z+dz/len*s*(r-l)*len*.4+nz*.39,.055,.20,.06,space,rot);
      }
    }
  }
  const edgePoint=(b,side,t)=>{
    const bb=bounds(b.pts);if(side==='west')return [bb.x0,bb.z0+(bb.z1-bb.z0)*t];if(side==='east')return [bb.x1,bb.z0+(bb.z1-bb.z0)*t];if(side==='north')return [bb.x0+(bb.x1-bb.x0)*t,bb.z0];return [bb.x0+(bb.x1-bb.x0)*t,bb.z1];
  };
  function textPanel(text,x,z,y,width,height,rot=0,bg=null,color='#dedfd8',space='') {
    const c=document.createElement('canvas');c.width=1024;c.height=Math.max(128,Math.round(1024*height/width));const g=c.getContext('2d');
    if(bg){g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);}g.fillStyle=color;g.textAlign='center';g.textBaseline='middle';
    const lines=text.split('\n');g.font=`600 ${Math.min(c.height/(lines.length+0.5),c.width/Math.max(...lines.map(s=>s.length))*.95)}px Arial`;
    lines.forEach((s,i)=>g.fillText(s,c.width/2,c.height*(i+.5)/lines.length));
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;
    const m=mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map:t,transparent:!bg,roughness:.85,side:THREE.DoubleSide}),space);
    const p=W(x,z);m.position.set(p.x,y,p.z);m.rotation.y=rot;return m;
  }
  function roof(b,material) {
    const bb=bounds(b.pts),geo=new THREE.ShapeGeometry(shape(b.pts)),pos=geo.attributes.position;
    const ridge=b.roof==='gable'?(b.riseFt||4)*ft:0;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),z=-pos.getY(i),mx=x*10+1400;
      const h=b.h+ridge*(1-Math.abs((mx-bb.x0)/(bb.x1-bb.x0)*2-1));
      pos.setXYZ(i,x,h,z);
    }
    // A ridge must be part of the mesh, not merely a displaced rectangle's
    // four vertices (all four eaves have the same height).
    if(ridge){
      geo.dispose();const x0=W(bb.x0,bb.z0).x,x1=W(bb.x1,bb.z0).x,z0=W(bb.x0,bb.z0).z,z1=W(bb.x0,bb.z1).z,xc=(x0+x1)/2,h=b.h,r=h+ridge,mid=(bb.x0+bb.x1)/2;
      const clip=(pts,left)=>{const out=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],ain=left?a[0]<=mid:a[0]>=mid,bin=left?b[0]<=mid:b[0]>=mid;if(ain)out.push(a);if(ain!==bin){const t=(mid-a[0])/(b[0]-a[0]);out.push([mid,a[1]+t*(b[1]-a[1])]);}}return out;};
      for(const half of [clip(b.pts,true),clip(b.pts,false)]){
        const rg=new THREE.ShapeGeometry(shape(half)),rp=rg.attributes.position;
        for(let i=0;i<rp.count;i++){const x=rp.getX(i),z=-rp.getY(i);rp.setXYZ(i,x,h+ridge*(1-Math.abs((x-x0)/(x1-x0)*2-1)),z);}rg.computeVertexNormals();mesh(rg,material,b.name);
      }
      for(let i=0;i<b.pts.length;i++){
        const a=b.pts[i],c=b.pts[(i+1)%b.pts.length];const edge=[a];if((a[0]<mid&&c[0]>mid)||(a[0]>mid&&c[0]<mid)){const t=(mid-a[0])/(c[0]-a[0]);edge.push([mid,a[1]+(c[1]-a[1])*t]);}edge.push(c);
        for(let j=1;j<edge.length;j++){const p=W(...edge[j-1]),q=W(...edge[j]),ph=h+ridge*(1-Math.abs((p.x-x0)/(x1-x0)*2-1)),qh=h+ridge*(1-Math.abs((q.x-x0)/(x1-x0)*2-1));
          const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute([p.x,h,p.z,p.x,ph,p.z,q.x,qh,q.z,p.x,h,p.z,q.x,qh,q.z,q.x,h,q.z],3));gg.computeVertexNormals();const m=mesh(gg,mats.metal,b.name);m.material=mats.metal.clone();m.material.side=THREE.DoubleSide;
        }
      }
      boxes(mats.steel,xc,r+.015,(z0+z1)/2,.075,.035,z1-z0,b.name);
      // Standing seams parallel to the pitch. Three-dimensional, subtle.
      for(let z=z0+.32;z<z1;z+=.46){
        const my=z*10+650;let spans=[];for(let i=0;i<b.pts.length;i++){const a=b.pts[i],c=b.pts[(i+1)%b.pts.length];if((a[1]>my)!==(c[1]>my))spans.push(a[0]+(my-a[1])*(c[0]-a[0])/(c[1]-a[1]));}spans.sort((a,b)=>a-b);
        for(let i=0;i+1<spans.length;i+=2){const breaks=[spans[i],...(spans[i]<mid&&spans[i+1]>mid?[mid]:[]),spans[i+1]];for(let j=1;j<breaks.length;j++){const a=W(breaks[j-1],my).x,c=W(breaks[j],my).x,ry=x=>h+ridge*(1-Math.abs((x-x0)/(x1-x0)*2-1))+.012;line([a,ry(a),z],[c,ry(c),z],.008,.007,mats.steel,b.name);}}
      }
    }else{geo.computeVertexNormals();mesh(geo,material,b.name);}
  }
  function fence(pts,y=0,h=.85,closed=true,space='',skip=[]){
    for(let i=0;i<pts.length-(closed?0:1);i++){
      if(skip.includes(i))continue;const a=W(...pts[i]),b=W(...pts[(i+1)%pts.length]),dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),rot=-Math.atan2(dz,dx);
      for(let t=0;t<=len;t+=.9)boxes(mats.charcoal,a.x+dx*t/len,y+h/2,a.z+dz*t/len,.045,h,.045,space);
      for(const sy of [.14,h-.10])boxes(mats.charcoal,(a.x+b.x)/2,y+sy,(a.z+b.z)/2,len,.025,.025,space,rot);
      for(let t=.09;t<len;t+=.095)boxes(mats.charcoal,a.x+dx*t/len,y+h/2,a.z+dz*t/len,.012,h,.012,space);
    }
  }
  function pole(x,z,y=0){
    const p=W(x,z);boxes(mats.concrete,p.x,y+.11,p.z,.16,.22,.16);boxes(mats.charcoal,p.x,y+1.32,p.z,.035,2.6,.035);boxes(mats.charcoal,p.x,y+2.62,p.z,.65,.035,.05);
    for(const s of [-1,1])boxes(mats.steel,p.x+s*.25,y+2.66,p.z,.2,.055,.12);
  }
  function hvac(x,z,y,w=10,d=7,h=4,space=''){
    const p=W(x,z);boxes(mats.black,p.x,y+.04,p.z,w*ft+.10,.08,d*ft+.10,space);boxes(mats.steel,p.x,y+.08+h*ft/2,p.z,w*ft,h*ft,d*ft,space);
    for(let j=0;j<7;j++)boxes(mats.charcoal,p.x,y+.14+j*h*ft/8,p.z+d*ft/2+.006,w*ft*.87,.012,.012,space);
    const fan=mesh(new THREE.CylinderGeometry(w*ft*.22,w*ft*.22,.025,16),mats.charcoal,space);fan.position.set(p.x,y+h*ft+.095,p.z);
  }
  function parking(l){
    const bb=bounds(l.pts),y=(l.y||.015)+.027;
    const rowStep=56,stall=9.2,depth=18;
    const horizontal=(bb.x1-bb.x0)>(bb.z1-bb.z0)*.8;
    const u0=horizontal?bb.x0:bb.z0,u1=horizontal?bb.x1:bb.z1,v0=horizontal?bb.z0:bb.x0,v1=horizontal?bb.z1:bb.x1;
    let count=0;
    for(let v=v0+5;v+depth<v1-4;v+=rowStep)for(let u=u0+5;u+stall<u1-4;u+=stall){
      if(l.maxStalls&&count>=l.maxStalls)continue;
      const p=horizontal?[u,v]:[v,u],q=horizontal?[u+stall,v+depth]:[v+depth,u+stall];
      const corners=[p,[q[0],p[1]],q,[p[0],q[1]]];
      if(corners.some(v=>!inside(...v,l.pts)))continue;
      const samples=corners.flatMap((a,i)=>{const b=corners[(i+1)%4];return [0.25,.5,.75].map(t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);});
      if(samples.some(v=>!inside(...v,l.pts)))continue;
      if(l.obstacles?.some(o=>p[0]<o[2]+5&&q[0]>o[0]-5&&p[1]<o[3]+5&&q[1]>o[1]-5))continue;
      const a=W(...p),b=W(...q),xm=horizontal?a.x:(a.x+b.x)/2,zm=horizontal?(a.z+b.z)/2:a.z;
      boxes(l.dark?mats.stripe:mats.yellow,xm,y,zm,horizontal?.027:depth*.1,.006,horizontal?depth*.1:.027,l.name);
      const ex=W(...(horizontal?[u+stall,v]:[v,u+stall]));boxes(l.dark?mats.stripe:mats.yellow,horizontal?ex.x:xm,y,horizontal?zm:ex.z,horizontal?.027:depth*.1,.006,horizontal?depth*.1:.027,l.name);
      count++;
    }l.modeledStalls=count;
  }
  // Data records are campus-plan traces. Roof elevations are sourced clear
  // heights + explicitly stated roof allowances, never area-derived heights.
    const buildings=data.buildings.map(b=>({...b,h:(b.roofElevationFt??(b.clearHeightFt+(b.roofAllowanceFt??2)))*ft}));
  const lots=data.lots.map(l=>({...l}));
  for(const b of buildings){
    const original=mats[b.material]||mats.concrete,material=original.clone();material.onBeforeCompile=original.onBeforeCompile;material.customProgramCacheKey=original.customProgramCacheKey;material.emissive=new THREE.Color(0xff9e2c);material.emissiveIntensity=0;buildMats[b.name]=[material];
    slab(b.pts,.01,.055,mats.concrete,b.name);
    for(let i=0;i<b.pts.length;i++)wall(b.pts[i],b.pts[(i+1)%b.pts.length],.05,b.h-.05,material,b.name,b.openings?.filter(o=>o.edge===i)||[]);
    setLayer('roof');
    if(b.roof!=='parking'){
      if(b.roofParts)for(const pts of b.roofParts)roof({...b,pts},mats.roof);
      else roof(b,b.material==='brick'?mats.asphalt:mats.roof);
    }
    if(b.roof!=='gable'&&b.roof!=='parking')for(let i=0;i<b.pts.length;i++)wall(b.pts[i],b.pts[(i+1)%b.pts.length],b.h,.16,b.material==='brick'?mats.brick:mats.charcoal,b.name,(b.openings||[]).filter(o=>o.edge===i&&o.open).map(o=>({...o,sill:0,h:2})));
    setLayer('shell');
    groups[b.name]=b;
  }
  for(const l of lots){setLayer(l.name==='LOT D'?'roof':'shell');slab(l.pts,l.y||.015,.024,l.dark?mats.asphalt:mats.concrete,l.name,l.holes||[]);if(l.parking)parking(l);}setLayer('shell');
  // Feature builders below use the same source footprint records as picking
  // and highlighting; there is no second hand-maintained outline layer.
  const setRoofVisible=visible=>root.traverse(m=>{if(m.userData.layer==='roof')m.visible=visible;});
  const api={root,buildings,lots,buildMats,buildMeshes,groups,ft,mats,boxes,atBox,wall,slab,roof,fence,pole,hvac,textPanel,line,bounds,edgePoint,inside,W,THREE,setLayer,setRoofVisible};
  return {...api,finish(){
    const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),p=new THREE.Vector3(),s=new THREE.Vector3();
    for(const {material,space,layer,values} of batches.values()){
      const m=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,values.length);m.castShadow=true;m.receiveShadow=true;
      m.userData.layer=layer;
      values.forEach((v,i)=>{p.set(v[0],v[1],v[2]);s.set(v[3],v[4],v[5]);if(v[7])q.fromArray(v[7]);else{e.set(0,v[6],0);q.setFromEuler(e);}matrix.compose(p,q,s);m.setMatrixAt(i,matrix);});
      if(space){m.userData.space=space;(buildMeshes[space]??=[]).push(m);}m.computeBoundingSphere();root.add(m);
    }
    return {buildingCount:buildings.length,lotCount:lots.length,features:[...batches.values()].reduce((n,b)=>n+b.values.length,0),footprintSource:data.source,deterministic:true};
  }};
}
