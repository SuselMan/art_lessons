# #728: подготовка контактов и ограниченные продолжения

Исходник Samsung: 58ac2510 (код cbe52652), собственный5311; indexSHA2eef69c4, Plan1c14f7d9, Queue87966479, shaderbf97bd94. Настоящий Adreno650/Chrome154. Standalone engine с actual pen callbacks/rAF, A4Fine1754×2480, viewport768²; это не RoomFPS. FIFO/sourceRebase/phase включены, fibres выключены. Новые жесты независимы, поэтому их время не доказывает причинный эффект split.

Native loaded400 шесть секунд и nexttouch100 через20мс: splitOFF1328 и splitON1331 завершились, GL0, два записанных stroke, metadata13/owner14 действительны. ON новый touch пришёл при canonicalPending=true, gesture512мс. MaxRAF100.2/100.3мс; улучшения максимума не доказано. Tail приблизительно33→53с: split без batching увеличивает число кадров и ухудшает throughput. Первая ON попытка1329 имела слишком короткий30с idle watchdog; её FAIL сохранён. Retry1331 с60с watchdog и read-only5с progress показывает next652/1236→959/1406→owners0/queuefalse; deadlock не подтверждён.

Matched immutable journal1330, реальный reveal callback одинаково принудительно включён в обоих плечах, без native/remote concurrency: nineteen полных прямых byte comparisons P/C/V/coverage и wholeRGBA exact0. Nonempty material/solvent guards и реальные carry14/preview8/late4 проходят. Split вставил десять presentation continuations. Это ограниченный физический oracle, не FIFO lifecycle/performance доказательство.

Matched async journal1333 со splitON: существующее front+contact batching cap4,4ms budget и syncGpu после каждой единицы сократило solver barrier34.08→15.10с. Все19 byte comparisons остаются exact0. Presentation callbacks796→316 следуют неизменному150мс wall-clock gate; физические carry14/late4 не меняются. Большие RAF401/786мс включают тяжёлые конечные readbacks и CPU byte comparisons, их нельзя выдавать за scheduler budget failure или обычные drawing frames.

Prepare attribution1332: первое prepare51.2мс; fieldFor0.3мс, pool.acquire3вызова0.1мс, clear0, framebuffer checks0. Внутри было286446 Math.log вызовов (счётчик, без отдельного таймера каждого вызова). Следующее prepare2.6мс/2957logs. Это тёплый CPU контактный путь, не доказанная задержка выделения GPU field. Обёртки добавляют overhead, поэтому абсолютные времена не заменяют чистую paired оценку.

Локальный кандидат вычисляет максимум encoded B byte, затем ровно один исходный logarithm. Преобразование монотонно на всех256 значениях: выбранный результат IEEE754 совпадает с прежним победителем, положительный ноль сохранён. Pulse count/gain/order, fields и shaders неизменны. Exhaustive65536 ordered pairs, реальные overlapping contacts/scale1/2, Plan command-order gates проходят;43tests и wholeweb TypeScript PASS. Это убирает повторный log, но не стоимость brushDragField создания.

Артефакты VPS: `728-plan-quantum-fifo/temp/combined-plan14/`, большие/восстановимые копии HOME: `680-lifetime-hardware/temp/plan-quantum/`. Новое включение split по умолчанию не предлагается; native batching/active/newtouch и combined loss/rebuild gates продолжаются.

## Дополнение: чужая неподтверждённая краска

Перед рекомендацией zeroContacts выявлен пробел разрешения: `appendPeerLiveDabs` для watercolor не рисует physical P/C, однако nonWC peer при idle рисует прямо на layer до Operation Log. Настоящий CPU engine test с pencil packet `paintedTotal=1/committedOffset=0`, затем local water finish получил skipContacts=true до исправления. Исходный FAIL сохранён в `temp/contact-exposure/peer-baseline.log`. Это пробел консервативного доказательства, не доказанная физическая P-регрессия pencil.

Узкий guard теперь отклоняет разрешение при same-layer peer watermark `paintedTotal > committedOffset`. Другой layer не блокируется. После исправления оба реальные Engine сценария и существующая history proof suite проходят:22tests + whole web TypeScript PASS. Это не разрешает defaultON без реального peer/Room hardware gate; queued viewport previews сами по себе physical не пишут, но исполненные неполные peer gestures ловятся watermark.

## Отрицательный CPU опыт: row hoist

Проверено вынесение постоянных `py`, `py*sin/cos` и GL rowoffset за внутреннийx-loop, без перестановки Float32 accumulation/Math.exp.16deterministic rotated/aspect/offscreen/overlapping return fields (30976bytes) совпали полностью с исходными SHA256;11tests и TypeScript прошли. Node22 на HOME:15paired alternating samples,16fields×5 за sample, median3.045→3.018мс (~0.9%), разброс больше эффекта. Это не доказанное ускорение. Кандидат source/test сохранён в `temp/contact-exposure/brushDrag-row-candidate*`, goldenvectors и CPU benchmark там же; изменение не оставлено в production-коде. GPU не использовался.
