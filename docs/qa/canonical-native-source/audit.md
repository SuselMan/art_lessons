# Native single-tile source owner

Base 099be954. `CanonicalSourcePhaseExecutor` выполняет source GPU protocol, не реализует Room или новую физику.

Production references: RibbonStrokePainter.ts:134 foreign donor replay/import; :694 coverage stamps/bands; :721–748 independent solvent film/base/load; :755–832 P/C targets; :855 halo P-only; :875–886 source P/C base+film paired landing. RibbonStrokeScratch.ts:471 newFilm, :482 releaseFilm, :501 beginStroke.

Owner responsibilities:

- CPU delivery advance ровно один раз: prepareCanonicalStrokeChunk по одному segment, либо unsegmented batch. Flattened multi-segment commands запрещены до любого draw; нельзя потерять intermediate base+film landing.
- Передать production `revealRect(tile, compositeBounds)` в GL coordinates. `fieldOp` callback сохраняет GL-bottom-up scissor conversion и отдельные Q8 boundaries. Нельзя заменить source rect произвольным nib bbox.
- Executor запускать внутри backend.encodeOwnerCommands. Raster transient buffers освободить только после submit completion; pool field resources сохранять до завершения использующего их encoder.
- Начало gesture/partial chunk — прежние beginStroke/newFilm materialGesture; CPU brushTravel/newFilm reset принадлежит producer. Executor использует CanonicalTileScratch film epochs.
- Foreign donor предварительно replay из уникальных записанных chunk ids через exact water-only source path с original preset/profile/seed/wet/newFilm transitions. Выбор источников — существующая selectedForeignWaterSources по реальным wet contacts. Executor только выполняет mode20 coverage и mode1 independent foreign V import, один раз на source gesture. Никаких inferred/synthetic foreign puddles.
- Generic SettlePlanScratch metadata — реальные gesture, paints, brushTravel, wetContacts, foreignSources, dryCtx, storage bounds от CPU/production owner. Executor не выдумывает metadata и не заменяет SettlePlanScratch декоративным объектом.
- Вершины forwarded world-space без изменений; backend099be954 выполняет единственную Float32 localization. Stamp center уже local от builder.

Scope explicitly single bounded tile; multi-tile constructor throws. Final composite/settle/reveal and submission are owner work. Source commands retain phase tags; solvent and halo route through raster pigmentOnly to independent V film / P film respectively. V base+film lands before P/C; P/C base+film lands after halo, without yield between the pair. Water-only never material-lands.

Trace tests verify independent targets, order, foreign import idempotence, explicit rejected scope, unchanged nonzero-world-origin vertices. These tests do not prove pixel parity or driver behavior. Root runs native-vs-legacy field/pixel fixture.
