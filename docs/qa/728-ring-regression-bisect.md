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


## Сужение до введения выбранной модели

11ee DEFAULT (16825), 2e DEFAULT (58795), непосредственный parent2e 5cb DEFAULT (87682) — все completed/closed/GL0/nonempty и имеют замкнутую бледную линию. Left darkness dip соответственно0.044405/0.038656/0.041615. Значит2e не первоначальная причина; 11ee/f277 также позже уже существующего дефекта. First-parent0a58 DEFAULT (35480) completed/closed/GL0/nonempty, линии нет, профиль0/.004534/0/0 совпадает good0a78.

Точная граница render-source по first-parent: 0a58a08251ba8cade99921ccb8cf002f8ee3ad56 GOOD → merge8f7e4ca31ba43aab353660da5b8fff9d929eda28 BAD. BAD аппаратно проверен в5cb04f46 с byte-identical engine/shared source8f; diff остальных websrc — только PrecisionSlider.module.css, SettingField.module.css/index.tsx, не зависимости standalone engine. Public assets diff пуст; бумаги всех arms те же. Engine/shared0a78→0a58 diff пуст. Merge8f имеет второй parent653d0fac: это введение выбранной модели в main, не утверждение даты появления на экспериментальной ветке.

В 8f меняются FilmDose.62→1.4, StartExcess2→5, poolBlot, brushDrag domain cov.b→cov.a, а diffuse использует coverage.a вместоcoverage.b и снижает pair gate делением1+8density². Extraction itself сохраняет множество old operators. Нужна отдельная same-journal ablation действительного diff до физического исправления; сам regression bracket не доказывает конкретную формулу. Crops VPS temp/regression/{11ee,2e,5cb,0a58}-slot2.png. Raw HOME остаётся в immutable runtime temp/{midpoint-11ee-default,midpoint-2e-default,parent-5cb-default,merge-parent-0a58-default}.


## Причинные counterfactuals выбранной модели

8f oldDiffuse (44718), только WC_DIFFUSE_FRAG из0a58: completed/closed/GL0, отчётливая замкнутая линия исчезла, лёгкие фрагменты слева остались, leftdip.013775/right0. 8f noDensity (2529), coverage.a сохранён, только1+8density² denominator убран: линия ушла, leftdip.014904/right0, но wash стал заметно прямоугольнее/бледнее. 8f oldCoverage (64081), gatecoverage.b с densityON: leftdip.019604/right0, внешняя прямоугольная граница ослабла, однако мягкая внутренняя линия справа/сверху осталась. Все immutable42 DEFAULT, без snapshot, wholePNG/target61 nonempty/material и ошибки проверены. Raw HOME temp/counter-{oldDiffuse,noDensity,oldCoverage}. VPS crops соответствующие *-slot2.png.

Вывод ограниченный: diffuse domain и density limiter оба причинные contributors введённой линии. Полный rollback diffuse/удаление limiter не принят как исправление текущей модели: нужен сохранённый цвет/ядро/реальная вода и current combined control. Root просмотрел oldDiffuse и подтвердил исчезновение отчётливого кольца, но остаточные фрагменты не объявляются исправленными. Текущий root c092bb92 сохраняет denominator, но solvent density читает P.b/V и другие операторы изменены; historical attribution не переносится автоматически на current.


## Актуальная модель c092: механизм сохраняется

62505 three arms completed/ownedChromeClosed=true/GL0/nonempty material12, immutable42. Constructor current production9flags ON, phase/ADD OFF, baked OFF. Baseline имеет отчётливую замкнутую линию; noDensity-only убирает её; coverage.b-only не убирает и сохраняет ту же фиксированную core appearance. VPS current-three-atlas.png/current-report.json, HOME temp/current-controls. Left dip baseline.018992/noDensity.021691/cov.b.018992: этот axis darkness metric НЕ отслеживает closed ring reliably, учитывает texture; visual conclusion подтверждён root, не подменён числом.

Target61 ROI inkLoad sum732155→729329(−.386%), inkDry714131→713718(−.058%), coverage/V sums unchanged. Fixedcore alpha233.23→222.02, wholetransparent support177734→197689, optical alpha12504725→13580239. ROI sums не fullfield mass, PNG support не физическийmass. Redistribution меняет исходный дефектный contrast; само4.8% core ослабление не исключает кандидат, необходимо visual+foreign/native/replay approval.

Изолированный current candidate65d2546b (gate only), cleanup894ec09c (dead diffuse sampler reads/bindings removed) в728-ring-diffusion-current отc092; no push. CPU13testsPASS, oldsource newactualgate test negative EXIT1. Bakedcombo controller и sheet4full24 foreign fixture prepared CPU; GPU послеliveMorphrelease, не integrated default по этим материалам.


Emitted-bundle dependency proof: 5cb and8f wholeengine `.mjs` byte-identical after replacing only `sources/<revision>/` filename comments; normalizedSHA665d832b53b3f412c78fe89a002e153f07a3600d691c5134c95dd1448094dad3. Thus hardware BAD5cb executes the exact8f emitted program, not merely selected files with presumed external dependencies. Assets/defines are shared immutable passports.
