# Изолированный замер GPU pass

Диагностика по умолчанию выключена. Явный `RoomNativeRuntimeContext.diagnosticTimestampQueries: true` разрешён только DEV и требует `timestamp-query` у adapter и созданного device. OFF оставляет исходный `requestDevice()` без аргументов. Включение feature само по себе не создаёт query set.

После canonical idle оператор вызывает `beginDiagnosticTimestampCapture(capacity)`, затем один заранее ограниченный сценарий. Максимум 1024 pass, два query на каждый; после предела capture отклоняет дальнейшее кодирование, поэтому это диагностический сценарий, не пользовательский режим. Не добавляются shader, material pass, dispatch, submit, ACK или map в первичный ввод. Оригинальные compute/render pass получают только timestampWrites. Несостоявшиеся quantum не разрешаются.

После окончания ввода и canonical FIFO idle вызывается `readDiagnosticTimestampsAfterInput()`. Только здесь добавляются resolve/copy/submit/mapAsync. Чтение не измеряет время контакта и не входит в основной timing interval. При capacity 1024 два временных buffer занимают по 256 KiB; query set содержит 2048 значений. После результата, отказа map или destroy ресурсы освобождаются.

Результаты — GPU длительность pass в наносекундах; CPU wall, queue wait и bridge copy вне pass сюда не входят. Пустой label остаётся пустым: нельзя выдавать quantum ordinal за название kernel. Следующий controller должен привязать заранее выбранные pass к исходным операторам, проверить meaningful endpoint и GL0 вне ввода, сохранить bounded rows до cleanup. Замер instrumentation overhead отдельный, без заявления прироста скорости комнаты. Аппаратный запуск только после root review и выделения устройства.
