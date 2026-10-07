# #728: удаление первого eager flow upload

Флаг `engine._settlePlan.diagnosticSkipInitialFlowUpload`, default OFF, latched
при prepare. Счётчики initialFlowUploadStats retained/skipped/bytesAvoided.

В исходном eager пути captureInputs загружает contacts[0].field. Единственные
потребители flowTexture — два brushPass внутри contact exchange. Перед первым
exchange contactOps безусловно выполняет полный upload этого же first field;
никакие fieldOp/front/diffuse/resample consumers не связывают flowTexture.
Следовательно первый upload — dead write. Кандидат оставляет capture queue entry
на месте (пустой callback), но не создаёт/связывает/загружает flow texture в этом
callback. First real contact по-прежнему вызывает bindFlowTexture перед upload.

Сохраняются очередность canonical capture и всех contacts/pulses, payload,
texture filtering и GL unit, sampler dependencies/Q8. Удаляются одна полная
upload и преждевременное создание texture на eligible eager settle. Lazy path
уже не имеет first capture upload; zero contacts не получают никакой новой ветви.
Cancellation до первого contact просто не создаёт ненужную texture.

95 tests/2 files проходят. Новые тесты с foreign water и без него проверяют:
canonical pigment capture всё ещё op0; no brush before capture;
ON uploads равны OFF uploads без первого; first two OFF payloads равны;
все chronological brush samples видят побайтно одинаковый flow, каждый pulse
сохранён; изменение флага после prepare не меняет latched capture.
Оба остальные reuseFlow flags в этих сравнениях OFF.

Аппаратный gate: final material fields/PNG OFF=ON и GL alive на Surface/Samsung;
bytesAvoided соответствует ровно одному first payload на каждую eligible settle,
не трактовать сокращение bytes как установленный выигрыш latency.
