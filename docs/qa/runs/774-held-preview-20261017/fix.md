# #774: отложенная установка снимка до физического UP

Кандидат построен поверх lifecycle #788 (`d91d02ac`), baseline41f38c71.
Runtime integration не менялся; только отдельная рабочая копия.

`restoreLayerFromSnapshot` теперь возвращает `void | Promise<void>` и принимает
необязательный AbortSignal. Когда обычный инструмент физически удерживает слой,
установка откладывается: исходные pixels/FBO продолжают жить доUP. Никаких
coverage, checkpoint или installed audit до установки. Обычный свободный путь
остаётся синхронным; M70 сохраняет немедленную отмену физического хвоста.

После localUP установка идёт после записи окончательного локального мазка.
Peer end/cancel/disconnect/reset освобождает ожидание без ожидания durable ACK:
так replayGate не образует цикл. При ещё не записанных peer dabs остаётся
существующий unsettled repair после окончательного op.

Снимок принадлежит исходному buffer identity. Abort, замена новым pending
снимком, retirement слоя, resize, context loss и destroy отвергают completion,
удаляют tile references и не утверждают успешную установку. Игнорирующие return
старые callers не получают unhandled rejection при teardown; await исходного
Promise честно получает AbortError. Production sink возвращает completion и
условно await его внутри decode-loop, до appliedLayerIds и следующего inflate.

## Память

Копий raw views и нового CPU bytebudget нет. Сохраняется существующий предел
#467: один decoded слой в sequential pipeline. Caller прямого API обязан await
completion перед повторным использованием views или декодированием следующего
слоя. Новый restore generation синхронно отменяет старый pending до новой decode.

Исполняемая проверка использует реальный engine и gzip двух слоёв: первый held
слой даёт decompresscount1; второй ещё не распаковывается. Abort обнуляет views
старого pending и завершает старый pipeline с appliedLayerIds=[]; новое поколение
распаковывает первый слой (count2), ждётUP, затем только свой второй (count3).
Старый второй слой не распаковывается. Это проверка порядка реальной decode,
а не только количества записей Map.

## Проверки и границы

Pixel baseline доUP теперь положительный. Проверяются marker/smudge FBO,
послеUP exact full replay, peer release безACK, шесть вариантов отмены,
latest replacement, отсутствие преждевременной coverage/audit, pendingmetadata
и network snapshot regressions. 8файлов/116тестов PASS.

Это не обещание беспрерывного compositor refresh во время Room restore:
restoreRoomState сохраняет существующий suspendDisplay на всю загрузку.
Отложенный install продлевает его доUP; изменения held buffer сохраняются, но
видимость новых MOVE через actual composite требует отдельной native проверки.
Снять display batching без отдельного доказательства этот кандидат не пытается.

Web TypeScript и scoped lint PASS. Новых browser/service/GPU нет; тестовые
процессы завершены. Native compositor gate является обязательным до promotion;
при исчезновении новых MOVE доUP кандидат остаётся изолированным прототипом.
