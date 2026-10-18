# Полный host-профиль рядом с GPU-замером

QA-only дополнение к GPU-таймерам. Новые GPU-чтения, снимки или `gl.finish` не добавляются. Запуск на устройстве выполняется отдельно, когда оно свободно.

В сборке сначала применить `source-taps.cjs`, затем `cpu-source.cjs` к пяти engine-модулям (`ContrastPhase`, `PuddleTarget`, `BackgroundMix`, `WatercolorSettlePlan`, `WatercolorFrontPaths`). Второй transform также применяется к `native-direct-timed.ts` и `gpu-group-goal.ts`.

Вызов:

```ts
const {result, cpuTimeline} = await collectNativeCpuTimeline805(() =>
  runNativeGpuTimedGoal805({gl, controller, mode:'groups', runDirect, baseline})
)
```

Нужен ровно один core, исходный contrast/Q и полный набор native stage-событий. Другая картинка или новые GPU-чтения для тайминга не требуются. Сравнение семи входов и P/C/покрытия с baseline остаётся обязательным в GPU-helper/harness. Родной `runNativeDirectTimed` также проверяет метаданные и неизменность входов.

`cpuTimeline.tasks` содержит реальные host offsets от общего `performance.now`-начала: source capture/proof, метаданные, core, чтение C, чтение P/coverage, SHA, повторные source proofs, валидацию GL и асинхронный poll. Внутри core сохранены восемь непересекающихся host-интервалов с `groupId`, соответствующим GPU-группе. Внутри отбора отдельно измерены существующие GPU-readback, CPU-фильтр островков и upload маски.

У каждого task: `id`, `operation`, `parentId?`, `groupId?`, русская `label`, `lane:'cpu'|'transfer'`, `clock:'host'`, `wallAligned:true`, `startMs`, `endMs`, `elapsedMs`, `scope`. Parent включает детей. Верхние промежутки оформлены как `host.overhead`: неразложенная обвязка, а не неизвестно куда исчезнувшее время. Подсчитывать общее время можно только по неперекрывающимся верхним строкам.

Это host wall, не активная занятость CPU. Чтения и upload могут блокировать CPU в ожидании GPU. SHA через WebCrypto тоже измеряется как прошедшее время, а не занятость одного ядра. GPU-времена брать отдельно из `result.gpu.intervals`; их нельзя прибавлять к CPU/transfer spans.

`TIME_ELAPSED_EXT` не даёт смещение GPU к `performance.now`. Поэтому GPU-полосы имеют `wallAligned:false` и реальную длительность/порядок, но не выдуманные host start/end. Для GPU/CPU можно показывать связь этапов и перекрытие как отношение «те же команды выполняются асинхронно», а не точное совпадение горизонтальных координат.

Полный `wallMs` покрывает QA-вызов вместе с проверками и poll, но исключает получение входа посредством brush/replay до этого вызова, показ в интерфейсе и последующее построение самого отчёта. Это не полный пользовательский путь от пера до экрана.
