/* app.js — Selenyx Mini App, Telegram Web App SDK */
'use strict';

// ─── Telegram SDK ─────────────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp || {
  ready() {},
  expand() {},
  close() {},
  HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
  BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
  showPopup(_p, cb) { cb && cb('ok'); },
  colorScheme: 'light',
  themeParams: {},
  initDataUnsafe: { user: null },
};

tg.ready();
tg.expand();

// iOS: пересчитывать высоту при появлении клавиатуры
tg.onEvent?.('viewportChanged', ({ isStateStable }) => {
  if (isStateStable) {
    const h = tg.viewportStableHeight;
    if (h) document.getElementById('app').style.height = h + 'px';
  }
});

// Глобальный перехватчик ошибок
window.onerror = (msg, _src, _line, _col, err) => {
  console.error(msg, err);
  // Пользователю показываем дружелюбное сообщение без технических деталей
  showToast('Что-то пошло не так. Попробуй обновить страницу.');
  return true; // предотвращает показ браузерного диалога
};

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme() {
  const dark = tg.colorScheme === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#212121' : '#f4f4f8';
}
applyTheme();
tg.onEvent?.('themeChanged', applyTheme);

// ─── sessionStorage with date key ─────────────────────────────────────────────
const _V = 'v2'; // увеличить при изменении структуры данных
function _dk(k) { return k + '_' + _V + '_' + new Date().toLocaleDateString('ru-RU'); }
function ssGet(k) { try { const v = sessionStorage.getItem(_dk(k)); return v ? JSON.parse(v) : null; } catch { return null; } }
function ssSet(k, v) { try { sessionStorage.setItem(_dk(k), JSON.stringify(v)); } catch {} }

// ─── State ────────────────────────────────────────────────────────────────────
let currentTab = 'today';
let userSign   = null;
let userBirth  = null; // {date, time} or null
let onboarded  = false;
let moonCache  = null;
let todayCache = null;
let calYear    = new Date().getFullYear();
let calMonth   = new Date().getMonth(); // 0-based
let _calDaySheetDate = null; // дата открытой шторки
const _params = new URLSearchParams(window.location.search);
const _autoKnowledge = _params.get('page') === 'knowledge';
// ?new=1 — сбросить данные пользователя (для тестирования флоу нового пользователя)
if (_params.get('new') === '1') {
  ['userSign','userEmail','userBirth','streakDate','streakCount','retentionShown','natalNotifySet'].forEach(k => localStorage.removeItem(k));
  sessionStorage.clear();
  history.replaceState(null, '', window.location.pathname);
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
function show(id) { const el = $(id); if (el) el.classList.remove('hidden'); }
function hide(id) { const el = $(id); if (el) el.classList.add('hidden'); }
function setText(id, text) { const el = $(id); if (el) el.textContent = text; }
function setHTML(id, html) { const el = $(id); if (el) el.innerHTML = html; }

function showToast(msg, color) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  if (color) t.style.background = color;
  document.body.appendChild(t);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => t.classList.add('visible'));
  });
  setTimeout(() => {
    t.classList.remove('visible');
    setTimeout(() => t.remove(), 300);
  }, 2500);
}

// ─── Screen navigation ────────────────────────────────────────────────────────
const screens = ['splash', 'onboarding', 'email', 'main'];

function showScreen(id) {
  screens.forEach(s => {
    const el = $(s + '-screen');
    if (el) el.classList.toggle('hidden', s !== id);
  });
}

// ─── Splash ───────────────────────────────────────────────────────────────────
function initSplash() {
  showScreen('splash');

  let advanced = false;
  function advance() {
    if (advanced) return;
    advanced = true;
    const loadSign = (cb) => {
      if (tg.CloudStorage) {
        tg.CloudStorage.getItem('userSign', (_err, val) => cb(val || localStorage.getItem('userSign')));
      } else {
        cb(localStorage.getItem('userSign'));
      }
    };
    loadSign(saved => {
      if (saved) {
        userSign  = saved;
        onboarded = true;
        const savedBirth = localStorage.getItem('userBirth');
        if (savedBirth) { try { userBirth = JSON.parse(savedBirth); } catch {} }
        if (!localStorage.getItem('userEmail')) {
          showScreen('email');
          initEmailScreen();
        } else {
          showScreen('main');
          initMain();
        }
      } else {
        showScreen('onboarding');
        initOnboarding();
      }
    });
  }

  // Авто-переход через 1.2с
  setTimeout(advance, 1200);
  // Тап по сплэшу — переход сразу
  $('splash-screen')?.addEventListener('click', advance, { once: true });
}

// ─── Onboarding ───────────────────────────────────────────────────────────────
let obSlide = 0;
const OB_COUNT = 3;

function initOnboarding() {
  obSlide = 0;
  showObSlide(0);

  // Sign buttons
  document.querySelectorAll('.sign-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sign-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      userSign = btn.dataset.sign;
      tg.HapticFeedback.impactOccurred('light');
    });
  });

  $('ob-next')?.addEventListener('click', nextObSlide);
  $('ob-start')?.addEventListener('click', finishOnboarding);
  $('ob-skip')?.addEventListener('click', () => {
    showObSlide(OB_COUNT - 1);
    obSlide = OB_COUNT - 1;
    tg.HapticFeedback.impactOccurred('light');
  });
}

function showObSlide(idx) {
  for (let i = 0; i < OB_COUNT; i++) {
    const el = $(`ob-slide-${i}`);
    if (el) el.classList.toggle('hidden', i !== idx);
  }
  document.querySelectorAll('.ob-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
  const nextBtn  = $('ob-next');
  const startBtn = $('ob-start');
  const skipBtn  = $('ob-skip');
  if (nextBtn)  nextBtn.classList.toggle('hidden', idx === OB_COUNT - 1);
  if (startBtn) startBtn.classList.toggle('hidden', idx !== OB_COUNT - 1);
  if (skipBtn)  skipBtn.classList.toggle('hidden', idx === OB_COUNT - 1);
}

function nextObSlide() {
  if (obSlide < OB_COUNT - 1) {
    obSlide++;
    showObSlide(obSlide);
    tg.HapticFeedback.impactOccurred('light');
  }
}

function finishOnboarding() {
  if (!userSign) {
    showToast('Выбери свой знак зодиака', '#e74c3c');
    tg.HapticFeedback.notificationOccurred('error');
    return;
  }
  localStorage.setItem('userSign', userSign);
  // Также сохраняем в CloudStorage (если доступен)
  tg.CloudStorage?.setItem('userSign', userSign, () => {});
  onboarded = true;
  tg.HapticFeedback.notificationOccurred('success');
  tg.showPopup({ message: 'Знак сохранён ✓\nПочти готово!', buttons: [{ id: 'ok', type: 'ok' }] }, () => {
    if (!localStorage.getItem('userEmail')) {
      showScreen('email');
      initEmailScreen();
    } else {
      showScreen('main');
      initMain();
    }
  });
}

// ─── Email Gate ───────────────────────────────────────────────────────────────
const _EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initEmailScreen() {
  const input  = $('email-input');
  const submit = $('email-submit');
  const error  = $('email-error');
  if (!input || !submit) return;

  // Очистить предыдущее состояние
  input.value = '';
  error.classList.add('hidden');

  input.focus();

  // Скрыть ошибку при вводе
  input.addEventListener('input', () => error.classList.add('hidden'));

  // Enter → submit
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit.click(); });

  submit.addEventListener('click', () => {
    const val = input.value.trim();
    if (!_EMAIL_RE.test(val)) {
      error.classList.remove('hidden');
      tg.HapticFeedback.notificationOccurred('error');
      return;
    }
    localStorage.setItem('userEmail', val);
    tg.HapticFeedback.notificationOccurred('success');
    showScreen('main');
    initMain();
  });

  $('email-skip')?.addEventListener('click', () => {
    localStorage.setItem('userEmail', 'skipped');
    showScreen('main');
    initMain();
  }, { once: true });
}

// ─── Bot CTA banner ───────────────────────────────────────────────────────────
function initBotCta() {
  if (localStorage.getItem('botCtaDismissed')) return;
  const banner = $('bot-cta');
  if (!banner) return;
  banner.classList.remove('hidden');

  $('bot-cta-connect')?.addEventListener('click', () => {
    localStorage.setItem('botCtaDismissed', '1');
    banner.classList.add('hidden');
  });
  $('bot-cta-close')?.addEventListener('click', () => {
    localStorage.setItem('botCtaDismissed', '1');
    banner.classList.add('hidden');
    tg.HapticFeedback.impactOccurred('light');
  });
}

// ─── Streak tracker ───────────────────────────────────────────────────────────
function calcStreak() {
  const today = new Date().toISOString().slice(0, 10);
  const last  = localStorage.getItem('streakDate');
  let streak  = parseInt(localStorage.getItem('streakCount') || '0', 10);

  if (last === today) {
    // уже открывали сегодня — ничего не меняем
  } else {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    streak = (last === yesterday) ? streak + 1 : 1;
    localStorage.setItem('streakCount', streak);
    localStorage.setItem('streakDate', today);
  }

  const badge = $('streak-badge');
  if (badge && streak >= 2) {
    badge.textContent = `🔥 ${streak}`;
    badge.classList.remove('hidden');
  }

  // Еженедельный итог: каждые 7 дней, только один раз за milestone
  if (streak >= 7 && streak % 7 === 0 && !localStorage.getItem(`weeklyShown_${streak}`)) {
    _pendingWeeklySummary = streak;
  }
}

// ─── Main / Tabs ──────────────────────────────────────────────────────────────
function initMain() {
  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === currentTab) return;
      switchTab(tab);
    });
  });
  calcStreak();
  switchTab('today');
  $('kb-entry-btn')?.addEventListener('click', () => {
    tg.HapticFeedback.impactOccurred('light');
    openKnowledge();
  });
  if (_autoKnowledge) openKnowledge();
}

function switchTab(tab) {
  currentTab = tab;
  tg.HapticFeedback.impactOccurred('light');

  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab)
  );
  document.querySelectorAll('.tab-pane').forEach(pane =>
    pane.classList.toggle('hidden', pane.dataset.tab !== tab)
  );

  switch (tab) {
    case 'today':  renderToday();    break;
    case 'moon':   renderMoon();     break;
    case 'cal':    renderCalendar(); break;
    case 'oracle': renderOracle();   break;
  }
}

// ─── Today tab ────────────────────────────────────────────────────────────────
function renderToday() {
  const cached = ssGet('td');
  if (cached) {
    applyTodayData(cached);
    return;
  }
  const moon = calcMoonData();
  const sign = userSign || 'aries';
  const dayNum = calcDayNumber(new Date());
  const color  = getTodayColor();

  const phase  = moon.phase;
  const phaseTips = PHASE_TIPS[phase] || {};
  const domains   = DOMAINS[sign] || {};
  const weekday = new Date().getDay(); // 0=вс
  const hint = WEEKDAY_HINTS[weekday] || '';

  const data = { moon, sign, dayNum, color, phaseTips, domains, hint };
  ssSet('td', data);
  applyTodayData(data);
}

let currentDomain = 'health';
let _todayInited = false; // guard против дублирования listeners
let _pendingWeeklySummary = 0; // streak milestone для weekly overlay

function applyTodayData(data) {
  const { moon, dayNum, color, phaseTips, domains, hint } = data;

  // Today's date + moon inline
  const now = new Date();
  const dayNames = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const monthNames = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  setText('today-date', `${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]}`);
  const deg = moon.moonLon != null ? ` ${Math.floor(moon.moonLon % 30)}°` : '';
  setText('today-moon-inline', `${moon.emoji} ${moon.phaseName} · Луна в ${moon.signRu}${deg}`);

  // Domain card previews
  document.querySelectorAll('.domain-card').forEach(card => {
    const domain = card.dataset.domain;
    const preview = card.querySelector('.domain-card-preview');
    if (preview) {
      const text = domains[domain] || '';
      preview.textContent = text.length > 72 ? text.slice(0, 72) + '…' : text;
    }
  });

  // Retrograde planets
  const retros = getTodayRetrogrades();
  const retroEl = $('today-retro');
  if (retroEl) {
    if (retros.length > 0) {
      retroEl.classList.remove('hidden');
      retroEl.innerHTML = `<p class="retro-card-title">↩️ Ретроград</p>` +
        retros.map(r =>
          `<div class="retro-item">
            <span class="retro-planet">${r.emoji} ${r.name}</span>
            <span class="retro-hint">${r.hint}</span>
          </div>`
        ).join('');
    } else {
      retroEl.classList.add('hidden');
    }
  }

  // Color card — название цветом дня
  setHTML('today-color', `<span style="display:inline-block;width:14px;height:14px;background:${color.hex};border-radius:50%;margin-right:6px;vertical-align:middle;flex-shrink:0"></span><span style="color:${color.hex};font-weight:600">${color.name}</span><span style="color:var(--text-hint);font-size:12px;margin-left:5px">· ${color.planet}</span>`);

  // Day number
  setText('today-daynum', dayNum);
  setText('today-daynum-hint', NUMEROLOGY[dayNum]?.name || '');

  // Weekday hint
  setText('today-hint', hint);

  // Phase tip
  setText('today-good', phaseTips.good || '');
  setText('today-avoid', phaseTips.avoid || '');

  // Практика лунного дня
  const ld = LUNAR_DAYS[moon.lunarDay] || {};
  setText('today-practice-day', `${ld.symbol || '🌙'} ${moon.lunarDay}-й лунный день · ${ld.name || ''}`);
  setText('today-practice-text', ld.hint || '');

  // Listeners добавляются только один раз
  if (_todayInited) return;
  _todayInited = true;

  // Еженедельный итог (показываем после рендера, 1.5с)
  if (_pendingWeeklySummary) {
    const s = _pendingWeeklySummary;
    _pendingWeeklySummary = 0;
    setTimeout(() => showWeeklySummary(s, moon), 1500);
  }

  // Color card → sheet
  const colorCard = $('today-color')?.closest('.mini-card');
  const numCard   = $('today-daynum')?.closest('.mini-card');

  if (colorCard) {
    colorCard.style.cursor = 'pointer';
    colorCard.addEventListener('click', () => {
      tg.HapticFeedback.impactOccurred('medium');
      openSheet({
        icon: `<span style="display:inline-block;width:40px;height:40px;background:${color.hex};border-radius:50%"></span>`,
        title: color.name,
        text: color.hint,
        sections: [{ label: '🪐 Планета дня', sub: color.planet }],
      });
    });
  }

  // Day number card → sheet
  if (numCard) {
    numCard.style.cursor = 'pointer';
    numCard.addEventListener('click', () => {
      tg.HapticFeedback.impactOccurred('medium');
      const num = NUMEROLOGY[dayNum];
      openSheet({
        icon: `<span style="font-family:var(--font-display);font-size:48px;font-weight:600;color:var(--gold)">${dayNum}</span>`,
        title: num?.name || `Число ${dayNum}`,
        text: num?.hint || '',
        sections: [],
      });
    });
  }

  // Domain accordion — inline expandable cards
  document.querySelectorAll('.domain-card').forEach(card => {
    const header = card.querySelector('.domain-card-header');
    header.addEventListener('click', () => {
      const domain = card.dataset.domain;
      const isOpen = card.classList.contains('open');

      // Закрыть все
      document.querySelectorAll('.domain-card').forEach(c => {
        c.classList.remove('open');
        c.querySelector('.domain-card-header').setAttribute('aria-expanded', 'false');
        c.querySelector('.domain-card-body').hidden = true;
      });

      // Открыть текущий если был закрыт
      if (!isOpen) {
        tg.HapticFeedback.impactOccurred('light');
        card.classList.add('open');
        header.setAttribute('aria-expanded', 'true');
        const body = card.querySelector('.domain-card-body');
        body.hidden = false;
        if (!body.dataset.rendered) {
          body.innerHTML = `<p class="domain-card-text">${domains[domain] || ''}</p>`;
          wrapTerms(body);
          body.dataset.rendered = '1';
        }
        setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
      }
    });
  });

  // Share button — энергия дня
  $('today-share')?.addEventListener('click', () => {
    const text =`${moon.emoji} Луна в ${moon.signRu} · ${moon.lunarDay}-й лунный день · ${moon.phaseName}\n«${phaseTips.good || ''}»\n✨ Selenyx — личный навигатор`;
    tg.HapticFeedback.impactOccurred('light');
    if (tg.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=https://t.me/Selenyx_mybot&text=${encodeURIComponent(text)}`);
    } else {
      navigator.share?.({ text }) || navigator.clipboard?.writeText(text).then(() => showToast('Скопировано ✓'));
    }
  });

  // Natal teaser — «Уведомить меня»
  const natalBtn = $('natal-notify-btn');
  if (natalBtn) {
    const notified = localStorage.getItem('natalNotifySet');
    if (notified) {
      natalBtn.textContent = 'Буду ✓';
      natalBtn.disabled = true;
    }
    natalBtn.addEventListener('click', () => {
      localStorage.setItem('natalNotifySet', '1');
      natalBtn.textContent = 'Буду ✓';
      natalBtn.disabled = true;
      tg.HapticFeedback.notificationOccurred('success');
      showToast('Уведомим, когда появится 🌟');
    }, { once: true });
  }

  // Retention hook: показать через 3с при первом визите (если уведомления не включены)
  if (!localStorage.getItem('retentionShown') && !localStorage.getItem('notifyTime')) {
    setTimeout(showRetentionBanner, 3000);
  }
}

function showWeeklySummary(streak, moon) {
  localStorage.setItem(`weeklyShown_${streak}`, '1');
  const ld = LUNAR_DAYS[moon.lunarDay] || {};
  setText('weekly-title', `${streak} дней подряд!`);
  setHTML('weekly-stats', `
    <div class="weekly-stat">
      <span class="ws-icon">${moon.emoji}</span>
      <span class="ws-label">${moon.phaseName}</span>
    </div>
    <div class="weekly-stat">
      <span class="ws-icon">${ld.symbol || '🌙'}</span>
      <span class="ws-label">${moon.lunarDay}-й лунный день</span>
    </div>
    <div class="weekly-stat">
      <span class="ws-icon">🔥</span>
      <span class="ws-label">${streak} дней подряд</span>
    </div>
  `);
  const overlay = $('weekly-overlay');
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('visible')));
  tg.HapticFeedback.notificationOccurred('success');
  $('weekly-close')?.addEventListener('click', () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 300);
  }, { once: true });
}

function showRetentionBanner() {
  const banner = $('retention-banner');
  if (!banner) return;
  banner.classList.remove('hidden');
  localStorage.setItem('retentionShown', '1');
  $('retention-btn')?.addEventListener('click', () => {
    banner.classList.add('hidden');
    openSettings();
  });
  $('retention-close')?.addEventListener('click', () => banner.classList.add('hidden'));
}

const DOMAIN_META = {
  health: { label: 'Здоровье',  icon: '🏥' },
  work:   { label: 'Работа',    icon: '💼' },
  love:   { label: 'Отношения', icon: '❤️' },
  psych:  { label: 'Психология', icon: '🧠' },
};

// { icon: html|text, title, text, sections: [{label, sub, muted?}] }
function openSheet({ icon, title, text, sections }) {
  setHTML('sheet-domain-icon',  icon);
  setText('sheet-domain-title', title);
  setText('sheet-domain-text',  text);

  // Динамические секции
  const body = $('sheet-sections');
  if (body) {
    body.innerHTML = (sections || [])
      .filter(s => s.sub)
      .map(s => `
        <div class="sheet-section">
          <p class="sheet-label${s.muted ? ' muted' : ''}">${s.label}</p>
          <p class="sheet-sub${s.muted ? ' muted' : ''}">${s.sub}</p>
        </div>`)
      .join('');
  }

  // Wrap astrology terms for tooltip
  wrapTerms(document.querySelector('.domain-sheet-body'));

  const sheet = $('domain-sheet');
  sheet.classList.remove('hidden');
  requestAnimationFrame(() => sheet.classList.add('open'));

  tg.BackButton.show();
  const close = () => closeSheet();
  tg.BackButton.onClick(close);
  $('domain-sheet-close')?.addEventListener('click', close, { once: true });
  $('domain-sheet-backdrop')?.addEventListener('click', close, { once: true });
}

function closeSheet() {
  const sheet = $('domain-sheet');
  sheet.classList.remove('open');
  tg.BackButton.hide();
  setTimeout(() => sheet.classList.add('hidden'), 350);
}

// ─── Moon tab ─────────────────────────────────────────────────────────────────
function renderMoon() {
  const cached = ssGet('md');
  if (cached) { applyMoonData(cached); return; }

  const moon = calcMoonData();
  ssSet('md', moon);
  applyMoonData(moon);
}

function applyMoonData(moon) {
  setText('moon-phase-name', moon.phaseName);
  setText('moon-phase-emoji', moon.emoji);
  const deg = moon.moonLon != null ? ` · ${Math.floor(moon.moonLon % 30)}° ${moon.signRu.slice(0,3)}.` : '';
  setText('moon-sign-name', `Луна в ${moon.signRu}${deg}`);

  const energyText = MOON_SIGN_ENERGY[moon.sign] || '';
  setText('moon-energy-text', energyText);

  // Tile row: фаза + освещённость
  setHTML('moon-tile-row', `
    <div class="tile">
      <span class="tile-icon">${moon.emoji}</span>
      <span class="tile-label">${moon.phaseName}</span>
    </div>
    <div class="tile">
      <span class="tile-icon">✨</span>
      <span class="tile-label">${moon.illumination}% света</span>
    </div>
  `);

  // Арка лунного цикла
  setHTML('moon-cycle-arc', _buildCycleArc(moon.lunarDay, moon.angle));

  // Lunar day info
  const ld = LUNAR_DAYS[moon.lunarDay] || {};
  setHTML('moon-lunar-info', `
    <p><b>${ld.symbol || '🌙'} ${moon.lunarDay} лунный день</b></p>
    <p>${ld.energy || ''}</p>
    <p class="muted">${ld.practice || ''}</p>
  `);

  // Wrap astrology terms
  wrapTerms($('moon-energy-text'));
  wrapTerms($('moon-lunar-info'));
}

/** Строит SVG-арку лунного цикла (1–30 дней, угол 0–360°) */
function _buildCycleArc(lunarDay, angle) {
  const r = 54, cx = 70, cy = 70, stroke = 5;
  const total = 360;
  const circ  = 2 * Math.PI * r;
  // Угол 0° = новолуние (верхушка), по часовой
  const pct   = (angle != null ? angle : ((lunarDay - 1) / 29.53) * 360) / total;
  const arcLen = pct * circ;
  const dash   = `${arcLen.toFixed(1)} ${(circ - arcLen).toFixed(1)}`;
  // Точка положения луны на окружности
  const rad    = (angle != null ? angle : pct * 360) * Math.PI / 180 - Math.PI / 2;
  const dotX   = (cx + r * Math.cos(rad)).toFixed(1);
  const dotY   = (cy + r * Math.sin(rad)).toFixed(1);
  // Метки новолуния (верх) и полнолуния (низ)
  return `<svg class="cycle-arc" viewBox="0 0 140 140" aria-label="Лунный цикл: день ${lunarDay} из 29">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg3)" stroke-width="${stroke}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="var(--gold)" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${dash}" stroke-dashoffset="${(circ * 0.25).toFixed(1)}"
      transform="rotate(-90 ${cx} ${cy})"/>
    <circle cx="${dotX}" cy="${dotY}" r="7" fill="var(--gold)" opacity="0.9"/>
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" class="arc-day-num">${lunarDay}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="arc-day-sub">лунный день</text>
    <text x="${cx}" y="10" text-anchor="middle" class="arc-label">🌑</text>
    <text x="${cx}" y="136" text-anchor="middle" class="arc-label">🌕</text>
  </svg>`;
}

// ─── Chart tab ────────────────────────────────────────────────────────────────
function renderChart() {
  const birth = userBirth;

  if (!birth) {
    show('chart-form');
    hide('chart-result');
    initChartForm();
    return;
  }

  hide('chart-form');
  show('chart-result');

  const natal = calcNatalChart(birth.date, birth.time);
  if (!natal) return;

  const nSun  = SIGNS.find(s => s.id === natal.sun)  || {};
  const nMoon = SIGNS.find(s => s.id === natal.moon) || {};
  const nAsc  = SIGNS.find(s => s.id === natal.asc)  || {};

  setHTML('chart-sun',  `<span class="sign-emoji">${nSun.emoji  || ''}</span> Солнце в ${nSun.ru  || natal.sun}`);
  setHTML('chart-moon', `<span class="sign-emoji">${nMoon.emoji || ''}</span> Луна в ${nMoon.ru || natal.moon}`);
  setHTML('chart-asc',  `<span class="sign-emoji">${nAsc.emoji  || ''}</span> Асцендент в ${nAsc.ru || natal.asc}`);

  setText('chart-sun-desc',  nSun.dates  || '');
  setText('chart-moon-desc', nMoon.dates || '');
  setText('chart-asc-desc',  nAsc.dates  || '');
}

function initChartForm() {
  const form = $('chart-form');
  if (!form || form.dataset.init) return;
  form.dataset.init = '1';

  const dateInput = $('birth-date');
  const timeInput = $('birth-time');
  const submitBtn = $('chart-submit');

  // Auto-format date ДД.ММ.ГГГГ
  dateInput?.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 2) v = v.slice(0, 2) + '.' + v.slice(2);
    if (v.length > 5) v = v.slice(0, 5) + '.' + v.slice(5);
    if (v.length > 10) v = v.slice(0, 10);
    e.target.value = v;
  });

  // Auto-format time ЧЧ:ММ
  timeInput?.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 2) v = v.slice(0, 2) + ':' + v.slice(2);
    if (v.length > 5) v = v.slice(0, 5);
    e.target.value = v;
  });

  submitBtn?.addEventListener('click', () => {
    const d = dateInput?.value || '';
    const t = timeInput?.value || '12:00';
    if (!d.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
      showToast('Введи дату в формате ДД.ММ.ГГГГ', '#e74c3c');
      return;
    }
    userBirth = { date: d, time: t };
    localStorage.setItem('userBirth', JSON.stringify(userBirth));
    tg.HapticFeedback.notificationOccurred('success');
    showToast('Карта сохранена ✓', '#27ae60');
    renderChart();
  });
}

// ─── Compat tab ───────────────────────────────────────────────────────────────
let compatTarget = null;

function renderCompat() {
  // Render sign grid
  const grid = $('compat-sign-grid');
  if (grid && !grid.dataset.init) {
    grid.dataset.init = '1';
    grid.innerHTML = SIGNS.map(s =>
      `<button class="compat-sign-btn" data-sign="${s.id}" aria-label="${s.ru}">
        <span class="sign-emoji">${s.emoji}</span>
        <span class="sign-name-short">${s.ru}</span>
      </button>`
    ).join('');
    grid.querySelectorAll('.compat-sign-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.compat-sign-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        compatTarget = btn.dataset.sign;
        showCompatResult(compatTarget);
        tg.HapticFeedback.impactOccurred('medium');
      });
    });
  }

  // Show result if target already selected
  if (compatTarget) showCompatResult(compatTarget);
  else hide('compat-result');
}

function showCompatResult(target) {
  const mySign = userSign || 'aries';
  const result = getCompatibility(mySign, target);
  show('compat-result');

  const myS = SIGNS.find(s => s.id === mySign);
  const tgS = SIGNS.find(s => s.id === target);

  setText('compat-pair', `${myS?.emoji || '✨'} ${myS?.ru || ''} + ${tgS?.emoji || '✨'} ${tgS?.ru || ''}`);
  setText('compat-rating', result.rating);
  setText('compat-title', result.title);
  setText('compat-text', result.text);

  // Stars
  const stars = Math.round(result.rating / 20);
  setText('compat-stars', '★'.repeat(stars) + '☆'.repeat(5 - stars));

  // Share button
  const shareBtn = $('compat-share');
  if (shareBtn) {
    shareBtn.onclick = () => {
      const text = `${myS?.emoji} ${myS?.ru} + ${tgS?.emoji} ${tgS?.ru}: ${result.title} — ${result.rating}% совместимость!\nПроверь свою в @Selenyx_mybot`;
      const url = `https://t.me/share/url?url=https://t.me/Selenyx_mybot/app&text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
      tg.HapticFeedback.impactOccurred('medium');
    };
  }
}

// ─── Oracle tab ───────────────────────────────────────────────────────────────
let fortuneRevealed = false;

function renderOracle() {
  fortuneRevealed = false;
  $('oracle-cookie')?.classList.remove('revealed');
  hide('oracle-text-block');
  show('oracle-cookie-wrap');

  $('oracle-cookie')?.addEventListener('click', revealFortune, { once: true });
}

function revealFortune() {
  if (fortuneRevealed) return;
  fortuneRevealed = true;
  tg.HapticFeedback.notificationOccurred('success');

  $('oracle-cookie')?.classList.add('revealed');
  setTimeout(() => {
    hide('oracle-cookie-wrap');
    show('oracle-text-block');
    const prediction = getRandomPrediction(userSign || 'aries');
    setText('oracle-prediction', prediction);
    wrapTerms($('oracle-prediction'));

    // Кнопка шаринг
    const shareBtn = $('oracle-share');
    if (shareBtn) {
      shareBtn.onclick = () => {
        const text = `🥠 Оракул говорит:\n«${prediction}»\n\nУзнай своё послание → @Selenyx_mybot`;
        window.open(`https://t.me/share/url?url=https://t.me/Selenyx_mybot/app&text=${encodeURIComponent(text)}`, '_blank');
        tg.HapticFeedback.impactOccurred('medium');
      };
    }

    // Animate in
    const block = $('oracle-text-block');
    if (block) {
      block.style.opacity = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        block.style.transition = 'opacity 0.5s ease';
        block.style.opacity = '1';
      }));
    }
  }, 600);
}

// ─── Settings overlay ─────────────────────────────────────────────────────────
function openSettings() {
  show('settings-overlay');
  tg.BackButton.show();
  tg.BackButton.onClick(closeSettings);

  // Pre-fill sign
  const signSelect = $('settings-sign');
  if (signSelect) {
    signSelect.value = userSign || 'aries';
  }

  // Pre-fill notify time
  const notifyInput = $('settings-notify');
  const saved = localStorage.getItem('notifyTime');
  if (notifyInput && saved) notifyInput.value = saved;

  $('settings-save')?.addEventListener('click', saveSettings);
  $('settings-close')?.addEventListener('click', closeSettings);
}

function closeSettings() {
  hide('settings-overlay');
  tg.BackButton.hide();
  tg.BackButton.offClick(closeSettings);
}

function saveSettings() {
  const signSelect = $('settings-sign');
  const notifyInput = $('settings-notify');

  if (signSelect?.value) {
    userSign = signSelect.value;
    localStorage.setItem('userSign', userSign);
  }
  if (notifyInput?.value) {
    localStorage.setItem('notifyTime', notifyInput.value);
    tg.showPopup({
      message: `Уведомления будут приходить в ${notifyInput.value} по московскому времени.`,
      buttons: [{ id: 'ok', type: 'ok' }]
    }, () => {});
  }

  tg.HapticFeedback.notificationOccurred('success');
  showToast('Настройки сохранены ✓', '#27ae60');
  closeSettings();

  // Refresh current tab
  const cached = ssGet('td');
  if (cached) ssSet('td', null);
  renderToday();
}

// ─── Header buttons ───────────────────────────────────────────────────────────
// ─── Calendar tab ─────────────────────────────────────────────────────────────

const _MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const _DAYS_RU   = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function _kpLevel(kp) {
  if (kp == null) return null;
  if (kp <= 2)    return { cls: 'kp-quiet',    label: 'Тихо' };
  if (kp <= 4)    return { cls: 'kp-moderate', label: 'Умеренно' };
  if (kp <= 6)    return { cls: 'kp-storm',    label: 'Буря' };
  return               { cls: 'kp-severe',   label: 'Сильная буря' };
}

function _dateKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function _moodKey(y, m) {
  return `calMoods_${y}-${String(m+1).padStart(2,'0')}`;
}

async function fetchAndCacheKIndex() {
  try {
    const r = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { cache: 'no-store' });
    const rows = await r.json();
    const byDate = {};
    for (const row of rows.slice(1)) {
      const date = row[0]?.slice(0, 10);
      const kp   = parseFloat(row[1]);
      if (!date || isNaN(kp)) continue;
      if (!byDate[date] || kp > byDate[date]) byDate[date] = kp;
    }
    for (const [d, kp] of Object.entries(byDate)) {
      localStorage.setItem('kindex_' + d, kp.toFixed(1));
    }
  } catch { /* silent fail */ }
}

function renderKIndexBanner() {
  const today = _dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const raw   = localStorage.getItem('kindex_' + today);
  const banner = $('kindex-banner');
  if (!banner) return;
  if (raw == null) { banner.hidden = true; return; }
  const kp  = parseFloat(raw);
  const lvl = _kpLevel(kp);
  banner.hidden = false;
  const dot   = $('kindex-dot');
  const label = $('kindex-label');
  dot.className   = 'kindex-dot ' + (lvl?.cls || '');
  label.textContent = `Магнитная обстановка: ${lvl?.label || '—'} (K=${kp.toFixed(1)})`;
}

function _getMoods() {
  try { return JSON.parse(localStorage.getItem(_moodKey(calYear, calMonth)) || '{}'); }
  catch { return {}; }
}

function saveMood(date, value) {
  const key   = _moodKey(date.getFullYear(), date.getMonth());
  const moods = (() => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } })();
  moods[date.getDate()] = value;
  localStorage.setItem(key, JSON.stringify(moods));
}

function renderCalGrid() {
  const grid  = $('cal-grid');
  if (!grid) return;
  const today = new Date();
  const moods = _getMoods();

  // Заголовки дней недели
  let html = _DAYS_RU.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  // Первый день месяца (getDay: 0=вс, адаптируем под Пн=0)
  const first   = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
  let startDow  = first.getDay(); // 0=вс
  startDow = (startDow === 0) ? 6 : startDow - 1; // вс→6, пн→0

  // Пустые ячейки до начала месяца
  for (let i = 0; i < startDow; i++) html += '<div class="cal-day cal-day--empty"></div>';

  for (let d = 1; d <= lastDay; d++) {
    const date    = new Date(calYear, calMonth, d);
    const moon    = calcMoonData(date);
    const dKey    = _dateKey(calYear, calMonth, d);
    const kpRaw   = localStorage.getItem('kindex_' + dKey);
    const kp      = kpRaw != null ? parseFloat(kpRaw) : null;
    const lvl     = _kpLevel(kp);
    const mood    = moods[d];
    const isToday = (d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear());
    const isFuture = date > today;

    const moodStyle = mood ? `style="background:hsl(${(mood-1)*12},65%,88%)"` : '';
    const moodClass = mood ? ' has-mood' : '';
    const todayClass = isToday ? ' today' : '';
    const kpDot  = lvl && !isFuture ? `<span class="day-kpt ${lvl.cls}"></span>` : '';

    html += `<div class="cal-day${todayClass}${moodClass}" data-day="${d}" ${moodStyle}>
      <span class="day-num">${d}</span>
      <span class="day-moon">${moon.emoji}</span>
      ${kpDot}
    </div>`;
  }

  grid.innerHTML = html;

  // Клики по дням
  grid.querySelectorAll('.cal-day[data-day]').forEach(cell => {
    cell.addEventListener('click', () => {
      const d = parseInt(cell.dataset.day);
      openDaySheet(new Date(calYear, calMonth, d));
    });
  });
}

function updateCalHeader() {
  const el = $('cal-month-label');
  if (el) el.textContent = `${_MONTHS_RU[calMonth]} ${calYear}`;
}

function openDaySheet(date) {
  _calDaySheetDate = date;
  const d  = date.getDate();
  const mn = _MONTHS_RU[date.getMonth()];
  setText('day-sheet-title', `${d} ${mn}`);

  const moon = calcMoonData(date);
  const dKey = _dateKey(date.getFullYear(), date.getMonth(), d);
  const kpRaw = localStorage.getItem('kindex_' + dKey);
  const kp = kpRaw != null ? parseFloat(kpRaw) : null;
  const lvl = _kpLevel(kp);
  const kpLine = lvl ? `<div class="day-kp-row"><span class="kindex-dot ${lvl.cls}"></span> <span>${lvl.label} (K=${kp.toFixed(1)})</span></div>` : '';

  setHTML('day-sheet-body', `
    <div class="day-moon-big">${moon.emoji}</div>
    <p class="day-phase-name">${moon.phaseName}</p>
    <p class="day-lunar-day">Лунный день: ${moon.lunarDay}</p>
    <p class="day-sign">Луна в ${moon.signRu}</p>
    ${kpLine}
  `);

  // Текущее значение настроения
  const moods = _getMoods();
  const curMood = moods[d] || 5;
  const slider = $('mood-slider');
  const valDisplay = $('mood-val');
  if (slider) {
    slider.value = curMood;
    if (valDisplay) valDisplay.textContent = curMood;
    slider.oninput = () => { if (valDisplay) valDisplay.textContent = slider.value; };
  }

  const sheet = $('day-sheet');
  if (sheet) {
    sheet.classList.remove('hidden');
    sheet.classList.add('open');
  }

  // Кнопки
  $('mood-save')?.addEventListener('click', _onMoodSave, { once: true });
  $('day-sheet-close')?.addEventListener('click', closeDaySheet, { once: true });

  tg.BackButton.show();
  tg.BackButton.onClick(_closeDaySheetBack);
}

function _onMoodSave() {
  if (!_calDaySheetDate) return;
  const val = parseInt($('mood-slider')?.value || 5);
  saveMood(_calDaySheetDate, val);
  closeDaySheet();
  renderCalGrid();
  showToast('Сохранено ✓', '#34c759');
  tg.HapticFeedback.notificationOccurred('success');
}

function _closeDaySheetBack() {
  closeDaySheet();
  tg.BackButton.offClick(_closeDaySheetBack);
}

function closeDaySheet() {
  const sheet = $('day-sheet');
  if (sheet) {
    sheet.classList.remove('open');
    setTimeout(() => sheet.classList.add('hidden'), 300);
  }
  tg.BackButton.hide();
  _calDaySheetDate = null;
}

function renderCalChart() {
  const container = $('cal-chart-view');
  if (!container) return;
  const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
  const moods   = _getMoods();
  const today   = new Date();

  const barW  = 26;
  const barMaxH = 80;
  const svgW  = lastDay * (barW + 2) + 20;
  const svgH  = barMaxH + 50;

  let bars = '';
  for (let d = 1; d <= lastDay; d++) {
    const date   = new Date(calYear, calMonth, d);
    const moon   = calcMoonData(date);
    const dKey   = _dateKey(calYear, calMonth, d);
    const kpRaw  = localStorage.getItem('kindex_' + dKey);
    const kp     = kpRaw != null ? parseFloat(kpRaw) : null;
    const lvl    = _kpLevel(kp);
    const mood   = moods[d];
    const isFuture = date > today;

    const x = (d - 1) * (barW + 2) + 10;
    const barH = mood ? Math.round((mood / 10) * barMaxH) : 0;
    const barY = barMaxH - barH + 12;

    let fillColor = '#e0e0e0';
    if (mood && lvl) {
      const colors = { 'kp-quiet': '#34c759', 'kp-moderate': '#ffd60a', 'kp-storm': '#ff9f0a', 'kp-severe': '#ff3b30' };
      fillColor = colors[lvl.cls] || '#2AABEE';
    } else if (mood) {
      fillColor = '#2AABEE';
    }

    const opacity = (isFuture || !mood) ? 0.3 : 1;
    bars += `<g opacity="${opacity}">`;
    if (mood) {
      bars += `<rect x="${x}" y="${barY}" width="${barW}" height="${barH}" rx="4" fill="${fillColor}"/>`;
    } else {
      bars += `<rect x="${x}" y="${barMaxH - 4 + 12}" width="${barW}" height="4" rx="2" fill="#d0d0d0"/>`;
    }
    bars += `<text x="${x + barW/2}" y="${barY - 3}" text-anchor="middle" font-size="10">${moon.emoji}</text>`;
    if (d === 1 || d % 5 === 0 || d === lastDay) {
      bars += `<text x="${x + barW/2}" y="${svgH - 4}" text-anchor="middle" font-size="9" fill="#8e8e93">${d}</text>`;
    }
    bars += '</g>';
  }

  container.innerHTML = `
    <p class="chart-legend">Бары: самочувствие 1–10 · Цвет: магнитная обстановка · Emoji: фаза Луны</p>
    <div style="overflow-x:auto">
      <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">
        ${bars}
      </svg>
    </div>
  `;
}

function initCalNav() {
  // Убираем старые обработчики через замену узлов
  const prev = $('cal-prev');
  const next = $('cal-next');
  if (prev) {
    const newPrev = prev.cloneNode(true);
    prev.replaceWith(newPrev);
    newPrev.addEventListener('click', () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      updateCalHeader();
      renderCalGrid();
      tg.HapticFeedback.impactOccurred('light');
    });
  }
  if (next) {
    const newNext = next.cloneNode(true);
    next.replaceWith(newNext);
    newNext.addEventListener('click', () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      updateCalHeader();
      renderCalGrid();
      tg.HapticFeedback.impactOccurred('light');
    });
  }
}

function initViewToggle() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.replaceWith(newBtn);
    newBtn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      newBtn.classList.add('active');
      const view = newBtn.dataset.view;
      if (view === 'grid') {
        show('cal-grid');
        hide('cal-chart-view');
      } else {
        hide('cal-grid');
        show('cal-chart-view');
        renderCalChart();
      }
      tg.HapticFeedback.impactOccurred('light');
    });
  });
}

async function renderCalendar() {
  calYear  = calYear  || new Date().getFullYear();
  calMonth = calMonth ?? new Date().getMonth();
  updateCalHeader();
  await fetchAndCacheKIndex();
  renderKIndexBanner();
  renderCalGrid();
  initCalNav();
  initViewToggle();
}

function initHeaderButtons() {
  $('settings-btn')?.addEventListener('click', openSettings);
  $('refresh-btn')?.addEventListener('click', () => {
    sessionStorage.clear();
    _todayInited = false;
    renderToday();
    showToast('Обновлено', '#2AABEE');
    tg.HapticFeedback.impactOccurred('light');
  });
}

// ─── Term Tooltips ─────────────────────────────────────────────────────────────
// Terms sorted longest-first so multi-word terms match before single words
const _termKeys = Object.keys(typeof TOOLTIP_TERMS !== 'undefined' ? TOOLTIP_TERMS : {})
  .sort((a, b) => b.length - a.length);

function wrapTerms(container) {
  if (!container || !_termKeys.length) return;
  // Build combined alternation regex (longer terms first → correct priority)
  const pattern = _termKeys
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const re = new RegExp(`(${pattern})`, 'gi');

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) {
    // Skip text already inside a term-link or non-content elements
    if (n.parentElement?.closest('.term-link, script, style')) continue;
    nodes.push(n);
  }
  nodes.forEach(textNode => {
    if (!re.test(textNode.textContent)) { re.lastIndex = 0; return; }
    re.lastIndex = 0;
    const html = textNode.textContent.replace(re, match => {
      const key = _termKeys.find(k => k.toLowerCase() === match.toLowerCase());
      if (!key) return match;
      return `<span class="term-link" data-term="${key}" role="button" tabindex="0" aria-label="${key}: нажмите для расшифровки">${match}</span>`;
    });
    const span = document.createElement('span');
    span.innerHTML = html;
    textNode.parentNode.replaceChild(span, textNode);
  });
}

function _showTip(termKey) {
  const def = (typeof TOOLTIP_TERMS !== 'undefined') ? TOOLTIP_TERMS[termKey.toLowerCase()] : null;
  if (!def) return;
  setText('term-tooltip-title', termKey);
  setText('term-tooltip-text', def);
  show('term-tooltip-bd');
  const tip = $('term-tooltip');
  if (tip) {
    tip.classList.remove('hidden', 'tip-up');
    requestAnimationFrame(() => requestAnimationFrame(() => tip.classList.add('tip-up')));
  }
  tg.HapticFeedback.impactOccurred('light');
}

function _hideTip() {
  const tip = $('term-tooltip');
  if (tip) {
    tip.classList.remove('tip-up');
    setTimeout(() => tip.classList.add('hidden'), 200);
  }
  hide('term-tooltip-bd');
}

function initTermTooltips() {
  document.addEventListener('click', e => {
    const link = e.target.closest('.term-link');
    if (link) {
      e.stopPropagation();
      _showTip(link.dataset.term);
      return;
    }
    // Close on tap outside
    if (!e.target.closest('#term-tooltip')) _hideTip();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') _hideTip();
  });
}

// ─── Knowledge Base ───────────────────────────────────────────────────────────
let _kbCurrentIdx = 0;

function openKnowledge(idx) {
  _kbCurrentIdx = (idx != null) ? idx : 0;
  const overlay = $('knowledge-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  show('kb-list-view');
  hide('kb-detail-view');
  renderKbList();
  tg.BackButton.show();
  tg.BackButton.onClick(closeKnowledge);
  tg.HapticFeedback.impactOccurred('light');
}

function closeKnowledge() {
  hide('knowledge-overlay');
  tg.BackButton.hide();
  tg.BackButton.offClick(closeKnowledge);
}

function renderKbList() {
  const list = $('kb-list');
  if (!list || typeof KNOWLEDGE_BASE === 'undefined') return;
  list.innerHTML = KNOWLEDGE_BASE.map((item, i) => `
    <div class="kb-card" data-idx="${i}" role="listitem" tabindex="0" aria-label="${item.title}">
      <span class="kb-card-icon" aria-hidden="true">${item.icon}</span>
      <span class="kb-card-title">${item.title}</span>
      <span class="kb-card-arrow" aria-hidden="true">›</span>
    </div>
  `).join('');
  list.querySelectorAll('.kb-card').forEach(card => {
    card.addEventListener('click', () => openKbDetail(+card.dataset.idx));
  });
}

function openKbDetail(idx) {
  if (typeof KNOWLEDGE_BASE === 'undefined') return;
  _kbCurrentIdx = idx;
  const item = KNOWLEDGE_BASE[idx];
  if (!item) return;

  setText('kb-detail-title', item.title);
  setText('kb-detail-icon',  item.icon);
  setHTML('kb-detail-body',  item.body);

  // Prev / Next buttons
  $('kb-prev').disabled = (idx === 0);
  $('kb-next').disabled = (idx === KNOWLEDGE_BASE.length - 1);

  // Scroll to top
  const scroll = document.querySelector('.kb-detail-scroll');
  if (scroll) scroll.scrollTop = 0;

  hide('kb-list-view');
  show('kb-detail-view');
  tg.HapticFeedback.impactOccurred('light');
}

function initKnowledge() {
  $('kb-close')?.addEventListener('click', closeKnowledge);
  $('kb-back')?.addEventListener('click', () => {
    hide('kb-detail-view');
    show('kb-list-view');
  });
  $('kb-menu-btn')?.addEventListener('click', () => {
    hide('kb-detail-view');
    show('kb-list-view');
  });
  $('kb-prev')?.addEventListener('click', () => {
    if (_kbCurrentIdx > 0) openKbDetail(_kbCurrentIdx - 1);
  });
  $('kb-next')?.addEventListener('click', () => {
    if (typeof KNOWLEDGE_BASE !== 'undefined' && _kbCurrentIdx < KNOWLEDGE_BASE.length - 1) {
      openKbDetail(_kbCurrentIdx + 1);
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initHeaderButtons();
  initTermTooltips();
  initKnowledge();

  initSplash();
});
