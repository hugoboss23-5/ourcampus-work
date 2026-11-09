"""Build the gallery from client-facing progress deliveries, not internal working files."""
import html
import json
import re
from pathlib import Path
from PIL import Image, ImageOps

root=Path(__file__).resolve().parents[1]
assets=root/'campus-library/assets'
assets.mkdir(parents=True,exist_ok=True)
model=(Path.home()/'Documents/Codex/2026-10-13/the-modeling-of-the-tennessee-thing/outputs')
concept=Path.home()/'projects/worldwide-stages-new-campus-20261001'
early=['aerial-day.png','aerial-night.png','arrival-day.png','event-day.png','garage-night.png','garden-day.png','sports-interior.png','stage-day.png','water-terraces.png']
groups=[
 ('latest','Latest progress pictures',model/'Campus Latest Progress Pictures',None,'Building interiors, arrival, playground and the full campus.'),
 ('progress','Updated progress pictures',model/'Campus Updated Progress Pictures',None,'Building approaches, glass halls, parking and early interior views.'),
 ('connections','Building connections',model/'Campus Updated Progress Photos',None,'The four buildings, two connecting galleries, parking and outdoor play.'),
 ('photos','Early campus views',model/'Campus Photos for David',None,'Aerials, sports, plaza, batting, concessions and amphitheater.'),
 ('concept','Worldwide Stages concept',concept,early,'Early new-campus concept, before the six alternative layouts.'),
]
esc=html.escape
workers='https://ourcampus-viewers.hv-e48a1b.workers.dev/worldwide-stages-david/'
tour='https://drive.google.com/file/d/10ai2NgZWtqmwRsT7yisnX0F2pBN2CCS9/view'
archive='https://drive.google.com/drive/folders/1E7d-afS2qklJNtB2ebgBRndW2wZ-vmLt'
title_map={'aerial-day':'Daytime aerial','aerial-night':'Night aerial','arrival-day':'Arrival','event-day':'Event venue','garage-night':'Garage at night','garden-day':'Garden','sports-interior':'Sports hall interior','stage-day':'Stage','water-terraces':'Water terraces'}
record=[]
sections=[]
for tag,title,folder,files,desc in groups:
    paths=[folder/x for x in files] if files else sorted(folder.glob('*.png'))
    assert paths,folder
    items=[]
    for i,source in enumerate(paths,1):
        name=f'{tag}-{i:02}.webp'
        stem=re.sub(r'^\d+[ -]+','',source.stem)
        label=title_map.get(stem,stem.replace('-', ' ').strip().replace('  ',' '))
        label=label.replace(' 720p','').replace('H1 H3','H1 to H3').replace('H2 H4','H2 to H4')
        with Image.open(source) as im:
            im.thumbnail((1280,960))
            im.save(assets/name,'WEBP',quality=84,method=0)
            w,h=im.size
        items.append(f'<figure><a href="assets/{name}" aria-label="Open {esc(label)}"><img src="assets/{name}" width="{w}" height="{h}" alt="{esc(label)}" loading="lazy" decoding="async"></a><figcaption>{esc(label)}</figcaption></figure>')
        record.append(dict(group=tag,name=label,path='assets/'+name))
    sections.append(f'<section id="{tag}"><p class="eyebrow">{len(paths)} images</p><h2>{title}</h2><p>{desc}</p><div class="grid">{"".join(items)}</div></section>')
out=root/'campus-library/index.html'
out.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#20231e"><link rel="icon" href="data:,"><link rel="stylesheet" href="library.css">
<title>Campus renders and films · OurCampus</title></head><body>
<header><a href="../">OURCAMPUS</a><a href="../#p-tennessee">All work ↗</a></header>
<main><p class="eyebrow">DESIGN STUDIES / OCTOBER 2026</p><h1>Campus renders and films</h1>
<p>Progress views of the Tennessee campus and the early Worldwide Stages concept.</p>
<div class="actions"><a href="../tennessee-campus-preview/">Play the drone preview ↗</a><a href="{workers}">Drawings and 3D ↗</a><a href="{tour}">Narrated tour · shared Drive access ↗</a></div>
<nav aria-label="Render collections">{''.join(f'<a href="#{tag}">{title}</a>' for tag,title,*_ in groups)}</nav>
{''.join(sections)}
<footer><a href="{archive}">Originals in Hugo’s private Drive archive ↗</a><p>Editable models, research and source packages. Access follows the existing Drive permissions.</p></footer>
</main></body></html>""",encoding='utf-8')
(root/'campus-library/renders.json').write_text(json.dumps(record,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('Published render previews:',len(record))
