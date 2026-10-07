# #728: реальный GPU completion clock

Принцип: бюджет проверяется после фактического completion GPU; canonical Operation Log и порядок физических операторов остаются прежними. Diagnostic1373 показал, что gl.finish CPU0.2–0.8ms не включал оставшееся GPU wait до51ms. Scoped tiny-FBO readPixels переместил wait внутрь12ms clockbudget, сохранив19fieldsRGBAexact0.

Прототип `_wcBudgetFence` выключен по умолчанию. Engine владеет одним ленивым `GpuBudgetFence`: RGBA8 texture/FBO1×1, четыре CPU bytes. Только `_runSlice` group/end, `_advanceAsyncCanonical` и Queue.ctx.syncGpu используют этот completion clock. Display/debug/checkpoint вызовы finish не меняются. Init сохраняет framebuffer, TEXTURE0 binding и activeTexture; sync читает ровно1×1RGBA unsignedbyte c PACK_ALIGNMENT1, затем восстанавливает framebuffer/pack. Никакой аллокации наunit. Destroy release ровноowned handles, loss forget без GL удаления, restoration лениво создаёт новые.

CPU19tests PASS: disabled finish/noalloc, routing3budget paths, actualEngine registeredjob cancellation/loss/restore/destroy; helper allocationfailure/incompleteFBO/readthrow state restore. Wholeweb TypeScript/touchedlint PASS. MockGL lifecycle не заменяет аппаратный fixedfields/native400/multiowner gate. До этих проверок defaultON не предлагается.

Samsung1374 actual prototype6f76794f/base40c402e0, own5330,975trackedSHAexact: all19meaningfulfields+RGBA exact0/GL0/lostfalse/492523purple. Global3scope fence solver9.881→23.732s; full duration including19readbacks+export12.4495→26.3079s. Extra waits inside true4ms Queue budget substantially reduce throughput. No defaultON recommendation.

Samsung1375OFF/1376ON ordinary3s400 pigment+newtouch+UIDry, independent adaptive journals, allACK2/pending0/GL0/lostfalse/nonempty. Active178/max40/2>33 vs170/max34/9>33, first1.5s-tail100ms both, newtouch12.4→32.8ms. Last5s-sampled idle state23.9→63.7s frompageclock, NOT exact complete duration; revealcompletion later. Both CLOSED. Prior native helper does not measure fulltail; separate fulltail controller prepared.

Samsung1377 causal scope: Queue.ctx.syncGpu uses originalfinish inbotharms; actualflag fence onlyrunSlice/FIFO. Same19fieldsRGBAexact0/GL0. Solver9.4257→9.6195s; fullreadbacks/export total11.8978→12.143s. Global large regression belongs to Queue budget scope, not drawing-only fence. Both original physics/caps4/trigger preserved. TargetCLOSED. Raw temp/fence-hardware/{report.json,drawing-scope-report.json,native-room-fifo_1791345871390/report.json,native-room-fifo_1791345926721/report.json}; HOME copies planned alongside runtime.
