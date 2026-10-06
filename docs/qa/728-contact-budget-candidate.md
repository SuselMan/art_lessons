# #728: кандидат с GPU-бюджетом для contact pulses

Source candidate `7f70969d` поверх принятого main `8aa7e9f0`; собственный HOME hardware mirror 680-lifetime-hardware / 5311 использует существующие реальные зависимости, backend 4537 другого QA worktree. Защищённый 5314 не менялся. Root-source archive сначала был остановлен из-за медленной сети; законченная source-only синхронизация передала apps/web/src и packages/shared/src. Старые T/R/S prototype tests, которых нет в candidate HEAD, сохранены в temp/contact-budget/old-prototype-tests вне src. Рабочие копии/артефакты не удалены.

Принцип: уменьшаем число ожиданий кадра между теми же физическими шагами. Только явно tagged paired contact exchanges допускают batching; capture entry 0, uploads и прочие операторы не помечаются. Порядок/pulse count/format Dabs не меняются. WeakSet не удерживает освобождённые closures. Кандидат **opt-in, default OFF** через внутренний queue.contactBatchEnabled; публикации не было.

При penup/своевременном tick — максимум 4 contact pulses, 4 мс wall budget, gl.finish после каждого. Такой sync ограничивает командную очередь существующим механизмом, но его walltime не называется точным GPUelapsed. Перебор прекращается после первого дорогого шага, at upload barrier, смене job/lifecycle, pen-down или достижении бюджета. Backlog acceleration не умножает этот лимит. Active pen и late tick сохраняют прежнее расписание. complete/cancel/firstcapture semantics сохранены.

11 CPU tests PASS:5 новых meaningful budget cases +6 существующих ownership/lifecycle. Новые проверяют max4 при backlog 100, heavy first 12 мс → 1 pulse, upload barrier, active/late fallback, cancel inside pulse. Web typecheck/lint/map:check/map:rules PASS. Общий monorepo typecheck hardware mirror FAIL: нет @prisma/client для его неиспользуемого server workspace; это не объявляется полным typecheck PASS. Server 4537 работает из отдельной собственной копии.

## Vega same-journal gate

Immutable actual source hashes: index 37ddeb104d83b1c030f7f0b34a6db688659f9d6219740dfda118bf9b0df1db43; accepted shader 386994099ddf47f1004f84a6c8e1971d9f1652933d6c2ed30f5e7439ef164965. AMD Vega, viewport 1600×1000/DPR 1/Fine 1754×2480/debug OFF. Одна native dense 80 capture, затем два fresh replay одного JSON: OFF и opt-in ON.

Normal replay solver 16.5348с, budget ON **6.0683с**. Полный 2480×1754 RGBA EXACT 0/max 0; native capture vs OFF replay такжеEXACT 0. GL 0/healthy/queue complete обеих сторон. Raw HOME temp/contact-budget/results, PNG сняты после timing; Chrome closed finally. Это один фиксированный журнал, не cross-GPU/generalperformance proof.

Следующий native80/400 запуск покаINVALID bootstrap: create form timeout 30 с, жестов/измерений нет, Chrome closed finally. Backend 4537 health 200 и frontend 5311 HTTP 200; причиной timeout не объявляется обычныйwsended после закрытия Chrome. Подготовлен повтор с DOM/network failure capture. Samsung cached SM-T970 подтверждён и own forward 9338 создан, его пользовательские вкладки не затронуты; аппаратный candidate Samsung пока PENDING.
