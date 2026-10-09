# Множитель рельефа в статическом кеше: CPU кандидат

DEV default OFF: `adapter.diagnosticStaticFrontCacheFactor=true` действует только вместе с существующим `diagnosticStaticFrontCache`. Отдельная фабрика и ключ отделяют фактор от прежнего масштабированного climb. Изменений scheduler, quantum, порядка проходов и Q8 storage boundaries нет.

Исходная формула: `climb = u.coefficients.x * (1.0 + 4.0 * smoothstep(...fbm(...)))`. Новый RG32float G хранит ровно правый f32 операнд скобок, consumer выполняет тот же multiply с текущим climb. Нет деления прежнего climb30 для получения climb20. RG32float сохраняет f32, в том числе исходный multiply для +0/-0. Чтение бумаги/noise/геометрии сохраняется; только climb исключён из нового factor key. Прежний scaled key остаётся прежним. Режимы не дают взаимных false HIT.

Бюджет 18 MiB включает отложенное освобождение через существующий ACK. Retire запрещает вторую физическую аллокацию до ACK; device loss/encoding exceptions используют существующее освобождение. Дополнительных fence/Promise нет.

CPU: literal reverse WGSL identity, 4097 RHS f32 operands × climb +0/-0/20/30; cache epoch/geometry/mode separation, retirement budget; actual dispatcher pipeline source/unique key/uniforms/dispatch. Это не доказательство арифметики GPU компилятора: точные 10 Q8 roles и endpoint OFF/ON ещё нужны. Никакого нового аппаратного замера в этом шаге.

Tail attribution: семи pending scope из интерактивного 3099 нельзя автоматически приписывать timestamps другой пары bcb1. Соответствие inward/rim пока условно на основе совпадающих ordinal/count; детерминированная реконструкция исходного material plan остаётся отдельной проверкой.
