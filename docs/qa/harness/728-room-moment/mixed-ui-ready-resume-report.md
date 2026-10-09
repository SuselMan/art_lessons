# Исправленный readiness rejoin: harness seq guard

ONE zero-input rejoin, authoritative owner/content/snapshot/incomplete readiness wait прошёл; последующий strict seq guard отказал до pixel readback. Фактический readiness объект не был сохранён до assert — исправлено. Продуктовый pixel mismatch этим запуском не проверялся. Errors/network errors0, fresh admission2095/closed1974MiB.

Code evidence: roomStateHandler повышает latestKnownSeq только по tailOperations; слой из snapshot seq5 без tail может законно иметь latestKnownSeq0. Это observed operation watermark, а не per-layer restored coverage. Исправленный QA сохраняет оба значения отдельно и проверяет SnapshotLedger.isCovered(layer-1,5)=true и isCovered(layer-1,6)=false. Runtime/core не менялся. CPU readiness negatives PASS. Повтора без новой allocation нет.
