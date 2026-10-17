# #774: снимок стирает видимый незавершённый обычный мазок

Исходники: `44c3d215f4bcae49752949ac1cc13530265885f7`.
CPU MockGL, без native GPU, новых сервисов и изменения runtime.

Воспроизведение через публичный API: бумага32×32, слойL принят с seq1,
карандашA размер5, DOWN(4,8)→MOVE(10,8), затем
`restoreLayerFromSnapshot(L, transparent32×32, coveredSeq=1)` доUP.
Непустые видимые pixels мазка становятся нулевыми немедленно. Проверка
равенства before/after падает: среди удалённых значений11/65/122.
Регрессия `index.snapshotHeldPreview.test.ts` оставлена как `it.fails`:
фиксируем ожидаемый видимый контракт, не нормируем исчезновение.
Ранее добавленные `index.snapshotHeldPencil.test.ts` проверяют другой контракт:
послеUP полный записанный мазок восстанавливается replay. Это не закрывает
подтверждённую потерю preview доUP.

## Минимальный кандидат, пока НЕ реализован

Отложить фактическую установку bitmap для слоя с физически удерживаемым
обычным жестом. M70 сохраняет отдельный существующий контракт. До фактической
установки нельзя отмечать coverage, pin checkpoint, записывать installed audit
или возвращать вызывающему коду успешное завершение restore.

Локальный API может возвращать `void | Promise<void>`: обычный синхронный путь
остаётся синхронным. Sink должен условно await только Promise внутри цикла
restoreLatestSnapshot, до appliedLayerIds.push и следующего inflate. Данные
SnapshotTile.pixels — неизменяемые subarray views одного raw gunzip-buffer;
копировать или pack их не требуется, ImageBitmap в этом пути отсутствует.

Существующий предел #467 — один decoded слой плюс оставшиеся compressed blobs,
а не произвольные64MiB. На реальной комнате десять слоёв занимали431MiB inflated.
Несколько параллельных restore могут удержать несколько raw-слоёв даже с await
внутри каждого. Поэтому перед внедрением нужен per-engine generation/singleflight
до inflate и stale-result guard после await. Latest replacement обязан завершить
старый Promise отменой, освободить references и остановить старый цикл; отмена
не равна успешной установке. Один Map отложенных слоёв без этой защиты недостаточен.

Отмена при delete/resize/context loss/destroy и проверка идентичности буфера
обязательны: bitmap старого поколения нельзя установить в новый target.

## Важная граница ожидания

Ждать `_hasUnrecordedInk(layerId) === false` опасно: окончательный op может
ждать replayGate, а replayGate — завершения restore. Для preview нужен конец
физического удержания: localUP или peer.end/cancel/disconnect. Нормальный
peer_stroke_live_end не gated roomContentReady; `_hasUnrecordedInk` остаётся
true после end до commit. При установке после физического end существующий
unsettled repair всё ещё необходим для последующего принятого финального op.

## Требуемые проверки перед runtime-кандидатом

* Видимые pixels сохраняются до localUP/peerend; после commit exact full replay.
* Marker/smudge продолжают MOVE без ссылок на удалённые FBO.
* Старый restore не применяется после нового поколения/board switch.
* Не более одного decoded слоя, отменённый restore не декодирует следующий.
* Audit/coverage/CP появляются только после действительной установки.
* Peer end освобождает ожидание без необходимости получить gated finalop.

Широкий lifecycle-патч не внедрён. Отдельный параллельный аудит существующей
reentrant restore race выполняет другой агент; generation-фикс должен сначала
иметь самостоятельное доказательство, затем deferred preview можно добавить
как узкое расширение. Продуктовая семантика и формат истории не менялись.
