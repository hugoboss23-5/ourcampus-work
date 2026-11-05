// Photo/plan reconstruction, 2026-09-05. Counts and forms are source-backed;
// unmeasured elevations and feature offsets are explicit modeling assumptions.
const rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
export function prepareCampusData(source){
  const material={'ACE ONE':'plaster','ACE TWO':'charcoal','ACE THREE':'charcoal','ACE FOUR':'charcoal','ACE FIVE':'concrete','ACE SIX':'concrete','ACE SEVEN':'concrete','MISSION 524':'brick','MISSION 539A':'charcoal','MISSION 539B':'charcoal','MISSION 550':'plaster'};
  const buildings=source.records.filter(r=>r.kind==='building').map(r=>({name:r.name,pts:r.pointsMap,clearHeightFt:r.ceilingFeet??({'ACE ONE':36,'MISSION 524':15,'MISSION 550':23}[r.name]||17),roofAllowanceFt:2,material:material[r.name]||'metal',roof:r.name==='ACE SIX'?'parking':/^MISSION (ONE|TWO|THREE|FOUR)$/.test(r.name)?'gable':'flat',riseFt:/THREE|FOUR/.test(r.name)?5:2.5,evidence:r.evidence,openings:[]}));
  const by=Object.fromEntries(buildings.map(b=>[b.name,b]));
  // Conditional photo calibration: E1 facade ≈41 ft to parapet top; working
  // deck datum 38 ft + 3 ft parapet. See proof/ace-six-height-check.json.
  // Keep the sourced 26 ft INTERIOR clear height as a separate quantity.
  by['ACE SIX'].roofElevationFt=38;
  const opening=(name,edge,t,w=10,h=12,sill=0,dock=false,glass=false)=>by[name].openings.push({edge,t,w,h,sill,dock,glass});
  // Number of doors follows the individual space notes; placement along the
  // documented facade is digitized/reasoned from photos, not survey-measured.
  for(let i=0;i<10;i++)opening('ACE THREE',3,(i+.5)/10,7.5,11,4,true);
  for(const t of [.07,.125,.18,.235])opening('ACE FIVE',3,t,8.5,11,4,true);
  // Visible southern clerestory ribbon in the v21 aerial. Extent, pane
  // divisions and sill are photo estimates; hidden continuation is omitted.
  for(let i=0;i<12;i++)opening('ACE FIVE',3,.55+(i+.5)*.43/12,.43*194.7398/12-.35,2.25,19.5,false,true);
  // E1's tall facade and reverse E2 camera match Six's separate east face;
  // bank count is observed in the photo, facade registration is reasoned.
  for(const t of [.099,.168,.240,.309])opening('ACE SIX',1,t,9.1,11.9,3.2,true);
  opening('ACE FIVE',3,.62,12,14);opening('ACE FIVE',6,.28,12,14);opening('ACE FIVE',6,.75,12,14);
  opening('ACE SEVEN',0,.35,12,14);opening('ACE SEVEN',0,.75,12,14);
  opening('MISSION ONE',3,.38,18,16,3,true);
  opening('MISSION TWO',3,.25,14,14);opening('MISSION TWO',3,.64,14,14);
  for(const t of [.26,.56,.83])opening('MISSION THREE',1,t,18+2/12,14.5,0,false,t!==.26);
  opening('MISSION FOUR',3,.61,18+2/12,14.5,3,true);
  for(let level=0;level<3;level++)for(const edge of [0,2,3])for(let i=0;i<5;i++)opening('ACE ONE',edge,(i+.5)/5,9,7,3+level*11,false,true);
  // 524's long Willow facade is the second major straight edge; identify by
  // geometry, not by a fragile sampled-curve vertex number.
  const b524=by['MISSION 524'];
  const longEdges=b524.pts.map((p,i)=>({i,len:Math.hypot(p[0]-b524.pts[(i+1)%b524.pts.length][0],p[1]-b524.pts[(i+1)%b524.pts.length][1]),p,q:b524.pts[(i+1)%b524.pts.length]})).sort((a,b)=>b.len-a.len);
  const east=longEdges.find(e=>e.p[0]>1200&&e.q[0]>1200&&e.len>100);
  if(east)for(let i=0;i<7;i++)opening('MISSION 524',east.i,(i+.5)/7,10,11);
  const west=longEdges.find(e=>e.p[0]<1200&&e.q[0]<1200&&e.len>70);
  if(west)for(let i=0;i<4;i++)opening('MISSION 524',west.i,(i+.5)/4,10,11);
  opening('MISSION 539A',5,.3,14,12,3,true);opening('MISSION 539A',5,.75,14,12,3,true);opening('MISSION 539A',2,.55,14,12);
  // Ramp occupies an actual open strip of the Ace Five roof. Its published
  // landing is 26.5% of the deck width, not an unrelated freestanding ramp.
  const d=by['ACE SIX'].pts;const x0=d[0][0],x1=d[1][0],deckSouth=d[2][1];
  const rx=x0+(x1-x0)*.265,rw=(x1-x0)*.087;
  by['ACE FIVE'].openings=by['ACE FIVE'].openings.filter(o=>o.edge!==6);
  by['ACE FIVE'].openings.push({edge:6,t:(956.9924-rx)/(956.9924-877.9457),w:rw,h:24,open:true});
  by['ACE FIVE'].roofParts=[rect(862.5098,366.7446,rx-rw/2,632.0838),rect(877.9457,632.0838,rx-rw/2,649.154),rect(rx+rw/2,366.7446,1039.6308,392.6146),rect(rx+rw/2,392.6146,960.5855,587.3544),rect(rx+rw/2,587.3544,956.9924,649.154)];
  const counts={'LOT A':12,'LOT B':20,'LOT C':35,'LOT D':149,'LOT E':19,'LOT F':58,'LOT G':68,'LOT H':168,'LOT I':58,'LOT K':21,'LOT L-M-N':305};
  const lots=source.records.filter(r=>r.kind==='lot'||r.kind==='roof_lot').map(r=>({name:r.name==='LOT L-M-N'?'LOT L':r.name,pts:r.pointsMap,sourceName:r.name,dark:!['LOT E','LOT F','LOT K'].includes(r.name),parking:!['LOT K','LOT J','LOT D'].includes(r.name),maxStalls:counts[r.name],y:r.name==='LOT D'?3.8:0.012}));
  const dl=lots.find(l=>l.name==='LOT D');dl.obstacles=source.lotDSkylights.map(s=>[s.centerMap[0]-17,s.centerMap[1]-8,s.centerMap[0]+17,s.centerMap[1]+8]);
  const deckNorth=d[0][1],deckDepth=deckSouth-deckNorth,deckWidth=x1-x0;
  dl.holes=[.045,.955].map(u=>rect(x0+(u-.036)*deckWidth,deckNorth+.014*deckDepth,x0+(u+.036)*deckWidth,deckNorth+.096*deckDepth));
  return {buildings,lots,source:source.accuracyStatement,worldUnitsPerFoot:.1,raw:source,ramp:{x:rx,width:rw,north:deckSouth,south:649.154,height:3.8}};
}

export function addCampusDetails(c,data){
  const {THREE,W,mats,boxes,atBox,wall,slab,fence,pole,hvac,textPanel,line,groups,bounds,edgePoint}=c;
  const bb=name=>bounds(groups[name].pts);
  const canopy=(x,z,w,d,y,space)=>{
    atBox(mats.roof,x,z,w,d,y,.07,space);
    for(const sx of [-1,1])for(const sz of [-1,1])atBox(mats.charcoal,x+sx*(w/2-1),z+sz*(d/2-1),.45,.45,0,y,space);
  };
  const canopyOnEdge=(space,edge,t,w,d,y)=>{
    const pts=groups[space].pts,a=pts[edge],b=pts[(edge+1)%pts.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),ux=dx/len,uz=dz/len,nx=uz,nz=-ux;
    const x=a[0]+dx*t+nx*d/2,z=a[1]+dz*t+nz*d/2,rot=-Math.atan2(dz,dx);
    atBox(mats.roof,x,z,w,d,y,.07,space,rot);
    for(const s of [-1,1])atBox(mats.charcoal,x+ux*s*(w/2-1)+nx*(d/2-1),z+uz*s*(w/2-1)+nz*(d/2-1),.5,.5,0,y,space);
    return {x:a[0]+dx*t+nx*.6,z:a[1]+dz*t+nz*.6,rot:Math.atan2(nx,nz)};
  };
  // ACE SIX / LOT D: six skylights at the digitized drawing locations. Their
  // protective cages and nearby equipment are visible in the rooftop photos.
  const deck=groups['ACE SIX'],db=bb('ACE SIX'),deckY=deck.h;
  c.setLayer('roof');
  // The original aerial in the v21 booklet and Lot D plan show two open
  // stair-head enclosures at the street-edge corners (not closed HVAC boxes).
  for(const u of [.045,.955]){
    const x=db.x0+u*(db.x1-db.x0),z=db.z0+.055*(db.z1-db.z0),w=(db.x1-db.x0)*.09,d=(db.z1-db.z0)*.11;
    const outline=rect(x-w/2,z-d/2,x+w/2,z+d/2);
    for(let i=0;i<4;i++)wall(outline[i],outline[(i+1)%4],deckY,.75,mats.concrete,'LOT D',i===2?[{t:.5,w:5,h:8,open:true}]:[]);
    atBox(mats.shadow,x,z,w-2,d-2,deckY-1.0,.05,'LOT D');
    for(let i=0;i<12;i++)atBox(mats.concrete,x,z+d*.40-i*d*.067,w*.45,d*.07,deckY-1.0,1.0-i*.075,'LOT D');
  }
  for(const s of data.raw.lotDSkylights){
    const [x,z]=s.centerMap,w=(db.x1-db.x0)*s.lengthDeckFraction,d=(db.z1-db.z0)*s.widthDeckFraction;
    atBox(mats.charcoal,x,z,w+3,d+3,deckY+.03,.12,'LOT D');
    atBox(mats.white,x,z,w,d,deckY+.15,.20,'LOT D');
    atBox(mats.glass,x,z,w-1,d-1,deckY+.35,.035,'LOT D');
    fence(rect(x-w/2-3,z-d/2-4,x+w/2+3,z+d/2+4),deckY+.03,.68,true,'LOT D');
    hvac(x+w/2-4,z,deckY+.37,5,4,3,'LOT D');
    atBox(mats.yellow,x,z-d/2-5,w+2,1,deckY+.035,.065,'LOT D');
  }
  const ramp=data.ramp;
  // Pale roof parapet, opening exactly around the south ramp landing.
  for(let i=0;i<deck.pts.length;i++)wall(deck.pts[i],deck.pts[(i+1)%deck.pts.length],deckY,.30,mats.white,'LOT D',i===2?[{t:(db.x1-ramp.x)/(db.x1-db.x0),w:ramp.width,h:3.0,open:true}]:[]);
  // Lot D striping follows the drawing: two double-loaded internal rows,
  // perimeter stalls and clear ramp mouth. Values are digitized proportions.
  {
    const u=x=>db.x0+(db.x1-db.x0)*x,v=z=>db.z0+(db.z1-db.z0)*z,y=deckY+.057;
    const mark=(x0,z0,x1,z1)=>{const a=W(u(x0),v(z0)),b=W(u(x1),v(z1));line([a.x,y,a.z],[b.x,y,b.z],.023,.004,mats.stripe,'LOT D');};
    for(let x=.098;x<.884;x+=.0324)mark(x,.012,x,.102);
    for(const [start,end] of [[.241,.455],[.594,.808]]){
      for(let x=.158;x<.845;x+=.0324)mark(x,start,x,end);
      mark(.158,(start+end)/2,.844,(start+end)/2);
    }
    for(let z=.11;z<.75;z+=.0504)mark(.012,z,.067,z);
    for(let z=.16;z<.93;z+=.0504)mark(.931,z,.994,z);
    for(let x=.108;x<.91;x+=.090)if(x<.22||x>.31)mark(x,.945,x,.99);
  }
    for(const [u,v] of [[.12,.07],[.49,.07],[.88,.07],[.06,.48],[.52,.48],[.94,.48],[.06,.9],[.62,.9],[.94,.9]])pole(db.x0+(db.x1-db.x0)*u,db.z0+(db.z1-db.z0)*v,deckY);
  c.setLayer('shell');
  // Five actual evaporative coolers: publisher count + uneven positions
  // registered from the native v21 aerial. Approximately 7×7×6 ft each.
  c.setLayer('roof');
  for(const z of [582.788,537.037,494.958,449.491,397.527]){
    const x=890.849,y=groups['ACE FIVE'].h;
    atBox(mats.charcoal,x,z,7.8,7.8,y,.10,'ACE FIVE');
    atBox(mats.white,x,z,7,7,y+.10,.60,'ACE FIVE');
    for(let i=0;i<9;i++)for(const s of [-1,1]){
      atBox(mats.steel,x+s*3.52,z,.10,6.1,y+.16+i*.052,.014,'ACE FIVE');
      atBox(mats.steel,x,z+s*3.52,6.1,.10,y+.16+i*.052,.014,'ACE FIVE');
    }
    atBox(mats.roof,x,z,7.6,7.6,y+.70,.035,'ACE FIVE');
  }
  c.setLayer('shell');
  // Open drive ramp, continuous from grade to the rooftop. The underside is
  // a solid wedge, with solid high walls on either side (Lot D photo 2).
  {
    const a=W(ramp.x-ramp.width/2,ramp.north),b=W(ramp.x+ramp.width/2,ramp.south),g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute([a.x,ramp.height,a.z,a.x,.04,b.z,b.x,.04,b.z,a.x,ramp.height,a.z,b.x,.04,b.z,b.x,ramp.height,a.z],3));g.computeVertexNormals();
    const m=new THREE.Mesh(g,mats.asphalt);m.receiveShadow=true;m.castShadow=true;m.userData.space='LOT D';c.root.add(m);
    for(const x of [a.x,b.x]){
      line([x,ramp.height+.30,a.z],[x,.34,b.z],.065,.58,mats.white,'LOT D');
      line([x,ramp.height+.015,a.z],[x,.055,b.z],.095,.08,mats.charcoal,'LOT D');
    }
    for(const dx of [-.36,.36])atBox(mats.white,ramp.x+dx*ramp.width,ramp.north-4,.65,.65,deckY,.85,'LOT D');
  }
  // Lot F court: source photographs show the stair, white backdrop and four
  // dock mouths. Exact stair rises and offsets are photo-derived estimates.
  {
    const z=db.z1+.6,x=1041,end=1113,rise=2.3;
    atBox(mats.white,(x+end)/2,z-.3,end-x,1.2,.03,rise,'ACE SIX');
    const middle=(x+end)/2,landing=8,n=16;
    for(const [start,stop,h0,h1] of [[x,middle-landing/2,rise,rise/2],[middle+landing/2,end,rise/2,0]]){
      const step=(stop-start)/n;for(let i=0;i<n;i++)atBox(mats.charcoal,start+(i+.5)*step,z+5,step,10,.02,h0+(h1-h0)*i/n,'ACE SIX');
      for(const zz of [z,z+10]){const p=W(start,zz),q=W(stop,zz);line([p.x,h0+.78,p.z],[q.x,h1+.78,q.z],.025,.025,mats.charcoal,'ACE SIX');for(let i=0;i<=n;i+=3)atBox(mats.charcoal,start+i*step,zz,.25,.25,h0+(h1-h0)*i/n,.78,'ACE SIX');}
    }
    atBox(mats.charcoal,middle,z+5,landing,10,.02,rise/2,'ACE SIX');
    for(const zz of [z,z+10]){const p=W(middle-landing/2,zz),q=W(middle+landing/2,zz);line([p.x,rise/2+.78,p.z],[q.x,rise/2+.78,q.z],.025,.025,mats.charcoal,'ACE SIX');}
    canopyOnEdge('ACE FIVE',3,.155,71,11,1.82);
    canopyOnEdge('ACE SIX',1,.219,(db.z1-db.z0)*.418,13,1.83);
    textPanel('Ace ✳ Mission\nStudios',1122,db.z1+.65,2.14,1.72,.6,0,null,'#d8dedc','ACE SIX');
    for(let x=1055;x<1140;x+=24)atBox(mats.white,x,db.z1+1,.6,.6,0,.8,'ACE SIX');
  }
  // Visible concrete panel joints on Ace Six and its exposed face to Lot E.
  for(let x=db.x0+24;x<db.x1;x+=26){atBox(mats.charcoal,x,db.z0-.15,.18,.18,0,deckY,'ACE SIX');atBox(mats.charcoal,x,db.z1+.15,.18,.18,0,deckY,'ACE SIX');}
  for(let z=db.z0+21;z<db.z1;z+=26){atBox(mats.charcoal,db.x1+.12,z,.18,.18,0,deckY,'ACE SIX');}
  textPanel('Ace ✳ Mission Studios',(db.x0+db.x1)/2,db.z0-.5,deckY-.55,5.0,.42,Math.PI,null,'#e1e1db','ACE SIX');
  // Mission stages: clear numbered wayfinding panels along Willow Street.
  for(const [name,num,t] of [['MISSION ONE','1',.68],['MISSION TWO','2',.43]]){
    const b=bb(name),z=b.z0+(b.z1-b.z0)*t;
    textPanel('STAGE\n'+num,b.x0-.35,z,groups[name].h/2,1.12,groups[name].h-.14,-Math.PI/2,'#dbddd6','#303439',name);
    for(let zz=b.z0+12;zz<b.z1;zz+=42)atBox(mats.steel,b.x0-.6,zz,.45,.6,0,groups[name].h,name);
  }
  for(const name of ['MISSION THREE','MISSION FOUR']){
    const b=bb(name);for(let z=b.z0+11;z<b.z1;z+=39)atBox(mats.charcoal,b.x1+.25,z,1.5,2,0,groups[name].h,name);
    textPanel(name==='MISSION THREE'?'3':'4',b.x1+.65,(b.z0+b.z1)/2,groups[name].h-.65,.8,1,Math.PI/2,null,'#dedfd8',name);
  }
  // Exposed silver dogleg ducts are on the Lot K ends, not scattered on roofs.
  for(const [name,xs] of [['MISSION ONE',[1320,1334]],['MISSION THREE',[1528,1543]]]){
    const b=bb(name);for(const x of xs){
      hvac(x,b.z0-12,.06,9,10,6,name);
      atBox(mats.steel,x,b.z0-5,5,6,.55,groups[name].h-.35,name);
      atBox(mats.steel,x,b.z0-1,5,12,groups[name].h-.10,.43,name);
      for(let y=.85;y<groups[name].h;y+=.32)atBox(mats.charcoal,x,b.z0-8.06,4.8,.13,y,.012,name);
      for(const dx of [-6,6])atBox(mats.yellow,x+dx,b.z0-18,.7,.7,0,.85,name);
    }
  }
  // The photos show small ridge vents, with sparse plant. Locations beyond
  // visible surfaces remain empty rather than being randomly populated.
  for(const name of ['MISSION ONE','MISSION TWO','MISSION THREE','MISSION FOUR']){
    c.setLayer('roof');
    const b=bb(name),height=groups[name].h+groups[name].riseFt*.1;
    for(const t of [.22,.52,.80]){const p=W((b.x0+b.x1)/2,b.z0+(b.z1-b.z0)*t);boxes(mats.steel,p.x,height+.15,p.z,.11,.3,.11,name);boxes(mats.charcoal,p.x,height+.31,p.z,.24,.06,.24,name);}
  }
  c.setLayer('shell');
  // Ace One: historic window heads are actual arched meshes, cornice and sign.
  {
    const b=bb('ACE ONE');
    for(const side of ['south','west'])for(let i=0;i<5;i++){
      const [x,z]=edgePoint(groups['ACE ONE'],side,(i+.5)/5),p=W(x+(side==='west'?-.3:0),z+(side==='south'?.3:0));
      const s=new THREE.Shape();s.moveTo(-.45,0);s.lineTo(-.45,.55);s.quadraticCurveTo(0,.94,.45,.55);s.lineTo(.45,0);s.closePath();
      const m=new THREE.Mesh(new THREE.ShapeGeometry(s,20),mats.glass);m.position.set(p.x,2.78,p.z);m.rotation.y=side==='west'?-Math.PI/2:0;m.userData.space='ACE ONE';c.root.add(m);
      const a=side==='west'?[p.x,2.75,p.z-.45]:[p.x-.45,2.75,p.z],q=side==='west'?[p.x,2.75,p.z+.45]:[p.x+.45,2.75,p.z];line(a,q,.025,.04,mats.white,'ACE ONE');
    }
    for(const y of [1.22,2.33,3.6,3.77])for(let i=0;i<4;i++)wall(groups['ACE ONE'].pts[i],groups['ACE ONE'].pts[(i+1)%4],y,.08,mats.plaster,'ACE ONE');
    textPanel('Ace ✳ Mission Studios',(b.x0+b.x1)/2,b.z1+.6,3.58,6.3,.43,0,null,'#e0e1dc','ACE ONE');
    canopy(664,b.z1+5,23,9,.85,'ACE ONE');
    for(let i=0;i<5;i++)atBox(mats.concrete,664,b.z1+12+i*1.5,22,1.6,0,(5-i)*.09,'ACE ONE');
  }
  // 524 has a brick-and-painted masonry envelope and shallow working canopies.
  {
    const b=bb('MISSION 524'),z=b.z1-54;
    canopyOnEdge('MISSION 524',2,.72,72,24,1.05);
    c.setLayer('roof');
    for(const zz of [b.z0+94,b.z0+165,b.z0+240,b.z1-45]){const p=[b.x1-20,zz];if(c.inside(...p,groups['MISSION 524'].pts))hvac(...p,groups['MISSION 524'].h,8,6,3,'MISSION 524');}
    c.setLayer('shell');
  }
  {
    const sign=canopyOnEdge('MISSION 539A',5,.55,56,13,1.26);
    textPanel('539',sign.x,sign.z,1.13,.75,.4,sign.rot,null,'#e0e1d9','MISSION 539A');
  }
  // Perimeter security uses slender metal pickets, masonry piers and real gaps.
  for(const l of c.lots){
    if(['LOT G','LOT H','LOT I','LOT L','LOT J'].includes(l.name))fence(l.pts,.045,.72,true,l.name,[0]);
    if(['LOT B','LOT C'].includes(l.name))for(let i=0;i<l.pts.length;i++)if(i!==1)wall(l.pts[i],l.pts[(i+1)%l.pts.length],.04,.75,mats.charcoal,l.name,i===0?[{t:.72,w:14,h:7.5}]:[]);
  }
  {
    const a=c.lots.find(l=>l.name==='LOT A'),b=bounds(a.pts);
    for(const z of [b.z0+7,b.z1-10]){wall([b.x0,z],[b.x0+28,z],.04,.8,mats.charcoal,'LOT A');wall([b.x0+46,z],[b.x1,z],.04,.8,mats.charcoal,'LOT A');fence([[b.x0+28,z],[b.x0+46,z]],.04,.85,false,'LOT A');}
    for(const z of [b.z0+20,b.z1-22]){atBox(mats.soil,b.x0+5,z,9,21,.04,.10,'LOT A');atBox(mats.leaves,b.x0+5,z,8,20,.14,.85,'LOT A');}
    for(const x of [b.x0+27,b.x0+47])for(const z of [b.z0+7,b.z1-10])atBox(mats.charcoal,x,z,3,3,0,1.15,'LOT A');
  }
  // Published shared street edges; sparse road markings keep access legible.
  const roads=[rect(575,151,2110,182),[[579,635],[1615,794],[1608,831],[572,672]],[[1255,183],[1293,183],[1293,764],[1255,757]],rect(1584,290,1621,778)];
  for(const pts of roads)slab(pts,.001,.007,mats.asphalt);
  for(let x=615;x<1560;x+=40){const z=655+(x-579)*.154;atBox(mats.yellow,x,z,17,.23,.013,.005,'',-.153);}
  for(let z=235;z<714;z+=36)atBox(mats.stripe,1274,z,.3,13,.013,.005);
  // Embedded former rail lines curve along 524; sampled from the same court
  // boundary, offset into Lot F, as observed in lotF-photo-1.
  const lF=c.lots.find(l=>l.name==='LOT F');
  const curve=lF.pts.filter(p=>p[0]>1115&&p[1]>400&&p[1]<655).sort((a,b)=>a[1]-b[1]);
  for(let i=1;i<curve.length;i++)for(const offset of [-8,-3.2]){
    const a=W(curve[i-1][0]+offset,curve[i-1][1]),b=W(curve[i][0]+offset,curve[i][1]);line([a.x,.048,a.z],[b.x,.048,b.z],.018,.013,mats.steel,'LOT F');
  }
  for(const [x,z] of [[1172,216],[1180,350],[1110,560],[1650,347],[1650,574],[1790,480],[1890,315]])pole(x,z);
}
