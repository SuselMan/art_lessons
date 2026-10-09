# Точки интеграции exact 9-tap shared tile (пока без runtime-кода)

Actual producer: groupTideOps → adapter.fieldOp → commands.encode → CanonicalFieldOps.run. Mode 5 использует прежний 3×3 j/i порядок, девять sampleA, weights wx×wy и s/16. После каждого из шести stride есть отдельный RGBA8 storage output. Ни separable blur, ни объединение шести Q8 границ не являются точной заменой.

Будущий opt-in вариант можно выбирать в FieldOps.run после исходных mode/device/всех input-alias/filter/finite checks. Только mode5, nearest A, filter-mask bit0, source dimensions = output dimensions, dir=(1,1) или (2,2) в физических пикселях. Несовместимые hardwareLinear/specialization варианты — fallback либо явная прежняя ошибка, не неявная комбинация. Default OFF. Quantum, rect, uniform layout128 и output остаются исходными.

Группа8×8 может загружать shared tile10×10/12×12, включая clamp padding. В shader barrier должен стоять раньше bounds/scissor early return для ВСЕХ lanes. Global tile origin учитывает u.dispatch.xy; GL j-направление имеет обратный native Y. Нужен CPU oracle на actual1536 размерах для исходного uv+dir/floor/flip и shared integer load, включая field edges, partial groups и offset scissor. Не считать ближайший integer индекс доказанным по интуиции.

Compiler factory/key/actual successful-encode counters должны быть отдельными от baseline shader passport. Первый sync compile внутри input не объявлять оптимизацией UX; возможная подготовка до READY должна иметь отдельное доказательство и wall scope. Pipeline/default baseline без opt-in остаются прежними.

Actual measured passport: factor4dd3 ON first material имеет18 mode5 passes, sum68.288512 ms при allpasses1139.474432 ms (около6%). Reconstructed final tail имеет12 mode5 passes; stride1/2 — только2 из6 каждогоgather. Индивидуальный timing eligible subset пока не измерен. Это ограниченный target, не обещание устранить публикацию123.6 ms/следующий DOWN361.3 ms.

Дальнейшие gates: exact prototype CPU source/oracle → lifecycle/dispatch tests → actual same packed input10Q8roles+endpoint OFF/ON + timestamps. Аппаратного allocation сейчас нет; runtime-код tile не менялся.

## CPU-интеграция

Добавлен отдельный DEV default-OFF `CanonicalPlanAdapter.diagnosticMode5SharedTile`. `mode5Tile.ts` использует ровно enumerated16DIM whitelist из06cbd452 и реальный baseline uniform struct128B. Pipeline key отдельный; общий tile144vec4 сохраняет исходную j/i сумму и /16. Binding0/7/8, dispatch/scissor/quantum/все шесть Q8 границ прежние. Guard проверяет live owned original inputs/output, usages, source nearest и extents, finite/filter/alias ошибки до выбора варианта. Иные diagnostic sampler/specialization режимы остаются baseline.

2 CPU oracle tests +10 initial targeted tests PASS; после добавления exception lifecycle5 targeted mode5 tests PASS. appTS PASS после исправления test tuple typing. Pipeline creation/mock encoding проверены; реальная WGSL-компиляция/GPU material parity не проверены. Success count обновляется после pass.end. Unreturned uniforms при bind/end исключениях уничтожаются с сохранением исходной ошибки. Холодный compile может изменить startup/input wall; выигрыш не заявлен. Hardware HOLD.
