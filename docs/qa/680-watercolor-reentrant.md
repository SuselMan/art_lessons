# #680: жизненный цикл импорта чужой воды

База: c9e367c2. Это техническая коррекция выполнения, без настройки модели,
изменения шейдеров или порядка вкладов воды/пигмента.

## Причина

Аппаратный trace двух участников на f99d43ea: A рисует воду, B кладёт сухой
пигмент. На A слой пустой (P/V=0 при ненулевом coverage), на B пигмент виден.
Перезаход A восстанавливает краску. У A idle painter counters waterOnlyDepth=1,
diagnosticDepth=1; у B и после перезахода A — 0/0.

Первый `_runSlice` удалённого штриха останавливается в вспомогательном импорте
воды до создания тайла основного scratch. `scratch.live` означает наличие тайлов,
поэтому очередь ошибочно отбрасывает это вычисление как уничтоженное. Генератор
не закрывается, `finally` общего режима waterOnly не исполняется, и последующие
вызовы тоже пропускают пигмент.

## Коррекция

- `waterOnly` и признак рекурсивного сегмента принадлежат конкретному вызову
  painter и передаются явно, без общего изменяемого счётчика через yield.
- Только sliced drawing задаёт очереди собственный lifecycle: актуальная
  идентичность scratch в replay cache, а не наличие уже созданных тайлов.
- Cancel/dead drawing закрывает генератор через `return`, освобождая aux в finally.
- Обычный solver сохраняет прежнее правило `scratch.live`.
- Destroy отменяет drawing до уничтожения pool/programs. Context loss сначала
  забывает auxiliary GL handles, затем закрывает генератор, не возобновляя GL.

## CPU validation

21 targeted тест (water source, queue lifecycle, settle plan) проходят.
Новый interleaving regression падает на исходном painter: paused aux suppresses
настоящий P nib. С коррекцией paused/closed aux не подавляет P; aux resume по-прежнему
не выдаёт pigment/composite/finish. Queue тесты проверяют owned-empty resume,
cleanup exactly once при cancel/dead frame/dead complete, chained solver finish,
и неизменность обычного dead-scratch guard. Engine destroy/contextloss тесты
проверяют закрытие настоящего auxiliary generator и освобождение его ownership.

Аппаратная проверка нового source ещё не выполнена. Нужны water A→dry pigment B,
контроль без чужой воды, native→remote→fresh replay и canonical P/C/V/PNG сравнение.

Release worktree validation (same renderer source), 06.10.2026:
full typecheck and production build PASS. Full CPU suite ran alongside the build:
3502tests passed,3tests hit5000ms timeout (two charcoal geometry controls and
one long watercolor chunk control); no assertion failure. Both affected files
then passed110/110 with maxWorkers1, original5000ms threshold and no concurrent
build. The new regression/lifecycle controls passed in the full run. Logs:
`temp/release/{typecheck-lifetime,build-lifetime,tests-lifetime,tests-lifetime-isolated}.log`.
This is CPU verification, not a GPU performance measurement.
