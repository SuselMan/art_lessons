# #798: film lifetime at a sliced M70 chunk boundary

Actual Samsung failure happened while pen was held (MOVE65), one recorded chunk,
4.6s before UP. Stack: FIFO.advance -> RibbonStrokePainter.sourceBands ->
RibbonPasses.drawRibbonBands -> beginMaxDraw -> BufferResidency.touch. Field leases
were0, phase input224MiB, resident~122.75MiB. This was not an admission/OOM failure:
touch received an already unregistered/destroyed object.

Cause: _finishRibbonStroke handled M70 before its canonical FIFO finish branch.
_flushStrokeChunk therefore called controller.finish/releaseFilm synchronously
while a deferred material generator held film-buffer references across yields.
The pool could retire those buffers; the next sourceBands resumed with a dead
reference. Pointer-UP had the same ordering hazard. _wcAsyncLocalStroke does not
protect watercolor (it is reserved for other tools).

Fix: use the existing owned canonical finish FIFO before M70 dispatch. Both chunk
and UP retain ordered finish context/gesture; logical newFilm can advance while
physical release waits for prior material. Controllers accept the captured finish
context and release exactly its gesture, preserving a newer pending input flag.
Final async scratch release also respects the Puddle canonical owner, rather than
only wash/live-input pointers. Cancel/destroy retain existing request disposal;
controller teardown ultimately frees its owned material. No model/shader/geometry,
budget, scheduler budget, error masking or dead-buffer registration changes.

Deterministic CPU reproduction uses real Engine/Painter/FIFO/ScratchPool and a
managed film, pauses the canonical generator during MAX bands, executes the real
chunk boundary, then public pool.trimFree() (legitimate free-buffer retirement).
Unfixed source fails with the same Buffer residency unavailable. Fixed source
resumes without early destruction. Small geometry avoids allocating an entire A2
just to force pool pressure. MockGL is ownership evidence, not a GPU pixel oracle.

Four new cases: held chunk, actual pointer-UP with recorded lift, queued cancel,
last async release while the Puddle remains the canonical owner. Captured finish
color/profile/bounds/gesture survive newer logical input. New pending input is
preserved. Cancellation drains async owner refs; final teardown leaves cache0.
Targeted regression:60tests/4files PASS (new4 + asyncWatercolor + M70 legacy-owner
and joined-deferred finish). Full web typecheck and scoped lint recorded externally.
Actual Samsung two-wave/short-stroke check remains the integration gate.

Private exact stack/input fixture retained in current registered QA cache; no auth
or raw GPU arrays copied here. External prefail/fixed logs and source snapshots:
~/projects/pencil-agents/798-wave-ownership-artifacts. No new service/browser/device
resources started by the CPU fix; shared compatible dependencies reused.
