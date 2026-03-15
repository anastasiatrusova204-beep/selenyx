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
window.onerror = (msg, src, line, _col, err) => {
  const text = `Ошибка: ${msg}\n${src}:${line}`;
  console.error(text, err);
  if (typeof tg.showAlert === 'function') tg.showAlert(text);
  else alert(text);
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
const screens = ['splash', 'onboarding', 'main'];

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
        showScreen('main');
        initMain();
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
  tg.showPopup({ message: 'Знак сохранён ✓\nПрогноз на сегодня готов!', buttons: [{ id: 'ok', type: 'ok' }] }, () => {
    showScreen('main');
    initMain();
  });
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
  switchTab('today');
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
    case 'today':  renderToday();  break;
    case 'moon':   renderMoon();   break;
    case 'chart':  renderChart();  break;
    case 'compat': renderCompat(); break;
    case 'oracle': renderOracle(); break;
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

function applyTodayData(data) {
  const { moon, dayNum, color, phaseTips, domains, hint } = data;

  // Moon tile row
  setHTML('today-moon-tile', `
    <div class="tile">
      <span class="tile-icon">${moon.emoji}</span>
      <span class="tile-label">${moon.phaseName}</span>
    </div>
    <div class="tile">
      <span class="tile-icon">🌙</span>
      <span class="tile-label">Луна в ${moon.signRu}</span>
    </div>
  `);

  // Color card
  setHTML('today-color', `
    <span style="display:inline-block;width:14px;height:14px;background:${color.hex};border-radius:50%;margin-right:6px;vertical-align:middle"></span>
    ${color.name}
  `);

  // Day number
  setText('today-daynum', dayNum);
  setText('today-daynum-hint', NUMEROLOGY[dayNum]?.short || '');

  // Weekday hint
  setText('today-hint', hint);

  // Phase tip
  setText('today-good', phaseTips.good || '');
  setText('today-avoid', phaseTips.avoid || '');

  // Domain buttons → открывают bottom sheet
  document.querySelectorAll('.domain-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tg.HapticFeedback.impactOccurred('medium');
      openDomainSheet(btn.dataset.domain, domains, phaseTips);
    });
  });

  // Retention hook: показать через 3с при первом визите
  if (!localStorage.getItem('retentionShown')) {
    setTimeout(showRetentionBanner, 3000);
  }
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
  love:   { label: 'Любовь',    icon: '❤️' },
  psych:  { label: 'Эмоции',    icon: '🧠' },
};

function openDomainSheet(domain, domains, phaseTips) {
  const meta  = DOMAIN_META[domain] || { label: domain, icon: '✨' };
  const text  = domains[domain] || '';
  const good  = phaseTips?.good  || '';
  const avoid = phaseTips?.avoid || '';

  setText('sheet-domain-icon',  meta.icon);
  setText('sheet-domain-title', meta.label);
  setText('sheet-domain-text',  text);
  setText('sheet-phase-good',   good);
  setText('sheet-phase-avoid',  avoid);

  const sheet = $('domain-sheet');
  sheet.classList.remove('hidden');
  requestAnimationFrame(() => sheet.classList.add('open'));

  tg.BackButton.show();
  const close = () => closeDomainSheet();
  tg.BackButton.onClick(close);
  $('domain-sheet-close')?.addEventListener('click', close, { once: true });
  $('domain-sheet-backdrop')?.addEventListener('click', close, { once: true });
}

function closeDomainSheet() {
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
  setText('moon-sign-name', `Луна в ${moon.signRu}`);
  setText('moon-lunar-day', `${moon.lunarDay} лунный день`);
  setText('moon-illumination', `${moon.illumination}%`);

  const energy = MOON_SIGN_ENERGY[moon.sign] || {};
  setText('moon-energy-title', energy.title || '');
  setText('moon-energy-text', energy.text || '');

  // Tile row
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

  // Lunar day info
  const ld = LUNAR_DAYS[moon.lunarDay] || {};
  setHTML('moon-lunar-info', `
    <p><b>${ld.symbol || '🌙'} ${moon.lunarDay} лунный день</b></p>
    <p>${ld.energy || ''}</p>
    <p class="muted">${ld.practice || ''}</p>
  `);
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

  setHTML('chart-sun', `<span class="sign-emoji">${natal.sun.emoji}</span> Солнце в ${natal.sun.name}`);
  setHTML('chart-moon', `<span class="sign-emoji">${natal.moon.emoji}</span> Луна в ${natal.moon.name}`);
  setHTML('chart-asc', `<span class="sign-emoji">${natal.asc.emoji}</span> Асцендент в ${natal.asc.name}`);

  setText('chart-sun-desc', natal.sun.desc);
  setText('chart-moon-desc', natal.moon.desc);
  setText('chart-asc-desc', natal.asc.desc);
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
      `<button class="compat-sign-btn" data-sign="${s.id}" aria-label="${s.name}">
        <span class="sign-emoji">${s.emoji}</span>
        <span class="sign-name-short">${s.name}</span>
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

  setText('compat-pair', `${myS?.emoji || '✨'} ${myS?.name || ''} + ${tgS?.emoji || '✨'} ${tgS?.name || ''}`);
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
      const text = `${myS?.emoji} ${myS?.name} + ${tgS?.emoji} ${tgS?.name}: ${result.title} — ${result.rating}% совместимость!\nПроверь свою в @Selenyx_mybot`;
      const url = `https://t.me/share/url?url=https://t.me/Selenyx_mybot&text=${encodeURIComponent(text)}`;
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

    // Кнопка шаринг
    const shareBtn = $('oracle-share');
    if (shareBtn) {
      shareBtn.onclick = () => {
        const text = `🥠 Оракул говорит:\n«${prediction}»\n\nУзнай своё послание → @Selenyx_mybot`;
        window.open(`https://t.me/share/url?url=https://t.me/Selenyx_mybot&text=${encodeURIComponent(text)}`, '_blank');
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
function initHeaderButtons() {
  $('settings-btn')?.addEventListener('click', openSettings);
  $('refresh-btn')?.addEventListener('click', () => {
    sessionStorage.clear();
    renderToday();
    showToast('Обновлено', '#2AABEE');
    tg.HapticFeedback.impactOccurred('light');
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initHeaderButtons();
  initSplash();
});
