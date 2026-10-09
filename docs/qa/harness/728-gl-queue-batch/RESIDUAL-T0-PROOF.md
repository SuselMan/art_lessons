# Residual t0: непустой материал на Surface

09.10.2026, active source `9dac0767`. ONE source-only GPU gate: проверенный набор четырёх дабов round400, pigment100, water100; canonical painter, captured original composite; flow выключен. HTTP entry доступен, raw SHA четырёх модулей совпадает с локальными.

Результат: PASS. Четыре composite calls, pigmentLevel1; исходный P ROI содержит16384 ненулевых байта, original material ROI12288. Пары Float32 mobile/immutable-initial P и C совпадают побайтно и непустые. Original и residual t0 material в выбранном64×64 ROI совпадают побайтно: SHA `e78287b9fc1d22d60bff7bfb2c84c07fcec9e7f4104e2506039c4b15fd20e28c`. Исходный P ROI до/после не изменён. Все18 GL checkpoints0, context не потерян, samplers16≥12.

Это подтверждает восстановление непустого начального материала в контролируемом ROI. Это не full-image parity, Room/FIFO/replay доказательство, не оценка последующей анимации/физики/производительности. Следующий шаг — перенести эту начальную реконструкцию в визуальный preview и проверить ONE water→pigment переход при неизменном canonical результате.

RAM Surface2097→минимум1819→postclose1825 MiB. Собственный browser target закрыт; общий Chrome не закрывался. Vite5353 и собственный SSH9455forward остановлены; backend/database не создавались. Disposable result сохранён компактным summary, disposable удаляется finish.
