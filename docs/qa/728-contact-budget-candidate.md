# #728: кандидат с GPU-бюджетом для contact pulses

Source candidate `7f70969d` поверх принятого main `8aa7e9f0`; собственный HOME hardware mirror 680-lifetime-hardware /5311 использует существующие реальные зависимости, backend4537 другого QA worktree. Защищённый5314 не менялся. Root-source archive сначала был остановлен из-за медленной сети; законченная source-only синхронизация передала apps/web/src и packages/shared/src. Старые T/R/S prototype tests, которых нет в candidate HEAD, сохранены вtemp/contact-budget/old-prototype-tests внеsrc. Рабочие копии/артефакты не удалены.

Принцип: уменьшаем число ожиданий кадра между теми же физическими шагами. Только явно tagged paired contact exchanges допускают batching; capture entry0, uploads и прочие операторы не помечаются. Порядок/pulse count/format Dabs не меняются. WeakSet не удерживает освобождённые closures. Кандидат **opt-in, defaultOFF** через внутреннийqueue.contactBatchEnabled; публикации не было.

При penup/on-time tick — максимум4 contact pulses,4мс wall budget, gl.finish после каждого. Такой sync ограничивает командную очередь существующим механизмом, но его walltime не называется точным GPUelapsed. Перебор прекращается после первого дорогого шага, at upload barrier, смене job/lifecycle, pen-down или достижениибюджета. Backlog acceleration не умножает этот лимит. Active pen и late tick сохраняют прежнее расписание. complete/cancel/firstcapture semantics сохранены.

11 CPUtests PASS:5новых meaningfulbudgetcases +6существующихownership/lifecycle. Новые проверяют max4 при backlog100, heavyfirst12мс→1pulse, uploadbarrier, active/latefallback, cancelinsidepulse. Webtypecheck/lint/map:check/map:rulesPASS. Общий monorepo typecheck hardware mirror FAIL: нет@prisma/client для его неиспользуемого server workspace; это не объявляется полным typecheckPASS. Server4537 работает из отдельной собственнойкопии.

## Vega same-journal gate

Immutable actual source hashes: index37ddeb104d83b1c030f7f0b34a6db688659f9d6219740dfda118bf9b0df1db43; acceptedshader386994099ddf47f1004f84a6c8e1971d9f1652933d6c2ed30f5e7439ef164965. AMDVega, viewport1600×1000/DPR1/Fine1754×2480/debugOFF. Одна native dense80 capture, затем два fresh replay одногоJSON: OFF и opt-inON.

Normal replay solver16.5348с, budgetON **6.0683с**. Полный2480×1754 RGBA EXACT0/max0; nativecapture vs OFFreplay такжеEXACT0. GL0/healthy/queuecomplete обеихсторон. Raw HOMEtemp/contact-budget/results, PNG сняты после timing; Chromeclosedfinally. Это один фиксированный журнал, не cross-GPU/generalperformance proof.

Следующий native80/400 запуск покаINVALID-bootstrap: createformtimeout30с, жестов/измерений нет, Chromeclosedfinally. Backend4537health200 и frontend5311HTTP200; причинойtimeout не объявляется обычныйwsended после закрытияChrome. Подготовлен повтор сDOM/network failure capture. SamsungcachedSM-T970 подтверждён и ownforward9338 создан, его пользовательскиевкладки не затронуты; аппаратныйcandidateSamsungпокаPENDING.
