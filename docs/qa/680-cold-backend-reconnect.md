# Холодный backend: сохранение журнала и ограничение transport probe

Источник b8633207, собственные frontend5314/backend4537, комната ltLjzwXe с165stroke/186операциями/7paper_dry после длительного теста. Два собственных свежих Chrome engine, source не менялся. Root координированно остановил только собственный backend PID836463 и запустил872460. Защищённый4536 и production не затрагивались.

Перед restart оба журнала точно совпали с сохранённой165stroke историей, все7Dry присутствовали; PNG непустые. Каждый WebSocket probe видел opens1/closes0/roomStates1. Был сохранён ready и root создал cold-resume после health.

После restart оба probe зафиксировали настоящий close и новый open (opens2/closes1), но WebSocket-only счётчик room_state остался1. Guard roomStates>baseline истёк через120с, Chrome закрыт finally. Failurejournals обоих engine в этот момент остались EXACT к состоянию доrestart:186операций,7Dry, GL0/lostfalse, очередь0, rebuild0, settlefalse. Это свидетельство сохранённого журнала, но не законченный cold-reconnect PASS: PNG послеrestart и новыеnativeACK не были сняты из-за guard. Получение room_state через штатный HTTP polling не наблюдалось этим первоначальным probe, поэтому транспортный timeout остаётся inconclusive, а не доказанным сбоем приложения.

CPU-контроллер дополнен пассивным наблюдением SocketIO пакетов WebSocket, XHR-polling и fetch-polling. Никаких socket/engine методов не заменяли, ответы не потребляли: fetch clone, XHR responseText read-only. Guard actualclose/newopen/newreceivedroom_state сохранён. Ready handshake10мин, idle240с сcheapprogress5с, wall22мин.

Первый повтор с новым observer не достиг ready: join-helper engine wait30с истёк до подготовки baseline. Chrome закрыт finally, backend не перезапускался. Причина bootstrap не установлена; таймаут не увеличен без данных, source не исправлен. Подготовлены pageerror/requestfailed/HTTPfailure и UI state/screenshot diagnostics для последующего ограниченного запуска. Новый запуск не проводился до следующего GPU grant/обновления source precision кандидата.

Артефакты: домашняя `680-combined-stability/temp/context-loss/cold-history-reconnect/report.json` содержит before/failure journals иactualsocket события; копияVPS `680-context-restore/temp/context-loss/cold-history-reconnect/report.json`. Следующий bootstrap abort сохранён отдельно `cold-history-both-transports/report.json`. Контроллер `temp/context-loss/cold-history-reconnect.mjs` (ignored), appsource unchanged. Холодный перезапуск остаётся незавершённой проверкой, не отменяя отдельный40,061мин scoped stability результат.
