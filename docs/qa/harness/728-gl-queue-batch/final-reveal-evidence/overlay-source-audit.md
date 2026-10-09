# Почему preview ring переживает publication

## Собственники и порядок

`OwnedPreviewRuntime.material` строит owner pending из immutable original + preview paired moments. Его residual reconstruction — source1024 + transported128 − initial128, componentwise clamp. Actual high128 уже подтвердил отрицательные моменты и различающиеся отрицательные C channels; источник цветных выбросов остаётся предметом атрибуции.

В `owner-fifo-install._finishRibbonStroke` canonical `_revealWash` оборачивается: `(preview.visibleField(owner) ?? morph.visibleField(owner)).copyTo(held.before)`. Значит, при publication canonical pixels уже готовы, но visible before содержит последнее вычисленное preview, включая его форму кольца. Это связано именно с visual role, не с canonical moment inputs. Затем owner preview retire отсоединяет pending; canonical reveal продолжает показывать held.before.

До `startedAt` target=`reveal.pending`; после `startedAt` target=canonical tile. `_advanceWashReveal` выполняет:

- dt=min(max(now−frameAt,0),40ms);
- remaining=duration−max(now−startedAt,0);
- при remaining>0 step=1−max(0,1−dt/remaining)^3;
- при remaining≤0 step=1;
- B_next=(1−step)*B_old+step*T.

Для pending target без landing clock step=1−exp(−dt/1400). Progressive display hold=1 пока real elapsed<duration, затем0. В actual run duration отсутствует, используется default8000ms. Поэтому publication screenshot — canonical ready, но ещё old-preview layer; final screenshot послеhold0 — canonical tile.

## Premult alpha

Reveal fragment без motion: C=(1−hold)*After+hold*Before, затем все четыре компонента умножаются на layer opacity. Progressive hold1 означает display B_current, рекурсивно приближаемый к T. Для валидных конечных premult inputs (0≤RGB≤A) convex mix сохраняет эту область. Unpremult color — alpha-weighted convex mixture входных цветов. Такое смешивание не создаёт насыщенный красный/зелёный цвет из двух пурпурных конечных inputs. Motion sampler может сместить видимый before на несколько texels; это не объяснение большого ring radius44 без анализа источников.

Actual comparison одной operationTape: publication при pendingfalse/reveal1 показывает бледное scalloped кольцо; после hold0 большое отдельное кольцо исчезло, осталась слегка угловатая мягкая граница. Это доказывает, что final canonical и показываемый preview различаются. Не доказывает, что анимация хороша, и не доказывает exact locus возникновения каждого spike.

## Expiry и stall

`_sweepReveals` сначала вызывает advance и только затем удаляет expired before. При remaining≤0 step1 копирует точный target. Гипотеза «в8s выбрасывается большое остаточное error без доведения target» неверна.

Проверка actual production `washRevealStep/Remaining`: после единственного frame на1000ms normalized error=(1−40/7000)^3≈0.982955; следующий frame на7990ms имеет remaining10ms, step1 и error0. Получается большой видимый скачок, но это следствие dt cap + real deadline после длинного frame gap, не ошибка порядка sweep. Ни один visual алгоритм не гарантирует одновременно ограниченный шаг каждого показанного frame и фиксированный wall-time endpoint при произвольном пропуске кадров. Animation-clock extension уменьшит jump, но растянет реальные8s; closed-form wall progress сохраняет deadline, но не убирает пропущенные кадры.

## Почему overlay-only replacement пока не решение

Замена before на исходный source либо ускорение fade просто скроют bad preview и вернут appearance dissolve, который Илье не понравился. Premult mix сам по себе корректен. Без причинного pixelwise source proof нельзя объявлять новую overlay форму исправлением. Сначала нужен качественный положительный paired preview/source material, затем отдельная bounded temporal проверка передачи в canonical.

CPU tests: exact target on expiry, near-deadline stall one-frame jump, convex premult range. Canonical/runtime не изменялись. Endpoint error диагностировать следует парой current before/target в одном owner/state до следующего display; sparse screenshots и functional undo/redo это не заменяют.
