# Карта швов `apps/web/src/engine/index.ts`

Снято с `origin/main` = `7eab3a7` (worktree `493-room-finish`), файл — **15 419 строк**.
Контекст: #494 «[Refactor] Engine: декомпозиция PencilEngine» (эпик #490), уже вынесены
`CheckpointStore`, `scratchPools`, `SnapshotLedger` (PR #611).

## Как мерилось

- **Строки** — по границам методов в текущем файле (`grep` сигнатур + `git blame`).
- **«Свежесть»** — `git blame` текущего файла: сколько строк региона последний раз менял
  коммит за последние 14 дней (69 коммитов в `index.ts`). В скобках — из них коммиты
  акварели (#536/#468). Внимание: #579/#581 «цифровая акварель» — это пресеты *цифровой
  кисти*, не инструмент акварели; где это важно, отмечено отдельно.
- **Живая ветка** — `agents/watercolor-feel` (4 коммита сверх main, #536 §17.61–17.63).
  Её дифф `index.ts` (+48/−7) трогает ровно эти места:
  `_strokeChunkBox` (поле, ~3139), `absorbHistoricalOperations` (6695), `_initGL`
  (униформ `u_rectComposite`, ~6798), `_noteChunkDab`/`_chunkSpanExceeded` (8230–8256),
  `_paintRibbonStroke` (~9901 и ~10239), `_drawRibbonCompositeDab` (~12882).
  Других живых веток, трогающих `index.ts`, нет (537-true-order, 573/579/581 уже в main).
- **Связность** — по обращениям `this.*` внутри региона и по местам вызова его методов.

Шкала перекрытия с акварелью: **нет** / **слабое** (несколько строк или только диспетчер) /
**сильное** (регион — сама акварель или её активная зона).

---

## Уровень модуля (вне класса), строки 1–2359

| Регион | Строки | Что | Свежесть | Акварель |
|---|---|---|---|---|
| Импорты, экспортируемые типы, `PencilEngineOptions`, `WatercolorPerf`, `StrokeDebugStats` | 1–509 (~510) | публичные типы | 137 (61) | слабое |
| `interface PencilEngineAPI` + `AreaImage`/`AreaFillRequest` | 510–1071 (~560) | публичный контракт, док-комменты | 86 (28) | слабое (методы `watercolor*`) |
| Приватные типы: `PeerLivePacket`, `PeerLiveStroke`, `EngineOpts`, `PeerPreviewState`, `RebuildJob`, `PreviewTile`, `MaskTexture`, хелперы `unpremultiply`/`blobToDataUrl` | 1072–1350 (~280) | внутренние типы подсистем | 16 (16) | слабое |
| Константы: чекпойнты, чанки штриха, WC_*, SMUDGE_*, WET_*, MARKER_*, WASH_*, GPU-бюджет, `ribbonBristleCombs`/`ribbonWaterDelivery` | 1351–1732 (~380) | числа подсистем | 89 (82) | сильное (WC/WASH-блок) |
| `class RibbonScratchPool` | 1733–1800 (~70) | пул буферов ленты | 31 (31) | сильное |
| `class RibbonStrokeScratch`, `ScratchSnapshot`, `CarriedWash`, `SNAPSHOT_TILE_BUFFERS` | 1801–2358 (~560) | плёнка/скретч жеста маркера и акварели, снимок скретча для чекпойнта | 256 (256) | **сильное** |
| `presetForTool`, `renderSizeScale` | 15390–15419 | свободные функции | 0 | нет |

Замечание: `RibbonScratchPool`/`RibbonStrokeScratch` — уже *отдельные классы*, механически
их перенос в `src/dabs/` или `src/watercolor/` — самый дешёвый выигрыш в ~630 строк. Но это
самая горячая зона #536 (46 % строк переписаны за две недели) — по правилу #494 ждёт.

## Класс `PencilEngine` — 2360–15389

Блок объявлений полей 2360–3210 — **851 строка** (с доккомментами). Он не шов, а
«склад»: поля уезжают вместе со своими подсистемами. Из них ~170 строк — тройки
`_xxxProg / _xxxUni / _xxxPosLoc` для 22 GL-программ (`_initGL`).

Ниже — подсистемы. Номера (С1…) используются в разделе порядка.

### С1. Жизненный цикл: конструктор, `destroy`, потеря/восстановление контекста
- **Строки:** конструктор 3211–3326, `destroy` 5117–5187, `_handleContextLost/Restored`
  ~5955–6040, `gpuInfo`/`_drainGlErrors` 6627–6652. ~330.
- **Поля:** `canvas`, `gl`, `_destroyed`, `_contextLost`, `_raf`, `_handlers`.
- **Связность:** хаб — знает *каждый* пул и кэш (≈30 строк `forget()/clear()` в restore,
  столько же в `destroy`). Каждый вынесенный шов сокращает его до `x.forget()`/`x.destroy()`.
- **Акварель:** слабое (строки про wash/settle/field — появляются с каждым новым полем).
- **Тесты:** e2e `contextLoss.spec.ts`; юнит — нет прямого.
- **Сложность / форма:** не выносится; цель — чтобы он стал списком делегатов. Для этого
  каждый шов ниже реализует `{ forget(): void; destroy(): void }`.

### С2. Слои, порядок композита, фильтр показа
- **Строки:** `initLayer`…`setDisplayFilter`, `_displayOrder` 3327–3452; `_createBuffer`,
  `_destroyBuffer` 6727–6767; `_makeLayerBuffer`, `_makeTileRebuilder`, `_tileSize`
  5693–5818. ~330.
- **Поля:** `_layers`, `_baseLayerIds`, `_compositeOrder`, `_displayFilter`, `_activeId`,
  `_locked`, `_eraseThroughIds`.
- **Связность:** `_layers` читают почти все подсистемы — это общий контекст, не шов.
- **Акварель:** нет/слабое (`_destroyBuffer` 3 строки).
- **Тесты:** `displayFilter`, `eraseThroughLayers`, `restoredBaseLayers`, `revivedLayer`, `tiled*`.
- **Сложность:** — (остаётся в движке как «реестр слоёв»; позже можно `LayerRegistry`).

### С3. Приём операций, очередь, лог, undo/redo
- **Строки:** `appendOperation`, `_shouldQueue`, `_flushOpQueue`, `_scheduleOpDrain`,
  `_appendOperationNow` (307 строк — главный диспетчер по типу операции), `confirmOperation`,
  `discardOperation`, `resettleCount`, `_noteOvertaken`, `_foreignUnrecordedInk`,
  `_settleLayers`, `_retrySettleIn`, `getOperations`, `undo`/`redo`/`peek*`, `clear`
  3543–4162. ~620.
- **Поля:** `_log`, `_unsettledLayers`, `_settleRetryTimer`, `_resettleCount`,
  `_historicalEntryCount`, очередь операций, колбэки `_onLocalOperation/_onInvariant`.
- **Связность:** вызывает все «исполнители» операций (штрих, картинка, фигура, фильтр,
  area-*, transform, merge/duplicate), чекпойнты, снапшот-леджер, показ.
- **Свежесть:** 197 строк за 2 недели — #537 (истинный порядок, 113+ строк) и #536 (очередь
  чужой акварели). **Акварель: сильное** (очередь §17.58).
- **Тесты:** `trueOrder`, `networkedUndoRedo`, `structuralUndo`, `structuralUndoRedoPeek`,
  `replayCost`.
- **Сложность: высокая.** Трогать последним. Выгода от других швов придёт сюда сама:
  ветки `case` станут однострочными вызовами вынесенных исполнителей.

### С4. Реплей и пересборка слоя
- **Строки:** `_applyHistoryChange`, `_rebuildLayerOrDefer`, `_flushPendingRebuilds`,
  `_syncBuffersToLog`, `_rebuildLayer`, `_rebuildWantsSlicing`, `_cancel/_start/_stepRebuildJob`,
  `_jobOwnsSettle`, `_noteReplayedOrder`, `_swapRebuiltLayer`, `_replayInto`,
  `_dropCarriedGestureState`, `_applyPixelOp` (второй диспетчер по типу) 5188–5692. ~505.
- **Поля:** `_rebuildJobs`, `_pendingRebuilds`.
- **Свежесть:** 163 (140) — нарезанная пересборка после undo (#536 §17.53).
- **Акварель: сильное.** **Сложность: высокая.**
- **Тесты:** `structuralUndo`, `ribbonReplayRebuild`, `replayCost`, `watercolor`.

### С5. Структурные операции merge/duplicate
- **Строки:** `_compositeLayerInto`, `_replayMergeInto`, `_replayDuplicateInto`,
  `_execMerge*`, `_execDuplicate*` 5819–~5950. ~135.
- **Поля:** своих нет; `_layers`, `_log`, `_snapshots`, `_checkpoints`.
- **Свежесть:** 1. **Акварель:** нет.
- **Тесты:** `layerDuplicate`, `structuralUndo`.
- **Сложность:** низкая, но выигрыш мал; функции `src/oplog/structuralOps.ts` с контекстом.

### С6. Чекпойнты и границы заливов
- **Строки:** `_maybeCheckpoint`, `_hasUnrecordedInk`, `_checkpointBeforeWash`,
  `_openWashes`, `_carryWashes`, `_freeBoundary`, `_seedWashes`, `_packWashBoundaries`,
  `_dropWashBoundaries`, `_takeCheckpoint`, `_checkpointAfterSettle` 6043–6401 (+4029). ~370.
- **Поля:** `_checkpoints` (уже `CheckpointStore`), `_checkpointRefusals`,
  `_washBoundaries`, `_washBoundaryScheduled`, `_lastBoundaryCheckpoint`.
- **Свежесть:** 199 (186). **Акварель: сильное** (границы заливов §17.55 — работа этой недели).
- **Тесты:** `checkpointUnrecordedInk`, `tiledCheckpoint`, `checkpointPrefix`, `watercolor`.
- **Сложность:** высокая сейчас; ждёт.

### С7. Сетевые снапшоты и восстановление
- **Строки:** `_bakeTiles`, `bakeNetworkSnapshot`, `bakeLayerByFullReplay`,
  `restoreLayerFromSnapshot`, `takeSnapshotRestoreAudit`, `isLayerDirty`, `liveLayerIds`,
  `_pinSnapshotCheckpoint`, `absorbHistoricalOperations`, `getOperationsSinceRestore`
  6402–6726. ~325.
- **Поля:** `_snapshots` (`SnapshotLedger`), `_restoreAudit`.
- **Связность:** `_replayInto`, чекпойнты, `retileSnapshot`/`snapshotCodec` (уже вне класса).
- **Свежесть:** 44 (15). **Акварель: слабое, но ветка трогает `absorbHistoricalOperations`**,
  а `bakeNetworkSnapshot` недавно учили «не печь посреди залива».
- **Тесты:** `networkSnapshot` (582 стр.), `snapshotCoverage`, `snapshotDirty`,
  `restoredBaseLayers`, `revivedLayer`; e2e `snapshot`, `reconnect`.
- **Сложность:** средняя. Форма: `SnapshotIO` в `src/oplog/` поверх `SnapshotLedger`.
  После мержа watercolor-feel.

### С8. GL-инициализация и программы
- **Строки:** `_initGL` 6768–6984 (~217) + ~170 строк полей программ/униформ/атрибутов.
- **Связность:** каждая подсистема читает свои `_xxxProg/_xxxUni/_xxxPosLoc`.
- **Свежесть:** 50 (23). **Акварель: слабое, но ветка правит список униформ `_dabUni`.**
- **Сложность:** не отдельный шов. Правильная форма — *каждая вынесенная подсистема сама
  создаёт свои программы* в `init(gl)` (тип `Pass<U> = { prog, uni, pos }`), и `_initGL`
  тает по мере выноса. Общий список создавать не надо.

### С9. Бумага и геометрия листа
- **Строки:** `paperReady`, `retryPaper`, `_startPaperLoad` 3476–3503; `_initPaper`,
  `_wcSheetClamp`, `_resolveWithinSheet`, `_pageRect`, `_paperWorldSize`, `_pageSize`,
  `_physicalSize`, `_snapPoint` 6985–7123; `_paperTexelsPerPixel`, `_bindPaperForCompose`,
  `_releasePaperFromCompose` 13507–13594. ~290.
- **Поля:** `_paperTex`, `_paperReady`, `_paperTexLoaded`, `_paperMipsReady`, `_opts.paper`.
- **Связность:** `_pageSize/_paperWorldSize/_paperTex` читают штампы, мазок, смаж, фигуры,
  заливка — это общий контекст.
- **Свежесть:** 18 (18, sheet clamp). **Акварель:** слабое.
- **Тесты:** `paperTexture`, `paperMipmaps`; e2e `paperFailure`.
- **Сложность:** средняя (много читателей). Форма: `PaperState` в `src/paper/` — объект
  с `texture`, `worldSize()`, `pageSize()`, `bindForCompose()`; движок отдаёт его в контексты.

### С10. Камера, вьюпорт, экстент рендера
- **Строки:** `setViewport`, `_getCanvasRect`, `setInfiniteCamera`, `invalidateCanvasRect`,
  `resizeCanvas`, `_renderBufferExtent`, `_assemblyPad`, `_infiniteCompositeScale`,
  `_residualScale` 4405–4638; `_visibleWorldRect`, `_cameraCenteredOrigin`, `_translateDabs`,
  `_worldToScreenEdgeX/Y` 13108–13254; `_infiniteRotateMatrixInv`, `_screenToWorldMatrix`
  13442–13506. ~430.
- **Поля:** `_infiniteCamera`, `_canvasRectCache`, `_compositeCenterX/Y`, `_compositeScale`,
  `_infinite`.
- **Связность: высокая** — `_compositeCenter*/Scale` *подменяют* экспорт и
  `_buildContentComposite` (save/override/restore), читает композит, указатель, превью.
- **Свежесть:** 5. **Акварель:** нет.
- **Тесты:** `tiledDisplay`, `tiledPreview`, `tiledMipmaps`, `areaClearCoarse`.
- **Сложность:** средняя-высокая. Форма: неизменяемый `CameraFrame` (значение), который
  композит получает аргументом, — тогда экспорт передаёт свой кадр вместо мутации полей.
  Хороший *второй эшелон*: разблокирует С21 (экспорт) и С20 (композит).

### С11. Указатель и жизненный цикл живого штриха
- **Строки:** `_onStart` (289), `_onMove`, `_refreshTip`, `_onPredict`, `_onEnd` 7124–7707;
  `_paintExtraLayers`, `_paintDwellDab`, `_emitLiveDabsIfDue`, `_noteChunkDab`,
  `_chunkSpanExceeded`, `_flushStrokeChunk` 8075–8300; `on()` 5024–5049. ~850.
- **Поля:** `_stroke*` (Layer/Tool/Preset/Color/Dabs/ChunkTail/ChunkBox/Id/Wet), `_pointer`,
  `_dabs`, `_lastPointer*`, `_dwell*`, `_liveTip`, `_previewBuf*`, `_tipBuf*`, `_liveDabQueue`,
  `_liveLastEmitAt`, `_livePacketSeq`, `_haptic*`, `_ruler`, `_nibAngleRadians`,
  `_nibAnchor`, `_tiltResponse`, `_wash`, `_washId`, `_strokeWet`, `_liveWetQueue` + все `_dbg*`.
- **Связность:** максимальная; обращается к ~100 разным членам.
- **Свежесть:** 97 (78). **Акварель: сильное — ветка правит `_noteChunkDab/_chunkSpanExceeded`.**
- **Тесты:** `strokeStreaming`, `strokeChunking`, `ruler`, `dabSpacing`, `pencilTilt`.
- **Сложность: высокая.** Это ядро будущего `ToolStrategy` (#494 шов 4) — ждёт.
- Подшов **С11a — отладочная статистика штриха** (`_dbg*`, ~25 полей, `_onStrokeDebugStats`):
  класс `StrokeDebugStats` в `src/input/`; мал, но трогает `_onStart/_onMove` → после ветки.

### С12. Разрешение пресета и запекание непрозрачности дабов
- **Строки:** `_resolvePreset`, `_dabSizeScale`, `_nibScallops`, `_resolveGrainMode`,
  `_bakeDabOpacity` (174) 7708–7941. ~235.
- **Поля:** читает только `_grainMode`, `_charcoalGrainMode`, `_physicalSize`, `_dabs`.
- **Связность:** почти чистые функции; вызываются из `_onStart/_onMove/_onEnd`, реплея,
  диспетчера штампов, ветки (`_resolvePreset` в новом `_chunkSpanExceeded`).
- **Свежесть: 0.** **Акварель:** нет (ветка лишь *вызывает* `_resolvePreset`).
- **Тесты:** `charcoal` (540), `pencilTilt`, `brushSizeScale`, `dabSpacing`, `tipFootprint`.
- **Сложность: низкая.** Форма: свободные функции в `src/dabs/dabOpacity.ts` +
  `src/presets/resolvePreset.ts` (рядом с `presetForTool`/`renderSizeScale`, которые уже
  свободные в хвосте файла) с явными аргументами `(tool, preset, grainModes, physicalSize)`.
  В движке — однострочные приватные обёртки, чтобы не трогать места вызова в ветке.

### С13. Диспетчер штриха
- **Строки:** `_paintStrokeDabs` 7942–8074, `_paintDabs` 8903–9028. ~260.
- **Связность:** разводит по инструментам: смаж/микс (С15), лента маркера/акварели (С17),
  цифровая кисть (С18), штампы (С14).
- **Свежесть:** 17 (9). **Акварель:** слабое.
- **Сложность:** остаётся в движке до `ToolStrategy`; после выноса С14/С15 он сам станет
  таблицей.

### С14. Штамповщик дабов (uniform + instanced) и габариты дабов
- **Строки:** `_dabsWorldBounds`, `_dabWorldHalfExtents` 8799–8902; `_paintDabsUniform`,
  `_paintDabsInstanced` 9029–9240. ~315.
- **Поля:** `_dabProg/_dabUni/_dabPosLoc`, `_dabProgInstanced/_dabInstUni/_inst*Loc`,
  `_dabInstBuf`, `_dabInstScratch`, `_instancedArraysExt`, `_minmaxExt`, `_quadBuf`.
  Общие: `_paperTex`, `_paperWorldSize`, `_paperFillThreshold/Cap`, `_opts`.
- **Связность:** зовётся только из `_paintDabs`; `_dabWorldHalfExtents` читает
  `_smudgeImprints` и `_ribbonStrokeScratch` (для запаса габарита).
- **Свежесть: 0.** **Акварель:** нет, **но** `_dabUni` получает в ветке `u_rectComposite`
  (униформ общей программы) — конфликт одной строки в `_initGL`.
- **Тесты:** `dabBatching`, `dabSpacing`, `charcoal`, `pencilTilt`, `tipFootprint`, `liner`.
- **Сложность:** низкая-средняя (горячий путь, WebGL1-инстансинг через ANGLE-расширение).
  Форма: класс `StampPainter` в `src/dabs/`, получает `gl`, расширения и `PaperState`.

### С15. Растушёвка (smudge) и смешивающая кисть (mixer)
- **Строки:** `_paintSmudgeDabs`, `_smudgeResumeGesture`, `_paintOneSmudgeDab`,
  `_smudgeRadius`, `_smudgeApplyDab`, `_gatherSmudgePatch`, `_smudgeImprintFor`,
  `_smudgeRunPickup`, `_drawSmudgeTransferDab`, `_acquire/_releaseSmudgeScratchBuf`
  9241–9631. ~390 (+ ~15 строк полей и ~15 в `_initGL`).
- **Поля (свои):** `_smudgeScratchPool`, `_smudgeImprints`, `_smudgeReplayChunks`,
  `_smudgeProg/Uni/PosLoc`, `_smudgePickupProg/Uni/PosLoc`.
  Общие (чтение): `_paperTex`, `_paperWorldSize`, `_paperFillThreshold/Cap`, `_quadBuf`,
  `_screenBuf`, `_opts`.
- **Связность:** вход — две строки в `_paintDabs` (8922, 8928); выход наружу — только
  `_dropCarriedGestureState` (5574, чистка чужих чанков), `_dabWorldHalfExtents` (8876),
  `destroy` и restore. Больше никто.
- **Свежесть:** 40 (0) — #573 (mixer), уже в main. **Акварель: нет.**
- **Тесты:** `smudge` (468), `digitalBrush`, `digitalBrushStamp`; e2e `smudgeSeam`.
- **Сложность: низкая.** Форма: класс `SmudgePainter` в `src/dabs/` (или новая папка
  `src/smudge/` — тогда README + абзац в `map.yaml`): `paint(target, dabs, userId, prevDab,
  strokeId, paint?)`, `dropStaleChunks(isLive)`, `imprintRadiusHint(userId)`, `forget()`,
  `destroy()`.

### С16. Импорт картинки
- **Строки:** `_loadImage`, `preloadImage(s)`, `_paintDecodedImage`, `_settleLateImage`,
  `_paintImage`, `_blitImage` 8301–8490. ~190.
- **Поля:** `_imageCache`, `_blitProg/_blitUni/_blitPosLoc`.
- **Связность:** `_drawImageThroughMatrix` (в С19) и `_blitImage` делят программу блита;
  `_imageCache` читает `previewAreaPaste`; `_settleLateImage` зовёт `_rebuildLayer`.
- **Свежесть: 0.** **Акварель:** нет.
- **Тесты:** `imageImport`; e2e `imageImportGizmo`, `clipboardAcrossRooms`.
- **Сложность:** низкая. Форма: вместе с С19 — `ImagePasses`/часть `AreaOps`.
  `HTMLImageElement`/`Image()` здесь уже есть — это не `window`, тесты проходят; сохранить так.

### С17. Акварель и лента маркера/лайнера (мазок)
- **Строки:** `_paintRibbonDabs`, `_retireWashesOf`, `_replayChunkScratch`,
  `_paintRibbonStroke` (753!) 9632–10553; `_finishRibbonStroke` 12288–12456;
  проходы ленты `_markerSegmentLength`, `_drawRibbonNibPass`, `_drawRibbonBands`,
  `_drawRibbonCompositeRect`, `_drawRibbonCompositeDab` 12457–12888. ~1520.
- **Поля:** `_ribbonStrokeScratch`, `_ribbonScratchPool`, `_replayRibbonChunks`,
  `_chunkAuthors`, `_ribbonProg/_ribbonUni/_ribbon*Loc/_ribbonBuf`, `_wash`, `_washId`.
- **Свежесть:** `_paintRibbonStroke` 184 (140), `_finishRibbonStroke` 78 (78), проходы
  ленты — 12 (12). **Акварель: сильное; ветка правит `_paintRibbonStroke` и
  `_drawRibbonCompositeDab`.**
- **Тесты:** `watercolor` (1301), `marker`, `liner`, `ribbonReplayRebuild`.
- **Сложность:** высокая. Ждёт закрытия #536. Когда придёт время — сначала проходы ленты
  (`RibbonPasses`, общие для маркера и акварели), потом `_paintRibbonStroke` разрезать на
  маркер/лайнер и акварель.

### С18. Цифровая кисть (штамп + композит) и текстуры кончиков
- **Строки:** `_paintBrushStroke`, `_drawBrushComposite`, `_brushTexture`, `_tipTexture`,
  `_uploadMips` 10554–10829. ~275.
- **Поля:** `_brushStampProg/Uni/PosLoc`, `_brushCompositeProg/Uni/PosLoc`,
  `_brushTextures`, `_tipTextures`, `_blendMinMaxExt`.
- **Свежесть:** 259 — #573/#579/#581 (цифровая кисть и её «цифровая акварель»), всё в main.
  **Инструмент акварели: нет**; в ветке не трогается.
- **Тесты:** `digitalBrush`, `digitalBrushStamp`; e2e `digitalBrush`.
- **Сложность:** средняя (делит `RibbonStrokeScratch` с лентой). Форма: `BrushPainter`
  в `src/dabs/`. Третий эшелон — после того как #573-линия устоится.

### С19. Трансформация слоя, выделение, вставка, заливка
- **Строки:** `previewLayerTransform`, `clearLayerTransformPreview` 4639–4771;
  `_runTransformBlit`, `_bakeTransform`, `_bakeTransformUnsuspended`, `_acquireMask`,
  `_releaseMask`, `_runAreaMaskPass`, `_runAreaTransformBlit`, `_composeAreaTiles`,
  `_tileBufferAt`, `_areaTileRects`, `_bakeAreaTransform`, `_clearArea`,
  `_drawImageThroughMatrix`, `previewAreaPaste`, `_asImportRecord`, `previewAreaTransform`,
  `readAreaImage`, `_fillDomain`, `_readFillSource`, `computeAreaFill` 13904–14874.
  **~1100** (+ ~25 строк полей, ~20 в `_initGL`).
- **Поля (свои):** `_transformPreview`, `_areaPreviewLayers`, `_maskCache`,
  `_transformScratchPool` (+ `_acquireScratchBuf/_releaseScratchBuf` 13121–13152, которые
  зовут *только* отсюда), `_transformProg/Uni/PosLoc`, `_areaTransformProg/Uni/PosLoc`,
  `_areaMaskProg/Uni/PosLoc`.
  Общие: `_layers`, `_screenBuf`, `_blitProg` (с С16), `_imageCache` (с С16).
- **Кто зовёт снаружи:** диспетчеры `_appendOperationNow` (3800–3855) и `_applyPixelOp`
  (5627–5647) — ровно `_bakeTransform(buf, m)`, `_bakeAreaTransform(buf, sel, m)`,
  `_clearArea(buf, sel)`, `_asImportRecord(op)`; композит читает `_transformPreview` /
  `_areaPreviewLayers` (12957–12962, 13365–13386); превью фигуры и фильтра (С20′)
  *пишут* в тот же `_transformPreview`; `_runTransformBlit` зовут ещё
  `_finishInfiniteComposite` (13419) и `_filterTiles` (8699).
- **Что зовёт само:** `_display`, `_tileSize`, `_pageSize`, `_infinite`, `_displayOrder`,
  `_compositeTextures`, `_pixelsToBlob`, `floodFill`/`selectionMask`/`matrix` (уже в `src/raster`).
- **Свежесть: 0 из ~1100.** **Акварель: нет.** В ветке — ни строки.
- **Тесты:** `areaSelection` (239), `areaFill`, `areaClearCoarse`, `layerTransform` (191),
  `tiledTransform` (220), `tiledTransformPreview` (212), `tiledTransformSeams` — ~1130 строк;
  e2e `transformCommit`, `transformSeam`, `selectionActions`, `selectionTap`, `fill`,
  `imageImportGizmo`, `clipboardAcrossRooms`.
- **Сложность: средняя-низкая** (много кода, но узкий вход: всё берёт `(buf, op)`).
  Форма: см. «Первый шаг» ниже.

### С20′. Фигуры и фильтр слоя (пиксельные проходы по тайлам)
- **Строки:** `_shapeWorldRect`, `_runShapePass`, `_drawShape`, `previewShape` 8491–8643;
  `_filterTiles`, `_applyFilter`, `previewLayerFilter` 8644–8798. ~310.
- **Поля:** `_shapeProg/Uni/PosLoc`; фильтр — CPU по тайлам (`src/filters/layerFilters.ts`).
  Общие: `_transformPreview`, `_areaPreviewLayers`, `_tileBufferAt`, `_runTransformBlit`.
- **Свежесть:** 155 (#574, фильтры) + 45 (#527) — всё смёржено, живых веток нет.
  **Акварель: нет.**
- **Тесты:** `layerFilter`; `src/raster/shapeGeometry.test.ts`, `src/filters/layerFilters.test.ts`;
  e2e `shapes`, `layerFilter`. Юнит-теста движка на `shape` нет — пробел.
- **Сложность:** низкая *после С19* (переиспользует его `PreviewTiles` и блит).
  Форма: `ShapePass` в `src/raster/`, `FilterPass` в `src/filters/`.

### С21. Экспорт и превью-миниатюра
- **Строки:** `exportPNG`, `bakePreview` 5050–5116; `_displayTransparent`,
  `_allVisibleContentBounds`, `_buildContentComposite`, `_renderDisplayTransparentInto`,
  `_renderPaperComposeInto`, `_renderDownsampleInto`, `_pixelsToBlob`, `_exportOffscreenPNG`
  15029–15389. ~430.
- **Поля:** `_dispTransparentProg/Uni/PosLoc`, `_paperComposeProg/Uni/PosLoc`,
  `_previewDownsampleProg/Uni/PosLoc`.
- **Связность:** подменяет `_compositeCenterX/Y`, `_compositeScale`, `_infiniteCamera` на
  время рендера (save/override/restore), зовёт `_drawCompositeItem`, `_composeToFBO`,
  `_bindPaperForCompose`. `_pixelsToBlob` нужен ещё С19.
- **Свежесть:** 67 (0) — #595 bakePreview, #470 — в main. **Акварель: нет.**
- **Тесты:** `tiledExport` (145), `bakePreview` (112), `strokeStreaming`.
- **Сложность:** средняя: чисто выносится только вместе с `CameraFrame` (С10).
  Форма: `Exporter` в новой `src/export/` (README + map.yaml), получает интерфейс
  `renderContent(frame, fbo)` от композита.

### С22. Живые штрихи и превью чужих операций
- **Строки:** `previewOperation`, `dropPendingPreview`, `flushPeerPreview`,
  `appendPeerLiveDabs`, `endPeerLiveStroke`, `_pruneLiveGestures`, `resetPeerLiveStrokes`,
  `_claimLivePaintedDabs`, `_startPeerPreviewHead`, `_stepPeerPreview` 4772–5023. ~250.
- **Поля:** `_peerPreviews`, `_peerLiveStrokes`, `_onPreviewApplied`.
- **Связность:** `_peerLiveStrokes` читают `_foreignUnrecordedInk` (3978), `_hasUnrecordedInk`
  (6098), `_checkpointBeforeWash` (6163); `_claimLivePaintedDabs` зовёт `_appendOperationNow`
  (3720); `_peerPreviews` — `_scheduleDisplay` (14932); вызывает `_paintDabs`,
  `_wetFromForeignStroke`, `_settle*`.
- **Свежесть:** 16 (13 — `appendPeerLiveDabs`, «пакеты чужой акварели»). **Акварель: слабое.**
- **Тесты:** `peerLiveStroke` (379), `tiledPreview`; e2e `peer`, `liveLatency`.
- **Сложность:** средняя. Это шов 3 из #494 (`PeerPreviewManager`) — сверить с #428.
  Форма: `PeerStrokes` в `src/input/` или `src/oplog/` с контекстом `{ paintDabs, display,
  wet, settle }`; наружу — `hasUnrecordedInk(layerId)`.

### С23. Композит и показ
- **Строки:** `_compositeTextures`, `_invalidateSplitCache`, `_drawCompositeItem`,
  `_rebuildSplitCacheIfDirty`, `_rebuildCacheHalf`, `_downsampleTileInto`,
  `_drawTileComposite`, `_runComposite`, `_finishInfiniteComposite` 12889–13441;
  `_composeToFBO`, `_scheduleDisplay`, `_display`, `_displayIfNotSuspended`, `suspend/resumeDisplay`
  14875–15028, 3453–3542. ~760.
- **Поля:** `_compositeProg/Uni/PosLoc`, `_compositeFBO`, `_assemblyFBO`, `_belowCache`,
  `_aboveCache`, `_splitCacheDirty`, `_screenCache`, `_screenBlit*`, `_displayRafId`,
  `_displaySuspendDepth`, `_quadBuf`, `_screenBuf`.
- **Связность:** читает превью трансформаций (С19), reveal заливов (С24), бумагу, камеру.
- **Свежесть:** 74 (62) — частичный показ §17.46, пауза показа §17.58.
  **Акварель: среднее** (`_runComposite`, `_display`).
- **Тесты:** `recompositeCache`, `suspendDisplay`, `tiledDisplay`, `tiledMipmaps`.
- **Сложность:** средняя-высокая. После С10 и после ветки.

### С24. Акварель: reveal, поле осадка, диффузия, сушка, settle, GPU-бюджет, мокрая бумага
- **Строки:** reveal `_revealWash`…`_drawTileReveal` 10830–11145 (без `_fieldOp`/
  `_waterFrontStep`/`_wcResample`: 10930–11052 — те сильно свежие); `_diffuseWashOps` (711!),
  `_groupTideOps` 11146–11943; `watercolorDryWash/All`, `setUnpaintedInBatch`,
  `_dryWashScratch`, `_flushLiveComposite`, `_startSettle`…`_completeSettle`,
  `_scheduleFieldRelease`, `_washGpuBytes`, `_enforceGpuBudget`, `_cancelSettle`,
  `_diffuseFieldFor` 11944–12287; `_clearWash`, `getWatercolorPerf`, `setWatercolorDebugView`,
  `setWatercolorAb` 4197–4271; мокрая бумага `_wetFromForeignStroke`, `_scheduleDryingRepaint`,
  `_updateWetTexture`, `_markPaperDamage`, `_damageScreenRect`, `_takePaperPartial`,
  `_composePaperToScreen` 13595–13903. **~2000.**
- **Поля:** `_washReveals`, `_revealTimer`, `_revealPool`, `_revealProg/Uni/PosLoc`,
  `_fieldOpProg/Uni`, `_resampleProg/Uni`, `_diffuseProg/Uni`, `_waterFrontProg/Uni`,
  `_settle`, `_liveComposite`, `_fieldCache`, `_fieldReleaseTimer`, `_wcPerf`, `_gpuBudget`,
  `settleBacklogMax`, `_paperWet`, `_wetTex`, `_wetRect`, `_wetTexAt`, `_wetShown`,
  `_wcDebugView`, `_dryingTimer`, `_paperDamage`, `_paperPartialOK`, `_paperCacheKey`.
- **Свежесть:** `_diffuseWashOps` 564/711, `_groupTideOps` 87/87, settle ≈ 200/345,
  мокрая бумага 94/310, reveal-часть (10830–10929, 11053–11145) — всего ~13 строк.
- **Акварель: сильное** (это она). **Сложность: высокая сейчас.** Когда #536 закроется —
  отдельный `src/watercolor/WashEngine` с `WashSettleScheduler`, `WetPaperView`,
  `WashReveal`; `RibbonStrokeScratch` туда же.

### С25. Пипетка и границы содержимого
- **Строки:** `pickColor`, `getContentBounds`, `tightenContentBounds`, `hasLayerContent`
  4323–4404. ~80. Свежесть 8 (8, «pickColor досчитывает отложенный показ»).
- **Тесты:** `tiledExport` (pickColor); e2e `eyedropper`. Мелочь; оставить.

---

## Сводка по размерам

| Шов | ≈ строк | Свежесть 14 дн. | Акварель | Сложность |
|---|---|---|---|---|
| С19 трансформ/выделение/заливка | 1100 + поля | 0 | нет | средняя-низкая |
| С15 смаж/микс | 420 | 40 (0) | нет | низкая |
| С16+С20′ картинка, фигуры, фильтр | 500 | 200 (0), в main | нет | низкая после С19 |
| С12 пресет/непрозрачность дабов | 235 | 0 | нет | низкая |
| С14 штамповщик | 315 | 0 | нет (1 строка `_initGL`) | низкая-средняя |
| С21 экспорт | 430 | 67 (0) | нет | средняя (нужен С10) |
| С10 камера | 430 | 5 | нет | средняя-высокая |
| С22 чужие штрихи | 250 | 16 (13) | слабое | средняя |
| С7 снапшоты | 325 | 44 (15) | слабое (ветка) | средняя |
| С5 merge/duplicate | 135 | 1 | нет | низкая, мало выгоды |
| С9 бумага | 290 | 18 | слабое | средняя |
| С18 цифровая кисть | 275 | 259 (#573-линия) | нет | средняя |
| С23 композит/показ | 760 | 74 (62) | среднее | средняя-высокая |
| С3 приём/лог/undo | 620 | 197 | сильное | высокая |
| С4 реплей/пересборка | 505 | 163 | сильное | высокая |
| С6 чекпойнты/заливы | 370 | 199 | сильное | высокая |
| С11 указатель/живой штрих | 850 | 97 | сильное (ветка) | высокая |
| С17 лента/акварель-мазок | 1520 | ~275 | сильное (ветка) | высокая |
| С24 акварель: осадок/сушка/мокрое | 2000 | ~950 | сильное | высокая |
| Ribbon*-классы модуля | 630 | 287 | сильное | низкая механически, ждёт |

Итого «безопасная» зона (нет акварели, есть тесты): С19 + С15 + С16/С20′ + С12 + С14 + С21
≈ **3000 строк** — пятая часть файла, без единого пересечения с `watercolor-feel`.

---

## Рекомендованный порядок

Критерии: нет перекрытия с акварелью → узкий вход → большой выигрыш в строках → хорошее
покрытие тестами. Каждый пункт — отдельное приземление, как требует #494.

### 1. С19 — `AreaOps`: трансформация слоя, выделение, вставка, заливка (~1150 строк)
Ноль свежих строк, ноль строк в ветке, ~1130 строк юнит-тестов + 7 e2e. Вход узкий: все
пиксельные операции уже имеют форму `(buf, op)`.

**Первый шаг (коммит 1 — примитивы проходов, ~200 строк):**
Новый файл `src/raster/blitPasses.ts`, класс `BlitPasses` (создаётся в `_initGL`,
пересоздаётся им же на restore — отдельной `forget()` не нужно):
- уезжают поля `_transformProg/_transformUni/_transformPosLoc`,
  `_areaTransformProg/_areaTransformUni/_areaTransformPosLoc`,
  `_areaMaskProg/_areaMaskUni/_areaMaskPosLoc` и их строки создания в `_initGL`;
- уезжают методы `_runTransformBlit` → `transform(source, matrixInv, dstW, dstH, fbo, blend)`,
  `_runAreaMaskPass` → `areaMask(...)`, `_runAreaTransformBlit` → `areaTransform(...)`;
- конструктор: `new BlitPasses(gl, screenBuf)`;
- в движке остаётся `private _passes!: BlitPasses`; 7 мест вызова `_runTransformBlit`
  (4742, 8699, 13419, 14094, 14493, 14675, 14781) становятся `this._passes.transform(...)`.
  `_blitProg` (картинка) пока остаётся — он общий с С16 и уедет во втором шаге.
- Проверка: `index.layerTransform`, `index.tiledTransform*`, `index.areaSelection`,
  `index.areaFill`, `src/raster/shaders.test.ts`, e2e `transformSeam`.

**Коммит 2 — `src/raster/AreaOps.ts`, класс `AreaOps`:**
- уезжают поля `_transformPreview`, `_areaPreviewLayers`, `_maskCache`,
  `_transformScratchPool` (+ `_acquireScratchBuf/_releaseScratchBuf`, у них нет других
  вызывающих), типы `PreviewTile`, `MaskTexture`, константа `INFINITE_FILL_MARGIN`,
  хелпер `unpremultiply`;
- уезжают методы 13972–14874 целиком и `previewLayerTransform`/`clearLayerTransformPreview`;
- контекст — узкий интерфейс, а не `this` движка:
  ```ts
  interface AreaOpsContext {
    gl: WebGLRenderingContext
    passes: BlitPasses
    layer(id: string): ILayerBuffer | undefined
    tileSize(): { w: number; h: number }
    pageSize(): { w: number; h: number }
    infinite: boolean
    displayOrder(): CompositeItem[]
    compositeTextures(items: Array<{ texture: WebGLTexture; opacity: number }>, fbo: WebGLFramebuffer, w: number, h: number): void
    pixelsToBlob(pixels: Uint8Array, w: number, h: number): Promise<Blob | null>
    requestDisplay(): void
  }
  ```
- наружу `AreaOps` отдаёт: `bakeLayerTransform(buf, wire)`, `bakeAreaTransform(buf, sel, wire)`,
  `clearArea(buf, sel)`, `drawImageThroughMatrix(...)` (для С16), `asImportRecord(op)`,
  публичные `previewLayerTransform`, `clearLayerTransformPreview`, `previewAreaTransform`,
  `previewAreaPaste`, `readAreaImage`, `computeAreaFill`; для композита — объект
  `previews: { get(id): PreviewTile[] | undefined; isArea(id): boolean; readonly size: number }`
  (его же пишут `previewShape`/`previewLayerFilter` до шага 3); `forget()`, `destroy()`.
- **что остаётся в движке:** публичные методы `PencilEngineAPI` — однострочные делегаты
  (`previewAreaPaste(...) { this._area.previewAreaPaste(...) }`), `case`-ветки обоих
  диспетчеров меняют только имя вызова. Сигнатуры API не меняются, стор не трогается, в
  `AreaOps` нет `window` (только `gl` и `AccumulationBuffer`).
- Поскольку `src/raster/` уже существует и описан в `map.yaml`, новый README не нужен —
  только строка в `src/raster/README.md`; `npm run map:check` / `map:rules` в CI.

### 2. С15 — `SmudgePainter`: растушёвка и смешивающая кисть (~420 строк)
Ноль строк акварели, вход — две строки в `_paintDabs`, выход — `_dropCarriedGestureState`,
`_dabWorldHalfExtents`, `destroy`, restore. Тесты `smudge` (468), `digitalBrush*`, e2e
`smudgeSeam`. Класс в `src/dabs/SmudgePainter.ts` с контекстом `{ gl, quadBuf, screenBuf,
paper: { tex, worldSize, fillThreshold, fillCap } }`; забирает свои программы из `_initGL`.

### 3. С16 + С20′ — картинка, фигуры, фильтр слоя (~500 строк)
После шага 1 у них готовы `BlitPasses` и `previews`. `ImageImport` (с `_imageCache` и
`_blitProg` → `BlitPasses.image`), `ShapePass` в `src/raster/`, `FilterPass` в `src/filters/`.
Ветки `case 'shape' | 'layer_filter' | 'image_import' | 'area_*'` станут однородными.
Пробел: юнит-теста движка на операцию `shape` нет — добавить до переноса
(и по правилу «регрессионный тест сперва краснеет» — он должен ловить поломку переноса,
например, проверять, что `shape` меняет содержимое слоя и уважает `isCovered`).

### 4. С12 + С14 — пресет/непрозрачность дабов и штамповщик (~550 строк)
`_bakeDabOpacity` и компания — чистые функции (`src/dabs/dabOpacity.ts`), затем
`StampPainter` (uniform + instanced, `_dabsWorldBounds`, `_dabWorldHalfExtents`).
Ноль свежих строк; покрытие — `charcoal`, `pencilTilt`, `dabBatching`, `dabSpacing`,
`tipFootprint`, `liner`, `brushSizeScale`. Единственное касание ветки — униформ
`u_rectComposite` в списке `_dabUni`: делать **после мержа watercolor-feel** или переносить
список униформ, оставив ему место. `_resolvePreset` оставить приватной обёрткой в движке —
ветка вызывает её из `_chunkSpanExceeded`.

### 5. С21 — `Exporter`: экспорт и миниатюра (~430 строк)
Акварели нет, #595 в main, тесты `tiledExport`, `bakePreview`, `strokeStreaming`.
Честный вынос требует сначала выделить из С10 значение `CameraFrame` (центр, масштаб,
угол), которое композит принимает аргументом, — тогда экспорт перестаёт мутировать
`_compositeCenterX/Y/_compositeScale`. Это и есть работа шага; `_pixelsToBlob` уезжает в
`src/export/` и оттуда же его берёт `AreaOps`.

### Дальше (не в топ-5)
6. С22 `PeerStrokes` (шов 3 из #494) — после сверки с #428 и мержа ветки (ветка/#536 правили
   `appendPeerLiveDabs`).
7. С7 `SnapshotIO` — после мержа ветки (она правит `absorbHistoricalOperations`).
8. С5 merge/duplicate, С9 `PaperState`, С10 камера целиком, С23 композит.
9. Всё акварельное (С17, С24, Ribbon*-классы, С6, С4) и `ToolStrategy` (С11, С13, С3) —
   только после закрытия #536; тогда первым — перенос `RibbonScratchPool`/`RibbonStrokeScratch`
   (уже отдельные классы, ~630 строк чистого `git mv`-подобного переноса).

## Ограничения, которые держит каждый шаг
- WebGL1: переносимые программы не меняются; ANGLE-инстансинг и `EXT_blend_minmax`
  передаются в контексте как есть. Помнить про «шейдеры — отдельные программы»: константа
  в чужой GLSL-программе ловится `shaders.test.ts`.
- Внутренности за фасадом: новые классы живут в `engine/src/**`, наружу только
  `PencilEngineAPI` из `engine/index.ts`; публичные сигнатуры не меняются.
- Стор никогда не источник истины: ни один шов не импортирует сторы (правило `map:rules`
  `engine-knows-no-app` проверит).
- Без DOM: в переносимом коде нет `window`/`document`; `HTMLImageElement` и `navigator`
  (только с `typeof`-гардом, как в `_gpuBudget`) — как сейчас. Прогонять именно
  vitest движка, не только `tsc`.
- Контекст-лосс: у каждого вынесенного класса `forget()` (бросить мёртвые GL-имена) и
  `destroy()` (удалить живые); `_handleContextRestored`/`destroy` зовут их. Пропущенный
  `forget()` = мёртвая текстура в первом жесте после restore (см. комментарий про `_maskCache`).
