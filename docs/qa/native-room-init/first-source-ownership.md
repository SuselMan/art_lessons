# #728: отказ первого source после облегчённого init

Actual Surface frozen `a83f501e` завершил INIT, затем настоящий pen40 записал
StrokeOperation. `source.emitPrepared` отклонён с
`Room-owned backend has no standalone material fields`, GL0/context-lost=false,
memoryAbort отсутствует. Это API/ownership регрессия init-кандидата, не отказ GPU
arithmetic. Аппаратный результат сохранён root в
`docs/qa/harness/728-room-native-first/surface-a83.json` (commit690378de).
Компактный controller записал String(error), полноценного stack там нет.

Проверенный source путь:
`RoomWatercolorExecutor.emitPrepared` → `finish.encodeLive` → `encodeSelected` →
spread `backend.fields`. Spread пытался прочесть удалённый standalone материал,
хотя следующие explicit coverage/P/C полностью заменяли нужные поля. Source
raster до live-composite использует explicit owner targets и zero-water API;
возвращать standalone 28MiB для обхода ошибки неправильно.

Исправление: `CanonicalComposite.encode` принимает ровно coverage/P/C (`Pick`),
`CanonicalSingleTileFinish` передаёт эти owner fields прямо. Original, paper,
noise, output, uniforms, shader, blend, scissor и порядок GPU pass неизменны.
Нет пустых fake fields или скрытого выделения standalone resources.

Regression выполняет настоящий `RoomWatercolorExecutor.emitPrepared` и настоящий
`CanonicalSingleTileFinish`/`CanonicalComposite` с mock GPU commands, при getter
`backend.fields`, который бросает прежнюю ошибку. Проверены source-before-live
порядок и bind groups: live P/C, supplied preview P/C, final dryP/dryC. Сам
standalone getter по-прежнему бросает. Это meaningful ownership/binding проверка,
**не hardware pixel parity или завершённый water→pigment gate**.
