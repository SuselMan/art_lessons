# Read-only аудит материала раннего preview

Проверен QA-код в `728-solvent-init`; движок и аппаратные прогоны не менялись. Это проверка контракта, не оценка картинки и не доказательство сохранения массы на GPU.

## Конкретный риск

`SealedPreviewGlPort.mjs:14–15` сначала уменьшает production coverage, затем заменяет её картой `(0,0,0,support)` из raw V.R/A. `OwnedPreviewRuntime.mjs:16` передаёт **эту же** карту в production composite. Транспортная маска и material coverage имеют разные значения каналов.

Production `shaders.ts:1648` читает coverage.B как standing water; `:1816` читает coverage.R/A как положение поперёк щетины. Замена стирает оба значения. PaperWet не обязательно становится нулём: он равен max(P.R/P.A, coverage.B). Но у краски с малой собственной водой над чужой водой wetness теряется. CPU fixture: coverage.B=230/255 и P.R/P.A=13/255 дают wetness 0.902 до замены и 0.051 после неё; across меняется с примерно0 на−1. Источник при этом остаётся неизменным.

Минимальный следующий paired gate: один и тот же P/C/original/recipe, сравнить composite с уменьшенной исходной coverage и с transport-domain coverage. Проверить low-own-water/high-standing-water и равномерный цвет. Если различие подтверждено, разделить транспортную маску и material coverage в собственных ресурсах preview; не записывать придуманную толщину в V.R/A.

## Проверенные свойства и ограничения

- P/C вычисляются из одной OLD стороны, с одинаковыми domain/paper/scale/radius; front переключается парой. Раздельного последовательного чтения нового P до C нет.
- Destination resolution1024 задаёт нормализованные tileUV, поэтому sampling128 покрывает тот же tile. Это правильно только в заявленном origin0/bounded1024 контуре; nearest-filter может давать восьмипиксельные ступени.
- Перед каждым composite pending восстанавливается из retained original, используется replace-draw. Повторное композитирование не накапливает opacity само по себе. Аппаратная видимость при detach/rebase/handoff этим не доказана.
- Общий линейный оператор сохраняет пропорциональный спектр в вещественной арифметике. Отдельные RGBA8 округления могут менять слабые отношения P/C и суммарные каналы; тест показывает простой отрицательный пример. Нельзя заявлять сохранение массы после произвольного количества preview ticks без actual total-channel readback.
- На неровной бумаге равномерная плотность не является неподвижным состоянием downhill transfer. Проверять надо постоянное отношение цвета, а неподвижность плотности — отдельно на плоской бумаге.
- Один diffusion tick на rAF делает скорость preview зависимой от частоты кадров. Канонический endpoint остаётся другим владельцем; это не deterministic replay модели.
- `complete(ticket)` возвращает false для stale ticket, но runtime не проверяет результат перед material(). Нормальный синхронный GL-вызов не даёт межкадрового вмешательства; это защитный риск при reentrant cancel/loss, а не доказанная аппаратная причина.

## Воспроизведение

`node docs/qa/harness/728-room-moment/preview-material-contract-audit.mjs`

PASS: реальные initialize/step из QA port; неизменность source; отрицательный material-channel пример; совпадение P/C аргументов; normalized UV; retained-original binding. Fixture использует явный абсолютный путь к read-only GPU worktree, чтобы не копировать runtime и не выдавать mock за GL.

## Повторная проверка bac0af65 и handoff

`bac0af65` передаёт **readonly owner.lease.fields.coverage1024** в composite, сохраняя отдельную domain128 только для diffusion. Normalized tileUV корректно читает исходные Q8 coverage/across/standing без повторного уменьшения. Это тот же физический объект текущего owner; epoch проверяется runtime перед tick, перед source rebase preview retire/detach выполняется синхронно, поэтому старый transport не читает обновлённые поля после rebase. Не распространять вывод на origin≠0 или изменение recipe без нового seal.

Fixture material теперь отдельно проверяет frozen6aeec405 неправильный binding и текущий исправленный binding; старый отрицательный пример остаётся reproducer дефекта, не ожиданием current regression.

Конкретная цепочка installer: завершение parent job → preview.beforeRebase(next) → retire/detach **pending** → morph.hold(next) → source.rebaseFromPredecessor → morph.rebaseStarted(next). Detach не удаляет `held.before`. Именно `held.before` показывает исправленный async-preview; pending — вычисленная цель, до которой reveal ещё может не дойти. Поэтому копировать pending вместо before означало бы дополнительный скачок. RebaseStarted меняет только время/длительность, before сохраняется; последующие `_advanceWashReveal` смешивают before к новой presentation. При finish transfer `morph.visibleField(owner).copyTo(canonicalHeld.before)` также берёт последнюю видимую картинку.

`preview-handoff-readonly-audit.mjs` использует реальный morph class: видимое37 сохраняется через detach/rebase при pending91 и новой source120. Отрицательный control прямой source даёт jump37→120. **Блокирующего CPU handoff-дефекта в этой цепочке не найдено.** Реальный тайминг advance, передача родительского delta и видимость первого GPU кадра остаются quality gates, а не доказанными дефектами. Runtime/source не менялись.
