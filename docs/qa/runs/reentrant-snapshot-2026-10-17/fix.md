# #788: локальное поколение восстановления

Кандидат от44c3d215, baseline1cbf98df. Формат wire/snapshot не меняется.
Public restoreRoomState начинает новое поколение на конкретном engine. Оно
синхронно отменяет предыдущее до закрытия нового boolean replayGate. Старые
suspend/gate освобождаются ровно один раз, до старта нового поколения; поздний
finally больше не открывает чужой gate и не сообщает ready/failure/store/tail.
Исключение resumeDisplay после уменьшения depth не повторяет resume.

AbortSignal проходит через snapshot transport/retry, decode, history и engine
historical preload/rebuild. Blob fetch получает signal; ожидаемые adapters,
которые не умеют abort (включая index api), перестают удерживать continuation
через abortable await. Их поздний результат не применяется и не запускает retry.
Engine.destroy отменяет восстановление до уничтожения ресурсов. При board switch
Room engine effect зависит отboardId и вызывает retireEngine/destroy; guard
capturedengine/currentboard в hook дополнительно закрывает render/effect gap.

История, уже синхронно добавленная ДО отмены, остаётся известной историей того же
engine: отмена не откатывает принятый журнал. Старые asynchronous rebuild jobs
отменяются по конкретной identity, не затрагивая будущую задачу того же слоя.

Проверки: реальный gzip8×8/engine upload seq10/20 теперь устанавливает только20,
RGBA202 сохраняется после отпускания old10. Отдельные negatives покрывают старую
ошибку после нового успеха, старый успех после новой ошибки, gate/depth при
позднем finally, независимые engines, destroy, board/engine ref change,
исторический preload и OOM retired resume. Native GPU данным CPU прогоном не
проверялся; отдельный аппаратный harness координирует основной агент.

Это исправление существующей race, не реализация deferred preview #774. В
частности, cancellation не обещает остановить уже начатый native gzip-worker;
перед применением результата всегда проверяется поколение. Вопрос async
applyLayer/удержания preview и строгого shared peak при конкурентном decode
остаётся отдельным продолжением и не выдаётся за решённый.

Итог CPU:6целевых файлов/54тестаPASS, web `tsc --noEmit` PASS, scopedoxlintPASS.
Ресурсы: новыхbrowser/service/GPUнет, процессытестовзавершены; dependencylinks
выбраннойрабочейкопииоставленыдляпоследующего774кандидата.
