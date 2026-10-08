# Preview-only precision после actual radial

Actual radial исключил прежнюю clipping-гипотезу: Poutside-source-coverage=0 на всех этапах. Coverage extension **не внедрять**. По сообщению root: P.B/A total1419→1203(step16)→769(step64),−45.8%; max98→22→10, moment-radius2.74→14.79→18.13, support23→174, step64→111 exact stationary. Material support/canvas alpha меняются, но реальные perceptual frames ещё оценивает GPU-agent. Это actual evidence потери Q8 total, не глобальная canonical loss.

## CPU сравнение на bounded flat-paper

`node docs/qa/harness/728-room-moment/preview-precision-oracle.mjs` PASS.32² grid, king8,D=.09, B*dh0, seed255, closededges,113steps. Сравнение численного хранения, не GPU time/actualFinepaper.

| Вариант | effective total113 | L1 к вещественному | storage writes113 |
|---|---:|---:|---:|
| Q8 каждый шаг |177|347.93|113|
| Float32 preview |255.000004|0.0000082|113|
| Q8+Float32 остаток |254.999998|0.0000060|226|
| округление каждые4шага |89|238.28|29|

Последний вариант не лучше по сохранению total: округление реже всё равно систематически теряет diffuse tail; промежуточные4шага в oracle используют вещественное хранение. Нельзя назвать это простой перестановкой нескольких существующих Q8 GPU draws — каждая framebuffer запись всё равно округляет. Для реализации пришлось бы держать float intermediates или расширенный kernel, после чего проще Float32. Меньше шагов за физическую секунду уменьшает pace spread и число потерь, но не решает stationary состояние: только откладывает его.

## Предпочтительный bounded кандидат: Float32 только P/C preview

Сохранить production diffusion формулы, stencil/domain128/порядок pairOLD→NEW; заменить **четыре** собственных P0/P1/C0/C1 RGBA8 поля на renderable RGBA32F. Water/domain остаютсяRGBA8; pending1024RGBA8. Инициализация из readonly Q8 source и canonical endpoint прежние. Composite читает normalized float P/C тем же кодом; финальный pendingRGBA8 всё равно округляет, но слабый хвост не исчезает до tone/composite. P/C коэффициенты одинаковы, численная ошибка не нулевая, GPU paired-colour/mass gate нужен.

Memory: четырe128²RGBA32F=1MiB вместо0.25MiB. Дополнение0.75MiB/slot,≤2.25MiB на3slots; preview pool13.125→15.375MiB, без нового1024rendercoverage. Прочие owner/source бюджеты отдельно.2diffusiondraws/tick сохраняются, bandwidth PC приблизительно×4; hardware время неизвестно. Не обещать ускорения или24fps.

В WebGL1 необходимо **оба** `OES_texture_float` и `WEBGL_color_buffer_float`, NEAREST фильтр, фактический framebuffer completeness/render/readback/GLerror gate. `staticPaperCache.ts:36` уже использует такую capability-пару, но это не доказательство preview texture allocator. Не нужны float-linear extension. При отсутствии renderableFloat32 explicit unsupported/Q8reference, без молчаливой новой физики. Half-float — отдельный кандидат с собственным extension/renderability/precisiongate, не автозамена.

## Остаток и почему не первый выбор

Q8+signedfloat residual хранит значение q+r и сохраняет effective total. Но если composite читает толькоq, в oracle display total падает до109 противeffective255: остаток должен участвовать и в каждомdiffusionread, и в materialcomposite. Это требует четырёх дополнительных signedfloat полей и дополнительных writes/bindings/шадерветвей; positive/negative residual нельзя положить в обычныйRGBA8 без explicitencoding. Если float доступен, directfloat проще и дешевле. Если недоступен, integer residual в дополнительныхRGBA8/packedsigned форматах — новый визуальный numerical solver, требует boundedproof и не обещает скорость.

## Следующий минимальный actual gate

DEFAULT-OFF isolated Float32-vsQ8 preview pair: тот же retainedsource8/paper/domain/recipe;16/64/113steps; full128 perchannel totals, extrema/finite/negative; radial support and final pendingmaterial/canvasimages; canonical8hash unchanged; zeroP/Cwatercontrol; proportionalcolour3channels+weak1Q8; actualGLcapability/errors/loss;3slotbudget. Float shader blending forbidden and aliasOLD/NEW forbidden. Timing cohort без readbacks отдельно. Runtime сейчас не изменён, candidate не включён.

## OFF allocator READY, без runtime интеграции

`PreviewPairedFloatAllocator.mjs` — отдельный кандидат только для четырёх P/C preview fields. enabled defaultfalse, принимает explicit existingQ8 allocator и excluded physical inputs. В ON требует total three-slot budget16121856bytes (15.375MiB), WebGL1 renderableFloat32 extensions, highp23; каждое actual128FBO проверяется. Неподдержка/неполныйFBO откатывает все частично приобретённыеhandles и возвращает **четыре Q8 поля**, не смешанную пару. Setup framebuffer/activeTexture/binding восстанавливаются. Draw seam повторяет beginReplaceDraw/endDraw production buffer, blendingOFF. destroyAfterKnownIdle идемпотентен; caller обязан доказатьidle до вызова — allocator не добавляет input fence.

FakeGL3tests PASS: OFF/unsupported/budget;4floatfields/state restore/releaseonce; thirdFBO failure rollback6handles→allQ8. Это не capability proof реальногоGPU. WebGL2/diagnostic wrapper этим allocator пока не поддерживается; отдельный raw-WebGL2 форматRGBA32F потребует нового gate, не полагаться на WebGL1 FLOATtexImage signature там.

Actual `WC_DIFFUSE_FRAG:3885–3983` не делает floor/round/channelwiseUNORM conversion. Действительные сохранённые guards: domainalpha≤.002→dry; clamp(domainalpha,0,1); finalmax(out4,0). Отрицательный numerical хвост clamp всё ещё может менять сумму; он остаётся literal. `wcResample mode0` имеет spatial sample-coordinate floor дляtexel selection, не quantization значения. Float storage поэтому удаляет framebufferQ8 write, а не эти guards. Composite depth/ink умножение2, thinPrior, coverage thresholds и finalpendingRGBA8 **сохраняются**. Не обещать идеальную непрерывную массу/видимость.

Existing `SealedPreviewTransport` требует lease.bytes===старыйPREVIEW_BYTES, existingpool тожефиксирован. Allocator намеренно не подключён: следующая интеграция должна изменить только typedphysical preview ledger/format, сохранить pool exclusions/epoch/fence/P-C pair и fallback ledger Q8. Нельзя просто передать новое поле под старым bytes и считатьbudgetподтверждённым. Перед hardware нужен tiny actualFloatFBO write/read/finite/copy init, затем paired113diffusion; скоростьотдельно.
