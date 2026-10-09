# Surface: пауза canonical очереди — settle между rAF

Actual frozen source `c98a6f32`, QA wiring `a812ca5c`, один разрешённый5367 прогон. Четыре функциональных starts, DOWN finish0, healthy nonempty endpoint сохранён; общий FAIL из-за единственного thumbnail POST403. RAM pre2192/min970/post1641MiB. Own pages закрыты, Surface RELEASE. Endpoint SHA `9c7600d5ff165bd4d7f886bf3e6fc6dca398763abfb8de59aa9b23a26d6be2b9`, nonzero248663; same-tape parity не проверена.

768-record cap заполнился после~2834ms, содержит первые **три** DOWN, но не четвёртый. Это явная граница диагностики, не отсутствие четвёртого старта: исходный scenario подтвердил все четыре и сохранил packed tape. CPU DOWN duration33.3/10.1/5.2ms; nested onStart31.1/9.6/4.8 (полные значения в raw). Первый `_display` return после них:40.9/60.0/27.5ms от DOWN start. Это submission на main thread, не физическая видимость пигмента и не аппаратное время пера.

Главная локализация: FIFO.advance151 calls, **143 вызова blocked из-за settle=true**. Его summed inclusive CPU22.3ms, max6.2ms. Settle.advance143 calls суммарно35.7ms, tick145calls41.4ms/max4.5ms. Nested inclusive totals НЕ суммировать. Эти значения измеряют CPU submission/driver-call duration, не GPU kernel execution.

Первый SettleQueue.start завершился19883.1ms; следующий canonical advance начался21473.1ms —1590ms спустя. В интервале main thread не стоял1.5s: rAF sampler maxgap49.9ms, ни одного gap>100ms. Canonical FIFO повторно проверял blocked, solver выполнял небольшие шаги по кадрам. Это очередь, сериализованная за многокадровым settle, а не доказанный длинный pointer handler/fence. Четвёртый QA fullidle wait нельзя выдавать за пользовательскую latency.

Observed~1advance/tick согласуется с default scheduler: CanonicalFIFO blocked() удерживается при settle; SettleQueue без opt-in batching/continuation advances обычные steps по rAF. Runtime scheduler flags явно не записывались, поэтому exact active option census остаётся open. GPU backlog не измерен; отсутствие большого CPU/rAF stall не доказывает мгновенную GPU execution. Existing fences отдельного предыдущего cohort всего8.6ms, дедупликация0.2ms не приоритет.

Практический следующий кандидат: проверить уже существующий bounded queue batching/continuation path на **том же** taped scenario с actual option census, canonical op order+field/material parity и separate CPU/GPU/RAF observations. Нельзя ускорять за счёт изменения solver steps или убрать GPU work budgeting. Для диагностики4th нужно сохранить rare callstarts/ends и state transitions с aggregate blocked counts вместо сотен одинаковых blocked records; cap не расширять бесконтрольно.

Raw: `temp/fast-watercolor-night/owner-scheduler-surface-20261009/report.json`, full tape/partial/failure PNG. Результат полезен для scheduler attribution, не для художественной оценки/production claim. Никаких новых аппаратных запусков после RELEASE.
