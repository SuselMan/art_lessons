## Отчёт ночного прогона

Все пять шагов сделаны по порядку, каждый — отдельный PR от свежего `main`, влит и задеплоен (прод проверен после каждого: `/api/health` ok, контейнер без перезапусков, главная и экран комнаты открываются в headless-браузере без ошибок JS).

| Шаг | PR | Версия в проде |
|---|---|---|
| 1. #649 `server/src` → rooms, roomRoutes, auth, admin, health, http, db | #654 | `2026.09.28-847bec1` |
| 2. #648 `lib` → api, sound, layers, boards, input, browser, observability, annotations | #655 | `2026.09.28-0863f9b` |
| 3. #646 `pages/Room` → net, tools, gestures, editing, shapes, overlays, panels, status, viewport, diagnostics, participants | #656 | `2026.09.29-a3f664c` |
| 4. #647 `engine/src` → buffers, dabs, presets, paper, input, oplog, raster, filters, watercolor | #657 | `2026.09.29-a87d55c` |
| 5. #650 нарушения слоёв (частично) | #658 | `2026.09.29-9140cc3` |

Условие шага 4 было выполнено: ветки `579-wet-brushes`, `581-wet-realism`, `wc-color-picker` целиком содержались в `watercolor-feel`, а та влита в #653 до старта.

**Итог по карте:** 33 → 62 модуля-папки, групп карты 43 → 15 (остались только в `components`, `stores`, `apps/web/scripts`, `packages/shared` — их эпик не раскладывал). База нарушений 54 → 45.

### Как делалось

- Файлы — `git mv`; импорты — однопроходный инструмент на резолвере TypeScript (`ts.resolveModuleName` с настройками своего tsconfig: каждый относительный спецификатор разрешается, цель отображается через таблицу переносов, путь пересчитывается от нового места файла, стиль `.js`/без расширения сохраняется). Первая версия на `getEditsForFileRename` оказалась неверной для файлов, которые переезжают сами (считала пути от старого места) — поймано побайтовой сверкой двух инструментов до первого коммита.
- На каждый PR — два независимых ревью: субагент (скриптом сверял старую и новую цель каждого спецификатора — 0 расхождений во всех пяти PR) и Kimi.
- Проверка каждого шага: typecheck (по коду выхода), lint:fix, vitest полный с `--maxWorkers=2`, e2e (шаги 3 и 4 — полный, 113 тестов), map:check, map:rules, map.

### Грабли, которые поймала проверка (все — строки, которые не импорты)

- **`pages/Room/tools/toolTypeImages.ts`** — `import.meta.glob('../../assets/…')`: после переноса глоб молча вернул бы `{}`, и пропали бы все картинки выбора грифеля/угля/кисти. Typecheck не видит; поймал `toolSchemas.test`.
- **`engine/src/paper/paperAssets.test.ts`** — путь к `public/paper` через `join(dirname(...))`: при неверном пути 16 тестов **молча пропускались бы**. Поправлено, проверено что выполняются.
- **`e2e/specs/paperFailure.spec.ts`** — маска `**/paper/**` после появления папки `engine/src/paper` стала глушить исходники движка в dev (белая страница). Маска сужена до ассетов `/paper/`. На прод не влияет — там бандлы в `/assets/`.
- **`.github/actions/paper-bake`** — ключ кэша бумаги хэширует файлы по путям; обновлено.

После первой находки инструмент печатает каждую относительную строку в перенесённом файле, которая не импорт; ретроспективно в `lib` и `server/src` таких нет.

### Где границы модулей отошли от карты

- **server:** `roomMapper`, `roomAccess` → `rooms` (их использует ядро комнат); `bans` → `auth` (читается на каждом запросе, в admin давал цикл); `apiRoute`, `input` → новый `http` (ими пользуются все модули с REST); `instrument.ts` оставлен в корне — его путь зашит в `--import` в Dockerfile и `npm start`; `prisma.ts` → `db` в слое server-infra.
- **lib:** `roomStorage`, `deviceType` → `browser` (иначе api ↔ input).
- **pages/Room:** корень = экран (`index.tsx` и его хуки); `cursorController` → `overlays` (иначе сеть зависела бы от жестов), `lostWork` → `net` (его использует outbox); неразмеченные `GlLostOverlay` → status, `WatercolorDryButton`/`WatercolorPerfHud` → panels, `replayGate`/`undoneInBatch`/`useWatercolorDevFlags` → корень.
- **engine:** `dabShaping` → `presets` (цикл по файлам с пресетами — внутри модуля, а не через границу); новый модуль `watercolor` для `pigmentOptics`/`wetDiffusion`/`waterFront` — они не были ни в одной группе.

### Что висит и почему

- **#650 открыт.** Убрано 6 нарушений слоёв и 3 цикла (#658). Оставшиеся **17 нарушений слоёв** переносом файла не снимаются — везде нужна правка кода (инъекция логгера в движок, разрезание `toolSchemas` на типы и реестр, куда положить хуки `lib`, читающие стор, и т.д.). Разбор каждого с предложением — комментарием в #650. Ночью не делал: эпик просил переносы, а это решения.
- Межмодульные рёбра, которые слои допускают, но которые стоит развести: server `rooms ↔ health` (сокет пишет метрики, health читает `roomStats`), Room `net → status/JoinGate` и `gestures → overlays/RulerOverlay` (только типы).
- Три старых предупреждения `no-orphans` (`watercolor/waterFront.ts`, `scripts/devices/pageLib.js`, `scripts/devBridgeSession.d.mts`) в базу не добавлял — это не моё решение.
- Эпик #642 открыт (не закрывал — у него своя граница).
