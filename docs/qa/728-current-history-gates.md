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
SHA256 `642b96ddd1fd938cacabd794ecae698a891a34d05e15852bf4aaaa3a231b9f79`. Node syntax PASS.
Убраны принудительные async/split и wrapper, запрещавший обычный drain.
Observer только регистрирует реальные peer packets; current flags проверяются
как OFF. Наблюдение settle-overlap сохраняется отдельно от успешного журнала.
Controller ещё не запускался: syntax не является аппаратной проверкой.

Финальные барьеры также отказывают при незавершённых async owners или asyncError;
нулевой GL error сам по себе не означает завершённый расчёт.

Собственный QA runtime1840 повторно поднят на5330 (HOME PID1294964):
exact argv/cwd подтверждены, create/main HTTP200, originalvite.config.ts
и existingdeps/node22, backend4539. Source-passport1840/988files сохранён.
Controller скопирован наHOME и syntaxPASS. GPUконтекст ещё не запускался;
5330 временный, пользовательский5329 не менялся.

## Actual current-default matrix1840

Handle15648 завершён exit0, ownedChromeClosedtrue. Два настоящих
authenticated Room автора,640×480/Vega, currentasync/splitOFF.22barriers
PASS: слои/структурныеUndoRedo, water→foreignpigment, второй цвет, sharedDry,
авторскиеUndoRedo, layeradd/move/hide/show/remove+UndoRedo, reconnect и
новый третий автор. Все проверенные peerRGBA count0/max0/premult0/alpha0,
262003nonempty pixels. На каждом барьере idle/GL0/lostfalse/owners0.

Отдельный CPU pixel audit подтвердил реальные изменения: sharedDry→Undo
colour256473px/max197; Redo изменяет те же256473px. Hide→Show и
Remove→Undo25538px/max53. Это не сравнение неподвижных пустых изображений.

Actualpeerpacket получен, но peerDuringSettle=false: этот прогон не доказывает
обработку пакета внутри незавершённого settle. Latejoin пошёл по ordinary
historyfallback после отмены bakedoperations; actualsnapshotblob не скачивался.
Bitmaprestore отдельно доказан cachegate1840. Широкий межустройственный
midpen/contextloss gate всё ещё нужен.

RawHOME:`680-water-wet-tone-qa/temp/night-current-default1840/
{report.json,meaningful-mutations.json,*-0.png,*-1.png}`. Rootcopy:
`temp/night-728/current-default-matrix1840-report.json`. User5329 неизменён,
временный5330 пока сохранён.
