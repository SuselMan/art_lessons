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


Heavy ON отдельный performance run завершён: DOWN5.6ms, sourcebegin1.4ms, displaybegin4.1ms; UP87.6ms, synchronous completeSettle24.9ms, UPbegin→RAF118.4ms. Максимальный rAFgap65.9ms. Actual loaded Leave→/create дал ровно один POSTthumbnail200, GL0/errors0. Source37batches60.7ms total/max21.8ms; longtasks70/157/118/60/90ms. Это CPU observations, не GPU attribution и не физическая visible latency.

SQL собственных двух комнат доказал несопоставимую нагрузку старого elapsed-time recipe: OFF second77dabs/arc1148.19, ON second102dabs/arc1644.59 (+43.2% длины). First102/103dabs. IDs, production noise seeds, packed payload и wet также различаются. Следовательно 1166.7→65.9ms нельзя выдавать за paired gain кандидата. UI400 при pressure.8 штатно даёт effective360.525px, минимум162.236px. Минимальные hashes/counts/seeds сохранены без raw Operation.data. Следующий сценарий требует заранее фиксированную indexed trajectory с одинаковыми IDs/seeds/pressure, без пропуска пути при медленном кадре; wall duration измеряется отдельно, runtime clocks остаются реальными.


Fixed400 prepared cohort (bc2caf16): QA_FIXED400=1, pigment-pigment, OFF_ON. Каждый arm получает одну immutable trajectory:108 indexed RAF batches,216 authored points,pressure.8,UI400, fixed IDs QAwater001/QApigmt002 и production noise seeds. Реальный RAF ждёт минимум authored frame offset; поздний кадр доставляет следующий индекс без пропуска/catch-up. Все runtime clocks остаются реальными. Поэтому wall duration и live wetness могут различаться; controller отдельно сообщает strict equality authored recipe/source seeds/raw packed payload/wet, без нормализации. Functional admission PASS не равен material equality PASS.

CPU:5/5 recipe/dispatch/throw-restore checks; standalone production PointerInput→DabSystem проверка одинаковой geometry+seed+pressure+preset PASS. Последняя использует default DabSystem spacing и не утверждает соответствие engine physical-size profile. Actual hardware pair ещё не запускался. No physical pen latency и no exact pixels claim.


Actual Surface fixed400 ONE OFF/ON PASS: raw authored recipe/production IDs+seeds/packed dabs/wet EXACT, both108RAF/stroke, GL0/errors0, loaded Leave each exactlyPOST200. OFF DOWN17.3/source15.3/UP53.5ms; ON DOWN3.8/source1.4/UP73.7ms. UPbegin→RAF75.5/91.5ms. Second wall duration3027/1888ms; maxgap1150/41.7ms. Это один сопоставимый input run, не physical pen latency и не универсальный benchmark.

OFF1150ms gap содержит recorded MOVE0.1ms, source/runSlice/settleQueue/longtask overlap отсутствует. Marker1634<2048cap, coverage продолжается за gap; truncation не объяснение. Основная секундная пауза не равна DOWN17.3ms. Где провёл время browser/GPU/queue — эти CPU observations не устанавливают; GPU cause нельзя утверждать. Сопоставимый run показывает преимущество кандидата по этому сценарию, но цена UP выросла20.2ms. Compact16465bytes+gap evidence сохранены ДО finish, собственные контексты/Vite/forward закрыты, Surface RELEASE; finish guard activeprocess отдан coordinator.


First actual UI cohort on6ba source INCOMPLETE: OFF actual constructor query joined=true/lease=false/native=false, timed pending/export passed. Harness Undo locator matched header AND floating customizable slot; strict selector violation stopped before UI undo, ON was not run. Это ошибка harness, не доказательство engine regression. Selector narrowed to exactly one RoomHeader headerIconBtn control; no first() fallback. Compact10.4KB saved before cleanup, all owned contexts/Vite/forward closed, finalRAM1691, Surface RELEASE. No automatic retry.


Corrected-header UI cohort снова INCOMPLETE: все3 actual controlsunique и constructorflags PASS, OFF timed/input/export PASS; waitForFunction30s timed out insideUI. Source review обнаружил ошибку harness: doneOperations содержит operation_undo, так что removal1stroke+addition1control сохраняют общийcount. Wait теперь сравнивает exact filtered stroke IDs вместо любого countchange. Product regression пока не установлена. Compact10.6KB savedbeforecleanup, finalRAM1741, Surface RELEASE; ON не запускался/noautotry.


Read-only own QA DB nT9x35r8 подтвердил actualUI: seq1waterstroke,seq2pigmentstroke,seq3operation_undo targetexactseq2. Undo действительно исполнено; done firststroke+undo count2 совпал с original2stroke count. Timeout был ошибкой harness predicate, а не Undo no-op. ExactstrokeIDs wait+4negative checks PASS; beforebutton/wait/whole stage metadata теперь сохраняются отдельно для любой следующей ошибки.


ExactIDs UI cohort: OFF actual Undo exactlaststroke +changed whole PASS; Redo exactoriginalIDs +fullRGBA restore PASS; Dry actual wet7107→0 and material preserved PASS. Stop on loadedexit: exactly1POSTthumbnail429 rate_limited; ON/rejoin did not run. No whitelisting/noautomaticretry. Source thumbnailRoutes THUMBNAIL_MIN_INTERVAL_MS3000 perroom, client uploadThumbnail explicitly treats429 as ordinary best-effort skipped write. Priorpreview request→final request3.645s but priorresponse lag1.032s, leaving≈2.61s from response tofinalrequest. Serveraccepttime may be later than requeststart; periodic-preview/exit collision is consistent with source. Finalexit200 requirement needs honest quiet-window precondition, rather than changingauth/rate rules. Actualroute timing still requires serverlog before calling precisecause proven. Compact15.6KB preservedbeforefinish, finalRAM1597, Surface RELEASE.
