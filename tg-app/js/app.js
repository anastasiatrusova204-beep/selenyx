/**
 * app.js — точка входа, навигация, анимации, инициализация
 *
 * Порядок запуска:
 *   1. Telegram SDK настраивается (цвета, Back Button)
 *   2. Показывается экран загрузки
 *   3. Параллельно: /api/me + /api/today
 *   4. Если знак не задан — экран онбординга
 *   5. Иначе — анимированный экран Луны
 *   6. Тап по Луне → взрыв частиц → SPA-приложение
 *
 * Навигация между экранами — через showScreen(id)
 * Навигация между вкладками — через switchTab(key)
 */

/* ───────────────────────────────────────────────────────────
   КОНСТАНТЫ
   ─────────────────────────────────────────────────────────── */

// Все знаки зодиака для экрана онбординга
// key — английское название (для API), name — русское
const ZODIAC_LIST = [
  { key: 'aries',       emoji: '♈', name: 'Овен'     },
  { key: 'taurus',      emoji: '♉', name: 'Телец'    },
  { key: 'gemini',      emoji: '♊', name: 'Близнецы' },
  { key: 'cancer',      emoji: '♋', name: 'Рак'      },
  { key: 'leo',         emoji: '♌', name: 'Лев'      },
  { key: 'virgo',       emoji: '♍', name: 'Дева'     },
  { key: 'libra',       emoji: '♎', name: 'Весы'     },
  { key: 'scorpio',     emoji: '♏', name: 'Скорпион' },
  { key: 'sagittarius', emoji: '♐', name: 'Стрелец'  },
  { key: 'capricorn',   emoji: '♑', name: 'Козерог'  },
  { key: 'aquarius',    emoji: '♒', name: 'Водолей'  },
  { key: 'pisces',      emoji: '♓', name: 'Рыбы'     },
];

// Глобальное состояние приложения
const state = {
  me: null,           // данные /api/me
  today: null,        // данные /api/today
  moonData: null,     // данные /api/moon (загружается при переходе на вкладку)
  natalData: null,    // данные /api/natal
  activeTab: 'today', // текущая вкладка
};

/* ───────────────────────────────────────────────────────────
   ИНИЦИАЛИЗАЦИЯ
   ─────────────────────────────────────────────────────────── */

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  // Настраиваем Telegram WebApp SDK
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();                          // сообщаем Telegram что приложение готово
    tg.expand();                          // разворачиваем на весь экран
    tg.setHeaderColor('#0d0d1a');         // цвет заголовка (совпадает с фоном)
    tg.setBackgroundColor('#0d0d1a');
  }

  // Показываем экран загрузки
  showScreen('loading');

  try {
    // Параллельная загрузка профиля и данных дня (без waterfall!)
    const [meData, todayData] = await loadAll();
    state.me = meData;
    state.today = todayData;

    // Небольшая задержка чтобы анимация загрузки успела показаться
    await delay(500);

    if (!meData.sign) {
      // Знак не задан — показываем онбординг
      showOnboarding();
    } else {
      // Знак задан — показываем красивый экран Луны
      showMoonEntry();
    }
  } catch (err) {
    console.error('Ошибка инициализации:', err);
    // Если API недоступен — всё равно переходим в приложение
    await delay(500);
    showMoonEntry();
  }
}

/* ───────────────────────────────────────────────────────────
   НАВИГАЦИЯ МЕЖДУ ЭКРАНАМИ
   ─────────────────────────────────────────────────────────── */

/**
 * Переключает видимый экран
 * @param {string} screenId  - 'loading' | 'moon-entry' | 'onboarding' | 'app'
 */
function showScreen(screenId) {
  // Убираем активный класс со всех экранов
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('screen-active');
  });

  // Показываем нужный
  const target = document.getElementById(`screen-${screenId}`);
  if (target) {
    target.classList.add('screen-active');
  }
}

/**
 * Показывает экран онбординга (выбор знака)
 */
function showOnboarding() {
  // Заполняем сетку знаков
  const grid = document.getElementById('zodiac-grid');
  if (grid) {
    grid.innerHTML = ZODIAC_LIST.map(z => `
      <button
        class="zodiac-btn"
        data-key="${z.key}"
        aria-label="${z.name}"
        touch-action="manipulation"
      >
        <span class="zodiac-btn-emoji">${z.emoji}</span>
        <span>${z.name}</span>
      </button>
    `).join('');

    // Обработчики кнопок
    grid.querySelectorAll('.zodiac-btn').forEach(btn => {
      btn.addEventListener('click', handleSignSelect);
    });
  }

  showScreen('onboarding');
}

/**
 * Показывает анимированный экран с Луной
 */
function showMoonEntry() {
  showScreen('moon-entry');
  setupMoonTap();
  setupBackButton('moon-entry');
}

/**
 * Переходит в основное SPA-приложение
 */
function enterApp() {
  showScreen('app');
  setupTabBar();
  setupBackButton('app');

  // Отрисовываем первую вкладку
  if (state.today && state.me) {
    renderToday(state.me, state.today);
  }
}

/* ───────────────────────────────────────────────────────────
   ЭКРАН ОНБОРДИНГА — обработчик выбора знака
   ─────────────────────────────────────────────────────────── */

async function handleSignSelect(e) {
  const btn = e.currentTarget;
  const sign = btn.dataset.key;
  if (!sign) return;

  // Визуальный отклик
  btn.style.opacity = '0.5';
  btn.disabled = true;

  try {
    await saveSign(sign);
    // Обновляем состояние
    if (state.me) state.me.sign = sign;
    // Переходим к экрану с Луной
    showMoonEntry();
  } catch (err) {
    console.error('Ошибка сохранения знака:', err);
    showToast('Ошибка. Попробуй ещё раз.');
    btn.style.opacity = '1';
    btn.disabled = false;
  }
}

/* ───────────────────────────────────────────────────────────
   АНИМАЦИЯ ЛУНЫ — тап → взрыв → переход в приложение
   ─────────────────────────────────────────────────────────── */

function setupMoonTap() {
  const moonOrb = document.getElementById('moon-orb');
  if (!moonOrb) return;

  moonOrb.addEventListener('click', () => {
    // Запускаем взрыв частиц и переходим в приложение
    explodeParticles(() => {
      enterApp();
    });
  });
}

/**
 * Анимация взрыва частиц на canvas
 * @param {Function} onComplete  - вызывается после завершения анимации
 */
function explodeParticles(onComplete) {
  const canvas = document.getElementById('particles-canvas');
  const moonOrb = document.getElementById('moon-orb');
  if (!canvas || !moonOrb) {
    if (onComplete) onComplete();
    return;
  }

  const ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  // Центр взрыва — позиция Луны
  const rect   = moonOrb.getBoundingClientRect();
  const cx     = rect.left + rect.width  / 2;
  const cy     = rect.top  + rect.height / 2;

  // Создаём частицы
  const PARTICLE_COUNT = 60;
  const particles = [];
  const colors = ['#c9b1ff', '#ffd54f', '#e8e8f0', '#81c784', '#4dd0e1'];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle  = (Math.PI * 2 * i) / PARTICLE_COUNT + Math.random() * 0.5;
    const speed  = 4 + Math.random() * 8;
    const size   = 2 + Math.random() * 5;
    const color  = colors[Math.floor(Math.random() * colors.length)];
    particles.push({
      x:  cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      size,
      color,
    });
  }

  // Скрываем Луну
  moonOrb.style.transition = 'opacity 0.2s';
  moonOrb.style.opacity    = '0';

  const startTime = performance.now();
  const DURATION  = 850; // мс

  function animate(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / DURATION, 1);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      // Замедление
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.alpha = 1 - progress;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - progress * 0.5), 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      // Очищаем canvas и вызываем коллбек
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (onComplete) onComplete();
    }
  }

  requestAnimationFrame(animate);
}

/* ───────────────────────────────────────────────────────────
   НАВИГАЦИЯ ПО ВКЛАДКАМ
   ─────────────────────────────────────────────────────────── */

function setupTabBar() {
  const tabBar = document.querySelector('.tab-bar');
  if (!tabBar) return;

  tabBar.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', () => {
      const tabKey = item.dataset.tab;
      if (tabKey) switchTab(tabKey);
    });
  });
}

/**
 * Переключает активную вкладку
 * @param {string} key  - 'today' | 'moon' | 'natal' | 'compat'
 */
async function switchTab(key) {
  if (state.activeTab === key) return; // уже на этой вкладке
  state.activeTab = key;

  // Обновляем кнопки таб-бара
  document.querySelectorAll('.tab-item').forEach(item => {
    const isActive = item.dataset.tab === key;
    item.classList.toggle('tab-item-active', isActive);
    item.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Обновляем видимость контента вкладок
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.remove('tab-active');
  });
  const activeContent = document.getElementById(`tab-${key}`);
  if (activeContent) activeContent.classList.add('tab-active');

  // Ленивая загрузка данных для вкладки (только при первом открытии)
  await loadTabData(key);
}

/**
 * Загружает данные для вкладки если они ещё не загружены
 */
async function loadTabData(key) {
  try {
    switch (key) {
      case 'today':
        // Данные уже есть — просто перерисовываем
        if (state.today && state.me) {
          renderToday(state.me, state.today);
        }
        break;

      case 'moon':
        // Загружаем детальные данные о Луне если ещё не загружали
        if (!state.moonData) {
          state.moonData = await fetchMoon();
        }
        renderMoon(state.moonData);
        break;

      case 'natal':
        // Загружаем натальную карту
        if (state.natalData === undefined) {
          state.natalData = await fetchNatal(); // может быть null
        }
        renderNatal(state.natalData);
        break;

      case 'compat':
        // Показываем пикер без результата (selectedSign = null)
        renderCompat(null, null);
        break;
    }
  } catch (err) {
    console.error(`Ошибка загрузки вкладки ${key}:`, err);
    const tab = document.getElementById(`tab-${key}`);
    if (tab) {
      tab.innerHTML = `<div class="empty-state">Не удалось загрузить данные.<br>Попробуй ещё раз.</div>`;
    }
  }
}

/* ───────────────────────────────────────────────────────────
   TELEGRAM BACK BUTTON
   Поведение кнопки "назад" зависит от текущего экрана
   ─────────────────────────────────────────────────────────── */

/**
 * Настраивает Back Button Telegram SDK для текущего экрана
 * @param {string} screenId - текущий экран
 */
function setupBackButton(screenId) {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  if (screenId === 'app') {
    // В приложении Back Button возвращает к экрану Луны
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
      showMoonEntry();
    });
  } else if (screenId === 'moon-entry') {
    // На экране Луны — скрываем Back Button (некуда возвращаться)
    tg.BackButton.hide();
  }
}

/* ───────────────────────────────────────────────────────────
   PREMIUM — заглушка для покупки через Telegram Stars
   (реальный платёж будет добавлен в Шаге 12)
   ─────────────────────────────────────────────────────────── */

/**
 * buyFeature — вызывается из кнопок "⭐ N Звёзд"
 * Пока показывает toast; в Шаге 12 будет вызывать openInvoice
 * @param {string} featureId  - 'natal_forecast' | 'compat_deep'
 */
function buyFeature(featureId) {
  const tg = window.Telegram?.WebApp;

  // Шаг 12: здесь будет tg.openInvoice(invoiceLink, callback)
  // Пока — информационное уведомление
  showToast('Скоро: оплата через Telegram Stars ⭐');

  console.log('Запрошена покупка:', featureId);
}

// Делаем глобальной (вызывается из onclick в HTML screens.js)
window.buyFeature = buyFeature;

/* ───────────────────────────────────────────────────────────
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ─────────────────────────────────────────────────────────── */

/**
 * delay — промис-обёртка для setTimeout
 * @param {number} ms  - задержка в миллисекундах
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
