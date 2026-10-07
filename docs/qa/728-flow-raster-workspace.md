# #728: временные массивы eager brush-flow raster

Кандидат `engine._settlePlan.diagnosticReuseFlowRaster = true`, default OFF.

В prepare исходный eager brushDragContacts создаёт три Float32 arrays на каждый
chronological contact: vx/vy/weight, затем собственный Uint8 RGBA payload.
Кандидат имеет один workspace только на этот синхронный prepare. Ёмкость растёт
до largest field; каждый contact использует prefix views точной длины width*height,
обязательно zero-fill всех трёх views. RGBA payload по-прежнему выделяется отдельно,
никогда не alias scratch; все queued uploads сохраняют независимые immutable bytes.

Арифметика, порядок dab/y/x, каждый Float32 assignment и RGBA rounding не меняются.
Это уменьшение allocation/GC pressure, НЕ GPU pixels или solver steps. Zero-fill
memory traffic остаётся; не обещается выигрыш CPU wall/latency до профиля.
Lazy suspended generator path специально неизменен: разделять workspace между
генераторами небезопасно без эксклюзивного lease/cancellation owner.

flowRasterStats: allocations (число новых Float32 arrays), reuses (контакты без
роста capacity), bytesAllocated (сумма новых backing stores), bytesRequested
(объём исходных массивов без reuse). Разность requested−allocated — сокращение
выделенной памяти, не уменьшение количества арифметики или загрузок GL.
Workspace после prepare не удерживается постоянным пулом/историей.

18 тестов проверяют разные dimensions/aspect/angles, возвратное движение,
независимые retained output payloads, shrinking/growing prefix и zero-water reset,
точное совпадение chronological contact results с исходным producer.
Hardware gates: тот же count/bytes flow uploads и final fields/PNG при OFF/ON;
heap/GC/prepare self-time и touch latency записывать парно без изменённого scheduler.
