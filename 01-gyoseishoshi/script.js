// あかり行政書士事務所（制作サンプル） / produced by IDELO
(function () {
  'use strict';

  // ---- Mobile navigation ----
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('global-nav');

  function closeNav() {
    toggle.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
  }

  toggle.addEventListener('click', function () {
    var open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('is-open', !open);
  });

  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) closeNav();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
  });

  // ---- Header shadow on scroll ----
  var header = document.querySelector('.site-header');
  function onScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- Contact form (demo: validates only, sends nothing) ----
  var form = document.getElementById('contact-form');
  var status = document.getElementById('form-status');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var invalid = [];

    form.querySelectorAll('[required]').forEach(function (el) {
      var ok = el.value.trim() !== '' && (el.type !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value));
      el.classList.toggle('is-invalid', !ok);
      el.setAttribute('aria-invalid', String(!ok));
      if (!ok) invalid.push(el);
    });

    if (invalid.length) {
      status.className = 'form-status is-error';
      status.textContent = '未入力または形式に誤りのある項目があります。';
      invalid[0].focus();
      return;
    }

    status.className = 'form-status is-success';
    status.textContent = '送信ありがとうございました。※制作サンプルのため、実際には送信されていません。';
    form.reset();
  });

  // ---- Footer year ----
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
