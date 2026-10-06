# #728: initial combined QA

Веткаagents/728-combined-qa, source436b2c1c: прежние rect-original4fdf04e2 и tone0.50/0.12 плюс CPU wetOverlayPixels67c5f6e8. Runtime diff против root e8af6155 по apps/packages/scripts/config/package-lock пустой. Ring/queue physics кандидаты сюда не включены. HEAD предыдущих QA/docs/gallery отличается, исходники совпадают.

Полный required CPU проход:286файлов/3535unitPASS,198.80с,maxWorkers2,testTimeout15s; полный npm run typecheck(workspaces+e2e+scripts)PASS; lint exit0 с сохранёнными предупреждениями; map:check67модулей947файловPASS; map:rules0ошибок/4старыхпредупрежденияPASS. Реальные существующие зависимости этой рабочей копии, никаких symlinks/install/skip/new threshold. Логи/команды/SHAs/resultJSON temp/728-combined-checks.

Frozen ownHOME5316/runtime initialcombined: index d9409eb995be739801809fb641d98592d660e5ec9093b9eec6e901dc3187e4fa; shaders8a4df66cc6a0ee01413c69a5f35a3560bb0fdae844ff1f9edc0f4a264cac6e75; wetOverlayPixels0ecb6370bec1dae63df0e6eab898807d27248a6f917a1ece7dad52a80e93ce54. Protected5314/otheruserstands не менялись.

Hardware combined queued/reconnect/snapshot controller подготовлен temp/history-parity/combined.mjs, source passports mandatory; следующий GPU запуск после отдельного parent grant. Пока этот раздел не заявляет его прохождение.

## Actual Room: queued strokes и reconnect

Завершён исправленный контроллер на настоящей Vega: физический холст 640×480, кисть32, два автора в одном слое, восемь native штрихов + девятый во время контролируемого Socket.io reconnect. Четыре операции действительно попали в очередь при активном settle. Vite HMR не отключался. Все журналы авторов совпадают по payload/serverSeq/state; GL0, холст непустой.

До Dry существует пользовательская мокрая несогласованность: burst3284px/max255 (premult max224), после reconnect3907px/max240 (premult max209). У обоих авторов слой находится в `_unsettledLayers`, wash открыт9–12с. Контроллер не выдаёт отсутствие текущего settle за завершённую согласованную мокрую заливку: `_settleLayers` откладывает пересборку открытого wash до WASH_JOIN_MS100000.

После штатной ordered Dry unsettled=[]/wash=null; Dry, Undo, Redo и fresh rejoin дают точное совпадение обоих canonical PNG,0px/max0. Это подтверждает dry endpoint данного короткого сценария, но НЕ объявляет мокрый опыт согласованным и НЕ классифицирует его как регрессию новых rect/tone без baseline8aa.

RawHOME: `680-water-wet-tone-qa/temp/history-parity/combined-queue-final/`, все phase PNG/report сохранены; VPS report `temp/history-parity/combined-queue-final.json`. Собственный Chrome закрыт finally. Предыдущие три остановки — ошибки fixture (закрытие HMR и использование browser global в Node), их raw сохранены отдельно; source/model не исправлялись по этим ошибкам.

## A4: фактический stored snapshot

Отдельная настоящая Room `0bn8goAH`, Fine1754×2480 (room metadata и export dimensions), один native мокрый штрих, штатная Dry, затем101 реальный UI opacity ACK. Это проверка границы сохранения100 операций, а не100 рисующих штрихов. Получен actual persisted layer snapshot seq100/hashc201872e…; fresh ledger coverage(layer-1,100), refused=[].

Canonical PNG перед rejoin и после восстановления snapshot совпадает точно; Redo после реального Undo возвращает тот же PNG точно. Undo возвращает исходную непрозрачность до101-го изменения точно (совпадает с более ранним Dry PNG). Во всех пяти фазах GL0/nonempty5346, finally Chrome закрыт.

Fresh журнал содержит4 entries против прежних103 из-за covered-prefix представления: сохранённые paper_dry seq2 и opacity tail seq103 совпадают полностью; исторические backfill stroke/opacity не имеют serverSeq в этом представлении. Whole raw journal identity здесь НЕ заявляется. Фактические snapshot metadata/coverage/raw retained entries сохранены, expiry-ignore или ослабления pixel oracle не добавлялись.

RawHOME `680-water-wet-tone-qa/temp/history-parity/combined-snapshot/`; VPS `temp/history-parity/combined-snapshot.json`. Источник тот же e8af6155/436b2c1c. Это не full-history heavy snapshot/performance soak и не многослойная snapshot проверка.
