# QA: короткий путь пустой мобильной краски

`no-mobile-source.cjs` — преобразование трёх модулей только для отдельной
сборки с `QA_NATIVE_MINI_OPTIMIZED=1`. Обычные файлы движка и baseline не меняются.
Путь находится в `PuddleTarget` / `WatercolorSettlePlan`, поэтому применим к live
controller, а не только к диагностическому циклу компонентов.

Уже вычисленный CPU-массив retained Q проверяется целиком. Доказательство действует
только внутри одного `prepare`, с восстановлением свойства owner в `finally`.
Первый вариант разрешён для `front8-detail-flow-v4`, S1, одного пигмента,
отключённых brush contacts, без paired colour / pure-water diagnostic / plateau /
cost-path diagnostic. Остальное исполняет прежний путь.

При пустом mobile поле:

- Однородная стоимость 1 снаружи и 0 внутри — фиксированные точки min-plus.
  Каждый цикл фронта заменяется одним шагом stride1, **сохраняющим G=высоту бумаги**.
- Выходы переноса и диффузии заменяются точным нулевым clear. Смена ping-pong
  буферов, исходное разбиение, суммы и весовые срезы остаются прежними.
- Reconstruction, contacts, group tide, land, background mixing, dry guards и
  итоговая coverage не удаляются. Одной RGB-картинки для доказательства мало.

CPU/source gates: `node --test docs/qa/prototypes/native-mini-optimized805/no-mobile-source.test.cjs`.
Это не доказательство GPU-равенства и не измерение ускорения.

Следующие device gates (не запускались этим изменением): direct target original
против opt-in на одинаковом authored RAW7, все повторы P/C/coverage SHA exact,
source7 unchanged. Сначала mini-wave с положительными счётчиками активации;
затем two-colors с обязательным fallback. После них — dot/water-only/low-water,
возобновление после cancel и следующий штрих live controller. Только после
корректности — короткая чередующаяся серия времени с полным чтением C,
одинаковыми границами, сохранёнными холодными значениями и выбросами.

Счётчики доступны в `globalThis.__qaNativeMiniNoMobile805`; активация при
подготовке не равна завершению цели. Окончательный SHA-гейт обязателен.
