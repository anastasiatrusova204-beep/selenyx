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
const _V = 'v7'; // увеличить при изменении структуры данных
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
  ['userSign','userEmail','userBirth','streakDate','streakCount','retentionShown','obGoal','obBirth'].forEach(k => localStorage.removeItem(k));
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
const screens = ['splash', 'onboarding', 'roadmap', 'email', 'main'];

function showScreen(id) {
  screens.forEach(s => {
    const el = $(s + '-screen');
    if (el) el.classList.toggle('hidden', s !== id);
  });
  const el = $(id + '-screen');
  if (el) {
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = 'screenFadeIn 0.35s ease forwards';
  }
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
        const streak3 = parseInt(localStorage.getItem('streakCount') || '0', 10) >= 3;
        if (!localStorage.getItem('userEmail') && streak3) {
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

// ─── Onboarding quiz ──────────────────────────────────────────────────────────
let obSlide = 0;
const OB_COUNT = 5;

// Квиз-состояние
const _quiz = { goal: '', currentState: '', birthDate: '' };

// Микро-инсайты по слову состояния
const _STATE_INSIGHTS = {
  'тревога':       'Тревога — это компас. Она указывает на что-то важное для тебя.',
  'тревожность':   'Тревога — это компас. Она указывает на что-то важное для тебя.',
  'страх':         'Страх и рост всегда рядом. Ты здесь — значит, выбираешь рост.',
  'усталость':     'Тело просит паузы. Сейчас самое время услышать себя.',
  'устала':        'Тело просит паузы. Сейчас самое время услышать себя.',
  'потерянность':  'Ощущение потерянности часто предшествует новому направлению.',
  'потеряна':      'Ощущение потерянности часто предшествует новому направлению.',
  'одиночество':   'В одиночестве мы встречаем себя. Это не так страшно, как кажется.',
  'злость':        'Злость — это энергия. Когда поймёшь её источник, она станет силой.',
  'грусть':        'Грусть очищает. Позволь себе прожить её — за ней идёт ясность.',
  'апатия':        'Апатия — пауза перед движением. Твоя энергия копится.',
  'неуверенность': 'Неуверенность — признак роста. Уверены только те, кто не развивается.',
  'радость':       'Радость — твоя природа. Хорошее время укрепить это ощущение.',
  'спокойствие':   'Спокойствие — редкий дар. Луна поддерживает твоё равновесие.',
  'надежда':       'Надежда — начало перемен. Ты уже на пути.',
  'любопытство':   'Любопытство — лучший навигатор. Ты в нужном месте.',
  'вдохновение':   'Поймай этот момент. Луна сейчас поддерживает твои начинания.',
  'растерянность': 'Растерянность — точка выбора. Именно здесь начинается новый путь.',
  'пустота':       'Пустота — это пространство для чего-то нового. Хорошее начало.',
  'сила':          'Эта сила — твоя. Сейчас важно направить её осознанно.',
  'беспокойство':  'Беспокойство — сигнал о чём-то важном. Давай разберёмся вместе.',
  'решимость':     'Решимость — это редко. Используй этот момент — он работает.',
  'раздражение':   'Раздражение говорит о твоих границах. Луна помогает их увидеть.',
};

// Инсайт по фазе Луны на дату рождения
const _BIRTH_PHASE_INSIGHTS = [
  'Ты родилась в Новолуние — фазу начал. В тебе сильна интуиция и способность к обновлению.',
  'Рождена в Растущий серп — фаза роста. Ты умеешь строить с нуля и чувствовать момент.',
  'Первая четверть — фаза действия. Ты рождена преодолевать препятствия и двигаться вперёд.',
  'Растущая Луна — фаза развития. Ты стремишься к совершенству и умеешь завершать дела.',
  'Ты родилась в Полнолуние — максимум энергии. Твои эмоции глубоки, а интуиция обострена.',
  'Убывающая Луна — фаза осмысления. Ты умеешь делиться знаниями и видеть суть.',
  'Последняя четверть — фаза переоценки. В тебе сильна мудрость и способность отпускать.',
  'Старый серп — фаза завершения. Ты умеешь освобождаться от лишнего и видеть главное.',
];

function _getSignFromBirthDate(day, month) {
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 'aries';
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 'taurus';
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return 'gemini';
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return 'cancer';
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 'leo';
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 'virgo';
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return 'libra';
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return 'scorpio';
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return 'sagittarius';
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return 'capricorn';
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 'aquarius';
  if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return 'pisces';
  return null;
}

function _getBirthPhaseInsight(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    // Простое приближение: синодический месяц ~29.53 дней, опорная дата новолуния 2000-01-06
    const ref = new Date('2000-01-06');
    const days = (d - ref) / 86400000;
    const phase = ((days % 29.53) + 29.53) % 29.53;
    const idx = Math.floor(phase / (29.53 / 8));
    return _BIRTH_PHASE_INSIGHTS[Math.min(idx, 7)];
  } catch { return null; }
}

function _levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (__, j) => j === 0 ? i : 0));
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function _getStateInsight(word) {
  if (!word) return null;
  const key = word.trim().toLowerCase().replace(/[^а-яёa-z]/gi, '');
  if (!key || key.length < 3) return null;
  // Точное совпадение
  if (_STATE_INSIGHTS[key]) return _STATE_INSIGHTS[key];
  // Fuzzy: ищем ближайший ключ с расстоянием ≤ 2
  let best = null, bestDist = Infinity;
  for (const k of Object.keys(_STATE_INSIGHTS)) {
    const d = _levenshtein(key, k);
    if (d < bestDist && d <= 2) { bestDist = d; best = k; }
  }
  return best ? _STATE_INSIGHTS[best] : null;
}

function initOnboarding() {
  obSlide = 0;
  _quiz.goal = '';
  _quiz.currentState = '';
  _quiz.birthDate = '';
  showObSlide(0);

  // Telegram BackButton — «Назад» между слайдами
  tg.BackButton.onClick(prevObSlide);

  // HTML кнопка «Назад» внутри онбординга
  $('ob-back')?.addEventListener('click', prevObSlide);

  // Goal cards
  document.querySelectorAll('.goal-card').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.goal-card').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _quiz.goal = btn.dataset.goal;
      tg.HapticFeedback.impactOccurred('light');
    });
  });

  // State chips → micro-insight
  const stateInsight = $('ob-state-insight');
  document.querySelectorAll('.state-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.state-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _quiz.currentState = chip.dataset.state;
      tg.HapticFeedback.impactOccurred('light');
      if (stateInsight) {
        const insight = _getStateInsight(chip.dataset.state);
        if (insight) {
          stateInsight.textContent = insight;
          stateInsight.classList.remove('hidden');
        } else {
          stateInsight.classList.add('hidden');
        }
      }
    });
  });

  // Birth date — три поля → moon phase insight
  const birthDay   = $('ob-birth-day');
  const birthMonth = $('ob-birth-month');
  const birthYear  = $('ob-birth-year');
  const birthInsight = $('ob-birth-insight');

  function _onBirthChange() {
    const d = birthDay?.value?.padStart(2, '0');
    const m = birthMonth?.value;
    const y = birthYear?.value;
    if (!d || !m || !y || y.length < 4) return;
    const iso = `${y}-${m}-${d}`;

    // Автоопределение знака зодиака по дате рождения
    const autoSign = _getSignFromBirthDate(parseInt(d), parseInt(m));
    if (autoSign) {
      userSign = autoSign;
      const signData = SIGNS.find(s => s.id === autoSign);
      if (birthInsight) {
        birthInsight.textContent = `${signData?.emoji || '⭐'} Твой знак — ${signData?.ru || autoSign}`;
        birthInsight.classList.remove('hidden');
      }
      tg.HapticFeedback.impactOccurred('light');
    } else {
      const insight = _getBirthPhaseInsight(iso);
      if (insight && birthInsight) {
        birthInsight.textContent = insight;
        birthInsight.classList.remove('hidden');
      }
    }
    _quiz.birthDate = iso;
  }

  // Auto-advance: после ввода дня — фокус на месяц, после месяца — на год
  birthDay?.addEventListener('input', () => {
    if (birthDay.value.length >= 2) birthMonth?.focus();
    _onBirthChange();
  });
  birthMonth?.addEventListener('change', () => {
    birthYear?.focus();
    _onBirthChange();
  });
  birthYear?.addEventListener('input', () => {
    if (birthYear.value.length >= 4) _onBirthChange();
  });

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
    if (!el) continue;
    if (i === idx) {
      el.classList.remove('hidden');
      el.style.animation = 'none';
      el.offsetHeight; // reflow
      el.style.animation = 'obSlideIn 0.28s ease forwards';
      // Сбросить анимации дочерних элементов для повторного воспроизведения
      el.querySelectorAll('.ob-illustration, .ob-title, .ob-text').forEach(child => {
        child.style.animation = 'none';
        child.offsetHeight;
        child.style.animation = '';
      });
    } else {
      el.classList.add('hidden');
      el.style.animation = '';
    }
  }
  document.querySelectorAll('.ob-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
  const nextBtn  = $('ob-next');
  const startBtn = $('ob-start');
  const skipBtn  = $('ob-skip');
  const backBtn  = $('ob-back');
  if (nextBtn)  nextBtn.classList.toggle('hidden', idx === OB_COUNT - 1);
  if (startBtn) startBtn.classList.toggle('hidden', idx !== OB_COUNT - 1);
  if (skipBtn)  skipBtn.classList.toggle('hidden', idx === OB_COUNT - 1);
  if (backBtn)  backBtn.classList.toggle('hidden', idx === 0);
  // Telegram BackButton: показываем со слайда 1
  if (idx > 0) tg.BackButton.show(); else tg.BackButton.hide();
}

function prevObSlide() {
  if (obSlide > 0) {
    obSlide--;
    showObSlide(obSlide);
    tg.HapticFeedback.impactOccurred('light');
  }
}

function nextObSlide() {
  // Слайд 1: цель обязательна
  if (obSlide === 1 && !_quiz.goal) {
    showToast('Выбери одну из целей', '#b07d2c');
    tg.HapticFeedback.notificationOccurred('warning');
    return;
  }
  // Слайд 3 (дата рождения): если знак определён автоматически — пропускаем выбор знака
  if (obSlide === 3 && userSign) {
    finishOnboarding();
    return;
  }
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
  tg.CloudStorage?.setItem('userSign', userSign, () => {});
  // Сохраняем квиз-данные локально
  localStorage.setItem('obGoal', _quiz.goal);
  localStorage.setItem('obBirth', _quiz.birthDate);
  onboarded = true;
  tg.HapticFeedback.notificationOccurred('success');
  showScreen('roadmap');
  initRoadmap();
}

// ─── Roadmap screen ────────────────────────────────────────────────────────────
const _GOAL_LABELS = {
  relationships: 'отношениям',
  career:        'карьере',
  selfknowledge: 'самопознанию',
  health:        'здоровью и балансу',
};

function initRoadmap() {
  const goalLine = $('roadmap-goal-line');
  if (goalLine && _quiz.goal) {
    goalLine.textContent = `Твой маршрут настроен по ${_GOAL_LABELS[_quiz.goal] || 'твоей цели'} — день за днём`;
  }
  $('roadmap-start')?.addEventListener('click', () => {
    tg.HapticFeedback.notificationOccurred('success');
    if (!localStorage.getItem('userEmail')) {
      showScreen('email');
      initEmailScreen();
    } else {
      showScreen('main');
      initMain();
    }
  }, { once: true });
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
  if (badge && streak >= 3) {
    badge.innerHTML = `<span class="streak-fire">🔥</span><span class="streak-num">${streak}</span><span class="streak-label">дней подряд</span>`;
    badge.classList.remove('hidden');
    badge.onclick = () => {
      tg.HapticFeedback.impactOccurred('light');
      tg.showPopup({
        title: `🔥 Серия — ${streak} ${streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'}`,
        message: `Ты заходишь в Selenyx ${streak} дней подряд.\n\nЭто твой личный ритм — каждый день немного ближе к себе. Продолжай — энергия накапливается. 🌙`,
        buttons: [{ type: 'ok', text: 'Буду держать ритм' }]
      });
    };
  } else if (badge) {
    badge.classList.add('hidden');
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
  if (_autoKnowledge) openKnowledge();
}

function switchTab(tab) {
  currentTab = tab;
  tg.HapticFeedback.impactOccurred('light');

  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab)
  );
  document.querySelectorAll('.tab-pane').forEach(pane => {
    const isActive = pane.dataset.tab === tab;
    if (isActive) {
      pane.classList.remove('hidden');
      pane.style.animation = 'none';
      pane.offsetHeight; // reflow
      pane.style.animation = 'paneFadeIn 0.22s ease forwards';
    } else {
      pane.classList.add('hidden');
      pane.style.animation = '';
    }
  });

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

  const phase     = moon.phase;
  const phaseTips = PHASE_TIPS[phase] || {};
  const domains   = DOMAINS[sign] || {};

  const data = { moon, sign, dayNum, color, phaseTips, domains };
  ssSet('td', data);
  applyTodayData(data);
}

let currentDomain = 'health';
let _todayInited = false; // guard против дублирования listeners
let _pendingWeeklySummary = 0; // streak milestone для weekly overlay

function applyTodayData(data) {
  const { moon, dayNum, color, phaseTips, domains } = data;
  const sign = data.sign || userSign || 'aries';

  // Today's date + moon inline
  const now = new Date();
  const dayNames = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const monthNames = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  setText('today-date', `${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]}`);
  // today-moon-inline скрыт — лунные данные только на вкладке Луна

  // Фоновая иллюстрация по фазе луны
  const _PHASE_GROUPS = {
    new: 'new', waning_cresc: 'new', last_quarter: 'waning',
    waxing_cresc: 'waxing', first_quarter: 'waxing',
    waxing_gibb: 'full', full: 'full',
    waning_gibb: 'waning'
  };
  const todayPane = document.querySelector('.tab-pane[data-tab="today"]');
  if (todayPane) todayPane.setAttribute('data-phase-group', _PHASE_GROUPS[moon.phase] || 'full');

  // Goal line
  const _GOAL_FOCUS = {
    relationships: '❤️ Фокус: Отношения',
    career:        '💼 Фокус: Карьера',
    selfknowledge: '🔮 Фокус: Самопознание',
    health:        '🏥 Фокус: Здоровье',
  };
  const savedGoal = localStorage.getItem('obGoal') || _quiz.goal;
  const goalEl = $('today-goal-line');
  if (goalEl && savedGoal && _GOAL_FOCUS[savedGoal]) {
    goalEl.textContent = _GOAL_FOCUS[savedGoal];
    goalEl.classList.remove('hidden');
  } else if (goalEl) {
    goalEl.classList.add('hidden');
  }

  // Domain card previews
  document.querySelectorAll('[data-domain]').forEach(card => {
    const domain = card.dataset.domain;
    const preview = card.querySelector('.domain-card-preview');
    if (preview) {
      const text = domains[domain] || '';
      preview.textContent = text.length > 60 ? text.slice(0, 60) + '…' : text;
    }
  });

  // Sort domains by goal: relevant domain goes first
  const _GOAL_DOMAIN = { relationships: 'love', career: 'work', health: 'health', selfknowledge: 'psych' };
  const primaryDomain = _GOAL_DOMAIN[savedGoal];
  if (primaryDomain) {
    const accordion = $('domain-accordion');
    if (accordion) {
      const primary = accordion.querySelector(`.domain-grid-card[data-domain="${primaryDomain}"]`);
      accordion.querySelectorAll('.domain-primary').forEach(c => {
        c.classList.remove('domain-primary');
        c.querySelector('.domain-grid-badge')?.classList.add('hidden');
      });
      if (primary) {
        primary.classList.add('domain-primary');
        primary.querySelector('.domain-grid-badge')?.classList.remove('hidden');
      }
    }
  }

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
      retroEl.classList.remove('hidden');
      retroEl.innerHTML = `<p class="retro-card-title">✨ Планеты прямые</p>
        <p class="domain-card-text" style="margin-top:4px;opacity:.75">Нет активных ретроградов — благоприятное время для новых начинаний и важных решений.</p>`;
    }
  }

  // Color accordion — preview
  setHTML('today-color', `<span style="display:inline-block;width:10px;height:10px;background:${color.hex};border-radius:50%;margin-right:5px;vertical-align:middle;flex-shrink:0"></span><span style="color:${color.hex};font-weight:600">${color.name}</span>`);

  // Color accordion — body
  const colorBody = document.querySelector('#color-acc-card .domain-card-body');
  if (colorBody) {
    const _P = {
      'Луна':     'Воскресенье — день Луны. Серебристый усиливает интуицию и эмоциональную чуткость.',
      'Марс':     'Понедельник — день Марса. Красный даёт решительность и помогает двигаться вперёд.',
      'Меркурий': 'Вторник — день Меркурия. Оранжевый поддерживает общение, гибкость мышления и контакты.',
      'Юпитер':   'Среда — день Юпитера. Синий расширяет кругозор и поддерживает обучение и рост.',
      'Венера':   'Четверг — день Венеры. Зелёный гармонизирует отношения и привлекает изобилие.',
      'Солнце':   'Пятница — день Солнца. Золотой усиливает уверенность, видимость и творческую силу.',
      'Сатурн':   'Суббота — день Сатурна. Фиолетовый поддерживает глубокое мышление, анализ и структуру.',
    };
    colorBody.innerHTML = `<p class="domain-card-text">${color.hint || ''}</p>${_P[color.planet] ? `<p class="card-label mt">✦ Почему этот цвет</p><p class="domain-card-text">${_P[color.planet]}</p>` : ''}${color.tip ? `<p class="card-label mt">✦ Как использовать сегодня</p><p class="domain-card-text">${color.tip}</p>` : ''}`;
  }

  // Number accordion — preview
  const numData = NUMEROLOGY[dayNum];
  setHTML('today-daynum', `<span style="font-weight:700;color:var(--gold)">${dayNum}</span>&thinsp;<span style="font-size:12px;opacity:.7">${numData?.name || ''}</span>`);

  // Number accordion — body
  const numBody = document.querySelector('#num-acc-card .domain-card-body');
  if (numBody) {
    // Personal life path number (число судьбы)
    let lifePathHtml = '';
    if (userBirth?.date) {
      const lifeNum = calcDayNumber(new Date(userBirth.date.replace(/(\d{2})\.(\d{2})\.(\d{4})/, '$3-$2-$1')));
      const lifeData = NUMEROLOGY[lifeNum] || {};
      lifePathHtml = `<p class="card-label mt" style="opacity:.55;font-size:11px;letter-spacing:.06em">ЧИСЛО СУДЬБЫ</p>
        <p class="domain-card-text" style="font-weight:700;font-size:17px;color:var(--gold);margin:2px 0 2px">${lifeNum} — ${lifeData.name || ''}</p>
        ${lifeData.text || lifeData.hint ? `<p class="domain-card-text" style="opacity:.8">${lifeData.text || lifeData.hint}</p>` : ''}
        <p style="margin-top:6px;margin-bottom:0;font-size:11px;opacity:.4;text-align:right">← изменить в настройках</p>`;
    } else {
      lifePathHtml = `<p class="card-label mt" style="opacity:.55;font-size:11px;letter-spacing:.06em">ЧИСЛО СУДЬБЫ</p>
        <p class="domain-card-text" style="opacity:.55">Добавь дату рождения в <span style="color:var(--gold);cursor:pointer" onclick="openSettings()">Настройках</span> — рассчитаю твоё личное число судьбы и натальную карту.</p>`;
    }
    numBody.innerHTML = `${numData?.text || numData?.hint ? `<p class="domain-card-text">${numData.text || numData.hint}</p>` : ''}${numData?.good ? `<p class="card-label mt">✦ Что поддерживает сегодня</p><p class="domain-card-text">${numData.good}</p>` : ''}${numData?.avoid ? `<p class="card-label mt">✦ Чего избегать</p><p class="domain-card-text">${numData.avoid}</p>` : ''}${numData?.practice ? `<p class="card-label mt">✦ Практика дня</p><p class="domain-card-text">${numData.practice}</p>` : ''}${lifePathHtml}`;
  }

  // today-basis скрыт — лунный день только на вкладке Луна

  // Персональный совет: знак × фаза луны (меняется каждые 3–4 дня)
  const phaseText = (ZODIAC_PHASE_TIPS?.[sign] || ZODIAC_PHASE_TIPS?.aries)?.[moon.phase] || phaseTips.good || '';
  const cardLabel = $('today-card-label');
  if (cardLabel) cardLabel.textContent = '✦ Прогноз дня';
  setText('today-good', phaseText);
  // today-avoid убран — дублировал "избегай" из раздела Числа дня

  // Практика лунного дня
  const ld = LUNAR_DAYS[moon.lunarDay] || {};
  setText('today-practice-day', `${ld.symbol || '🌙'} ${moon.lunarDay}-й лунный день · ${ld.name || ''}`);
  setText('today-practice-text', ld.hint || '');

  // Feedback buttons — сбрасываем состояние каждый день
  const fbToday = new Date().toISOString().slice(0, 10);
  const fbSaved = localStorage.getItem('feedbackDate');
  const fbHit   = $('fb-hit');
  const fbMiss  = $('fb-miss');
  if (fbHit && fbMiss) {
    if (fbSaved === fbToday) {
      const saved = localStorage.getItem('feedbackReaction');
      if (saved === 'hit')  fbHit.classList.add('feedback-btn--active');
      if (saved === 'miss') fbMiss.classList.add('feedback-btn--active');
    }
    [fbHit, fbMiss].forEach(btn => {
      btn.addEventListener('click', () => {
        if (localStorage.getItem('feedbackDate') === fbToday) return;
        const reaction = btn.dataset.reaction;
        localStorage.setItem('feedbackDate', fbToday);
        localStorage.setItem('feedbackReaction', reaction);
        fbHit.classList.toggle('feedback-btn--active', reaction === 'hit');
        fbMiss.classList.toggle('feedback-btn--active', reaction === 'miss');
        tg.HapticFeedback.impactOccurred('medium');
        showToast(reaction === 'hit' ? '🎯 Отлично! Прогноз работает' : '↩ Понятно, учтём это', '#b07d2c');
        // Отправляем на сервер (если есть initData)
        const initData = tg.initData;
        if (initData) {
          fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
            body: JSON.stringify({ date: fbToday, reaction }),
          }).catch(() => {});
        }
      });
    });
  }

  // Listeners добавляются только один раз
  if (_todayInited) return;
  _todayInited = true;

  // Еженедельный итог (показываем после рендера, 1.5с)
  if (_pendingWeeklySummary) {
    const s = _pendingWeeklySummary;
    _pendingWeeklySummary = 0;
    setTimeout(() => showWeeklySummary(s, moon), 1500);
  }

  // Color + Number accordion toggle (same pattern as domain cards)
  [
    { id: 'color-acc-card' },
    { id: 'num-acc-card' },
  ].forEach(({ id }) => {
    const card = $(id);
    if (!card) return;
    const header = card.querySelector('.domain-card-header');
    header.addEventListener('click', () => {
      const isOpen = card.classList.contains('open');
      // Закрыть все аккордеоны (домены + цвет + число)
      document.querySelectorAll('.domain-card').forEach(c => {
        c.classList.remove('open');
        c.querySelector('.domain-card-header').setAttribute('aria-expanded', 'false');
        c.querySelector('.domain-card-body').hidden = true;
      });
      if (!isOpen) {
        tg.HapticFeedback.impactOccurred('light');
        card.classList.add('open');
        header.setAttribute('aria-expanded', 'true');
        card.querySelector('.domain-card-body').hidden = false;
      }
    });
  });

  // Domain grid cards — tap → bottom sheet
  document.querySelectorAll('.domain-grid-card[data-domain]').forEach(card => {
    card.addEventListener('click', () => {
      const domain = card.dataset.domain;
      const meta = DOMAIN_META[domain] || {};
      tg.HapticFeedback.impactOccurred('light');
      openSheet({
        icon: meta.icon,
        title: meta.label,
        text: domains[domain] || ''
      });
    });
  });

  // Share button — энергия дня
  $('today-share')?.addEventListener('click', () => {
    const text = `${moon.emoji} Луна в ${moon.signRu} · ${moon.lunarDay}-й лунный день · ${moon.phaseName}\nСегодня хорошо: ${phaseTips.good || ''}\n✨ Selenyx — личный навигатор`;
    tg.HapticFeedback.impactOccurred('light');
    if (tg.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=https://t.me/Selenyx_mybot&text=${encodeURIComponent(text)}`);
    } else {
      navigator.share?.({ text }) || navigator.clipboard?.writeText(text).then(() => showToast('Скопировано ✓'));
    }
  });


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
  // Зодиакальная астролябия
  setHTML('moon-wheel-wrap', _buildCelestialWheel(moon));

  setText('moon-phase-name', moon.phaseName);
  const deg = moon.moonLon != null ? ` · ${Math.floor(moon.moonLon % 30)}°` : '';
  setText('moon-sign-name', `Луна в ${moon.signRu}${deg} · ${moon.illumination}% освещённости`);

  // Энергия знака где Луна сейчас (не знак пользователя, а астрономический)
  setText('moon-sign-energy-label', `🌙 Луна в ${moon.signRu} — что это значит`);
  const signEnergy = MOON_SIGN_ENERGY[moon.sign] || '';
  setText('moon-sign-energy-text', signEnergy);
  wrapTerms($('moon-sign-energy-text'));

  // Лунный день — карточка с описанием + кнопка практики
  const ld = LUNAR_DAYS[moon.lunarDay] || {};
  setHTML('moon-lunar-info', `
    <div class="moon-ld-header">
      <span class="moon-ld-icon">${ld.symbol || '🌙'}</span>
      <span class="card-label">${moon.lunarDay}-й лунный день${ld.name ? ' · ' + ld.name : ''}</span>
    </div>
    ${ld.hint ? `<p class="card-text moon-ld-text">${ld.hint}</p>` : ''}
    ${ld.practice ? `<button class="moon-ld-practice-btn">Практика на сегодня →</button>` : ''}
  `);

  const practiceBtn = $('moon-lunar-info')?.querySelector('.moon-ld-practice-btn');
  if (practiceBtn) {
    practiceBtn.onclick = () => {
      tg.HapticFeedback.impactOccurred('light');
      openSheet({
        icon: `<span style="font-size:48px">${ld.symbol || '🌙'}</span>`,
        title: `${moon.lunarDay}-й лунный день — ${ld.name || ''}`,
        text: ld.practice || '',
        sections: [],
      });
    };
  }

}

/**
 * Строит SVG-астролябию — зодиакальное колесо с положением Луны.
 * Луна путешествует по эклиптике до своей реальной позиции.
 */
function _buildCelestialWheel(moon) {
  // ── Геометрия ──────────────────────────────────────────
  const cx = 150, cy = 150;
  const Ro = 118;   // внешнее кольцо зодиака
  const Rl = 133;   // глифы знаков
  const Rm = 96;    // позиция маркера Луны
  const Ri = 66;    // внутреннее кольцо (дома)
  const Rh = 28;    // хаб-центр

  // ── Зодиакальные глифы и цвета стихий ──────────────────
  const GLYPHS = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
  const ELEM   = [
    '#e87a58','#8baa88','#e8c870','#82aec8',  // огонь земля воздух вода
    '#e8a840','#a8c88a','#c8a8e0','#a04040',
    '#c09048','#7888a8','#7ab8e0','#8878c0',
  ];

  // ── Позиция Луны ────────────────────────────────────────
  const lon        = moon.moonLon != null ? moon.moonLon : 0;
  const signIdx    = Math.floor(lon / 30) % 12;
  const moonAngDeg = lon - 90;                           // Овен на верхушке
  const moonRad    = moonAngDeg * Math.PI / 180;
  const moonX      = +(cx + Rm * Math.cos(moonRad)).toFixed(2);
  const moonY      = +(cy + Rm * Math.sin(moonRad)).toFixed(2);

  // Стартовая позиция анимации Луны (от Овна, верх)
  const startX = cx;
  const startY = cy - Rm;

  // Путь Луны по дуге от Овна до текущей позиции
  // Луна идёт по кругу радиуса Rm от верхней точки до moonRad
  const sweepDeg = ((lon % 360) + 360) % 360; // всегда 0-360
  const largeArc = sweepDeg > 180 ? 1 : 0;
  // midpoint для дуги (если sweepDeg > 0)
  const midRad   = (sweepDeg / 2 - 90) * Math.PI / 180;
  const midX     = +(cx + Rm * Math.cos(midRad)).toFixed(2);
  const midY     = +(cy + Rm * Math.sin(midRad)).toFixed(2);
  const moonPath = sweepDeg < 1
    ? `M ${startX} ${startY}`
    : `M ${startX} ${startY} A ${Rm} ${Rm} 0 ${largeArc} 1 ${moonX} ${moonY}`;
  const moonPathLen = +(sweepDeg / 360 * 2 * Math.PI * Rm).toFixed(1);
  const fullCirc    = +(2 * Math.PI * Rm).toFixed(1);

  // ── Окружности ──────────────────────────────────────────
  const outerC = +(2 * Math.PI * Ro).toFixed(1);
  const innerC = +(2 * Math.PI * Ri).toFixed(1);

  // ── Активный сектор ─────────────────────────────────────
  function secPath(si) {
    const s  = (si * 30 - 90) * Math.PI / 180;
    const e  = ((si + 1) * 30 - 90) * Math.PI / 180;
    const ix1 = +(cx + Ri * Math.cos(s)).toFixed(1), iy1 = +(cy + Ri * Math.sin(s)).toFixed(1);
    const ox1 = +(cx + Ro * Math.cos(s)).toFixed(1), oy1 = +(cy + Ro * Math.sin(s)).toFixed(1);
    const ox2 = +(cx + Ro * Math.cos(e)).toFixed(1), oy2 = +(cy + Ro * Math.sin(e)).toFixed(1);
    const ix2 = +(cx + Ri * Math.cos(e)).toFixed(1), iy2 = +(cy + Ri * Math.sin(e)).toFixed(1);
    return `M${ix1} ${iy1}L${ox1} ${oy1}A${Ro} ${Ro} 0 0 1 ${ox2} ${oy2}L${ix2} ${iy2}A${Ri} ${Ri} 0 0 0 ${ix1} ${iy1}Z`;
  }

  // ── Деления внешнего кольца (96 = каждые 3.75°, крупные — по 30°) ──
  let ticks = '';
  for (let i = 0; i < 96; i++) {
    const ang   = (i * (360 / 96) - 90) * Math.PI / 180;
    const major = i % 8 === 0;
    const r1    = Ro - (major ? 9 : 4);
    ticks += `<line x1="${+(cx+r1*Math.cos(ang)).toFixed(1)}" y1="${+(cy+r1*Math.sin(ang)).toFixed(1)}"
      x2="${+(cx+Ro*Math.cos(ang)).toFixed(1)}" y2="${+(cy+Ro*Math.sin(ang)).toFixed(1)}"
      stroke="rgba(196,154,60,${major ? '.45' : '.18'})" stroke-width="${major ? 1.4 : .7}"/>`;
  }

  // ── Разделительные спицы и домовые линии ────────────────
  let spokes = '';
  for (let i = 0; i < 12; i++) {
    const ang = (i * 30 - 90) * Math.PI / 180;
    const ix = +(cx + Ri * Math.cos(ang)).toFixed(1), iy = +(cy + Ri * Math.sin(ang)).toFixed(1);
    const ox = +(cx + Ro * Math.cos(ang)).toFixed(1), oy = +(cy + Ro * Math.sin(ang)).toFixed(1);
    const hx = +(cx + (Rh + 2) * Math.cos(ang)).toFixed(1), hy = +(cy + (Rh + 2) * Math.sin(ang)).toFixed(1);
    // внешняя спица (между кольцами)
    spokes += `<line x1="${ix}" y1="${iy}" x2="${ox}" y2="${oy}" stroke="rgba(196,154,60,.22)" stroke-width=".8"
      class="cw-spoke" style="animation-delay:${(.42 + i * .045).toFixed(3)}s"/>`;
    // внутренняя домовая линия (хаб → внутреннее кольцо)
    spokes += `<line x1="${hx}" y1="${hy}" x2="${ix}" y2="${iy}" stroke="rgba(196,154,60,.10)" stroke-width=".5"
      class="cw-spoke" style="animation-delay:${(.48 + i * .045).toFixed(3)}s"/>`;
  }

  // ── Глифы знаков ────────────────────────────────────────
  let glyphs = '';
  for (let i = 0; i < 12; i++) {
    const ang    = ((i * 30 + 15) - 90) * Math.PI / 180;
    const lx     = +(cx + Rl * Math.cos(ang)).toFixed(1);
    const ly     = +(cy + Rl * Math.sin(ang)).toFixed(1);
    const active = i === signIdx;
    glyphs += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central"
      font-size="${active ? 15 : 10}" fill="${active ? ELEM[i] : 'rgba(175,148,86,.48)'}"
      class="cw-glyph" style="animation-delay:${(.58 + i * .055).toFixed(3)}s">${GLYPHS[i]}</text>`;
  }

  // ── CSS-анимации (внутри SVG <style> — изолированы) ─────
  const styles = `
    #cw-root { animation: cwAppear .85s cubic-bezier(.16,1,.3,1) both }
    @keyframes cwAppear { from{opacity:0;transform:scale(.86)} to{opacity:1;transform:scale(1)} }

    .cw-outer {
      stroke-dasharray:${outerC} ${outerC};
      stroke-dashoffset:${outerC};
      animation:cwDraw 1.8s cubic-bezier(.16,1,.3,1) .12s forwards
    }
    .cw-inner {
      stroke-dasharray:${innerC} ${innerC};
      stroke-dashoffset:${innerC};
      animation:cwDraw 1.2s cubic-bezier(.16,1,.3,1) .38s forwards
    }
    @keyframes cwDraw { to{stroke-dashoffset:0} }

    .cw-spoke { opacity:0; animation:cwSpokeIn .3s ease forwards }
    @keyframes cwSpokeIn { to{opacity:1} }

    .cw-glyph {
      opacity:0;
      animation:cwGlyphIn .55s cubic-bezier(.34,1.56,.64,1) forwards
    }
    @keyframes cwGlyphIn {
      from{opacity:0;transform-box:fill-box;transform:scale(.25)}
      to{opacity:1;transform-box:fill-box;transform:scale(1)}
    }

    .cw-sector { opacity:0; animation:cwSecIn .7s ease 1.55s forwards }
    @keyframes cwSecIn { to{opacity:1} }

    /* Луна путешествует по дуге эклиптики */
    .cw-trail {
      stroke-dasharray:${moonPathLen} ${fullCirc};
      stroke-dashoffset:${moonPathLen};
      animation:cwTrail .9s cubic-bezier(.4,0,.2,1) 1.6s forwards
    }
    @keyframes cwTrail { to{stroke-dashoffset:0} }

    .cw-moon-marker {
      opacity:0;
      transform-box:fill-box;
      transform-origin:center center;
      animation:cwMoonPop .65s cubic-bezier(.34,1.56,.64,1) ${(1.6 + (sweepDeg / 360) * 0.9 + 0.1).toFixed(2)}s forwards
    }
    @keyframes cwMoonPop {
      from{opacity:0;transform:scale(.05)}
      to{opacity:1;transform:scale(1)}
    }

    .cw-halo {
      opacity:0;
      transform-box:fill-box;
      transform-origin:center center;
      animation:cwHaloPulse 3s ease-in-out ${(1.6 + (sweepDeg / 360) * 0.9 + 0.25).toFixed(2)}s infinite
    }
    @keyframes cwHaloPulse {
      0%{opacity:.12;transform:scale(1)}
      50%{opacity:.55;transform:scale(1.7)}
      100%{opacity:.12;transform:scale(1)}
    }

    /* Внешнее кольцо медленно вращается — астролябия живая */
    .cw-spin {
      transform-origin:150px 150px;
      animation:cwSpin 110s linear infinite
    }
    @keyframes cwSpin { to{transform:rotate(360deg)} }

    .cw-hub-text { animation:cwHubIn .5s ease 1.9s both }
    @keyframes cwHubIn { from{opacity:0;transform-box:fill-box;transform:scale(.7)} to{opacity:1;transform:scale(1)} }
  `;

  return `<svg id="cw-root" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"
    role="img" aria-label="Зодиакальное колесо — Луна в ${moon.signRu}, ${moon.lunarDay}-й лунный день"
    style="width:100%;max-width:300px;display:block;margin:0 auto;overflow:visible">
  <defs>
    <radialGradient id="cwBg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(20,14,44,.9)"/>
      <stop offset="100%" stop-color="rgba(8,5,20,0)"/>
    </radialGradient>
    <radialGradient id="cwHub" cx="30%" cy="25%" r="85%">
      <stop offset="0%" stop-color="#252048"/>
      <stop offset="100%" stop-color="#0c0820"/>
    </radialGradient>
    <radialGradient id="cwMoon" cx="38%" cy="28%" r="80%">
      <stop offset="0%" stop-color="#fde68a"/>
      <stop offset="55%" stop-color="#d4a847"/>
      <stop offset="100%" stop-color="#7c3a08"/>
    </radialGradient>
    <filter id="cwGlw" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="cwGlwS" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <style>${styles}</style>
  </defs>

  <!-- Фоновое свечение центра -->
  <circle cx="${cx}" cy="${cy}" r="148" fill="url(#cwBg)"/>

  <!-- ─── Вращающееся внешнее кольцо + деления ─── -->
  <g class="cw-spin">
    ${ticks}
    <circle cx="${cx}" cy="${cy}" r="${Ro}" fill="none"
      stroke="rgba(196,154,60,.58)" stroke-width="1.8" class="cw-outer"/>
  </g>

  <!-- ─── Статика: внутреннее кольцо ─── -->
  <circle cx="${cx}" cy="${cy}" r="${Ri}" fill="none"
    stroke="rgba(196,154,60,.28)" stroke-width=".9" class="cw-inner"/>

  <!-- ─── Спицы + домовые линии ─── -->
  ${spokes}

  <!-- ─── Активный сектор знака ─── -->
  <path d="${secPath(signIdx)}"
    fill="rgba(${ELEM[signIdx].slice(1).match(/../g).map(h=>parseInt(h,16)).join(',')}, .08)"
    stroke="${ELEM[signIdx]}" stroke-width=".7" opacity=".7"
    class="cw-sector"/>

  <!-- ─── Глифы знаков ─── -->
  ${glyphs}

  <!-- ─── Хаб ─── -->
  <circle cx="${cx}" cy="${cy}" r="${Rh + 4}" fill="none"
    stroke="rgba(196,154,60,.18)" stroke-width=".6"/>
  <circle cx="${cx}" cy="${cy}" r="${Rh}" fill="url(#cwHub)"
    stroke="rgba(196,154,60,.42)" stroke-width="1.1"/>

  <!-- Число лунного дня + надпись -->
  <g class="cw-hub-text">
    <text x="${cx}" y="${cy - 7}" text-anchor="middle" dominant-baseline="central"
      font-family="'Cormorant Garamond',Georgia,serif" font-size="26" font-style="italic"
      fill="rgba(237,218,165,.95)">${moon.lunarDay}</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" dominant-baseline="central"
      font-family="'DM Sans',sans-serif" font-size="6" letter-spacing="2.2"
      fill="rgba(175,144,70,.60)">ЛУН ДЕНЬ</text>
  </g>

  <!-- ─── Хвост-след: дуга пройденного пути Луны ─── -->
  ${moonPathLen > 2 ? `<path d="${moonPath}"
    fill="none"
    stroke="rgba(212,168,74,.35)" stroke-width="1.4" stroke-linecap="round"
    class="cw-trail"/>` : ''}

  <!-- ─── Гало Луны (пульсирует) ─── -->
  <g transform="translate(${moonX},${moonY})" class="cw-halo" filter="url(#cwGlwS)">
    <circle r="16" fill="rgba(212,168,74,.45)"/>
  </g>

  <!-- ─── Маркер Луны ─── -->
  <g transform="translate(${moonX},${moonY})" class="cw-moon-marker" filter="url(#cwGlw)">
    <circle r="14" fill="url(#cwMoon)"/>
  </g>
  <g transform="translate(${moonX},${moonY})" class="cw-moon-marker">
    <circle r="5.5" fill="#fffef8"/>
  </g>

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
  const cookie = $('oracle-cookie');
  const veil   = $('oracle-veil');
  if (cookie) {
    cookie.classList.remove('revealed', 'cracking');
    cookie.style.display = '';
  }
  if (veil) {
    veil.classList.add('hidden');
    // Reset animations so they replay on next reveal
    const resetEls = veil.querySelectorAll('.oracle-reveal-content, .oracle-share-btn');
    resetEls.forEach(el => { el.style.animation = 'none'; el.offsetHeight; el.style.animation = ''; });
  }
  show('oracle-cookie-wrap');

  if (cookie) cookie.addEventListener('click', revealFortune, { once: true });
}

function revealFortune() {
  if (fortuneRevealed) return;
  fortuneRevealed = true;

  const cookie    = $('oracle-cookie');
  const veil      = $('oracle-veil');
  const particles = $('oracle-particles');

  // 1. Crack + haptic
  if (cookie) cookie.classList.add('cracking');
  tg.HapticFeedback.impactOccurred('heavy');

  // 2. Вспышка — сразу в момент тапа
  const flash = document.createElement('div');
  flash.className = 'oracle-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 600);

  // 3. Взрыв частиц — мощный, 3 волны
  if (particles) {
    particles.innerHTML = '';
    const colors  = ['#FFD700','#F5C842','#E8B96E','#fff8e7','#ffffff','#FFF0A0'];
    const colors2 = ['#FFD700','#FF9E2C','#FFF0A0'];

    // Волна 1 — основной взрыв: 32 круглые частицы по всем углам
    for (let i = 0; i < 32; i++) {
      const p   = document.createElement('span');
      p.className = 'oracle-particle';
      const angle = (360 / 32) * i + Math.random() * 10 - 5;
      const dist  = 160 + Math.random() * 220;
      const rad   = (angle * Math.PI) / 180;
      const size  = 5 + Math.random() * 11;
      p.style.setProperty('--tx',    `${(Math.cos(rad) * dist).toFixed(1)}px`);
      p.style.setProperty('--ty',    `${(Math.sin(rad) * dist).toFixed(1)}px`);
      p.style.setProperty('--delay', `${(Math.random() * 0.06).toFixed(2)}s`);
      p.style.setProperty('--dur',   `${(1.0 + Math.random() * 0.8).toFixed(2)}s`);
      p.style.setProperty('--size',  `${size.toFixed(0)}px`);
      p.style.setProperty('--rot',   `${(90 + Math.random() * 180).toFixed(0)}deg`);
      p.style.setProperty('--color', colors[Math.floor(Math.random() * colors.length)]);
      particles.appendChild(p);
    }

    // Волна 2 — вытянутые искры-стрелки: 18 штук
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('span');
      p.className = 'oracle-spark';
      const angle = (360 / 18) * i + Math.random() * 15;
      const dist  = 100 + Math.random() * 180;
      const rad   = (angle * Math.PI) / 180;
      p.style.setProperty('--tx',    `${(Math.cos(rad) * dist).toFixed(1)}px`);
      p.style.setProperty('--ty',    `${(Math.sin(rad) * dist).toFixed(1)}px`);
      p.style.setProperty('--delay', `${(0.02 + Math.random() * 0.08).toFixed(2)}s`);
      p.style.setProperty('--dur',   `${(0.7 + Math.random() * 0.5).toFixed(2)}s`);
      p.style.setProperty('--size',  `${(3 + Math.random() * 3).toFixed(0)}px`);
      p.style.setProperty('--rot',   `${angle.toFixed(0)}deg`);
      p.style.setProperty('--color', colors2[Math.floor(Math.random() * colors2.length)]);
      particles.appendChild(p);
    }

    // Волна 3 — крупные золотые вспышки близко к центру: 8 штук
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('span');
      p.className = 'oracle-particle';
      const angle = Math.random() * 360;
      const dist  = 55 + Math.random() * 90;
      const rad   = (angle * Math.PI) / 180;
      p.style.setProperty('--tx',    `${(Math.cos(rad) * dist).toFixed(1)}px`);
      p.style.setProperty('--ty',    `${(Math.sin(rad) * dist).toFixed(1)}px`);
      p.style.setProperty('--delay', '0s');
      p.style.setProperty('--dur',   `${(0.5 + Math.random() * 0.3).toFixed(2)}s`);
      p.style.setProperty('--size',  `${(16 + Math.random() * 12).toFixed(0)}px`);
      p.style.setProperty('--rot',   '60deg');
      p.style.setProperty('--color', '#FFD700');
      particles.appendChild(p);
    }
  }

  // 4. Вуаль появляется через 320мс
  setTimeout(() => {
    hide('oracle-cookie-wrap');
    if (veil) veil.classList.remove('hidden');

    // 5. Данные оракула
    const moon    = calcMoonData();
    const weekday = new Date().getDay();
    const oracle  = getDailyOracle(userSign || 'aries', moon.phase, weekday, moon.lunarDay);
    setText('oracle-context', oracle.context);

    // 6. Печатающий эффект: слово за словом, 155мс/слово, старт через 1100мс от тапа
    setTimeout(() => {
      tg.HapticFeedback.notificationOccurred('success');
      const predEl = $('oracle-prediction');
      if (predEl) {
        predEl.innerHTML = '';

        // Курсор
        const cursor = document.createElement('span');
        cursor.className = 'oracle-cursor';
        predEl.appendChild(cursor);

        const words = oracle.text.split(' ');
        let idx = 0;
        const interval = setInterval(() => {
          if (idx < words.length) {
            // Вставляем слово перед курсором
            predEl.insertBefore(
              document.createTextNode((idx === 0 ? '' : ' ') + words[idx]),
              cursor
            );
            idx++;
          } else {
            clearInterval(interval);
            cursor.remove();
            wrapTerms(predEl);
          }
        }, 155);
      }

      // 7. Кнопка поделиться (CSS задержка 2.8s от появления контента)
      const shareBtn = $('oracle-share');
      if (shareBtn) {
        shareBtn.onclick = () => {
          const shareText = `✨ Послание дня:\n«${oracle.text}»\n${oracle.context}\n\nSеленyx — личный навигатор → @Selenyx_mybot`;
          if (tg.openTelegramLink) {
            tg.openTelegramLink(`https://t.me/share/url?url=https://t.me/Selenyx_mybot/app&text=${encodeURIComponent(shareText)}`);
          } else {
            window.open(`https://t.me/share/url?url=https://t.me/Selenyx_mybot/app&text=${encodeURIComponent(shareText)}`, '_blank');
          }
          tg.HapticFeedback.impactOccurred('medium');
        };
      }
    }, 780);   // 320мс вуаль + 780мс = 1100мс от тапа
  }, 320);
}

// ─── Settings overlay ─────────────────────────────────────────────────────────
function openSettings() {
  show('settings-overlay');
  tg.BackButton.show();
  tg.BackButton.onClick(closeSettings);

  // Pre-fill sign
  const signSelect = $('settings-sign');
  if (signSelect) signSelect.value = userSign || 'aries';

  // Pre-fill goal cards
  const savedGoal = localStorage.getItem('obGoal');
  document.querySelectorAll('#settings-goal-cards .goal-card').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.goal === savedGoal);
    btn.addEventListener('click', () => {
      document.querySelectorAll('#settings-goal-cards .goal-card').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tg.HapticFeedback.impactOccurred('light');
    });
  });

  // Pre-fill notify time
  const notifyInput = $('settings-notify');
  const saved = localStorage.getItem('notifyTime');
  if (notifyInput && saved) notifyInput.value = saved;

  $('settings-save')?.addEventListener('click', saveSettings);
  $('settings-close')?.addEventListener('click', closeSettings);

  // Natal section
  _refreshSettingsNatal();
  const natalSaveBtn = $('settings-natal-save');
  if (natalSaveBtn && !natalSaveBtn.dataset.init) {
    natalSaveBtn.dataset.init = '1';
    natalSaveBtn.addEventListener('click', _saveSettingsNatal);
  }
}

function _refreshSettingsNatal() {
  const resultEl = $('settings-natal-result');
  const formEl   = $('settings-natal-form');
  if (!resultEl || !formEl) return;

  if (userBirth?.date) {
    const natal = calcNatalChart(userBirth.date, userBirth.time || '');
    if (natal) {
      const nSun  = SIGNS.find(s => s.id === natal.sun)  || {};
      const nMoon = SIGNS.find(s => s.id === natal.moon) || {};
      const nAsc  = SIGNS.find(s => s.id === natal.asc)  || {};
      resultEl.innerHTML = `
        <div class="natal-mini-row">${nSun.emoji || '☀️'} <b>Солнце</b> в ${nSun.ru || natal.sun}</div>
        <div class="natal-mini-row">${nMoon.emoji || '🌙'} <b>Луна</b> в ${nMoon.ru || natal.moon}</div>
        ${natal.asc ? `<div class="natal-mini-row">⬆️ <b>Асцендент</b> в ${nAsc.ru || natal.asc}</div>` : ''}
        <button class="btn-ghost full-width" style="margin-top:10px;font-size:12px;opacity:.55"
          onclick="localStorage.removeItem('userBirth');userBirth=null;_refreshSettingsNatal();">Изменить дату рождения</button>`;
      resultEl.classList.remove('hidden');
      formEl.classList.add('hidden');
      return;
    }
  }
  resultEl.classList.add('hidden');
  formEl.classList.remove('hidden');
}

function _saveSettingsNatal() {
  const d = $('settings-birth-date')?.value?.trim();
  const t = $('settings-birth-time')?.value?.trim() || '';
  if (!d || !/^\d{2}\.\d{2}\.\d{4}$/.test(d)) {
    showToast('Формат даты: ДД.ММ.ГГГГ', '#c0392b');
    return;
  }
  userBirth = { date: d, time: t };
  localStorage.setItem('userBirth', JSON.stringify(userBirth));
  tg.HapticFeedback.notificationOccurred('success');
  showToast('Карта сохранена ✓', '#27ae60');
  sessionStorage.clear(); // сбросить кэш — число судьбы пересчитается
  _refreshSettingsNatal();
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

  // Сохранить новый фокус если изменился
  const activeGoal = $('settings-goal-cards')?.querySelector('.goal-card.active');
  if (activeGoal?.dataset.goal) {
    localStorage.setItem('obGoal', activeGoal.dataset.goal);
    _quiz.goal = activeGoal.dataset.goal;
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
  // Имя пользователя в хедере
  const name = tg.initDataUnsafe?.user?.first_name || localStorage.getItem('userName') || '';
  const nameEl = $('header-name');
  if (nameEl && name) nameEl.textContent = name;

  $('settings-btn')?.addEventListener('click', openSettings);

  // База знаний — кнопка в хедере (один раз при инициализации)
  $('kb-header-btn')?.addEventListener('click', () => {
    tg.HapticFeedback.impactOccurred('light');
    openKnowledge();
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
  tg.BackButton.offClick(closeKnowledge);
  tg.BackButton.hide();
  // Переключаемся обратно на активную вкладку
  switchTab(currentTab);
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

  // BackButton — возврат к списку статей, не закрытие оверлея
  tg.BackButton.offClick(closeKnowledge);
  tg.BackButton.onClick(_kbBackToList);
}

function _kbBackToList() {
  tg.BackButton.offClick(_kbBackToList);
  tg.BackButton.onClick(closeKnowledge);
  hide('kb-detail-view');
  show('kb-list-view');
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

// ─── ДИАГНОСТИКА ──────────────────────────────────────────────────────────────

let _diagSelected = [];

function openDiag() {
  _diagSelected = [];
  const overlay = $('diag-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  show('diag-pick-view');
  hide('diag-result-view');
  renderDiagColors();
  tg.BackButton.show();
  tg.BackButton.onClick(closeDiag);
  tg.HapticFeedback.impactOccurred('light');
}

function closeDiag() {
  hide('diag-overlay');
  tg.BackButton.offClick(closeDiag);
  tg.BackButton.hide();
  switchTab(currentTab);
}

function renderDiagColors() {
  const grid = $('diag-colors');
  if (!grid || typeof COLOR_PSYCHOLOGY === 'undefined') return;
  // Перемешиваем порядок каждый день
  const keys = [...COLOR_TEST_ORDER].sort(() => {
    const seed = new Date().toDateString();
    return (seed.charCodeAt(Math.random() * seed.length | 0) % 3) - 1;
  });
  grid.innerHTML = keys.map(key => {
    const c = COLOR_PSYCHOLOGY[key];
    return `<div class="diag-color-card" data-key="${key}" style="background:${c.hex}" role="button" tabindex="0" aria-label="${c.name}">
      <div class="diag-color-check">✓</div>
      <span class="diag-color-name">${c.name}</span>
    </div>`;
  }).join('');

  grid.querySelectorAll('.diag-color-card').forEach(card => {
    card.addEventListener('click', () => onDiagColorTap(card));
  });
  updateDiagCountHint();
}

function onDiagColorTap(card) {
  const key = card.dataset.key;
  if (_diagSelected.includes(key)) {
    _diagSelected = _diagSelected.filter(k => k !== key);
    card.classList.remove('selected');
  } else {
    if (_diagSelected.length >= 2) return;
    _diagSelected.push(key);
    card.classList.add('selected');
    tg.HapticFeedback.impactOccurred('light');
  }
  updateDiagCountHint();
  if (_diagSelected.length === 2) {
    setTimeout(() => showDiagResult(), 400);
  }
}

function updateDiagCountHint() {
  const el = $('diag-count-hint');
  if (el) el.textContent = `Выбрано: ${_diagSelected.length} из 2`;
}

function showDiagResult() {
  if (typeof COLOR_PSYCHOLOGY === 'undefined') return;
  const [k1, k2] = _diagSelected;
  const c1 = COLOR_PSYCHOLOGY[k1];
  const c2 = COLOR_PSYCHOLOGY[k2];

  // Ищем трактовку пары
  const pairKey1 = `${k1}+${k2}`;
  const pairKey2 = `${k2}+${k1}`;
  const pair = (typeof COLOR_PAIR_PSYCHOLOGY !== 'undefined') &&
    (COLOR_PAIR_PSYCHOLOGY[pairKey1] || COLOR_PAIR_PSYCHOLOGY[pairKey2]);

  const title = pair ? pair.title : `${c1.name} + ${c2.name}`;
  const text  = pair ? pair.text  : `${c1.text} ${c2.text}`;

  // Цветные кружки
  setHTML('diag-result-colors', `
    <div class="diag-result-swatch" style="background:${c1.hex}"></div>
    <div class="diag-result-swatch" style="background:${c2.hex}"></div>
  `);
  setText('diag-result-title', title);
  setText('diag-result-text', text);

  hide('diag-pick-view');
  show('diag-result-view');
  tg.HapticFeedback.notificationOccurred('success');

  // Сброс кнопок фидбека
  ['diag-hit', 'diag-miss'].forEach(id => $(`${id}`)?.classList.remove('active'));
}

function initDiag() {
  $('diag-start-btn')?.addEventListener('click', () => {
    tg.HapticFeedback.impactOccurred('medium');
    openDiag();
  });
  $('diag-close')?.addEventListener('click', closeDiag);
  $('diag-result-close')?.addEventListener('click', closeDiag);

  $('diag-hit')?.addEventListener('click', () => {
    $('diag-hit').classList.add('active');
    $('diag-miss').classList.remove('active');
    tg.HapticFeedback.notificationOccurred('success');
  });
  $('diag-miss')?.addEventListener('click', () => {
    $('diag-miss').classList.add('active');
    $('diag-hit').classList.remove('active');
    tg.HapticFeedback.impactOccurred('light');
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initHeaderButtons();
  initTermTooltips();
  initKnowledge();
  initDiag();

  initSplash();
});
