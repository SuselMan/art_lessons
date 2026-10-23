## Ночной прогон (#651): что убрано и что осталось

**Убрано PR-ом #658** — 6 нарушений слоёв и 3 цикла, поведение не менялось:

| Было | Как |
|---|---|
| `stores/slices/layerSlice` → `pages/Room/editing/transformMath` | файл → `lib/transform` (новый модуль): чистая математика жеста |
| `stores/slices/layerSlice` → `pages/Room/overlays/RulerOverlay` (тип `RulerPoint`) | тип → `layerSlice` (там лежит `rulerLine`), overlay реэкспортирует |
| `stores/slices/roomSlice` → `pages/Room/participants/participants` | файл → `stores/slices`: это редьюсер, и пользуется им только roomSlice |
| `stores/slices/viewportSlice` → `pages/Room/viewport/useViewport` (тип `Viewport`) | тип → `viewportSlice`, useViewport реэкспортирует; заодно ушли циклы useViewport ↔ viewportSlice/roomStore и cameraMath ↔ useViewport |
| `stores/noticeStore` → `components/Notice/Notice` (типы `Notice*`) | типы → `noticeStore`, `Notice` реэкспортирует |
| `components/FloatingToolPanel` → `pages/Room/viewport/panelPosition` | файл → `components/FloatingToolPanel`: геометрия самой панели |

База: 54 → 45. Из оставшихся **17 нарушений слоёв** ни одно не снимается переносом файла — везде нужна правка кода. Ночью её не делал: эпик просил только переносы, а каждое из этих мест — отдельное решение. Ниже — что там на самом деле и что предлагаю.

### 1. Движок → lib: `diagLog`, `pressureCalibration` (4 записи)

`engine/index.ts` и `engine/src/input/PointerInput.ts` импортируют `lib/observability/diagLog` и `lib/input/pressureCalibration`. Часть `engine` по правилу видит только `contract` — движок не должен знать приложения.

- `pressureCalibration` — чистые функции без зависимостей, по смыслу это ввод пера. **Предложение:** перенести в `engine/src/input`, наружу отдать через фасад (`engine/index.ts` уже принимает калибровку в `setPressureCalibration`); `settingsStore` и настройки берут тип и `compilePressureCalibration` из `engine`.
- `diagLog` — общий диагностический лог всего клиента. **Предложение:** инверсия — движок принимает логгер снаружи (`engine.setDiagLog(fn)` или опция конструктора), по умолчанию no-op; Room передаёт `diagLog`. Так тесты движка не тянут lib.

### 2. lib → stores (8 записей) и i18n → settingsStore (1)

`lib/api/environment`, `lib/api/useShareRoom`, `lib/browser/registerServiceWorker`, `lib/input/useCompactLayout`, `lib/observability/devEngineHandle`, `i18n/index` читают `settingsStore`/`noticeStore`/`roomStore`. Это не «платформа», а склейка приложения: хуки и сервисы, которым нужны настройки пользователя.

**Предложение:** не ломать зависимости, а признать, что это другой слой. Вынести эти пять файлов из `lib` в модуль слоя левее `state` (например, `apps/web/src/services`, слой `ui-kit` или новый слой «сервисы приложения» между `ui-kit` и `state`) — перенос файлов, без правки кода. Для `i18n` — тот же вопрос: `useT()`/`useLocale()` — это React-хуки над стором, а `translate`/`locale` — чистая платформа; разделить `i18n/index.ts` на хуки (левее стора) и чистую часть.

### 3. `lib/api/roomChunk` → `pages/Room` (1)

Ленивая загрузка экрана комнаты — это забота роутера (оболочки), а не клиента API. Импортируют её `App.tsx`, `pages/CreateRoom`, `pages/MyLessons`. **Предложение:** перенести в `apps/web/src` рядом с `App.tsx` (слой shell)… но тогда `screens` → `shell` станет нарушением. Честнее — отдельный маленький модуль `apps/web/src/routes` в слое `screens`: экраны могут импортировать свой слой, и он может импортировать `pages/Room` (editor правее). Нужно решить, куда это ложится на карте.

### 4. `stores/settingsStore` → `components/ColorPicker/pickerModes`, `components/FloatingToolPanel/slots` (2)

Стор хранит выбранный режим пикера и раскладку плавающей панели, а значения по умолчанию, проверка и (де)сериализация живут в компонентах. **Предложение:** вынести из `pickerModes.ts` и `slots.ts` чистую часть (список режимов, `DEFAULT_*`, `parse*`/`serialize*`, тип) в файлы в `stores/` или `lib/`; компоненты оставляют себе подписи и иконки. Это разрезание файлов, а не перенос.

### 5. `stores/slices/toolSlice`, `components/SettingField` → `pages/Room/tools/toolSchemas` (2)

`toolSchemas.ts` — реестр инструментов: типы (`SettingDescriptor`, `ToolSettingsMap`, `UiToolId`, `ShapeSwatch`) и значения по умолчанию, но вместе с картинками, иконками и ключами перевода. Стор и компонент поля берут из него типы и `defaultToolSettings`. **Предложение:** разрезать — типы и чистые значения по умолчанию в модуль правее стора (например, `lib/tools`), а реестр с картинками и подписями остаётся в `pages/Room/tools`. Самое крупное из всех: реестр — 1800 строк, и граница «что чисто» требует аккуратности.

Остальные записи базы — 13 `engine-public-api-only` (скрипты запекания бумаги, `PaperPreview`, диагностика комнаты лезут в `engine/src` мимо фасада), 11 `no-circular` (пресеты движка ↔ `dabShaping`, `hotkeys` ↔ `i18n` и др.) и 4 `no-orphans` — к порядку слоёв не относятся, это не задача #650.
