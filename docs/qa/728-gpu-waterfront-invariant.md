# #728: fragment-invariant film в water front

Отдельный диагностический program, OFF по умолчанию:
`engine._watercolorPasses.warmWaterFrontInvariant()` перед записью;
`engine._watercolorPasses.diagnosticWaterFrontInvariant = true` перед рисованием.
Обычный OFF путь не компилирует дополнительный program. Init/restore/destroy
освобождают optional program; остальные programs и scheduling не меняются.

Внутри восьмисоседнего min-plus шага исходный shader повторно вычисляет
film = smoothstep(lo, hi, max(texture(film, uv).a, foreignWet*texture(foreign,uv).r)).
Ни uv, ни uniforms, ни texture не меняются между итерациями fragment. Кандидат
переносит буквально то же выражение перед циклом; edge, relief, каждый min и
окончательная RGBA8 запись не меняются. No extra intermediate Q8.

При восьми принятых соседях shader source содержит две центральные выборки
вместо шестнадцати: максимум на 14 texture fetches меньше на fragment за шаг.
Это не доказанное сокращение GPU инструкций: компилятор мог уже hoist выражение.
Если все соседи недоступны, кандидат вычислит film без использования; это может
добавить работу на тех fragments. Поэтому этот кандидат строго для аппаратного
A/B, без заявления о выигрыше. Float shader compiler optimization тоже требует
побайтного сравнения, даже при идентичном математическом выражении.

`waterFrontStats` содержит baseline/invariant draw count и pixels (sum w*h);
все эти размеры и counts должны совпадать между парными scenarios. Количество
действительно исполненных fragment texture instructions этими counters не измерено.

Не выбран precompute height/noise в RGBA8: исходные bilinear height samples
и highp noise не обязаны быть кратны 1/255. Дополнительная запись Q8 меняет
hj−hi, edge costs, min-пути и затем silhouette/rim. Float textures потребовали
проверки поддержки/linear filtering и добавили бы memory/texture fetch cost.
Также color/deposit fusion или объединение chronological contacts не рассматриваются
как exact: shared pre-contact pigment и Q8 каждого step — часть текущей модели.

Проверки: два CPU tests проверяют неизменный остаток shader после переноса
единственного выражения, отсутствие cold OFF link, одноразовый warm link,
одинаковое количество draws и reset optional cache при program init.
Аппаратные gates: salted compile Samsung, no GL errors/loss, all material fields
и finalPNG identical OFF/ON на каждом GPU, brush400 water/pigment/foreign-water,
cross-tile и undo/redo; затем coarse-stage GPU timing и end-to-end frame intervals.
