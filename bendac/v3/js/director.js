// The director: owns the film's clock, which act is on screen, the joins between acts, the captions' place and the controls.
// Round 2: the film is the page's background. It plays at a constant 1.15x whatever the visitor does (scrolling never
// pauses, speeds or slows it), loops with a fade at the end, and its captions follow its clock like subtitles.
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
  const groups = acts.map((a) => [...document.querySelectorAll(`.act[data-act="${a.id}"]`)]);

  // ---------- size, and the free part of the window the subject is framed in
  const cap = $('cap'), ctl = $('ctl');
  function measureFree() {
    const { w, h } = BX.size;
    let capH = 0;
    document.querySelectorAll('.capi').forEach((el) => { capH = Math.max(capH, el.offsetHeight); });
    document.documentElement.style.setProperty('--capH', `${Math.ceil(capH)}px`);
    const ctlTop = ctl.getBoundingClientRect().top;
    if (BX.isPhone()) BX.free = { top: cap.getBoundingClientRect().top + capH + 14, bottom: Math.min(h, ctlTop) - 14, left: 0 };
    else BX.free = { top: 0, bottom: h - 70, left: cap.getBoundingClientRect().left + cap.offsetWidth + 24 };
  }
  function resize() {
    BX.resizeRenderer(); measureFree();
    BX.sparkStartPx = acts[1].startSparkPx();
    acts.forEach((a) => a.resize && a.resize());
  }
  resize();
  addEventListener('resize', () => requestAnimationFrame(resize));
  document.fonts && document.fonts.ready.then(() => requestAnimationFrame(resize));
  // compile and draw every act once now, so a join never stalls on first use of its buffers and textures
  acts.forEach((a) => a.compile());
  acts.forEach((a) => { try { a.frame(a.stillT, 1 / 60, 0, { x: 0, y: 0 }, false); } catch (e) { /* drawn again on its turn */ } });
  renderer.clear();

  // ---------- pointer and finger (act 3 also listens for drags on the canvas itself)
  const ptr = { x: 0, y: 0 };
  const setPtr = (cx, cy) => { ptr.x = (cx / BX.size.w) * 2 - 1; ptr.y = -((cy / BX.size.h) * 2 - 1); };
  addEventListener('mousemove', (e) => setPtr(e.clientX, e.clientY), { passive: true });
  document.addEventListener('mouseleave', () => { ptr.x = 0; ptr.y = 0; });
  // a finger counts only when it is on the film itself (between the cards), not while reading a card
  const onFilm = (e) => e.target === BX.canvas;
  addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t && onFilm(e)) setPtr(t.clientX, t.clientY); }, { passive: true });
  addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t && onFilm(e)) setPtr(t.clientX, t.clientY); }, { passive: true });
  addEventListener('touchend', () => { ptr.x = 0; ptr.y = 0; }, { passive: true });

  // ---------- clock and state
  let g = 0;                // film time in film seconds (it advances 1.15 per real second)
  let playing = !RM, ready = false, loops = 0;
  let stillIdx = 0;         // reduced motion: which act's still is showing
  let activeIdx = -1;
  const allVideos = ['v-acc', 'v-venue', 'v-install'];
  const marks = [...document.querySelectorAll('.mark')];

  function actAt(sec) { let i = 0; while (i < acts.length - 1 && sec >= starts[i + 1]) i++; return i; }
  function setActive(i) {
    if (i === activeIdx) return;
    if (activeIdx >= 0) { groups[activeIdx].forEach((el) => el.classList.remove('on')); acts[activeIdx].setActive && acts[activeIdx].setActive(false); }
    activeIdx = i;
    groups[i].forEach((el) => el.classList.add('on')); acts[i].setActive && acts[i].setActive(true);
    marks.forEach((m, k) => m.setAttribute('aria-current', String(k === i)));
    syncVideos();
  }
  function syncVideos() {
    const want = new Set((playing && !RM && activeIdx >= 0) ? acts[activeIdx].videos : []);
    // start the next act's footage a moment early, so its decoder is running when the join arrives
    const nx = (activeIdx + 1) % acts.length;
    if (want.size && g > (nx ? starts[nx] : total) - 2.3) acts[nx].videos.forEach((id) => want.add(id));
    for (const id of allVideos) {
      if (id === 'v-install') continue;           // act 3 times the install film itself
      if (want.has(id)) { const v = BX.video(id); if (v.playbackRate !== BX.rate) v.playbackRate = BX.rate; BX.play(id); } else BX.pause(id);
    }
  }

  // ---------- controls: pause and play, the chapter bar (and back and next for reduced motion)
  const playBtn = $('play'), fill = $('fill'), fade = $('fade');
  marks.forEach((m, k) => { m.style.left = `${(starts[k] / total * 100).toFixed(2)}%`; });
  const ICON = {
    pause: '<svg viewBox="0 0 14 14" fill="currentColor"><rect x="2.5" y="2" width="3" height="10" rx=".6"/><rect x="8.5" y="2" width="3" height="10" rx=".6"/></svg>',
    play: '<svg viewBox="0 0 14 14" fill="currentColor"><path d="M3.5 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5z"/></svg>',
  };
  let lastBtn = '';
  function paintControls() {
    const state = playing ? 'pause' : 'play';
    if (state !== lastBtn) { lastBtn = state; playBtn.innerHTML = ICON[state]; playBtn.setAttribute('aria-label', state === 'pause' ? 'Pause' : 'Play'); }
    fill.style.width = `${(RM ? (starts[stillIdx] + acts[stillIdx].duration * 0.5) / total : g / total) * 100}%`;
    $('back').disabled = stillIdx === 0; $('next').disabled = stillIdx === acts.length - 1;
  }
  playBtn.addEventListener('click', () => { playing = !playing; syncVideos(); paintControls(); });
  marks.forEach((m, k) => m.addEventListener('click', () => {
    if (RM) stillIdx = k;
    else { g = starts[k] + 0.001; playId++; }
    syncVideos(); paintControls();
  }));
  $('back').addEventListener('click', () => { stillIdx = Math.max(0, stillIdx - 1); paintControls(); });
  $('next').addEventListener('click', () => { stillIdx = Math.min(acts.length - 1, stillIdx + 1); paintControls(); });

  // reduced motion: every screen holds one still frame of its real footage
  if (RM) for (const id of allVideos) {
    const v = BX.video(id);
    const go = () => { v.pause(); v.currentTime = id === 'v-install' ? 6.5 : 1.0; v.addEventListener('seeked', () => BX.pushFrame(id), { once: true }); };
    if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
  }

  // start when the first footage can be drawn (or after 1.5 s), so the film never opens on an empty wall
  const first = BX.video('v-acc');
  const begin = () => { if (!ready) { ready = true; syncVideos(); } };
  if (first.readyState >= 2) begin(); else { first.addEventListener('loadeddata', begin, { once: true }); setTimeout(begin, 1500); }
  // iOS grants playback per element on a real tap (touchend or click, not touchstart or scroll): on the first one,
  // start and stop every film video so later programmatic play() calls are allowed, then resync
  let unlocked = false;
  const unlock = () => {
    if (unlocked) return; unlocked = true;
    for (const id of allVideos) { const v = BX.video(id); if (!v) continue; const was = v.paused; const pr = v.play(); if (pr && pr.then) pr.then(() => { if (was) v.pause(); syncVideos(); }).catch(() => {}); }
    syncVideos();
  };
  ['touchend', 'click', 'pointerup', 'keydown'].forEach((e) => addEventListener(e, unlock, { passive: true }));
  ['pointerdown', 'touchstart', 'scroll'].forEach((e) => addEventListener(e, () => syncVideos(), { once: true, passive: true }));
  // watchdog: any video that should be running but is not (power saving, a refused play, a stalled decoder) is retried
  setInterval(() => { if (ready && playing && !RM) syncVideos(); }, 700);
  // never a black screen while footage loads: as soon as a video has its first frame, put that frame on the GPU
  for (const id of allVideos) { const v = BX.video(id); if (!v) continue; const push = () => BX.pushFrame(id); if (v.readyState >= 2) push(); else v.addEventListener('loadeddata', push, { once: true }); }

  // ---------- frame loop
  const frames = [], videoTimes = [], clockLog = [];
  window.__probe = { frames, videoTimes, clockLog };
  let playId = 0;
  window.__film = {
    get t() { return g; }, total, starts, rate: BX.rate,
    seek(sec) { g = Math.max(0, Math.min(total - 0.001, sec)); playId++; },
    state() { return { g: +g.toFixed(3), act: activeIdx, playing, loops, dpr: renderer.getPixelRatio(), still: stillIdx, spark: acts[1].sparkScreen ? acts[1].sparkScreen() : null }; },
    acts,
  };
  let last = performance.now(), n = 0, slow = 0;
  const warmed = [];
  function tick(now) {
    const rawDt = now - last; last = now; n++;
    const dt = Math.min(0.25, rawDt / 1000);
    frames.push(rawDt);
    if (ready && playing && !RM) {
      g += dt * BX.rate;
      if (g >= total) { g -= total; loops++; playId++; syncVideos(); }   // a background: it loops
    }
    let i, t;
    if (RM) { i = stillIdx; t = acts[i].stillT; }
    else { i = actAt(Math.min(g, total - 1e-4)); t = Math.min(1, (g - starts[i]) / acts[i].duration); }
    setActive(i);
    // a quarter second before a join, draw the next act once underneath (its fresh footage and buffers reach the GPU early)
    const nx = i + 1;
    if (!RM && nx < acts.length && g > starts[nx] - 0.3 && warmed[nx] !== playId) { warmed[nx] = playId; acts[nx].frame(0, dt, now / 1000, { x: 0, y: 0 }, false); }
    acts[i].frame(t, dt, now / 1000, ptr, playing && !RM);
    // the loop: fade to black over the last 0.8 s, back up over the first 0.6 s after a loop
    const fo = RM ? 0 : Math.max(BX.smooth(total - 0.8, total - 0.05, g), loops ? 1 - BX.smooth(0.0, 0.6, g) : 0);
    fade.style.opacity = fo.toFixed(3);
    if (n % 6 === 0) paintControls();
    if (n % 15 === 0 && !RM) syncVideos();
    if (n % 30 === 0) { const v = BX.video(acts[i].videos[0]); videoTimes.push(v ? v.currentTime : 0); }
    if (n % 6 === 0) clockLog.push([+(now / 1000).toFixed(3), +(g + loops * total).toFixed(3), +scrollY.toFixed(0)]);
    // adaptive quality: if the device cannot hold about 45 fps, render fewer pixels
    if (n > 60 && rawDt < 200) { slow = slow * 0.95 + (rawDt > 24 ? 0.05 : 0); if (slow > 0.5 && BX.size.dpr > 1) { BX.size.dpr = Math.max(1, BX.size.dpr - 0.5); resize(); slow = 0; } }
    requestAnimationFrame(tick);
  }
  paintControls();
  requestAnimationFrame(tick);
})();
