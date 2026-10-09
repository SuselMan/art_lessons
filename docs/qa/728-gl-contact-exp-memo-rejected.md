# Per-field exp memo: отклонён

CPU-only `BrushDragExpMemo.ts` сохраняет existing hoist expressions, Float32/Q8 writes и `Math.exp` исходного argument. NumberMap живёт только в одном вызове field, без global/stroke reuse. `+0/-0` объединяются, поскольку exp обоих равен точно1; nonfinite/NaN вызывают прежний native exp напрямую. Это не LUT/аппроксимация/recurrence.100adverse cases+workspace retention и отдельные NaN/Infinity/signedzero cases PASS.

Одна matched warm серия настоящей приватной2stroke ленты: fulloperation identity и30ordered canonical flow bytes exact PASS. Восемь чередующихся измеренных samples после двух warmup:

- Existing hoist median21.43ms.
- Memo median66.28ms, около3.1× медленнее.

Map lookup/insertion/аллокации здесь значительно дороже сэкономленной части native exp.34.9% совпадений не превратились в gain. Кандидат отклонён немедленно; другие cold/device/глобальные cache эксперименты не запускались. Runtime/default/стенд не изменены.

28fields создают218616 entries суммарно, maximum12839 entries одновременно наfield. Только логические double key/value пары занимали бы3,497,856байт суммарного allocation и205,424байт peak; реальный Map overhead/boxing/buckets больше, retainedRSS не измерен и эти числа не названы фактической памятью процесса. Map освобождается по достижимости после каждого field, GC scheduling остаётся неизвестным. Raw arguments/operation payload не опубликованы. Compact samples/source/fixtureSHA: `contact-exp-memo-summary.json`.

Этот отрицательный результат достаточен, чтобы остановить memo направление. Прототип остаётся локальным QA evidence, не продуктовым кандидатом.
