// built-from: owned code. Renders the home base from ../projects.json (see README.md). 2026-11-05
const root = document.documentElement;
root.classList.add('js');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ARROW = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 9 9 3M4 3h5v5"/></svg>';
const isExternal = u => /^https?:/.test(u);
const kindOf = u => /\.pdf($|\?)/i.test(u) ? 'PDF' : /\.(png|jpe?g|webp)($|\?)/i.test(u) ? 'Image' : isExternal(u) ? 'Website' : 'Page';

function status(s) {
  return `<span class="status" data-s="${esc(s)}"><i aria-hidden="true"></i>${esc(s)}</span>`;
}

function card(it) {
  const t = `home/thumbs/${esc(it.thumb)}`;
  return `<a class="card${it.lead ? ' lead' : ''} rv" href="${esc(it.url)}" target="_blank" rel="noopener">
  <div class="media"><picture><source media="(max-width:700px)" srcset="${t}-p.webp"><img src="${t}-d.webp" alt="" loading="lazy" decoding="async" width="1200" height="750"></picture></div>
  <div class="info">
    <h3 class="c-name">${esc(it.name)}</h3>
    <p class="c-line">${esc(it.line)}</p>
    <span class="open">Open ${ARROW}</span>
    <p class="c-meta meta"><span>${esc(it.date)}</span>${status(it.status)}<span>${kindOf(it.url)}</span></p>
  </div>
</a>`;
}

function versions(v) {
  const base = v.base;
  const tiles = v.list.map((x, i) => `<li class="v rv"><a href="${esc(base + x.folder)}/" target="_blank" rel="noopener">
  <div class="media"><picture><source media="(max-width:700px)" srcset="${esc(base)}thumbs/${esc(x.folder)}-p.webp"><img src="${esc(base)}thumbs/${esc(x.folder)}-d.webp" alt="" loading="lazy" decoding="async" width="1152" height="720"></picture></div>
  <p class="v-name">${esc(x.name)}</p><p class="v-meta">${esc(x.tag)} · ${esc(x.date)} · ${pad(i + 1)}</p></a></li>`).join('');
  return `<div class="sub"><div class="sub-head"><h3 class="sub-title">${esc(v.title)}</h3><span class="count">${v.list.length} sites <span class="swipe">· swipe</span></span></div><ul class="versions">${tiles}</ul></div>`;
}

function files(list) {
  const rows = list.map(f => `<li><a href="${esc(f.url)}" download><span class="files-name">${esc(f.name)}</span><span class="files-kind">${esc(f.kind)}</span><span class="files-go">Download</span></a></li>`).join('');
  return `<div class="sub"><div class="sub-head"><h3 class="sub-title">Model files</h3><span class="count">${list.length} files</span></div><ul class="files">${rows}</ul></div>`;
}

// lead card shape by count: 1 or 1+3k gets a full width banner, 2 a wide pair, otherwise a big block with two stacked beside it
const layout = n => (n === 1 || (n - 1) % 3 === 0) ? 'banner' : n === 2 ? 'pair' : 'block';

function project(p, i, total) {
  const n = p.items.length;
  return `<section class="project" id="p-${esc(p.id)}" data-n="${pad(i + 1)}" data-name="${esc(p.name)}" aria-labelledby="h-${esc(p.id)}">
  <div class="p-head">
    <div class="rv"><div class="ring" aria-hidden="true">${pad(i + 1)}</div><h2 id="h-${esc(p.id)}">${esc(p.name)}</h2></div>
    <div class="p-meta rv"><p class="p-line">${esc(p.line)}</p><p class="meta"><span>${esc(p.dates)}</span>${status(p.status)}<span class="count">${n} ${n === 1 ? 'piece' : 'pieces'}${n > 1 ? '<span class="swipe"> · swipe</span>' : ''}</span></p></div>
  </div>
  <div class="items ${layout(n)}${n === 1 ? ' one' : ''}">${p.items.map(card).join('')}</div>
  ${p.versions ? versions(p.versions) : ''}
  ${p.files ? files(p.files) : ''}
  ${p.note ? `<p class="note rv">${esc(p.note)}</p>` : ''}
</section>`;
}

const lede = document.getElementById('lede');
const ledeText = lede.textContent;

async function build() {
  let data;
  try {
    const r = await fetch('projects.json', { cache: 'no-cache' });
    data = await r.json();
  } catch (e) {
    document.getElementById('projects').innerHTML = '<p class="noscript">The project list did not load. Refresh the page to try again.</p>';
    return;
  }
  const P = data.projects;
  const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  const ledeBase = `${words[P.length] || P.length} projects. Every piece, what it is, and a link that opens it.`;
  lede.textContent = ledeBase;

  document.getElementById('projects').innerHTML = P.map((p, i) => project(p, i, P.length)).join('');
  document.getElementById('index').innerHTML = P.map((p, i) =>
    `<a href="#p-${esc(p.id)}" data-line="${esc(p.line)}"><span class="idx-n">${pad(i + 1)}</span><span class="idx-name">${esc(p.name)}</span><span class="idx-date">${esc(p.dates.replace(/, \d{4}$/, ''))}</span></a>`).join('');
  document.getElementById('rail').innerHTML = P.map((p, i) =>
    `<a href="#p-${esc(p.id)}" aria-label="${pad(i + 1)} ${esc(p.name)}"><i aria-hidden="true"></i><span>${pad(i + 1)} ${esc(p.name)}</span></a>`).join('');
  const d = new Date(data.updated + 'T12:00:00');
  document.getElementById('updated').textContent = 'Updated ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '.';

  // index hover swaps the line under the title (word changes, sentence stays)
  document.querySelectorAll('#index a').forEach(a => {
    const show = () => { lede.textContent = a.dataset.line; };
    const back = () => { lede.textContent = ledeBase; };
    a.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(); });
    a.addEventListener('pointerleave', back);
    a.addEventListener('focus', show); a.addEventListener('blur', back);
  });

  wire();
}

function wire() {
  const bar = document.getElementById('bar');
  const here = document.getElementById('here');
  const hero = document.getElementById('top');
  const rail = [...document.querySelectorAll('#rail a')];
  const sections = [...document.querySelectorAll('.project')];

  new IntersectionObserver(([e]) => bar.classList.toggle('solid', !e.isIntersecting), { rootMargin: '-60px 0px 0px 0px', threshold: 0 })
    .observe(document.querySelector('.hero-copy'));

  const setHere = s => {
    rail.forEach(a => a.classList.toggle('on', s && a.getAttribute('href') === '#' + s.id));
    if (!s) { here.classList.remove('on'); return; }
    here.innerHTML = `<b>${s.dataset.n}</b> / ${pad(sections.length)} · ${esc(s.dataset.name)}`;
    here.classList.add('on');
  };
  const vis = new Map();
  const io = new IntersectionObserver(es => {
    es.forEach(e => vis.set(e.target, e.isIntersecting));
    const cur = sections.find(s => vis.get(s));
    setHere(cur || null);
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach(s => io.observe(s));

  const rv = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('seen'); rv.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  // a full page capture or print shows everything at once
  const all = () => document.querySelectorAll('.rv').forEach(el => el.classList.add('seen'));
  addEventListener('beforeprint', all);
  addEventListener('resize', () => { if (innerHeight > 2600) all(); });
  if (innerHeight > 2600) all();
  document.querySelectorAll('.rv').forEach((el, i) => {
    const sib = el.parentElement ? [...el.parentElement.children].indexOf(el) : 0;
    el.style.transitionDelay = Math.min(sib, 5) * 70 + 'ms';
    rv.observe(el);
  });

  // cards lean toward the pointer and the picture drifts inside its frame (mouse only)
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const still = matchMedia('(prefers-reduced-motion:reduce)').matches;
  if (fine && !still) {
    document.querySelectorAll('.card').forEach(c => {
      const media = c.querySelector('.media');
      c.addEventListener('pointermove', e => {
        const r = c.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        c.style.transform = `rotateY(${(x * 5).toFixed(2)}deg) rotateX(${(-y * 4).toFixed(2)}deg)`;
        media.style.setProperty('--mx', (-x * 14).toFixed(1) + 'px');
        media.style.setProperty('--my', (-y * 10).toFixed(1) + 'px');
      });
      c.addEventListener('pointerleave', () => { c.style.transform = ''; media.style.setProperty('--mx', '0px'); media.style.setProperty('--my', '0px'); });
    });
  }
}

// split the title lines for the entrance
document.querySelectorAll('h1 .l').forEach(l => { l.innerHTML = `<span>${l.innerHTML}</span>`; });
requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('in')));
build();
