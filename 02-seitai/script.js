// こもれび整体院（制作サンプル） / produced by IDELO
(function () {
  'use strict';

  // ---- Mobile navigation ----
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('global-nav');
  function closeNav() { toggle.setAttribute('aria-expanded', 'false'); nav.classList.remove('is-open'); }
  toggle.addEventListener('click', function () {
    var open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('is-open', !open);
  });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) closeNav(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNav(); });

  // ---- Reservation form ----
  var CLOSED_DAY = 3; // 水曜定休（0=日曜）
  var WEEKDAY_SLOTS = ['10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
  var WEEKEND_SLOTS = ['10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];

  var form = document.getElementById('reserve-form');
  var dateInput = document.getElementById('date');
  var timeSelect = document.getElementById('time');
  var status = document.getElementById('form-status');
  var submitBtn = document.getElementById('reserve-submit');

  function pad(n) { return String(n).padStart(2, '0'); }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  // 予約可能期間：翌日〜60日後（当日は電話）
  var today = new Date();
  var min = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  var max = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60);
  dateInput.min = toISO(min);
  dateInput.max = toISO(max);

  function setStatus(msg, type) {
    status.textContent = msg;
    status.className = 'form-status' + (type ? ' is-' + type : '');
  }

  function renderSlots() {
    timeSelect.innerHTML = '<option value="">選択してください</option>';
    if (!dateInput.value) return;
    var d = parseISO(dateInput.value);
    if (d.getDay() === CLOSED_DAY) {
      setStatus('水曜日は定休日です。別の日をお選びください。', 'error');
      dateInput.classList.add('is-invalid');
      return;
    }
    dateInput.classList.remove('is-invalid');
    setStatus('');
    var slots = (d.getDay() === 0 || d.getDay() === 6) ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
    slots.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t; opt.textContent = t + '〜';
      timeSelect.appendChild(opt);
    });
  }
  dateInput.addEventListener('change', renderSlots);

  function validate() {
    var firstInvalid = null;
    form.querySelectorAll('[required]').forEach(function (el) {
      var v = el.value.trim();
      var ok = v !== '';
      if (ok && el.type === 'email') ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      if (ok && el.type === 'tel') ok = /^[0-9０-９\-－()（）\s]{10,15}$/.test(v);
      if (ok && el === dateInput) {
        var d = parseISO(v);
        ok = d >= min && d <= max && d.getDay() !== CLOSED_DAY;
      }
      el.classList.toggle('is-invalid', !ok);
      el.setAttribute('aria-invalid', String(!ok));
      if (!ok && !firstInvalid) firstInvalid = el;
    });
    return firstInvalid;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var invalid = validate();
    if (invalid) {
      setStatus('未入力または形式に誤りのある項目があります。', 'error');
      invalid.focus();
      return;
    }

    var endpoint = window.RESERVE_ENDPOINT;
    if (!endpoint) {
      setStatus('ご予約ありがとうございます。※制作サンプルのため、実際には送信されていません。', 'success');
      form.reset(); renderSlots();
      return;
    }

    submitBtn.disabled = true;
    setStatus('送信中です…');
    fetch(endpoint, { method: 'POST', body: new URLSearchParams(new FormData(form)) })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.ok) {
          setStatus('ご予約を受け付けました。確認メールをお送りしましたのでご確認ください。', 'success');
          form.reset(); renderSlots();
        } else {
          setStatus(data.message || '予約を受け付けられませんでした。お電話でお問い合わせください。', 'error');
        }
      })
      .catch(function () {
        setStatus('通信エラーが発生しました。時間をおいて再度お試しいただくか、お電話でご予約ください。', 'error');
      })
      .finally(function () { submitBtn.disabled = false; });
  });
})();
