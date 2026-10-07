# #728: повторные clears перед capture — CPU кандидат

База a7680c3c. Source-only эксперимент, default OFF:
`engine._settlePlan.diagnosticElideDuplicateCaptureClears=true`.
Никакой Room/query wiring и обновления пользовательских стендов нет.

Actual chain: Engine `_finishRibbonStroke` → `_diffuseWashOps` →
Plan.prepare ctx.fieldFor → Engine `_diffuseFieldFor` → Queue.start ops[0].
Шов меняет только exact-size reused field: первые clears a/b/coverage/ca/cb
убраны, остальные c/cc/mask/pressure/band сохранены. Plan capture по-прежнему
немедленно очищает эти пять inputs перед stitch/transport reads. Cold/replaced
field construction unchanged. `_dryWashScratch` вызывает fieldFor без нового
аргумента и получает прежние десять clears.

Между lookup и capture Plan только читает scratch metadata/target references,
создаёт отдельные owned input buffers, closures и CPU fields; texture getters
пяти выбранных field buffers не читаются. Metadata/scratch reads не удалены.
Upload flow/foreign прежде capture не читают выбранные field textures.
Синхронный capture нельзя переносить на следующий кадр без другого ownership
контракта; этот кандидат его не переносит.

103 tests/2files PASS, включая10 новых actual Engine/Plan controls:
new/reused × radius8/200 × foreign water false/true; physical texture getter
бросает до настоящего clear, полный solver+finish проходит; initial capture
делает пять clears, только subsequent physics читает textures. Direct Engine
field lookup подтверждает0/0/1/0/0/0/1/1/1/1 experimental и все10 ordinary;
foreign dimensions1537→1792 replace field. Empty scratch/outside bounds return
без field lookup. Post-acquire injected failure и dispose-before-capture не
мешают следующему обычному lookup reset. Pool reused/new ownership сохранилось.
MockGL не доказывает pixels/стоимость GPU. Нужен hardware exact field endpoint
и paired noOverlap RAF после review; текущий900ms hitch не объявлен исправленным.

Runner: existing `/home/suselman/projects/pencil/node_modules/.bin/vitest`,
private temp config alias existing nanoid/lodash and own shared source;
без installs/symlinks. Лог temp/duplicate-clears/tests.log. Whole web TS ещё не
проверен здесь: isolated worktree не содержит dependencies. Hardware не запускался.
