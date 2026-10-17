# #747: QA-кэш внешнего sentinel, по умолчанию выключен

Изменён только QA helper `docs/qa/harness/747/room-scissor64-installer.cjs`.
App, восемь kernels, физика, geometry/UV и GPU budget не менялись.
GPU не запускался; ускорение и продуктовая готовность не заявлены.

Опция отдельная: `cacheOutsideSentinels:true` в последнем аргументе
`__qa747CreateScopedScissor64` либо четвёртом аргументе
`__qa747RoomScissorFactory`. По умолчанию false; factory фиксирует bool при создании.
Старый `scissor64-installer.cjs/__qa747Scissor64Probe` эту опцию НЕ поддерживает.
Numerical harness должен использовать новый helper через Paged `inspection.nativeScope`.

WeakMap на окно хранит только role/revision/texture/FBO для unmanaged field/prefix.
Начальное состояние UNKNOWN, каждый fieldFor сбрасывает доказательство.
Clear пропускается лишь при том же sentinel, revision/handles и неизменном ROI.
Managed/hydrated, destroyed/idle, неизвестные handles/revision/hook всегда требуют clear.

`_noteContentWrite` перехватывается только внутри синхронного run. Только точный
selected beginReplaceDraw может сохранить proof при единственном +1 revision;
остальные API-записи его инвалидируют. Между run public-запись ловится по revision.
Raw clear/draw/upload/copy внутри run консервативно сбрасывают ВСЕ proofs;
собственный semantic clear исключён. Проверка поколения/revision/handles после draw
не позволяет опубликовать proof при вложенной неизвестной записи или исключении.
Дескрипторы восстанавливаются перед yield, dispose удаляет proof; GPU-ресурсов нет.
Между run прямые private raw-handle записи исключены только проверенным field-family
ownership и текущим аудитом writer paths; это не универсальный WebGL write tracker.

Финальная проверка против **применённого** helper: 11 Node +29 actual CPU PASS,
один worker. Матрица: 13 настоящих API записи × внутри/между run, readonly/sampling,
managed evict/hydrate, плюс actual Plan обеих веток. CPU RGBA oracle проверяет
clear/scissor/sentinel, не исполняет настоящие shaders.

Actual Plan/MockGL1024: draws199→199, prefix16→16, roles/ROI одинаковы;
clears199→31, skipped168; logical clear pixels208666624→32505856 (−84.42%).
Две prototype identity,79 scopes, exact restoration. GPU-производительность неизвестна.

Полный аудит, тесты, логи и SHA:
`/home/suselman/projects/pencil-agents/747-scissor-outside-role-artifacts/`
(`README.md`, `outside.test.cjs`, `actual-writers.test.ts`, `actual-schedule.test.ts`,
`tests.log`, `actual-tests.log`, `manifest.json`). Источники actual writer зафиксированы
в соседнем JSON. Следующая правка writer coverage требует повторного аудита.

Следующий gate только по GO root: Samsung/Intel all10stage и полные байты против
старого fullclear и независимого factory-OFF unclipped oracle, GL0; затем
NO_PASS_READS и managed Room natural-goal FIRST/fullAPI/performance. Опция остаётся OFF.
Остались небольшие proof-артефакты и symlink общих deps; своих процессов/сервисов нет.
