# Exact support front: следующий GPU кандидат

Из actual mixed400/Fine профиля Surface: waterFrontStep 252 calls / 687.573 GPU мс; fieldOp 215 / 372.828 мс; diffuseStep 39 / 83.930 мс, brushPass 408 / 81.297 мс. Эти query cohort не дают `wall − GPU = CPU`: wall 5.870 сек включает scheduler и отдельные незамеренные работы. Front — первый shader приоритет.

Предлагаемый bounded кандидат: scissor только OUTWARD front после двух полных проходов, сохраняя оригинальный shader, uniforms, Q8 ping-pong и порядок. Не fusion и не уменьшение iterations. Если начальные ненасыщенные `.r` лежат в известном прямоугольнике R, каждый следующий front может изменить `.r` лишь в dilation(R, ceil(stride)+1): дополнительная клетка обязательна для LINEAR source filtering. Для гарантии можно добавить ещё клетку консервативного halo. На каждом шаге расширять R, а не применять постоянный brush bbox.

Критическое условие: оба ping-pong буфера вне R уже должны иметь именно оригинальные `.r=1, .g=heightAt(destination), .b=source.b, .a=1`. Первый и второй полные проходы обеспечивают обновление `.g` и `.a` в обоих буферах. Нужно отдельно доказать исходную насыщенную `.r` за R и неизменную `.b`; они не следуют из bbox кисти автоматически. INWARD front имеет seed вне domain по всему полю, его нельзя ограничивать этим правилом. Не добавлять полные copies ради ROI без измерения их цены.

При full1536 площадь 2,359,296 invocation/pass. Для конкретного ROI 600×600 экономия максимум 1,999,296 invocation/pass (~85%); это лишь условный пример, не измеренная площадь и не forecast GPU gain. При крупных stride область быстро становится полной, тогда fallback полный draw. Считать actual scissored/full pixels, отдельно OUTWARD и INWARD calls. Height/climb caches уже имели GL1536 parity FAIL — не использовать их для обоснования этого варианта.

Proof gate: исходные seed rect из plan metadata, saturation/`.b` source checks в отдельном QA cohort; odd/1536/nonzero origin, NEAREST и LINEAR sources, каждого шага все4канала exact, затем fixed400 все26roles/material/export/history. Никаких readback в production-path. До такого доказательства это feasibility, не готовая оптимизация. Default OFF; hardware не запускался.

CPU support oracle `front-support-oracle.mjs`: 72 synthetic Q8 fixtures, sizes17/31/64, stride1/2/4, seven steps each, full versus conservative bounded support exact. All72 missing-expansion negative controls differ. This proves only support induction for a synthetic nonnegative stencil; it does not prove production GLSL arithmetic, seed metadata, hardware interpolation or world-paper `.g` parity.

Existing broad timer raw captures only method/call/stack/times, not `max`, source-role or uniforms. OUTWARD/INWARD both call the same local `frontStep` stack: their measured 687.573ms cannot honestly be separated from this recording. A future timer cohort needs explicit pass-direction metadata; do not infer the split by call index without captured plan.
