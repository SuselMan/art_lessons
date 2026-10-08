# Native Room first pen40: Surface a83

`a83f501e` INIT завершился, настоящий UI Room подключился с native=true/ready=true.
Ввод CDP pen40, preset `normal:100:100:PB29:round`, world300→360 записал одну
реальную StrokeOperation. Но GPU source owner отклонил emitPrepared:
`Room-owned backend has no standalone material fields`. Затем canonical task
cancelled. Это воспроизводимый ownership/API контракт candidate backend;
GPU arithmetic, причина Samsung process exit и качество рисунка не установлены.

GL0, context lost=false, RAM2083→1272MiB, memoryAbort отсутствует. Второго штриха
не было. Final export/nonempty visibility gate не достигнут, PASS качества нет.
Source/paper HTTP/SHA паспорта проверены. Own target закрыт, Surface освобождён.

Маркеры start/end/reject методов consume/ownerFor/emitPrepared/prepareSettle/
publishCurrentToGl писались на диск через console event сразу. ownerFor отмечает
вход в создание/получение source owner; это не отдельный constructor GPU timestamp.

[Компактные результаты](harness/728-room-native-first/surface-a83.json),
[controller](harness/728-room-native-first/controller.mjs). Приватный raw:
`temp/room-gl-factorial/native-a83-first40`. Повтор после исправления требует новой
frozen сборки и эксклюзивного аппаратного слота; Samsung не запускался.
