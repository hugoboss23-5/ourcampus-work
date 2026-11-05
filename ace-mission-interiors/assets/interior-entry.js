// 2026-09-05 — tiny entry registry; the 3D interior engine loads only on demand.
const groups={
 'ACE ONE':[['ace1-level1','Level 1'],['ace1-level2','Level 2'],['ace1-level3','Level 3']],
 'ACE TWO':[['ace2','']],'ACE THREE':[['ace3','']],'ACE FOUR':[['ace4','']],
 'ACE FIVE':[['ace5','']],'ACE SIX':[['ace6','']],
 'ACE SEVEN':[['ace7','Ground floor'],['ace7-mezzanine','Mezzanine']],
 'MISSION ONE':[['m1','']],'MISSION TWO':[['m2','']],'MISSION THREE':[['m3','']],'MISSION FOUR':[['m4','']],
 'MISSION 524':[['524','']],'MISSION 539':[['539a','539A'],['539b','539B']],
 'MISSION 539A':[['539a','']],'MISSION 539B':[['539b','']],
 'MISSION 550':[['550-level1','Level 1'],['550-level2','Level 2']]
};
export function interiorEntryButtons(name){
 const ids=groups[name];if(!ids)return '';
 return '<div class="interior-entry">'+ids.map(([id,label])=>`<button type="button" data-interior="${id}">Enter 3D interior${label?' · '+label:''}<span aria-hidden="true">↗</span></button>`).join('')+'</div>';
}
