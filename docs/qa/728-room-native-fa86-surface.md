> Исправление: описанная ниже water→pigment40 рука INVALID FIXTURE: контроллер передавал `normal:0:100` (вода0, пигмент100). Она доказывает только выполнение двух пигментных штрихов. First40 `normal:100:100` остаётся валидным.

# Native ordinary Room: Surface fa86, два pointer40 gate

На frozen `fa86fd7f` (1138 source SHA, 7 baked paper SHA, HTTP source passport)
после исправления source/composite ownership успешно завершены:

- Original first pen40: реальный пигментный штрих world300→360, packedStroke1,
  source emit/publish/prepareSettle, native pending на отрыве → idle.
- В отдельной свежей Room: вода40 → пигмент40 поверх неё, packedStroke2,
  обе операции done, native source/final завершились без ownership rejection.

Обе руки: native=true/ready=true, GL0, lost=false, errors=[], memoryAbort нет.
На first40 живой кадр содержал1445 изменённых/833 purple пикселей; итог1444/953,
экспорт2538 alpha pixels. На water→pigment итоговый пигментный live кадр858/476,
final858/544, экспорт1585 alpha pixels. Screenshot настоящей Room показывает штрих.
Маркеры source-owner записаны сразу на диск; ни один source method не отклонён.
Это проверка наличия результата и orchestration, **не** качества/parity с WebGL.

RAM preflight2082/2037MiB; во время probes1322/1086MiB соответственно. Own targets
закрыты, Surface освобождён. Samsung не запускался. 400, Undo/Redo, reload,
несколько участников/слоёв и source/settle pixel parity этими gate не проверены.

Pure-water framebuffer изменился, но classifier обнаружил purple172 pixels:
курсор/представление могут загрязнять это наблюдение. Поэтому результат **не**
доказывает pigment-free material или точность foreign auxiliary import. Сама
последовательность вода→пигмент не вызвала unsupported/error.

Синхронные final/live readbacks и paper preload влияют на cadence: физическую
задержку пера, GPU-duration и стабильный performance из них не выводим.
[Компактные данные](harness/728-room-native-first/surface-fa86.json).
Приватные raw: `temp/room-gl-factorial/native-fa86-first40` и
`native-fa86-waterpigment40`; папки baseline2c/a83 сохранены отдельно.
