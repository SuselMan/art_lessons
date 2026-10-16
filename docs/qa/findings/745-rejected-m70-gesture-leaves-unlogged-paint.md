# Отвергнутый М70 жест оставляет локальный пигмент вне журнала

Runtimef1f46726 (provisional correctness freeze), Vega AMD realGPU,
свежая1536² room, два автора. Перед пробой pencilобычные действия, повторный
setActiveLayer обоим и ≥250ms timers: фактически1472ms, pageerrors0 (#757
prewarmfix работает). Рядом есть отдельный pencilbaseline.

Repro: выбрать М70 и DOWN вworld(1015,110), затем20MOVE через1024границу иUP.
DOWN бросает `M70 QA requires one square page tile`; как физический inputloop,
после пойманного DOWN MOVEs+UP всё равно вызываются. UP снова бросает тотже guard.

После UP:
- `_strokeId=CWlULZKvHl`, `_strokeLayerId` остаются активными;
- journalIDs exactunchanged (3operations), queue0, GL0, socketOPEN;
- rejectedtarget A стал непустым:790pixels наtile(0,0) +3604 наtile(1024,0);
- rejectedtarget B остался пустым. ДоDOWN target обоим былпустым;
- соседний pencilbaseline exactcanonical hashes обоим unchanged;
- последующий pencil работает, но это не отменяет unloggedlocalpaint.

Это подтверждённая порча состояния/расхождение участников после отказа,
не просто UIсообщение. Actualgeometry preflight должен происходить до создания
strokevars/буферов/материала. Ни implicitdry, ни legacyfallback не применялись.
Canonical read не закрывал существующую воду; данные снимались до pencilrecovery.

Evidence: temp/device-runs/745-757-baseline-oversize-full-gesture/report.json,
failure PNG. Own disposablefixture сохранена дляфикса:
qa-undo-v1-a86edebf-4f5d-4ee6-b8d1-f857e6b9af23; authprivate, неGit.
Собственные browsercontexts закрыты, новыхcaseне запускалось.
