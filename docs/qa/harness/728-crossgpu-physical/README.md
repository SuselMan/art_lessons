# #728: расширенный crossGPU physical capture, CPU-подготовка

Проблема world **994,1231**, original **Gq9CPrzxWh/64** (water) и
**ytlRBmw3Tg/65** (pigment), wash CEiuPnsbmF остаётся открытой. Старый outlier
transparent alpha50→126 (delta76), opaque max65 не исправлен этим QA-кодом.
Исходный missing-first-stage документ находится в worktree `728-firstload-sync`;
базовый harness — `680-water-wet-tone/docs/qa/harness/728-crossgpu-neighborhood`.
Прежний ROI910,455..1264,721 не содержит y1231; его агрегаты не локализуют outlier.

`physical.mjs` — отдельный helper с **enabled=false** по умолчанию. При включении
оборачивает реальные функции без изменения их аргументов/this/return и без
поглощения генераторов. Удаление wrapper восстанавливает исходные функции.
Не меняет runtime, модель, seed, shader, журналы, source flags, canonical clocks.
CPU-тесты проверяют OFF, this/return, mapping, FBO restore/error и cap, missing
seam preflight до установки, c/d/e/path, front/brush/resample/stitch/cost/clear и
выявление первого захваченного byte diff. Запуск: `node physical.test.mjs`.

## Что добавлено

- Все actual field modes, включая10/11/12/20, **a/b/c/d/e/path BEFORE**, output AFTER;
  реальные scalar/options, scissor/dir/origin/band/world/tau/pathPacked.
- waterFront, brushPass, diffuseStep (включая density), wcResample old/base/clamp,
  pigmentColor, costDomain; copyTo/copyRegionInto и clear на actual buffer prototype.
- Источник до Plan: реальный ribbon nib/bands/composite, immutable vertices и
  scalar argument snapshot, nib clipTo, bands availableWater, composite P/C/cov.
- Physical per-op ordinal, actual operation ID/seq, actual tile/field frame,
  dimensions, role, sampler, local raw5×5 BEFORE/AFTER.
- Полный42 journal byte-SHA ecbb146…ce1d9,41 executed (исключён только image
  Yr38r8lLbf). Probe дополнительно снимает resident worstMaterial перед64/65
  и после них; старый full42 setup/paper/export/destroy сохранён.

## Геометрия и provenance

Tile mapping выводится из actual PaintTarget.originX/Y: texel=(world-origin), S1.
Field mapping выводится из actual noteStorageBounds + fieldFor(w,h), проверяет
равный X/Y scale. Half-res stitch/resample mapping выводится из actual
srcGl/dstGl/ratio, учитывая GL bottom-up; не из удобного sheet ROI.
Pooled acquire сбрасывает старую QA карту; unknown buffers остаются **unmapped**.
`worldRead` сохранён из существующего CPU-проверенного harness. Buffer identity
служит только внутрипроцессным provenance; compare не выравнивает GPU по handle.
Framebuffer/texture binding восстанавливаются после readonly capture.

Не все external GPU inputs имеют читаемый RGBA FBO: flow/foreign water/paper/noise
помечены явно. Raw paper LA SHA сохраняется существующим probe, это **не** измерение
GPU bilinear sampling.5×5 input не доказывает равенство carry stride64 halo или
knight diffuse radius×2: summary/comparator прямо запрещают causal shader-input
claim. Следующий bounded шаг после нахождения первого captured pass — его точный
stencil halo и внешние CPU-upload planes с sampler/domain, а не догадка о float.
Vertices>32768 не копируются, помечаются uncapturedLength. Cap8192/errors —
INCOMPLETE. Ни cap-hit, ни unmapped inputs нельзя выдавать за compatibility PASS.

## Controller preparation

`prepare.mjs` **не запускает** сеть, браузер или GPU. Проверяет actual full42 SHA,
ID/seq и excluded image, компилирует installer/probe string для существующего
owned controller. Требует явные WC_OPS_FILE, WC_SOURCE_PASSPORT,
WC_PREPARED_FILE и APP_URL. WC_PHYSICAL_CAPTURE=1 включает capture в подготовленном
input; без него OFF. Bootstrap получает actual AccumulationBuffer.prototype из
той же frozen runtime копии (не создаёт дополнительную texture).

CPU output сохранён private
`temp/pure-water-plan/crossgpu-physical/prepared.json`, с expected f685 reference
из документа: **это не проверенный runtime passport и не hardware run**.
Перед будущим grant обе GPU должны иметь один фактически проверенный manifest,
paper SHA, full42 tape и DEFAULT flags/gradientFibres false. Старый controller
нельзя запускать без адаптации: использовать prepared input+probe, требовать
summary.enabled/rows и !incomplete, обязательные local checkpoints. Собственная
страница/engine finally, RAM1700/500 и wall bound остаются обязанностью launcher.

`compare.mjs` отвергает различие actual op/ordinal/stage/options/frame/sampler,
возвращает firstCaptured и unmapped список. Даже нулевые captured deltas не
означают, что все физические shader inputs равны. Hardware ещё не запускался.

## Diffuse donor adapter

The older `728-crossgpu-neighborhood` controller and the physical controller
are distinct entry paths. The physical `prepare.mjs` now serializes stencil
helpers into its own installer; `same42-probe.js` supplies the exact CPU paper
view. Its actual `passes.diffuseStep` wrapper captures ink/coverage at all nine
stencil centers before the original method. Density and solvent arguments are
not bound by the current production diffuse and are explicitly excluded.
Donor bytes live in options.donorCapture and are compared separately from
physical command options. Existing other physical-pass captures still cover
local neighborhoods; no claim of complete inputs for front/carry/brush/external
textures is made. CPU fake actual-call test proves this entry path is reached.

`previousCapturedBytesEqual` describes only observed byte captures.
`previousFullyKnownInput` remains null unless a real complete-input contract is
proven; unknown paper upload binding, GPU sampling and external textures break
that chain. An equal→unknown→different regression prevents the old ambiguous
precedingEqual inference. No GPU or actual paper-sampler equality gate has run
for this adapter yet.

## Exact CPU upload provenance observer (OFF)

`installOwnedCanvasUploadProvenance` wraps only an owned canvas getContext so
its GL-instance observer is installed before engine initialization/paper upload.
No WebGL prototypes or user pages change. `installUploadProvenance` defaults OFF;
existing-context active unit starts unknown until an actual activeTexture call.
A newly created owned context has the spec default unit0. State shadows update
only after original GL calls return successfully; original this/return/throws
are preserved. Texture identities and observed sampler parameters are recorded
without getParameter or getTexParameter. Unobserved sampler defaults remain
unknown; exact CPU input SHA does not imply identical GPU conversion/sampling.

Max64 upload records and16MiB cumulative owned clones by default. Null/image
sources, absent binding, unknown active unit, detached views, source-offset
WebGL2 overloads, exhausted budget or digest errors cannot become known.
Exact typed subview is cloned before original upload and any later mutation or
worker transfer. SHA operates asynchronously on that clone, never a whole
backing buffer. `ready()` must finish before comparison; failures remain data.
`dispose()` restores only its own wrappers, clears binding owners and preserves
records. GPU source/stencil/sampler itself is never changed. This is CPU-tested
QA preparation, not an executed capture or complete shader-input parity proof.
