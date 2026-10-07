# №728: CPU подготовка и lifetime контактных массивов

Кандидат от ff5a8db6; existing lazyContacts/owner14 остаются default OFF.
Формулы контакта, группы, порядок полей, upload bytes и физические проходы
сохраняются. Изменение освобождает CPU ссылки, не обнуляет массивы и не меняет
GPU texture. Нет stand update или аппаратного performance claim.

## Реальный workload до изменения

Использован полный retained1396-input.json: два оригинальных packed strokes
400px и Dry, SHA256 8649e8ad1245ac09b5b2ec4e2781c3a0a91b4eae4ff37bb2cb0307485afd829f.
Настоящий engine/MockGL воспроизвёл этот журнал и предоставил metadata/field
rects. Это Node/VPS CPU workload, не измерение WebGL драйвера Samsung.
Raw: temp/cpu/prepare-profile-baseline.json, prepare-geometry.json,
contact-memory.json; partial fixture failures сохранены в сессии, не объявлены
source failure. Последний benchmark завершился успешно.

Первый prepare имел 138 travel records/53 contact groups. Foreign stencil
пуст: нет foreign sources и wet contacts. Второй prepare: 9 travel records,
3 groups, 2 wet contacts, но опять нет foreign sources. Поэтому foreign raster
не объясняет задержку этого конкретного 400px workload. Синхронные descriptors
первого контакта заняли около 0.8 ms в CPU microprobe; это не hardware latency.
Оставшиеся 42 ms из profiler находятся вне Plan.prepare, а attribution этого
caller/composite пока не завершён. Его нельзя назвать foreign decoder cost.

Реальные группы первого stroke дают 2,163,384 байта upload payload, крупнейший
payload 48,888 байт; второго — 76,060 / 35,340 байт. Эти числа относятся только
к Uint8 upload arrays. Они не включают три Float32 рабочих массива генератора,
метаданные, GPU textures или GC overhead. Кванты producer сохранили byte equality;
максимальный Node next оказался 4.8 ms, поэтому 256-cell checkpoints не дают
жёсткого 2 ms wall-time обещания.

## Ресурсный кандидат

Раньше выполненные contact upload closures оставались в job.ops и удерживали
field.pixels до конца job; завершённый generator также оставался захваченным
advanceField. Теперь lazy upload владеет отдельным nullable payload slot.
После texImage2D — последнего JS потребителя — ссылка очищается в finally.
Дальше brushPass читает только загруженный WebGLTexture; upload content WebGL
копирует при вызове. Eager/OFF slot не очищается, повторное прежнее поведение
сохранено. Данные в Uint8Array никогда не переписываются.

Одновременно в неизменном порядке исполнения pending только один contact
payload: следующий CPU field не начинается до upload и всех pulses предыдущего.
Completed/aborted generator reference явно становится null. Dispose очищает
неисполненные payload slots; forget/destroy очищают общие CPU owner slots.
Отмена во время generator.next закрывает его после выхода, не вызывает return
на исполняющемся генераторе. Upload failure распространяет ошибку; после abort
ни один brush consumer или следующий upload не выполняется.

Actual Plan/Queue tests сохраняют byte/order oracle eager vs lazy (за исключением
уже разрешённого одного redundant preupload), проверяют максимум одного pending
payload, его null после upload, cancel/forget, ошибки upload и zero late writes.
job.ops специально остаётся живым при проверке освобождения ссылок. Это proof
reference ownership, не гарантия времени работы V8 GC или итоговой скорости.
