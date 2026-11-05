/* Ace ✳ Mission Studios — shared inquiry form
   Renders the form and delivers it to the leasing inbox.
   Mounted by the Contact overlay in "Ace Mission Flythrough.html" and by "Inquire.html". */
(function (root) {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════
     SETUP — this is the only thing you need to change.

     1. Go to  https://web3forms.com
     2. Type  leasing@aceandmissionstudios.com  into the box and submit.
     3. They email that address an Access Key (a long id like
        "a1b2c3d4-1234-5678-90ab-cdef12345678").
     4. Paste it between the quotes on the accessKey line below.

     No account, no password, no billing. Until the key is filled in, the
     form still works — it falls back to opening the sender's mail app with
     everything pre-filled, so it is never a dead end.
     ═══════════════════════════════════════════════════════════════════ */
  var CONFIG = {
    accessKey: '3d412797-9dac-4a41-a2ce-a2714df06898',
    endpoint: 'https://api.web3forms.com/submit',
    to: 'leasing@aceandmissionstudios.com',
    subject: 'New inquiry — aceandmissionstudios.com'
  };

  var HEARD = ['Referral', 'Google search', 'Instagram', 'Location scout', 'Worked here before', 'Industry event', 'Other'];

  var FIELDS = [
    { k: 'name',    l: 'Name',                  t: 'text',     req: true, big: true, ph: '', msg: 'Please add your name.' },
    { k: 'email',   l: 'Email',                 t: 'email',    req: true, big: true, ph: '', msg: 'Please add an email so we can reply.' },
    { k: 'message', l: 'What are you planning?', t: 'textarea', req: true, big: true, ph: '', msg: 'Please describe the project.' },
    { k: 'dates',   l: 'Dates needed',          t: 'text',     req: false, ph: '' },
    { k: 'crew',    l: 'Crew or headcount',     t: 'text',     req: false, ph: '' },
    { k: 'spaces',  l: 'Space(s) of interest',  t: 'text',     req: false, ph: '' },
    { k: 'company', l: 'Company / production',  t: 'text',     req: false, ph: '' },
    { k: 'phone',   l: 'Phone',                 t: 'tel',      req: false, ph: '' },
    { k: 'heard',   l: 'How did you hear about us', t: 'select', req: false, opts: HEARD }
  ];

  var REQUIRED = FIELDS.filter(function (f) { return f.req; }).map(function (f) { return f.k; });
  var DETAIL_KEYS = ['dates', 'crew', 'spaces', 'company', 'phone', 'heard'];

  var uid = 0;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  function byKey(k) { for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].k === k) return FIELDS[i]; return null; }

  function fieldHTML(f, ns) {
    var id = ns + '-' + f.k, eid = id + '-err';
    var star = f.req ? '<b aria-hidden="true">*</b>' : '';
    var attrs = 'id="' + id + '" name="' + f.k + '" aria-describedby="' + eid + '"' +
      (f.req ? ' aria-required="true"' : '');
    var ctl;
    if (f.t === 'textarea') {
      ctl = '<textarea ' + attrs + ' rows="4" placeholder="' + esc(f.ph || '') + '"></textarea>';
    } else if (f.t === 'select') {
      ctl = '<select ' + attrs + '><option value="">Select One</option>' +
        f.opts.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('') +
        '</select>';
    } else {
      var ac = f.k === 'name' ? 'name' : f.k === 'email' ? 'email' : f.k === 'phone' ? 'tel'
        : f.k === 'company' ? 'organization' : 'off';
      var im = f.k === 'phone' ? ' inputmode="tel"' : f.k === 'email' ? ' inputmode="email"' : '';
      ctl = '<input type="' + f.t + '" ' + attrs + ' autocomplete="' + ac + '"' + im +
        ' placeholder="' + esc(f.ph || '') + '">';
    }
    return '<label class="fld' + (f.big ? ' lg' : '') + '" data-f="' + f.k + '" for="' + id + '">' +
      '<span>' + esc(f.l) + star + '</span>' + ctl +
      '<em class="err" id="' + eid + '" role="alert"></em></label>';
  }

  function formHTML(ns) {
    var one = function (k) { return fieldHTML(byKey(k), ns); };
    return '' +
      '<form class="amsq" novalidate>' +
        '<div class="qrow">' + one('name') + one('email') + '</div>' +
        one('message') +

        '<details class="qmore">' +
          '<summary><span class="qmh">Project Details</span>' +
            '<em class="qreq">Optional</em>' +
            '<i aria-hidden="true"><b></b></i></summary>' +
          '<div class="qmbody">' +
            '<div class="qrow">' + one('dates') + one('crew') + '</div>' +
            one('spaces') +
            '<div class="qrow">' + one('company') + one('phone') + '</div>' +
            one('heard') +
          '</div>' +
        '</details>' +

        '<div class="hp" aria-hidden="true"><label>Leave this empty' +
          '<input type="text" name="botcheck" tabindex="-1" autocomplete="off"></label></div>' +
        '<div class="qmsg" role="status" aria-live="polite"></div>' +
        '<div class="qfoot">' +
          '<button type="submit" class="qsend">Send Inquiry</button>' +
        '</div>' +
      '</form>';
  }

  function collect(form) {
    var d = {};
    FIELDS.forEach(function (f) {
      var el = form.querySelector('[name="' + f.k + '"]');
      d[f.k] = el ? el.value.trim() : '';
    });
    return d;
  }

  function flag(form, key, msg) {
    var l = form.querySelector('[data-f="' + key + '"]');
    if (!l) return;
    l.classList.add('bad');
    l.querySelector('.err').textContent = msg;
    var ctl = l.querySelector('input,textarea,select');
    if (ctl) ctl.setAttribute('aria-invalid', 'true');
  }

  function unflag(l) {
    if (!l || !l.classList.contains('bad')) return;
    l.classList.remove('bad');
    l.querySelector('.err').textContent = '';
    var ctl = l.querySelector('input,textarea,select');
    if (ctl) ctl.removeAttribute('aria-invalid');
  }

  function badEmail(v) { return !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  /* Grow a textarea to fit everything typed. No ceiling — on an inquiry page
     the message is the main event and should never scroll inside itself. */
  function autogrow(el) {
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    var cs = getComputedStyle(el);
    /* scrollHeight excludes the border, but the box is border-box — add it
       back or the field sits a hair short and still scrolls. */
    var border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = (el.scrollHeight + border) + 'px';
    el.style.overflowY = 'hidden';
  }
  function growAll(form) {
    form.querySelectorAll('textarea').forEach(autogrow);
  }

  function checkOne(form, key) {
    var f = byKey(key);
    if (!f || !f.req) return null;
    var d = collect(form);
    if (!d[key]) return f.msg || 'This one is needed.';
    if (key === 'email' && badEmail(d.email)) return 'That email does not look right.';
    return null;
  }

  function validate(form) {
    var first = null;
    REQUIRED.forEach(function (k) {
      var l = form.querySelector('[data-f="' + k + '"]');
      var err = checkOne(form, k);
      if (err) { flag(form, k, err); if (!first) first = l; }
      else unflag(l);
    });
    /* If anything inside the panel is wrong, say so on the panel itself —
       it may be collapsed when they hit send. */
    var det = form.querySelector('details.qmore');
    if (det) {
      var inner = !!det.querySelector('.fld.bad');
      det.classList.toggle('bad', inner);
      if (inner) det.open = true;   // never hide what needs fixing
    }
    return first;
  }

  function plain(d) {
    return FIELDS.map(function (f) { return f.l + ': ' + (d[f.k] || '—'); }).join('\n');
  }

  function mailtoURL(d) {
    return 'mailto:' + CONFIG.to +
      '?subject=' + encodeURIComponent('Inquiry from ' + (d.name || 'the website')) +
      '&body=' + encodeURIComponent(plain(d));
  }

  function succeed(host, d) {
    host.innerHTML = '<div class="amsq-done" tabindex="-1">' +
      '<p>Your message has been sent to the leasing team at Ace&#10035;Mission Studios. ' +
      'We will reply within one business day.</p></div>';
    var box = host.querySelector('.amsq-done');
    if (box) box.focus();
  }

  function mount(host, opts) {
    if (typeof host === 'string') host = document.querySelector(host);
    if (!host) return null;
    opts = opts || {};
    var ns = 'amsq' + (++uid);
    host.innerHTML = formHTML(ns);
    var form = host.querySelector('form');
    var btn = form.querySelector('.qsend');
    var msg = form.querySelector('.qmsg');

    /* Clear a field's error the moment it is corrected — never make someone
       resubmit to find out they fixed it. */
    form.addEventListener('input', function (e) {
      autogrow(e.target);
      var l = e.target.closest('.fld');
      if (l && l.classList.contains('bad') && !checkOne(form, l.dataset.f)) {
        unflag(l);
        var d0 = form.querySelector('details.qmore');
        if (d0) d0.classList.toggle('bad', !!d0.querySelector('.fld.bad'));
      }
    });
    /* Validate a required field on the way out, but only once it has content
       (no scolding someone for tabbing through). */
    form.addEventListener('focusout', function (e) {
      var l = e.target.closest('.fld');
      if (!l || REQUIRED.indexOf(l.dataset.f) < 0) return;
      if (!e.target.value.trim()) return;
      var err = checkOne(form, l.dataset.f);
      if (err) flag(form, l.dataset.f, err); else unflag(l);
    });
    /* A select has no “partly filled” state, so check it as soon as it changes. */
    form.addEventListener('change', function (e) {
      if (e.target.tagName !== 'SELECT') return;
      var l = e.target.closest('.fld');
      if (!l) return;
      var err = checkOne(form, l.dataset.f);
      if (err) flag(form, l.dataset.f, err); else unflag(l);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = collect(form);
      if (form.querySelector('[name="botcheck"]').value) return;   // bot
      msg.classList.remove('on');

      var firstBad = validate(form);
      if (firstBad) {
        var det = firstBad.closest('details');
        if (det) det.open = true;
        var ctl = firstBad.querySelector('input,textarea,select');
        if (ctl) ctl.focus();
        return;
      }

      /* No key yet → hand off to the sender's mail app, fully pre-filled. */
      if (!CONFIG.accessKey) {
        window.location.href = mailtoURL(d);
        msg.innerHTML = 'Opening your mail app with the inquiry filled in — press send there. ' +
          'If nothing opened, email <a href="mailto:' + CONFIG.to + '">' + CONFIG.to + '</a> directly.';
        msg.classList.add('on');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Sending…';

      var payload = {
        access_key: CONFIG.accessKey,
        subject: CONFIG.subject,
        from_name: 'Ace ✳ Mission Studios website',
        replyto: d.email
      };
      FIELDS.forEach(function (f) { payload[f.l] = d[f.k] || '—'; });

      fetch(CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json().catch(function () { return { success: r.ok }; }); })
        .then(function (r) {
          if (r && r.success) { succeed(host, d); return; }
          throw new Error((r && r.message) || 'Send failed');
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = 'Send inquiry';
          msg.innerHTML = 'That did not go through. Please try again, or email ' +
            '<a href="' + mailtoURL(d) + '">' + CONFIG.to + '</a> directly — ' +
            'your answers are already filled in on that link.';
          msg.classList.add('on');
        });
    });

    if (opts.prefill) prefill(form, opts.prefill);
    growAll(form);
    /* The optional block starts collapsed, so anything inside it has no size
       until it opens — measure again at that moment. */
    var det = form.querySelector('details.qmore');
    if (det) det.addEventListener('toggle', function () { if (det.open) growAll(form); });
    return form;
  }

  /* Fill fields from an object keyed the same as FIELDS; never clobbers typing. */
  function prefill(form, data) {
    if (typeof form === 'string') form = document.querySelector(form);
    if (!form) return;
    var touched = false;
    Object.keys(data || {}).forEach(function (k) {
      var el = form.querySelector('[name="' + k + '"]');
      if (el && !el.value) { el.value = data[k]; touched = true; }
    });
    /* If we filled anything inside the optional block, open it so the person
       can see what we put there. */
    if (touched) {
      var det = form.querySelector('details.qmore');
      if (det && Object.keys(data).some(function (k) { return DETAIL_KEYS.indexOf(k) >= 0; })) det.open = true;
      growAll(form);
    }
  }

  /* Turn a Rates-estimator snapshot into prefill values.
     Only fills the factual fields — never writes the message for them. */
  function fromEstimate(s) {
    if (!s) return null;
    var picks = (s.spaces || []).concat(s.lots || []);
    if (!picks.length) return null;
    var title = function (n) {
      return String(n).toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
    };
    var out = { spaces: picks.map(title).join(', ') };
    var days = [];
    if (s.shoot) days.push(s.shoot + ' shoot or event');
    if (s.prep) days.push(s.prep + ' setup and takedown');
    if (days.length) out.dates = days.join(', ') + ' — dates TBC';
    return out;
  }

  root.AMSInquiry = {
    config: CONFIG,
    mount: mount,
    prefill: prefill,
    fromEstimate: fromEstimate,
    isConnected: function () { return !!CONFIG.accessKey; }
  };
})(window);
