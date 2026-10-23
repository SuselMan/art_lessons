## 07.10 16:48 — аппаратный результат первого касания, ограниченный сценарий

81947 EXIT0/CLOSED, actual Vega, ordinary Room same70f4 source OFF/ON, две фиксированные native pointer tapes, неизменный RGB и preset, brush400. Hot secondDOWN GPU completion upper bound536.5ms→10.5ms, CPU10.4→8.2ms; penUP61.6→106.4ms. Readback после DOWN — это GPU-ready upperbound, не физическое перо/экранная presentation latency. Первый cold OFF65ms/ON12.2ms не causal claim из-за порядка/кеша.

Whole transparentRGBA SHA exact,287989 purple pixels обеих сторон, GL0/lostfalse;24scratch/solver SHA exact с meaningful P/C/V/coverage. Полный журнал отличается identity/walltimestamp; отдельный materialoracle исключает только id/userId/layerId/timestamp/seq, все остальные данные (wet/dabs/preset/RGB/strokeId/washId) exact, namedDiffPaths[]. Root inspected raw independently. Raw:728-one-band-room/temp/band-room/joined-70-result.json и joined-70-material-oracle.json.

Это доказывает narrow performance cause и сохранение физики данного кейса, но70 имеет уже исправленные в5e80 lifecycle guards; обновлённый кандидат повторяется отдельно. Water→pigment, peer/layers, Dry/UndoRedo/fresh, Samsung/Surface/iPad ещё не доказаны. User5329/5339 прежние. Root9af/1e4 guarded21tests/TS0/lint0/map1013PASS; DEV typed flag готовится OFF для дальнейшей ручной проверки.

## 07.10 16:42 — текущие проверки и исправленные границы

Root74118d2e/eb6a7f89 интегрировал joined-touch OFF: focused11PASS, failure2PASS, TS0/lint0/map1013. Lifecycle review затем выявил реальные недостающие guards bakePreview/bakeLayerByFullReplay, stale lease после natural completion и изменяемую ссылку RGB. Агент исправляет; ON не включён ни на пользовательском стенде, ни в продукте.

Vega pair90346 CLOSED/INCONCLUSIVE: helper читал активный scratch после UP, где ссылка штатно очищается. Исправлен retained owner, повтор81947 LIVE; только фиксированный неизменный RGB/preset, safety всего кандидата не заявлена. Новый guard-коммит потребует повторного контроля.

Root3a1231b4 добавил portable firstload QA-контроллеры и real confirmed-stream restore test:8 restore tests PASS,8 meaningful-fixture controls PASS. Собственный агент21tests/TS0. Actual firstload47→Undo48→Redo49→snapshot49→fresh и peer48 аппаратные результаты ещё отсутствуют; HOME immutable runtime готовится, Vega занята firsttouch. Это операции через Engine append, не физические нажатия UI Undo/Redo.

## 07.10 16:34 — первое касание: подтверждён горячий GPU барьер

Приоритет Ильи — реальное касание → первый видимый пигмент, особенно начало штриха. Пользовательские 5329/5339 не менялись.
Actual Vega 34003 завершён: ordinary Room brush400, после DOWN return readback 5×5 подтвердил 25/25 пигментных пикселей. GPU completion upper bound cold15.9ms, afterDry4.0ms, при предыдущем settle3/92 — 376.3ms (CPU9.4ms, readwait366.9ms). Предыдущий `_completeSettle` отправил348draws; CPU3.5ms не отражает GPU задержку. Это synthetic native pointer handler + GPU readback, не измерение аппаратного пера/экранной презентации.

Кандидат70f4c5bb пока OFF и не интегрирован: допускает один следующий настоящий film только в той же луже/scratch/слое, с тем же точным preset и RGB. Water→pigment сохраняет прежний fallback; penUP barrier остаётся. 96CPU/TS PASS, paired actualGPU/канонические поля проверяются отдельно; ускорение ещё не объявлено.

Samsung86255 INCONCLUSIVE: новая собственная nonce-вкладка не появилась за15s; input не отправлялся, пользовательские current/yesterday tabs не тронуты. Strict samejournal30733 завершён INCONCLUSIVE: mandatory nonzero field guard; это не доказательство паритета или регрессии модели. Raw артефакты сохранены. Vega сейчас выделена профайлеру для paired70f4.

## 07.10 16:00 — главный приоритет уточнён: касание→первый пигмент

Илья сравнил208/5329 и вчера8aa/5339: отзывчивость примерно одинаковая,
самый большой тормоз на старте штриха; после начала линия движется лучше.
Измерять cold first-ever, next afterDry и next duringSettle отдельно.
Handler duration/meanFPS не заменяют first-visible-pigment latency.

Code boundaries: _onStart сначала completeSettle при pending/sync,
затем startStroke→paintStrokeDabs→direct display. Нельзя заявлять виновника
без phase timestamps/actual present. Профилирование переключено на это после
завершения samejournal30733; pending модель/geometry эксперименты отдельны.

ONEband actual43153 OFF/ON оба Roomarms complete/ACK/purple/GL0.
Adaptive400 water nexttouch96.7→58.1ms, activeMax167→167, tail245→261;
pig nexttouch75.8→66.8, activeMax300→317, tail261→283. Плавность не достигнута,
это не same-input causalFPS claim. Samecaptured19ops replay30733 завершён INCONCLUSIVE; см. текущую запись выше.

## Откат208: исправленная fresh-проверка прошла

ActualVega75355 EXIT0/ownChromeCLOSED, exact7IDs/serverSeq1–7/Redo7,
paper/restore/idle ready до экспорта. NativeRedo→fresh wholeRGBA1754×2480
exact0/max0; оба nonemptyAlpha138696,GL0/lostfalse, async/materialfalse.
Raw HOME fresh-ack-1791377697340/report.json+fresh.png;
VPS728-pure-water-plan/temp/pure-water-plan/causal-trace/rollback-ui-1791375948540/
fresh-ack7-rgba.json. Это один meaningful room, не все сценарии4devices.

Старый freshEMPTY6logFAIL сохранён: чтение произошло до RedoACK.
Завершённый own5331/PID1401253 остановлен после exactcwd/argv/port/clients[];
source/raw сохранены, user5329/5339/backend4539 не менялись.
RAM нового fresh pre1750.9/min1346.7MiB. Vega свободна для ONEband retry.

## Второй стенд для сравнения со вчерашней версией

По запросу Ильи: https://192.168.1.70:5339/create — immutable8aa7e9f0,
PID1407755,947web/sharedSHA exact, Create/main200/paperJSON200.
Это frontend/shared вечернего production6октября, успешный deploy37513320177
21:50Vilnius; общий current QA backend4539. Fullhistoricalbackend не заявляем.
5329 остаётся208232cc, оба стенда доступны одновременно; каталогсервисов
обновлён, Linuxdoc6361208. Новых публикаций коммитов/productiondeploy не было.

## Первое отдельное ускорение — geometry bandBatch, пока не пользовательский стенд

Изолированный2ae8d18e, root e9b3bc7a: typed bandBatch defaultfalse,
DEV Room qaBandBatch=1. Async/material false; физическая модель не меняется.
Root10physicaltests PASS (ordered modes/uniforms/vertex bytes), TS0/lint0,
map1012PASS; map:rules EXIT0/0errors/5warnings/11knownignored.
БюджетRoom+3 строки constructor настройки описан в423483ec.

Actual ordinaryRoom80173 запущен после исправления JoinGate bootstrap.
Предыдущий37484 остановился доinput/CLOSED, raw сохранён, не perfFAIL/PASS.
Контроллер проверяет воду400→пигмент400 и следующий touch с одним флагом;
адаптивныйnativeFPS не выдаём за одинаковые recorded dab arrays.
Пользовательский5329 пока208, никаких новых публикаций коммитов.

## Root rollback27ee: полная CPU проверка движка

1785PASS/16skip,160filesPASS/1skip (161), EXIT0,288.34s, maxWorkers1.
Raw temp/night-728/rollback-full-engine.log. Это CPU/MockGL, не доказательство
плавности или полного4-device live UX. Root wholewebTS0 уже зафиксирован.

ONEband synthetic local43561 завершён CLOSED/INCONCLUSIVE: physical work был,
но standalonefixture emitted0 и meaningfulendpoint отсутствует; он не годится
для strictsameops/perfPASS. Дальше ordinaryRoom pointer+capturedjournal replay
с ровно одним geometry flag. Stand208 не меняется.

## iPad на откате208: короткий живой тест, плавность не достигнута

Safari16.3/tb43zk, собственная комнатаfAlSh747, actual Room flags async=false,
material=false. Кисть100,2legs×300ms, rAF input через PointerInput:
12/30intervals>33ms,2>100ms,max1083ms; settle1047ms, scratch185+36MB,
field90MB. Контекст жив до/после, settle закончился. Это не physical pen400
и не полный parity gate. Raw temp/night-728/ipad-rollback208/.

## 07.10 15:27 — откат на пользовательском стенде

https://192.168.1.70:5329 — immutable208232cc, PID1402332,999SHA exact;
Room asyncFinish=false/materialPresentation=false. Canonical ring/tone/fibres
сохранены. Backend4539 прежний, production не менялся. Пользователь приглашён
быстро проверить норм/не норм. Новые ускорения будут включаться по одному.

Actual Vega rollback: вода180/пигмент86, wheelzoom0.413409→0.244490 при
settle=true: мазок остаётся видим. errors[], owner0; Dry→Redo wholeRGBA exact0,
оба nonempty138696; Undo меняет35951pixels. Own Chrome закрыт.
Fresh fixture далEMPTY: журнал6ops ещё без RedoACK; это НЕ freshPASS.
Исправляется ожидание ACK/restore readiness, результаты не маскируем.
Root27ee:40CPUtests/2files PASS, wholewebTS0. Перформанс400/4devices/peer
ещё открыт; это восстановление UX, а не заявленный perfPASS.

## 07.10 15:22 — согласован откат экспериментальной схемы

Илья попросил убрать сломавшие live UX изменения производительности и
дальше включать ускорения по одному. Готовим rollback Room asyncFinish=false,
materialPresentation=false: обычный ribbon/liveComposite и видимый progressive
reveal; не возвращаем generic pencil preview. Canonical ring/tone исправления
сохраняем отдельно. Экспериментальные ветки/журналы не удаляем.

Стенд пока e0cdf; переключение только после native water→pigment→zoom→Dry
проверки rollback. Известный sync drain next-touch остаётся риском;
не объявляем его исправлением производительности. Дальше один performance
change → whole-transition hardware QA/UndoRedo → следующий change.

## 07.10 15:18 — пользовательская проверка опровергла готовность live UX

На обновлённом e0cdfbc2/5329 пользователь видит мутный временный материал,
который спустя длительное время заменяется мазком. Кандидат НЕ исправляет
основную проблему. Previous narrow Vega immediate pigment/Dry equality
сохраняются как факты, но не доказывают качество перехода.

Code review: material owner заменяет весь слой до окончания всех wash reveals;
поэтому прогресс канонического материала скрыт за provisional512 растром.
Задача сейчас — единый непрерывно меняющийся видимый материал, не поздняя
подмена или только fade. Stand не обновлять новым кандидатом до проверки
всей временной последовательности; параллельные perf/load задачи продолжаются.

## 07.10 15:17 Vilnius — стенд обновлён, полный live UX ещё открыт

https://192.168.1.70:5329 — immutable e0cdfbc2, PID1398799,
999 SHA exact; Room asyncFinish=true/materialPresentation=true.
HTTP Create/main200, manifest бумаги JSON200. Backend4539 прежний.
Предыдущий f685 сохранён для rollback. Production не менялся.

Actual Vega source79: вода180→пигмент86, обе операции приняты во время
pending. Пигмент виден сразу настоящим RibbonStrokePainter; errors[],
own Chrome закрыт. Dry→fresh по тем же пяти accepted ops wholeRGBA exact0,
оба изображения непустые (137970 alpha pixels,1754×2480).
Это НЕ подтверждение Samsung/400/peer/camera/cap и НЕ готовый морфинг:
канонический handoff около14сек расширяет/осветляет пятно заметно.

Root cd56ac8e отдельно: освобождение CPU contact payload после upload,
неуспешный continuation отменяет владельца/готовность; после async ошибки
экспорт/preview/checkpoint запрещены. Новые38CPUtests PASS, wholewebTS,
lint и map PASS. Этот комбинированный root не подменяет проверенный стенд.

Продолжаем параллельно handoff, actual local400 solver A/B, первый load,
UndoRedo/multiuser и реальные устройства. Галерея11листов/85повторов готова.

## Историческое состояние до обновления стенда 07.10 15:17

Root9505e613: настоящее локальное акварельное layer-preview, Dry-ticket,
lazy первое поле контакта, opt-in cadence и actual GPU-clock, actual FIFO
backlog hook.197CPUtests/13files PASS, wholewebTS/lint/map1011 PASS.
Флаги OFF; Samsung/native400, камера/budget fallback и peer ещё не пройдены.
5329 остаётсяf685 с известным liveUX-дефектом; production не менялся.
Галерея11листов/85повторов уже обновлена и проверена в браузере.

## 07.10 — фактический GPU профиль

Vega immutable059/5330: первые16настоящихединиц с1×1FBO/readPixels fence,
EXIT0/GL0,27field+whole сравнений0. gl.finish0–0.1ms, но после него
read wait до71.9ms; drawing CPU12–15ms, подготовкаCPU81–89.5ms.
4ms budget по finish не подтверждает GPU4ms. Ускорениеcadence остаётся
defaultOFF; продолжается дробление подготовки/профиль операторов и
реальный layer-aware акварельный preview. Это не Samsung/nativeFPSPASS.

## Галерея 07.10 — обновление завершено

`f685fe1c-defaults-20261007`:11листов/85повторов по журналам06.10,
actualVega/A2Medium/currentdefaults. Все85crop непустые; GL0/errors[]
по всемлистам; archive+85imagesHTTP200. Старые версии и комментарии сохранены.
**Это сухой replay; критический liveUX-сбой ниже остаётся открытым.**

## 07.10 14:20 Vilnius — критический сбой живого рисования

Samsung/5329: карандашное временное отображение, пигмент появляется через минуту,
Dry не даёт ожидаемого результата. Стенд f685 **не готов** по live UX.
Код подтверждает generic StampPainter preview и отсутствие ускорения pending
solver при Dry. Native400 ранее показал72.14s canonical; эксперимент28.43s
тоже недостаточен. Проверяем cap64MiB/null presentation на пользовательском вводе.
Агенты исправляют live материал/память, scheduler и немедленный Dry отдельно.
Production не менялся; новые коммиты не опубликованы.

# Ночная работа 6–7 октября: акварель, плавность и восстановление

Refs #680, #314: качество акварели, отзывчивость редактора и корректность совместного рисования перед релизом.

Сухую кисть и рваный кончик не меняем. Новые ночные изменения готовим локально и на стенде; новый production deploy требует команды Ильи.

## Исторический стенд f685 до замены 07.10 15:17

**https://192.168.1.70:5329/create — f685fe1c, PID1376113,993SHA exact.**
HTTP200 Create/Engine/Room, typed asyncFinish и gradientFibres true.
Surface Edge Intel short100 прошёл nativeDry→Redo/следующийpaintDry→Redo
wholeRGBA exact0,9ACK/GL0; текстура compiled доinput. Fullengine1733PASS/16skip.
Старый5329 и temporary5337 остановлены после exactPID/cwd/argv/authclients[];
пользовательские другие сервисы не трогались.

Bakedfield не создаёт worstcrossGPUoutlier: alphaMax76 есть и в corrected
diffuse gradientOFF; старыйbaseline alphaMax66. Firstdivergentpass seq64–65
ещё изучается. StrictcrossGPUparity иChromeSurface startup пока открыты.
Галерея последней общей модели готовится отдельно; текущая опубликованная
пачка85/11 остаётся предыдущим frozenphase+baked. CPUboundedcanonicalbudget
кандидат059 defaultOFF проходит31tests/types/lint; hardwareA/B ещё идёт.

## Исходное состояние
- [x] Готовые исправления водяного тона и чужого оттенка выкатить: PR727, main8aa7e9f0, deploy37513320177 SUCCESS, фактическая версия и health проверены.
- [x] Создать комнату сухих образцов листа12; сохранить217комментариев галереи.
- [x] Профилировать Vega: contact steps по одному за кадр; grouping4 на одном fixed journal16.46→6.01с, PNG RGBA exact.
- [x] Воспроизвести медленную загрузку:180с/38из47ops,21433steps,90.3%contact+upload; прогон INCOMPLETE.

## Работы и критерии
- [x] Видимость мокрой бумаги: после релиза8aa7e9f0 Илья не различает мокрые и сухие участки — водяной тон ослаблен чрезмерно. Уточнение Ильи: на чистой бумаге целевой тон примерно вдвое слабее, чем ДО фикса (ориентир50% прежней интенсивности, вместо текущих35%); вернуть читаемый мягкий тон; под пигментом затемнение сохранить слабее. Проверить чистую воду, тонкую плёнку, лужу, высыхание и рисование поверх краски на реальном устройстве; сухой результат не менять.
- [ ] Каёмка: воспроизведение P/C/V, исправление провала пигмента без общего blur; проверить растекание, отдельные острова, цвет и dry/replay.
- [ ] Треугольники: actual wet/morph timeline на Samsung/Vega; получить устойчивое воспроизведение до исправления. Pressure interpolation сам по себе причиной не доказан.
- [ ] Большая кисть400: вода отдельно, пигмент отдельно, прямые/зигзаги/плотные наложения; измерить активные RAF p50/p95/max и input latency, затем исправить конкретный bottleneck.
- [ ] После отрыва: превратить успешную grouping-ablation в ограниченный GPU-бюджетом кандидат; fixed-journal PNG, GL, lifecycle, Samsung; не переносить фиксированную группу4 без проверки.
- [ ] Загрузка: полный журнал KJc0OoVo, network/restore/replay timing, snapshot lifecycle; ускорение без пропуска истории/undo и потери пикселей.
- [ ] Undo/Redo: объяснить первый native→history остаток26px, повторные endpoints, dry/rebuild, удаление/очистка слоёв.
- [ ] Матрица QA: один/несколько слоёв × один/несколько участников; мокрые перекрытия, вода→пигмент, разные цвета, Dry, серии Undo/Redo, rejoin/reconnect, queued strokes, context loss.
- [ ] Собрать совместный стенд; types/lint/unit/map, реальные устройства, регрессионные сравнения; подготовить итоговый отчёт.
- [x] После сообщения Ильи о завершении перерисовки: захватить новые журналы комнат и обновить галерею; сохранять комментарии и версии.

## Распределение (4 активных слота включая координатора)
1. Агент визуальных дефектов: каёмка, затем wet/morph треугольники.
2. Агент производительности: очередь после отрыва и загрузка; фикс+строгая проверка.
3. Агент QA: Undo/Redo и участники, минимальные воспроизведения и фиксы.
4. Координатор: активная кисть400, интеграция, раздача устройства и обновление этого issue.

## Контроль прогресса
Это issue — источник актуального состояния. Координатор обновляет тело после каждого результата, смены задачи или блокировки; значимые эксперименты сохраняет отдельными комментариями с коммитом/артефактом.
Во время активного ночного выполнения сверка агентов каждые5–10мин: текущий эксперимент, PID/прогресс, последняя запись, следующий шаг. Если10–15мин нет артефакта или измеримого движения — проверить процесс, сменить эксперимент либо восстановить агента. Длительный тест обязан иметь progress/watchdog; ожидание устройства не считается работой.
Один владелец GPU на устройство; CPU/source work параллельно. После освобождения GPU следующий готовый агент запускается сразу. Завершённый агент получает следующий пункт, не простаивает до сообщения Ильи.
Чекбокс закрывается только после проверки указанного критерия; отрицательный опыт — прогресс, но не закрытая проблема. Недоступное устройство/INCOMPLETE/ошибка harness отмечаются явно.

## Текущее состояние — 7 октября, 06:52 UTC

- Стенд: https://192.168.1.70:5329/create, immutable d88bb738. Worker снимков ON, доказанный zero-contact skip ON; ADD/phase/cost-domain/packed OFF. Production не менялся.
- Чистая вода на одном журнале: 10.568→4.337с, 27 полей/картинка побайтно одинаковы. Цветной контроль тоже exact0, обмены краски сохраняются. Реальный Samsung400: active max33.5мс, но tail919мс/nexttouch55.8мс — плавность ещё не решена.
- Каёмка: ADD уменьшил перепад полного сухого пятна на66.91%, остаточный контур есть. Непустой mixed shader и обычный Room mixed route прошли; широкая Dry/UndoRedo оценка кандидата ещё нужна, defaultOFF.
- Маски: binary56 и packed7 дали одинаковые пять конечных полей и wholeRGBA на полном исходном журнале; 7mask/14carry. Это opt-in оптимизация, не исправление каёмки само по себе.
- Проверки:1695PASS/16skip,148filesPASS; original-config app/worker/PWA build986SHA exact; webTS/map993/rules0errors.
- Галерея85мазков/11листов/217комментариев сохранена и обновлена. Тон мокрой бумаги50%/подкраской12% принят.
- Undo/repair/restore имеют конкретные аппаратные подтверждения ниже; полная многослойная матрица и production room timings остаются открыты. iPad активнойSafariнет; последняяSurface попытка room GPU не подтверждена.
- Последняя работа до07:00: пассивная атрибуция рывка919мс на Samsung, завершение отчёта. Сухаякисть/рваныйкончик не менялись, push/deploy не выполнялись.

## Журнал результатов — исходное состояние 01:20 UTC

- Галерея: завершены все 11 листов/85 образцов. Полные пары просмотрены, новая экспериментальная версия f877b418-phase-baked-20261007 опубликована с честной подписью источника и флагов. Все 85 HTTPS JPEG совпали по SHA, старые версии и 217 комментариев сохранены. Сухой лист 12 совпал побайтно во всех девяти образцах.
- Samsung: на одинаковом журнале подготовка контактов ускорилась с 60,5 до 26,4 мс; все 19 полных полей и итоговые пиксели совпали. Разбиение расчёта без группировки замедляет завершение, поэтому настройки остаются выключенными по умолчанию. Кисть 400 пока не признана плавной.
- Чистая вода: отдельный точный эксперимент удалил 804 лишних продолжения расчёта без изменения 19 полей. Найден и закрыт пробел проверки: ещё не записанный карандаш другого участника в том же слое запрещает эту оптимизацию. В интеграции 18 тестов проходят; оптимизация пока выключена по умолчанию.
- Совместный ввод: исправление отказа локального карандаша интегрировано. Временное представление сохраняет непересекающиеся тайлы, операции отправляются до ACK и считаются в порядке очереди. 26 async и 47 peer/context тестов проходят, типы проверены. Аппаратная проверка подтвердила приём карандаша, но выявила отдельную ошибку отмены слоя: при одинаковом authoritative журнале слой исчез у A и остался у B. Отложенная операция меняет engine log после синхронизации Room store; исправление этой связи и проверка idle продолжаются.
- Живое высыхание: записаны и просмотрены одинаковые native OFF/ON сценарии с Dry и без него. Кольцо ослабло; естественный рост заметен к 1–2 секундам, первые 500 мс мало меняются. Немедленное заметное движение пока не доказано — исследуются первые промежуточные кадры.
- Загрузка: отдельная актуальная серверная копия и журнал из 47 операций проверены. Новая сессия загрузилась за 1,623 с, повторная — за 1,200 с; полные пиксели совпали с независимым пересчётом. Это локальная сеть и подготовленный снимок, не доказательство такой скорости на production или Samsung.
- Структура снимков: четыре сценария удаления, объединения, дублирования и сохранённого раннего снимка прошли реальные проверки второго участника, перезахода, позднего входа и Redo. Расширенная матрица истории остаётся открытой.
- Полный набор движка с peer guard: 1552 прохода, один таймаут 5000 мс в charcoal geometry. Тот же неизменённый тест отдельно прошёл за 2,85 с. Полный зелёный прогон пока не заявлен; более новая интеграция ввода проверяется отдельно.

Новые push, merge и production deploy не выполнялись. Сухую кисть и рваный кончик не меняли. Итоговый отчёт и стенд готовятся к 10:00 Vilnius.

## Проверенная интеграция — 07.10, 01:43 UTC

- Полный последовательный набор движка на 5a102d54: 1577 тестов прошли, 16 пропущены; 140 файлов прошли. Позднейшая отмена/восстановление проверена отдельно: 82 теста в трёх файлах на 1d6a2d3c. Текущие types и map прошли; map rules — без ошибок, четыре прежних предупреждения.
- Реальная совместная матрица на Vega/1d6a2d3c прошла 20 проверок авторитетного журнала и конечных пикселей: оба автора Undo/Redo, второй слой, перемещение, скрытие/показ, удаление и восстановление, общий Dry. Конечные полные RGBA совпали. В промежуточном мокром состоянии сохранено отличие 145 пикселей, максимум 2; после следующего цвета и Dry отличие исчезло.
- Исправлены отложенное обновление Room store, quiet guards снимков и восстановление отменённого расчёта из журнала. Перезаход проверяется отдельным продолжением. layers=[] после Undo/Redo штатно исключает старый снимок по snapshotReplayPlan; прежнее требование обязательного blob после этих изменений было неверным условием стенда. Исходный незавершённый прогон сохранён.
- Производительность Samsung: на одинаковом входе lazy contacts уменьшили непрерывную подготовку с 47,8 до 2,7 мс, все 19 полей и конечные RGBA точны. Цена — завершение 15,15→17,13 с, поэтому эксперимент выключен по умолчанию. Пять программ с уникальной солью действительно скомпилированы на Adreno, GL ошибок нет.
- Профиль настоящего отрыва кисти: 26,1 мс на восемь последних дабов; около 9,1 мс занимает повторное построение геометрии ленты. Готовится побитно эквивалентный единый проход для трёх материалов. Отдельные хвостовые 100 мс в CPU-профиле преимущественно idle; GPU/композитор ещё не установлены как причина.
- Ранний показ фронта: grouping приблизил первое физическое представление с 690 до 379 мс при точном конечном результате, но первые кадры всё ещё слабые. Подготовлен отдельный ограниченный прототип переноса на копиях; CPU проверки прошли, аппаратный и визуальный результат пока не доказан.

Кисть 400, полный reconnect/context-loss и немедленное живое растекание остаются открыты. Новых публикаций кода и production deploy нет.

### Перезаход подтверждён — 01:46 UTC

Координатор проверил исходный hardware report: 22 barriers, все состояния idle/GL=0, собственные Chrome закрыты. Ordinary reconnect и действительно новый третий автор late join имеют точное совпадение полного RGBA и журналов на source1d6a2d3c/968 tracked files. Это history fallback после штатной invalidation снимка. Отдельная проверка настоящего скачивания bitmap выполняется в новой комнате до Undo/Redo. Один мокрый endpoint150px/max2 сохранён для разбора, поэтому полный wet parity ещё не объявлен.

### Снимок и следующий кандидат — 01:49 UTC

- Настоящий bitmap restore подтверждён отдельно: свежая комната, index seq2/layer-1, HTTP200 GET слоя при reconnect, обе done операции сохранены, audit пуст, полный RGBA exact0/GL0/nonempty22146. Координатор прочитал raw index/ledger/checks.
- Scoped live-end fix принят в47f1d339: отмена текущего nonWC хвоста завершает соответствующий чужой экранный поток ровно один раз; принятый журнал сохраняется.83tests3files иtypes прошли; actual midpen/loss проверяется отдельно.
- CPU batch geometry принят выключенным в4b57ed77:63tests3files, побитное совпадение трёх выходов и actualPainter draw order. Первый Number[] writer был медленнее15,1→16,3мс и отвергнут; TypedArray writer на тех же last8 dabs ускорился14,0→2,8мс. Аппаратная точность и PenUp latency наSamsung ещё проверяются, общий FPS claim отсутствует.

### Отмена хвоста и потеря контекста — 01:51 UTC

Координатор проверил raw результаты source47f1d339 и сохранил их в рабочей папке. Настоящий карандашный хвост при Undo завершил matching live-end ровно один раз; ранее принятая операция сохранилась, текущий хвост не стал операцией. Undo и Redo дали полное RGBA exact0.

Отдельный WEBGL_lose_context сценарий: реальные события lost→restored, второй участник отправил новую операцию и она появилась в журнале получателя при isContextLost=true. После восстановления и общего Dry полные пиксели совпали, GL0. Собственные Chrome закрыты. Это две операции и owners0 до сбоя; прерывание выполняющейся очереди и сохранённого checkpoint этим ещё не доказано.

Vega временно выделен ограниченному раннему растеканию; QA агент готовит настоящий акварельный accepted chunk во время удерживаемого пера. Samsung выделен сравнению нового batch geometry. Surface доступен; root5322 bridge по-прежнему без iPad клиентов, недоступную Safari проверку не заявляем.

### Уточнение проверки активного хвоста

Предыдущий аппаратный midpen опыт доказал matching end exactly once и точные конечные Undo/Redo endpoints, но не снял active identity непосредственно перед Undo. Причинный claim об отмене хвоста именно этим Undo отозван до усиленного повторения. Действующий async local Undo guard возвращает null при активном strokeLayerId; его не снимаем ради теста. CPU helper regression остаётся валидной, реальный reachable cancellation path проверяется отдельно.

Координатор проверил operation types старого midpen report: после опыта две stroke и нет Undo/Redo операций. Значит labels контроллера не доказывают историю или отмену хвоста. Отзываются также утверждения о незаписанном хвосте; остаются факты one stream-end и одинаковых рисунков. Полная ранее проверенная 22-barrier матрица истории и независимые reconnect/blob/loss результаты этим не затрагиваются.

### Настоящая загрузка без bitmap

НаVega/source47f1d339 создана отдельная комната с исходными47materialоперациями KJc0OoVo и записанным Dry48. Index204 настоящий: никто не сохранил снимок, ответы не перехватывались. Cold full-history join13.163с, warm12.447с; по48операций, GL0, непустой рисунок и exactwholeRGBA относительноseed/независимогоfresh. Координатор прочитал raw и подтвердил Chrome CLOSED. Это fixedjournal1754×2480/Fine в домашней сети, не Samsung/production. Preloader/первыйдоступныйввод внутри этого13с ещё отдельно не измерены.

Предыдущий искусственный index204 при room_state с существующим bitmap правильно блокирует восстановление как transfer failure; защита сохранена. Непригодный synthetic тест не считаем дефектом приложения.


### 02:16 UTC — текущие подтверждения и блокеры

- Samsung current4b: band-batch OFF/ON для чистой воды и маловодного пигмента сохранил все19 полей и полный RGBA побайтно; реальные ветки Painter подтверждены. Оптимизация пока выключена по умолчанию.
- Обычная Room кисть400: два штриха получили серверные ACK, UI Dry завершился, GL0 и непустой PNG. Плавность не решена: 12 запросов расчёта, до полного idle59.4сек после короткого жеста. Агент разбирает происхождение очереди; широкий compositor trace повторяется с ограниченным буфером.
- Реальный remote Undo под активным пером выявил зависший peer-live хвост: второй участник ждёт несуществующий финальный commit. Исправление optional cancelled для эфемерного потока проходит CPU/server/type gates; аппаратная проверка ещё впереди. Обычный pen-up должен сохранять ожидание ACK, принятые операции не удаляются.
- Частичное раннее растекание: Vega OFF/ON завершён без GL ошибок, 56 частичных операторов реально выполнены, seed/crop правильны, финальный384×384 RGBA точен. Визуальное улучшение и производительность ещё не доказаны; defaultOFF.


### 02:26 UTC — интеграция и уточнение производительности

- Полная root engine suite source4b:1606PASS/16skip,141filesPASS/1skip,241.97сек. Последующий cancelled protocol этим прогоном не покрыт.
- Root7b11 protocol отдельно:65тестов4filesPASS и webtypesPASS; первая попытка server test не загрузила Prisma изнеполныхrootdeps, повтор сactualexistingserverdepsPASS. Matching own5316frontend970SHA и4539server131SHA обновлены, health200.
- Аппаратный remote cancellation retry завершилсяexit0/Chromeclosed; mandatory cancelled:true иреальныйremoteUndoподпером достигнуты. Координатор ещёчитает rawwholeRGBA/journal, окончательныйclaimпослеэтого.
- Samsung1358 actualqueue attribution:124requests=122material+2finish;2077materialsteps≈331мсCPU/max5мс. Первыйfinish7513→30890мс≈23.377сек, второй≈2.407сек. Эторазныеadaptivegesturesс59секпрогоном, pairedperformancewinнеобъявлен. Разбираемdynamiccontact/presentationquanta, cutoffphysicsнеприменяется.
- eeb partialnegative:97unitstepsпочтинеувеличиваютвидимыйfront;seedP2129→2147nonzero после97, наблюдён0.73%sumdriftRGBA8. КонечныйRGBAточен, норанняяживостьнеисправлена;prototypeOFF, ищемпричинуtransport.


### 02:59 UTC — строгие проверки и следующий причинный шаг

- Remote Undo под настоящим активным пером на7b11 подтверждён координатором: cancelled:true ровноодин matchingtail, принятый watercolor сохранён; послеcancelrecovery иRedo640×480wholeRGBAexact0/GL0. Это scoped canonical-idle case, не закрытие всех Undo/loss scenarios.
- Samsung presentation-token batch на9f5/base7b11: тот же immutablejournal,19meaningfulfields иwholeRGBAexact0/GL0; solver16.050→10.000сек. DefaultOFF. Native ordinaryRoom OFF/ON разные adaptive tapes: sampled drain≥25.12→≥15.03сек; first1.5s postlift max67→134мс. Поэтому плавность НЕ закрыта.
- Surface4b/native400: чистаявода activeMax133, пигмент233мс. Повтор сCPUwrappers: _display max4.2мс, paintDabs15.1мс, existingfinish.1мс, activeRAF250мс. Диагностическая абляция только screen-compose сохранилаoffscreen/liveflush/reveal: active179frames/max50/2>33/0>100; функция восстановленаfinally, ACKdone/GL0. Adaptive tapes неpairedFPS; screen-compose выделен как дальнейший причинный путь.
- Foreignwet native/peer строгийDry FAIL локализован: первый divergence coverage.g на clearwater, P/C/V ещёexact; freshremote-only replay exact. Uniformoracle доказал, что deferredDabclone теряет wetIndex, coverage читаетpaperWet0 вместо13/15. Узкийfix rootfd07b0bc сохраняет индекс; CPUregression beforeFAIL/afterPASS, агент46tests/types/lintPASS. Аппаратныйstrictstage/native/remote/freshgate6660 ACTIVE; rootfullengine25749 ACTIVE. Финальное совпадение пока не заявлено.
- Ring sheet3slot2: CPUcontroller готов, собственный5325 whole7b11/970SHAexact. GPU ждёт освобождения Vega послеwetIndexgate; каёмка остаётсяоткрытой. iPad activeSafari не найден, аппаратная проверка не заявлена.


### 03:04 UTC — новые завершённые проверки

Root fd07b0bc: полная engine suite1619PASS/16skip,141filesPASS/1skip,205.19сек; webtypesPASS; map976files/67modulesPASS.
wetIndex hardware partial: clearwater9fulltileSHA native/remote теперьexact, прежнийcoverage.g divergenceисчез. ОбщийDry/freshgate остановлен RAMguard466.84MiB иChromeclosed; неparityPASS. Готов последовательныйконтроллер безчетырёходновременныхконтекстов.
Surface screen-onlyblit-ablation оставляетpaper/materialрасчёт:180activeframes/max33ms/tail50,GL0/restoredfinally. Actualpartial scissor НЕпомог:14activepartial/91activefull,activeMax266/tail417. Passivecaller:101из103fullactiveframes приходятиз_scheduleDisplay rAF. Это причиннаязацепка, неготовыйperformancefix.
Vega ringcontrolleractualPID1200378/handle14744 ACTIVE,600sdeadline/RAMguard; сухаякисть/рваныйкончик неизменны.


### 03:08 UTC — причина пустого preview и активный ring gate

Surface census234tipcalls/221empty; transient AccumulationBuffer watercolor renderer earlyreturns, так что currentWC tip не рисуетpixels, но всёравноclear/schedule. Diagnostic tipOFF onegesture182activeframes/max17ms/0>33/0>100; tail434 остаётсяоткрыт. Option восстановлен, ACK11done/GL0. АгентготовитWC-onlyskip неподдерживаемыхtip/prediction, сохраняяреальныеfinaldabs ипрочиеtools; в rootисходникиещёнеизменены.
Ring14744 actualcontrollerPID1200378: OFFseq61matchingjob1/carry14/stages5/GL0 сохранён; ON идёт в пределах600s, stagedplanes9 записаны. Координаторчиталреальныйreport: source7b11/curated42SHA ecbb146d…ce1d9, stageON/arms1/errors[]. СуммыP/V вslotROI неявляютсяglobalmassconservation.

### 03:41 UTC — актуальная проверка
- WetIndex: завершён строгий scoped 4-operation oracle. Native→fresh и fresh→fresh всей RGBA exact0; все шесть стадий P/C/V/coverage/film/dry совпали, непустые 22 642 пикселя, GL0. Это не вся матрица Undo/Redo.
- Surface: три WC-only preview gates проверены на свежем native вводе воды/пигмента400; active max67/117мс, tail183/200мс. Экспорт непустой 481137 пикселей/GL0. Отзывчивость ещё не закрыта. Старый собственный контекст был потерян после ACK всех11 операций; сохранена диагностика и открыта свежая собственная страница, пользовательские окна не затронуты.
- Current47+Dry без снимка: cold/warm/independent fresh wholeRGBA exact0, 48 записей, GL0, 12.852/12.374с до полного idle. Overall controller FAIL: отсутствует input-ready marker. Готовность ввода не доказана. Chrome закрыт; Vega передан сценарию two-finish/local Undo.
- Каёмка локализована впервые в carry; tide сохраняет уже возникший провал. CPU исследуется перенос через границу zero/positive cost; готового исправления нет.

### 03:45 UTC — новые завершённые проверки
- Root source b7735f7a: полный engine suite 1623 PASS/16 skipped, 142 files PASS/1 skipped, exit0/228.29с. Whole-web TypeScript exit0, map:check 977files/67modules PASS.
- Авторский reentry без snapshot: source5316 7b11+wetIndex, cold/warm inputReady12527/12569мс при обычном выборе акварели; unlocked/visible/pointerauto/48ops. Все wholeRGBA endpoints exact0, nonempty1578467/GL0. Это локальный авторский вход, не production скорость.
- Two queued finish/sharedscratch +localUndo: actualcancel holders20→0/pendingfalse; три acceptedWC сохранены, recovery/Redo peer wholeRGBA0, independentfresh0/nonempty187018/GL0. Pending context loss и bake guard запущены следующими.
- CPU dry1px bypass: legacy stride64 переносил284886codes между несвязанными pools при positivecost. Exactcost-path guard дал0; actualROI outwardmass изменился менее0.1%. GPU фикса пока нет.

### 04:09 UTC — новые причины и исправления
- Реальный snapshot-covered Undo BUG: после stored snapshot читатель отменял stroke в журнале, но before/afterPNG оставался exact0; автор менялся, peer mismatch187186pixels. Completeprefix fix168270 интегрирован root0708: original serverSeq сохраняется, stale affected snapshot/derived CP снимаются только при доказанном1..coveredSeq. Аппаратный повтор actualblob+Undo+Redo wholeRGBA0/GL0 PASS. Неполный backfill ещё НЕ исправлен: ведётся layer-scoped pendingrepair+continuedwalker, без потери unknownprefix.
- Реальный GPU clock: gl.finish возвращался до завершенияGPU, последующее1×1readwait3.2–51мс. Fenceпрототип все19fieldsRGBAexact0, но all3budgetpaths ухудшили native/throughput; defaultON НЕ принят. Drawingonly фиксированныйjournal сохраняетпиксели/почтип прежнеевремя, nativefulltail334–351мсостался. Идёт атрибуция худшихframes, без export/readbackвgesture.
- Costdomain guard: actualVega722400mask/channel comparisons exact, onecarry drygap rightP8568→0/totalP52000same/costPV unchanged/GL0. Это одинstride/toy case; полныйsolver/mixedpaint/Adreno не проверены, rootнеинтегрирован.
- Rootsource40c (sourcecopydefaultOFF): full1636PASS/16skip, typesPASS/map978PASS. После новогоCPfix целевые rootchecks выполняются; fullscope40c не выдаём за новыйsnapshotfix.

### 04:20 UTC — snapshot pipeline / repair review
- Root0708 snapshot fix:64tests/3files PASS, whole-web TypeScript PASS, map978/67 PASS; root HEAD772c содержит обновлённый промежуточный QA отчёт.
- Samsung native profile без export: snapshot bake74.3ms, включая6 readPixels63.7ms; следующая upload/encoding pause284ms включает207msGC, btoa22ms/fetch27.1ms. Worst351ms послеbake пока имеет profiler(program), точная причина не доказана. Более экономный byteexact base64 кандидат в работе, snapshot не отключается.
- Incomplete repair CPU regression beforeFAIL/afterPASS, actualasync rebuild lock сохраняется доswap. Review требует lost-context Undo и cross-layer read dependencies (duplicate/merge), чтобы неполный bakedprefix не утёк в другой слой. Hardware ещё неPASS.
- Conservative connected-domain mask scheduling:56mask+14carry вынесены отдельнымиPlanops;51tests/TS PASS. Начинается coldAdreno compile +real1536 unitcost; весь solver ещё не проверен.

### 04:27 UTC — завершённый узкий encoding fix
- c866/root3dc: immutable snapshot bytes кодируются native toBase64 либо bounded32KiB fallback сyield. Root32tests/2files PASS/map980 PASS; actualSamsung1383 nativepathPASS, GC295→69ms/encoder~3.3ms. Payload/gzip/seq прежние. Но worsttail351ms/8frames>100 остаются, bake168ms/firstread116.6ms — плавность не закрыта.
- Incomplete repair review нашёл lost-context Undo и cross-layer duplicate/merge readdependencies; агент исправляетmeaningful before/after tests доhardware. Production/main не опубликованы.

### 04:26 UTC — настоящий snapshot ускоряет вход
- Root42863 exit0/CLOSED: original47+orderedDry48, ordinarybootstrapstoredseq48/bitmapHTTP200/3,244,431bytes. Seed/independentfullhistoryfresh/cold/warm authorwholeRGBA exact0,1,578,930nonempty/GL0. Coldinputready1.615sec/warm1.152 против≈12.5 безsnapshot; этоVega/local, неproduction/планшет. Inputreadyс6dependencyops, обычныйbackfillдоводитдо48; incompleteUndo поэтомуостаётсяважным.
- Vegaпереданаliveagent; source5316 всёещё168270 безHMR. Encodingroot32PASS/typesPASS/map980PASS. RootlatestQA b076.

### 04:55 UTC — подтверждённое восстановление и causal compression
- Root05e full engine1648PASS/16skip,143filesPASS/1skip,exit0. Repair97tests и callback1test PASS.
- Actual1169 incomplete snapshotseq6, held backfill, Undo/Redo/late material: full prefix1..10, author/repaired/fresh wholeRGBA exact0/GL0,7barriers,minRAM1344MiB. Cross-layer/navigation/error scope остаётся CPU.
- Samsung1386 blank/noEngine/noGL: raw17.4MB gzip402.8ms/rAFgap334.3ms/gunzip exact0. Worker diagnostic1388:596.1ms wall,0frames>33ms/exact0. Обычный Room worker upload ещё впереди/defaultOFF.
- Costmask route guard исправлен52fe: live/replay теперь56mask/14carry независимо от presentation owner; hardware fullsolver OFF/ON запущен следующим, rootdefault неизменён.

### 05:02 UTC — интегрированный snapshot transport
- Root3a7: region readback64целевыхtests PASS; actualSamsung1389 oldfull/crop vsnewregion6cases/RGBAexact0/PACKrestore/GL0. Worker321 publicfacade/defaultOFF:41tests/types/lint/map987/rules0errors PASS. Rootfullengine послеruntimeSnapshotIOизменения выполняется.
- OrdinarySamsung1390 own5330 workeroptin+region: storedseq3/raw17,399,780/6tiles/gzip3,110,225 bytes/hash/framing PASS,ACK/GL0/CLOSED. Post-onEndmax133.7ms/2>100 vsolderadaptive351/7>100; strictFPSgain и actualworker-vsfallback поканеclaim, freshGPUrestorepending.
- Costmask44475 terminated explicitsuffix90budget, OFFtarget14carry captured, ONnotrun. Новый4541 wholehistory900с OFF/ON live; предыдущиеrawсохранены. История неурезана.
- УтреннийstandHTTPS5329 sourceacf1/1158SHA/HTTPmoduleAPI200; покабезregion/worker, аппаратныйsmokepending.

### 05:08 UTC — полный suite и точный freshrestore
- Root321runtime: fullengine1653PASS/16skip,144filesPASS/1skip,exit0/214.63s. WholewebTS/lint/map987/rules0errors PASS, worker/net41tests отдельноPASS.
- Samsung1392 own snapshotseq3freshrestore:17,399,680RGBAbytes changed0/max0/GL0, retained3ops исходного автора сохранены; logempty потомуsnapshotcoversseq3, неfull-replayclaim. Actualsamebytesworkercreate/post/response/terminate1/error0/gunzipexact0; validresponse/fallback distinction ещё узкаяпроверка.
- Rootstand5329 defaultprofile actualnative400/ACK/UI Dry/UndoRedoPASS:695,549changedRGBA onUndo, wholeRedoexact0/GL0. Однакоdefaultprofile active250.8ms/tail1805ms, плавностьНЕзакрыта. Freshrejoinfixture initialreadyrace сохранилfailedraw, исправляетсяguard; далееexplicitexperimentalasync/split/lazy/band profile.
- iPad5288authenticatedclients[]; новыйPASSнеclaim. PublishedgalleryHTTP200/85latest/217commentsSHAunchanged.

### 05:22 UTC — root worker включён, kaemka дальше
- Root3005 ordinarycaller workerON40/48,43tests/webTS/lint PASS; actual1397A2-sizedvalidworker1/fallback0/gunzipexact0/0rAF>33. Newown5329PID1252910/source3005/1162SHA/HTTPcallerworker/API200, physicaldefaultsпрежние. Новоеcombinedhardware ещёpending.
- Wholecostmask900OFF/ON COMPLETE/CLOSED, allGL0/identicalprefields/ON56mask14carry;whole3525pixelschanged,bboxonlytarget, residualringпочтипрежний — ringfixнеclaim. Новыйzero-face59537 actualAdreno12saltedlinksPASS/targetmatched/fullfieldcheckpointstream, live.
- Rootnode-tool TypeScript correctedESMpathsPASS; malformeddevbridge400/alive200 repair own5326 documented. Experimental4flag nativeprofile correctnessPASS, firstidle100.8sBAD; следующийbatchedprofile послеSamsungrelease, покаCPU.

### 05:40 UTC — аппаратные результаты и оставшиеся ограничения
- Adreno1398 zero-face replacement: OLD/OFF все6полей1536² побайтно совпали,12saltedlinks/GL0; ON усилил valleygap каёмки на5.79%. Отрицательный кандидат не интегрирован. Следующий ADD-вариант пока CPU-only.
- Current root3005 native1399 с experimental batching: ACK2/Undo/Redo17,399,680RGBAexact0/GL0, ordinary validworker1/fallback0; fresh1400 полный original1..5 journal exact0. Active83.6ms,tail150.4ms/28>100,wholeidle22.506s: плавность400 не закрыта; сравнение с1396 не строго парное.
- Fixed1401 standalone comparison INCONCLUSIVE: reveal watchdog30s, вкладка закрыта; endpoint comparison отсутствует. Анализируем lifetime тестового forcedreveal, не объявляем регрессию приложения.
- Packed7mask Vega primitive:1,444,800 literalpath checks/UNORM/DITHERrestore и14 OLD/OFF +14 binary/packed P/C checks exact0,GL0. Это synthetic129×5/phase0, не whole solver. Adreno coldcompile/1536 gate запускается отдельно.

### 05:58 UTC — новые аппаратные результаты
- ADD-перенос1403: OLD/OFF6full1536полейexact0,12coldP/C/GL0; signedcarrygap21.595→6.170 (−71.43%),extra32UNORMcodes/.004219%initial. Singlepaint Ctotalimmutable, actualmobileC не исполнялся. Полный original42/execution41+orderedDry OFF/ADD идёт отдельно; финальныйringfix ещёнеclaim.
- Queue-only fence1405/1406 обеCLOSED/ACK2/Redo17,399,680RGBAexact0/GL0,worker valid1/fallback0. OFFidle24.054s/tail150.4ms, ONidle32.698s/tail133.7ms; adaptivepayloadразный, throughput/smoothnessfixнеclaim. ДлинныеwaitsCPU72–109ms приoperatorJS0.1ms подтверждают накопленныйGPUbacklog, не доказываютстоимостьотдельногоpass. Rootflagневключён.
- Packedmask15Adrenosaltedlinks/GL0,1536sevenpass-one-sync15.9ms; Vega1,444,800pathchecks/OLD-OFF/56-7carryexact. Fullsolverphase1/wholePNGgateCPUprepared, аппаратно ещёнепройден.
- SurfaceSSHavailable; isolatedownprofile/task/session1 открыт безuserChrome restart. Certinterstitial диагностирован,ownCDPignore позволяетGrafetto. Дальше Runtime/screenshot/profilerenabletimeouteach15s, renderer/GPUCPUвысокий; browser-leveltraceследующаядиагностика. ActualrestorePASSнеclaim. iPadactivepageпо-прежнемунеподтверждён.

### 06:20 UTC — завершённая регрессионная проверка
- Root321d/49f full engine: 1656 PASS/16 skip, 145 files PASS/1 skip, exit0; webTS/SWTS/map988 PASS. Zero-contact defaultOFF; плавность400 не закрыта.
- Полный ADD dry endpoint: gap6.32227→2.09230 (−66.91%), whole6375 pixels/max29, alpha unchanged, GL0, обе вкладки закрыты. Остаточный внешний контур сохраняется; mixed-colour hardware ещё нужен.
- Vega full packed gate7714 жив: LEGACY завершён, BINARY suffix; PACKED/финальное равенство ещё впереди.
- Surface собственные browser/task/SSH forward очищены; bootstrap /create PASS, room restore/GPU gate не подтверждены.

### 06:34 UTC — полный packed gate, диагностики и пределы проверок
- Vega7714 terminalexit0/CLOSED: BINARY56/PACKED7 пять финальных полей SHA exact, whole3508×2480 RGBA diff0; 7preinputs exact,14carry/phase, GL0. Rootdiagnostics054/577 integrated с defaultOFF; userstand5329 frozen3005.
- RootwebTS/map993 PASS. Первый общий suite1693PASS/16skip/2FAIL: неизменённый charcoal timeout и ожидаемая смена frozen shader hashes после054. Charcoal отдельно27PASS, frozenbase явно обновлена после независимогоhardwaregate, fibre6PASS. Fullretry55571 выполняется, общийPASS пока неclaim.
- Mixedfixture два FAILED запуска закрыты: сначала missinginitSettlePrograms, затем missingquadbufferData. Нулевые выходы отозваны как доказательство композиции; повтор обязан требовать nonempty/реальныйADD-effect.
- Current321d zero-proof derivedpurewater19fields OFF/ON плюс actualpeer/Undo guards: аппаратный gate35874 жив, один context. Drybrush/tip и production не менялись.

### 06:46 UTC — обновлённый стенд и принятая оптимизация воды
- Rootd88 full1695PASS/16skip/148filesPASS, original-config bundle986SHAexact PASS. Loaded100:100 samejournal OFF/ON27fields/wholeexact0, P/C/V meaningful, skipfalse/brush2596/front252 identical. Zero-contactON разрешён только при полном guard-backed доказательстве нулевого пигмента.
- https://192.168.1.70:5329/create immutabled88, PID1281833/986sourceSHA/HTTPS200, workerON/zeroON; ADD/phase/cost/packed OFF. Старыйruntime/backend сохранены. Samsungnativepure400+nexttouch/UIdry/UndoRedo live, nativeFPS результат впереди.
- MixedAdreno correctedfixture8NONEMPTYcases/15linksGL0, sameP/Cfraction/component и3negativeконтроляexact; неnaturalRoommixedwash. Каёмкавнешнийконтур всёещёнеисчез, broadperformance/matrix/iPadнезакрыты. Production не менялся.

### 06:50 UTC — живой Samsung и оставшиеся дефекты
- Actualdefaultd88 purewater400 native3s:180frames/max33.5ms/0>100 при движении, nexttouch55.8ms; хвост919ms ДОdiagnosticreadback остаётся дефектом. ACK/Dry/UndoRedo/wholeexact0/GL0, beforeDryV848160nonzero/actualskip2. Ownclosed.
- iPad5288 повторная authenticatedclients проверка (raw-файл помечен0652):[], активнойSafariнет; SurfaceSSHдоступен, но настоящийroomGPUgateнеполучен. Lanpadno route.
- Последний natural2colourRoom opt-in phase+ADD gate44985 live наown5329d88room, bound240s; standdefaults не менялись.
- Утренний читаемый отчёт: docs/qa/728-night-report-20261007.md. Всё опубликованное вGitHub/production прежнее; коммиты только локальные.

### Итог завершения ночных проверок
- Все собственныеGPUcontextsзакрыты, временные5330/5331/5332 остановлены сidentity/clientguard, источники/rawсохранены; user5329/backend4539/галерея работают.
- Passive1417:1003ms RAFgap безlongwrappedJS/GL, snapshot/readPixelsпозже; причинаещёнеустановлена. Найдены отдельно20emptybakes/109readPixels послеDry — новыйконкретныйsnapshotretrybottleneck.
- Дальнейшийwater-onlyskip требуетcorrectbufferliveness:frontпишетcostвбудущийpigmenttemp. BlanketremoveP/Cpassневерен. CPUplan иутреннийотчёт сохранены, sourceпоследнеегоaccepted d88.
- [x] Подготовить актуальный стенд5329 и читаемый отчёт docs/qa/728-night-report-20261007.md.
- Остальные открытыеcheckboxes не закрываем: каёмка/треугольники/полнаяплавность400/productionloading/широкаяmultiuserhistorymatrix/iPad остаютсяработой. Новыхpush/deployнебыло.

### После утреннего отчёта — trace и пустые снимки
- Samsung trace на executable d88: animation-frame gap950.859мс; максимальная main-thread задача в этом окне6.129мс, compositor56/58 dropped. Это графическая задержка; конкретный shader/pass пока не установлен. Raw trace проверен по SHA, QA: docs/qa/728-samsung-tail-trace.md.
- Отдельный snapshot readback после Dry268.29мс не объясняет начальную паузу. Фикс повторных подтверждённо пустых чтений интегрирован локально1840f311: guards остаются, публикация/coverage не меняются, revision/restore/buffer replacement инвалидируют наблюдение. Whole-web TypeScript PASS, полная engine suite ещё выполняется. Samsung gate на отдельном runtime поручен profiler; user5329 остаётся d88.
- Pure-water Plan f52a2b94: CPU79PASS, defaultOFF, ещё не интегрирован. Требуется аппаратное совпадение водных полей, pure→pigment и Dry/Undo/Redo. Производительность пока не заявляем.

- Проверка1840: Room snapshotSync30PASS, TypeScriptPASS. Первая полная engine suite1702PASS/16skip/2FAIL: старый fakeledger в двух snapshotRegion tests не содержит нового getter. Fixture заменён настоящим SnapshotLedger (19d2720); полная проверка повторно запущена. Первую suite не считаем PASS.

- Финальный empty-cache gate: full engine1704PASS/16skip, uploader30PASS/types/map/rulesPASS. ActualSamsung640×480: первый разрешённый emptybake1read,20повторов0read/0upload; новая nativeкраскаrevision52→snapshotHTTP200seq6; freshjoin1228800RGBAbytes exact0/max0/nonempty30648px,GL0/lostfalse,owncontextsclosed. Это cache/upload/restore, не FPS400. Userstandd88 прежний.

### Продолжение после отчёта — новые причинные эксперименты
- Pure-waterPlan f52 Samsung: первый pure OFF/ON case139fieldcomparisons/canonical+source+whole exact0, actualV/coverage nonempty, front252→252, carry28→0/diffuse26→0,GL0/ownclosed. Paintednegative и pure→pigment ещё идут. Diagnostic31s содержитreadback/SHA — не performanceclaim, кандидатOFF/неинтегрирован.
- Preview c740: найдено нечитавшееся intermediate fieldcolor приS>1singlepaint; отдельныйCPUкандидат71PlanPASS/TS. Runtimeосновногостенда прежний; аппаратноерaвенство/скорость ещё непроверены.
- No-snapshotload: в retained47fixture9stroke передfinalclear давали1.14–1.51s CPU и затемстирались. Это часть старогоfrozenloadtrace, не текущаяproductionlatency. Conservativebatch-elision изучается сguardsдляcrosslayerreads/undo/unknownhistory.
- Подготовлен current-defaultmultiusercontroller безforcedasync/split; actualrun впереди. OlderFIFO22barriers не выдаёмзаcurrentdefaultmatrix.

- Pure-water fixed-tape Samsung gate завершён: все3casescomplete/closed/errors[],GL0/lostfalse. Pure119canonical/source/whole exact, paintednegative119exact, pure→pigment185exact. Четыре различия COST/ping-pong temps b/pressure только вpureчасти; не объявляем все139/215tempsодинаковыми. Интегрирован898cac3c DEFAULT OFF, root75PlanPASS. Native400/tail/DryUndoRedo ещё впереди; userstandd88 прежний.

- NativepurePlan control начался на ordinarytrackedvite f52/A4/Adreno650: OFF active181frames/max17ms, tail919ms,nexttouchhandler66.2ms. Это ещё одно воспроизведениеисходногодефекта; ON и lifecycle endpoint ещё выполняются. Предыдущие два custom-config bootstrapFAIL доengine сохранены, кфизике не относятся.
- Current-defaultmultiuser QA1840/5330 поднят отдельно сoriginalvite/source988manifest, create/main200, controller syntaxPASS. GPUrun ждётосвобожденияSamsung. Previewc740 иclear-prefixca0 CPUкандидаты остаютсявотдельныхветках, hardwareвпереди.

- Actualcurrent-defaultmultiuser1840/Vega:22barriersPASS,allpeerRGBA0/nonempty262003,layerstates/journals/idle/GL0/owners0. Undocolour меняет256473px/max197,hide/remove25538px/max53. Reconnect/thirdauthlatejoinhistoryfallbackPASS; неbitmaprestore иpeerDuringSettle=false, поэтомуmidsettlegate остаётсяоткрыт. OwnChromeclosed/15648exit0. QA728-current-history-gates.md.
- NativepurePlanSamsungf52:OFF/ONactive17/17ms,tail919/602ms,nexttouch66.2/58.9ms;adaptivejournalsdifferent,onepaironly.10opsACK,Undo17549px/Redoexact0,nonemptypigment/GL0. Smoothnessнеполностьюисправлена,defaultOFF.

- Previewc740 аппаратныйgate завершён: S2/S1/mixed wholeDryRGBA/materialbeforeDryexact,matchedpreview2/3/6ordinals exact, actualS2fieldcolor4→1/tile44→44,GL0/ownedclosed. Интегрирован5077;rootfull1718PASS/16skip/149filesPASS1skip, wholewebTS PASS. FPS/remaininggapнеclaim.
- НовыйuserstandCEA mirrorподготовленнаHOME:987sourceSHAexact, bakedpaperизпрежнейimmutableкопии, покаНЕзапущен/user5329d88неизменён.
- Clear-prefixca0 первыйSamsunggate66721terminalINCONCLUSIVE: Runtimeevaluate15s timeout,own1429closed,materialendpoint не получен. Исправляетсяasync kickoff/poll, последовательныеopнепереставляются. КандидатOFF/неинтегрирован.

- Clear-prefixca0: второй прогон получил полный OFF journal47 и ненулевые P/C/V/coverage, но guard ошибочно требовал mode16 для одноцветного target (paints=1). Третий остановлен ошибкой повторного диагностического capture при Undo; own1430/1431 закрыты. Все три INCONCLUSIVE, ON/UndoRedo не подтверждены. Исправлены диагностические sequence48/49; следующий bounded повтор разрешён только после CPU проверки однократного capture. Production renderer не менялся, оптимизация по-прежнему OFF.

- По указанию Ильи приоритет каймы изменён на поиск регрессии. Архив sheet3/slot2:0a78ab53 без замкнутой внутренней линии, c1997fee-review с кольцом. Это только визуальная скобка: REVIEW включает отдельные solvent/foreign/segment флаги, поэтому нужны одинаковый журнал и отдельное сравнение DEFAULT/REVIEW. Готовится chronological bracket0a→2e6a→788→11ee→f277, без phase/ADD. Виновный коммит пока не установлен.

- Clear-prefixca0 финальный Samsung прогон завершён EXIT0/own1432CLOSED: full47history,17canonicalfields +wholeRGBA final/Undo/Redo exact0; Undo реально меняет1362943RGBAbytes, Redo возвращает результат. Пропущено8дополнительных физических stroke, лог сохранён. Отдельный sequential replay с rAF cadence41.115→35.359с, не обычная загрузка Room. Оптимизация OFF/неинтегрирована; следующим нужен ordinaryjoin gate и аудит межслойных источников. GPU передан поиску регрессии каймы.

- Рабочая ветка6b1019fe: pure-zero-rim candidate35b56833 интегрирован OFF,86Plan PASS. Clear-prefix28fce180 +hook6b1019fe интегрированы OFF; root18tests3filesPASS (не объявлять22, отдельная engine fixture ещё сверяется). Appproductioncaller не включает опцию. Historical ringfirstwave дважды остановлен ДОChrome RAM1618/1635<1700; никаких физических результатов. Готовится облегчённый static ownstand, защищённые пользовательские стенды не трогаются. OriginalVite bundle принятойдоэтихOFFкандидатов e3b77f5bPASS/987sourceexact/114outputs.

- Userstand5329 обновлён на immutable CEA6eff7: перед заменой authenticatedclients[], старый exactPID1281833/cwd/argv проверен и остановлен; новыйPID1311131. create/module HTTP200,987sourceSHA ранее сверены. Включены только ранее принятые emptycache/preview; purePlan/zeroRim/clearPrefix OFF. Production не менялся.
- Rootcombined6b fullengine1724PASS/16skip,149filesPASS/1skip; restore/history22PASS,wholewebTS/lintPASS.
- Zero-rim95046: pure3arms completed,121canonicalcomparisons eachONarm exact; waterFront252/252/224. Второй paintednegative остановленCDPtimeout после solver, finally own1433/1434closed; negative/nextpaint НЕ PASS, полныйgate INCONCLUSIVE. CPU endpointdiagnostics исправляются.
- Historicalring27529: old0a fullreplay/Dry/export получен GL0,ноmaterialguard послеDry лишилсяscratch. Это runnerguarderror; correctedtarget61capture доDry готовится; firstbadcommit ещё не найден.

- Кайма: corrected17153 первые2arms SAMEcurated42/A2Medium/defaults подтвердили регрессию:0a78ab53 безкольца,c1997fee DEFAULT с замкнутым светлым кольцом. Root просмотрел atlas. Capture target61materialnonzero/GL0; thirdREVIEW покаидёт. Флаги не необходимы для появления кольца. Первый плохой коммит ещё определяется, следующим midpoint11ee.

- Историческая скобка финализирована:17153EXIT0/completed/ownedChromeClosed,3arms GL0/contextalive,target61P/Cnonzero. SAMEjournal ecbb146ddd9ecf3b6c3c46cc289245d92cbf246cf8225490eea70a9dee3ce1d9; rootпрочиталraw/atlas.0a DEFAULT безкольца,c199 DEFAULT иREVIEW с кольцом (REVIEW слабее, но rectangularextent). Midpoint11ee DEFAULT16825LIVE seq48/actualRAM2047MiB. Поканеfirstbadcommit.

- Сверен свежий upstream bd2cd523 (#738: превью всех комнат), объединён локально c092bb92. Один конфликтSnapshotGate разрешён сохранением ready() и firstSnapshotWatermark;48snapshottests+wholewebTS PASS. Userstand immutableCEA не менялся, push/deploy не выполнены.
- Бисекткаймы:11ee DEFAULT BAD/closed/GL0,следующий2e DEFAULT58795LIVE; еслиBAD проверяетсяточныйparent5cb04f46, неусловный8fmerge. Rootпросмотрел11eecrop.
- Исправлено распределение GPU: historicalring фактическиVegaHOME, SamsungотдельныйGPU. ПриactualHOMEavailable2025MiB разрешён независимыйSamsungnative400 water/pigmenttrace (noHOMEChrome); Vegaостаётсяединственнымownerringagent. OrdinaryjoinCPUготовнаFine1754×2480/#fdfdfc, послеmainmergeготовитсяновыйmirror, поканеPASS.

- Бисект каймы: 2e DEFAULT и его точный parent5cb DEFAULT оба BAD, завершены EXIT0/ownedclosed. Root подтвердил внутреннюю светлую линию в5cb crop. Следовательно 2e не исходная причина. Render-source8f merge и5cb одинаков; запущен first-parent0a58 на том же42-op журнале, результат ещё ожидается.
- Samsung traced2195 завершён EXIT1/owned1435+1436closed: WATER7ACK/trace сохранён, PIGMENT newTouch=null при незавершённой очереди, не PASS responsiveness. Запись241MB и marks могут искажать время, причина пока не доказана. Найден _onStart→_completeSettle синхронный drain; clean no-observer/no-trace контроль17182 запущен, затем проверяется существующий async FIFO с сохранением canonical порядка.

- Точная first-parent скобка каймы:0a58 DEFAULT GOOD/EXIT0/closed,5cb DEFAULT BAD; engine/shared8f→5cb exact,0a78→0a58 exact. Root визуально подтвердил GOODcrop0a58. Таким образом появление связано с merge8f выбранной модели; отдельная причинность diffusion/dose/contact исследуется counterfactual, фикс ещё не доказан.
- Clean Samsung17182: большие задержки сохранились без trace (water1923ms/pigment1387ms activeMax в одном adaptive прогоне). newTouch=null оказался ошибкой fixture: input не успевал отправиться до таймера, поэтому прошлый FAIL не доказывает отказ engine. Исправленный bounded helper проверен CPU, запущено сравнение OFF/asyncON47858; новые результаты ожидаются.

- Причинная проверка каймы44718 EXIT0/closed:8f whole-source с заменой только WC_DIFFUSE_FRAG на exact0a58 заметно убирает замкнутую линию (root просмотрел crop), leftdip .041615→.013775/right .008854→0. Остались лёгкие фрагменты; это contributor, не полный фикс. СледующийdensityOFF-only сохраняет coverage.a и остальную новую модель.
- Corrected native47858 пока LIVE: WATER OFF/ASYNC completed, nexttouch реально отправлен. PIGMENT_OFF callback нового касания1537ms/afterLift1036.5ms — подтверждён блокирующий input path, прошлыйnull являлся fixturebug. ПигментASYNC и same-emitted-tape physical parity ещё не завершены, defaultOFF.

- Обычная загрузка: production KJc0OoVo проверена read-only транзакцией, A4/Fine1754×2480,head48 и48operations, RoomLayerSnapshot строк нет. Это действительно полный replay при входе, а не доказательство отказа bitmaprestore. Bootstrap локально guarded firstSnapshotWatermark; нужен actual ordinaryjoin→snapshot→rejoin gate. Production не менялась.

- Native async comparison47858 terminal EXIT0/all4ownedtargetsclosed. Root перепроверил report/errors[]/4complete/ACKpending0/GL0/lostfalse/owners0 иrgba-parity-final:8comparisons exact0,6пигментных ненулевых endpoints;2purewaterblank отдельно, не доказательство pigmentparity. Pigment nexttouchhandler1537→40.8ms,activeMax1137→50,tail1588→84 (single matchedadaptivegeometry сразными tapes, нестатистическийsame-tapebenchmark). SAME-emittedjournal freshOFF/ON oracle77047 запущен отдельно; defaultOFF, multiuser впереди.
- Кайма: historical cov.b-only densityON EXIT0 убирает прямоугольный внешний участок, но остаточная внутренняялиния есть; densityOFF отдельный тоже улучшаеткольцо/ухудшаетshape. Поэтому blanketrollback отвергнут. Currentc092 baseline/noDensity/cov.b isolated controls62505 LIVE натомже42journal, результатожидается.

- SAME-emittedjournal freshSamsung oracle77047: обеcasescomplete/errors[]/owned1443,1444closed; rootpscontroller2328878 terminal иreportaudit. Дляnative6-op tape freshOFF/asyncON SHA5e4f0ce2…4792 exact/nonempty1948837;10-op taped9b3efd9…9017 exact/nonempty2303094. Plan/rimOFF,rebaseON/GL0/lostfalse. Подтверждёнsame-tape canonical endpoint, неmultiauthor/midsettlegate. Samsung очередь переходитordinaryjoinprofiler, liveMorphCPU готовит обновлённый existingmultiusercontroller безforcedsplit.
- Actualavailability повторно: SamsungSM-T970 иSurfaceSSH доступны;Lanpad No route to host, authenticatediPad5288clients[] (активнаяSafari не обнаружена). Эти устройства не объявляются проверенными по чужомуGPU.

- Ringfix интегрированлокально05b6dc91+800fdf6c (densitylimiterremoved/deaduniformsremoved), docsfb84. Fullengine80061 EXIT0:1726PASS/16skip,150filesPASS/1skip181.17s; wholewebTS67863 EXIT0; targetedoxlintfixEXIT0/sourceclean. UserstandCEA/productionпрежние.
- Actualcurrent451 correctedmatrix30107 EXIT0/ownedclosed:22barriers/18wholeRGBAcomparisons exact,actualpeerDuringSettle=true/pendingUIDry/queuedUndo recovery/reconnectlatefreshPASS. One missingseq5 normalpencil строгоcoveredactualservercoverage; Dry4/tail6неcovered, permissivewhitelistнет. Pendingloss44022EXIT0:2distinctfinish owners retained приactualGLloss,bakeNull/dirtypreserved,newBstrokeACKwhilelost,journal5retained;restoredorderedDry/freshwhole0/nonempty183720,owners0/GL0/ownedclosed. Source451доringfix, finalcombinedgate ещёвпереди.
- OrdinaryOFF actualRoomc092 fully scopedPASS внутри94402EXIT1(второйONCreatefixture): snapshotless52.315s/47ops/paint39/wholeRGBA0; meaningfulUndo48/Redo49exact. NORMALbootstrapPOST200seq49; freshstoredjoin5.017s/paint0/logical49/whole0/nonempty1580675/GL0. ONelisionordinarycomparisonpending, defaultOFF.
- Cleanring+bakedVega pair52648 LIVE, same42/currentc092baked vsclean894baked, actualbranchcount/passports; foreignsheet4pairnext. Нетnewpush/deploy.


### 07.10 13:20 — продуктовая очередь и актуальная CPU-проверка
- Обычный Room с typed asyncFinish проверен на Samsung без приватного переключения: WATER/PIGMENT400, четыре полных Dry→Redo RGBA сравнения exact0, GL0, все собственные вкладки закрыты. Обработчик следующего касания 37.5–37.8 мс; приём после отрыва 84–100 мс. Это проверка отзывчивости, не доказательство 60fps.
- Обнаружен остающийся долгий natural settle: около 80 секунд для 183 запросов большого pigment400. Профилирование расчёта возобновлено отдельно от задержки ввода.
- Текущий source e7044692: 93 профильных теста источников воды/движка прошли, whole-web TypeScript exit0. Обычная Vite-сборка предшествующего 67f076f2 прошла (991 исходный файл сверён); полный production artifact не заявляется.
- Clean diffusion + baked texture на Vega: проверены исходный журнал кольца и чужая лужа; оба сравнения завершены, GL0, собственные браузеры закрыты. Samsung cold compile/cross-GPU ещё в работе.
- .50/.12 присутствуют в проверенном shader; читаемость мокрой бумаги текущим экранным кадром не доказана. Нужна отдельная голая вода до/после Dry.
- Пользовательский 5329 пока старый; обновление общей версии ожидает завершения hardware-проверки.


### 07.10 — общая модель и открытые аппаратные проверки
- Root typed gradientFibres включён в Room; warm после uniforms/attributes и после restore.43профильных теста, whole-web TS/lint/map1001 PASS. Prepared immutable stand f685fe1c,993SHA; пользовательский5329 покаCEA, не обновлён.
- Readable tone доказан отдельными paired Samsung screens: чистая вода−6.50RGB, подкраской−2.6..−3.3, drycontrol exact0, water>0 before/0afterDry.
- Same42 Vega/Adreno baked completed/GL0; strictpixelcompatibility остаётся открытой: opaque p99=1/p99.9=5, max65 и20px>16, transparent alphaMax76. Идёт последовательное сравнение inherited c092/clean gradientOFF; нельзя считать максимумы только noise без контроля.
- Surface isolated Chrome наCreate виснет дорисования: actualCPUbusy +Runtime/screenshottimeout, агент диагностируетownprofile. Не hardwarePASS.
- Bounded canonical backlog эксперимент isolated/defaultOFF; physicsiterations/order сохраняются, hardwarebenefit ещё непроверен.
- Сводный локальный отчёт актуализирован docs/qa/728-night-report-20261007.md. Новую общую галерею/stand и full4-device matrix ещё предстоит завершить.
