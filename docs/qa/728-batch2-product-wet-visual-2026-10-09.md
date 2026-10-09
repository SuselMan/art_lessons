# Batch2: product-matched joined-touch и три wet кадра

Один Surface cohort обычной Room: source `c2ee56456c27edf619de2371a7406fc703570589`, observer `322fbfa0624acc75fc40aeb56304310a2a841055`, explicit qaPhysicalBatchTwo=1 и qaJoinedTouch=1. Actual model census: joined=true, deferred/mixed/async/material=false; прочие измеренные source/scheduler/AB эксперименты OFF. Предыдущие стенды и defaults не менялись.

Пять400px жестов вода→фиолетовый→жёлтый завершились, GL0/lostfalse, DOWN finish0. DOWN CPU28.5/7.6/1.9/5.6/5.2мс; первый возврат display26.9/6.9/1.6/4.7/4.7мс. Эти возвраты не показывают момент физически видимого пикселя. В этом cohort screenshot observer существенно вмешивается во временную шкалу; performance сравнение с предыдущим joined-OFF измерением недопустимо.

Три actual viewport PNG сняты после UP первого pigment stroke. Requested delays0/500/1500 не достигнуты с такой точностью: UP→ACK1141/2290/3024мс. Screenshot polling/write/ACK удерживает только следующий gesture, solver продолжает работать. Всего896397B, write-before-ACK, вне latency measurements. В кадрах видна непрерывно непустая тёмная фиолетовая масса; в поздних появляется светлый круг слева. По трём разреженным кадрам нельзя доказать плавный morph или отсутствие jump/handoff. Изменилось29944 /28904 пикселя paper viewport ROI между соседними кадрами; это display RGB difference, не масса пигмента или оценка натуральности.

Public UI Dry→meaningful Undo→exact Redo, actual target states/ACK/persisted IDs PASS. Dry/Redo whole SHA `c165478b9236744e9bc1d78f242222db7e61726834fe9d6f326ec8e0f02eed94`, Undo `e9b054ec2a72e51402e0d37ef78ecb7e0841b2f581a56b2cf84d3596f1528a03`.

**Общий verdict FAIL** из-за раннего thumbnail403, без suppression. Ожидание room_state self participant перед navigation не устранило отказ: первый POST403 снова предшествует server created-room marker, далее четыреPOST200. [Caller ещё не установлен; DEV StrictMode cleanup — проверяемый кандидат](728-live-fixture-thumbnail-race-2026-10-09.md). Это не отменяет отдельно сохранённые functional/history результаты и не является художественным PASS.

Raw, PNG и visual-diff: `temp/fast-watercolor-night/physical-batch-wet-joined-on-surface-20261009/`. RAM min1213, после own context/transport close1610MiB. Пользовательские direct Room ссылки остаются в приватном service registry;5376 и5377 сохранены. Дополнительный аппаратный прогон не запускался.
