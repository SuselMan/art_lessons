# Интерактивный родной Mini: исходный и оптимизированный

UI-only оболочка над существующим `mini-worker`. Runtime/controller/worker/build принадлежат root и здесь не меняются. Старый живой стенд не подменяется.

Сборщик root создаёт два неизменяемых соседних каталога `mini/original/` и `mini/optimized/`, entry из `ui.ts`, worker `./worker.js`. Compile define `__QA_NATIVE_MINI_OPTIMIZED__:boolean` обязателен. Основная новая ссылка открывает optimized; переключатель ведёт на `../<variant>/?mode=worker`, открывая чистый лист без промежуточного подтверждения.

Готовность принимается только с фактическим ответом `ready.profile`:

```ts
{ id:'original'|'optimized', skipEmptyMobile:boolean,
  interactivePath:'native-direct', sourceBuild:string }
```

Несовпадение compile-profile с runtime, отсутствие path/sourceBuild/boolean запрещает рисование и показывает ошибку. Сохранены существующие сообщения settings/pointer/dry/export, capture pointer pressure/coalesced events, main/worker, диагностика.

При фактическом `goal.fullGoalEpoch` основная метрика — от зарегистрированного UP до полной GPU-цели с контрольным чтением C в worker (`fullGoalEpoch − captureUpEpoch`). Это стендовый замер, не production latency. `goalEpoch − captureUpEpoch` и `fullCReadMs` сохранены отдельно в диагностике. Без конечного полного чтения явно показывается только JS-сигнал с предупреждением, что GPU не подтверждён. Время QA-компонентного стенда не используется.

Кнопки и селекты от 48 px; кисть/вода/пигмент/краска/цвет доступны на телефоне. Новый runtime root должен сохранить настоящую native-модель; UI не переключает модель сам.
