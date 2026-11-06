// The page's picker: "How far away are your viewers?" Round 2: the real place is shown as a plain video panel
// (a window into the place), not mapped onto a pretend LED wall. Each distance shows its place and its product.
const BX = window.BX;

(function picker() {
  const $ = (id) => document.getElementById(id);
  const RM = BX.reduced;
  // every line below comes from research/facts-2026-10-31.md
  const PRESETS = {
    board: { video: 'v-board', prod: 'Krystl', spec: 'Indoor · 0.4 mm+',
      fact: 'Vinson & Elkins: 16 screens.', label: 'about 3 m' },
    visit: { video: 'v-visit', prod: 'Versa', spec: 'In or out · 2.5 mm+',
      fact: 'Kennedy Space Center: 1.5M visitors a year.', label: 'about 8 m' },
    stadium: { video: 'v-stadium', prod: 'Dura', spec: 'Outdoor · up to 10,000 nits',
      fact: 'Bath Rugby: 7 Dura screens.', label: '40 m and more' },
  };

  // contact panel, opened from the intro card, the picker card and the closing card
  const panel = $('panel'), scrim = $('scrim');
  let opener = null;
  const openPanel = (e) => { opener = e && e.currentTarget; panel.classList.add('open'); scrim.classList.add('on'); panel.setAttribute('aria-hidden', 'false'); $('close').focus(); };
  const closePanel = () => { panel.classList.remove('open'); scrim.classList.remove('on'); panel.setAttribute('aria-hidden', 'true'); (opener || $('talk2')).focus(); };
  const general = (e) => { $('pctx').textContent = 'Tell us about your venue. Every project starts with a free site survey.'; openPanel(e); };
  $('talk0').addEventListener('click', general); $('talk2').addEventListener('click', general);
  $('talk').addEventListener('click', (e) => { $('pctx').textContent = `${PRESETS[chosen].prod}, for viewers ${PRESETS[chosen].label} away. Free site survey first.`; openPanel(e); });
  $('close').addEventListener('click', closePanel); scrim.addEventListener('click', closePanel);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('open')) closePanel(); });

  let chosen = 'board', visible = false;
  const show = () => { for (const k in PRESETS) { const v = $(PRESETS[k].video), on = k === chosen; v.classList.toggle('on', on); if (on && visible && !RM) v.play().catch(() => {}); else v.pause(); } };
  function choose(k) {
    const p = PRESETS[k]; if (!p || k === chosen) return;
    chosen = k;
    document.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
    $('prod').textContent = p.prod; $('spec').textContent = p.spec; $('fact').textContent = p.fact;
    $('pdist').innerHTML = `Viewers at <b>${p.label}</b>`;
    const v = $(p.video); if (v.readyState >= 1 && !RM) v.currentTime = 0;
    show();
  }
  document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => choose(b.dataset.k)));
  // the panel's footage plays only while it is on screen; reduced motion shows its first frame
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; show(); }, { threshold: 0 }).observe($('pbox'));
  window.__picker = { choose, get chosen() { return chosen; } };
})();
