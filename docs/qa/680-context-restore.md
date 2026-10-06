# #680: восстановление контекста при сушке и импорте воды

Проверено 06.10.2026 на настоящей Vega: ANGLE AMD Radeon Graphics,
radeonsi renoir ACO. Один собственный Chrome, два независимых участника,
новые тестовые комнаты; пользовательские вкладки и Samsung не затронуты.

Исправление `74bc090c`, база `08dd414b`/источник ночного стенда `9eb2a6fe`.
Файл `index.ts` на изолированном стенде5306 и в рабочей копии одинаков:
SHA256 `8e45c39b250dd5a86edc9436de0af33e7856ee0ebb88448ea30f045c40715cc2`.
Все девять production-настроек принятой модели подтверждены:
combined/record/sharedFluid/landingReservoir/bottomless/foreignSolvent/
solventField/canonicalRadius/fluidLanding. Художественная модель и шейдеры не менялись.

## Доказанный дефект

Настоящий `WEBGL_lose_context` инвалидировал `_wetTex`, но восстановление
сохраняло старое имя. `_composePaperToScreen` и `_updateWetTexture` вновь
вызывали `bindTexture` с этим именем. Trace: до потери GL0; после восстановления
GL1282 из этих двух путей, включая первый `_handleContextRestored` display и
`PaperState.onLoaded`. Исправление забывает текстуру и её метаданные до
`_initGL`, не пытаясь удалить имя мёртвого контекста.

Первый старый запуск дал точное восстановление PNG несмотря на GL1282.
Повтор с trace дал также расхождение restored/fresh (45835/45631 окрашенных
пикселей). Это не надёжный PASS старого восстановления и не доказательство
отдельной гонки загрузки бумаги. В исходном диагностическом отчёте `pass`
означал лишь pixel oracle; контроллер затем разделён на pixelPass и GL PASS.

## Аппаратная проверка исправления

Потеря — реальный extension, восстановление запрошено через300ms.
Перед потерей каждая необходимая операция уже имеет serverSeq и pending=false.
Raw operations сохраняются через JSON clone внутри страницы, без `[cycle]`.

| Сценарий | Точка потери | Окрашенные пиксели после restore | GL / trace |
| --- | --- | ---: | --- |
| Обычный штрих | Наблюдаемый активный settle, ACK seq1 | 45471 | 0 / 0 faults |
| Пигмент в чужой воде | Yield настоящего auxiliary source, recipient scratch ещё имеет0 tiles, ACK seq1/2 | 45781 | 0 / 0 faults |

В обоих случаях lost/restored события записаны, исходный engine и userId
сохранились, восстановленный контекст работал. Ordered операции после restore
и после входа из server journal совпали полностью. Непустой canonical RGBA
после restore **точно совпал с обоими свежими reader** (1754×2480):

- settle SHA256 `185c321cc9c85570b1fe7a1ad61b26d4d451861e4a439e6b132ac9a2ddccb035`;
- foreign SHA256 `17c5ddf892c6b20777aa2f81d423a1b7cf6390b33928e73310c81df4b378e11d`.

Исходный native PNG второго автора сохранён отдельно: он не использован как
эталон восстановления, поскольку остаточный native/packed drift исследуется
независимо. Эта проверка не покрывает приход дополнительных новых операций
непосредственно во время lost interval и не доказывает cold compile на Adreno.

## Контроль готовности бумаги

На том же подтверждённом журнале выполнено второе восстановление с test-only
отложенным `_syncBuffersToLog` до `paperReady()`. OFF и ON, а также оба свежих
reader дали одинаковый RGBA SHA
`0d3a969f694b45dca9a3a72d7d65d6bedf5c9730bdafcbdad1f00804aaa4f796`,45618 пикселей.
GL0, faults0; операции до/после идентичны.

В обычном OFF восстановлении реальная бумага загружена на3788.8ms,
первый вход реального восстановленного painter —3792.6ms. В ON:
paper-loaded11404.6ms, deferred replay11406.3ms, painter11407.5ms.
То есть реальная отрисовка начиналась после бумаги уже без нового ожидания.
Гипотеза о placeholder как причине расхождения не подтверждена; дополнительное
асинхронное изменение production restore не добавлено.

## Проверки и артефакты

Lifecycle regression проверяет forget до первого restore GL/display и
отсутствие удаления старого имени. Полный `index.watercolor.test.ts`:84 PASS.
`npm run typecheck --workspace @grafetto/web`:PASS.

Raw данные сохранены на домашней машине:
`680-context-restore/temp/context-loss/fixed-off/report.json`,
`matched-ready/report.json`, соответствующие logs и controller.
Старые отчёты: `680-watercolor-night-qa/temp/context-loss/run/report.json`
и `trace/report.json`. Локальные копии находятся в
`680-context-restore/temp/context-loss/`, включая controller и source passport.
Все аппаратные запускы завершились штатным `browser.close()` в finally.
