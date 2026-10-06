# Холодный backend: сохранение журнала и ограничение transport probe

Источник b8633207, собственные frontend5314/backend4537, комната ltLjzwXe с165stroke/186операциями/7paper_dry после длительного теста. Два собственных свежих Chrome engine, source не менялся. Root координированно остановил только собственный backend PID836463 и запустил872460. Защищённый4536 и production не затрагивались.

Перед restart оба журнала точно совпали с сохранённой165stroke историей, все7Dry присутствовали; PNG непустые. Каждый WebSocket probe видел opens1/closes0/roomStates1. Был сохранён ready и root создал cold-resume после health.

После restart оба probe зафиксировали настоящий close и новый open (opens2/closes1), но WebSocket-only счётчик room_state остался1. Guard roomStates>baseline истёк через120с, Chrome закрыт finally. Failurejournals обоих engine в этот момент остались EXACT к состоянию доrestart:186операций,7Dry, GL0/lostfalse, очередь0, rebuild0, settlefalse. Это свидетельство сохранённого журнала, но не законченный cold-reconnect PASS: PNG послеrestart и новыеnativeACK не были сняты из-за guard. Получение room_state через штатный HTTP polling не наблюдалось этим первоначальным probe, поэтому транспортный timeout остаётся inconclusive, а не доказанным сбоем приложения.

CPU-контроллер дополнен пассивным наблюдением SocketIO пакетов WebSocket, XHR-polling и fetch-polling. Никаких socket/engine методов не заменяли, ответы не потребляли: fetch clone, XHR responseText read-only. Guard actualclose/newopen/newreceivedroom_state сохранён. Ready handshake10мин, idle240с сcheapprogress5с, wall22мин.

Первый повтор с новым observer не достиг ready: join-helper engine wait30с истёк до подготовки baseline. Chrome закрыт finally, backend не перезапускался. Причина bootstrap не установлена; таймаут не увеличен без данных, source не исправлен. Подготовлены pageerror/requestfailed/HTTPfailure и UI state/screenshot diagnostics для последующего ограниченного запуска. Новый запуск не проводился до следующего GPU grant/обновления source precision кандидата.

Артефакты: домашняя `680-combined-stability/temp/context-loss/cold-history-reconnect/report.json` содержит before/failure journals иactualsocket события; копияVPS `680-context-restore/temp/context-loss/cold-history-reconnect/report.json`. Следующий bootstrap abort сохранён отдельно `cold-history-both-transports/report.json`. Контроллер `temp/context-loss/cold-history-reconnect.mjs` (ignored), appsource unchanged. Холодный перезапуск остаётся незавершённой проверкой, не отменяя отдельный40,061мин scoped stability результат.


## Завершённый precision повтор

На обновлённом frozen источнике indexSHA `c0fd96c0492b05408550ef8baf91a1b3e8389688a1b5375c38af763b16373408`, codecDabSHA `23900d55731a8f4fbd830b4259f724fd5e333bd83af7b5709ddeab0c43e6c726`, shaderSHA `d6928e5c49342a1ec16f47f4ee7fa9c4cbb9befd010e29fd7f833d975148bdd8` все обязательные source guards прошли до запуска Chrome. Actual renderer: ANGLE/AMD Radeon Graphics, radeonsi renoir ACO/OpenGL4.6. Source passport содержит ещё OperationLog/hasActiveWater/servercoverage.

Оба bootstrap engine в этом повторе появились через0,28/0,90с послеJoin; pageerrors/network failures отсутствовали. Прежний join30с timeout не воспроизведён и остаётся inconclusive. Таймаут bootstrap не увеличивали. Baseline replay165штрихов получил прогресс и завершился; исходный сохранённый authoritative журнал186операций/7Dry совпал точно.

Root координированно перезапустил только собственный backend4537/PID872460→878165, проверилhealth и создал cold-resume. Controller наблюдал actual close→newopen→newreceivedroom_state у обоих участников. Именно новые room_state пришли через XHR-polling: WS-only счётчик первоначального controller действительно не покрывал штатный transport. Послеrestart186операций и7Dry остались EXACT; оба PNG до/послеrestart равны0пикселей/max0, premult0. Непустота4609пикселей до и после.

Послеcold reconnect оба автора выполнили по одному настоящему native-жесту и получили serverACK, который попал в оба журнала. Финал188операций, A/B authoritative EXACT, GL0/lostfalse, PNG5731пиксель. ФинальныеA/B PNG тоже EXACT0пикселей/max0/premult0. Chrome закрытfinally, exit0. Backend самостоятельно controller не останавливал, защищённый4536 и production не затронуты.

Это завершённый PASS холодного QA-backend reconnect с сохранённой165stroke историей на640×480/brush32 и двумя новымиACK. Не стресс большого холста, не измерениеnative fps. Прежниеfailed/inconclusive rawreports не переписывались.

Артефакты: `680-combined-stability/temp/context-loss/cold-precision-diagnostic/` содержит report.json,6PNG, offline-diffs.json, ready/cold-resume. Полная копия наVPS в `680-context-restore/temp/context-loss/cold-precision-diagnostic/`.


Размер холста дополнительно подтверждён отдельным read-only Prisma audit: комнаты f_GlYesQ и ltLjzwXe имеют `infinite=false, canvasWidth=640, canvasHeight=480` в самой базе. Сохранённые PNG экспортированы640×480; roomStore metadata совпадает. Это физический размер холста, а не только viewport. Контроллер создания выбирает UI Custom и задаёт640/480. Артефакт `temp/context-loss/board-dimension-audit.json`; база и source не изменялись.
