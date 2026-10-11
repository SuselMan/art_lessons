# Native front prefix prototype — алгоритмическое предложение

Цель: ускорить native weighted shortest-path фронт, оставив native кисть,
перенос количества/цвета, общий мокрый контур, inward band, remobilization,
пигментную оптику и бумагу. Не ещё одна самостоятельная художественная модель.
Илья отверг отдельные toy-модели; художественная планка — не хуже V8.

## Почему не обычный jump flooding

WatercolorSettlePlan.ts:501–507 и ADR011 §17.45 уже отвергают endpoint jumps:
поклеточные max(floor,...) не телескопируются вместе с подъёмом. Цена пути
оказывалась слишком низкой, лужи шире, капли бледнее (исторически124→133).
Обычный Euclidean JFA или coarse distance из среднего height повторяет это:
теряются локальные препятствия, бумажные долины, dry sizing и thread feather.

## Цена корректного прямого пути

Пусть q — destination texel, o — одна из8nativedirections.

E_o(q) = length(o) × max(floor, 1 + climb(q) × [h(q)−h(q+o)]) × dryGate(q).

climb(q) включает native wcFbm feather. dryGate(q) включает thresholded
coverage, foreignFilm и dryCost. Всё вычисляется из тех же nativeuniforms.

L_1(q)=E_o(q), L_2s(q)=L_s(q)+L_s(q+s·o).

Кандидат jump: C(q+s·o)+L_s(q). Это сумма ВСЕХ рёбер прямого пути, а не
подъём между концами. Цена насыщается у costMax: такой путь всё равно лежит
за бюджетом. Между пределами поля запрещены прыжки.

При точной арифметике такая релаксация даёт допустимые пути и верхнюю оценку
настоящего geodesic distance: ошибочно дешёвые пути не создаются. Нынешняя
RGBA8 C.r, как в native, квантует итог каждого jump: строгую гарантию
верхней оценки после записи C.r это НЕ сохраняет. Код честно сохраняет
native cost format ради неизменности downstream; проверка формы обязательна.

## Реализованный bounded prefix4/prefix8

fast-front.js экспортирует fastFrontSchedule(steps,mode) и
installFastFront(engine,mode) -> {stats,invalidate(),dispose()}.
Monkeypatch только waterFrontStep. Root включает schedule только в outward
run(frontSteps...), unit inward passes остаются native.

Если steps<=16 — native unit schedule. Иначе ceil(steps/stride) проходов
stride4/8 и8nativeunitrefinement. Многократный bounded jump допускает повороты
через каждые4/8cells, в отличие от одного дальнегоJFAjump. Последние8unit
проходов исправляют мелкие бумажные детали и короткие извилистые обходы.

4RGBA8nearestplanes хранят8направлений: каждыйedgeintegral —16bit в двух
каналах. Unitcache4draw; doubling до4/8 ещё8/12draw. Одинscratch переиспользуется.
DITHER отключается дляpacking и восстанавливается. ceil quantization делает
ошибку кэша положительной; шаг unit не дешевле0.85nativefloor, квантование
costMax/65535 намного меньше native C.r costMax/255.

Jump пишет r cost, g реальную nativepaperheight, b исходныйsrc.b, a1.
Градиент цены,pressure/source,seeding иdownstreamсохраняют nativeконтракт.
Cache инвалидируется при первомunitpass; texturebuffersдоdisposeпереиспользуются.

## Цена и ограничения

ВместоO(P·T) проходов с paper/noise стоимость O(P·log stride) подготовки,
O(P·T/stride) jumps и8unitrefinement; P=числоfieldpixels.
Это не общийO(logT) geodesic solver: strideboundedради nativepaperdetail.

ДляT=140: prefix8 даёт16prepare+18jump+8unit=42draw против140outwarddraw;
prefix4:12prepare+35jump+8unit=55draw. Inward/band/carry/colour unchanged.
Это расчёт количестваdraw, НЕ измеренный3.3×whole-settle speedup. Preparation
иextra texturebandwidth учитываются отдельно в browserfullsolver timing.
Дополнительные5RGBA8 planes =45MiB при1536² (или5MiB при512²).

Главный художественный риск: shortest path с множеством частых поворотов не
укладывается в прямыеmacrosegments; фронт может недорастечься и менятьfinger
направления.8refinementнеисправляютлюбойдлинныйобход. prefix4 должен быть
точнееprefix8, но егоускорениеменьше. Потеряseed/footprint, переносdepth или
upsamplingизcoarsegridздесьнеиспользуются.

Cachekey включает field,origin,costMax,climb,floor,stride,scale,foreigntexture.
Coverageиforeign содержимое должно быть неизменным во время одногоnativefront;
при внешнем изменении обязательноinvalidate. Обработкаcontext loss,
перезапускпослеallocationfailure иsyncrooms неproductionготовы.

## Альтернативы и почему не первым шагом

- Multi-scale coarse front +native refinement: меньшеpixels, но усреднение
  бумаги теряет narrowvalleys; найвноеbilinearwarmstartможет дать слишком
  дешёвуюцену, которуюmin-onlyrelaxationужеНЕповысит. Нужныcostupperbounds и
  nativefineboundaryconditions, а не простоcoarseheight. Выше рискпотерятьвид.
- CPUbucket/Dijkstra: подходит положительнымnativeedges, O(E+bucketRange)
  на boundedactivearea; отличная эталонная геодезика. Но надо доставить
  nativeGPUcoverage/foreign/paper наCPU и обратно: readbackсинхронизация и
  копирование могут заменить нынешнийGPUблокер новым. Worker/CPUcachepaper
  полезны дляoracle, а нерекомендованы какбыстрыйproductionходбезизмерения.
- WebGPUblock-localrelaxation: sharedmemory уменьшитglobalpasses и сохраняет
  fineedges, но сегодняшнийвыборbackendaWebGL1; неиспользоватьпереходAPIкак
  подменупроверкикачества иотзывчивости.

Сначала одинаковыеnativeдвамазка/точкавлуже: baseline, prefix4,prefix8.
Смотреть общийконтур,подтёки,tideline,цвет/ядро,видеоанимации. Измерять
fullGPUfencewall истоимостьfrontseparately. Только если Илья принимаеткартинку,
следующийшаг —активнаяобласть/cachedstaticpaperускорениеилиworkerintegration.
