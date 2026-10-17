#787: следующий bounded профиль загрузки

GPU ещё НЕ запускался. После root freeze: отдельная fresh512fixture, `QA_LONG_PROFILE=1 QA_LONG_COUNTS=1000 QA_LONG_MODES=normal QA_SOURCE=<issued freeze>` через обычный private runner и `../728-night/samsung-long-wet-load.cjs`. Один случай, те же10авторов×8dabs/noDry/45с. Оба flagsOFF/300MiB. Не использовать Playwright browser init.

Raw Page init script устанавливает accessor `__engine` до гидратации. При назначении dev bridge синхронно оборачивает instance log resolver hit/miss, layerPixelOps, generator next, controller source/accept/finish/materialRender/present. Если initialLogCount не0, профиль отклоняется как запоздавший. CPU bucket nested — не суммировать. Generator сохраняет next/return/throw и переданные значения. Небольшой Node test проверяет прозрачность отправки/возврата, resolver hit/miss, счётчики и stop.

EXT timer повторно использует проверенный dual WebGL1/2 adapter. GPU program timing — агрегат по shaderSHA/programbatch, НЕ per-op GPUtime. Per-op содержит только CPU submission ms/draw count/id; sampler/shaders/пиксели не меняются. Нет readPixels/gl.finish до конца measurement. После target-ready hookstop завершает queries, затем обычный harness читает actual и fullAPIoracle. Readiness timings сохраняются ДО diagnostic poll. Потолок queries65536; disjoint/unmeasured/incomplete делают GPU attribution неполным, не скрывать. На Adreno EXT может отсутствовать — честно draw/CPU-only.

Longtask PerformanceObserver ставится на new-document, записывает start/duration/max, без forceddisplay. Firstdraw+2RAF остаётся только partialvisible proxy. Обязательный canonicalbeforeoracle0diff и полный API ID/contentproof остаются.

Отрицательный CPUprobe `boundary-scan.cjs <saved report.json>` воспроизводит ровно findIndex+slice/filter _ribbonDabsWork по записанным ID/type, все done/noDry и условный одинаковыйlayer. 1000операций≈20ms на VPS, не вся физика/геометрия/Adreno. `boundary-scan.json` хранит отдельный rerun. Это не объясняет исходные12.8с и не является основанием добавлять кеш.
