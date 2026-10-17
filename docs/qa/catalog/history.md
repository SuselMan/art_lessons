# История дефектов → регрессии

Инвентарь GitHub:675issues,217 кандидатов в дефекты.216 получили связь с кейсами/группами; один 540 исключён как надёжность самого теста. Из них umbrella728 не отдельный тест: ссылка ведёт к нескольким конкретным регрессиям. Закрытая задача не равна PASS нового кандидата.

Это результат чтения истории задач, репозиторных контрактов и QA-отчётов; не полный перебор комбинаций. Все 675 названий/состояний сохранены в [history-issues.json](history-issues.json), решения — [history-audit.json](history-audit.json). Feature/epic, учебные и refactor задачи сохранены как навигация, не автоматически размножены в acceptance. Тела/комментарии, приватные комнаты и credentials не копировались.

| Источник | Состояние | Сценарии / решение |
|---|---|---|
| [#65 — [Bug] LayerPanel: нельзя перетащить слой в закрытую папку](https://github.com/SuselMan/art_lessons/issues/65) | CLOSED | [QA-441](historical.md#qa-441) |
| [#66 — [Bug] LayerPanel: перенос открытой папки не тащит содержимое](https://github.com/SuselMan/art_lessons/issues/66) | CLOSED | [QA-442](historical.md#qa-442) |
| [#67 — [Bug] LayerPanel: папку можно вложить в папку](https://github.com/SuselMan/art_lessons/issues/67) | CLOSED | [QA-443](historical.md#qa-443) |
| [#77 — [Bug] UI: merge down внутри папки вставляет результат мимо папки](https://github.com/SuselMan/art_lessons/issues/77) | CLOSED | [QA-444](historical.md#qa-444) |
| [#85 — [Feature] Server+UI: явное создание комнаты и join-флоу для второго устройства](https://github.com/SuselMan/art_lessons/issues/85) | CLOSED | [QA-415](historical.md#qa-415), [QA-582](historical.md#qa-582) |
| [#91 — [Bug] Engine: острые углы сглаживаются в дугу на высокой скорости штриха](https://github.com/SuselMan/art_lessons/issues/91) | CLOSED | [QA-454](historical.md#qa-454) |
| [#95 — [Bug] Engine: текстура бумаги слишком рельефная на всех трёх типах](https://github.com/SuselMan/art_lessons/issues/95) | CLOSED | [QA-476](historical.md#qa-476) |
| [#102 — [Bug] UI: нативное контекстное меню браузера (скачать/поделиться/печать) всплывает при медленном перетаскивании слайдера пером на планшете](https://github.com/SuselMan/art_lessons/issues/102) | CLOSED | [QA-511](historical.md#qa-511) |
| [#104 — [Bug] Engine: ощутимый лаг линии при быстром письме (predictPointer в текущем виде не спасает)](https://github.com/SuselMan/art_lessons/issues/104) | CLOSED | [QA-545](historical.md#qa-545) |
| [#115 — [Bug] UI: неселектируемые элементы интерфейса иногда даю выделение текста / мигающий курсор ввода](https://github.com/SuselMan/art_lessons/issues/115) | CLOSED | [QA-511](historical.md#qa-511) |
| [#117 — [Bug] Engine: смена цвета карандаша перекрашивает весь рисунок задним числом](https://github.com/SuselMan/art_lessons/issues/117) | CLOSED | [QA-453](historical.md#qa-453) |
| [#121 — [Bug] Engine: части рисунка пропадают на больших холстах, возвращаются после перезагрузки](https://github.com/SuselMan/art_lessons/issues/121) | CLOSED | [QA-506](historical.md#qa-506) |
| [#133 — [Bug] Engine: трансформация без возврата уничтожает контент за границей холста — особенно больно для референс-картинок](https://github.com/SuselMan/art_lessons/issues/133) | CLOSED | [QA-468](historical.md#qa-468) |
| [#140 — [Bug] Engine: 1px разрыв между тайлами при дробном zoom](https://github.com/SuselMan/art_lessons/issues/140) | CLOSED | [QA-501](historical.md#qa-501) |
| [#141 — [Bug] Engine: текстура бумаги не world-space на бесконечном холсте](https://github.com/SuselMan/art_lessons/issues/141) | CLOSED | [QA-473](historical.md#qa-473) |
| [#145 — [Bug] Engine: экспорт и пипетка не учитывают тайлы за пределами вьюпорта](https://github.com/SuselMan/art_lessons/issues/145) | CLOSED | [QA-502](historical.md#qa-502) |
| [#154 — [Bug] UI: бесконечный холст игнорирует devicePixelRatio — на 100% рисунок и зерно крупнее нативного в dpr раз](https://github.com/SuselMan/art_lessons/issues/154) | CLOSED | [QA-473](historical.md#qa-473), [QA-474](historical.md#qa-474), [QA-509](historical.md#qa-509) |
| [#155 — [Bug] Engine: рисование линии на бесконечном холсте сильно тормозит](https://github.com/SuselMan/art_lessons/issues/155) | CLOSED | [QA-545](historical.md#qa-545) |
| [#159 — [Bug] UI: тап по холсту не скрывает интерфейс на планшете (иногда не считывается)](https://github.com/SuselMan/art_lessons/issues/159) | CLOSED | [QA-512](historical.md#qa-512) |
| [#162 — [Bug] Engine: текстура штриха выглядит по-разному на разных устройствах в одной комнате](https://github.com/SuselMan/art_lessons/issues/162) | CLOSED | [QA-476](historical.md#qa-476) |
| [#163 — [Bug] Engine: текстура зерна мазка зависела от наклона пера](https://github.com/SuselMan/art_lessons/issues/163) | CLOSED | [QA-458](historical.md#qa-458) |
| [#164 — [Bug] Server: необработанное исключение в recordOperation роняет весь процесс](https://github.com/SuselMan/art_lessons/issues/164) | CLOSED | [QA-494](historical.md#qa-494) |
| [#165 — [Bug] Engine: текстура мазка (paperCatch) отличалась между устройствами — независимый GPU-бейк на каждом клиенте](https://github.com/SuselMan/art_lessons/issues/165) | CLOSED | [QA-475](historical.md#qa-475), [QA-476](historical.md#qa-476) |
| [#168 — Сервер: приём и дедуп снапшотов слоёв по (room, layer, seq) + debug-сверка детерминизма](https://github.com/SuselMan/art_lessons/issues/168) | CLOSED | [QA-489](historical.md#qa-489), [QA-490](historical.md#qa-490) |
| [#171 — [Bug] UI: "Очистить холст" не подтверждается — опасно для общих досок](https://github.com/SuselMan/art_lessons/issues/171) | CLOSED | [QA-445](historical.md#qa-445) |
| [#179 — [Bug] UI: Иконки на миг рендерятся текстом до загрузки шрифта](https://github.com/SuselMan/art_lessons/issues/179) | CLOSED | [QA-520](historical.md#qa-520) |
| [#184 — Server: packages/shared has no runtime-resolvable dist build for apps/server's Docker image](https://github.com/SuselMan/art_lessons/issues/184) | CLOSED | [QA-573](historical.md#qa-573) |
| [#186 — Bug: paper texture switch fails on tablet — console error "Could not fetch Room.js"](https://github.com/SuselMan/art_lessons/issues/186) | CLOSED | [QA-477](historical.md#qa-477) |
| [#187 — Bug: stroke line breaks/interrupts mid-draw on tablet, especially at high zoom](https://github.com/SuselMan/art_lessons/issues/187) | CLOSED | [QA-457](historical.md#qa-457) |
| [#199 — Infra: VPS was OOM-killing deploys — moved builds into CI](https://github.com/SuselMan/art_lessons/issues/199) | CLOSED | [QA-543](historical.md#qa-543) |
| [#205 — [Bug] Server/Engine: длинные штрихи молча пропадают, тяжёлые комнаты не грузятся](https://github.com/SuselMan/art_lessons/issues/205) | CLOSED | [QA-457](historical.md#qa-457), [QA-495](historical.md#qa-495) |
| [#206 — [Bug] Server: комната держит всю историю операций в RAM без ограничения — одна тяжёлая комната может уронить весь сервис](https://github.com/SuselMan/art_lessons/issues/206) | CLOSED | [QA-530](historical.md#qa-530) |
| [#263 — [Bug] UI: удаление слоя (напрямую или через Undo/Redo) не предупреждает о потере чужого контента](https://github.com/SuselMan/art_lessons/issues/263) | CLOSED | [QA-445](historical.md#qa-445) |
| [#266 — [Bug] Engine: маркер давал полосы/шевроны на перекрытии дабов внутри мазка](https://github.com/SuselMan/art_lessons/issues/266) | CLOSED | [QA-460](historical.md#qa-460) |
| [#275 — [Bug] Infra: деплой не чистит старые SHA-тегированные Docker-образы, диск VPS переполняется](https://github.com/SuselMan/art_lessons/issues/275) | CLOSED | [QA-543](historical.md#qa-543) |
| [#287 — [Bug] Engine/Server: снапшот-восстановленный контент слоя стирается при undo/redo/revoke (не покрыт локальными чекпоинтами) — реальная потеря контента в проде](https://github.com/SuselMan/art_lessons/issues/287) | CLOSED | [QA-479](historical.md#qa-479) |
| [#291 — [Bug] Web: открытие длинной комнаты тянет всю историю операций (66 МБ) — фриз на десктопе, краш на планшете](https://github.com/SuselMan/art_lessons/issues/291) | CLOSED | [QA-488](historical.md#qa-488) |
| [#292 — [Bug] Server: сервер держит 532 МБ из 960 — вся история комнат в RAM, залипающие комнаты, пик на распаковке снапшота](https://github.com/SuselMan/art_lessons/issues/292) | CLOSED | [QA-530](historical.md#qa-530), [QA-531](historical.md#qa-531) |
| [#294 — [Bug] Deploy: index.html отдаётся без Cache-Control — вернувшийся клиент работает на бандле прошлого деплоя](https://github.com/SuselMan/art_lessons/issues/294) | CLOSED | [QA-526](historical.md#qa-526) |
| [#296 — [Bug] Web: отказ IndexedDB молча теряет операции — штрихи не уходят с устройства вообще](https://github.com/SuselMan/art_lessons/issues/296) | CLOSED | [QA-491](historical.md#qa-491) |
| [#298 — [Bug] Планшет застревает намертво: сервер не отвечает на операцию до join_room, outbox ретраит вечно, lmkd убивает вкладку](https://github.com/SuselMan/art_lessons/issues/298) | CLOSED | [QA-493](historical.md#qa-493) |
| [#302 — [Bug] Engine: вертикальный разрыв внутри запечённой текстуры бумаги — видимая линия на чистом холсте](https://github.com/SuselMan/art_lessons/issues/302) | CLOSED | [QA-475](historical.md#qa-475) |
| [#303 — Sub-pixel pointer samples lose stroke path — ink deposit depends on the tablet's report rate](https://github.com/SuselMan/art_lessons/issues/303) | CLOSED | [QA-455](historical.md#qa-455) |
| [#306 — [Bug] UI: курсор кисти моргает во время штриха — mix-blend-mode поверх перерисовывающегося WebGL-канваса](https://github.com/SuselMan/art_lessons/issues/306) | CLOSED | [QA-513](historical.md#qa-513) |
| [#307 — [Bug] UI: интерфейс мигает при переключении minimal ↔ full — пересборка слоёв композитора на каждый тап](https://github.com/SuselMan/art_lessons/issues/307) | CLOSED | [QA-512](historical.md#qa-512) |
| [#308 — [Bug] UI: Undo вешает главный поток на 0.3–2.1 с](https://github.com/SuselMan/art_lessons/issues/308) | CLOSED | [QA-546](historical.md#qa-546) |
| [#311 — [Bug] Server: stroke/image_import/layer_clear на удалённый слой принимаются и тихо теряются](https://github.com/SuselMan/art_lessons/issues/311) | CLOSED | [QA-496](historical.md#qa-496), [QA-499](historical.md#qa-499) |
| [#330 — [Bug] Engine: маркер распадается на отдельные дабы (прямоугольники) на большой кисти](https://github.com/SuselMan/art_lessons/issues/330) | CLOSED | [QA-460](historical.md#qa-460) |
| [#331 — [Bug] UI: в «Моих уроках» drag&drop карточек ломает скролл на тач-устройствах](https://github.com/SuselMan/art_lessons/issues/331) | CLOSED | [QA-514](historical.md#qa-514) |
| [#333 — [Bug] Engine: графит и фон читают бумагу в разном масштабе — ограниченная комната](https://github.com/SuselMan/art_lessons/issues/333) | CLOSED | [QA-474](historical.md#qa-474) |
| [#334 — [Bug] Infra: Uptime упал один раз, причина не установлена — проба не доходит до бокса](https://github.com/SuselMan/art_lessons/issues/334) | CLOSED | [QA-533](historical.md#qa-533) |
| [#342 — [Bug] Infra: nginx повторно сжимает уже сжатые .paper/.preview](https://github.com/SuselMan/art_lessons/issues/342) | CLOSED | [QA-489](historical.md#qa-489), [QA-541](historical.md#qa-541) |
| [#344 — [Bug] UI: интерфейс подпрыгивает при переключении режимов пикера](https://github.com/SuselMan/art_lessons/issues/344) | CLOSED | [QA-515](historical.md#qa-515) |
| [#346 — [Bug] UI: сбой загрузки бумаги не виден пользователю — комната молча не рисует](https://github.com/SuselMan/art_lessons/issues/346) | CLOSED | [QA-281](browser.md#qa-281) |
| [#348 — [Bug] Infra: npm run typecheck не покрывает apps/web/scripts — гейт зеленеет, не посмотрев на файлы](https://github.com/SuselMan/art_lessons/issues/348) | OPEN | [QA-544](historical.md#qa-544) |
| [#350 — [Bug] UI: комната при создании снимает прелоадер до загрузки бумаги и мигает «Нет связи»](https://github.com/SuselMan/art_lessons/issues/350) | CLOSED | [QA-477](historical.md#qa-477) |
| [#355 — [Bug] Infra: старый service worker запирает вкладку на прежнем домене](https://github.com/SuselMan/art_lessons/issues/355) | OPEN | [QA-529](historical.md#qa-529) |
| [#357 — [Bug] UI: в fullscreen не видно ничего портального — меню слоя, модалки, тосты](https://github.com/SuselMan/art_lessons/issues/357) | CLOSED | [QA-516](historical.md#qa-516) |
| [#358 — [Bug] UI: неотправленные операции уезжают в другую комнату — outbox не привязан к roomId](https://github.com/SuselMan/art_lessons/issues/358) | CLOSED | [QA-492](historical.md#qa-492) |
| [#359 — [Bug] UI: на скрытом слое можно рисовать](https://github.com/SuselMan/art_lessons/issues/359) | CLOSED | [QA-448](historical.md#qa-448) |
| [#360 — [Bug] UI: модалка «Переместить в…» читается криво](https://github.com/SuselMan/art_lessons/issues/360) | CLOSED | [QA-519](historical.md#qa-519) |
| [#361 — [Bug] Engine: маркер ставит лишний даб позади сегмента — скачок на конце штриха](https://github.com/SuselMan/art_lessons/issues/361) | CLOSED | [QA-461](historical.md#qa-461) |
| [#363 — [Bug] Engine: бесконечная комната на малом зуме — чёрные тайлы и реплей лога на каждый кадр](https://github.com/SuselMan/art_lessons/issues/363) | CLOSED | [QA-503](historical.md#qa-503) |
| [#364 — [Bug] UI: колонка нотисов замкнута в контексте наложения .viewport — тосты под панелями, крестик не нажимается](https://github.com/SuselMan/art_lessons/issues/364) | CLOSED | [QA-517](historical.md#qa-517) |
| [#365 — [Bug] Engine: на малом зуме бесконечная комната шакалится сильнее обычной — нет мип-уровней](https://github.com/SuselMan/art_lessons/issues/365) | CLOSED | [QA-503](historical.md#qa-503) |
| [#367 — [Bug] Engine: свёртка в LOD-уровни идёт каждый кадр рисования, включая 100% зум](https://github.com/SuselMan/art_lessons/issues/367) | CLOSED | [QA-504](historical.md#qa-504) |
| [#368 — [Bug] Server: зеркало живых слоёв игнорирует operation_undo — отменённое удаление ловит слой в ловушку](https://github.com/SuselMan/art_lessons/issues/368) | CLOSED | [QA-447](historical.md#qa-447) |
| [#369 — [Bug] Engine+Server: снапшот молча теряет слои, чьи операции вышли из окна лога](https://github.com/SuselMan/art_lessons/issues/369) | CLOSED | [QA-480](historical.md#qa-480) |
| [#377 — [Bug] UI: жест «назад» на планшете открывает подтверждение выхода посреди рисования](https://github.com/SuselMan/art_lessons/issues/377) | CLOSED | [QA-272](browser.md#qa-272) |
| [#379 — [Bug] UI: логотип на экране входа в комнату некликабельный](https://github.com/SuselMan/art_lessons/issues/379) | CLOSED | [QA-522](historical.md#qa-522) |
| [#381 — [Bug] Вход в комнату без снапшота: 3.5 с блокировки потока, три четверти — на undo](https://github.com/SuselMan/art_lessons/issues/381) | CLOSED | [QA-547](historical.md#qa-547) |
| [#382 — [Bug] Server: выходная превьюшка комнаты теряется — POST /thumbnail гонится с закрытием сокета и получает 403](https://github.com/SuselMan/art_lessons/issues/382) | CLOSED | [QA-439](historical.md#qa-439) |
| [#383 — [Bug] UI: service worker перехватывает /api и /socket.io и превращает сетевые сбои в необработанные реджекты](https://github.com/SuselMan/art_lessons/issues/383) | CLOSED | [QA-528](historical.md#qa-528) |
| [#385 — [Bug] Engine: длинная комната на большом холсте открывается пустой — реплей падает на Framebuffer incomplete](https://github.com/SuselMan/art_lessons/issues/385) | CLOSED | [QA-508](historical.md#qa-508) |
| [#386 — [Bug] Длинная комната не запекает снапшот после входа — остаётся на полном реплее навсегда](https://github.com/SuselMan/art_lessons/issues/386) | CLOSED | [QA-486](historical.md#qa-486) |
| [#388 — [Bug] Engine: наклон пера считается как hypot — форма даба зависит от азимута хвата](https://github.com/SuselMan/art_lessons/issues/388) | CLOSED | [QA-458](historical.md#qa-458) |
| [#394 — [Bug] UI: hit area гизмо задана в единицах холста — зависит от зума](https://github.com/SuselMan/art_lessons/issues/394) | CLOSED | [QA-469](historical.md#qa-469) |
| [#395 — [Bug] UI: слой прыгает на исходную позицию в момент отпускания трансформа](https://github.com/SuselMan/art_lessons/issues/395) | CLOSED | [QA-470](historical.md#qa-470) |
| [#398 — [Bug] Engine: image_import красится асинхронно — операции следом за ним теряются при реплее](https://github.com/SuselMan/art_lessons/issues/398) | CLOSED | [QA-466](historical.md#qa-466) |
| [#401 — [Bug] UI: незакоммиченная сессия трансформации теряется при перезагрузке страницы](https://github.com/SuselMan/art_lessons/issues/401) | CLOSED | [QA-472](historical.md#qa-472) |
| [#407 — [Bug] UI: второй жест в сессии трансформации считается не в том пространстве — гизмо уезжает](https://github.com/SuselMan/art_lessons/issues/407) | CLOSED | [QA-470](historical.md#qa-470) |
| [#408 — [Bug] UI: тап мимо гизмо заодно включает minimal UI, а пером не срабатывает](https://github.com/SuselMan/art_lessons/issues/408) | CLOSED | [QA-472](historical.md#qa-472) |
| [#416 — Растушёвка: белый ореол вокруг линии — скалярный резервуар вместо растрового](https://github.com/SuselMan/art_lessons/issues/416) | CLOSED | [QA-464](historical.md#qa-464) |
| [#417 — [Bug] UI: Esc во время неподтверждённого коммита трансформации снимает удерживаемое превью](https://github.com/SuselMan/art_lessons/issues/417) | OPEN | [QA-471](historical.md#qa-471) |
| [#418 — [Bug] Server: fork комнаты тянет всю историю источника в кучу без фильтра](https://github.com/SuselMan/art_lessons/issues/418) | CLOSED | [QA-434](historical.md#qa-434), [QA-437](historical.md#qa-437) |
| [#419 — [Bug] Server: DELETE комнаты не трогает карту резидентных комнат](https://github.com/SuselMan/art_lessons/issues/419) | OPEN | [QA-531](historical.md#qa-531) |
| [#421 — [Bug] Engine: рамка трансформации раздувается после каждого поворота слоя](https://github.com/SuselMan/art_lessons/issues/421) | CLOSED | [QA-469](historical.md#qa-469) |
| [#422 — [Bug] Infra: у деплоя нет группы concurrency — параллельные выкатки толкаются на одном VPS](https://github.com/SuselMan/art_lessons/issues/422) | CLOSED | [QA-542](historical.md#qa-542) |
| [#423 — [Bug] UI: обвязка редактора не возвращается на экран после minimal UI на планшете](https://github.com/SuselMan/art_lessons/issues/423) | CLOSED | [QA-512](historical.md#qa-512) |
| [#425 — Вход в комнату тянет ~13 МБ снапшотов — открытие занимает десятки секунд](https://github.com/SuselMan/art_lessons/issues/425) | OPEN | [QA-547](historical.md#qa-547) |
| [#430 — [Bug] Engine: превью чужого маркера и растушёвки рисуется не тем путём, что коммит](https://github.com/SuselMan/art_lessons/issues/430) | OPEN | [QA-465](historical.md#qa-465) |
| [#435 — [Bug] Engine: проверить на живом GPU, сшивается ли маркер по пикселям на стыке чанков](https://github.com/SuselMan/art_lessons/issues/435) | CLOSED | [QA-463](historical.md#qa-463) |
| [#437 — [Bug] Infra: JS и CSS отдаются с прода без gzip — 705 КБ лишних на первую загрузку](https://github.com/SuselMan/art_lessons/issues/437) | CLOSED | [QA-541](historical.md#qa-541) |
| [#439 — [Bug] Engine: маркер поверх полупрозрачного штриха делает его полностью непрозрачным](https://github.com/SuselMan/art_lessons/issues/439) | CLOSED | [QA-462](historical.md#qa-462) |
| [#442 — [Bug] Mobile: ось поворота двухпальцевого жеста уезжает на большом зуме](https://github.com/SuselMan/art_lessons/issues/442) | CLOSED | [QA-510](historical.md#qa-510) |
| [#447 — [Bug] Engine: undo импорта картинки не убирает её со слоя](https://github.com/SuselMan/art_lessons/issues/447) | OPEN | [QA-467](historical.md#qa-467) |
| [#451 — [Bug] Server: layer_transform не проверяется на владельческий замок](https://github.com/SuselMan/art_lessons/issues/451) | OPEN | [QA-449](historical.md#qa-449), [QA-499](historical.md#qa-499) |
| [#459 — [Bug] UI: floating panel уезжает за пределы viewport при смене ориентации](https://github.com/SuselMan/art_lessons/issues/459) | OPEN | [QA-518](historical.md#qa-518) |
| [#461 — Переименование проекта в шапке редактора стирает содержимое комнаты](https://github.com/SuselMan/art_lessons/issues/461) | CLOSED | [QA-432](historical.md#qa-432) |
| [#462 — [Bug] Web+Server: клиент, вошедший в комнату, запекает пустую структуру поверх живой — урок читается как стёртый](https://github.com/SuselMan/art_lessons/issues/462) | OPEN | [QA-481](historical.md#qa-481) |
| [#464 — [Bug] Web: Safari ниже 16.4 не может войти в комнату — «Бумага не загрузилась»](https://github.com/SuselMan/art_lessons/issues/464) | OPEN | [QA-478](historical.md#qa-478) |
| [#465 — [Bug] UI: в Safari карточки выбора зернистости бумаги ломают ряд в форме создания комнаты](https://github.com/SuselMan/art_lessons/issues/465) | OPEN | [QA-521](historical.md#qa-521) |
| [#466 — [Bug] UI: в Safari ниже 16.4 нет кнопки полноэкранного режима](https://github.com/SuselMan/art_lessons/issues/466) | OPEN | [QA-516](historical.md#qa-516) |
| [#467 — [Bug] Web: восстановление комнаты держит в памяти все слои сразу — 431 МБ на F4uw21Ob, вкладка iPad убивается системой](https://github.com/SuselMan/art_lessons/issues/467) | OPEN | [QA-507](historical.md#qa-507) |
| [#469 — [Bug] Engine: комната с границами держит весь лист одной текстурой — A2 и 4096×4096 убивают вкладку на iPad](https://github.com/SuselMan/art_lessons/issues/469) | OPEN | [QA-506](historical.md#qa-506) |
| [#473 — [Bug] Engine: акварель сглаживает нажим слабее пера, а не сильнее — константа делает обратное написанному](https://github.com/SuselMan/art_lessons/issues/473) | OPEN | [QA-548](historical.md#qa-548) |
| [#474 — [Bug] Engine: восстановление снапшота молча теряет тайлы — урок читается как стёртый, в Sentry пусто](https://github.com/SuselMan/art_lessons/issues/474) | OPEN | [QA-482](historical.md#qa-482) |
| [#477 — [Bug] Web: застрявший seq в pendingCommitSeqs навсегда глушит выпечку снапшотов](https://github.com/SuselMan/art_lessons/issues/477) | OPEN | [QA-485](historical.md#qa-485) |
| [#478 — [Bug] Engine: твёрдый карандаш (2H–6H) крупной кистью распадается на отдельные эллипсы](https://github.com/SuselMan/art_lessons/issues/478) | CLOSED | [QA-459](historical.md#qa-459) |
| [#479 — [Bug] Engine: чекпойнт, снятый поверх неучтённой краски, при каждом undo кладёт штрих второй раз](https://github.com/SuselMan/art_lessons/issues/479) | OPEN | [QA-487](historical.md#qa-487) |
| [#481 — Курсор-отпечаток кисти не виден на бумаге: слой обрезает сам себя, а кольцо уходит в субпиксель](https://github.com/SuselMan/art_lessons/issues/481) | OPEN | [QA-513](historical.md#qa-513) |
| [#483 — [Bug] Engine: #478 переразметил и мягкие грейды — штрих стал плоским и жёстким](https://github.com/SuselMan/art_lessons/issues/483) | OPEN | [QA-459](historical.md#qa-459) |
| [#484 — [Bug] UI: тычок пером не снимает выделение — микросдвиг рисует новый прямоугольник](https://github.com/SuselMan/art_lessons/issues/484) | CLOSED | [QA-323](browser.md#qa-323) |
| [#485 — [Bug] Engine: #478 не закрыт — фестон края растёт с размером кисти](https://github.com/SuselMan/art_lessons/issues/485) | OPEN | [QA-459](historical.md#qa-459) |
| [#486 — [Bug] Web: восстановление снапшота не отзывает начальный слой — комната навсегда перестаёт печь снапшоты](https://github.com/SuselMan/art_lessons/issues/486) | CLOSED | [QA-484](historical.md#qa-484) |
| [#488 — [Bug] UI: замок слоя не переживает перезагрузку — и при этом протекает другим участникам](https://github.com/SuselMan/art_lessons/issues/488) | CLOSED | [QA-449](historical.md#qa-449) |
| [#495 — [Bug] Server: catch в обработчике operation не отвечает ack — клиент ретраит до отказа](https://github.com/SuselMan/art_lessons/issues/495) | CLOSED | [QA-494](historical.md#qa-494) |
| [#496 — [Bug] Room: провал join_room/create_room виден только в консоли](https://github.com/SuselMan/art_lessons/issues/496) | CLOSED | [QA-432](historical.md#qa-432), [QA-498](historical.md#qa-498) |
| [#498 — [Bug] Server: форк не копирует структурные операции — слой в копии нельзя удалить (target_gone)](https://github.com/SuselMan/art_lessons/issues/498) | CLOSED | [QA-435](historical.md#qa-435), [QA-436](historical.md#qa-436) |
| [#500 — [Bug] Engine: нижняя полоса листа теряется при восстановлении из снапшота](https://github.com/SuselMan/art_lessons/issues/500) | CLOSED | [QA-483](historical.md#qa-483) |
| [#502 — [Bug] UI: новая вкладка получает старую сборку из прекэша service worker](https://github.com/SuselMan/art_lessons/issues/502) | CLOSED | [QA-526](historical.md#qa-526) |
| [#503 — [Bug] Engine: LOD-пирамида на ограниченных комнатах — area_clear мимо свёртки, пустой уровень гасит слой](https://github.com/SuselMan/art_lessons/issues/503) | CLOSED | [QA-504](historical.md#qa-504), [QA-505](historical.md#qa-505) |
| [#504 — [Bug] Server/UI: после деплоя комната навсегда остаётся в «Нет связи» — клиент не переподключается](https://github.com/SuselMan/art_lessons/issues/504) | CLOSED | [QA-497](historical.md#qa-497), [QA-535](historical.md#qa-535) |
| [#507 — [Bug] Engine: трансформация слоя вшивает швы тайлов в картинку](https://github.com/SuselMan/art_lessons/issues/507) | CLOSED | [QA-346](browser.md#qa-346) |
| [#514 — [Bug] Engine: растушёвка не работает на стыках тайлов — полоса шириной с кисть, где инструмент мёртв](https://github.com/SuselMan/art_lessons/issues/514) | CLOSED | [QA-331](browser.md#qa-331) |
| [#515 — [Bug] Web: возобновлённое приложение остаётся на старой сборке, и версию негде посмотреть](https://github.com/SuselMan/art_lessons/issues/515) | CLOSED | [QA-527](historical.md#qa-527) |
| [#516 — [Bug] UI: тап пером по кнопкам floating panel сдвигает панель вместо нажатия](https://github.com/SuselMan/art_lessons/issues/516) | CLOSED | [QA-236](browser.md#qa-236) |
| [#517 — [Bug] Engine: на iPad при штриховке примерно каждый 15-й штрих не появляется](https://github.com/SuselMan/art_lessons/issues/517) | OPEN | [QA-549](historical.md#qa-549) |
| [#518 — [Bug] Слои: замок держит только штрихи — трансформация, заливка и правка выделения проходят насквозь](https://github.com/SuselMan/art_lessons/issues/518) | CLOSED | [QA-449](historical.md#qa-449), [QA-450](historical.md#qa-450) |
| [#519 — [Bug] UI: выделение не снимается тапом пальцем мимо него](https://github.com/SuselMan/art_lessons/issues/519) | OPEN | [QA-322](browser.md#qa-322) |
| [#522 — [Bug] Engine: отмена мержа/удаления воскрешает слой пустым — выпечка публикует потерю, и урок теряет содержимое навсегда](https://github.com/SuselMan/art_lessons/issues/522) | OPEN | [QA-446](historical.md#qa-446) |
| [#532 — [Bug] Engine: скорость пера меряется по часам обработчика — штрих линером ложится зеброй и вполсилы](https://github.com/SuselMan/art_lessons/issues/532) | CLOSED | [QA-456](historical.md#qa-456) |
| [#533 — [Bug] Web: вход молча открывает пустую комнату, когда снапшоты не доехали](https://github.com/SuselMan/art_lessons/issues/533) | CLOSED | [QA-333](browser.md#qa-333) |
| [#534 — [Bug] Web: отчёт о восстановлении снапшота не несёт текста ошибки](https://github.com/SuselMan/art_lessons/issues/534) | OPEN | [QA-550](historical.md#qa-550) |
| [#537 — [Bug] Web: локальный штрих красится до присвоения seq — у участников расходится порядок операций на слое](https://github.com/SuselMan/art_lessons/issues/537) | CLOSED | [QA-495](historical.md#qa-495) |
| [#538 — [Bug] Web: исключение в хвосте джойна оставляет комнату полуоткрытой — прелоадер уходит, состояние не применено](https://github.com/SuselMan/art_lessons/issues/538) | CLOSED | [QA-498](historical.md#qa-498) |
| [#540 — [Bug] Engine: тесты угля таймаутят по 5 с при полном прогоне движка](https://github.com/SuselMan/art_lessons/issues/540) | OPEN | Таймаут charcoal unit под общей нагрузкой — надёжность теста, не новое поведение продукта. Timeout/flake сохранять в результате, не считать PASS. |
| [#555 — [Bug] Infra: backup-check зелёный, пока выгрузки в B2 падают три недели — и диск от этого забивается](https://github.com/SuselMan/art_lessons/issues/555) | CLOSED | [QA-574](historical.md#qa-574) |
| [#559 — [Bug] Engine: chisel-маркер малого размера рисует дырявую ленту вместо сплошной](https://github.com/SuselMan/art_lessons/issues/559) | CLOSED | [QA-551](historical.md#qa-551) |
| [#560 — [Bug] Engine: chisel-маркер поперёк хода рисуется живьём не так, как в реплее (redo/перезагрузка)](https://github.com/SuselMan/art_lessons/issues/560) | OPEN | [QA-552](historical.md#qa-552) |
| [#561 — [Bug] Engine: край ленты маркера зазубрен — рампы штампа и ленты складываются через over, а не max](https://github.com/SuselMan/art_lessons/issues/561) | OPEN | [QA-553](historical.md#qa-553) |
| [#570 — [Bug] UI: без WebGL комната открывается чёрным экраном, а «созданная» комната не существует](https://github.com/SuselMan/art_lessons/issues/570) | CLOSED | [QA-554](historical.md#qa-554) |
| [#572 — [Bug] UI: нет страницы 404 — любой адрес мимо роутов показывает пустой чёрный экран](https://github.com/SuselMan/art_lessons/issues/572) | CLOSED | [QA-555](historical.md#qa-555) |
| [#598 — [Bug] Infra: миграции применяются после старта нового сервера — деплой #596 уронил прод](https://github.com/SuselMan/art_lessons/issues/598) | CLOSED | [QA-542](historical.md#qa-542) |
| [#607 — [Bug] Engine: заливка в комнате с листом работает только в прямоугольнике размером с окно](https://github.com/SuselMan/art_lessons/issues/607) | CLOSED | [QA-234](browser.md#qa-234) |
| [#643 — [Bug] Infra: карта — связи модуля на «Структуре» не подсвечиваются](https://github.com/SuselMan/art_lessons/issues/643) | CLOSED | [QA-579](historical.md#qa-579) |
| [#673 — [Bug?] После перезахода в комнату у автора на одну операцию меньше, чем было до перезагрузки](https://github.com/SuselMan/art_lessons/issues/673) | OPEN | [QA-556](historical.md#qa-556) |
| [#684 — [Bug] Engine: flexible и brushpen дают широкую линию при слабом нажиме](https://github.com/SuselMan/art_lessons/issues/684) | CLOSED | [QA-548](historical.md#qa-548) |
| [#685 — Samsung: падение компилятора Adreno блокирует вход во все комнаты](https://github.com/SuselMan/art_lessons/issues/685) | CLOSED | [QA-557](historical.md#qa-557) |
| [#690 — [Bug] QA: offline-сценарий не разрывает живой WebSocket и даёт ложное покрытие](https://github.com/SuselMan/art_lessons/issues/690) | OPEN | [QA-575](historical.md#qa-575) |
| [#691 — [Bug] Engine: одновременная акварель расходится у живых участников и после reload](https://github.com/SuselMan/art_lessons/issues/691) | OPEN | [QA-017](../scenarios/collaboration.md#qa-017), [QA-022](../scenarios/collaboration.md#qa-022), [QA-024](../scenarios/collaboration.md#qa-024) |
| [#692 — [Bug] QA: мост устройств зависает на пустой форме входа](https://github.com/SuselMan/art_lessons/issues/692) | OPEN | [QA-576](historical.md#qa-576) |
| [#693 — [Bug] UI: offline-фигура теряется при удалении её слоя другим участником](https://github.com/SuselMan/art_lessons/issues/693) | OPEN | [QA-496](historical.md#qa-496) |
| [#694 — [Bug] Engine: маркер и кисть-перо не обновляют уменьшенный холст](https://github.com/SuselMan/art_lessons/issues/694) | OPEN | [QA-558](historical.md#qa-558) |
| [#695 — [Bug] Auth: cookie отсутствующего пользователя создаёт несохраняемую комнату](https://github.com/SuselMan/art_lessons/issues/695) | OPEN | [QA-401](historical.md#qa-401), [QA-426](historical.md#qa-426) |
| [#696 — [Bug] Input: чужой pointer и hover попадают в активный штрих](https://github.com/SuselMan/art_lessons/issues/696) | OPEN | [QA-013](../scenarios/collaboration.md#qa-013), [QA-051](watercolor.md#qa-051) |
| [#697 — [Bug] Rendering: Surface замирает на 0.5–0.8 с при совместном рисовании](https://github.com/SuselMan/art_lessons/issues/697) | OPEN | [QA-014](../scenarios/collaboration.md#qa-014) |
| [#698 — [Bug] Filters: диалог возвращается после undo чужого удаления слоя](https://github.com/SuselMan/art_lessons/issues/698) | OPEN | [QA-015](../scenarios/collaboration.md#qa-015) |
| [#699 — [Bug] Collaboration: заморозка посреди штриха оставляет призрак у наблюдателя](https://github.com/SuselMan/art_lessons/issues/699) | OPEN | [QA-016](../scenarios/collaboration.md#qa-016) |
| [#700 — [Bug] Engine: финальное досыхание акварели не обновляет уменьшенный холст](https://github.com/SuselMan/art_lessons/issues/700) | OPEN | [QA-018](../scenarios/collaboration.md#qa-018) |
| [#701 — [Bug] Engine: undo/replay синхронно выгружает текстуры и задерживает кадры на iPad и Surface](https://github.com/SuselMan/art_lessons/issues/701) | OPEN | [QA-019](../scenarios/collaboration.md#qa-019) |
| [#702 — [Bug] Engine: фоновый spill блокирует кадры до 1,87 секунды на iPad](https://github.com/SuselMan/art_lessons/issues/702) | OPEN | [QA-020](../scenarios/collaboration.md#qa-020), [QA-023](../scenarios/collaboration.md#qa-023) |
| [#709 — [Bug] Engine: e2e тонкой акварельной линии иногда видит белый холст](https://github.com/SuselMan/art_lessons/issues/709) | OPEN | [QA-235](browser.md#qa-235) |
| [#714 — [Bug] Engine: вставленный фрагмент исчезает после закрытия гизмо](https://github.com/SuselMan/art_lessons/issues/714) | CLOSED | [QA-209](browser.md#qa-209) |
| [#715 — [Bug] UI: зум и вращение не двигают холст после перехода на новый Board](https://github.com/SuselMan/art_lessons/issues/715) | CLOSED | [QA-206](browser.md#qa-206) |
| [#719 — [Bug] UI: выровнять надпись логотипа и убрать её из компактного варианта](https://github.com/SuselMan/art_lessons/issues/719) | CLOSED | [QA-522](historical.md#qa-522) |
| [#728 — [Bug] Engine: ночная проверка акварели — каёмка, производительность, загрузка и Undo/Redo](https://github.com/SuselMan/art_lessons/issues/728) | OPEN | [QA-025](watercolor.md#qa-025), [QA-026](watercolor.md#qa-026), [QA-027](watercolor.md#qa-027), [QA-028](watercolor.md#qa-028), [QA-029](watercolor.md#qa-029), [QA-030](watercolor.md#qa-030), [QA-031](watercolor.md#qa-031), [QA-032](watercolor.md#qa-032), [QA-033](watercolor.md#qa-033), [QA-034](watercolor.md#qa-034), [QA-035](watercolor.md#qa-035), [QA-036](watercolor.md#qa-036), [QA-037](watercolor.md#qa-037), [QA-038](watercolor.md#qa-038), [QA-039](watercolor.md#qa-039), [QA-040](watercolor.md#qa-040), [QA-041](watercolor.md#qa-041), [QA-042](watercolor.md#qa-042), [QA-043](watercolor.md#qa-043), [QA-044](watercolor.md#qa-044), [QA-045](watercolor.md#qa-045), [QA-046](watercolor.md#qa-046), [QA-047](watercolor.md#qa-047), [QA-048](watercolor.md#qa-048), [QA-049](watercolor.md#qa-049), [QA-050](watercolor.md#qa-050), [QA-051](watercolor.md#qa-051), [QA-052](watercolor.md#qa-052), [QA-531](historical.md#qa-531), [QA-559](historical.md#qa-559), [QA-560](historical.md#qa-560), [QA-561](historical.md#qa-561), [QA-562](historical.md#qa-562), [QA-563](historical.md#qa-563), [QA-564](historical.md#qa-564), [QA-565](historical.md#qa-565), [QA-566](historical.md#qa-566), [QA-567](historical.md#qa-567), [QA-568](historical.md#qa-568), [QA-569](historical.md#qa-569), [QA-570](historical.md#qa-570), [QA-571](historical.md#qa-571), [QA-572](historical.md#qa-572), [QA-577](historical.md#qa-577), [QA-578](historical.md#qa-578) |
| [#738 — [Bug] UI: комнаты в проектах остаются без превью](https://github.com/SuselMan/art_lessons/issues/738) | CLOSED | [QA-439](historical.md#qa-439), [QA-440](historical.md#qa-440) |
| [#739 — [Bug] UI: вход в старую комнату скачивает покрытую снапшотами историю и падает после переподключения](https://github.com/SuselMan/art_lessons/issues/739) | CLOSED | [QA-488](historical.md#qa-488), [QA-500](historical.md#qa-500) |
| [#741 — [Bug] Server: доступ к снимкам ошибочно зависит от живого сокета](https://github.com/SuselMan/art_lessons/issues/741) | CLOSED | [QA-424](historical.md#qa-424), [QA-425](historical.md#qa-425), [QA-489](historical.md#qa-489), [QA-500](historical.md#qa-500) |
| [#743 — [Bug] М 70: акварель не видна до отпускания пера](https://github.com/SuselMan/art_lessons/issues/743) | OPEN | [QA-025](watercolor.md#qa-025) |
| [#744 — [Performance] М 70: медленный Undo акварели](https://github.com/SuselMan/art_lessons/issues/744) | OPEN | [QA-041](watercolor.md#qa-041) |
| [#746 — [Bug] М 70: поздняя структурная зависимость обходит проверку snapshot prefix](https://github.com/SuselMan/art_lessons/issues/746) | OPEN | [QA-559](historical.md#qa-559) |
| [#747 — [Bug] Акварель M70 должна работать на A4, A3 и любых конечных размерах листа](https://github.com/SuselMan/art_lessons/issues/747) | OPEN | [QA-030](watercolor.md#qa-030), [QA-049](watercolor.md#qa-049) |
| [#748 — [Bug] М 70: сухой target расходится между AMD и Intel при одинаковой истории](https://github.com/SuselMan/art_lessons/issues/748) | OPEN | [QA-042](watercolor.md#qa-042) |
| [#749 — [Bug] М 70: duplicate и merge мокрых слоёв сохраняют кадр анимации вместо target](https://github.com/SuselMan/art_lessons/issues/749) | OPEN | [QA-560](historical.md#qa-560) |
| [#750 — [Bug] Историческая копия слоя меняется при replay после позднего Undo оригинала](https://github.com/SuselMan/art_lessons/issues/750) | OPEN | [QA-561](historical.md#qa-561) |
| [#751 — [Bug] Replay старой копии подхватывает более новый snapshot оригинала](https://github.com/SuselMan/art_lessons/issues/751) | OPEN | [QA-562](historical.md#qa-562) |
| [#752 — [Bug] Engine: копия мокрого слоя закрепляет неверный порядок одновременных мазков](https://github.com/SuselMan/art_lessons/issues/752) | OPEN | [QA-043](watercolor.md#qa-043), [QA-044](watercolor.md#qa-044) |
| [#753 — [Bug] Engine: live и replay используют разное время естественной сушки акварели](https://github.com/SuselMan/art_lessons/issues/753) | OPEN | [QA-038](watercolor.md#qa-038), [QA-048](watercolor.md#qa-048) |
| [#754 — [Bug] Engine: Undo слияния мокрых слоёв неверно восстанавливает живой источник](https://github.com/SuselMan/art_lessons/issues/754) | OPEN | [QA-563](historical.md#qa-563) |
| [#755 — [Bug] Engine: новый ввод во время сушки молча отбрасывается на всех слоях](https://github.com/SuselMan/art_lessons/issues/755) | OPEN | [QA-564](historical.md#qa-564) |
| [#756 — [Bug] Engine QA: проверка загрузки ошибочно требует весь журнал поверх snapshot](https://github.com/SuselMan/art_lessons/issues/756) | OPEN | [QA-577](historical.md#qa-577) |
| [#757 — [Bug] Engine: прогрев акварели вызывает фоновые ошибки при рисовании карандашом](https://github.com/SuselMan/art_lessons/issues/757) | OPEN | [QA-565](historical.md#qa-565) |
| [#758 — [Bug] Engine: отклонённый мазок акварели оставляет незаписанные пиксели и активный жест](https://github.com/SuselMan/art_lessons/issues/758) | OPEN | [QA-030](watercolor.md#qa-030) |
| [#759 — [Bug] Server: Undo позднего chunk сохраняет запечённый ранний chunk жеста](https://github.com/SuselMan/art_lessons/issues/759) | OPEN | [QA-036](watercolor.md#qa-036) |
| [#760 — [Bug] Engine: морфинг мокрого слоя может перезаписывать фигуры и операции с пикселями](https://github.com/SuselMan/art_lessons/issues/760) | OPEN | [QA-031](watercolor.md#qa-031) |
| [#761 — Ложная блокировка снимка при догрузке уже учтённого Undo](https://github.com/SuselMan/art_lessons/issues/761) | OPEN | [QA-027](watercolor.md#qa-027) |
| [#762 — [Bug] Server: отклонённый мазок оставляет живой след у других участников](https://github.com/SuselMan/art_lessons/issues/762) | OPEN | [QA-566](historical.md#qa-566) |
| [#764 — Онлайн: хвост удерживаемого мазка не отправляется после остановки пера](https://github.com/SuselMan/art_lessons/issues/764) | OPEN | [QA-567](historical.md#qa-567) |
| [#765 — Акварель: пустой prewarm блокирует публикацию снимков слоя](https://github.com/SuselMan/art_lessons/issues/765) | OPEN | [QA-568](historical.md#qa-568) |
| [#766 — Акварель: изменение viewport стирает чужой удерживаемый мазок на Samsung](https://github.com/SuselMan/art_lessons/issues/766) | OPEN | [QA-569](historical.md#qa-569) |
| [#767 — [Bug] Engine: сушка после переподключения перезаписывает новый снимок старой лужей](https://github.com/SuselMan/art_lessons/issues/767) | OPEN | [QA-570](historical.md#qa-570) |
| [#768 — [Bug] UI: Fit canvas помещает часть альбомного холста под боковую панель](https://github.com/SuselMan/art_lessons/issues/768) | OPEN | [QA-571](historical.md#qa-571) |
| [#769 — [Bug] Engine: пустой или неполный снимок сохраняет старые пиксели слоя](https://github.com/SuselMan/art_lessons/issues/769) | OPEN | [QA-036](watercolor.md#qa-036) |
| [#770 — [Bug] Engine: Undo временно стирает незавершённый живой мазок на общем слое](https://github.com/SuselMan/art_lessons/issues/770) | OPEN | [QA-032](watercolor.md#qa-032) |
| [#771 — [Bug] Engine: Dry задерживает хвост истории после завершения загрузки комнаты](https://github.com/SuselMan/art_lessons/issues/771) | OPEN | [QA-036](watercolor.md#qa-036) |
| [#772 — Отменённый мазок переносит сушку на следующий слой](https://github.com/SuselMan/art_lessons/issues/772) | OPEN | [QA-572](historical.md#qa-572) |
| [#773 — Заморозка комнаты скрывает разрешённый живой мазок ведущего](https://github.com/SuselMan/art_lessons/issues/773) | OPEN | [QA-027](watercolor.md#qa-027) |
| [#774 — Снимок теряет начало незавершённого обычного мазка](https://github.com/SuselMan/art_lessons/issues/774) | OPEN | [QA-032](watercolor.md#qa-032) |
| [#775 — Отклонённая Undo повторно отменяет мазок после загрузки истории](https://github.com/SuselMan/art_lessons/issues/775) | OPEN | [QA-026](watercolor.md#qa-026) |
| [#776 — Ответ старой очереди попадает на новую доску](https://github.com/SuselMan/art_lessons/issues/776) | OPEN | [QA-034](watercolor.md#qa-034) |
| [#777 — Смена доски теряет отложенное восстановление рисунка](https://github.com/SuselMan/art_lessons/issues/777) | OPEN | [QA-045](watercolor.md#qa-045) |
| [#778 — Восстановление акварели теряет сушку и мокрые границы](https://github.com/SuselMan/art_lessons/issues/778) | OPEN | [QA-045](watercolor.md#qa-045) |
| [#779 — Undo сушки не возвращает ранее защищённую воду](https://github.com/SuselMan/art_lessons/issues/779) | OPEN | [QA-026](watercolor.md#qa-026), [QA-037](watercolor.md#qa-037) |
| [#780 — [Bug] Server: закрытие второго устройства может лишить первое присутствия и роли](https://github.com/SuselMan/art_lessons/issues/780) | OPEN | [QA-033](watercolor.md#qa-033) |
| [#781 — Акварель до 100 секунд остаётся в неверном порядке после offline UP и reconnect](https://github.com/SuselMan/art_lessons/issues/781) | OPEN | [QA-028](watercolor.md#qa-028) |
| [#782 — Принятая Dry перед pending мазком ошибочно высушивает его локальный материал](https://github.com/SuselMan/art_lessons/issues/782) | OPEN | [QA-028](watercolor.md#qa-028) |
| [#783 — [Bug] Server: поздний join_room воскрешает отключённый сокет и отменяет новый вход](https://github.com/SuselMan/art_lessons/issues/783) | OPEN | [QA-034](watercolor.md#qa-034) |
| [#784 — [Bug] Server: уход последнего участника срывает ожидающий вход ложным not_found](https://github.com/SuselMan/art_lessons/issues/784) | OPEN | [QA-034](watercolor.md#qa-034), [QA-531](historical.md#qa-531) |
| [#785 — M70 иногда теряет владение settle при онлайн-рисовании](https://github.com/SuselMan/art_lessons/issues/785) | OPEN | [QA-046](watercolor.md#qa-046) |
| [#786 — [Bug] Server: поздняя эвакуация доски воскрешает сокет и перенаправляет операции](https://github.com/SuselMan/art_lessons/issues/786) | OPEN | [QA-034](watercolor.md#qa-034) |
| [#787 — [Bug] Engine: медленная загрузка длинной мокрой истории M70](https://github.com/SuselMan/art_lessons/issues/787) | OPEN | [QA-040](watercolor.md#qa-040) |
| [#788 — [Bug] UI: старый snapshot перезаписывает новое состояние после reconnect](https://github.com/SuselMan/art_lessons/issues/788) | OPEN | [QA-035](watercolor.md#qa-035) |
| [#789 — [Bug] UI: холодный Undo пропускает операцию на границе snapshot](https://github.com/SuselMan/art_lessons/issues/789) | OPEN | [QA-036](watercolor.md#qa-036) |
| [#790 — QA: стенд M70 теряет модель после перехода между досками](https://github.com/SuselMan/art_lessons/issues/790) | OPEN | [QA-578](historical.md#qa-578) |
| [#792 — [Bug] Server: pen-up теряет отмену незаписанного live-хвоста при живой второй вкладке](https://github.com/SuselMan/art_lessons/issues/792) | OPEN | [QA-033](watercolor.md#qa-033) |
