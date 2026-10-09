# GL: текущий итог доказательств

Это локальные кандидаты #728 (плавная акварель), не production готовность и не обещание устранения задержки пера.

| Направление | Проверено | Решение/ограничение |
|---|---|---|
| Boot страницы создания | Отделение authoritative tool constants от engine barrel; Surface form появился до загрузки engine graph | Narrow refactor PASS; colddev всё ещё18.86s доform, это не скорость комнаты/рисования |
| Mixed lease +queued history | Ранее exact immutable material/history, actual Undo/Redo/Dry/leave/rejoin, source ownership и FIFO repairs | Пользовательский стенд5381 остаётся прежним, новые CPU кандидаты в него не добавлены; UX ещё требует живой оценки |
| Contact hoist | Actual Surface10fields+whole+30 ordered upload bytes exact; producer0→28 | Natural UP mixed: первый101→79ms, второй76→100ms; defaultsOFF |
| Matched hoist CPU | Настоящий private payload/fullidentity/30hash; warm около6–7% | Малый выигрыш, не решение общего onset/UP |
| Column/row Float64 memo | 100edge cases+same30 bytes; warm6–10% в CPU | CPU-only prototype, runtime не wired, cold шумно |
| Contact/stencil split | Actual samewash2op: contact20.60ms/grouping0.1175ms/emptyforeign negligible | Foreign upload0; nonempty чужой stencil не измерен, чужие76ms не приписываются этой ленте |
| Existing GL2 brush MRT | Ранее Surface Room/parity и synthetic operator≈40%; whole≈2.25% | Current safety maintenance9814, CPU12+TS PASS; текущая сборка с новым lease/history аппаратно не проверена; GL1 MRT route отсутствует |
| Worker/WASM | Source feasibility: contact worker отсутствует; existing worker только snapshot transport | Ownership/FIFO/cancellation нужны, перенос CPU сUP не бесплатный; реализация не начиналась |

Новых frontend/device ресурсов нет. Защищённый manual5381/user room не перезагружались. Все private payload fixtures остаются вне Git; compact provenance/sourceSHA сохранены. Новые commits только локальные, без push/main/deploy.

## Точные повторы Math.exp в настоящем payload

`contact-real-tape-cpu.mts` с `QA_CONTACT_EXP_CENSUS=1` вычисляет именно исходный `-length / ry * water * (1-r2)` и сравнивает Float64 bit pattern (включая signed zero). Никакой exp approximation/recurrence/reassociation. Внутренние Sets используются только offline census, producer не меняется.

28 реальных вычисленных contact fields (не30 upload: два seed upload повторяют готовое поле),335780 exp calls. При отдельном cache на каждый group:34.89% повторов; отдельном на stroke:42.88%. Глобально71.44%, но два strokes имеют одинаковые contact inputs: это повтор сценария, который завышает пользу долгоживущего cache. Два groups каждого stroke вообще не имеют повторов; максимум group около63%. Actual fullinput identity и30flowhash PASS.

Hit rate не доказательство ускорения. Float64 bit extraction/Map lookup/hash/alloc и объём95k unique keys могут превысить цену native Math.exp, а глобальный cache удерживает историю и не имеет пока lifecycle/budget. Поэтому runtime memo не добавлен и performance benchmark не запускался. Compact `contact-exp-bits-summary.json` содержит group counts/source/fixtureSHA без raw arguments/operations. Если выбирать следующий кандидат, только bounded per-group CPU prototype с неизменным original fallback и exact byte gate; сначала доказать экономию, не обещать её по проценту попаданий.

Плавность пока не достигнута: выигрыши отдельных CPU/GPU kernels не означают быстрый critical path до первого пигмента, а перенос finish наUP может увеличить паузу после отрыва. Рабочее направление остаётся точное сокращение обязательного source/publication work с сохранением material ownership и серверного порядка.

Follow-up: bounded per-field NumberMap проверен и отклонён: fullinput/30hash exact, но21.43→66.28ms (≈3.1× хуже).100edge+nonfinite cases PASS. Runtime memo не добавлен, дальнейший benchmark остановлен; см.728-gl-contact-exp-memo-rejected.md.


## WORKING checklist — GL consolidation

Это обновление существующего локального progress report, не новый GitHub issue и не публикация. Старый `728-fast-watercolor-night-plan.md` остаётся историческим планом07→08, его незакрытые глобальные пункты не автоматически объявлены выполненными.

- [x] Сохранить owned GL исходники/результаты и private fixture provenance; все commits локальные.
- [x] Отделить static boot constants от engine graph; actual noinput Surface form-ready PASS.
- [x] Доказать contact hoist quality по10fields/whole/30uploads и actual producer count; timing mixed, ускорение не принято.
- [x] Matched actual CPU identity/hash census: hoist modest6–7%, column prototype modest6–10%; runtimeOFF.
- [x] Разделить contact/grouping/emptyforeign CPU; samewash foreign0 scope явный, nonempty puddle не обещан.
- [x] Per-field exp memo проверить один раз и отклонить (3.1×slow); дальнейшие memo эксперименты остановлены.
- [x] Existing GL2 MRT route/source audit и узкие guards9814:12CPU+TS PASS; independent review отдельно, hardware не выполнен.
- [x] Own frontend/SSH/context/disposable ресурсы завершить; дополнительных ресурсов сейчас нет.
- [ ] Найти **существенное** уменьшение cold contact prep без approximate exp/Q8/order loss. Column/memo не закрывают задачу.
- [x] CPU-only ownedlazyUP prototype58ff:actualFIFO+actualPlanorderedtrace,9tests+TS; НЕphysicalmaterialfreeze/UXready.
- [x] Readsetcensus:op0 reads7roles,fullfinishclosure broader;8snapshot insufficient, noGPUCOWimplemented.
- [ ] Если выбирается existing lazyContacts: доказать owning/FIFO/отмену и обе цены DOWN→source и UP→nextinteractive, не просто сдвигcost. Никакого unowned timeout/deferfinish.
- [ ] При выбранном GL2 paired кандидате: fresh current-source GL1→GL2 syntax/material parity, затем GL2single→paired, actual consumption/история/contextloss. Исторические проценты не заменяют этот gate.
- [ ] Живой UX проверить на разрешённом устройстве: второй400мокрый штрих, прозрачность послеUP, Undo/Redo/Dry, дальнейшийinput; измерять source-submit/composite/RAF отдельно отphysicalvisible.
- [ ] Закрыть remaining onset/UP/publication critical-path unknown. ContactCPU/isolatedGPU выигрыши не достаточны для заявленияплавности.

### Ограничение активного scope

Оставляем три координируемых направления: GL ownership/отзывчивость; native source/publication performance; live spread/художественная корректность. Новые независимые micro-ветки не запускаем. Эта запись отмечает scope, а не сообщает чужие результаты как проверенные. `728-gl-bounded-timing` — текущая CPU/report копия; `728-bounded-ui-optin` — native owner; protected `680-water-wet-tone`/5381 — существующий пользовательский baseline/candidate. Все остальные worktree и незавершённые источники **сохраняются**, не удаляются как дубликаты; column/expmemo теперь archive/evidence-only, shared prebundle HOLD.

### Критерий следующих смотрин

Новая ссылка/флаг предлагается только после независимого source review и fresh actual fullquality/lifecycle gate выбранного пакета: immutable input/seed/wet/бумага, exact material/whole, actual consumption без fallback, GL0/lostfalse, Undo/Redo/Dry/rejoin. Performance отдельно должен улучшить обе паузы (DOWN→firstsource/composite и UP→nextinteractive), без исчезновения/прозрачного временного мазка. Одна adaptive серия или ускорившийся kernel недостаточны. До этого5381 не изменяем/не перезагружаем пользовательский room, новые CPU prototypes не называем готовыми смотринaми.

- [x] Retained pointer admission CPU foundation: actual PointerInput/coalesced samples + actual FIFO, immutable DOWN packet, explicit overflow/cancel; 14 combined tests + app TS PASS. Runtime OFF.
- [ ] Actual Engine admitted-context integration / packed wet-ID parity: HOLD — current start reads mutable clock/wet/wash/constraints and generates IDs. Packet-only tests не доказывают Engine parity или UX gain. Подробнее: `728-gl-retained-pointer-foundation.md`.

- [x] DEV internal actual Engine admission seam: dry pencil packed/pressure/ID/context equality after tool/layer change; actual FIFO→source→Undo/Dry, failure finally, stale/OFF/destroy guards. No query/runtime activation.
- [ ] Watercolor admitted-context parity remains HOLD: nonserializable PaperWetness needs full fork and per-batch receipt times, not only DOWN. Existing stencil/film owners are not frozen by this seam.

- [x] DEV PaperWetness opaque bounded CPU snapshot/fork: committed/pending/pool/drained/peak/bounds exact copies без clocks/merge; Engine wet admission всё ещё HOLD.

- [x] Actual Engine wet transcript CPU proof: real PointerInput/brush, exact per-batch sample/deposit/UP times, exact Operation.wet and final model rasters on capturedfork. OFF/observer/overflow/time-order negative guards.
- [ ] Deferred watercolor Engine admission + GPU ownership + fork→live merge remain HOLD; CPU transcript is not UX/pixel/device proof.

- [ ] Admitted wet actual Engine replay HOLD: transcript lacks DOWN join/checkpoint/UP wash clock stages; same foreign-source wash requires immutable scratch/GPU owner, not only PaperWetness fork. Three concrete prerequisites in `728-gl-admitted-wet-engine-feasibility.md`; no new framework.

- [x] Typed missing DOWN/checkpoint/UP clock/query recording with actual clock values and strict CPU stage/batch cursor. No Engine provider activation; owner/material/merge blockers remain.

- [x] CPU actual Engine fresh normal20/100 fork replay: exact whole Operation после live paper/tool/layer mutation; typed clock/getter + per-dispatch isolation, negative callback TOCTOU/throw/reentrancy. Constructor-only DEV, MockGL, no runtime activation. GPU ownership/foreign wash/live merge/UX остаются HOLD. Подробнее: `728-gl-wet-engine-fork-replay.md`.

- [x] Isolated actual Surface256 freshnormal20/100 replay+guarded modelpromotion: exact fullOperation/fullrawWet/PNGdecodedRGBA, GL0/errorsdrop0, source6/paper3passport. Source c92; scopedquality only, **не latency/Room/foreignwash/GPUowner protocol**. См. `728-gl-wet-replay-c92-surface-result.md`.
- [ ] Runtime queued watercolor admission/immutable GPUowner/foreignwash/livemerge/fullUI+performance остаются HOLD. На quota30% новые проверки/реализация/устройства остановлены; manual5381/shared4558 сохранены, ownedresources отсутствуют.

- [x] Actual Engine retained FIFO negative boundary: 2 целевых CPU теста PASS — earlyUP сохраняется без source dispatch до predecessor marker, own pending request отвергается, targeted cancel сохраняет predecessor. CPU marker не GPU publication; positive runtime integration HOLD. См. `728-gl-retained-fifo-admission-boundary.md`.
