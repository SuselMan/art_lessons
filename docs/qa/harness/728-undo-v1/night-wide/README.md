# #745: расширенная проверка слоёв и входа

Новые файлы кампании; исходники движка не меняются. `layers.cjs` принимает ту
же приватную QA_* среду, что `../room.cjs`; требуется новая disposable-комната,
два независимых автора, координатор выделяет реальный CDP GPU.

`QA_LAYER_CASES` — запятыми выбранные сценарии (чтобы после находки не повторять
всё): `duplicate-wet,duplicate-dry,clear,delete,merge,move,concurrent,load,reconnect`.
Отдельный негативный `three-wet-layers` не включён по умолчанию: третий мокрый
слой сейчас запрещён runtime guard и это известный продуктовый блокер.

- Копирование и merge проверяются по **живым** пикселям до full-replay oracle.
- Clear/delete/move проходят адресованные undo/redo и проверку обоих участников.
- Reconnect изолирует сеть только своего browser context, записывает локальный
  и чужой вклад, возвращает сеть в finally, ждёт подтверждений и сравнивает журнал.
  Wi-Fi/SSH устройства не меняются.
- Concurrent запускает реальный локальный pen pipeline двух авторов одновременно.
- `loading.cjs` проверяет настоящий URL-вход `&preview` в режим аннотаций:
  normal1100×850, annotations1100×850, compact-annotations390×844.
  `QA_LOAD_MODES=annotations,compact-annotations` ограничивает повтор;
  `QA_DPR=1.5 QA_HAS_TOUCH=1` задаёт профиль устройства. Первые кадры и
  engineReady сохраняют фактический annotationMode. Старый `layers.cjs load`
  проверяет только rejoin маленькой fixture с последующим переключением UI,
  поэтому не заменяет проверку входа в режиме аннотаций.

`prepare-wide.cjs` создаёт новую комнату как старый prepare.cjs, дополнительно
учитывая `QA_CANVAS_WIDTH`, `QA_CANVAS_HEIGHT`, `QA_INFINITE=1`. По умолчанию512².
Использовать отдельную новую приватную fixture папку для каждого размера.
Геометрические негативные сценарии:512×768,1536²,infinite512²; запустить `load`
или `duplicate-wet`, записать реальную ошибку без fallback на legacy.

Все contexts закрываются в finally; созданную комнату удалять штатным
`../cleanup.cjs` только с точным marker ID и owner-state. Приватные host-state
удалять после последней проверки. Не удалять чужие комнаты/данные.

Загрузка100×8: `run-case.py --case load100 --script loading.cjs --load-strokes 100
--load-dabs 8 --dry-every 20 --cdp <own hardware CDP> --output <own evidence dir>`
(аргументы чисел передавать с пробелом). prepare-load.cjs создаёт и наполняет
новую комнату через штатные socket operations, сервер сам назначает порядок.
Seed728745,8dabs/мазок, каждый preset явно wc@m70-r2-v1; dry-every0 означает
одну мокрую порцию,20 — послойные границы каждые20мазков. InputSHA записывается.

Loading report отдельно измеряет navigation→UI-ready (штатный room-open outcome ready), engine-ready, full-history-complete
и первый кадр после display с содержимым (дваrAF; прокси compositor, не датчик
экрана). Снимок каждого режима подтверждает видимый результат. Измерения
проводятся последовательно, без headless/GPUзамены. Только свежие комнаты.

`historical-copy` (#750): Aмазок → Aсушка → Bмазок → Bкопия → Aundoсушки.
Оригинал пересчитывается, но копия должна соответствовать материалу на её
исторической границе. Actual копии читается до oracle, затем проверяется cold
rejoin с полным журналом. Этот сценарий отличается от обычного wet duplicate.


`merge-fallback` (#752/#754) принудительно помечает source unsettled только в QA,
проверяет historical replay при двух live wet sources и actual undo restore.
`QA_MERGE_DIAGNOSTICS=1` сохраняет checkpoint.best/start, sourceops и rawtile hashes
до merge и после undo ДО запуска oracle. Обычный `merge` проверяется отдельно.

`reconnect` сравнивает actual target сразу после восстановления сети;
`reconnect-dry` добавляет записанную paper_dry перед сравнением и отвечает только
за окончательный сухой результат. Их результаты не взаимозаменяемы.

`background-dry` сначала измеряет document.hidden и RAF progress; если фактическая
пауза RAF недоступна, честно использует CDP lifecycle frozen. Это проверка queue
convergence после возобновления, не доказательство OS sleep. Новый ввод peer
после dry ждёт собственного drying=false; исходная потеря ввода до этой точки
зафиксирована отдельно и не закрывается успехом этого сценария.

`guard-third-wet` и `guard-geometry` проверяют сохранность соседнего материала и
pencil recovery после unsupported M70. Геометрия задаётся QA_CANVAS_WIDTH/HEIGHT,
QA_INFINITE; для1536² QA_GUARD_X=2030 пересекает границу1024worldpx.
