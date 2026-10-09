# Mixed snapshot lease: проверенные границы 09.10

Private `_wcJoinedTouchSnapshotLease` остаётся OFF. Это узкое разрешение следующему смешанному штриху писать в открытый scratch при незавершённом предшественнике; прежний барьер переносится с DOWN на UP. Не является доказательством общего ускорения акварели.

## Fidelity

Surface, 24px, реальная модель Engine и actual pointer pipeline, controlled input clock с настоящими scheduler clocks: strict PASS. Одинаковые исходные stroke IDs заданы до source; actual mottleSeed, packed input, wet payload и семантическая история совпадают. Все 25 ролей поля/материала и целый decoded export побайтно совпали. OFF: pending=true, lease=0, DOWN drain=1. ON: pending=true, lease=1, DOWN drain=0, UP drain=1, sourceCommands=8. GL errors=0, context lost=false.

Первый прежний mismatch не был comparable-input oracle: разные случайные stroke IDs меняли production mottleSeed. Его измеренные различия сохранены, классификация INVALID_COMPARABLE_MATERIAL_INPUT; поля не нормализовались задним числом.

Свидетельство: `harness/728-room-moment/mixed-lease-seeded-surface-summary.json`.

## Natural400

Первый ordinary Room OFF water→pigment профиль неполон: actual thumbnail403 завершил gate до ON, ошибку не игнорировали. Второй DOWN был 8.70ms, drain внутри него 6.20ms; второй UP 92.90ms. Это не воспроизведение пользовательской задержки500ms и не доказательство выигрыша кандидата. Pending предшественник подтверждён, GL0, конечный непустой export есть. Собственные контексты/forward/frontend удалены, Surface RELEASE.

Следующий harness умеет `QA_NATURAL_SCENARIO=pigment-pigment`: тяжёлый первый пигментный400 + следующий другой цвет, actual Room PointerInput с rAF cadence. Сохраняет отдельные DOWN/source/display submission/UP/drain/next-rAF/hover markers, проверяет фактические UI и engine settings. Никаких readback/fences внутри профиля. Controller теперь собирает method и bounded JSON errorCode для failed requests; разрешение на устройство выдаёт coordinator.

Свидетельство неполного профиля: `harness/728-room-moment/mixed-natural400-surface-summary.json`.

## Lifecycle CPU

Реальный Engine с mock GL:18/18 joinedTouch tests и TypeScript PASS. Snapshot mixed lease закрывает exportPNG/review/preview/network/fullReplay при незавершённом DOWN и возвращает exporter delegation после UP. Undo предыдущей water op→redo до UP→UP не оставляет lease и записывает authoritative target IDs. Новая завершённая stroke после undo штатно очищает redo branch. Два remote pencil strokes во время activelease ждут в очереди, затем применяются production RAF drain в исходном порядке, без потерь.

Это lifecycle proof; не pixel oracle для undo, не multi-device networking и не физическая видимая pen latency. До UX смотрин нужны полный natural400 OFF/ON без403, ценаUP/следующего взаимодействия, короткие actual UI Dry/undo/redo/snapshot gates.

## Thumbnail403: узкая локализация и исправление

Root read-only shared QA DB и серверный журнал: rejected POST произошёл09:29:11.664UTC, room createdAt09:29:11.716, persisted participant09:29:11.724. Владелец/участник совпадают с observed create/engine actor. Это согласуется с отправкой final thumbnail при initial StrictMode cleanup до persisted room, а не с содержимымPNG: POST403 проверяется до parsing image. При этом непосредственно actor rejected HTTP ещё не был записан, поэтому authrace нельзя объявить исключённым.

Source имел разные правила: periodic preview требовал roomContentReady/snapshot ready/полного replay; final retireEngine проверял лишь replayIncomplete(false на новом mount). Теперь final cleanup требует identity engineRef===engine, current contentReady и snapshotGate конкретного mount; stale cleanup не очищает указатель нового engine. Omitted publish eligibility failclosed. Существующие server permissions не менялись. Retire/open8tests и TypeScript PASS.

Prepared no-input HttpActorTrace cohort записывает только IDs, request/response timestamps, методы и bounded errorCode. Headers/cookies/tokens не читаются. Captures every observed `/api/me` response actor and post403 HTTP/store/engine comparison; separate authdiagnostic, не watercolor perf gate. До actual hardware run исправление403 остаётся CPU/source-checked.

Actual Surface no-input gate после retire fix: PASS,0 strokes, GL0/lostfalse, console/networkerrors0. Три observed `/api/me`200 ответа вернули один ID, он совпал с финальными Room/store/engine IDs; один observed POSTthumbnail200,403не было. Roomindex/engineWiring served rawSHA отдельно сверены с локальным fixedsource. Это одна холодная сессия, не гарантия отсутствия всех authraces и не доказательство final loadedexit при закрытииcontext (trace закрывается до context cleanup). Initial createidentity проверялась кодом, но старый controller финальным result перезаписывал эту metadata; следующий version сохраняет её явно, без реконструкции задним числом.

Собственные Surfacecontexts/Vite5381/forward9455закрыты, RAMпосле1766MiB, RELEASE. Disposable finish оставил registeredfinished SAFE-HOLD из-за unreadable own user processes(systemd/sd-pam/sshd), ни cwd/argv references ownpath не найдено. Эти чужие процессы не завершались и guard не ослаблялся. Evidence: `harness/728-room-moment/mixed-http-actor-surface-summary.json`.

Heavy natural400OFF повтор: source/down proof корректен, но coordinator остановил cohort после технической ошибки harness exit: ожидал`/`, приложение штатно перенаправляет`/`→`/create`. ONне запускался, прирост не установлен. Ошибку harness исправили, serverauth не меняли. OFF DOWN20.2ms/source15.7ms/display16.8ms, UP62.5ms/UPbegin→RAF97.8ms. Главная аномалия — secondstroke framegap1166.7ms: внутри записанного gap input MOVE6.8ms, actualauthor source3ms; UPпозже, DOWNраньше. Поэтому конкретно этот огромный gap не занят записанными DOWN/UP/source CPU span. Где ушёл остаток — scheduler/GLqueue/browser — без другой instrumentation неизвестно. Дополнительные scalar`_runSlice` и browserlongtask markers подготовлены для следующего разрешённого профиля; новые fences/readbacks не добавляются. Compact и5largestgaps сохранены; Surfaceосвобождён, registeredfinished cleanup SAFE-HOLD отданroot.
