# #744: ускорение Undo открытого мокрого слоя — предложение, не реализация

База анализа: #747 prototype `b78fd60f` + eraser preflight `7c2406e6`. Изменений runtime по этому предложению нет. Дождаться аппаратной проверки residency; сначала измерить readback, затем выбирать место capture.

## Узкий корректный fast path

Перед новым собственным физическим жестом сохранить resting source текущего слоя + уже готовый канонический goal. Переносить только CPU bytes; не клонировать GPU texture. Метаданные: layer identity, исходный logical timestamp/boundary/gesture/prevDab, generation, полный неизменяемый effective-material prefix слоя, доступность snapshot baseline. Сохранять checkpoint до первого chunk данного strokeId, а не перед каждым chunk.

При Undo сначала штатно применить control к журналу. Быстрое восстановление разрешено только если **вся получившаяся effective material history слоя точно равна сохранённому prefix**, кроме метаопераций Undo/Redo/Revoke. Проверка только неизменности начала недостаточна: A wet → CP → B gesture → Dry → Undo B оставляет действующий Dry, и возвращать мокрый CP было бы ошибкой. Поздние hide/Dry, shape/eraser/transform/merge/clear также должны исключать shortcut. Вода-only projection под исходным operation ID отличается от исходного объекта; это обязательное invalidation, а не сравнение IDs.

Можно использовать принцип reference proof из `closedWatercolorCheckpoint.ts`, но убрать требование закрывающей Dry и заменить проверку прежнего prefix внутри расширенного списка на точное совпадение **всего** списка после control. Confirmation/backfill с новыми immutable operation objects безопасно даёт false negative и обычный replay. Нельзя ослаблять до IDs: та же операция могла стать zero-pigment projection.

При успехе: отменить owned replay coroutine через finally; атомарно восстановить canonical source и goal; `dirty=false`, `goalReady=true`, прежние recorded-time boundaries. Root display получает готовый goal, а не старый raw material composite. Никакой новой Operation, Dry, публикации сетевого snapshot или пересчёта goal. Перед затрагиванием root валидировать proof и все buffer dimensions; ошибка restore должна оставить прежний display и штатный replay fallback.

## Память и место capture

Upper bound source: 10 × width × height × 4 bytes; goal ещё один RGBA8 buffer. 512px: ≤11 MiB; 1024px: ≤44 MiB. Это **арифметический предел**, не измеренный пик RAM. Часто реально полей меньше; учёт должен брать фактические arrays.

Один общий LRU budget 64 MiB вместе с parked material. Undo checkpoint — отдельный key в том же byte-budget owner, а не отдельная коллекция «ещё 64 MiB». Eviction удаляет bytes checkpoint; его proof/marker не даёт обещания fast path. Зафиксированный native target можно читать без нового solve; если `dirty`/`!goalReady`, capture должен быть пропущен — synchronous canonicalTiles на DOWN снова перенесёт дорогой solver в задержку первого штриха.

ReadPixels CPU/GPU stall пока не измерен на телефоне/1024px. Обязательные измерения отдельно: (1) source capture, (2) goal.readPixels, (3) restore/upload, (4) DOWN→первый видимый пиксель с capture/без. Не объявлять выигрыш Undo приемлемым до проверки цены DOWN. Альтернатива при большом stall — capture после готового goal в idle frame, с epoch-proof и abort при новом input. Это отдельное усложнение, не причина удерживать UI до окончания capture.

## Redo и консервативные отказы

Fast Undo не подразумевает fast Redo. Для Redo нужен самостоятельный snapshot состояния после отменённого жеста и отдельный точный proof. При 1024px две несжатые версии по 44 MiB не помещаются в общий 64 MiB; обычный replay Redo — корректный ограниченный fallback. Нельзя временно сохранять обе в скрытом unbounded cache. При 512px обе версии могут помещаться, но это оптимизация после базового fast Undo.

Foreign active stroke, retained-water ghost, undo foreign consumer, foreign Dry/hide, whole gesture across boundary, structural source dependency, snapshot coverage mutation, optimistic reorder, unknown backfill — либо точный proof нового состояния, либо обычный replay. Не пытаться вычислять provenance пигмента или геометрически «вырезать» мазок из source.

## Проверки до реализации

1. 100 resting wet operations → новый собственный жест → Undo: bytes source/goal равны cold replay, ноль replayed strokes и новых native goal computations.
2. Foreign contribution после сохранения CP → Undo автора: retained water projection исключает CP; результат cold replay.
3. Новый gesture chunk → foreign Dry → второй chunk → grouped Undo: CP отклонён из-за оставшегося Dry, без оживления воды.
4. Pending confirm/reorder и late hydrated Undo: proof не принимает изменившийся prefix даже под прежними IDs.
5. Force small byte budget, 8 layers, eviction CP vs parked material: total accounted arrays≤budget; любое вытеснение сохраняет корректный fallback.
6. Restore allocation failure/context loss: no partial display/source publication; coroutine leases освобождены.
7. 1024px Surface/Samsung: capture DOWN и Undo latency измеряются отдельно; iPad остаётся непроверенным без активного Safari.
