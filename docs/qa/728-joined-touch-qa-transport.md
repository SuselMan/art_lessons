# Joined touch: отдельный QA транспорт и оставшийся UP хвост

774e5baa добавляет только DEV transport: VITE_QA_JOINED_TOUCH=1 на отдельном
5342 включает typed ctor option независимо от query после create/navigation.
Production и обычный DEV остаются OFF. Три helper tests и strict helper TS PASS.
Immutable source1008 rawSHA exact, served env true; backend4539 unchanged.

Surface39441 и70101 подтвердили initial create и повторный query-free Room
с ctorjoined=true. Источник/пользовательские5330/5329/5339 не менялись.
Предыдущий96079 INCONCLUSIVE: harness вызывал несуществующий entryById,
а polling скрывал exception. Исправлен actual entries.find и fatal exceptions.
Не трактовать timeout как engine hang. 39441 ACK2/GL0, DB не был captured.

70101 EXIT0/CLOSED: strict >=2distinctstrokes, actualentries/serverSeq1/2,
REST DB200 ровно оба acceptedID, GL0/lostfalse. Physical logs retained.
Brush400, paced3s synthetic native PointerInput, actual Surface Chrome/Intel
устройство; это не аппаратное перо и не paired adaptive FPS.
Active180frames/max33ms/0>100; tail800.2ms. Окно6772.4→7572.6 содержит
только _display CPU5.1ms. До этого первыйUP _onEnd53.2ms/_finish34ms;
nexttapUP _onEnd63ms/_finish35.2 включает synchronous _completeSettle →
Queue.complete30.1ms (предыдущий724units), после него новыйjob125units.
nexttouch handler72.9ms включает DOWN+MOVE+UP, не отдельный DOWN.

Вывод ограничен: большой tail не объясняется JS внутри самого800ms окна;
перед ним произошёл sync UP drain с GPU submissions. Это temporal lead,
не измерение конкретного shader/GPU duration. Никаких дополнительных
readPixels/gl.finish во время profile не добавлено. Passive methods cap256,
original this/args/return сохраняются, nested timings не складывать.
Raw private: motion-surface-1791385169681.json, surface-tail-attribution.json
в728-one-band-room/temp/band-room. OwnChrome18016/task/forward2497134 закрыты.
5342 оставлен рабочим; приглашение пользователя решает root.
