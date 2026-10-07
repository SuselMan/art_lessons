# #728: реальный GPU completion clock

Принцип: бюджет проверяется после фактического completion GPU; canonical Operation Log и порядок физических операторов остаются прежними. Diagnostic1373 показал, что gl.finish CPU0.2–0.8ms не включал оставшееся GPU wait до51ms. Scoped tiny-FBO readPixels переместил wait внутрь12ms clockbudget, сохранив19fieldsRGBAexact0.

Прототип `_wcBudgetFence` выключен по умолчанию. Engine владеет одним ленивым `GpuBudgetFence`: RGBA8 texture/FBO1×1, четыре CPU bytes. Только `_runSlice` group/end, `_advanceAsyncCanonical` и Queue.ctx.syncGpu используют этот completion clock. Display/debug/checkpoint вызовы finish не меняются. Init сохраняет framebuffer, TEXTURE0 binding и activeTexture; sync читает ровно1×1RGBA unsignedbyte c PACK_ALIGNMENT1, затем восстанавливает framebuffer/pack. Никакой аллокации наunit. Destroy release ровноowned handles, loss forget без GL удаления, restoration лениво создаёт новые.

CPU19tests PASS: disabled finish/noalloc, routing3budget paths, actualEngine registeredjob cancellation/loss/restore/destroy; helper allocationfailure/incompleteFBO/readthrow state restore. Wholeweb TypeScript/touchedlint PASS. MockGL lifecycle не заменяет аппаратный fixedfields/native400/multiowner gate. До этих проверок defaultON не предлагается.
