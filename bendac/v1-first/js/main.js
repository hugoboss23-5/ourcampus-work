// built-from: GSAP 3.12.5 + ScrollTrigger (https://gsap.com), Lenis 1.1.13 (https://github.com/darkroomengineering/lenis),
// three.js r160 via ./ledwall.js. Every fact below comes from bendac.tech or the Bendac Group YouTube channel; see SOURCES.md.
import { createLedWall } from './ledwall.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(hover: none)').matches;
if (isTouch) document.documentElement.classList.add('is-touch');
const params = new URLSearchParams(location.search);
const SHOT = params.has('shot'); // capture mode: skip the loader wait

/* ---------------- DATA (Bendac's own facts) ---------------- */
const PRODUCTS = [
  { id: 'krystl', place: 'Indoor, up close', kind: 'Indoor high-resolution', name: 'Krystl', tag: 'Quality-Tech. Krystl-Clear.', img: 'prod-krystl',
    body: 'An industry-leading high-resolution range with pixel pitches as low as 0.4 mm, Bendac processing built in, and super smooth image processing of up to 300 frames per second.',
    specs: [['Pixel pitch', '0.4 mm+'], ['Brightness', 'up to 1,800 nits'], ['Refresh rate', 'up to 7,680 Hz'], ['IP rating', 'up to IP54'], ['Power', '120 W/sqm'], ['Warranty', 'up to 5 years']],
    caseText: 'Where to find it: Vinson & Elkins, across 5 US sites.', caseHref: '#case-ve' },
  { id: 'dura', place: 'Outdoors', kind: 'Outdoor', name: 'Dura', tag: 'Weather-Resistant. Always-Consistent.', img: 'prod-dura',
    body: 'Designed to perform in some of the harshest conditions. An IP67 rating lets Dura thrive even when the weather is at its worst, with pixel pitches as low as 1.9 mm.',
    specs: [['Pixel pitch', '1.9 mm+'], ['Brightness', 'up to 10,000 nits'], ['Refresh rate', 'up to 7,680 Hz'], ['IP rating', 'up to IP67'], ['Power', '180 W/sqm'], ['Warranty', 'up to 5 years']],
    caseText: 'Where to find it: Bath Rugby, across the stadium and training ground.', caseHref: '#case-bath' },
  { id: 'versa', place: 'Indoor, everyday', kind: 'Indoor', name: 'Versa', tag: 'Punchy-Performance. Cost-Effective.', img: 'prod-versa',
    body: 'A versatile range for shopping centres, transport hubs and retail, with peak brightness of 6,000 nits and pixel pitches as low as 2.5 mm.',
    specs: [['Pixel pitch', '2.5 mm+'], ['Brightness', 'up to 6,000 nits'], ['Refresh rate', 'up to 7,680 Hz'], ['IP rating', 'up to IP67'], ['Power', '135 W/sqm'], ['Warranty', 'up to 5 years']],
    caseText: 'Where to find it: Kennedy Space Center, throughout the site.', caseHref: '#case-ksc' },
  { id: 'artist', place: 'Any shape', kind: 'Customisable', name: 'Artist', tag: 'Truly-Bespoke. Mind-Blowing.', img: 'prod-artist',
    body: 'A fully customisable platform for custom shapes and bespoke specifications, created to let the world’s most creative designers set their imaginations free.',
    specs: [['Pixel pitch', '0.9 mm+'], ['Brightness', 'up to 5,000 nits'], ['Refresh rate', 'up to 7,680 Hz'], ['IP rating', 'up to IP67'], ['Power', '90 W/sqm'], ['Warranty', 'up to 10 years']],
    caseText: 'Where to find it: the Google YouTube LED staircase in Berlin.', caseHref: '#work' },
  { id: 'impakt', place: 'Pitch-side', kind: 'Perimeter advertising', name: 'IMPAKT', tag: 'Impressive-Viewing. Impressive-Protection.', img: 'prod-impakt',
    body: 'The perimeter solution for sports venues. Built with player safety in mind using impact-reducing components, IP67 for matchday weather, and easy for clubs to run in-house.',
    specs: [['Pixel pitch', '8 mm+'], ['Brightness', 'up to 8,000 nits'], ['Refresh rate', 'up to 7,680 Hz'], ['IP rating', 'up to IP67'], ['Power', '200 W/sqm'], ['Warranty', 'up to 5 years']],
    caseText: 'Where to find it: AFC Wimbledon.', caseHref: '#case-wimbledon' },
  { id: 'live', place: 'Matchday production', kind: 'Sports production software', name: 'LIVE!', tag: 'Bendac LIVE!', img: 'prod-live',
    body: 'Matchday production software for the sports industry. Manage multiple inputs, build a broadcast-quality production from templates and hotkeys, and schedule adverts across every screen in the stadium.',
    specs: [['Gold', 'from £5,250 + VAT'], ['Platinum', 'from £7,750 + VAT'], ['Bespoke', 'P.O.A.'], ['Cameras', 'up to 4 inputs'], ['Outputs', 'multiple screens'], ['Licence', 'lifetime']],
    caseText: 'Includes template creation, premium hardware and expert support.', caseHref: '#contact' },
];

const SECTORS = [
  { word: 'Stadiums', img: 'sport-smoke', cap: 'Sport', line: 'Industry leaders in LED for stadia. Our in-house LED engineers have designed and installed over 50 sports LED displays in the UK and overseas.' },
  { word: 'Offices', img: 'corp-room', cap: 'Corporate', line: 'Meeting rooms, receptions, town halls and feature spaces: planned, installed and maintained through our full turnkey solution.' },
  { word: 'Film sets', img: 'vp-blue', cap: 'LED virtual production', line: 'Display-only or complete system-integrated LED virtual production for corporates and cinematic studios.' },
  { word: 'Attractions', img: 'case-ksc', cap: 'Leisure and entertainment', line: 'Museum exhibits, visitor centres, cruise ships, cinemas and theatres: visually stunning experiences and awe-inspiring spaces.' },
  { word: 'Retail', img: 'retail-mall', cap: 'Retail', line: 'Seamless screen-building and impeccable colour accuracy, so retailers can show their products in the best light.' },
  { word: 'Classrooms', img: 'case-concord', cap: 'Education', line: 'No more dark lecture halls. Bright, uplifting spaces, and virtual production studios for the film and broadcast stars of the future.' },
  { word: 'Simulators', img: 'accuvision', cap: 'Simulation, with AccuSim', line: 'With automotive simulator specialists AccuSim, replacing dated projection with LED: 0.7 to 1.5 mm pitch, 60 to 240 frames per second.' },
  { word: 'Superyachts', img: 'case-yacht', cap: 'Residential', line: 'Immersive cinema screens and high-refresh gaming screens, installed in homes both fixed and floating.' },
];

const CASES = [
  { id: 'case-ksc', client: 'Kennedy Space Center', place: 'Florida, USA', img: 'case-ksc', video: 'ksc-store', line: 'Complete LED design and fit-out throughout the home of space exploration, at a site with over 1.5 million visitors a year.', num: '200 sqm+', unit: 'of Bendac LED on site', yt: 'iK2QC-RMUtY' },
  { id: 'case-chelsea', client: 'Chelsea FC, Stamford Bridge', place: 'London', img: '../yt/_VfEnQO6K6g', line: '117 cabinets out, 256 in. Both scoreboards widened from 7.68 m to 10.24 m for a new 16:9 aspect, on a structure Bendac also engineered.', num: '256', unit: 'cabinets installed', yt: '_VfEnQO6K6g' },
  { id: 'case-kfb', client: 'King Fahad Bridge', place: 'Saudi Arabia', img: 'case-kingfahad', line: 'A double-sided DOOH screen over the main highway, with modified heat dissipation and a custom shader pack against sand. Won Best Original Digital Billboard.', num: '35 × 8 m', unit: 'double-sided, 560 sqm', yt: 'rnb1DvE4eHE' },
  { id: 'case-bristol', client: 'Bristol Airport', place: 'Bristol', img: 'case-bristol', line: 'Designed, installed and maintained in the security area, and since become iconic. Won a DailyDOOH ‘Reggie’ for Best Transportation Installation.', num: '14 × 2.4 m', unit: 'LED screen', yt: 'Sy0g0_z-AKs' },
  { id: 'case-plymouth', client: 'Plymouth Argyle FC', place: 'Home Park', img: 'case-plymouth', line: 'A full turnkey 10 mm, high-bright scoreboard, sited with the stadium’s architects and engineers.', num: '9 × 5 m', unit: '10 mm at 8,000 nits', yt: 'qFWima53XOs' },
  { id: 'case-bath', client: 'Bath Rugby', place: 'The Rec, Bath', img: 'case-bath-attendance', line: 'Official Partner of the club 2021 to 2024, with screens throughout the stadium and training ground.', num: '7', unit: 'screens, 2 locations', yt: 'nqX-qw0AdEc' },
  { id: 'case-ve', client: 'Vinson & Elkins', place: 'USA', img: 'case-ve', line: 'Narrow pixel pitch Krystl screens across one of the USA’s leading law firms.', num: '16', unit: 'screens, 5 sites' },
  { id: 'case-wimbledon', client: 'AFC Wimbledon', place: 'Plough Lane', img: 'case-wimbledon', line: 'Full stadium fit-out of LED screens for the home of the Dons: designed, installed and maintained.', num: '4', unit: 'screens' },
  { id: 'case-allypally', client: 'Alexandra Palace', place: 'London', img: 'case-allypally', line: 'An innovative four-sided media cube installed at the iconic London venue.', num: '4', unit: 'sided media cube' },
  { id: 'case-accuvision', client: 'BMW Motorsport × AccuSim', place: 'AccuVision', img: 'accuvision', video: 'accuvision', line: 'Innovative LED installation for BMW Motorsport’s simulation facility, replacing projection with LED.', num: '240', unit: 'frames per second, up to' },
  { id: 'case-glamorgan', client: 'Glamorgan CCC', place: 'Sophia Gardens, Cardiff', img: 'case-glamorgan', line: 'New mega scoreboards for Wales’ only professional county cricket club.', num: '3', unit: 'scoreboards', yt: 'Q2nftmQfXMA' },
  { id: 'case-coke', client: 'Coca-Cola', place: 'Custom', img: 'case-cocacola', line: 'Custom-made LED cans for the leading drinks manufacturer.', num: 'Bespoke', unit: 'LED cans' },
];

const FILMS = [
  { id: 'y1r_FnzCGS0', title: 'We Are Bendac', len: '1:52' },
  { id: 'jvZx8jLHGhQ', title: 'Bendac F1 Concept', len: '1:17' },
  { id: 'DVlDR2lHITA', title: 'Bendac XR advert, filmed on an LED volume', len: '1:44' },
  { id: '_VfEnQO6K6g', title: 'Chelsea, Stamford Bridge scoreboards', len: '2:26' },
  { id: 'rnb1DvE4eHE', title: 'King Fahad Bridge', len: '1:19' },
  { id: 'qFWima53XOs', title: 'Plymouth Argyle, Home Park', len: '2:40' },
  { id: 'jwXQ7nkkoBY', title: 'Bendac tests the IMPAKT perimeter', len: '0:57' },
];

const CLIENT_NAMES = ['Google YouTube', 'Kennedy Space Center', 'British Land', 'Coca-Cola', 'Chelsea FC', 'Bath Rugby', 'AFC Wimbledon', 'Plymouth Argyle', 'Glamorgan CCC', 'Chesterfield FC', 'Wycombe Wanderers', 'Notts County', 'Luleå HF', 'Vinson & Elkins', 'Westfield', 'Cineworld', 'intu Metrocentre', 'Bristol Airport', 'Alexandra Palace', 'BMW Motorsport', 'King Fahad Bridge', 'UCLan', 'Concord College', 'Staffordshire University'];

/* ---------------- LOADER: the circled B built from LED dots ---------------- */
function runLoader() {
  const cv = $('#loaderDots'); const ctx = cv.getContext('2d');
  const S = 360; const G = 26; const step = S / G;
  const img = new Image(); img.src = 'assets/img/logo-b-mark.webp';
  let dots = [];
  const start = performance.now();
  let target = 0, shown = 0, done = false;
  const minMs = SHOT ? 1 : 1500;
  return new Promise((resolve) => {
    img.onload = () => {
      const o = document.createElement('canvas'); o.width = G; o.height = G; const oc = o.getContext('2d');
      oc.drawImage(img, 0, 0, G, G); const d = oc.getImageData(0, 0, G, G).data;
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { const v = d[(y * G + x) * 4] / 255; dots.push({ x, y, on: v > 0.45, r: Math.random() }); }
    };
    function draw() {
      const p = shown / 100;
      ctx.clearRect(0, 0, S, S);
      for (const dt of dots) {
        const lit = dt.on && dt.r < p;
        ctx.beginPath(); ctx.arc(dt.x * step + step / 2, dt.y * step + step / 2, step * 0.3, 0, Math.PI * 2);
        if (lit) { ctx.fillStyle = '#1fe683'; ctx.shadowColor = '#1fe683'; ctx.shadowBlur = 10; }
        else { ctx.fillStyle = dt.on ? '#0f2a1c' : '#0b100d'; ctx.shadowBlur = 0; }
        ctx.fill();
      }
      $('#loaderCount').textContent = String(Math.round(shown)).padStart(3, '0');
    }
    function tick() {
      const el = performance.now() - start;
      const cap = Math.min(100, (el / minMs) * 100);
      shown += (Math.min(target, cap) - shown) * 0.12 + 0.2;
      shown = Math.min(shown, Math.min(target, cap));
      draw();
      if (shown >= 99.5 && !done) { done = true; setTimeout(resolve, SHOT ? 0 : 250); return; }
      requestAnimationFrame(tick);
    }
    tick();
    loaderProgress = (v) => { target = Math.max(target, v); };
  });
}
let loaderProgress = () => {};

/* ---------------- HERO ---------------- */
let wall = null;
function initWall() {
  const video = document.createElement('video');
  video.src = 'assets/video/brand-film-loop.mp4'; video.muted = true; video.loop = true; video.playsInline = true; video.crossOrigin = 'anonymous'; video.preload = 'auto';
  video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
  const canvas = $('#wallCanvas');
  const pitchVal = $('#pitchVal'), pitchRange = $('#pitchRange');
  let lastP = -1;
  const family = (p) => p >= 7.95 ? 'IMPAKT perimeter, 8 mm+' : p >= 2.5 ? 'Versa, 2.5 mm+' : p >= 1.9 ? 'Dura outdoor, 1.9 mm+' : p >= 0.9 ? 'Artist bespoke, 0.9 mm+' : 'Krystl, from 0.4 mm';
  wall = createLedWall({ canvas, video, onPitch(p) {
    const r = Math.round(p * 10) / 10;
    if (r !== lastP) { lastP = r; pitchVal.textContent = r.toFixed(1); pitchRange.textContent = family(p); }
  } });
  if (!wall) { canvas.hidden = true; $('#wallFallback').hidden = false; return Promise.resolve(); }
  const ready = new Promise((res) => {
    let fired = false; const go = () => { if (!fired) { fired = true; res(); } };
    video.addEventListener('canplay', go, { once: true }); setTimeout(go, 4000);
  });
  video.play().catch(() => { /* autoplay blocked: start on first interaction */ addEventListener('pointerdown', () => video.play(), { once: true }); });
  new IntersectionObserver(([e]) => { wall.setVisible(e.isIntersecting); if (e.isIntersecting) video.play().catch(() => {}); else video.pause(); }).observe($('#wall'));
  wall.start();
  // the hint teaches the loupe the first time the pointer is on the wall
  const hint = $('#loupeHint'); let hintSeen = 0;
  const stage = $('.wall__stage');
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    hint.style.transform = `translate(${e.clientX - r.left + 18}px, ${e.clientY - r.top + 18}px)`;
    if (hintSeen < 1) hint.classList.add('show');
  });
  stage.addEventListener('pointerleave', () => { hint.classList.remove('show'); });
  if (isTouch) { hint.style.transform = 'translate(calc(50vw - 70px), 42vh)'; setTimeout(() => hint.classList.add('show'), 1800); stage.addEventListener('pointerdown', () => { hint.classList.remove('show'); hintSeen = 1; }, { once: true }); }
  else setTimeout(() => { hintSeen = 1; hint.classList.remove('show'); }, 9000);
  return ready;
}

/* ---------------- SCROLL ---------------- */
let lenis = null;
function initScroll() {
  gsap.registerPlugin(ScrollTrigger);
  if (!reduced && window.Lenis) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0);
  }
  ScrollTrigger.create({ start: () => innerHeight * 0.6, onToggle: (st) => $('#hdr').classList.toggle('scrolled', st.isActive) });
  // hero progress drives pitch
  const scrim = $('#wallScrim'), title = $('#wallTitle'), sub = $('#wallSub'), end = $('#wallEnd'), bar = $('#wallProgress'), scrollUi = $('#wallScroll');
  ScrollTrigger.create({ trigger: '#wall', start: 'top top', end: 'bottom bottom', scrub: true, onUpdate(self) {
    const t = self.progress;
    const tt = Math.min(1, t / 0.8);
    wall && wall.setProgress(tt);
    bar.style.transform = `scaleX(${tt})`;
    const a = 1 - Math.min(1, t / 0.28);
    title.style.opacity = a; sub.style.opacity = a; title.style.transform = `translateY(${-t * 60}px)`;
    const e = Math.max(0, Math.min(1, (t - 0.62) / 0.2));
    end.style.opacity = e; end.style.transform = `translateY(${(1 - e) * 30}px)`;
    scrim.style.opacity = Math.min(1, Math.max(0, (t - 0.45) / 0.3));
    scrollUi.style.opacity = 1 - Math.max(0, (t - 0.9) / 0.1);
  } });

  // chapter indicator + rail
  const secs = $$('[data-chapter]');
  const rail = $('#rail');
  secs.forEach((s) => { const li = document.createElement('li'); li.title = s.dataset.name; li.addEventListener('click', () => go('#' + s.id)); rail.appendChild(li); });
  const dots = $$('li', rail);
  const num = $('#chapterNum'), name = $('#chapterName'), cbar = $('#chapterBar');
  secs.forEach((s, i) => {
    ScrollTrigger.create({ trigger: s, start: 'top 55%', end: 'bottom 55%', onToggle(self) {
      if (self.isActive) { num.textContent = s.dataset.chapter; name.textContent = s.dataset.name; dots.forEach((d, j) => d.classList.toggle('on', j === i)); }
    }, onUpdate(self) { if (self.isActive) cbar.style.transform = `scaleX(${self.progress})`; } });
  });

  if (reduced) return;
  // word reveals for statements
  $$('.reveal-lines').forEach((el) => {
    el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(' ');
    gsap.from($$('.w', el), { yPercent: 60, opacity: 0, stagger: 0.03, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 80%' } });
  });
  $$('.h2').forEach((el) => gsap.from(el, { y: 50, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%' } }));
  gsap.from('.step', { y: 40, opacity: 0, stagger: 0.1, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: '.steps', start: 'top 85%' } });
  // case images enter through an RGB sub-pixel split
  $$('.rgb-in').forEach((el) => {
    ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => rgbSplit(el) });
  });
}
function rgbSplit(el) {
  const img = $('img', el); if (!img) return;
  el.animate([
    { filter: 'drop-shadow(-14px 0 0 rgba(255,40,60,.85)) drop-shadow(14px 0 0 rgba(40,120,255,.85)) saturate(1.6)', clipPath: 'inset(0 0 100% 0)' },
    { filter: 'drop-shadow(-6px 0 0 rgba(255,40,60,.6)) drop-shadow(6px 0 0 rgba(40,120,255,.6))', clipPath: 'inset(0 0 30% 0)', offset: 0.45 },
    { filter: 'drop-shadow(0 0 0 rgba(255,40,60,0)) drop-shadow(0 0 0 rgba(40,120,255,0))', clipPath: 'inset(0 0 0% 0)' },
  ], { duration: 900, easing: 'cubic-bezier(.2,.7,.1,1)' });
}
function go(hash) {
  const el = $(hash); if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: hash === '#wall' ? 0 : 0, duration: 1.4 }); else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}

/* ---------------- DOT-MATRIX NUMBERS (stats + ribbon) ---------------- */
function dotMatrix(canvas, text, { rows = 11, color = [31, 230, 131], scroll = false, speed = 40 } = {}) {
  const ctx = canvas.getContext('2d');
  let W, H, cols, cell, bits, off = 0, mouse = { x: -999, y: -999 }, lit = 0;
  function build() {
    const r = canvas.getBoundingClientRect(); const d = Math.min(devicePixelRatio || 1, 2);
    W = canvas.width = Math.round(r.width * d); H = canvas.height = Math.round(r.height * d);
    cell = H / rows; cols = Math.ceil(W / cell) + 1;
    const o = document.createElement('canvas'); const oc = o.getContext('2d');
    let fs = rows * 0.92;
    oc.font = `800 ${fs}px Archivo, sans-serif`;
    if (!scroll) { const need = oc.measureText(text).width + 2; if (need > cols - 1) fs *= (cols - 1) / need; }
    oc.font = `800 ${fs}px Archivo, sans-serif`;
    const tw = Math.ceil(oc.measureText(text).width) + (scroll ? rows * 2 : 2);
    o.width = tw; o.height = rows; oc.font = `800 ${fs}px Archivo, sans-serif`;
    oc.fillStyle = '#fff'; oc.textBaseline = 'middle'; oc.fillText(text, scroll ? rows : 1, rows / 2 + 0.5);
    const d2 = oc.getImageData(0, 0, tw, rows).data; bits = { w: tw, a: new Float32Array(tw * rows) };
    for (let i = 0; i < tw * rows; i++) bits.a[i] = d2[i * 4 + 3] / 255;
  }
  build(); addEventListener('resize', build);
  canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); const d = W / r.width; mouse.x = (e.clientX - r.left) * d; mouse.y = (e.clientY - r.top) * d; });
  canvas.addEventListener('pointerleave', () => { mouse.x = mouse.y = -999; });
  let vis = false; new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(canvas);
  let last = performance.now();
  (function loop(now) {
    requestAnimationFrame(loop); if (!vis) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    lit = Math.min(1, lit + dt * 0.9);
    if (scroll && !reduced) off += dt * speed;
    ctx.clearRect(0, 0, W, H);
    const startX = scroll ? 0 : Math.max(0, Math.floor((W / cell - bits.w) / 2));
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      let sx = scroll ? Math.floor(x + off) % bits.w : x - startX;
      const v = sx >= 0 && sx < bits.w ? bits.a[y * bits.w + sx] : 0;
      const cx = x * cell + cell / 2, cy = y * cell + cell / 2;
      const md = Math.hypot(cx - mouse.x, cy - mouse.y) / (cell * 4);
      const boost = md < 1 ? (1 - md) : 0;
      const reveal = scroll ? 1 : Math.min(1, Math.max(0, lit * 1.6 - (x / cols) * 0.6));
      const on = v > 0.4 ? reveal : 0;
      const a = 0.07 + on * 0.93 + boost * 0.25;
      ctx.beginPath(); ctx.arc(cx, cy, cell * (0.3 + boost * 0.08), 0, Math.PI * 2);
      ctx.fillStyle = on > 0.05 ? `rgba(${color[0]},${color[1]},${color[2]},${Math.min(1, a)})` : `rgba(120,160,140,${0.07 + boost * 0.35})`;
      ctx.fill();
    }
  })(performance.now());
}

/* ---------------- RANGE ---------------- */
function initRange() {
  const places = $('#places'); const product = $('#product');
  PRODUCTS.forEach((p, i) => {
    const b = document.createElement('button'); b.className = 'place'; b.role = 'tab'; b.textContent = p.place; b.setAttribute('aria-selected', i === 0);
    b.addEventListener('click', () => select(i)); places.appendChild(b);
  });
  let cur = -1;
  function fill(p) {
    $('#productImg').src = `assets/img/${p.img}.webp`; $('#productImg').alt = `${p.name} by Bendac`;
    $('#productKind').textContent = p.kind; $('#productName').textContent = p.name; $('#productTag').textContent = p.tag; $('#productBody').textContent = p.body;
    $('#productSpecs').innerHTML = p.specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('#productCase').innerHTML = `<a href="${p.caseHref}">${p.caseText}</a>`;
  }
  function select(i) {
    if (i === cur) return; cur = i;
    $$('.place', places).forEach((b, j) => b.setAttribute('aria-selected', j === i));
    if (reduced) { fill(PRODUCTS[i]); return; }
    product.classList.add('swap'); setTimeout(() => { fill(PRODUCTS[i]); product.classList.remove('swap'); }, 260);
  }
  fill(PRODUCTS[0]); cur = 0;
  product.addEventListener('click', (e) => { const a = e.target.closest('a[href^="#"]'); if (a) { e.preventDefault(); go(a.getAttribute('href')); } });
}

/* ---------------- SECTORS: the Hello Monday word cycle, with the real photo ---------------- */
function initSectors() {
  const list = $('#sectorList'); const word = $('#sectorWord'); const line = $('#sectorLine'); const img = $('#sectorImg'); const cap = $('#sectorCap');
  SECTORS.forEach((s, i) => { const li = document.createElement('li'); const b = document.createElement('button'); b.textContent = s.word; b.addEventListener('click', () => { show(i); stopAuto(); }); li.appendChild(b); list.appendChild(li); });
  SECTORS.forEach((s) => { const p = new Image(); p.src = `assets/img/${s.img}.webp`; });
  let cur = -1, timer = null;
  function show(i) {
    if (i === cur) return; cur = i; const s = SECTORS[i];
    const nx = new Image(); nx.src = `assets/img/${s.img}.webp`;
    const apply = () => {
      if (cur !== i) return;
      $$('button', list).forEach((b, j) => b.classList.toggle('on', j === i));
      img.src = nx.src; img.alt = s.cap; cap.textContent = s.cap; line.textContent = s.line;
      word.innerHTML = s.word.split('').map((c) => `<span class="ch">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
      if (!reduced) { gsap.fromTo(img, { opacity: 0.35, scale: 1.03 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out' }); gsap.from($$('.ch', word), { y: 12, opacity: 0, stagger: 0.02, duration: 0.4, ease: 'power3.out' }); }
    };
    Promise.race([nx.decode().catch(() => {}), new Promise((r) => setTimeout(r, 500))]).then(apply);
  }
  const startAuto = () => { if (!timer && !reduced) timer = setInterval(() => show((cur + 1) % SECTORS.length), 3200); };
  const stopAuto = () => { clearInterval(timer); timer = null; };
  show(0);
  ScrollTrigger.create({ trigger: '#sectors', start: 'top 70%', end: 'bottom 30%', onToggle: (s) => (s.isActive ? startAuto() : stopAuto()) });
}

/* ---------------- WORK ---------------- */
function initWork() {
  const wrap = $('#cases');
  wrap.innerHTML = CASES.map((c) => `
    <article class="case tilt" id="${c.id}">
      <div class="case__media rgb-in">
        <img src="assets/img/${c.img}.webp" alt="${c.client}: Bendac LED" loading="lazy">
        ${c.video ? `<video muted loop playsinline preload="none" src="assets/video/${c.video}.mp4"></video>` : ''}
        ${c.yt ? `<button class="case__watch mono" data-yt="${c.yt}" data-title="${c.client}">Watch &#9656;</button>` : ''}
      </div>
      <div class="case__body">
        <p class="mono dim">${c.place}</p>
        <h3 class="case__client">${c.client}</h3>
        <p class="case__line">${c.line}</p>
        <p class="case__num"><b>${c.num}</b><span class="mono dim">${c.unit}</span></p>
      </div>
    </article>`).join('');
  $$('.case', wrap).forEach((c) => {
    const v = $('video', c); if (!v) return;
    c.addEventListener('pointerenter', () => { v.play().then(() => c.classList.add('playing')).catch(() => {}); });
    c.addEventListener('pointerleave', () => { v.pause(); c.classList.remove('playing'); });
  });
}

/* ---------------- FILM ---------------- */
function ytEmbed(id, autoplay = 1) {
  return `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=${autoplay}&rel=0&modestbranding=1&playsinline=1" title="YouTube video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`;
}
function initFilm() {
  const list = $('#films'); let cur = FILMS[0];
  list.innerHTML = FILMS.map((f, i) => `<li><button data-i="${i}" class="${i === 0 ? 'on' : ''}"><img src="assets/yt/${f.id}.webp" alt="" loading="lazy"><span>${f.title}<span class="len">${f.len}</span></span></button></li>`).join('');
  const frame = $('#screenFrame');
  function poster(f) { frame.innerHTML = `<button class="screen__poster" aria-label="Play ${f.title}"><img src="assets/yt/${f.id}.webp" alt=""><span class="screen__play"><i></i></span></button>`; $('.screen__poster', frame).addEventListener('click', () => { frame.innerHTML = ytEmbed(f.id); }); }
  poster(cur);
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const f = FILMS[+b.dataset.i]; cur = f;
    $$('button', list).forEach((x) => x.classList.toggle('on', x === b)); $('#screenTitle').textContent = f.title;
    frame.innerHTML = ytEmbed(f.id);
  });
  // any "watch" button opens the dialog with the official embed
  const dlg = $('#yt'); const box = $('#ytFrame');
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-yt]'); if (!b) return; e.preventDefault();
    box.classList.toggle('portrait', b.dataset.yt === 'lPA5SUE9lFY');
    box.innerHTML = ytEmbed(b.dataset.yt); $('#ytTitle').textContent = b.dataset.title || ''; dlg.showModal(); lenis && lenis.stop();
  });
  const close = () => { box.innerHTML = ''; dlg.close(); lenis && lenis.start(); };
  $('#ytClose').addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('cancel', () => { box.innerHTML = ''; lenis && lenis.start(); });
}

/* ---------------- CLIENTS ---------------- */
function initClients() {
  $('#clientNames').innerHTML = 'Also trusted by ' + CLIENT_NAMES.slice(4).map((n) => `<b>${n}</b>`).join(', ') + '.';
  dotMatrix($('#ribbon'), '  GOOGLE YOUTUBE · KENNEDY SPACE CENTER · BRITISH LAND · COCA-COLA · CHELSEA FC · BATH RUGBY · BRISTOL AIRPORT · KING FAHAD BRIDGE · VINSON & ELKINS · WESTFIELD · CINEWORLD · ', { rows: 13, scroll: true, speed: 14, color: [255, 176, 40] });
}

/* ---------------- FORM: prototype, sends nothing ---------------- */
function initForm() {
  const f = $('#quoteForm'), st = $('#formStatus');
  f.addEventListener('submit', (e) => {
    e.preventDefault(); st.classList.remove('err');
    const first = f.first, email = f.email; let ok = true;
    [first, email].forEach((i) => { const bad = !i.value.trim() || (i.type === 'email' && !/^\S+@\S+\.\S+$/.test(i.value)); i.closest('.field').classList.toggle('bad', bad); if (bad) ok = false; });
    if (!ok) { st.classList.add('err'); st.textContent = 'Please add your first name and a valid email.'; return; }
    const plans = $$('input[name=plan]:checked', f).map((i) => i.value).join(', ') || 'not specified';
    st.textContent = `Thanks, ${first.value.trim()}. This is a design proposal, so nothing was sent. [BENDAC: connect this form to info@bendac.tech or your CRM.] Planning: ${plans}.`;
  });
}

/* ---------------- POINTER CRAFT: magnetic buttons, tilt ---------------- */
function initPointer() {
  if (isTouch || reduced) return;
  $$('.magnetic').forEach((el) => {
    el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; el.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`; });
    el.addEventListener('pointerleave', () => { el.style.transition = 'transform .5s cubic-bezier(.2,.7,.1,1)'; el.style.transform = ''; setTimeout(() => (el.style.transition = ''), 500); });
  });
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('.tilt'); if (!t) return;
    const r = t.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    t.style.transform = `perspective(900px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg)`;
    t.style.setProperty('--sx', `${(x + 0.5) * 100}%`); t.style.setProperty('--sy', `${(y + 0.5) * 100}%`);
    t._tilt = true;
  });
  document.addEventListener('pointerout', (e) => { const t = e.target.closest && e.target.closest('.tilt'); if (t && !t.contains(e.relatedTarget)) { t.style.transform = ''; } });
}

/* ---------------- MENU ---------------- */
function initMenu() {
  const btn = $('#menuBtn'), menu = $('#menu');
  const set = (o) => { document.body.classList.toggle('menu-open', o); btn.setAttribute('aria-expanded', o); menu.setAttribute('aria-hidden', !o); o ? lenis && lenis.stop() : lenis && lenis.start(); };
  btn.addEventListener('click', () => set(!document.body.classList.contains('menu-open')));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]'); if (!a || a.closest('#product')) return;
    e.preventDefault(); set(false); go(a.getAttribute('href'));
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
}

/* ---------------- BOOT ---------------- */
(async function boot() {
  const loaderDone = runLoader();
  loaderProgress(15);
  initMenu(); initRange(); initWork(); initFilm(); initForm(); initPointer();
  await document.fonts.ready; loaderProgress(45);
  $$('.dotnum').forEach((c) => dotMatrix(c, c.dataset.text, { rows: 15 }));
  initClients();
  const wallReady = initWall();
  wallReady.then(() => loaderProgress(100));
  initScroll(); initSectors();
  await loaderDone;
  document.body.classList.remove('is-loading'); document.body.classList.add('ready');
  ScrollTrigger.refresh();
  if (!reduced) gsap.from('#wallTitle .line > span', { yPercent: 110, duration: 1.2, stagger: 0.1, ease: 'power4.out', delay: 0.35 });
  window.__bendac = { lenis, wall, go };
})();
