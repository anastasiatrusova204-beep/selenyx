/**
 * screens.js — отрисовка содержимого каждой вкладки
 *
 * Каждая функция renderXxx(data) принимает данные с API
 * и возвращает HTML-строку (или вставляет её в DOM напрямую).
 *
 * Структура:
 *   renderToday(me, today)  → вкладка ✨ Мой день
 *   renderMoon(data)         → вкладка 🌙 Луна
 *   renderNatal(data)        → вкладка 🌟 Моя карта
 *   renderCompat(sign, data) → вкладка 💞 Совместимость
 */

/* ───────────────────────────────────────────────────────────
   ВСПОМОГАТЕЛЬНЫЕ КОНСТАНТЫ
   ─────────────────────────────────────────────────────────── */

// Символы и цвета аспектов
// Ключи совпадают с тем, что приходит с сервера (astro.py)
const ASPECT_DISPLAY = {
  'соединение': { sym: '☌', label: 'усиление',        color: '#b39ddb' },
  'трин':       { sym: '△', label: 'гармония',         color: '#81c784' },
  'секстиль':   { sym: '✶', label: 'поддержка',        color: '#4dd0e1' },
  'квадрат':    { sym: '□', label: 'напряжение',       color: '#ffb74d' },
  'оппозиция':  { sym: '☍', label: 'противостояние',  color: '#ef9a9a' },
};

// Метки доменов (вкладок внутри "Мой день")
const DOMAIN_LABELS = {
  health: { emoji: '🏥', name: 'Здоровье' },
  work:   { emoji: '💼', name: 'Работа'   },
  love:   { emoji: '❤️', name: 'Любовь'  },
  mind:   { emoji: '🧠', name: 'Психология' },
};

// Порядок отображения доменов
const DOMAIN_ORDER = ['health', 'work', 'love', 'mind'];

// Планеты натальной карты с иконками
const NATAL_PLANETS = [
  { key: 'sun',  icon: '☀️', name: 'Солнце' },
  { key: 'moon', icon: '🌙', name: 'Луна'   },
  { key: 'asc',  icon: '⬆️', name: 'Асцендент' },
];

// Знаки зодиака для пикера совместимости
// (ключ — английское название, val — русское)
const COMPAT_SIGNS = [
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

/* ───────────────────────────────────────────────────────────
   renderToday — вкладка "✨ Мой день"
   ─────────────────────────────────────────────────────────── */

/**
 * @param {object} me     - данные из /api/me
 * @param {object} today  - данные из /api/today
 */
function renderToday(me, today) {
  const tab = document.getElementById('tab-today');
  if (!tab) return;

  const m = today.moon || {};
  const pe = today.phase_energy || {};
  const domains = today.domains || {};
  const color = today.color || {};
  const num = today.numerology || {};
  const streak = me?.streak || 0;

  // Бейдж со стриком (показываем только если streak >= 1)
  const streakHtml = streak >= 1
    ? `<div class="streak-badge">🔥 ${streak} ${pluralDays(streak)} подряд</div>`
    : '';

  // Шапка с фазой Луны
  const phaseHtml = `
    <div class="phase-hero">
      <div class="phase-emoji">${m.phase_emoji || '🌙'}</div>
      <div class="phase-name">${m.phase || 'Луна'}</div>
      <div class="phase-sub">
        Луна в ${m.sign_ru || m.sign || '—'}
        · ${m.lunar_day || '—'} лунный день
      </div>
      ${pe.intro ? `<div class="phase-tip">${pe.intro}</div>` : ''}
    </div>
  `;

  // Пилюли доменов — кнопки переключения
  const pillsHtml = `
    <div class="domains-pills" id="domain-pills">
      ${DOMAIN_ORDER.map((key, i) => {
        const d = DOMAIN_LABELS[key];
        return `<button
          class="domain-pill${i === 0 ? ' domain-active' : ''}"
          data-domain="${key}"
          touch-action="manipulation"
          aria-label="${d.name}"
        >${d.emoji} ${d.name}</button>`;
      }).join('')}
    </div>
  `;

  // Содержимое первого домена (Здоровье)
  const firstDomain = renderDomainContent('health', domains);

  // Предсказание (размыто, раскрывается по тапу)
  const prediction = today.prediction || 'Твой путь сегодня освещён лунным светом.';
  const predHtml = `
    <div class="prediction-card" id="prediction-card" role="button" aria-label="Открыть личное предсказание" touch-action="manipulation">
      <div class="info-card-title">🥠 Личное предсказание</div>
      <div class="prediction-blur" id="prediction-text">${prediction}</div>
      <div class="prediction-hint" id="prediction-hint">нажми, чтобы открыть</div>
    </div>
  `;

  // Итоговый HTML вкладки
  tab.innerHTML = `
    ${streakHtml}
    ${phaseHtml}
    ${pillsHtml}
    <div id="domain-content">${firstDomain}</div>
    ${predHtml}
  `;

  // Навешиваем события на пилюли доменов
  bindDomainPills(domains);

  // Событие на предсказание
  const predCard = document.getElementById('prediction-card');
  const predText = document.getElementById('prediction-text');
  const predHint = document.getElementById('prediction-hint');
  if (predCard && predText) {
    predCard.addEventListener('click', () => {
      predText.classList.add('revealed');
      if (predHint) predHint.classList.add('hidden');
    });
  }
}

/**
 * Отрисовывает содержимое домена (пункты good/avoid)
 * @param {string} key      - 'health' | 'work' | 'love' | 'mind'
 * @param {object} domains  - объект с массивами из today.domains
 */
function renderDomainContent(key, domains) {
  const items = domains[key];
  if (!items || !items.length) {
    return '<div class="empty-state">Нет данных для этого раздела</div>';
  }

  const listItems = items.map(item => `<li>${item}</li>`).join('');
  return `
    <div class="domain-content">
      <ul class="domain-items">${listItems}</ul>
    </div>
  `;
}

/**
 * Вешает обработчики кликов на пилюли доменов
 */
function bindDomainPills(domains) {
  const pillsContainer = document.getElementById('domain-pills');
  const contentContainer = document.getElementById('domain-content');
  if (!pillsContainer || !contentContainer) return;

  pillsContainer.querySelectorAll('.domain-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      // Убираем активный класс со всех
      pillsContainer.querySelectorAll('.domain-pill').forEach(p => {
        p.classList.remove('domain-active');
        p.setAttribute('aria-selected', 'false');
      });
      // Добавляем активный класс нажатой
      pill.classList.add('domain-active');
      pill.setAttribute('aria-selected', 'true');
      // Перерисовываем содержимое
      const domainKey = pill.dataset.domain;
      contentContainer.innerHTML = renderDomainContent(domainKey, domains);
    });
  });
}

/* ───────────────────────────────────────────────────────────
   renderMoon — вкладка "🌙 Луна"
   ─────────────────────────────────────────────────────────── */

/**
 * @param {object} data  - данные из /api/moon
 */
function renderMoon(data) {
  const tab = document.getElementById('tab-moon');
  if (!tab) return;

  // ─── Блок: Фаза и знак ───
  const phaseHtml = `
    <div class="phase-hero">
      <div class="phase-emoji">${data.phase_emoji || '🌙'}</div>
      <div class="phase-name">${data.phase || 'Луна'}</div>
      <div class="phase-sub">
        ${data.sign_ru || data.sign || '—'}, ${data.degree ? data.degree.toFixed(1) + '°' : ''}
      </div>
    </div>
  `;

  // ─── Блок: Лунный день ───
  const lunarHtml = `
    <div class="info-card">
      <div class="info-card-title">Лунный день</div>
      <div class="info-card-value">
        ⚡ ${data.lunar_day || '—'} день
        ${data.lunar_symbol ? `· ${data.lunar_symbol}` : ''}
      </div>
      ${data.lunar_energy ? `<div class="note" style="margin-top:6px">Энергия: ${data.lunar_energy}</div>` : ''}
      ${data.lunar_practice ? `<div class="note" style="margin-top:4px">Практика: ${data.lunar_practice}</div>` : ''}
    </div>
  `;

  // ─── Блок: Аспекты ───
  const aspects = data.aspects || [];
  const aspectsHtml = aspects.length ? `
    <div class="info-card">
      <div class="info-card-title">🪐 Аспекты планет</div>
      <div class="aspects-list">
        ${aspects.map(a => {
          // Находим отображение для аспекта или дефолт
          const ad = ASPECT_DISPLAY[a.aspect] || { sym: '·', label: a.aspect, color: 'var(--hint)' };
          return `
            <div class="aspect-item">
              <span class="aspect-planet">${a.label || a.planet || ''}</span>
              <span class="aspect-type" style="color:${ad.color}">
                <span class="aspect-symbol">${ad.sym}</span>
                ${ad.label}
              </span>
              <span class="aspect-hint">${a.hint || ''}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  // ─── Блок: Ретроградные планеты ───
  const retros = data.retrogrades || [];
  const retroHtml = retros.length ? `
    <div class="info-card retro-card">
      <div class="retro-title">⚠ Ретроградные планеты</div>
      ${retros.map(r => `
        <div class="retro-item">
          <span class="retro-emoji">${r.emoji || '⚠'}</span>
          <div>
            <div class="retro-name">${r.name || r.key || ''}</div>
            <div class="retro-hint">${r.hint || ''}</div>
          </div>
        </div>
      `).join('')}
    </div>
  ` : '';

  // ─── Блок: Цвет и число дня (дублируем для удобства) ───
  const color = data.color || {};
  const colorHtml = color.name ? `
    <div class="color-day">
      <div class="color-swatch" style="background:${color.hex || '#888'}"></div>
      <div>
        <div style="font-size:14px;font-weight:500">Цвет дня</div>
        <div class="note">${color.name}</div>
      </div>
    </div>
  ` : '';

  tab.innerHTML = `
    ${phaseHtml}
    ${lunarHtml}
    ${aspectsHtml}
    ${retroHtml}
    ${colorHtml}
  `;
}

/* ───────────────────────────────────────────────────────────
   renderNatal — вкладка "🌟 Моя карта"
   ─────────────────────────────────────────────────────────── */

/**
 * @param {object|null} data  - данные из /api/natal (null = нет данных)
 */
function renderNatal(data) {
  const tab = document.getElementById('tab-natal');
  if (!tab) return;

  if (!data) {
    // Состояние A: нет данных — показываем форму
    tab.innerHTML = `
      <div class="section-title">🌟 Моя карта</div>
      <p style="font-size:14px;color:var(--text-sub);margin-bottom:20px">
        Введи дату рождения, чтобы узнать положение Солнца, Луны и Асцендента в твоей карте.
      </p>
      <div class="natal-form" id="natal-form">
        <div class="form-group">
          <label class="form-label" for="birth-date">Дата рождения</label>
          <input
            class="form-input"
            id="birth-date"
            type="text"
            name="birthdate"
            autocomplete="bday"
            inputmode="numeric"
            placeholder="ДД.ММ.ГГГГ…"
            spellcheck="false"
            aria-label="Дата рождения в формате ДД.ММ.ГГГГ"
          >
        </div>
        <div class="form-group">
          <label class="form-label" for="birth-time">Время рождения <span class="note">(необязательно)</span></label>
          <input
            class="form-input"
            id="birth-time"
            type="text"
            name="birthtime"
            inputmode="numeric"
            placeholder="ЧЧ:ММ… (для точного асцендента)"
            spellcheck="false"
            aria-label="Время рождения в формате ЧЧ:ММ"
          >
        </div>
        <button class="btn-primary" id="natal-submit" type="button">
          Рассчитать карту →
        </button>
      </div>
    `;

    // Обработчик формы натальной карты
    document.getElementById('natal-submit')?.addEventListener('click', handleNatalSubmit);
  } else {
    // Состояние B: данные есть — показываем планеты + premium gate
    const planetsHtml = NATAL_PLANETS.map(p => {
      const sign = data[p.key] || '—';
      const desc = (data.descriptions || {})[p.key] || '';
      return `
        <div class="natal-planet-row">
          <span class="natal-planet-icon">${p.icon}</span>
          <div>
            <div style="display:flex;gap:8px;align-items:center">
              <span class="natal-planet-name">${p.name}</span>
              <span class="natal-planet-sign">${sign}</span>
            </div>
            ${desc ? `<div class="natal-planet-desc">${desc}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    tab.innerHTML = `
      <div class="section-title">🌟 Моя карта</div>
      <div class="info-card" style="margin-bottom:16px">${planetsHtml}</div>

      <!-- Прогноз на год — платный контент -->
      <div class="premium-gate">
        <div class="gate-blur-content info-card" style="opacity:0.4">
          <div class="info-card-title">Прогноз на год</div>
          <div style="font-size:14px;color:var(--text-sub)">
            Юпитер проходит твоё 7-е поле… ключевые периоды для отношений…
            Сатурн тестирует дисциплину… возможности для роста в марте…
          </div>
        </div>
        <div class="gate-overlay">
          <span class="gate-lock">🔒</span>
          <span class="gate-label">Прогноз на год</span>
          <button class="btn-stars" onclick="buyFeature('natal_forecast')" touch-action="manipulation">
            ⭐ 490 Звёзд
          </button>
          <span class="gate-note">~330 ₽ · разовая покупка</span>
        </div>
      </div>
    `;
  }
}

/**
 * Обработчик отправки формы натальной карты
 */
async function handleNatalSubmit() {
  const dateInput = document.getElementById('birth-date');
  const timeInput = document.getElementById('birth-time');
  const submitBtn = document.getElementById('natal-submit');

  if (!dateInput) return;

  const birthDate = dateInput.value.trim();
  const birthTime = timeInput?.value.trim() || '';

  // Простая валидация формата даты
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(birthDate)) {
    showToast('Введи дату в формате ДД.ММ.ГГГГ');
    dateInput.focus();
    return;
  }

  // Блокируем кнопку на время запроса
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Загрузка…';
  }

  try {
    await saveNatal(birthDate, birthTime);
    // Перезагружаем данные натальной карты
    const data = await fetchNatal();
    renderNatal(data);
  } catch (err) {
    showToast('Ошибка: ' + (err.message || 'попробуй ещё раз'));
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Рассчитать карту →';
    }
  }
}

/* ───────────────────────────────────────────────────────────
   renderCompat — вкладка "💞 Совместимость"
   ─────────────────────────────────────────────────────────── */

/**
 * @param {string|null} selectedSign  - текущий выбранный знак (или null)
 * @param {object|null} compatData    - данные из /api/compat (или null)
 */
function renderCompat(selectedSign, compatData) {
  const tab = document.getElementById('tab-compat');
  if (!tab) return;

  // Пикер знаков зодиака
  const pickerHtml = `
    <div class="section-title">💞 Совместимость</div>
    <p style="font-size:14px;color:var(--text-sub);margin-bottom:14px">
      Выбери знак партнёра:
    </p>
    <div class="compat-grid" id="compat-grid">
      ${COMPAT_SIGNS.map(s => `
        <button
          class="compat-sign-btn${s.key === selectedSign ? ' selected' : ''}"
          data-sign="${s.key}"
          aria-label="${s.name}"
          touch-action="manipulation"
        >
          <span class="sign-emoji">${s.emoji}</span>
          <span style="font-size:11px">${s.name}</span>
        </button>
      `).join('')}
    </div>
  `;

  // Результат совместимости (если знак выбран)
  let resultHtml = '';
  if (compatData && selectedSign) {
    resultHtml = `
      <div class="info-card" style="margin-top:16px">
        <div class="compat-rating">${compatData.rating_emoji || '💫'}</div>
        <div class="compat-title">${compatData.title || ''}</div>
        <div class="compat-text">${compatData.text || ''}</div>
      </div>

      <!-- Детальный анализ — платный контент -->
      <div class="premium-gate" style="margin-top:12px">
        <div class="gate-blur-content info-card" style="opacity:0.4">
          <div class="info-card-title">Детальный анализ</div>
          <div style="font-size:14px;color:var(--text-sub)">
            Синастрия: Солнце в соединении с Луной партнёра…
            Сильные аспекты в браке… кармические связи…
          </div>
        </div>
        <div class="gate-overlay">
          <span class="gate-lock">🔒</span>
          <span class="gate-label">Детальный анализ</span>
          <button class="btn-stars" onclick="buyFeature('compat_deep')" touch-action="manipulation">
            ⭐ 490 Звёзд
          </button>
          <span class="gate-note">~330 ₽ · разовая покупка</span>
        </div>
      </div>
    `;
  }

  tab.innerHTML = pickerHtml + resultHtml;

  // Навешиваем события на кнопки знаков
  bindCompatGrid();
}

/**
 * Вешает обработчики на пикер совместимости
 */
function bindCompatGrid() {
  const grid = document.getElementById('compat-grid');
  if (!grid) return;

  grid.querySelectorAll('.compat-sign-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      // Подсвечиваем выбранный знак
      grid.querySelectorAll('.compat-sign-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      const sign = btn.dataset.sign;
      try {
        const data = await fetchCompat(sign);
        renderCompat(sign, data);
      } catch (err) {
        showToast('Ошибка загрузки совместимости');
      }
    });
  });
}

/* ───────────────────────────────────────────────────────────
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ─────────────────────────────────────────────────────────── */

/**
 * Склонение слова "день" по числу
 * pluralDays(1) → "день", pluralDays(2) → "дня", pluralDays(5) → "дней"
 */
function pluralDays(n) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return 'дней';
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
}

/**
 * showToast — показывает всплывающее уведомление
 * Используется внутри screens.js и доступна глобально через window
 *
 * @param {string} message   - текст уведомления
 * @param {number} duration  - длительность показа в мс (по умолчанию 2500)
 */
function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('toast-visible');

  // Убираем через duration мс
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('toast-visible');
  }, duration);
}

// Делаем showToast глобальной (используется в app.js тоже)
window.showToast = showToast;
