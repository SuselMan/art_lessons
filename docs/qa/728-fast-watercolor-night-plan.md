# Супербыстрая акварель — план ночи 07→08 октября

Илья согласовал запуск23:34Europe/Vilnius. Publication/main/deploy не разрешены.
Baseline6aa14a43; safe pack ffd3fdc8 (runtime), rootf7dc9c3d (docs).
Принцип: сохранить каноническую модель и отделить математическое вычисление,
управление ресурсами и presentation; измеренный выигрыш принимается вместе с
проверкой прежнего результата, а не вместо неё.

- [x] Зафиксировать работающийbaseline иsafe pack;106combinedCPUtests/types/lint.
- [x] WholeRGBA samejournal Surface baseline/safepack совпадает.
- [ ] Root: локализовать615ms Skiawait абляцией display/solver/copygroups.
- [ ] CPUagent: geometry/_paintDabs/contact/wet-overlay exactreuse.
- [ ] GPUagent: exact pixels/copy/flow/state workelimination, безQ8потерь.
- [ ] WebGL2agent: isolatedbrush двухpass same-math, затемMRTbenchmark.
- [ ] Ограниченныйsuperoptimizationexperiment толькоизмеренногоpurekernel.
- [ ] Samsung/Surface brush400: dryfirst, wetnext, zigzag, wateronly,puddlepigment.
- [ ] Операции/undo/redo/rejoin/multiuser иконтекст поscopeкаждогокандидата.
- [ ] Итоговыйотчет: выигрыш/отклонение/непроверенное, лучшийстенд.

ЦелевыеUX ориентиры: первоеappearance≤50ms, нопаузы>100ms. Метрикиhandler/rAF
невыдаватьзапрямоеphysicalpen→screenвремя. GPUservicewalltime неshaderexec.
Всеdeviceпрогоныпоследовательно; проектыагентоввразныхworktree. Каждыйкандидат
отдельнымcommit, пачкисbinarybisection+interactioncheck. Неизменятьанимацию
сушки/schedulerбезотдельныхгейтов. Неускорять ценойпрозрачного/позднегомазка.

Контролькаждые45–60мин: новоеизмерение/кандидат/отклонение; после2цикловбезновых
данных сменитьэксперимент. Артефактыtemp/fast-watercolor-night, дисковыене/tmp.
ПредварительнодоступныSurface/Samsung; Lanpadнедоступен. iPadнезаявленпроверенным.

БазовыйSurfaceAB: tail617/617ms, nextfullhandler121.7/132.2ms. Safechangesглавную
паузунеисправили. ДлинныйSkiafinish615ms — зацепкадлядиагностики, непричинадоказана.

## Контрольная точка: аппаратные эксперименты

Surface: отключение финального screen blit (239 вызовов) оставило хвост667ms;
отключение preserveDrawingBuffer —633ms. Brush-pass ablation —450ms,
water-front —334ms, diffuse —600ms. Это диагностическое изменение картинки,
не готовые оптимизации; сравнения однократные, причинность неаддитивная.

WebGL2/MRT isolated brush: все четыре RGBA fixtures побайтно совпали на Surface.
GPU timer доступен,45 valid samples (5 на режим/повтор), disjoint/loss отсутствуют.
Для2/4/8 пар медианы WebGL1:7.209/13.879/18.311ms,
WebGL2:6.936/14.094/17.584ms, MRT:4.117/8.000/10.357ms.
MRT сокращает этот оператор приблизительно на42%; это не измерение Room/FPS.
Артефакт:temp/fast-watercolor-night/webgl2-surface-1791406339462.json.

CPU typed writer и paired wet raster включены локально, GPU кандидаты пока
под diagnostic flags OFF. Следующий гейт — frozen combined аппаратный replay,
потом undo/redo и живое рисование. 65selectedtests/types/lint прошли;
новые добавленные позже файлы требуют соответствующих дополнительных гейтов.

## Контрольная точка после полуночи

Samsung SM-T970/Chrome154: trusted HTTPS origin, все4 fixtures WebGL1/WebGL2/MRT
побайтно совпали, GL errors отсутствуют. GPU timer extension отсутствует во всех
трёх путях, поэтому speedup Samsung не заявляется. Raw1791407001965.
Первый dev self-signed origin не имел crypto.subtle; это ошибка условий harness,
не ошибка шейдера. Свои тестовые вкладки закрыты, осталась исходная1475.

Combined87f frozen QA Surface: активные кадры max34ms, tail600ms,
следующий handler124.8ms; wholeRGBA fixed tape совпал686485f8…5944.
Одна arm полностью прошла; старый epilogue ошибочно обращался к отсутствующей
второй arm, raw error сохранён. Derived combined-summary подтверждает только arm.

Новый GPU dead first upload OFF и bounded4MiB/128 CPU contact cache OFF локально
сохранены. Конфликт workspace/cache разрешён приоритетом cache: workspace создаётся
только без cache; оба очищаются на destroy/forget. 97mergedPlantests прошли.
Реальные cache hits пока не измерены; синтетическое warm ускорение не FPS.

Илья00:01 запросил отдельный полный WebGPU watercolor PoC; агент
watercolor_webgpu_poc начал отдельный728-webgpu-poc, dev-only solver/страница,
с явными границами fidelity и одинаковыми input cases. Production не меняется.

Mixed Room прогон прерван потерей HOME ноутбука: SSH tunnel banner timeout,
прямой home-laptop No route to host. Surface прямой SSH жив; CDP перенесён на
собственный9455. Данный mixed прогон не считается hardware PASS. Новые самостоятельные
WebGL2/WebGPU fixtures возможны через trusted private static gallery без HOME backend.

## Актуальная точка 08 октября, около 01:22

### Первое появление пигмента

Mixed-admission Surface двух обычных новых комнат: CPU DOWN12.3→4.2ms,
после-DOWN pixel-read wait671.7→49.2ms, верхняя граница GPU готовности первого
пигмента714.6→63.1ms. Горячий DOWN не содержит pre-read/finish.
Все38полей/wholeRGBA/material inputs совпали; настоящие UI Dry/Undo/Redo/fresh PASS.
Это не прямое physical pen→screen/compositor время.
Default ещё OFF: Samsung, rapid/multiuser/layer/new-wash rejection gates остаются.

### CPU/GPU оптимизации

Typed ribbon writer, paired wet raster, workspace/storage reuse, direct resample
и dead first upload сохранены отдельно. Frozen combined wholeRGBA exact, tail
600ms вместо baseline~650ms: главную задержку это не решило.
Contact cache capped4MiB/128 и exact key проверены unit; actual hit ratio неизвестен.

### WebGL2/MRT

Actual PencilEngine GL1/MRT wholeRGBA/tape/Undo/Redo exact на Surface.
MRT2560pairs/fallback0. Replay wall20.98s→21.31s, полного выигрыша нет.
Очередь исполняет обычно1settle op/frame; GPU acceleration сама не убирает это
ожидание. Нужно отдельно проверить безопасные existing batch groups.
GPU pass sampler: brush median~1.05ms, water-front~2.09ms. Выборки ограничены
pending cap, поэтому нельзя умножать sampledmean на всючастотудляобщеговремени.
Sampler пока не оборачивает brushPair; реальныйMRT GPU timer нужно добавить.

### WebGPU

Первоначальная модель была слишком малоподвижной — отзыв Ильи подтверждён.
Pause UX1d070ab3 Surface PASS; новыйphysical52f78a2a содержит multiscale
wet-path transport + contact remobilization.
Surface Mix colors: variance5104→15731за644ticks (старый5432за616).
GPU median5.70ms/p9513.63ms в этом сценарии; 24MiB полей.
Визуально цвета распространяются по общей луже, но движение довольно агрессивное;
это экспериментальный результат, не подтверждение реализма.
Hardware replay0differentfloats, Drymobile/water0, Undoempty, Redoexactmass PASS.
Software dry-gap PASS; независимые largebrush gates ещё дополняются.
Отдельный faithfulQ8compute прошёл software, но hardware byte parity FAIL
(max difference3–5): не считать точным production port.
Исходная приватная ссылка обновлена новымphysicalbundle.

### Ограничения и следующие шаги

HOME laptop SSH недоступен; Surface directCDP и Samsung directADB доступны.
QA backend/frontend созданы наVPS без productionDB, доступнычерезсуществующий
домашнийтуннель. iPad не проверен.
Кайма, полная долгая загрузка и multiuser регрессии этойточкой не закрыты.
Новый main/push/deploy не выполнялись.

## Контрольная точка 09 октября, 00:18 (Europe/Vilnius)

Все варианты ниже остаются QA, defaults production не включены.

| Направление | Подтверждено | Следующая проверка |
|---|---|---|
| Раздельные владельцы мазков / FIFO | Surface: четыре мазка, исходный canonical итог и Dry/Undo/Redo exact; общий owner suite 75 tests PASS | Samsung, несколько участников, другие слои/тайлы и физическая задержка пера |
| Первое касание | Caller создания мокрой текстуры: `_onStart → _display → _takePaperPartial → _updateWetTexture`. QA заранее создаёт только GL texture name | Upload/storage остаются внутри исходного пути; измерить отдельно CPU и GPU, не выдавать name prewarm за устранение всех затрат |
| Переход вода → пигмент → другой цвет | Surface: четыре DOWN без texture allocation и synchronous settle drain, history exact, GL0/lost=false; шесть кадров после четвёртого canonical landing | Пигмент не исчезает, но видимое изменение формы слабое. Записать от UP, включая время до landing; художественная готовность не подтверждена |
| WebGPU кайма / шум | Общая seeded corner texture: mode6 G отличается в 9 значениях max1 вместо 3254 max5; B/A exact, R3 max1 остаются | Это иной пространственный рисунок, а не exact original port. Проверить first carry mode15 на общих оригинальных входах |
| Активный перенос / base / film | CPU-контрпример доказывает изменение source формулы при rebase/clear film; удаление rebase само по себе ведёт к перезаписи переноса следующим source pass | Реальный A wetmix: readonly снимки восьми ролей, explicit absence, контакт2/epochs/settled budget; физику пока не менять |

Actual 25-dab Room-пара проверяет source/visibility/history, но её плотная
клякса почти не показывает художественную разницу. Она не является доказательством
«акварель стала лучше». Новые смотрины должны содержать движение и wetmix на
одинаковых UI/camera. Исходные frozen стенды сохранены. Push/main/deploy не было.

### Уточнение: почему запись только после landing недостаточна

В QA `owner-fifo-install.mjs` событие seal само не запускает транспорт preview.
`OwnedPresentationMorphBridge.hold()` создаёт progressive reveal с
`startedAt=null`; `rebaseStarted(next)` вызывается после завершения predecessor.
Поэтому отсутствие исчезновения на кадрах после landing не доказывает движение
сразу после UP. Запуск часов без нового транспортного target даст переход к тому
же source, а не растекание. Следующий двухвладельческий сценарий сохраняет полную
ленту, проверяет size=70 и в store, и в engine, пишет шесть кадров от seal второго
мазка и привязывает их к UP/parent-land/final-land. Эта точка пока ожидает hardware
trace; canonical результат и его replay остаются отдельным обязательным gate.

First carry WebGPU на общих оригинальных mobile/pressure входах расходится уже
в первом stride: 260 RGBA значений, max38. Это более существенный ранний источник,
чем остаточные max1 у каймы. Следующий OFF диагностический вариант сравнит manual
bilinear и аппаратный LINEAR только для pressure; input passport и оригинальная
формула сохраняются. Причина ещё не доказана.

### Подтверждения к 09 октября, 00:42

- Actual water-dab запись от UP: пигмент неподвижен 2188 ms до первого material
  reveal / predecessor land. Все шесть кадров до этого события имеют MAX RGB1.
  Сохранённая двухоперационная лента отдельно отрисована исходным движком:
  конечный PNG exact; undo совпадает с чистой водой, redo exact. Это проблема
  presentation, а не доказательство неправильного canonical endpoint.
- Замена только manual bilinear pressure на hardware LINEAR в WebGPU дала
  exact first carry. Затем все 14 оригинальных strides с независимым Q8
  ping-pong каждой API дали exact конечный RGBA/SHA без oracle reset. Причина
  данного расхождения локализована в выборке pressure. Brush68 и весь Room
  ещё не подтверждены.
- Actual common-ROI wetmix: три контакта × 21 стадия, восемь material ролей и
  две V-карты publication сохранены exact. settled и foreignV отсутствуют,
  ownV присутствует; V нельзя заменять P.R. Наблюдаемое межконтактное изменение
  проверяется отдельно на границе canonical settle, не объявляется потерей
  массы по crop.
- Ранний preview: CPU lease/epochs/cancel и вызовы existing GL material
  diffusion проверены, но primitive ещё не подключён к Room. Уменьшение 8×
  четырьмя samples — аппроксимация; actual inherited water domain, faint dab,
  readonly source SHA и GPU timing остаются обязательными gates.

Исправление проверки preview: первоначальный synthetic fixture задавал воду
в B/A, хотя raw solventLoad в обоих backend имеет R=A, G=B=0. Поэтому его
расширение 60→334 ячейки не подтверждает работу на настоящей воде. Ошибка
найдена при review каналов, domain исправлен на порог A и support R/A.
Это support-mask, а не толщина или значение wetness. Actual retained V до
predecessor land и исправленный GPU/Room gate ещё необходимы. Исторический
synthetic результат и дрейф массы −2,904% сохранены с этим ограничением.

### Контрольная точка 09 октября: actual radial и следующий шаг

На Surface ранний preview подключён к настоящей Room. Конечный результат и redo
совпадают с исходным движком для той же новой ленты, но видимое растекание пока
слишком слабое: это не готовый пользовательский результат.

Radial gate: покрытие унаследованной лужи охватывает весь moving P; вне покрытия
P нет. Поэтому расширение coverage в этом сценарии не обосновано и не включается.
P.B/A: сумма 1419→1203→769 (начало/16/64), max 98→22→10; support 23→174.
Между шагами 64 и 111 моменты неизменны. Material расширяется с 44 до 108 world px,
но последующее RGBA8 feedback-смешивание с коэффициентом около 0,011 за кадр
может округлить слабое изменение до нуля. Проверяется OFF direct material preview
с сохранением последнего видимого кадра при canonical handoff. Отдельно агент
исследует потери Q8; изменение canonical результата не разрешается этим gate.

Native brush: независимая цепочка 14 контактов на Surface накапливает расхождение
P до max7 (1912 ячеек), C до max7. Это подтверждает накопление Q8 расхождения,
но не объясняет весь Room. Следующий bounded float/floor контроль проверит
арифметику без epsilon или изменения исходных формул.

### Следующая контрольная точка: direct preview, interpolation, Float32

- Direct material preview: на Surface изменение видно до canonical land,
  MAX RGB49 на 116ms вместо прежних MAX2. Исходный движок на **той же новой
  ленте** дал exact сухой PNG/redo. На раннем изображении обнаружена 128-cell
  решётка, поэтому вариант не готов к художественной оценке.
- Paired LINEAR только при display уменьшил внутреннюю решётку, но оставил
  ступенчатую пурпурную кромку. Handoff 0→58ms MAX3, 0→181ms MAX6, лишь два
  пикселя изменились больше5; полного исчезновения нет. Это другая новая
  лента: её исходный endpoint отдельно пока не подтверждён.
- Actual Surface Float32 render/read capability PASS, четыре собственных
  FBO, readback64bytes; это не скорость или качество модели. OFF typed
  pool/transport готов, бюджет15.375MiB; основной runtime пока не переключён.
- WebGPU pressure-only whole контроль на той же common source уменьшил
  число отличных RGBA значений49052→42686; max36 сохранился. Полной парности
  модели нет, wall time с readbacks/setup не является perf A/B.
- Reuse: generic preview coordinator недостаточен для снятия лимита3 Room
  admissions. Нужен общий certificate main+preview+presentation и отсутствие
  будущих CPU-производителей. Готовы отрицательные fixtures, wiring впереди.

### Контроль 09 октября: сохранение массы и параметры material

- Actual Surface Float32 preview: сумма P 5,253921704→5,253920926,
  относительное изменение −1,48e−7. Прежняя Q8 потеря около46% не повторяется;
  max продолжает меняться после64 шага. Раннее пятно всё ещё имеет грубую
  квадратную область, поэтому художественная готовность не подтверждена.
- Диагностический64 ROI сохраняет1024 проекцию/координаты: обычный material
  и диагностический pending совпали exact по байтам на шагах1/2. Во всех25
  выбранных точках migration не изменил deposit. Это локальный результат,
  не доказательство отсутствия migration артефактов во всех сценах.
- Найдено наследование `dabSpacing=88` от воды400 в следующем одиночном
  пигментном dab70. `beginStroke` не сбрасывает cached spacing. Это может быть
  частью нормализации общей заливки: canonical не исправляется вслепую.
  Подготовлен OFF preview-only вариант с неизменяемой геометрией собственного
  source. Для единственного dab используется настоящий размер наконечника
  с production spacing factor0,22; в записанной ленте это около9,994,
  а не номинальные70×0,22. CPU corpus20 подтверждает неизменные GL команды.
- Native Room four400: проверяющий controller принят локально; использует
  отдельный browser context, frozen731733c9, проверку HTTP/source/Fine LA,
  pressure-only opt-in и запрет owner readback на основной временной шкале.
  Аппаратный результат ожидается; rAF и wall time не равны задержке пера/GPU.
- Reuse wiring пока не принят: review обнаружил invalid certificate при
  `readPixels` внутри fence и возможную GPU copy после certificate при
  отмене. Агент исправляет эти два случая до аппаратного запуска.

Production/main не изменены. Новые варианты остаются OFF экспериментами.

### Следующая проверка: причины бледности и первый native publish

- Surface current-source spacing: исчезло квадратное плато, но поздний
  пигмент слишком бледный. Plain material контроль exact на шагах1/2;
  inherited88 против actual9,994 меняет11890/12067 байтов, MAX139/130.
  Settled0 отличается от9,994 значительно слабее: MAX12/11 на том же P/C.
  Это атрибуция material smoothing, не готовый художественный результат.
- Float32 сохраняет массу, однако весь пигмент продолжает диффундировать:
  peak уменьшается25,4 раза за115 шагов. Production осаждает ядро45% и
  последующие доли; preview этого ещё не делает. Flat CPU oracle подтверждает
  примерно4,2–4,5-кратную разницу второго момента относительно рассматриваемой
  production settling подцепочки. Это не утверждение о полном физическом
  solver и не144-кратный прирост/ошибка. Подготовка finite settling OFF начата.
- Native actual Room four400 завершён на frozen731733c9:4 packed strokes,
  GL/context ошибок нет, pressure-флаг реально выполнялся. Первый
  `publishCurrentToGl` занимает примерно3080ms и совпадает с rAF gap3033ms.
  Дальше разделяем async ожидание очереди и синхронный WebGPU→GL canvas bridge.
  Два цветных жеста дали17 и1 dab, поэтому их снимок не доказывает потерю
  второго цвета; нужен сопоставимый жест и provenance входных команд.
- Reuse opt-in подключён в QA после исправления certificate/disposal;
  hooks6, actual installer/pool13 и default installer7 CPU-проверок проходят.
  Отдельный frozen413bc92e стенд5364 готовит hardware четыре same-wash мазка.
  Он проверит actual четвёртое admission и отсутствие дополнительного finish
  на DOWN. Same-tape endpoint/replay остаётся отдельным последующим gate.

Все три агента получили следующий независимый шаг; аппаратные прогоны
распределяются последовательно. Освобождены только npm/pip download caches,
остаток диска увеличен примерно до1 GiB. Evidence и установленный runtime
не удалялись.

### Контрольная точка 09 октября, 02:35

- Native повтор с равными цветными жестами: четыре операции, blue/red по17
  дабов, реальные параметры watercolor400 подтверждены через UI store.
  Красный цвет присутствует. Первый canvas publish3404,4ms состоит почти
  полностью из queue completion3402,6ms; синхронный GL restore0,9ms.
  Это wall time ожидания, не измеренная GPU duration. rAF max3383,2ms: плавность
  не пройдена. PNG448880 bytes и packed tape сохранены для original GL контроля.
- Конечное осаждение preview объединено локально:16 Node и8 reuse Vitest
  проходят. Один Surface прогон выполняется; визуальный результат ещё неизвестен.
- Четвёртый reuse DOWN предыдущего прогона отклонён scope guard. Это не
  доказательство нехватки слотов. Следующий probe ждёт полного canonical idle
  и проверяет новый wash, сохраняя ограничения области применения.
- Original GL контроль учитывает активный и фоновый слой;3 CPU теста проходят.
  Аппаратное равенство с native пока не проверено. Push/main/deploy не выполнялись.

### Аппаратные проверки той же контрольной точки

- Finite preview ONE на Surface завершён:13 stages, GL0/lostfalse, внутренний
  Dry/Undo/Redo exact. Малое ядро сохраняется, широкого растекания нет.
  Причина: отсутствуют front/carry/remobilization, выполняемые canonical до
  diffusion. Кандидат ещё не готов для смотрины; следующий primitive OFF
  воспроизводит pressure и paired carry на собственных полях.
- Original GL replay той же native packed tape завершён без GL ошибок.
  Strict material equality не пройдена:91297 pixels отличаются; maxRGB255
  нельзя интерпретировать как типичную видимую ошибку из-за low-alpha PNG.
  Снимки визуально близки. Площадь nonzero-alpha отличается всего на7pixels
  по count, не XOR. Premultiplied/material attribution ещё открыта.
- Corrected full-idle reuse:4started, DOWNfinish0, free main/preview3/3 после
  idle; GL0/lostfalse, tape4. Общий verdict FAIL из-за HTTP403/404 console,
  итоговый RGBA не снят. Поэтому endpoint и аппаратная совместимость
  finite+reuse не доказаны. Агент локализует запросы без общего подавления
  ошибок. PostRAM1595MiB: новые аппаратные прогоны до свежего preflight
  не выполняются; независимая offline работа всех трёх направлений продолжается.

### Причинный прогресс: 09 октября, 03:00

- Малый paired carry: одинаковый pressure и inputs, Q8 не двигается, Float32
  расширяет support61→174. P/C mass4880.0001727→4880.0001161
  (−1.16e−8 relative), outside/disconnected0, source8 неизменны.
  Буквальная алгебра измеренного borderface даёт0.10253 Q8byte — ниже
  порога округления. Это positive synthetic proof, ещё не Room-ready.
- Room prototype следующий: preinput pressure leases(+.375MiB), interleaved
  front/carry от первого eligible tick, без32кадров pressure-only ожидания.
  Финальная canonical модель не меняется, давление preview SOURCE-only.
- Реальные16 existing fences Surface заняли8.6ms, четыре serial-repeat0.2ms.
  Это не объясняет большие паузы. Новая диагностика отдельно пишет CPU
  методов, rAF, FIFO и сценарный idle; runtime barriers не удаляются.
- Raw WebGPU warmup подключён строго DEV opt-in;15warm/parser tests и
  merged appTS PASS. Ограничение4MiB, тот же rawcanvas shader, завершение
  GPU до ready/DOWN; pressure/source/composite не прогреваются. Отдельный
  frozen4bade стенд5370 подготовлен. Один ON hardware gate назначен;
  прежний731 cold — наблюдательный контроль, не чистый causal A/B.

Публикаций main/production нет. Все три агента продолжают следующие шаги.

### Контрольная точка: 09 октября, 03:23

- Surface actual scheduler: 151 FIFO advance, 143 blocked settle; settle
  растянут на 1590ms между кадрами. CPU settle35.7ms, FIFO22.3ms,
  rAF max49.9ms. Это не измерение GPU duration. Следующий OFF candidate
  — два соседних physical contact/front шага, sync после каждого, 4ms
  wall budget. Existing33 queue tests PASS; paired hardware parity открыт.
- Raw-only native warm completed до DOWN, но first completion3706.8ms:
  задержку не исправил. Подготовлен отдельный DEV first-LIVE прогрев
  source/composite/raw с brush pipeline descriptors без brush dispatch.
  AppTS,19 targeted tests и4 readiness proofs PASS; hardware ещё не снят.
- Float32 Room carry сохраняет массу и маленькое ядро; выразительного
  широкого растекания пока нет. Inherited source radius — отдельный OFF
  кандидат. Original same-tape повтор потерял loader при same-URL reload;
  endpoint не получен, качество не подтверждено. Повтор автоматически
  не запускается; диагностика controller lifecycle продолжается.
- Все три агента имеют следующий шаг; аппаратные проверки строго
  последовательны. Main/push/deploy не выполнялись.
