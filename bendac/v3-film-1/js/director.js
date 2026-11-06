// The director: owns the film's clock, which act is on screen, the joins between acts, and the film controls.
// The film plays itself. Scroll never drives it; scrolling down simply leaves it for the page underneath.
import * as THREE from 'three';
const BX = window.BX;

(function director() {
  const renderer = BX.renderer;
  if (!renderer) return;
  const $ = (id) => document.getElementById(id);
  const RM = BX.reduced;

  const acts = [BX.acts.A(), BX.acts.B(), BX.acts.C()];
  const starts = []; let total = 0;
  for (const a of acts) { starts.push(total); total += a.duration; }
  BX.film.total = total;

  // ---------- size
  function resize() {
    BX.resizeRenderer();
    BX.sparkStartPx = acts[1].startSparkPx();
    acts.forEach((a) => a.resize && a.resize());
  }
  resize();
  addEventListener('resize', () => requestAnimationFrame(resize));
  document.fonts && document.fonts.ready.then(() => acts.forEach((a) => a.resize && a.resize()));
  // compile every act's shaders now, so a join between acts never stalls
  acts.forEach((a) => a.compile());
  // and draw each act once now, so its buffers and textures are on the GPU before the join (a first draw at the join cost 140 to 190 ms)
  acts.forEach((a) => { try { a.frame(a.stillT, 1 / 60, 0, { x: 0, y: 0 }, false); } catch (e) { /* drawn again on its turn */ } });
  renderer.clear();

  // ---------- pointer and finger (relative to the film); act 3 also listens for drags on the canvas itself
  const ptr = { x: 0, y: 0 };
  const setPtr = (cx, cy) => { const r = BX.film.getBoundingClientRect(); ptr.x = ((cx - r.left) / r.width) * 2 - 1; ptr.y = -(((cy - r.top) / r.height) * 2 - 1); };
  BX.film.addEventListener('mousemove', (e) => setPtr(e.clientX, e.clientY), { passive: true });
  BX.film.addEventListener('mouseleave', () => { ptr.x = 0; ptr.y = 0; });
  BX.film.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) setPtr(t.clientX, t.clientY); }, { passive: true });
  BX.film.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) setPtr(t.clientX, t.clientY); }, { passive: true });
  BX.film.addEventListener('touchend', () => { ptr.x = 0; ptr.y = 0; }, { passive: true });

  // ---------- clock and state
  let g = 0;                // film time in seconds
  let playing = !RM, ended = false, visible = true, ready = false;
  let stillIdx = 0;         // reduced motion: which act's still is showing
  let activeIdx = -1;
  const allVideos = ['v-acc', 'v-venue', 'v-install'];

  function actAt(sec) { let i = 0; while (i < acts.length - 1 && sec >= starts[i + 1]) i++; return i; }
  function setActive(i) {
    if (i === activeIdx) return;
    if (activeIdx >= 0) { const o = acts[activeIdx]; o.ov.classList.remove('on'); o.setActive && o.setActive(false); }
    activeIdx = i; const a = acts[i];
    a.ov.classList.add('on'); a.setActive && a.setActive(true);
    marks.forEach((m, k) => m.setAttribute('aria-current', String(k === i)));
    syncVideos();
  }
  function syncVideos() {
    const want = new Set((playing && visible && !RM && activeIdx >= 0) ? acts[activeIdx].videos : []);
    // start the next act's footage a moment early, so its decoder is running when the join arrives
    const nx = activeIdx + 1;
    if (want.size && nx < acts.length && g > starts[nx] - 2) acts[nx].videos.forEach((id) => want.add(id));
    for (const id of allVideos) {
      if (id === 'v-install') continue;           // act 3 times the install film itself
      if (want.has(id)) BX.play(id); else BX.pause(id);
    }
  }

  // ---------- controls
  const playBtn = $('play'), skipBtn = $('skip'), fill = $('fill');
  const marks = [...document.querySelectorAll('.mark')];
  marks.forEach((m, k) => { m.style.left = `${(starts[k] / total * 100).toFixed(2)}%`; });
  const ICON = {
    pause: '<svg viewBox="0 0 14 14" fill="currentColor"><rect x="2.5" y="2" width="3" height="10" rx=".6"/><rect x="8.5" y="2" width="3" height="10" rx=".6"/></svg>',
    play: '<svg viewBox="0 0 14 14" fill="currentColor"><path d="M3.5 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5z"/></svg>',
    again: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.6 7a4.4 4.4 0 1 0 1.3-3.1"/><path d="M3.6 1.6v2.6h2.6"/></svg>',
  };
  let lastBtn = '';
  function paintControls() {
    const state = ended ? 'again' : playing ? 'pause' : 'play';
    if (state !== lastBtn) {
      lastBtn = state; playBtn.innerHTML = ICON[state];
      playBtn.setAttribute('aria-label', state === 'again' ? 'Watch again' : state === 'pause' ? 'Pause' : 'Play');
      playBtn.classList.toggle('again', state === 'again');
      playBtn.style.width = state === 'again' ? 'auto' : '';
      if (state === 'again') playBtn.innerHTML += '<span>Watch again</span>';
    }
    const end = ended || (RM && stillIdx === acts.length - 1);
    skipBtn.classList.toggle('go', end);
    const txt = end ? 'Keep scrolling' : 'Skip';
    if (skipBtn.firstChild.textContent !== txt) skipBtn.firstChild.textContent = txt;
    fill.style.width = `${(RM ? starts[stillIdx] / total + acts[stillIdx].duration / total * 0.5 : g / total) * 100}%`;
    $('back').disabled = stillIdx === 0; $('next').disabled = stillIdx === acts.length - 1;
  }
  playBtn.addEventListener('click', () => {
    if (ended) { g = 0; ended = false; playing = true; playId++; }
    else playing = !playing;
    syncVideos(); paintControls();
  });
  skipBtn.addEventListener('click', () => { $('half2').scrollIntoView({ behavior: RM ? 'auto' : 'smooth' }); });
  marks.forEach((m, k) => m.addEventListener('click', () => {
    if (RM) { stillIdx = k; }
    else { g = starts[k] + 0.001; ended = false; playing = true; playId++; }
    syncVideos(); paintControls();
  }));
  $('back').addEventListener('click', () => { stillIdx = Math.max(0, stillIdx - 1); paintControls(); });
  $('next').addEventListener('click', () => { stillIdx = Math.min(acts.length - 1, stillIdx + 1); paintControls(); });

  // the film plays only while you can see it; scroll down to the page and it waits for you
  new IntersectionObserver((es) => { visible = es[0].intersectionRatio > 0.25; syncVideos(); }, { threshold: [0, 0.25, 0.5] }).observe(BX.film);

  // reduced motion: every screen holds one still frame of its real footage
  if (RM) for (const id of ['v-acc', 'v-venue', 'v-install']) {
    const v = BX.video(id);
    const go = () => { v.pause(); v.currentTime = id === 'v-install' ? 10 : 1.0; v.addEventListener('seeked', () => BX.pushFrame(id), { once: true }); };
    if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
  }

  // start when the first footage can be drawn (or after 1.5 s), so the film never opens on an empty wall
  const first = BX.video('v-acc');
  const begin = () => { if (!ready) { ready = true; syncVideos(); } };
  if (first.readyState >= 2) begin(); else { first.addEventListener('loadeddata', begin, { once: true }); setTimeout(begin, 1500); }
  // iOS may hold autoplay until the first touch
  const kick = () => syncVideos();
  ['pointerdown', 'touchstart', 'keydown'].forEach((e) => addEventListener(e, kick, { once: true, passive: true }));

  // ---------- frame loop
  const frames = [], videoTimes = [];
  window.__probe = { frames, videoTimes };
  window.__film = {
    get t() { return g; }, total, starts,
    seek(sec) { g = Math.max(0, Math.min(total - 0.001, sec)); ended = false; playId++; },
    state() { return { g: +g.toFixed(2), act: activeIdx, playing, ended, visible, dpr: renderer.getPixelRatio(), still: stillIdx, spark: acts[1].sparkScreen ? acts[1].sparkScreen() : null }; },
    acts,
  };
  let last = performance.now(), n = 0, slow = 0;
  const warmed = []; let playId = 0;
  function tick(now) {
    const rawDt = now - last; last = now; n++;
    const dt = Math.min(0.05, rawDt / 1000);
    if (visible) frames.push(rawDt);
    if (ready && playing && visible && !RM && !ended) { g += dt; if (g >= total) { g = total; ended = true; playing = false; syncVideos(); } }
    let i, t;
    if (RM) { i = stillIdx; t = acts[i].stillT; }
    else { i = actAt(Math.min(g, total - 1e-4)); t = Math.min(1, (g - starts[i]) / acts[i].duration); }
    setActive(i);
    // a quarter second before a join, draw the next act once underneath (its fresh footage and buffers reach the GPU early)
    const nx = i + 1;
    if (visible && !RM && nx < acts.length && g > starts[nx] - 0.25 && warmed[nx] !== playId) { warmed[nx] = playId; acts[nx].frame(0, dt, now / 1000, { x: 0, y: 0 }, false); }
    if (visible) acts[i].frame(t, dt, now / 1000, ptr, playing && !RM);
    if (n % 6 === 0) paintControls();
    if (n % 15 === 0 && !RM) syncVideos();
    if (n % 30 === 0) { const v = BX.video(acts[i].videos[0]); videoTimes.push(v ? v.currentTime : 0); }
    // adaptive quality: if the device cannot hold about 45 fps, render fewer pixels
    if (visible && n > 60 && rawDt < 200) { slow = slow * 0.95 + (rawDt > 24 ? 0.05 : 0); if (slow > 0.5 && BX.size.dpr > 1) { BX.size.dpr = Math.max(1, BX.size.dpr - 0.5); resize(); slow = 0; } }
    requestAnimationFrame(tick);
  }
  paintControls();
  requestAnimationFrame(tick);
})();
