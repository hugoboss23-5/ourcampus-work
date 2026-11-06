// built-from: LED-matrix sampling technique from js/ledwall.js (per-cell
// sample + round-hole mask), MDN Pointer Events https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events and
// CanvasPattern https://developer.mozilla.org/en-US/docs/Web/API/CanvasPattern ; device frames and system panels are generic
// drawings in the site's style, as Hugo's coordinator asked (no Apple/Google/Microsoft artwork); content = Bendac photos/video.
// [BENDAC: confirm which wireless sharing your installations support] — the flows below illustrate a typical setup
// (screen mirroring / cast / wireless display). Nothing on bendac.tech or their YouTube names a protocol; their meeting-room
// film only says "quick connectivity" and "All of our solutions are easy to use" (YouTube ZBZoFaUytX4).

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const SVG = {
  mirror: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="13" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="8" y="9" width="13" height="10" rx="2" fill="currentColor" opacity=".85"/></svg>',
  cast: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 13a6 6 0 0 1 6 6M3 16.5A2.5 2.5 0 0 1 5.5 19" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="3.6" cy="19" r="1.1" fill="currentColor"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/></svg>',
  bt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10-5 4V3l5 4L7 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="currentColor"/></svg>',
  torch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v4l-2 3v11h-4V10L8 7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  plane: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 14l8-3V5a2 2 0 0 1 4 0v6l8 3v2l-8-2v4l2 2v1l-4-1-4 1v-1l2-2v-4l-8 2z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  wall: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.8"/></svg>',
};

const DEVICES = [
  { id: 'iphone', label: 'iPhone', kind: 'phone', open: 'swipe', zone: 'tr', panel: 'cc', tile: 'Screen Mirroring', stop: 'Stop Mirroring',
    hint: 'Swipe down here', steps: ['Swipe down from the top-right', 'Tap Screen Mirroring', 'Tap Bendac Wall'],
    content: [['img', 'case-google-stairs', 'Google YouTube, Berlin'], ['img', 'case-bath-attendance', 'Bath Rugby, The Rec'], ['img', 'case-lulea', 'Luleå HF']] },
  { id: 'ipad', label: 'iPad', kind: 'tablet', open: 'swipe', zone: 'tr', panel: 'cc', tile: 'Screen Mirroring', stop: 'Stop Mirroring',
    hint: 'Swipe down here', steps: ['Swipe down from the top-right', 'Tap Screen Mirroring', 'Tap Bendac Wall'],
    content: [['video', 'ksc-store', 'Kennedy Space Center shop'], ['img', 'case-ksc-sign', 'Kennedy Space Center']] },
  { id: 'mac', label: 'Mac', kind: 'laptop', open: 'menubar', panel: 'drop', tile: 'Screen Mirroring', stop: 'Stop Mirroring',
    hint: 'Click this icon', steps: ['Click the mirroring icon', 'Click Bendac Wall'],
    content: [['img', 'corp-dash', 'Office dashboard'], ['img', 'corp-corner', 'Feature wall']] },
  { id: 'android', label: 'Android', kind: 'phone', open: 'swipe', zone: 'top', panel: 'qs', tile: 'Cast', stop: 'Disconnect',
    hint: 'Swipe down here', steps: ['Swipe down from the top', 'Tap Cast', 'Tap Bendac Wall'],
    content: [['img', 'case-allypally', 'Alexandra Palace'], ['img', 'sport-smoke', 'Matchday']] },
  { id: 'windows', label: 'Windows laptop', kind: 'laptop', open: 'taskbar', panel: 'flyout', tile: 'Cast', stop: 'Disconnect',
    hint: 'Click Cast', steps: ['Click Cast (or Win + K)', 'Click Bendac Wall'],
    content: [['img', 'vp-blue', 'Virtual production studio'], ['img', 'case-yacht', 'Project H']] },
];

/* ---------------- the LED wall (2D canvas) ---------------- */
function createWall(canvas, logoSrc) {
  const ctx = canvas.getContext('2d');
  const low = document.createElement('canvas'); const lctx = low.getContext('2d');
  const logo = new Image(); logo.src = logoSrc;
  let W = 0, H = 0, cell = 7, mask = null, source = null, state = 'idle', t0 = 0, visible = false;
  const mouse = { x: 0.5, y: 0.4, on: false };
  ctx.filter = 'blur(2px)'; const canBlur = ctx.filter === 'blur(2px)'; ctx.filter = 'none';
  function build() {
    const r = canvas.getBoundingClientRect(); const d = Math.min(devicePixelRatio || 1, 2);
    W = canvas.width = Math.max(2, Math.round(r.width * d)); H = canvas.height = Math.max(2, Math.round(r.height * d));
    cell = Math.max(4, Math.round((r.width < 500 ? 4.4 : 6.2) * d));
    low.width = Math.ceil(W / cell); low.height = Math.ceil(H / cell);
    const m = document.createElement('canvas'); m.width = m.height = cell; const mc = m.getContext('2d');
    mc.fillStyle = '#020302'; mc.fillRect(0, 0, cell, cell);
    mc.globalCompositeOperation = 'destination-out'; mc.beginPath();
    const rr = cell * 0.36, c = cell / 2;
    if (mc.roundRect) mc.roundRect(c - rr, c - rr, rr * 2, rr * 2, rr * 0.55); else mc.arc(c, c, rr, 0, Math.PI * 2);
    mc.fill(); mask = ctx.createPattern(m, 'repeat');
  }
  build(); addEventListener('resize', build);
  canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); mouse.x = (e.clientX - r.left) / r.width; mouse.y = (e.clientY - r.top) / r.height; mouse.on = true; });
  canvas.addEventListener('pointerleave', () => { mouse.on = false; });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  function cover(src, w, h) {
    const sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height;
    if (!sw || !sh) return;
    const s = Math.max(w / sw, h / sh); const dw = sw * s, dh = sh * s;
    lctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  function drawStandby(now) {
    const w = low.width, h = low.height; const breathe = 0.5 + 0.25 * Math.sin(now / 900);
    lctx.fillStyle = '#000'; lctx.fillRect(0, 0, w, h);
    if (logo.complete && logo.naturalWidth) {
      const lw = w * 0.42, lh = lw * logo.naturalHeight / logo.naturalWidth;
      lctx.globalAlpha = breathe; lctx.drawImage(logo, (w - lw) / 2, (h - lh) / 2 - h * 0.05, lw, lh); lctx.globalAlpha = 1;
    }
    const sy = ((now / 22) % (h + 20)) - 10;
    const g = lctx.createLinearGradient(0, sy - 4, 0, sy + 4); g.addColorStop(0, 'rgba(31,230,131,0)'); g.addColorStop(0.5, 'rgba(31,230,131,.32)'); g.addColorStop(1, 'rgba(31,230,131,0)');
    lctx.fillStyle = g; lctx.fillRect(0, sy - 4, w, 8);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const w = low.width, h = low.height;
    lctx.imageSmoothingEnabled = true;
    if (state === 'idle' || !source) drawStandby(now);
    else {
      const p = Math.min(1, (now - t0) / (state === 'connecting' ? 700 : 500));
      lctx.fillStyle = '#000'; lctx.fillRect(0, 0, w, h);
      if (state === 'stopping') { lctx.globalAlpha = 1 - p; cover(source, w, h); lctx.globalAlpha = 1; if (p >= 1) { state = 'idle'; source = null; } }
      else {
        const reveal = state === 'connecting' ? p : 1; const half = (w / 2) * reveal;
        lctx.save(); lctx.beginPath(); lctx.rect(w / 2 - half, 0, half * 2, h); lctx.clip(); cover(source, w, h); lctx.restore();
        if (reveal < 1) { lctx.fillStyle = 'rgba(31,230,131,.9)'; lctx.fillRect(Math.floor(w / 2 - half) - 1, 0, 1, h); lctx.fillRect(Math.ceil(w / 2 + half), 0, 1, h); }
        if (state === 'connecting' && p >= 1) state = 'live';
      }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, low.width * cell, low.height * cell);
    ctx.fillStyle = mask; ctx.fillRect(0, 0, W, H);
    if (canBlur) { ctx.globalCompositeOperation = 'lighter'; ctx.filter = `blur(${cell * 1.4}px)`; ctx.globalAlpha = 0.3; ctx.imageSmoothingEnabled = true; ctx.drawImage(low, 0, 0, low.width * cell, low.height * cell); ctx.filter = 'none'; ctx.globalAlpha = 1; }
    if (mouse.on) { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(mouse.x * W, mouse.y * H, 0, mouse.x * W, mouse.y * H, W * 0.22); g.addColorStop(0, 'rgba(200,255,225,.10)'); g.addColorStop(1, 'rgba(200,255,225,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    ctx.globalCompositeOperation = 'source-over';
  }
  requestAnimationFrame(frame);
  return {
    show(src) { source = src; state = 'connecting'; t0 = performance.now(); },
    swap(src) { source = src; },
    stop() { if (source) { state = 'stopping'; t0 = performance.now(); } },
    get state() { return state; },
  };
}

/* ---------------- devices ---------------- */
function frameHTML(d) {
  const slides = d.content.map(([t, f, cap]) => t === 'video'
    ? `<video src="assets/video/${f}.mp4" muted loop playsinline preload="auto" data-cap="${cap}"></video>`
    : `<img src="assets/img/${f}.webp" alt="${cap}" data-cap="${cap}">`).join('');
  const dots = d.content.map((_, j) => `<i class="${j === 0 ? 'on' : ''}"></i>`).join('');
  const list = `<div class="sheet" role="dialog" aria-label="${d.tile}">
      <p class="sheet__title">${d.tile}</p>
      <p class="sheet__scan"><span class="spin"></span>Looking for displays</p>
      <ul class="sheet__list">
        <li><button class="dev-target" data-target="wall">${SVG.wall}<span>Bendac Wall</span><em></em></button></li>
        <li><button class="dev-target dim" disabled>${SVG.wall}<span>Boardroom display</span><em>Unavailable</em></button></li>
      </ul>
      <button class="sheet__stop">${d.stop}</button>
    </div>`;
  let panel = '';
  if (d.panel === 'cc') panel = `<div class="panel panel--cc" aria-hidden="true">
      <div class="cc">
        <div class="cc__grp"><span class="cc__t on">${SVG.plane}</span><span class="cc__t on">${SVG.wifi}</span><span class="cc__t on">${SVG.bt}</span><span class="cc__t">${SVG.moon}</span></div>
        <div class="cc__slider"><i></i>${SVG.sun}</div>
        <button class="cc__mirror open-list">${SVG.mirror}<span>${d.tile}</span></button>
      </div>${list}</div>`;
  if (d.panel === 'qs') panel = `<div class="panel panel--qs" aria-hidden="true">
      <div class="qs"><p class="qs__time">10:24</p><div class="qs__bright"><i></i>${SVG.sun}</div>
        <div class="qs__grid"><span class="qs__t on">${SVG.wifi}<span>Wi-Fi</span></span><span class="qs__t on">${SVG.bt}<span>Bluetooth</span></span>
        <span class="qs__t">${SVG.torch}<span>Torch</span></span><button class="qs__t open-list">${SVG.cast}<span>${d.tile}</span></button></div></div>${list}</div>`;
  if (d.panel === 'drop' || d.panel === 'flyout') panel = `<div class="panel panel--${d.panel}" aria-hidden="true">${list}</div>`;

  const bars = d.kind === 'laptop'
    ? (d.open === 'menubar'
      ? `<div class="menubar"><span class="menubar__l"><b>&#9679;</b>File&ensp;Edit&ensp;View</span><span class="menubar__r"><button class="menubar__mirror open-list" data-hint-anchor aria-label="Screen Mirroring">${SVG.mirror}</button>${SVG.wifi}<span>10:24</span></span></div>`
      : `<div class="taskbar"><span class="taskbar__apps"><i></i><i></i><i></i><i></i></span><span class="taskbar__r"><button class="kbd open-list" aria-label="Win plus K">Win + K</button><button class="taskbar__cast open-list" data-hint-anchor aria-label="Cast">${SVG.cast}<span>Cast</span></button><span>10:24</span></span></div>`)
    : `<div class="scr__bar"><span>10:24</span><span class="scr__icons">${SVG.wifi}<i class="batt"></i></span></div>
       <div class="scr__pull scr__pull--${d.zone}" aria-hidden="true"><i data-hint-anchor></i></div>
       <button class="scr__open sr">Open ${d.panel === 'cc' ? 'control panel' : 'quick settings'}</button>`;
  const screen = `<div class="scr">
      <div class="scr__media">${slides}</div>
      <p class="scr__cap"></p><p class="scr__dots">${dots}</p>
      ${bars}
      <button class="scr__live" hidden><i></i><span>Mirroring to Bendac Wall</span><b>Stop</b></button>
      ${panel}
    </div>`;
  if (d.kind === 'laptop') return `<div class="lap"><div class="lap__lid"><i class="cam"></i>${screen}</div><div class="lap__base"><i></i></div></div>`;
  return `<div class="hand"><i class="cam"></i>${screen}</div>`;
}

export function initMirror(root) {
  const wall = createWall($('#mirrorWall', root), 'assets/img/logo-bendac-white.webp');
  const tabs = $('#deviceTabs', root), host = $('#device', root), steps = $('#tapSteps', root), status = $('#wallStatus', root), hint = $('#tapHint', root);
  const done = {}; // first-time hints, per device
  let dev = null, idx = 0, step = 0, mirroring = false, media = [];

  DEVICES.forEach((d, i) => { const b = document.createElement('button'); b.className = 'devtab'; b.setAttribute('role', 'tab'); b.dataset.id = d.id; b.textContent = d.label; b.addEventListener('click', () => select(i)); tabs.appendChild(b); });

  function setStep(n) {
    step = n;
    $$('li', steps).forEach((li, j) => { li.classList.toggle('on', j === n && !mirroring); li.classList.toggle('done', j < n || mirroring); });
    if (n > 0) { done[dev.id] = true; hint.classList.remove('show'); }
  }
  function placeHint() {
    if (!dev || done[dev.id] || mirroring) { hint.classList.remove('show'); return; }
    const anchor = $('[data-hint-anchor]', host); if (!anchor) return;
    $('span', hint).textContent = dev.hint;
    const r = anchor.getBoundingClientRect(), pr = $('.tap__device', root).getBoundingClientRect();
    const x = r.left - pr.left + r.width / 2, y = r.top - pr.top + r.height + 8;
    const hw = hint.offsetWidth / 2 + 4; hint.style.left = `${Math.max(hw, Math.min(pr.width - hw, x))}px`; hint.style.top = `${y}px`;
    hint.classList.add('show');
  }
  const currentMedia = () => media[idx];

  function select(i) {
    if (mirroring) stopMirror(true);
    dev = DEVICES[i]; idx = 0;
    $$('.devtab', tabs).forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
    steps.innerHTML = dev.steps.map((s, j) => `<li><b>${j + 1}</b><span>${s}</span></li>`).join('');
    host.className = `device device--${dev.kind} device--${dev.id}`;
    host.innerHTML = frameHTML(dev);
    media = $$('.scr__media > *', host);
    media.forEach((m, j) => { m.classList.toggle('on', j === 0); if (m.tagName === 'VIDEO') { m.muted = true; m.play().catch(() => {}); } });
    wire();
    setStep(0); status.textContent = 'Waiting for a device';
    requestAnimationFrame(() => requestAnimationFrame(placeHint));
  }

  function wire() {
    const scr = $('.scr', host), panel = $('.panel', host), pull = $('.scr__pull', host);
    const openPanel = () => { panel.classList.add('open'); panel.style.setProperty('--pull', 1); panel.setAttribute('aria-hidden', 'false'); if (!mirroring && step < 1) setStep(1); };
    const closePanel = () => { panel.classList.remove('open', 'listing'); panel.style.setProperty('--pull', 0); panel.setAttribute('aria-hidden', 'true'); };
    if (pull) { // swipe down: mouse drag or touch
      let y0 = 0, h = 1, dragging = false;
      pull.addEventListener('pointerdown', (e) => { y0 = e.clientY; h = scr.getBoundingClientRect().height; dragging = true; try { pull.setPointerCapture(e.pointerId); } catch (_) {} panel.classList.add('dragging'); });
      pull.addEventListener('pointermove', (e) => { if (!dragging) return; const k = Math.max(0, Math.min(1, (e.clientY - y0) / (h * 0.4))); panel.style.setProperty('--pull', k); });
      const end = (e) => { if (!dragging) return; dragging = false; panel.classList.remove('dragging'); if ((e.clientY - y0) / (h * 0.4) > 0.25) openPanel(); else closePanel(); };
      pull.addEventListener('pointerup', end); pull.addEventListener('pointercancel', end);
    }
    const opener = $('.scr__open', host); if (opener) opener.addEventListener('click', openPanel);
    panel.addEventListener('click', (e) => { if (e.target === panel) closePanel(); });
    $$('.open-list', host).forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); openPanel(); panel.classList.add('listing');
      if (mirroring) return;
      panel.classList.add('scanning'); setStep(dev.open === 'swipe' ? 2 : 1);
      setTimeout(() => panel.classList.remove('scanning'), reduced ? 0 : 450);
    }));
    const target = $('.dev-target[data-target=wall]', host);
    target.addEventListener('click', () => {
      if (mirroring) return;
      target.classList.add('connecting'); $('em', target).textContent = 'Connecting…';
      setTimeout(() => {
        target.classList.remove('connecting'); target.classList.add('connected'); $('em', target).innerHTML = SVG.check;
        mirroring = true; setStep(dev.steps.length - 1);
        status.textContent = `Mirroring from ${dev.label}`; root.classList.add('is-live');
        wall.show(currentMedia()); $('.scr__live', host).hidden = false; host.classList.add('live');
        setTimeout(closePanel, reduced ? 0 : 650);
      }, reduced ? 0 : 600);
    });
    $('.sheet__stop', host).addEventListener('click', () => stopMirror());
    $('.scr__live', host).addEventListener('click', (e) => { e.stopPropagation(); stopMirror(); });
    // tap the picture for the next one; while mirroring, the wall follows
    $('.scr__media', host).addEventListener('click', () => {
      media[idx].classList.remove('on'); idx = (idx + 1) % media.length; media[idx].classList.add('on');
      if (media[idx].tagName === 'VIDEO') media[idx].play().catch(() => {});
      $$('.scr__dots i', host).forEach((d, j) => d.classList.toggle('on', j === idx));
      $('.scr__cap', host).textContent = media[idx].dataset.cap;
      if (mirroring) wall.swap(currentMedia());
    });
    $('.scr__cap', host).textContent = media[0].dataset.cap;
    host._close = closePanel;
  }
  function stopMirror(silent) {
    mirroring = false; wall.stop(); root.classList.remove('is-live');
    if (host._close) host._close();
    const live = $('.scr__live', host); if (live) live.hidden = true; host.classList.remove('live');
    const t = $('.dev-target[data-target=wall]', host); if (t) { t.classList.remove('connected'); $('em', t).textContent = ''; }
    status.textContent = 'Waiting for a device';
    if (!silent) setStep(0);
  }
  addEventListener('keydown', (e) => { // Win + K on the simulated Windows laptop
    const r = root.getBoundingClientRect();
    if (dev && dev.id === 'windows' && e.metaKey && e.key.toLowerCase() === 'k' && r.top < innerHeight && r.bottom > 0) { e.preventDefault(); $('.taskbar__cast', host).click(); }
  });
  addEventListener('resize', () => placeHint());
  new IntersectionObserver(([e]) => { if (e.isIntersecting) placeHint(); }).observe(host);
  select(0);
  // the wall leans toward the pointer
  const lean = $('.ledpanel', root);
  if (!matchMedia('(hover: none)').matches && !reduced) {
    root.addEventListener('pointermove', (e) => { const r = root.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; lean.style.transform = `perspective(1400px) rotateY(${x * 6}deg) rotateX(${-y * 4}deg)`; });
    root.addEventListener('pointerleave', () => { lean.style.transform = ''; });
  }
  return { select: (id) => select(DEVICES.findIndex((d) => d.id === id)), get mirroring() { return mirroring; }, get wallState() { return wall.state; } };
}
