# Распространение fixed-wet policy без подмены алгоритмов

После отдельного opt-in B-lite (`01e5b25c`) нужно сохранить actual solver каждой семьи. Общий контракт: immutable initial rawW>0; rawW0 RGBA literal; partial-wet пигмент мобильный fine, не stationary; all4 coarse/fine ledgers с явной coarse reduction delta. Это новая policy/source revision, не exact optimization исторического результата.

## Узкие seams

| Семья | Реальные source/host seams | Что сохраняется / что необходимо поменять |
|---|---|---|
| 8,9 и wrappers exact10/12 | macro8-integer-dynamic.ts, macro9-integer-smooth.ts; initializer + pair compilation | Исходный pair/absorption/mixing/phase schedule; full-wet bulk initializer и face gate. Lite требует обязательный mobile-boundary tail. |
| 13–33,35,37–41 и CPU-backed wrappers | macro14-coherent-advection.ts; original/fast initializer, pairSourceOverride | Сохраняются actual pressure/curl/dt/limiter/gated schedules/source-detail inputs. Gate накладывается на actual final source, а не на общий DT4. Fast/old initializer оптимизации должны иметь одинаковое partition значение, но оставаться своими реализациями. |
| 33/38/40 single-pair programs | exact-pair-dispatch.ts; macro38-coalesced-single-pair.ts | Gate обязан записать **оба** destinations с local adsorb; обычный per-destination `dst[i]` gate неверен. Сохраняются mapping/coalescing/exact divide bodies. Проверять four phases и singleton borders. |
| 34/39/42/43 GPU initialization | macro34-gpu-initial.ts, macro34-gpu-initial-shader.ts | Не заменять GPU INIT CPU B-lite initializer: нужен отдельный policy GPU INIT с full-wet reduction, raw partial fine carrier, dry-only literal. Сохраняются GPU-vs-CPU подготовка и verify mode. Проверка known exact sources должна явно допустить policy-derived sources, не произвольные strings. |
| Fine11/17/18/22–27/29/31/32/35–39/42 | macro11-fine-paper.ts init bindings/aux/pack + existing override graph | Сохранить actual affinity/source-detail/terminal-rim fine pair и chosen compact layouts. Fine wet bit из raw mask, не coarse W+S. Инициализировать bulk+raw partial, отдельный fineD; dry M/D0. Минимальный обязательный component exchange нужен и fineSteps0, иначе thin остается неподвижным. |
| BLR17/36 и Lite41/43 | macro17-smooth-fine-paper.ts, macro36-capacity-aware-fine.ts, macro41-capacity-aware-lite.ts | Старый BLR + mask-after-PACK не годится: column sums нарушаются. Требуется wet-conservative initialization/smoothing до quantization. Owner init + symmetric wet-only fine smoothing — безопасный начальный путь, но это меняет reconstruction. Не выдавать его за тот же BLR или за exact historical image. |

## Передача policy

Root review отклонил implicit WeakMap scope как основной путь. Используем explicit readonly factory-options: low-level `fixedWet` hooks в bases8/9/14, затем отдельные GPU34/Fine11 hooks. Top-level factory wrapper/closure обязан явно передать options; никакой ambient policy в GPUDevice, symbols/config или глобальном состоянии. Все factory calls остаются независимыми при concurrent create и reuse. Сначала dependency-map и focused forwarding tests, затем registry policy-aware entry points.

Base factory сообщает context borrowed state/output handles, actual phase parity и actual source fingerprints. Context владеет только собственными mask/boundary/fine buffers, освобождает их once; базовый candidate освобождает свои. Fine factory отмечает `fineHandled`, чтобы registry не прицепил второй B-lite хвост. Наличие Fine является фактом actual path, а не предположением по имени ID.

Registry оставляет прежние config keys/ID semantics и явно добавляет policy revision/source hashes. В начале opt-in rollout, после device proof — осознанное применение fixed policy к выбранным definitions. Failed/unsupported families показываются FAIL, не тихая замена чужой моделью. Reconstruction-only пары после безопасного изменения могут оказаться одинаковыми — это честно маркируется, а не считается новым художественным разнообразием.

## Не закрытые риски

1. Rim/source-detail computation должен остаться, даже если заменяется небезопасная часть INIT; нельзя заменить целиком source override и потерять actual affinity.
2. Не все old factories имеют observePacking; нужны explicit hook seams, не угадывание labels через GPU interception.
3. Lite получает дополнительную fine работу и память. GPU initializer policy тоже добавляет fine resources. Это не бесплатный флаг и не обещание прежней скорости.
4. Bounded RGB<=A несовместим с некоторыми native common-input данными (sheet7); это отдельный input contract, не разрешение clamp.
5. До all-choices rerun нужны CPU all4 ledger/partition + shader/dispatch ownership tests, device thin/bulk/walls и actual mini/sheet12. Ни source assertion, ни readonly binding сами по себе не заменяют GPU output proof.
