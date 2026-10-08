# #728: OFF-кандидат GPU audit / in-place moment transport

Стенд5354/source1c9 неизменён. Новый вариант доступен только явным constructor option `diagnosticMomentGpuAudit`; текущие Room callers его не передают, defaults OFF. `MomentTextureInputs.diagnosticInPlace` также OFF.

Pack считывает все ROI материалы/общую воду/contact и завершает отдельный compute pass. Он считает ВСЕ нарушения C≤P.B в глобальном atomic counter. Последующие четыре pair passes видят итоговый counter: любое нарушение сохраняет все records. Unpack читает storage buffer и пишет original P/C только в ROI; sampled P/C больше не bound в этом pass. Требуются sampled+storage usage, разные P/C и отдельные water/contact. P.R/G/A сохраняются буквальным integer pack/unpack; outsideROI не записывается. Никакого shader/model изменения.

Исключаются CPU два полноразмерных material readbacks, четыре full-texture копии и два1024² scratch leases. Остаётся четырёхбайтовый counter readback/queue wait, поэтому это ещё наблюдаемый диагностический путь, не доказанная физическая latency. Film rebase выполняется отдельным owner quantum ТОЛЬКО после counter0 и assertLive. Invalid сохраняет старые film base/stroke buffers и публикует unchanged source с explicit unsupported report. Retirement после counter останавливает дальнейшую публикацию; destroyed leases не возвращаются в уже уничтоженный pool.

Unit gates: OFF, sampled/storage alias guard, pack→4pair→unpack без full copies, один contact lease и deferred rebase, GPUcounter0/1 без CPU material чтения и conditional rebase. Hardware texture parity copy-vs-in-place, invalid wholeROI/outside preservation, actual multidab/replay всё ещё требуются; ускорение и художественные качества не заявляются.

## Surface texture gate

8 октября 2026: frozen source `d5c83981`, bundle35761bytes/SHA256 `8a9563211b7f1ca91ceb93d2cd3c1b794550b7685c52318ac2a51694046cd467`, HTTP passport проверен. Один bounded cohort: copy/in-place для zero-rate fullROI, coupled fullROI, invalid partialROI, coupled partialROI. Actual textures17×13, partialROI11×7 с offset2,2. Все8 arms: полный P/C byte comparison с CPUoracle exact0/max0, outsideDifferences0, GPUerrors[]. В invalid arms counter1 и ВСЕ материалы unchanged; остальные counter0. Суммы каждого P.RGBA/C.RGBA канала до/после совпадают точно, включая ненулевые P.R/G/A.

Raw: `temp/fast-watercolor-night/moment-inplace-surface-20261008.json`. RAM1933MiB preflight/min1735/после закрытия1808; собственная страница закрыта, Surface явно освобождён. Это аппаратное доказательство небольшого texture operator/pack/unpack, а не actual Room multidab/replay или быстродействия. Frozen5354 не менялся; constructor candidate остаётся OFF.
