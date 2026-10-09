# PaperWetness CPU fork — isolated DEV proof

`captureDiagnosticSnapshot(maxRecords=8192)` проверяет общий record budget ДО
copy: committed+pending cellcount, layer-map count, drained-set count. Абсолютный
разрешённый cap65536. Это cap количества записей, не измерение heap bytes.
Opaque frozen version-1 token зарегистрирован в private WeakMap. Version —
schema version, НЕ live mutation revision. Поддельный/скопированный token rejected.

`forkDiagnosticSnapshot(token)` возвращает независимый PaperWetness: exact
committed/pending WetCell records (w,at,cx,cy,p), drained set, peak/peakAt, bounds.
Никаких clocks, decay, prune, implicit live restore/merge. DEV-only methods;
обычные deposit/sample/raster/control методы и Engine не меняют свою семантику.

Тесты actual class: identical explicit-time sample/nib/rasters/pool/peak/bounds,
future и late timestamps; повторный drain (preserved drunk-cell identity), UP
commit; два независимых forks; live clear после capture; capacity/forged-token/
PROD fail-closed. Fork поддерживает model/readset proof, НЕ GPU-material freeze.

## Runtime HOLD

Нужны recorded times и границы каждого batch: sampleUnderNib, drain/deposit и UP
commit происходят отдельно. Один DOWN timestamp недостаточен. Foreign payload
Date→monotonic age conversion также сохраняется явно. Fork mutations нельзя
просто overwrite в live: peer history, Dry/Undo и текущий owner требуют отдельного
ordered reconciliation protocol. Новых таких runtime протоколов этот commit
не вводит. Engine watercolor admission по-прежнему явно unsupported.

Проверка: 36 combined tests PASS (actual Engine admission/chunk + PaperWetness), app TypeScript PASS. Дополнительный oracle: 12 fixedseed ×16 batches с explicit nonmonotonic times и pool changes; output Float32/model read equality. Pool — поле p того же cell record, отдельной записи не добавляет.
