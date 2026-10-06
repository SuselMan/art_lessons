# #728: первая копия короткой акварельной комнаты

Срез исходников: agents/728-night-combined, eb209d96; исследование 06.10.2026 22:05 UTC. Кандидат политики и клиентский retry подключены локально; production не изменён.

## Установленная причина

KJc0OoVo имеет 47 операций и не имеет сохранённого снимка. createSnapshotUploader в snapshotSync.ts принимает только точные границы SNAPSHOT_SEQ_INTERVAL=100. restoreRoomState.ts пытается bootstrap тем же методом; 0→47 не пересекает границу, 0→113 пересекает, но намеренно не публикует пиксели113 под ложным seq100. Сервер snapshotStore.saveSnapshot также отказывает любой seq не кратный100. Это объясняет невозможность первой копии такой комнаты при текущей политике, но не заменяет измерение сетевого join.

SnapshotIO.bake отказывает через _snapshotQuiet при очереди операций, незавершённом settle, активной донорской воде, продолжаемом wash и rebuild. После ledger.mayPublish _snapshotSettled дополнительно проверяет unconfirmed и unsettled операции. Эти защиты нельзя ослаблять ради скорости. Сейчас attempted.add(boundarySeq) происходит до bake всех слоёв: refused bake оставляет слой без покрытия до следующей границы. Поэтому одного разрешения seq47 недостаточно без корректного повторного вызова после settle/высыхания.

## Принцип решения

Снимок ускоряет вход, но не меняет историю: его watermark обязан совпадать с последней подтверждённой операцией реально собранных пикселей. Сервер хранит их, а журнал остаётся источником истины. Не округлять seq вниз и не форсировать высыхание ради снимка.

## Предлагаемый ограниченный путь (ещё не реализован)

Первое покрытие комнаты можно сохранять на фактическом committed seq после окончания восстановления, только когда слой допускает bake. Для обычных следующих копий оставить cadence100. Если слой ещё мокрый/в очереди, сохранить возможность повторить bootstrap на его текущем фактическом watermark после освобождения; не запоминать отказ как успешную публикацию. Защита сервера: положительный seq не выше nextSeq-1, существующая структурная сверка, per-layer first-arrival dedup и явная ограниченная bootstrap eligibility. Конкурентные partial uploads и задержанные ответы требуют отдельной проверки: нельзя считать наличие одной структурной записи доказательством полного покрытия всех слоёв.

Не вводить timer, который асинхронно читает пиксели с заранее захваченным старым seq. Сам сбор пикселей и чтение watermark должны происходить в одном согласованном шаге; асинхронно допустимы лишь compression/upload.

## Обязательные проверки

- Первый join47 → первое покрытие47 → следующий join без полного расчёта; native PNG/replay PNG совпадают.
- Join113 никогда не сохраняет seq100 с пикселями113; tail114+ применяется один раз.
- Новая локальная pending операция и peer incoming между restore/settle не попадают под старый watermark.
- Open wash, donor water, settle, rebuild и contextloss отказывают без потери retry.
- Несколько слоёв, частичный refusal и два участника одновременно; никакой ложной полноты покрытия.
- Стандартные seq100/200, повторные uploads, восстановление по старому snapshot и Undo ниже его границы сохраняют контракт.
- Реальный Samsung/iPad join: network download, restore, tail/settle и готовность ввода измерены отдельно. 209→77 секунд fixed journal является вычислительным результатом, не измерением загрузки.

## Подготовленный серверный критерий

firstSnapshotPolicy.ts пока не подключён к saveSnapshot: это проверенный кандидат политики, а не исправленный join. Он разрешает некратный100 watermark только на текущем server seq и только для ещё не покрытых слоёв либо повторной записи на том же seq. Structural-only bootstrap не разрешён; partial coverage одного слоя не блокирует первый снимок другого. При кратных100 сохранён действующий серверный контракт; ограничение current server head относится к новому bootstrap. 8 тестов покрывают47/113, stale/future/fractional seq, concurrent duplicate, partial layers и запрет пересохранения на каждой операции. Combined queue/zero/policy:60tests7files PASS. Клиентский catch-up/retry и actual network join ещё требуют реализации/проверки.

## Рабочий клиент/сервер кандидат (проверка продолжается)

Политика подключена к saveSnapshot. После полного join без snapshot uploader запрашивает first-copy; собственный useSnapshotPublishing timer раз в секунду читает текущие seq/gates/структуру в одном шаге. Unconfirmed операции любого типа блокируют bootstrap через pendingIdsRef; pending peer reveals/reconnect/incomplete restore — через SnapshotGate. Нет сохранённого watermark для отложенного readback. Каждый слой помечается firstCovered только после успешного upload, partial/refused слой остаётся retryable. Неизменённая пустая бумага не перечитывается, а слой с неудачным upload допускает retry даже после снятия dirty самим bake. Обычный успешный boundary upload также закрывает firstCovered.

Добавлена защита engine snapshotQuiet от active native gesture/destroyed/lost context: промежуточные незаписанные пиксели не могут попасть под прошлый подтверждённый watermark. 138tests10files PASS, включая реальные private pointer pipeline и context-loss guards в mock GL. Это не actual-device network join PASS. Полная проверка типов выполняется с внешними уже установленными зависимостями (без install/symlinks); первый config имел ошибки разрешения внешних @types, не ошибки изменённого source. Actual server storage/HTTP restore и real-device repeat join следующие обязательные gates.

Проверенный race: другой клиент может успеть сохранить first coverage до ответа нашего upload, либо ordinary boundary во время compression. Нужно различать безвредный first-coverage race и transient failure, чтобы не перечитывать уже покрытый слой каждую секунду. Индекс snapshot — авторитетное подтверждение чужого покрытия; нельзя считать отказ сервера успешной публикацией без такого подтверждения.

Concurrent first upload race закрыт: при not_a_checkpoint_seq uploader перечитывает authoritative snapshot index и отмечает только действительно сохранённые layer IDs. Отсутствие индекса или ошибка запроса не отменяет право retry. Два дополнительных теста проходят. Серверный первоначальный вариант также ограничивал обычные seq100 текущим nextSeq; это изменило старый периодический контракт, выявлено26 существующими storage tests. Ограничение перенесено только в новый nonboundary bootstrap; регулярный путь сохраняет прежнее поведение. Это не отключение защиты bootstrap watermark.

## HTTP и проверки текущего кандидата

200tests11files PASS, включая roomSnapshots storage suite и два новых интеграционных storage контроля: фактический47 сохраняется, tail48 остаётся; stale47 при head48 отказывается без DB create, затем48 принимается. Web app и server typechecks PASS с внешними уже установленными @types; oxlint изменённых policy/uploader/gate/hook PASS; map:check67modules/954files PASS и map:rules0errors (4старых orphan warnings).

На отдельном HOME QA backend4538 (PID1036661, source8ad7c844+working tree, собственная папка680-lifetime-hardware/temp/night-load-server) выполнен реальный HTTP/Postgres/socket transport gate. Собственная комната qa728load-3da329f4 получила47 Dry-marker операций, snapshotPOST47=200, индекс и layer seq47, gzip roundtrip84bytes/SHA62c0d9515c12cd58fea0d6215b4ec532b0b63446261e357945f06b15dbec8a44 exact. Второй участник получил latestSnapshotSeq47. Это opaque tile transport fixture, не акварельный native/replay oracle. Tail содержит47 Dry markers по существующей политике сохранения Dry; этот тест не измеряет сокращение GPU replay или скорость UI входа. Raw temp/night-728/load-http-gate.json и mjs сохранены наVPS; собственные sockets закрыты. Actual-device Room first-copy/rejoin/пиксели и скорость остаются обязательным следующим gate.

## Actual iPad 22:40 UTC: transport/restore works, automatic bootstrap pending

Own HTTPS5322/backend4538 room WC3bq7RU (640×480 Fine, Apple GPU) recorded an ordinary native watercolor gesture and UI Dry. Rejoin correctly presented Join form; after joining the two authoritative operations restored. When quiet/settled/dirty were true, automatic index remained204. A separately instantiated uploader requested real watermark2 and stored layer-1 snapshot2 (hash19abddee8ead7e467a1110330bfaa3498a119b1f73994265bc0439fccb891fc7). After another actual reload/join, native tile bytes compared with the persisted IndexedDB baseline: different0/max0/missing0, one resident tile; coverage ledger layer-1=2, GL healthy. This proves actual material bake/transport/snapshot restore, **not automatic first-copy lifecycle or long-room load performance**. Native active frame max497ms and tail157ms remain unresolved.

The genuinely-new creator skips restoreRoomState; markJoinRestoreDone now arms a first copy at seq0. This is a real missing path, but the existing room's automatic uploader still needs passive timer/gate/instance census before identifying the remaining blocker. HMR invalidated the first attempted baseline (0tiles/0ops); it is not counted. The subsequent nonempty baseline/rejoin is the valid comparison. Current200 targeted tests and full web typecheck pass.

## Automatic creator gate after seq0 arming

Own actual iPad room JBuntvc8,640×480 Fine on5322: passive timer census proves creator bootstrap=true at seq0, watermarknull until ACK. Ordinary PointerInput watercolor80 normal100:100 followed by UI Dry generated two operations. The timer observed latest2/no pending/no previews; firstBaked and firstCovered acquired layer-1 and server index200seq2/hash20d465d363a788141a7efa1fae06e445704886723f81bfad19fe702e71d80bfb. No manual uploader was called in this room. Input active23ms max, tail99ms (single small gesture only). This proves automatic firstcopy creator lifecycle for this scenario. Diagnostic window census exists only in the temporary own QA mirror, not committed product source. Pending-Dry safety and long-room/network/load performance remain separate gates.
