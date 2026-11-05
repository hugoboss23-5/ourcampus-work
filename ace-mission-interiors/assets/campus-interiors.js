// 2026-09-05 — support centers measured from the supplied individual PDF
// drawings, registered to the campus by openings and outline. This is a partial
// cutaway, not a construction/structural model. Member sizes are approximate.
// Unresolved rotations (Ace Two, Ace Four, Mission Two) deliberately omitted.
export function addCampusInteriors(c) {
  const records=[
    {name:'ACE SIX',height:26,rotation:0,base:'black',centers:[[.175149,.209075],[.358816,.209075],[.542483,.209075],[.726151,.209075],[.909818,.209075],[.175149,.503193],[.358816,.503193],[.542483,.503193],[.726151,.503193],[.909818,.503193],[.175149,.785791],[.358816,.785791],[.542483,.785791],[.726151,.785791],[.909818,.785791]]},
    {name:'ACE SEVEN',height:21+10/12,rotation:0,base:'yellow',centers:[[.239022,.382196],[.626322,.382196]]},
    {name:'MISSION ONE',height:34,rotation:180,base:'yellow',centers:[[.749660,.420062],[.115164,.420332],[.274038,.420332],[.432209,.420332],[.590121,.420332]]},
    {name:'MISSION THREE',height:34,rotation:0,base:'charcoal',centers:[[.267493,.149550],[.267493,.304991],[.267493,.461155],[.267493,.615872],[.267758,.772037]]}
  ];
  const {mats,atBox,bounds,groups,inside}=c;
  let columns=0;const skipped=[];
  for(const r of records){
    const b=groups[r.name],bb=bounds(b.pts);
    for(const uv of r.centers){
      const [u,v]=r.rotation===180?[1-uv[0],1-uv[1]]:uv;
      const x=bb.x0+u*(bb.x1-bb.x0),z=bb.z0+v*(bb.z1-bb.z0);
      if(!inside(x,z,b.pts)){skipped.push({name:r.name,uv});continue;}
      const h=Math.min(r.height*.1,b.h-.1);
      // I-shaped steel, not enlarged square diagram symbols. Dimensions of
      // the steel and protective boots are estimated from the photographs.
      atBox(mats[r.base],x,z,2.8,2.8,.07,.40,r.name);
      const steel=r.name==='ACE SIX'?mats.charcoal:mats.white;
      atBox(steel,x,z,.20,1.0,.47,h-.47,r.name);
      for(const dz of [-.47,.47])atBox(steel,x,z+dz,1.05,.12,.47,h-.47,r.name);
      columns++;
    }
  }
  return {columns,source:'Individual space plans, July 2026',registration:'Reasoned from access and outlines; not surveyed',unresolved:['ACE TWO','ACE FOUR','MISSION TWO'],skipped,scope:'Partial support cutaway. Partitions, services, mezzanines and unregistered supports are not reconstructed.'};
}
