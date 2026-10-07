# #728: границы текущей проверки истории

Текущий runtime-кандидат снимков — `1840f311`; полный engine прогон после
исправления тестовых fixtures:1704PASS/16skip. Samsung fresh snapshot restore
проверен на этом runtime, wholeRGBA exact. Это не вся многопользовательская
матрица акварели.

Сохранённый `680-device-qa-guards/temp/async-multiplayer/matrix-fifo.mjs`
принудительно включает `_wcAsyncFinish=true` и `splitQuanta=true` и требует
peer packet во время pending canonical FIFO. Оба флага выключены в текущем
основном стенде. Его прежние22barrier результаты относятся к своим frozen
sources и не доказывают current-default поведение.

Следующий текущий прогон должен оставить defaults и проверить два настоящих
автора, разные слои, overlapping native watercolor/pencil, structural Undo
и Redo, paper Dry, reconnect и позднего читателя. Для каждого барьера нужны
одинаковый authoritative журнал, layer order/visibility, nonempty RGBA,
GL alive и отсутствие владельцев незавершённой работы. Нельзя требовать
pending FIFO как условие успешности default-OFF режима.

Отдельный retained incomplete-history controller воспроизводит stored
snapshot, удержанную догрузку prefix, Undo/Redo и context loss. Его ранее
успешный результат также имеет отдельный source passport. Повтор на новой
сборке нужен при следующем аппаратном окне; CPU тесты сами по себе его
не заменяют. Samsung сейчас занят causal pure-water экспериментом.

Подготовлен current-default controller: `temp/night-728/matrix-current-default.mjs`,
SHA256 `29f710a4c947c6f59c74f9ee3a2996eac1498fd8bc7109e59ff5df0e5bf15fb1`. Node syntax PASS.
Убраны принудительные async/split и wrapper, запрещавший обычный drain.
Observer только регистрирует реальные peer packets; current flags проверяются
как OFF. Наблюдение settle-overlap сохраняется отдельно от успешного журнала.
Controller ещё не запускался: syntax не является аппаратной проверкой.
