# Границы времени в финальном сравнении

Сейчас **нельзя считать ×gain между worker warmMedianMs и native componentLoopMs или суммой component.sample.totalReadyMs**. Это разные границы. Совпавшие входы/картинки не делают время сопоставимым.

## Что фактически измерено

- `worker.ts`, runGL: totalReadyMs = от candidate.upload до dependent чтения1px результата после candidate.run. runToDependentMs включает submit и ожидание; отдельно submitJsMs. Полное RGBA-чтение начинается после ready, fullReadbackJsMs/totalToFullReadbackMs записаны отдельно; SHA/метрики/PNG после них. Создание/компиляция candidate до серии. 1px не универсальная гарантия завершения всей GPU работы.
- `worker.ts`, runGPU: totalReadyMs = upload (включая CPU reduction и await, если есть) + run + queue.onSubmittedWorkDone. Полный candidate.readback и диагностические state/fine ledger/SHA вне primary; GPU timestamp profiling — отдельный режим. Создание/компиляция/начальные allocation до серии. Сравнение GL dependent1px и WGPU queue-complete всё ещё квалифицируется как разные API-границы, не чистое GPU и не отклик пера.
- `native-component-goal.ts`: componentLoopMs включает materialize, describe/hash, fork allocation/upload, чтение и SHA семи source planes/бумаги, внутренний native sample, чтение endpoint P/C/coverage, CPU-merge, endpoint hashes и cleanup. До его старта также идут original read/hash, partition/dry literal init; после — source-after proof и финальные hash. Это НЕ whole source→target latency и НЕ чистое время алгоритма.
- `controller.ts`, diagnosticRunGoal: sample.totalReadyMs включает resetFromScratch, весь step loop, target.dry, diagnosticPresentGoal и dependent1px dryImage. Mask/materialize и fork upload до него. dry очищает solvent coverage B; present делает render/copyTo/display. Worker общий CPU picture/compositor не входит в totalReadyMs, следовательно native present — ещё одна несовпадающая работа.

## Короткие подписи без ложного выигрыша

| Число | Подпись | Gain |
|---|---|---|
| Worker totalReadyMs | «Подготовка и расчёт до готовности GPU-носителя: N мс» | Только к baseline с той же явно проверенной границей и режимом серии |
| Native componentLoopMs сейчас | «Диагностический обход компонент: N мс; с worker-временем несопоставим» | Только между4 native-руками при том же loop-контракте/входе/компонентах/режиме; никогда к worker |
| Сумма native component.sample.totalReadyMs | «Внутренние native-расчёты компонент: N мс; без маски и загрузки» | Не вычислять |
| Native последующий source→merged carrier CPU arm | «Подготовка и расчёт до собранного CPU-носителя: N мс» | Не к worker GPU-ready; только к такому же CPU-ready endpoint |
| Worker totalToFullReadbackMs | «До полного чтения носителя: N мс» | Только к equivalent CPU-carrier endpoint, не с диагностическими native P/coverage проверками |

Worker↔worker при том же выбранном API/readiness-контракте сравниваются внутри своей группы;4 native↔native допускают сравнение диагностического loop внутри его одинакового договора. Для cross-group native↔worker ×gain запрещён. Это можно обозначить comparisonGroup, а не одним глобальным boolean. Наличие числа не требует globally comparable:true. Без согласованного endpoint `gainText=null`, `comparable=false`, в подписи явно «несопоставимый замер». Не умножать native на количество компонент и не подставлять худший диагностический обход как baseline для красивого ускорения. «Тёплая медиана» требует реальных повторов/отброшенного холодного первого; один source-proof запуск так не называется. Перерывы/idle и измерение в серии не смешиваются.

## Минимальные новые поля оператора

На scene: partitionHostMs; на компоненту materializeHostMs, forkAllocateUploadHostMs, proofSourceReadHashMs, nativeCoreDependentMs, endpointCarrierReadMs, endpointOtherProofReadMs, mergeCarrierHostMs, cleanupHostMs, proofEndpointHashMs. Сохранять full componentLoopMs и фактическое число pigmented/water-only goals. Отдельно измерять actual final common renderer, если он входит в выбранную конечную точку; одинаково для обеих сторон.

**Не вычитать proof readbacks механически.** Семь source readbacks сейчас синхронизируют реальные fork GPU uploads; их ожидание частично принадлежит нужной работе. Если исключить всю длительность readback, можно вычесть реальную подготовку. В то же время C endpoint readback необходим текущему CPU-merge, его нельзя объявить диагностикой. P/coverage чтения могут быть proof-only для common C endpoint, но это требует явной проверки использования.

Надёжный следующий измерительный arm: исходные immutable CPU planes/бумага и proof-описание готовы заранее; compile/reusable allocation вне серии аналогично worker create; внутри primary mask/partition если реально нужны, fork/upload, native solve до выбранной dependency, нужное C-чтение/merge до actual target endpoint. Полные source/endpoint proof readbacks/hash вынести в отдельный proof arm с совпавшими source/input/output SHA либо после endpoint. Не вставлять их между upload и dependency и затем вычитать. До этого stage host timings полезны для локализации, но не создают автоматически честный native↔worker gain.

Это договор измерений, не изменение модели или обещание ускорения. Runtime/worker/controller этим аудитом не менялись; GPU не запускался.
