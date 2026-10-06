# #728 — opt-in canonical FIFO: первые аппаратные проверки

Прототип e73a463e (последующие CPU-тестовые commits не меняют runtime), default OFF.
HOME runtime: `/home/suselman/projects/pencil-agents/680-water-wet-tone-qa`, порт5316.
Паспорт: index beb859d1315f56811cebe331260ff6d84e6a63d2944c6b65f35906a4177b409a;
Painter c9c876fb847b2d046f6eb622e588f30571801ba750dbee949a78f59b397ebc1f;
Scratch24210ad3fb76a8e25c76a6d6d25f6c2a4142d0c98df3889d504ba36750c14d54;
Plan3ae486debba23244d9adc204371f51e24cf8bc786e510aa549009c44fb996b68;
FIFO4b8970ec0f771093811e763b3ff269eb7c68b1908caf8d2baba99029bc46e9ee.

## Материал и канонический endpoint

На настоящей HOME Vega private-engine fixture640×480/brush400 принял три chunk.
Native и собственный checkpoint-free packed rebuild: wholeRGBA0/max0.
Три native prepare и три rebuild prepare имеют одинаковые full-channel hashes
и суммы P/C/V/coverage/stroke/base/dry полей. Ограниченные ROI сохранены байтами;
полные массивы используются для digest, но целиком на диск не записаны.
Всего9 непустых prepare stages (включая Redo),485 команд,GL0/lostfalse,
ошибок браузера нет. Synthetic input handler max9.9мс не является обычным Room
benchmark и не доказывает плавность.

Raw: `temp/history-parity/async-fifo-candidate/{report.json,material-comparison.json,summary.json,native.png,rebuild.png}`.
Немедленный контроль отдельно: `temp/history-parity/async-fifo-immediate/`.
Оба собственных Chrome закрыты finally.

## Обычный Room, PointerInput, UI история

Собственный custom board **3200×1000**, viewport1280×800, brush400,6 секунд,
coalesced2/rAF. Записаны8 естественных chunk одного strokeId.
UI Dry → Undo → Redo → новый engine того же участника:

- NativeDry/Redo/fresh PNG SHA c0ce193ff4daaa12a5a621f866e0ca657ed62ec6e6b07cbd785c7a1db4cd4a67.
- Непустых пикселей2358368; Undo полностью пустой.
- Журнал и identity exact; на всех этапахGL0/lostfalse.
- Active rAF max22мс,0 кадров>33мс; первые1.5с после pen-up max45мс,
  один кадр>33мс,0>100мс. Это одиночный ON прогон, не matched OFF/ON сравнение.

## Потеря контекста с очередью

Событие actual WEBGL_lose_context вызвано при19 pending requests,одном owner и
одном подтверждённом server ACK. Restore и fresh engine: PNG SHA
b9f84acf664ed4a161857a85561da522eed5a401563365264616e793c770af5d,
614482 непустых пикселя, journal/identity exact,GL0/lostfalse.
Подтверждённый префикс сохранён; незаписанный tail не объявляется сохранённым.

Raw обеих Room проверок:
`temp/history-parity/room-async-fifo/{report.json,summary.json,source-*.png,loss-*.png}`.
Все пути raw относятся к указанной HOME worktree. Chrome закрыт finally;
Vega передана следующей snapshot/reconnect проверке.

## Открытые гейты

Перед default ON нужны корректные peer presentation и принятие queued structural
операций до GPU выполнения, matched water400/pigment400→new-touch/rAF,
multi-peer/Dry/layer/history/snapshot ordering и ресурсные ограничения.
Peer-preview bypass исходного e73 — известный блокер, исправляется отдельно.
Текущий прототип не включён в production и не обещает гладкость на Samsung/Surface.
