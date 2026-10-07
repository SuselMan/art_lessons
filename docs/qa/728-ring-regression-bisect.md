# Поиск первого коммита светлой каёмки (#728)

Приоритет изменён по наблюдению Ильи: кайма появилась не более недели назад. Расширенные PHASE/ADD сценарии отложены; обе диагностики OFF. Первый плохой коммит пока НЕ установлен.

## Сохранённая визуальная скобка

Просмотрены существующие gallery JPEG листа3/slot2: 27f1a43d, 0515e56a и 0a78ab53 без отчётливой замкнутой светлой внутренней линии; c1997fee-review и 1e49aa99-clip имеют отчётливую замкнутую светлую линию по внутреннему контуру. Копии находятся в 680-puddle-room-KJc0/docs/reference/strokes/img/3/002-app-<version>.jpg. Это визуальный ориентир, НЕ доказательство same-input regression. Старые default renders использовали full production journal, новый c199 — DEV flags; source flags и дата capture различны.

Предварительная chronological скобка: 0a78ab532951d37d7266ebf883a6f729ce0ea1da → 2e6a670654bf2fc39aa25fa4ab6a953faf894c27 → 78854286e11699559a66b6be5ee2ca6290bc0ced → 11ee5ab6bfeef0f6f7a8da65c3c4b84bd9fdada9 → f2775adfc81c5cff8945cf92d805270a5c6b75e3. Первый шаг после hardware contrast выбирается по результату, не по названию коммита.

2e6a меняет запись headroom P/C, её decode x2 и оптическую плотность, а также remobilisation и contact pulses. 788 selfMix относится к собственной воде при externalMerge=0; при реально мокрой чужой луже прежний путь сохраняется, поэтому не объявляется прямой причиной. 11ee объединяет effectiveWet, merge/damp и меняет diffusion domain. f277 меняет composite historical prewet на available water/standing и wet response. bd1ae820 позже исходной жалобы и не может быть первоначальной причиной без изменения временной скобки. b7465d2d/c9f81dba остаются более ранними контрольными точками, если новая same-journal скобка не подтвердится. f57732bd — уже попытка устранения границы, затем a2d00d48 revert; его не надо автоматически считать началом дефекта.

## Первый аппаратный опыт

Три arms: 0a78 DEFAULT, c199 DEFAULT, c199 REVIEW. Все получают идентичные 42 curated operations SHA ecbb146ddd9ecf3b6c3c46cc289245d92cbf246cf8225490eea70a9dee3ce1d9. Image_import сохранён в исходном файле, но исключён из всех трёх rendered streams явно (41 op), как historical gallery helper. Никаких других prune/remap/synthetic wet. Бумага Medium, физическая A2 landscape3508×2480. Terminal API watercolorDryAll — тот же historical helper, без snapshot restore. Перед экспортом выставляется исторический compositeOrder по strokeLayers, а не пустой начальный layer1.

DEFAULT оставляет поля painter исходной версии. c199 REVIEW устанавливает ровно девять исторических полей до первого input, эквивалентно его constructor VITE_WC_REVIEW=1/VITE_WC_FOREIGN_REVIEW=1: combined; pigmentRecord/sharedFluid/landingReservoir/solventField/canonicalSettleRadius/foreignSolvent=true; landingPolicy=fluid; waterPolicy=bottomless. Это separate flag contrast, НЕ modern flag retrofit в старый0a engine.

Каждый engine/shared взят полным архивом своей ревизии. Build esbuild0.28.1, одинаковый DEV=true и REVIEW/FOREIGN env0 для всех, no minification; exact defines/bundle SHA в passports. Browser explicit REVIEW меняет только поля, которые historical constructor присваивает напрямую, без иных constructor side effects. Шесть historical bundles CPU PASS; public paper — одни и те же copied immutable baked assets с SHA. Две HTTP module200/SHA exact и paper manifest200 проверены до hardware. Результат допустим только после фактического paperReady и проверки page3508×2480.

Сохранить pre-Dry/final/transparent wholePNG, непустые реальные P/C/coverage ROI у slot2, ledger и реальные flags. Byte sums разных исторических форматов нельзя напрямую называть изменением физической массы: 2e6a поменял record headroom. Вывод о каёмке требует одинаковой области исходного original-dab boundary и visual/profile comparison; только снижение общей плотности не является устранением каёмки.

CPU runner/temp/regression/run.mjs и probe.js проверены syntax/embedded compile и source SHA preflight. HOME immutable runtime: 680-water-wet-tone-qa/temp/ring-regression-cea. Первая/вторая попытки16684/19807 остановлены ДО Chrome порогом RAM1700 (1618/1635MiB), не являются engine failures. Own Vite5335 PID1304963 безопасно заменён лёгким Python staticHTTP PID1308635 после exact cwd/argv и EMPTY established census; исходники не изменены. Предыдущее состояние сохранено. Actual hardware pending; новые результаты добавляются отдельно.


## Подтверждённая аппаратная скобка DEFAULT

Corrected session17153 завершён EXIT0, completed=true, ownedChromeClosed=true. Все три arms прошли paperReady, page3508×2480/Medium, actual target61 material capture до исходного Dry, GL0/lostfalse/errors[]. Полный исходный журнал сохранён. Raw HOME: `680-water-wet-tone-qa/temp/ring-regression-cea/temp/static-material-retry1`; копии report и трёхчастного атласа VPS: `temp/regression/three-arm-report.json`, `temp/regression/slot2-three-arm-atlas.png` этого worktree.

На одинаковом slot2 у 0a78 DEFAULT нет замкнутой светлой внутренней линии, у c199 DEFAULT она есть; root независимо просмотрел одинаковые crops и подтвердил регрессию. REVIEW c199 тоже имеет линию. Следовательно, исторические REVIEW flags не являются необходимым условием дефекта. Это пока скобка, не первый плохой коммит и не причинная атрибуция shader diff.

Фиксированный левый boundary darkness dip: old DEFAULT0, c199 DEFAULT0.048832, c199 REVIEW0.034578. Это PNG-профиль, не физическая масса. P/C capture используется как nonempty guard; headroom между историческими версиями отличается, raw byte sums нельзя сравнивать как conserved mass. Первичный static-first guard после Dry был неверным и остаётся INVALID; corrected capture непосредственно после target61 сохраняет числовые результаты до retirement scratch.

Следующий условно разрешённый midpoint: 11ee5ab6 DEFAULT, session16825, тот же журнал/bundle passport, raw `temp/midpoint-11ee-default`. При запуске MemAvailable2047MiB, append originalseq48 после27.1s, error=null. Hardware midpoint ещё pending; первый bad не объявляется до одинаковой parent/child пары.
