# Unit-контракты: указатель источников

331 файл из исходников baseline, все перечислены ниже. Связь с acceptance указана только там, где она определена явно. Остальные — внутренние численные/служебные инварианты; не объявляются новыми пользовательскими кейсами или пройденными проверками. [Машинный индекс](unit-inventory.json) сохраняетSHA и буквальные названия тестов (неполный AST-discovery, не счётчик всех тестов).

Запуск конкретного файла: `npx vitest run <путь> --maxWorkers=1`; [предусловия](execution.md#специальные-и-unit-проверки). Server suites могут требовать отдельной PostgreSQL/схемы. MockGL не рисует pixels, unit никогда не заменяет GPU.

| Unit-файл | Прямая поддержка acceptance |
|---|---|
| [apps/web/src/components/ColorPicker/modes/ringGeometry.test.ts](../../../apps/web/src/components/ColorPicker/modes/ringGeometry.test.ts) | [QA-515](historical.md#qa-515) |
| [apps/web/src/components/ColorPicker/modes/triangleGeometry.test.ts](../../../apps/web/src/components/ColorPicker/modes/triangleGeometry.test.ts) | [QA-515](historical.md#qa-515) |
| [apps/web/src/components/FilterPanel/filterDraft.test.ts](../../../apps/web/src/components/FilterPanel/filterDraft.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/components/FloatingToolPanel/colorFlyout.test.ts](../../../apps/web/src/components/FloatingToolPanel/colorFlyout.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/components/FloatingToolPanel/panelPosition.test.ts](../../../apps/web/src/components/FloatingToolPanel/panelPosition.test.ts) | [QA-518](historical.md#qa-518) |
| [apps/web/src/components/FloatingToolPanel/slots.test.ts](../../../apps/web/src/components/FloatingToolPanel/slots.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/components/LayerPanel/drawerColors.test.ts](../../../apps/web/src/components/LayerPanel/drawerColors.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/components/LayerPanel/duplicate.test.ts](../../../apps/web/src/components/LayerPanel/duplicate.test.ts) | [QA-451](historical.md#qa-451) |
| [apps/web/src/components/LayerPanel/flatList.test.ts](../../../apps/web/src/components/LayerPanel/flatList.test.ts) | [QA-441](historical.md#qa-441), [QA-442](historical.md#qa-442) |
| [apps/web/src/components/LayerPanel/selection.test.ts](../../../apps/web/src/components/LayerPanel/selection.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/components/OptionGroup/optionGroupKeys.test.ts](../../../apps/web/src/components/OptionGroup/optionGroupKeys.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/components/OptionPicker/optionCurveGraph.test.ts](../../../apps/web/src/components/OptionPicker/optionCurveGraph.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/components/PrecisionSlider/precisionSlider.test.ts](../../../apps/web/src/components/PrecisionSlider/precisionSlider.test.ts) | [QA-511](historical.md#qa-511), [QA-593](historical.md#qa-593) |
| [apps/web/src/components/ToolSetPicker/toolRoster.test.ts](../../../apps/web/src/components/ToolSetPicker/toolRoster.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/checkpointPrefix.test.ts](../../../apps/web/src/engine/checkpointPrefix.test.ts) | [QA-487](historical.md#qa-487) |
| [apps/web/src/engine/index.areaClearCoarse.test.ts](../../../apps/web/src/engine/index.areaClearCoarse.test.ts) | [QA-504](historical.md#qa-504), [QA-505](historical.md#qa-505) |
| [apps/web/src/engine/index.areaFill.test.ts](../../../apps/web/src/engine/index.areaFill.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.areaSelection.test.ts](../../../apps/web/src/engine/index.areaSelection.test.ts) | [QA-505](historical.md#qa-505) |
| [apps/web/src/engine/index.asyncFailureMaterial.test.ts](../../../apps/web/src/engine/index.asyncFailureMaterial.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.asyncWatercolor.test.ts](../../../apps/web/src/engine/index.asyncWatercolor.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.bakePreview.test.ts](../../../apps/web/src/engine/index.bakePreview.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.brushSizeScale.test.ts](../../../apps/web/src/engine/index.brushSizeScale.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.charcoal.test.ts](../../../apps/web/src/engine/index.charcoal.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.checkpointUnrecordedInk.test.ts](../../../apps/web/src/engine/index.checkpointUnrecordedInk.test.ts) | [QA-487](historical.md#qa-487) |
| [apps/web/src/engine/index.codecPrecision.test.ts](../../../apps/web/src/engine/index.codecPrecision.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.contextRestore.test.ts](../../../apps/web/src/engine/index.contextRestore.test.ts) | [QA-508](historical.md#qa-508) |
| [apps/web/src/engine/index.continuationGpuFence.test.ts](../../../apps/web/src/engine/index.continuationGpuFence.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.coverageFilm.test.ts](../../../apps/web/src/engine/index.coverageFilm.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.dabBatching.test.ts](../../../apps/web/src/engine/index.dabBatching.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.dabSpacing.test.ts](../../../apps/web/src/engine/index.dabSpacing.test.ts) | [QA-455](historical.md#qa-455), [QA-459](historical.md#qa-459) |
| [apps/web/src/engine/index.digitalBrush.test.ts](../../../apps/web/src/engine/index.digitalBrush.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.digitalBrushStamp.test.ts](../../../apps/web/src/engine/index.digitalBrushStamp.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.displayFilter.test.ts](../../../apps/web/src/engine/index.displayFilter.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.emptySnapshotRetry.test.ts](../../../apps/web/src/engine/index.emptySnapshotRetry.test.ts) | [QA-486](historical.md#qa-486) |
| [apps/web/src/engine/index.eraseThroughLayers.test.ts](../../../apps/web/src/engine/index.eraseThroughLayers.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.expeditedDry.test.ts](../../../apps/web/src/engine/index.expeditedDry.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.gradientFibres.test.ts](../../../apps/web/src/engine/index.gradientFibres.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.imageImport.test.ts](../../../apps/web/src/engine/index.imageImport.test.ts) | [QA-466](historical.md#qa-466), [QA-467](historical.md#qa-467), [QA-597](historical.md#qa-597) |
| [apps/web/src/engine/index.joinedDeferredFinish.test.ts](../../../apps/web/src/engine/index.joinedDeferredFinish.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.joinedTouch.test.ts](../../../apps/web/src/engine/index.joinedTouch.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.layerDuplicate.test.ts](../../../apps/web/src/engine/index.layerDuplicate.test.ts) | [QA-451](historical.md#qa-451), [QA-561](historical.md#qa-561), [QA-562](historical.md#qa-562) |
| [apps/web/src/engine/index.layerFilter.test.ts](../../../apps/web/src/engine/index.layerFilter.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.layerTransform.test.ts](../../../apps/web/src/engine/index.layerTransform.test.ts) | [QA-468](historical.md#qa-468), [QA-469](historical.md#qa-469), [QA-597](historical.md#qa-597) |
| [apps/web/src/engine/index.liner.test.ts](../../../apps/web/src/engine/index.liner.test.ts) | [QA-456](historical.md#qa-456) |
| [apps/web/src/engine/index.marker.test.ts](../../../apps/web/src/engine/index.marker.test.ts) | [QA-460](historical.md#qa-460), [QA-461](historical.md#qa-461), [QA-462](historical.md#qa-462), [QA-551](historical.md#qa-551), [QA-552](historical.md#qa-552) |
| [apps/web/src/engine/index.materialPresentation.test.ts](../../../apps/web/src/engine/index.materialPresentation.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.networkSnapshot.test.ts](../../../apps/web/src/engine/index.networkSnapshot.test.ts) | [QA-482](historical.md#qa-482) |
| [apps/web/src/engine/index.networkedUndoRedo.test.ts](../../../apps/web/src/engine/index.networkedUndoRedo.test.ts) | [QA-453](historical.md#qa-453), [QA-466](historical.md#qa-466), [QA-479](historical.md#qa-479) |
| [apps/web/src/engine/index.paperDamage.test.ts](../../../apps/web/src/engine/index.paperDamage.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.paperMipmaps.test.ts](../../../apps/web/src/engine/index.paperMipmaps.test.ts) | [QA-474](historical.md#qa-474) |
| [apps/web/src/engine/index.paperTexture.test.ts](../../../apps/web/src/engine/index.paperTexture.test.ts) | [QA-473](historical.md#qa-473), [QA-474](historical.md#qa-474), [QA-475](historical.md#qa-475), [QA-476](historical.md#qa-476) |
| [apps/web/src/engine/index.parkedWash.test.ts](../../../apps/web/src/engine/index.parkedWash.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.peerLiveStroke.test.ts](../../../apps/web/src/engine/index.peerLiveStroke.test.ts) | [QA-465](historical.md#qa-465), [QA-566](historical.md#qa-566) |
| [apps/web/src/engine/index.peerPreviewFrames.test.ts](../../../apps/web/src/engine/index.peerPreviewFrames.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.pencilTilt.test.ts](../../../apps/web/src/engine/index.pencilTilt.test.ts) | [QA-458](historical.md#qa-458) |
| [apps/web/src/engine/index.rebuildSpill.test.ts](../../../apps/web/src/engine/index.rebuildSpill.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.recompositeCache.test.ts](../../../apps/web/src/engine/index.recompositeCache.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.replayCost.test.ts](../../../apps/web/src/engine/index.replayCost.test.ts) | [QA-546](historical.md#qa-546) |
| [apps/web/src/engine/index.restoredBaseLayers.test.ts](../../../apps/web/src/engine/index.restoredBaseLayers.test.ts) | [QA-446](historical.md#qa-446), [QA-479](historical.md#qa-479) |
| [apps/web/src/engine/index.revivedLayer.test.ts](../../../apps/web/src/engine/index.revivedLayer.test.ts) | [QA-446](historical.md#qa-446) |
| [apps/web/src/engine/index.ribbonPressure.test.ts](../../../apps/web/src/engine/index.ribbonPressure.test.ts) | [QA-548](historical.md#qa-548) |
| [apps/web/src/engine/index.ribbonReplayRebuild.test.ts](../../../apps/web/src/engine/index.ribbonReplayRebuild.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.ruler.test.ts](../../../apps/web/src/engine/index.ruler.test.ts) | [QA-594](historical.md#qa-594) |
| [apps/web/src/engine/index.settle.test.ts](../../../apps/web/src/engine/index.settle.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.settlePlanLifetime.test.ts](../../../apps/web/src/engine/index.settlePlanLifetime.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.shape.test.ts](../../../apps/web/src/engine/index.shape.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.smudge.test.ts](../../../apps/web/src/engine/index.smudge.test.ts) | [QA-464](historical.md#qa-464) |
| [apps/web/src/engine/index.snapshotCoverage.test.ts](../../../apps/web/src/engine/index.snapshotCoverage.test.ts) | [QA-570](historical.md#qa-570) |
| [apps/web/src/engine/index.snapshotDirty.test.ts](../../../apps/web/src/engine/index.snapshotDirty.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.strokeChunking.test.ts](../../../apps/web/src/engine/index.strokeChunking.test.ts) | [QA-457](historical.md#qa-457), [QA-463](historical.md#qa-463), [QA-556](historical.md#qa-556) |
| [apps/web/src/engine/index.strokeStreaming.test.ts](../../../apps/web/src/engine/index.strokeStreaming.test.ts) | [QA-457](historical.md#qa-457), [QA-463](historical.md#qa-463), [QA-567](historical.md#qa-567) |
| [apps/web/src/engine/index.structuralSnapshot.test.ts](../../../apps/web/src/engine/index.structuralSnapshot.test.ts) | [QA-446](historical.md#qa-446), [QA-480](historical.md#qa-480), [QA-484](historical.md#qa-484) |
| [apps/web/src/engine/index.structuralUndo.test.ts](../../../apps/web/src/engine/index.structuralUndo.test.ts) | [QA-444](historical.md#qa-444), [QA-445](historical.md#qa-445), [QA-467](historical.md#qa-467) |
| [apps/web/src/engine/index.structuralUndoRedoPeek.test.ts](../../../apps/web/src/engine/index.structuralUndoRedoPeek.test.ts) | [QA-546](historical.md#qa-546) |
| [apps/web/src/engine/index.suspendDisplay.test.ts](../../../apps/web/src/engine/index.suspendDisplay.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.tiledCheckpoint.test.ts](../../../apps/web/src/engine/index.tiledCheckpoint.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.tiledDisplay.test.ts](../../../apps/web/src/engine/index.tiledDisplay.test.ts) | [QA-473](historical.md#qa-473), [QA-501](historical.md#qa-501), [QA-503](historical.md#qa-503) |
| [apps/web/src/engine/index.tiledEviction.test.ts](../../../apps/web/src/engine/index.tiledEviction.test.ts) | [QA-507](historical.md#qa-507) |
| [apps/web/src/engine/index.tiledExport.test.ts](../../../apps/web/src/engine/index.tiledExport.test.ts) | [QA-502](historical.md#qa-502) |
| [apps/web/src/engine/index.tiledMipmaps.test.ts](../../../apps/web/src/engine/index.tiledMipmaps.test.ts) | [QA-503](historical.md#qa-503), [QA-504](historical.md#qa-504), [QA-558](historical.md#qa-558) |
| [apps/web/src/engine/index.tiledPreview.test.ts](../../../apps/web/src/engine/index.tiledPreview.test.ts) | [QA-465](historical.md#qa-465), [QA-558](historical.md#qa-558) |
| [apps/web/src/engine/index.tiledStroke.test.ts](../../../apps/web/src/engine/index.tiledStroke.test.ts) | [QA-502](historical.md#qa-502), [QA-506](historical.md#qa-506), [QA-508](historical.md#qa-508) |
| [apps/web/src/engine/index.tiledTransform.test.ts](../../../apps/web/src/engine/index.tiledTransform.test.ts) | [QA-468](historical.md#qa-468) |
| [apps/web/src/engine/index.tiledTransformPreview.test.ts](../../../apps/web/src/engine/index.tiledTransformPreview.test.ts) | [QA-470](historical.md#qa-470), [QA-471](historical.md#qa-471) |
| [apps/web/src/engine/index.tiledTransformSeams.test.ts](../../../apps/web/src/engine/index.tiledTransformSeams.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.tipFootprint.test.ts](../../../apps/web/src/engine/index.tipFootprint.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.trueOrder.test.ts](../../../apps/web/src/engine/index.trueOrder.test.ts) | [QA-453](historical.md#qa-453), [QA-561](historical.md#qa-561) |
| [apps/web/src/engine/index.watercolor.test.ts](../../../apps/web/src/engine/index.watercolor.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.watercolorCoarseSettle.test.ts](../../../apps/web/src/engine/index.watercolorCoarseSettle.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.watercolorTransientPreview.test.ts](../../../apps/web/src/engine/index.watercolorTransientPreview.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.wetSnapshot.test.ts](../../../apps/web/src/engine/index.wetSnapshot.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/index.zeroContactRepair.test.ts](../../../apps/web/src/engine/index.zeroContactRepair.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/buffers/AccumulationBuffer.clippedRestore.test.ts](../../../apps/web/src/engine/src/buffers/AccumulationBuffer.clippedRestore.test.ts) | [QA-483](historical.md#qa-483) |
| [apps/web/src/engine/src/buffers/AccumulationBuffer.mipmaps.test.ts](../../../apps/web/src/engine/src/buffers/AccumulationBuffer.mipmaps.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/buffers/AccumulationBuffer.snapshotRegion.test.ts](../../../apps/web/src/engine/src/buffers/AccumulationBuffer.snapshotRegion.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/buffers/TiledLayerBuffer.coarse.test.ts](../../../apps/web/src/engine/src/buffers/TiledLayerBuffer.coarse.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/buffers/TiledLayerBuffer.eviction.test.ts](../../../apps/web/src/engine/src/buffers/TiledLayerBuffer.eviction.test.ts) | [QA-507](historical.md#qa-507) |
| [apps/web/src/engine/src/buffers/TiledLayerBuffer.test.ts](../../../apps/web/src/engine/src/buffers/TiledLayerBuffer.test.ts) | [QA-506](historical.md#qa-506) |
| [apps/web/src/engine/src/buffers/pinnedTiles.test.ts](../../../apps/web/src/engine/src/buffers/pinnedTiles.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/buffers/retileSnapshot.clipped.test.ts](../../../apps/web/src/engine/src/buffers/retileSnapshot.clipped.test.ts) | [QA-483](historical.md#qa-483) |
| [apps/web/src/engine/src/buffers/retileSnapshot.test.ts](../../../apps/web/src/engine/src/buffers/retileSnapshot.test.ts) | [QA-482](historical.md#qa-482) |
| [apps/web/src/engine/src/buffers/scratchPools.test.ts](../../../apps/web/src/engine/src/buffers/scratchPools.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/buffers/tileMath.test.ts](../../../apps/web/src/engine/src/buffers/tileMath.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/dabs/DabSystem.test.ts](../../../apps/web/src/engine/src/dabs/DabSystem.test.ts) | [QA-454](historical.md#qa-454), [QA-455](historical.md#qa-455) |
| [apps/web/src/engine/src/dabs/RibbonStrokePainter.sourceCopySlices.test.ts](../../../apps/web/src/engine/src/dabs/RibbonStrokePainter.sourceCopySlices.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/dabs/RibbonStrokePainter.waterSource.test.ts](../../../apps/web/src/engine/src/dabs/RibbonStrokePainter.waterSource.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/dabs/flexibleHairline.test.ts](../../../apps/web/src/engine/src/dabs/flexibleHairline.test.ts) | [QA-548](historical.md#qa-548) |
| [apps/web/src/engine/src/dabs/markerInkGain.test.ts](../../../apps/web/src/engine/src/dabs/markerInkGain.test.ts) | [QA-462](historical.md#qa-462) |
| [apps/web/src/engine/src/dabs/markerRibbon.test.ts](../../../apps/web/src/engine/src/dabs/markerRibbon.test.ts) | [QA-460](historical.md#qa-460), [QA-461](historical.md#qa-461), [QA-551](historical.md#qa-551), [QA-552](historical.md#qa-552), [QA-553](historical.md#qa-553) |
| [apps/web/src/engine/src/dabs/ribbonBandBatch.test.ts](../../../apps/web/src/engine/src/dabs/ribbonBandBatch.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/dabs/ribbonDeliveryPreparation.test.ts](../../../apps/web/src/engine/src/dabs/ribbonDeliveryPreparation.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/filters/layerFilters.test.ts](../../../apps/web/src/engine/src/filters/layerFilters.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/input/PointerInput.ownership.test.ts](../../../apps/web/src/engine/src/input/PointerInput.ownership.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/input/PointerInput.pressure.test.ts](../../../apps/web/src/engine/src/input/PointerInput.pressure.test.ts) | [QA-549](historical.md#qa-549), [QA-592](historical.md#qa-592) |
| [apps/web/src/engine/src/input/PointerInput.speed.test.ts](../../../apps/web/src/engine/src/input/PointerInput.speed.test.ts) | [QA-456](historical.md#qa-456), [QA-545](historical.md#qa-545) |
| [apps/web/src/engine/src/input/PointerInput.touchDefault.test.ts](../../../apps/web/src/engine/src/input/PointerInput.touchDefault.test.ts) | [QA-549](historical.md#qa-549) |
| [apps/web/src/engine/src/input/rulerSnap.test.ts](../../../apps/web/src/engine/src/input/rulerSnap.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/oplog/OperationLog.test.ts](../../../apps/web/src/engine/src/oplog/OperationLog.test.ts) | [QA-495](historical.md#qa-495) |
| [apps/web/src/engine/src/oplog/checkpointStore.test.ts](../../../apps/web/src/engine/src/oplog/checkpointStore.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/oplog/gzip.test.ts](../../../apps/web/src/engine/src/oplog/gzip.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/oplog/hasActiveWater.test.ts](../../../apps/web/src/engine/src/oplog/hasActiveWater.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/oplog/snapshotCodec.test.ts](../../../apps/web/src/engine/src/oplog/snapshotCodec.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/oplog/snapshotLedger.test.ts](../../../apps/web/src/engine/src/oplog/snapshotLedger.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/paper/paperAssets.test.ts](../../../apps/web/src/engine/src/paper/paperAssets.test.ts) | [QA-475](historical.md#qa-475), [QA-476](historical.md#qa-476), [QA-521](historical.md#qa-521) |
| [apps/web/src/engine/src/paper/paperLoader.test.ts](../../../apps/web/src/engine/src/paper/paperLoader.test.ts) | [QA-477](historical.md#qa-477), [QA-478](historical.md#qa-478) |
| [apps/web/src/engine/src/paper/paperWetness.test.ts](../../../apps/web/src/engine/src/paper/paperWetness.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/paper/wetOverlayPixels.test.ts](../../../apps/web/src/engine/src/paper/wetOverlayPixels.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/presets/brushPenTip.test.ts](../../../apps/web/src/engine/src/presets/brushPenTip.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/presets/charcoalFeel.test.ts](../../../apps/web/src/engine/src/presets/charcoalFeel.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/presets/charcoalPresets.test.ts](../../../apps/web/src/engine/src/presets/charcoalPresets.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/presets/dabShapingCycle.test.ts](../../../apps/web/src/engine/src/presets/dabShapingCycle.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/presets/digitalBrushPresets.test.ts](../../../apps/web/src/engine/src/presets/digitalBrushPresets.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/presets/linerPresets.test.ts](../../../apps/web/src/engine/src/presets/linerPresets.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/presets/markerPresets.test.ts](../../../apps/web/src/engine/src/presets/markerPresets.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/presets/pencilPresets.test.ts](../../../apps/web/src/engine/src/presets/pencilPresets.test.ts) | [QA-459](historical.md#qa-459) |
| [apps/web/src/engine/src/presets/pencilTilt.test.ts](../../../apps/web/src/engine/src/presets/pencilTilt.test.ts) | [QA-458](historical.md#qa-458) |
| [apps/web/src/engine/src/presets/tiltCurve.test.ts](../../../apps/web/src/engine/src/presets/tiltCurve.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/presets/tiltMath.test.ts](../../../apps/web/src/engine/src/presets/tiltMath.test.ts) | [QA-458](historical.md#qa-458) |
| [apps/web/src/engine/src/presets/tipMasks.test.ts](../../../apps/web/src/engine/src/presets/tipMasks.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/presets/watercolorDwell.test.ts](../../../apps/web/src/engine/src/presets/watercolorDwell.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/presets/watercolorLift.test.ts](../../../apps/web/src/engine/src/presets/watercolorLift.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/presets/watercolorPresets.test.ts](../../../apps/web/src/engine/src/presets/watercolorPresets.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/Camera.test.ts](../../../apps/web/src/engine/src/raster/Camera.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/GpuBudgetFence.test.ts](../../../apps/web/src/engine/src/raster/GpuBudgetFence.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/LayerCompositor.materialPresentation.test.ts](../../../apps/web/src/engine/src/raster/LayerCompositor.materialPresentation.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/WatercolorSettlePlan.test.ts](../../../apps/web/src/engine/src/raster/WatercolorSettlePlan.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/cameraFrame.test.ts](../../../apps/web/src/engine/src/raster/cameraFrame.test.ts) | [QA-501](historical.md#qa-501) |
| [apps/web/src/engine/src/raster/floodFill.test.ts](../../../apps/web/src/engine/src/raster/floodFill.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/matrix.test.ts](../../../apps/web/src/engine/src/raster/matrix.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/previewChain.test.ts](../../../apps/web/src/engine/src/raster/previewChain.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/selectionMask.test.ts](../../../apps/web/src/engine/src/raster/selectionMask.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/shaders.diffusionGate.test.ts](../../../apps/web/src/engine/src/raster/shaders.diffusionGate.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/shaders.test.ts](../../../apps/web/src/engine/src/raster/shaders.test.ts) | [QA-557](historical.md#qa-557) |
| [apps/web/src/engine/src/raster/shapeGeometry.test.ts](../../../apps/web/src/engine/src/raster/shapeGeometry.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/washReveal.test.ts](../../../apps/web/src/engine/src/raster/washReveal.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/zeroCostFaceFlux.test.ts](../../../apps/web/src/engine/src/raster/zeroCostFaceFlux.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/zeroCostFacePrograms.test.ts](../../../apps/web/src/engine/src/raster/zeroCostFacePrograms.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/raster/zeroCostFaceShader.test.ts](../../../apps/web/src/engine/src/raster/zeroCostFaceShader.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/WatercolorCanonicalFIFO.test.ts](../../../apps/web/src/engine/src/watercolor/WatercolorCanonicalFIFO.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/WatercolorContactBudget.test.ts](../../../apps/web/src/engine/src/watercolor/WatercolorContactBudget.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/WatercolorPresentationOwners.test.ts](../../../apps/web/src/engine/src/watercolor/WatercolorPresentationOwners.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/WatercolorPresentationRaster.test.ts](../../../apps/web/src/engine/src/watercolor/WatercolorPresentationRaster.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/WatercolorSettleQueue.test.ts](../../../apps/web/src/engine/src/watercolor/WatercolorSettleQueue.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/brushDrag.test.ts](../../../apps/web/src/engine/src/watercolor/brushDrag.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/brushDragEarlyZero.test.ts](../../../apps/web/src/engine/src/watercolor/brushDragEarlyZero.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/brushDragFieldWork.test.ts](../../../apps/web/src/engine/src/watercolor/brushDragFieldWork.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/canonicalRadius.test.ts](../../../apps/web/src/engine/src/watercolor/canonicalRadius.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/foreignWater.test.ts](../../../apps/web/src/engine/src/watercolor/foreignWater.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/foreignWaterSourceStart.test.ts](../../../apps/web/src/engine/src/watercolor/foreignWaterSourceStart.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/gradientFibres.test.ts](../../../apps/web/src/engine/src/watercolor/gradientFibres.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/pigmentOptics.test.ts](../../../apps/web/src/engine/src/watercolor/pigmentOptics.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/pureWaterLayerProof.test.ts](../../../apps/web/src/engine/src/watercolor/pureWaterLayerProof.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/solventSource.test.ts](../../../apps/web/src/engine/src/watercolor/solventSource.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/waterFront.test.ts](../../../apps/web/src/engine/src/watercolor/waterFront.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/wetBloom.test.ts](../../../apps/web/src/engine/src/watercolor/wetBloom.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/src/watercolor/wetDiffusion.test.ts](../../../apps/web/src/engine/src/watercolor/wetDiffusion.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/engine/testing/smoke.test.ts](../../../apps/web/src/engine/testing/smoke.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/i18n/core/i18n.test.ts](../../../apps/web/src/i18n/core/i18n.test.ts) | [QA-523](historical.md#qa-523) |
| [apps/web/src/icons/iconFont.test.ts](../../../apps/web/src/icons/iconFont.test.ts) | [QA-520](historical.md#qa-520), [QA-522](historical.md#qa-522) |
| [apps/web/src/lib/annotations/annotations.test.ts](../../../apps/web/src/lib/annotations/annotations.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/lib/annotations/reviewHistory.test.ts](../../../apps/web/src/lib/annotations/reviewHistory.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/lib/api/api.test.ts](../../../apps/web/src/lib/api/api.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/lib/api/shareRoom.test.ts](../../../apps/web/src/lib/api/shareRoom.test.ts) | [QA-582](historical.md#qa-582) |
| [apps/web/src/lib/boards/boards.test.ts](../../../apps/web/src/lib/boards/boards.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/lib/boards/classMode.test.ts](../../../apps/web/src/lib/boards/classMode.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/lib/browser/appVersion.test.ts](../../../apps/web/src/lib/browser/appVersion.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/lib/browser/backNavigationGuard.test.ts](../../../apps/web/src/lib/browser/backNavigationGuard.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/lib/browser/clipboardStorage.test.ts](../../../apps/web/src/lib/browser/clipboardStorage.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/lib/browser/deviceType.test.ts](../../../apps/web/src/lib/browser/deviceType.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/lib/browser/fullscreen.test.ts](../../../apps/web/src/lib/browser/fullscreen.test.ts) | [QA-516](historical.md#qa-516) |
| [apps/web/src/lib/browser/reloadSafety.test.ts](../../../apps/web/src/lib/browser/reloadSafety.test.ts) | [QA-472](historical.md#qa-472), [QA-527](historical.md#qa-527) |
| [apps/web/src/lib/browser/roomStorage.test.ts](../../../apps/web/src/lib/browser/roomStorage.test.ts) | [QA-452](historical.md#qa-452), [QA-491](historical.md#qa-491) |
| [apps/web/src/lib/browser/uiPreferences.test.ts](../../../apps/web/src/lib/browser/uiPreferences.test.ts) | [QA-512](historical.md#qa-512), [QA-523](historical.md#qa-523) |
| [apps/web/src/lib/browser/webgl.test.ts](../../../apps/web/src/lib/browser/webgl.test.ts) | [QA-478](historical.md#qa-478), [QA-554](historical.md#qa-554), [QA-557](historical.md#qa-557) |
| [apps/web/src/lib/input/angles.test.ts](../../../apps/web/src/lib/input/angles.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/lib/input/hotkeys.test.ts](../../../apps/web/src/lib/input/hotkeys.test.ts) | [QA-525](historical.md#qa-525) |
| [apps/web/src/lib/input/popupPlacement.test.ts](../../../apps/web/src/lib/input/popupPlacement.test.ts) | [QA-516](historical.md#qa-516), [QA-517](historical.md#qa-517), [QA-519](historical.md#qa-519) |
| [apps/web/src/lib/input/pressureCalibration.test.ts](../../../apps/web/src/lib/input/pressureCalibration.test.ts) | [QA-592](historical.md#qa-592) |
| [apps/web/src/lib/input/useDragToAdjust.test.ts](../../../apps/web/src/lib/input/useDragToAdjust.test.ts) | [QA-511](historical.md#qa-511) |
| [apps/web/src/lib/input/useDraggablePosition.test.ts](../../../apps/web/src/lib/input/useDraggablePosition.test.ts) | [QA-514](historical.md#qa-514), [QA-518](historical.md#qa-518) |
| [apps/web/src/lib/layers/layers.test.ts](../../../apps/web/src/lib/layers/layers.test.ts) | [QA-441](historical.md#qa-441), [QA-442](historical.md#qa-442), [QA-443](historical.md#qa-443), [QA-444](historical.md#qa-444), [QA-445](historical.md#qa-445), [QA-448](historical.md#qa-448) |
| [apps/web/src/lib/observability/debugTools.test.ts](../../../apps/web/src/lib/observability/debugTools.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/lib/observability/liveLatency.test.ts](../../../apps/web/src/lib/observability/liveLatency.test.ts) | [QA-545](historical.md#qa-545) |
| [apps/web/src/lib/observability/reportInvariant.test.ts](../../../apps/web/src/lib/observability/reportInvariant.test.ts) | [QA-538](historical.md#qa-538), [QA-550](historical.md#qa-550) |
| [apps/web/src/lib/observability/sentry.test.ts](../../../apps/web/src/lib/observability/sentry.test.ts) | [QA-538](historical.md#qa-538) |
| [apps/web/src/lib/sound/pencilSoundV3/Variant3Synth.test.ts](../../../apps/web/src/lib/sound/pencilSoundV3/Variant3Synth.test.ts) | [QA-596](historical.md#qa-596) |
| [apps/web/src/lib/tools/numberInput.test.ts](../../../apps/web/src/lib/tools/numberInput.test.ts) | [QA-593](historical.md#qa-593) |
| [apps/web/src/lib/tools/sliderScale.test.ts](../../../apps/web/src/lib/tools/sliderScale.test.ts) | [QA-593](historical.md#qa-593) |
| [apps/web/src/lib/tools/toolSchemas.test.ts](../../../apps/web/src/lib/tools/toolSchemas.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/lib/tools/toolTypeImages.test.ts](../../../apps/web/src/lib/tools/toolTypeImages.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/lib/transform/transformMath.test.ts](../../../apps/web/src/lib/transform/transformMath.test.ts) | [QA-469](historical.md#qa-469), [QA-470](historical.md#qa-470) |
| [apps/web/src/pages/Room/clearedInBatch.test.ts](../../../apps/web/src/pages/Room/clearedInBatch.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/diagnostics/joinedFinishDeferredQa.test.ts](../../../apps/web/src/pages/Room/diagnostics/joinedFinishDeferredQa.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/diagnostics/joinedTouchQa.test.ts](../../../apps/web/src/pages/Room/diagnostics/joinedTouchQa.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/diagnostics/openTiming.test.ts](../../../apps/web/src/pages/Room/diagnostics/openTiming.test.ts) | [QA-547](historical.md#qa-547) |
| [apps/web/src/pages/Room/diagnostics/restoreReport.test.ts](../../../apps/web/src/pages/Room/diagnostics/restoreReport.test.ts) | [QA-482](historical.md#qa-482), [QA-550](historical.md#qa-550) |
| [apps/web/src/pages/Room/diagnostics/saveOpen.test.ts](../../../apps/web/src/pages/Room/diagnostics/saveOpen.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/editing/activeLayer.test.ts](../../../apps/web/src/pages/Room/editing/activeLayer.test.ts) | [QA-448](historical.md#qa-448), [QA-449](historical.md#qa-449), [QA-450](historical.md#qa-450), [QA-452](historical.md#qa-452) |
| [apps/web/src/pages/Room/editing/pastePlacement.test.ts](../../../apps/web/src/pages/Room/editing/pastePlacement.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/engineNetwork.test.ts](../../../apps/web/src/pages/Room/engineNetwork.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/engineWiring.test.ts](../../../apps/web/src/pages/Room/engineWiring.test.ts) | [QA-432](historical.md#qa-432) |
| [apps/web/src/pages/Room/gestures/clickTracker.test.ts](../../../apps/web/src/pages/Room/gestures/clickTracker.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/gestures/drawingIndicator.test.ts](../../../apps/web/src/pages/Room/gestures/drawingIndicator.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/gestures/rulerGesture.test.ts](../../../apps/web/src/pages/Room/gestures/rulerGesture.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/gestures/selectionGesture.test.ts](../../../apps/web/src/pages/Room/gestures/selectionGesture.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/gestures/tapSequence.test.ts](../../../apps/web/src/pages/Room/gestures/tapSequence.test.ts) | [QA-512](historical.md#qa-512) |
| [apps/web/src/pages/Room/gestures/tapTracker.test.ts](../../../apps/web/src/pages/Room/gestures/tapTracker.test.ts) | [QA-472](historical.md#qa-472) |
| [apps/web/src/pages/Room/net/boardEvents.test.ts](../../../apps/web/src/pages/Room/net/boardEvents.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/catchUp.test.ts](../../../apps/web/src/pages/Room/net/catchUp.test.ts) | [QA-500](historical.md#qa-500) |
| [apps/web/src/pages/Room/net/confirmedStream.test.ts](../../../apps/web/src/pages/Room/net/confirmedStream.test.ts) | [QA-495](historical.md#qa-495) |
| [apps/web/src/pages/Room/net/connectionNotice.test.ts](../../../apps/web/src/pages/Room/net/connectionNotice.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/cursorThrottle.test.ts](../../../apps/web/src/pages/Room/net/cursorThrottle.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/deferredOps.test.ts](../../../apps/web/src/pages/Room/net/deferredOps.test.ts) | [QA-492](historical.md#qa-492) |
| [apps/web/src/pages/Room/net/joinError.test.ts](../../../apps/web/src/pages/Room/net/joinError.test.ts) | [QA-498](historical.md#qa-498) |
| [apps/web/src/pages/Room/net/joinFlow.test.ts](../../../apps/web/src/pages/Room/net/joinFlow.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/joinQueue.test.ts](../../../apps/web/src/pages/Room/net/joinQueue.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/lostWork.test.ts](../../../apps/web/src/pages/Room/net/lostWork.test.ts) | [QA-496](historical.md#qa-496) |
| [apps/web/src/pages/Room/net/optimism.test.ts](../../../apps/web/src/pages/Room/net/optimism.test.ts) | [QA-471](historical.md#qa-471) |
| [apps/web/src/pages/Room/net/outbox.test.ts](../../../apps/web/src/pages/Room/net/outbox.test.ts) | [QA-491](historical.md#qa-491), [QA-492](historical.md#qa-492) |
| [apps/web/src/pages/Room/net/outboxVerdict.test.ts](../../../apps/web/src/pages/Room/net/outboxVerdict.test.ts) | [QA-493](historical.md#qa-493), [QA-496](historical.md#qa-496) |
| [apps/web/src/pages/Room/net/peerEvents.test.ts](../../../apps/web/src/pages/Room/net/peerEvents.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/pendingPreviews.test.ts](../../../apps/web/src/pages/Room/net/pendingPreviews.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/previewSchedule.test.ts](../../../apps/web/src/pages/Room/net/previewSchedule.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/roomConfig.test.ts](../../../apps/web/src/pages/Room/net/roomConfig.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/roomControlEvents.test.ts](../../../apps/web/src/pages/Room/net/roomControlEvents.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/roomSocket.test.ts](../../../apps/web/src/pages/Room/net/roomSocket.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/roomStateHandler.test.ts](../../../apps/web/src/pages/Room/net/roomStateHandler.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/sendOperation.test.ts](../../../apps/web/src/pages/Room/net/sendOperation.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/snapshotBase64.test.ts](../../../apps/web/src/pages/Room/net/snapshotBase64.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/snapshotCompression.test.ts](../../../apps/web/src/pages/Room/net/snapshotCompression.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/snapshotGate.test.ts](../../../apps/web/src/pages/Room/net/snapshotGate.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/snapshotHistoryRepair.test.ts](../../../apps/web/src/pages/Room/net/snapshotHistoryRepair.test.ts) | [QA-488](historical.md#qa-488), [QA-556](historical.md#qa-556), [QA-559](historical.md#qa-559), [QA-562](historical.md#qa-562) |
| [apps/web/src/pages/Room/net/snapshotRestore.test.ts](../../../apps/web/src/pages/Room/net/snapshotRestore.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/net/snapshotSync.test.ts](../../../apps/web/src/pages/Room/net/snapshotSync.test.ts) | [QA-485](historical.md#qa-485) |
| [apps/web/src/pages/Room/net/socketRevival.test.ts](../../../apps/web/src/pages/Room/net/socketRevival.test.ts) | [QA-497](historical.md#qa-497) |
| [apps/web/src/pages/Room/net/structuralSnapshotBase.test.ts](../../../apps/web/src/pages/Room/net/structuralSnapshotBase.test.ts) | [QA-481](historical.md#qa-481), [QA-484](historical.md#qa-484) |
| [apps/web/src/pages/Room/net/syncStatus.test.ts](../../../apps/web/src/pages/Room/net/syncStatus.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/overlays/cursorController.test.ts](../../../apps/web/src/pages/Room/overlays/cursorController.test.ts) | [QA-513](historical.md#qa-513) |
| [apps/web/src/pages/Room/participants/displayName.test.ts](../../../apps/web/src/pages/Room/participants/displayName.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/replayGate.test.ts](../../../apps/web/src/pages/Room/replayGate.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/restoreRoomState.test.ts](../../../apps/web/src/pages/Room/restoreRoomState.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/shapes/shapeTool.test.ts](../../../apps/web/src/pages/Room/shapes/shapeTool.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/status/notOpenScreen.test.ts](../../../apps/web/src/pages/Room/status/notOpenScreen.test.ts) | [QA-477](historical.md#qa-477), [QA-498](historical.md#qa-498), [QA-554](historical.md#qa-554) |
| [apps/web/src/pages/Room/tools/colorWell.test.ts](../../../apps/web/src/pages/Room/tools/colorWell.test.ts) | [QA-591](historical.md#qa-591) |
| [apps/web/src/pages/Room/tools/editorHotkeys.test.ts](../../../apps/web/src/pages/Room/tools/editorHotkeys.test.ts) | [QA-525](historical.md#qa-525) |
| [apps/web/src/pages/Room/tools/editorKeys.test.ts](../../../apps/web/src/pages/Room/tools/editorKeys.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/tools/selectedTool.test.ts](../../../apps/web/src/pages/Room/tools/selectedTool.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/tools/toolChoice.test.ts](../../../apps/web/src/pages/Room/tools/toolChoice.test.ts) | [QA-524](historical.md#qa-524), [QA-594](historical.md#qa-594) |
| [apps/web/src/pages/Room/undoneInBatch.test.ts](../../../apps/web/src/pages/Room/undoneInBatch.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/useRemoteOperations.test.ts](../../../apps/web/src/pages/Room/useRemoteOperations.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/useRoomRestore.test.ts](../../../apps/web/src/pages/Room/useRoomRestore.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/pages/Room/viewport/cameraMath.test.ts](../../../apps/web/src/pages/Room/viewport/cameraMath.test.ts) | [QA-509](historical.md#qa-509), [QA-510](historical.md#qa-510), [QA-571](historical.md#qa-571) |
| [apps/web/src/pages/Room/viewport/pinchTracker.test.ts](../../../apps/web/src/pages/Room/viewport/pinchTracker.test.ts) | [QA-510](historical.md#qa-510) |
| [apps/web/src/pages/Room/viewport/pointerTransform.test.ts](../../../apps/web/src/pages/Room/viewport/pointerTransform.test.ts) | [QA-509](historical.md#qa-509) |
| [apps/web/src/pwa/navigationResponse.test.ts](../../../apps/web/src/pwa/navigationResponse.test.ts) | [QA-526](historical.md#qa-526), [QA-528](historical.md#qa-528) |
| [apps/web/src/pwa/swConfig.test.ts](../../../apps/web/src/pwa/swConfig.test.ts) | [QA-526](historical.md#qa-526), [QA-528](historical.md#qa-528), [QA-529](historical.md#qa-529) |
| [apps/web/src/pwa/updatePolicy.test.ts](../../../apps/web/src/pwa/updatePolicy.test.ts) | [QA-527](historical.md#qa-527), [QA-529](historical.md#qa-529) |
| [apps/web/src/stores/noticeStore.test.ts](../../../apps/web/src/stores/noticeStore.test.ts) | [QA-517](historical.md#qa-517) |
| [apps/web/src/stores/resetBoardState.test.ts](../../../apps/web/src/stores/resetBoardState.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/stores/roomStore.test.ts](../../../apps/web/src/stores/roomStore.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/stores/slices/participants.test.ts](../../../apps/web/src/stores/slices/participants.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/stores/slices/strokeSlice.test.ts](../../../apps/web/src/stores/slices/strokeSlice.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/stores/slices/toolSlice.test.ts](../../../apps/web/src/stores/slices/toolSlice.test.ts) | [QA-524](historical.md#qa-524) |
| [apps/web/src/stores/slices/viewportSlice.test.ts](../../../apps/web/src/stores/slices/viewportSlice.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/web/src/styles/contrast.test.ts](../../../apps/web/src/styles/contrast.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/server/src/admin/adminRoutes.test.ts](../../../apps/server/src/admin/adminRoutes.test.ts) | [QA-412](historical.md#qa-412), [QA-413](historical.md#qa-413), [QA-536](historical.md#qa-536), [QA-537](historical.md#qa-537) |
| [apps/server/src/auth/authRoutes.test.ts](../../../apps/server/src/auth/authRoutes.test.ts) | [QA-402](historical.md#qa-402), [QA-403](historical.md#qa-403), [QA-404](historical.md#qa-404), [QA-405](historical.md#qa-405), [QA-406](historical.md#qa-406), [QA-407](historical.md#qa-407), [QA-408](historical.md#qa-408), [QA-409](historical.md#qa-409), [QA-410](historical.md#qa-410), [QA-411](historical.md#qa-411), [QA-412](historical.md#qa-412), [QA-413](historical.md#qa-413), [QA-414](historical.md#qa-414) |
| [apps/server/src/auth/identity.test.ts](../../../apps/server/src/auth/identity.test.ts) | [QA-401](historical.md#qa-401), [QA-426](historical.md#qa-426) |
| [apps/server/src/auth/loginCodes.test.ts](../../../apps/server/src/auth/loginCodes.test.ts) | [QA-402](historical.md#qa-402), [QA-404](historical.md#qa-404), [QA-405](historical.md#qa-405), [QA-406](historical.md#qa-406), [QA-407](historical.md#qa-407) |
| [apps/server/src/auth/sessions.test.ts](../../../apps/server/src/auth/sessions.test.ts) | [QA-414](historical.md#qa-414), [QA-537](historical.md#qa-537) |
| [apps/server/src/health/clientDescription.test.ts](../../../apps/server/src/health/clientDescription.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/server/src/health/disk.test.ts](../../../apps/server/src/health/disk.test.ts) | [QA-534](historical.md#qa-534) |
| [apps/server/src/health/eventLoop.test.ts](../../../apps/server/src/health/eventLoop.test.ts) | [QA-534](historical.md#qa-534) |
| [apps/server/src/health/healthRoutes.test.ts](../../../apps/server/src/health/healthRoutes.test.ts) | [QA-533](historical.md#qa-533) |
| [apps/server/src/health/memory.test.ts](../../../apps/server/src/health/memory.test.ts) | [QA-532](historical.md#qa-532) |
| [apps/server/src/health/roomOpenMetrics.test.ts](../../../apps/server/src/health/roomOpenMetrics.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [apps/server/src/health/sentryOptions.test.ts](../../../apps/server/src/health/sentryOptions.test.ts) | [QA-538](historical.md#qa-538) |
| [apps/server/src/health/shutdown.test.ts](../../../apps/server/src/health/shutdown.test.ts) | [QA-497](historical.md#qa-497), [QA-535](historical.md#qa-535) |
| [apps/server/src/health/snapshotLagWatch.test.ts](../../../apps/server/src/health/snapshotLagWatch.test.ts) | [QA-485](historical.md#qa-485), [QA-539](historical.md#qa-539) |
| [apps/server/src/roomRoutes/boardRoutes.test.ts](../../../apps/server/src/roomRoutes/boardRoutes.test.ts) | [QA-583](historical.md#qa-583), [QA-584](historical.md#qa-584), [QA-585](historical.md#qa-585) |
| [apps/server/src/roomRoutes/forkRoutes.test.ts](../../../apps/server/src/roomRoutes/forkRoutes.test.ts) | [QA-433](historical.md#qa-433), [QA-434](historical.md#qa-434), [QA-435](historical.md#qa-435), [QA-436](historical.md#qa-436), [QA-437](historical.md#qa-437), [QA-438](historical.md#qa-438) |
| [apps/server/src/roomRoutes/reviewRoutes.test.ts](../../../apps/server/src/roomRoutes/reviewRoutes.test.ts) | [QA-424](historical.md#qa-424) |
| [apps/server/src/roomRoutes/roomAccessRoutes.test.ts](../../../apps/server/src/roomRoutes/roomAccessRoutes.test.ts) | [QA-417](historical.md#qa-417), [QA-418](historical.md#qa-418), [QA-419](historical.md#qa-419), [QA-420](historical.md#qa-420), [QA-421](historical.md#qa-421), [QA-422](historical.md#qa-422), [QA-423](historical.md#qa-423) |
| [apps/server/src/roomRoutes/roomFolderRoutes.test.ts](../../../apps/server/src/roomRoutes/roomFolderRoutes.test.ts) | [QA-428](historical.md#qa-428), [QA-429](historical.md#qa-429), [QA-430](historical.md#qa-430), [QA-519](historical.md#qa-519) |
| [apps/server/src/roomRoutes/roomRoutes.test.ts](../../../apps/server/src/roomRoutes/roomRoutes.test.ts) | [QA-427](historical.md#qa-427), [QA-431](historical.md#qa-431), [QA-432](historical.md#qa-432) |
| [apps/server/src/roomRoutes/snapshotRoutes.test.ts](../../../apps/server/src/roomRoutes/snapshotRoutes.test.ts) | [QA-424](historical.md#qa-424), [QA-425](historical.md#qa-425), [QA-481](historical.md#qa-481), [QA-489](historical.md#qa-489) |
| [apps/server/src/roomRoutes/thumbnailRoutes.test.ts](../../../apps/server/src/roomRoutes/thumbnailRoutes.test.ts) | [QA-439](historical.md#qa-439), [QA-440](historical.md#qa-440) |
| [apps/server/src/rooms/boardContentAccess.test.ts](../../../apps/server/src/rooms/boardContentAccess.test.ts) | [QA-424](historical.md#qa-424), [QA-425](historical.md#qa-425), [QA-500](historical.md#qa-500), [QA-586](historical.md#qa-586) |
| [apps/server/src/rooms/boards.test.ts](../../../apps/server/src/rooms/boards.test.ts) | [QA-585](historical.md#qa-585) |
| [apps/server/src/rooms/classMode.test.ts](../../../apps/server/src/rooms/classMode.test.ts) | [QA-438](historical.md#qa-438), [QA-586](historical.md#qa-586), [QA-587](historical.md#qa-587), [QA-588](historical.md#qa-588), [QA-589](historical.md#qa-589), [QA-590](historical.md#qa-590) |
| [apps/server/src/rooms/firstSnapshotPolicy.test.ts](../../../apps/server/src/rooms/firstSnapshotPolicy.test.ts) | [QA-486](historical.md#qa-486) |
| [apps/server/src/rooms/operationGate.test.ts](../../../apps/server/src/rooms/operationGate.test.ts) | [QA-447](historical.md#qa-447), [QA-449](historical.md#qa-449), [QA-450](historical.md#qa-450), [QA-499](historical.md#qa-499), [QA-587](historical.md#qa-587) |
| [apps/server/src/rooms/roomAccess.test.ts](../../../apps/server/src/rooms/roomAccess.test.ts) | [QA-416](historical.md#qa-416), [QA-417](historical.md#qa-417), [QA-418](historical.md#qa-418), [QA-421](historical.md#qa-421) |
| [apps/server/src/rooms/roomLoader.test.ts](../../../apps/server/src/rooms/roomLoader.test.ts) | [QA-530](historical.md#qa-530) |
| [apps/server/src/rooms/roomPersistence.test.ts](../../../apps/server/src/rooms/roomPersistence.test.ts) | [QA-494](historical.md#qa-494), [QA-535](historical.md#qa-535) |
| [apps/server/src/rooms/roomRegistry.test.ts](../../../apps/server/src/rooms/roomRegistry.test.ts) | [QA-530](historical.md#qa-530), [QA-531](historical.md#qa-531), [QA-532](historical.md#qa-532) |
| [apps/server/src/rooms/roomSnapshots.test.ts](../../../apps/server/src/rooms/roomSnapshots.test.ts) | [QA-480](historical.md#qa-480), [QA-490](historical.md#qa-490) |
| [apps/server/src/rooms/rooms.test.ts](../../../apps/server/src/rooms/rooms.test.ts) | [QA-415](historical.md#qa-415), [QA-495](historical.md#qa-495), [QA-531](historical.md#qa-531), [QA-581](historical.md#qa-581) |
| [apps/server/src/rooms/snapshotCoverage.test.ts](../../../apps/server/src/rooms/snapshotCoverage.test.ts) | [QA-480](historical.md#qa-480), [QA-490](historical.md#qa-490) |
| [apps/server/src/rooms/snapshotReplayLoader.test.ts](../../../apps/server/src/rooms/snapshotReplayLoader.test.ts) | [QA-488](historical.md#qa-488), [QA-547](historical.md#qa-547) |
| [apps/server/src/rooms/snapshotReplayPlan.test.ts](../../../apps/server/src/rooms/snapshotReplayPlan.test.ts) | [QA-488](historical.md#qa-488), [QA-559](historical.md#qa-559) |
| [apps/server/src/rooms/socketHandlers.test.ts](../../../apps/server/src/rooms/socketHandlers.test.ts) | [QA-415](historical.md#qa-415), [QA-416](historical.md#qa-416), [QA-426](historical.md#qa-426), [QA-493](historical.md#qa-493), [QA-494](historical.md#qa-494), [QA-566](historical.md#qa-566), [QA-582](historical.md#qa-582) |
| [apps/server/src/rooms/structuralLog.test.ts](../../../apps/server/src/rooms/structuralLog.test.ts) | [QA-436](historical.md#qa-436), [QA-443](historical.md#qa-443), [QA-447](historical.md#qa-447), [QA-499](historical.md#qa-499) |
| [packages/shared/src/admin.test.ts](../../../packages/shared/src/admin.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [packages/shared/src/dabCodec.test.ts](../../../packages/shared/src/dabCodec.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [packages/shared/src/rejectReason.test.ts](../../../packages/shared/src/rejectReason.test.ts) | [QA-496](historical.md#qa-496) |
| [packages/shared/src/rest.test.ts](../../../packages/shared/src/rest.test.ts) | [QA-489](historical.md#qa-489) |
| [packages/shared/src/roomOpen.test.ts](../../../packages/shared/src/roomOpen.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [packages/shared/src/shapeBounds.test.ts](../../../packages/shared/src/shapeBounds.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
| [packages/shared/src/toolset.test.ts](../../../packages/shared/src/toolset.test.ts) | [QA-581](historical.md#qa-581) |
| [packages/shared/src/transformMatrix.test.ts](../../../packages/shared/src/transformMatrix.test.ts) | Внутренний инвариант; отдельное acceptance-покрытие не заявлено |
