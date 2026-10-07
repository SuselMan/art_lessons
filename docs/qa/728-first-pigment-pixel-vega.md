# #728: первый реальный пигмент, Vega, 7 октября 2026

Источник: 2ae8d18e, 1004 tracked web/shared SHA; отдельный immutable 5330.
Обычная комната, Fine 1754×2480, кисть400, вода/пигмент100/100.
Все ускорения и provisional material presentation выключены; bandBatch=false.
Нативные `_pointer._handleDown/Move/Up`, настоящий physical paint/display.

| Состояние | Down CPU | Первый пигмент, верхняя граница completion | readPixels wait |
|---|---:|---:|---:|
| Первый штрих | 12.3ms | 15.9ms | 3.6ms |
| После UI Dry | 2.6ms | 4.0ms | 1.4ms |
| Предыдущий solver next3/92 | 9.4ms | 376.3ms | 366.9ms |

Во всех случаях 25/25 пикселей ROI изменились с серой бумаги на фиолетовый,
GL0, context not lost. При третьем Down `_completeSettle` занимал3.5ms CPU,
но Down отправил348 drawArrays вместо14 первого штриха. CPU submission
не измеряет завершение этих GPU-команд. Первый Down выделил13 текстур,
после Dry —3. Время методов вложенное, суммировать его нельзя.

5×5 readPixels из default framebuffer выполнялся ПОСЛЕ возврата Down;
он принудительно завершает GPU-очередь. Поэтому это верхняя граница готовности
реального пигмента в framebuffer, **не timestamp браузерной презентации**.
Baseline ROI read перед Down также синхронизирует ранее отправленную работу;
366.9ms последующего ожидания относятся к работе, отправленной после baseline.
Пассивный CPU probe не содержит дополнительных readback/fence внутри Down.

Raw: `temp/band-room/first-pixel-pass.json` (private, ignored).
HOME original: `680-lifetime-hardware/temp/one-band-room-2ae8d18e/first-pixel-1791378726463.json`.
Controller34003 EXIT0; собственный Chrome закрыт. Другие устройства не проверены.

## Отдельный geometry candidate

2ae8d18e добавляет default-OFF typed bandBatch и DEV Room qaBandBatch.
Physical painter10tests/whole web TS прошли. Native Room OFF/ON завершились:
real purple endpoints/ACK/GL0; adaptive input различается, strict pair не заявлен.
Water400 nexttouch96.7→58.1ms, activeMax167→167, tail245→261;
pigment400 nexttouch75.8→66.8, activeMax300→317, tail261→283.
Это не исправление общей плавности.

Strict same19ops replay30733 завершился INCONCLUSIVE на meaningful field guard;
физический endpoint exact-PASS не заявлен. Исторические CPU array/order oracle
сохраняются, но не заменяют текущий аппаратный field gate.
