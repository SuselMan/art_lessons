# Интеграция чистого source rebase

Источник: net commit 4f01243afe80b4ee61d27a231a3579b89817ddbb, родитель bf84535b.
Локальный cleanup-коммит d077a5c7 НЕ является самостоятельным patch для root.

В clean task branch от a6fa3d7a:

    git cherry-pick -n 4f01243afe80b4ee61d27a231a3579b89817ddbb

До commit проверить git diff --check и diff всех шести файлов. При конфликте
не заменять весь Plan/Painter старой версией: сохранить qbudget/preview/actualjob
из root, перенести только добавленные ownership и source replay блоки.

Plan anchors:
- рядом с _ownedInputs добавить _coverageOwners;
- prepare регистрирует scratch, dispose удаляет owner и releaseRunningCoverage;
- finish snapshots runningSourceCommands, восстанавливает coverageFilm ДО land;
- ПОСЛЕ land очищает только новый stroke P/C/V, копирует обновлённые базы в loads,
  исполняет immutable source commands; finally прежний dispose;
- destroyTextures release owner alive; forgetTextures release(true) без GL.

Painter anchors: sourceNib/sourceBands/sourceField заменяют существующие draw
вызовы, сохраняя параметры и порядок; waterPhase runningCoverage до первого
coverage draw. Никакого RG-only второго массива команд/цветовой маски.

Scratch: coverageFilm baseline lazy per affected tile, source command ownership,
spill/snapshot отказ при pending film; release/forget/destroy по прежним owners.
index: единственный _wcSourceFilmRebase=false; track только если settle.scratch
совпадает с painting scratch. Условие не включает unrelated jobs.

Нет нового shader/program/physical operator/формата операций. Опция zero-P/C
из bf845 НЕ обязательна для rebase и остаётся OFF. Initial accepted segment/
solvent/source film buffering нужны; root уже содержит их. RG-only849873 и
negative lazyf109 отдельно не cherry-pick. Все требуемые части34d7/577 включены
в net commit. QA93 tests/type/oxlint выполнены для очищенной ветки; hardware
577 выполнен до очистки, новый exact-clean hardware gate ещё не заявлен.

Дизайн следующего async barrier: docs/qa/728-async-finish-design.md.
HOME5316 заморожен577: до завершения profiler не синхронизировать cleanedsource.
