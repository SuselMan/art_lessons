# Не запускать отдельный solver для бесцветной компоненты: только QA common-C arm

`partition.colourOnlySchedule(baseCommonRGBA,'common-c-only')` — явный selector, ничего не запускает и не меняет исходные массивы/полную partition. Возвращает `solve` и `skip` с прежними id/order/count. Число всех компонент не подменяется числом запущенных jobs.

Условие: вся native C компоненты строго0 во всех4каналах (уже independently проверено partition.pigmented), и все4канала baseCommonRGBA внутри неё строго0. Ненулевой base вызывает ошибку до GPUfork/solve. Это защищает от несогласованного carrier/source mapping. RGB-only C при A0 считается окрашенной и НЕ пропускается. Ненулевой сухой base вне component остаётся literal.

Почему это допустимый кандидат именно для нынешнего C-only output: PuddleTarget alignment делает P.b=min(C.a,P.a), так что при C0 P.b0. В single-pigment ветке pigmentColor возвращает vec4(P.b*tau/4,P.b); в paired ветке C0 остаётся0 при существующем переносе. Background copies/smoothing не добавляют цвет к0. При этом P.r/g/a, coverage, water и рабочие pressurefields МОГУТ быть ненулевыми и могут изменяться solver. Поэтому это НЕ эквивалентность полного target и НЕ основание пропускать реальные водные операции живого движка.

Интеграция root в QA timed-wrapper, opt-in OFF по умолчанию:

1. Построить полную partition с ORIGINAL solvent/foreign, не удалять воду или source bytes.
2. Только если явно запрошен C-only skip: вызвать selector с actual baseCommonRGBA; иначе прежние partition.components.
3. Merge.begin({uploadBase:true}) остаётся внутри primary. Для `schedule.solve` прежние materialize/fork→withSource/paper→runCore→GPUmerge/dependency→fork.destroy finally.
4. `executedJobs===0` всё равно требует merge.dependency() (раньше проверялось partition.components.length===0). Числа totalComponents/executedJobs/skippedIds публикуются отдельно.
5. Skipped не нужно materialize/fork/reset/merge: соответствующий baseC уже доказан0. Ничего не обрезать на выходе и не менять исходную water mask.
6. Before/after7SHA исходника и actual whole-output C SHA против all-components baseline вне primary. Дополнительные gates: water-only, потом pigmented reset того же reusable controller, mini-wave + two-colors. RAW P/coverage equality не заявляется, поскольку для skipped jobs они не рассчитывались.

10CPU tests PASS всего: прежние8 плюс selector zero-base failclosed/foreground RGB-only/dryliteral/sourcewater unchanged/water-only allskip. Это не GPU-доказательство output equality. Никакой интеграции в liveMini, engine/core/UI этим helper не сделано.
