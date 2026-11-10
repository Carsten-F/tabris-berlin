/* Tabris – site behaviour. Vanilla JS, no dependencies, CSP-safe (no eval, no inline code). */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----- Header state, scroll progress, hero parallax ----- */
  var header = doc.querySelector('.site-header');
  var frame = doc.querySelector('.hero__frame');
  var ticking = false;

  function onScroll() {
    if (ticking) { return; }
    ticking = true;
    window.requestAnimationFrame(function () {
      var y = window.scrollY || 0;
      var max = root.scrollHeight - window.innerHeight;
      root.style.setProperty('--progress', max > 0 ? Math.min(1, y / max).toFixed(4) : '0');
      if (header) { header.classList.toggle('is-scrolled', y > 8); }
      if (y < 120) {
        doc.querySelectorAll('.nav a.is-active').forEach(function (a) { a.classList.remove('is-active'); });
      }
      if (frame && !reduceMotion && y < window.innerHeight * 1.2) {
        frame.style.setProperty('--parallax', (y * 0.08).toFixed(1) + 'px');
      }
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  /* ----- Mobile navigation ----- */
  var toggle = doc.querySelector('.nav-toggle');
  var nav = doc.getElementById('nav');
  function closeNav() {
    if (!toggle || !nav) { return; }
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) { closeNav(); }
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { closeNav(); toggle.focus(); }
    });
  }

  /* ----- Reveal on scroll + active nav link ----- */
  var revealEls = doc.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) {
      var delay = parseInt(el.getAttribute('data-delay') || '0', 10);
      if (delay > 0 && delay <= 2000) { el.style.setProperty('--delay', delay + 'ms'); }
      revealObserver.observe(el);
    });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  var navLinks = doc.querySelectorAll('.nav a[href*="#"]');
  if ('IntersectionObserver' in window && navLinks.length) {
    var byId = {};
    navLinks.forEach(function (a) {
      var id = a.getAttribute('href').split('#')[1];
      if (id && doc.getElementById(id)) { byId[id] = a; }
    });
    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = byId[entry.target.id];
        if (!link || !entry.isIntersecting) { return; }
        navLinks.forEach(function (a) { a.classList.remove('is-active'); });
        link.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach(function (id) { navObserver.observe(doc.getElementById(id)); });
  }

  /* ----- Count-up for key figures ----- */
  var counters = doc.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window && !reduceMotion) {
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        var el = entry.target;
        var target = parseInt(el.getAttribute('data-count'), 10);
        countObserver.unobserve(el);
        if (!isFinite(target) || target <= 0 || target > 100000) { return; }
        var start = null;
        var duration = 1200;
        function step(ts) {
          if (start === null) { start = ts; }
          var p = Math.min(1, (ts - start) / duration);
          el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
          if (p < 1) { window.requestAnimationFrame(step); }
        }
        el.textContent = '0';
        window.requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { countObserver.observe(el); });
  }

  /* ----- Pointer glow on brand cards ----- */
  if (window.matchMedia('(hover: hover)').matches) {
    doc.querySelectorAll('.brand-card').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
      });
    });
  }

  /* ----- Contact form ----- */
  var form = doc.getElementById('contact-form');
  if (!form || !window.fetch) { return; }

  var endpoint = form.getAttribute('action');
  var status = doc.getElementById('form-status');
  var submit = form.querySelector('button[type="submit"]');
  var tokenPromise = null;

  function msg(key) { return form.getAttribute('data-msg-' + key) || ''; }

  function setStatus(kind, text) {
    status.className = 'form__status' + (kind ? ' is-' + kind : '');
    status.textContent = text; /* textContent only – never innerHTML */
  }

  function fetchToken() {
    return fetch(endpoint, { method: 'GET', headers: { 'Accept': 'application/json' }, credentials: 'omit', cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('token')); })
      .then(function (data) { return typeof data.token === 'string' ? data.token : Promise.reject(new Error('token')); });
  }
  function ensureToken() {
    if (!tokenPromise) {
      tokenPromise = fetchToken().catch(function (err) { tokenPromise = null; throw err; });
    }
    return tokenPromise;
  }
  /* Request the anti-spam token only once the visitor starts using the form. */
  form.addEventListener('focusin', function () { ensureToken().catch(function () {}); }, { once: true });

  function clearErrors() {
    form.querySelectorAll('[aria-invalid="true"]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    form.querySelectorAll('.field__error').forEach(function (el) { el.textContent = ''; });
  }
  function showFieldErrors(fields) {
    var first = null;
    fields.forEach(function (name) {
      var input = form.elements.namedItem(name);
      if (!input || !input.setAttribute) { return; }
      input.setAttribute('aria-invalid', 'true');
      var err = doc.getElementById(input.id + '-error');
      if (err) { err.textContent = msg('invalid'); }
      if (!first) { first = input; }
    });
    if (first) { first.focus(); }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    if (!form.checkValidity()) {
      var invalid = [];
      Array.prototype.forEach.call(form.elements, function (el) {
        if (el.name && el.willValidate && !el.validity.valid) { invalid.push(el.name); }
      });
      showFieldErrors(invalid);
      setStatus('error', msg('invalid'));
      return;
    }

    var value = function (name) { return (form.elements.namedItem(name).value || '').trim(); };
    submit.disabled = true;
    setStatus('', msg('sending'));

    ensureToken().then(function (token) {
      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'omit',
        cache: 'no-store',
        body: JSON.stringify({
          name: value('name'),
          company: value('company'),
          email: value('email'),
          topic: value('topic'),
          message: value('message'),
          website: form.elements.namedItem('website').value || '',
          lang: root.lang === 'de' ? 'de' : 'en',
          token: token
        })
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data }; });
    }).then(function (r) {
      tokenPromise = null; /* tokens are single-use */
      if (r.status === 200 && r.data.ok === true) {
        form.reset();
        setStatus('ok', msg('ok'));
      } else if (r.status === 422 && Array.isArray(r.data.fields)) {
        showFieldErrors(r.data.fields.filter(function (f) { return typeof f === 'string'; }));
        setStatus('error', msg('invalid'));
      } else if (r.status === 429) {
        setStatus('error', msg('rate'));
      } else {
        setStatus('error', msg('error'));
      }
    }).catch(function () {
      tokenPromise = null;
      setStatus('error', msg('error'));
    }).then(function () {
      submit.disabled = false;
    });
  });
})();
