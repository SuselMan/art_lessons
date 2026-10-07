# #728: повторное использование storage brush flow

Кандидат основан на f7dc9c3d, выключен по умолчанию:
`engine._settlePlan.diagnosticReuseFlowStorage = true`.

Оба места отправки chronological brush flow (capture и contact op) вызывают общий
upload. Когда GL texture имеет известное storage тех же width/height, полная
RGBA8 загрузка использует texSubImage2D; иначе исходный texImage2D.
Размеры забываются при destroyTextures/forgetTextures, включая context restore.

Доказательство: обновляется весь level 0 той же texture, теми же байтами,
с теми же filtering, GL unit, форматом и порядком относительно brushPass.
Нет новой квантовки, новых sampler inputs, изменения расписания или числа contacts.
Это устраняет переопределение storage, но не уменьшает объём загрузки;
ускорение на GPU не утверждается до аппаратного A/B.

Счётчики `engine._settlePlan.flowUploadStats`: allocations — texImage2D calls,
updates — texSubImage2D calls, bytes — сумма полных payload byteLength.
Для пары запусков брать разность начального и конечного значения. При изменяющихся
размерах выигрыш может быть нулевым. Same-size reuse актуален при повторяющихся
полях контактов; оба runs должны иметь одинаковые contacts и итоговые buffers.

Проверки: 95 тестов в WatercolorSettlePlan.test.ts и новом flowUpload.test.ts прошли.
Новый тест проверяет исходный OFF путь, ON повторную загрузку другого payload,
изменение width и сброс storage при forgetTextures. Реальное сравнение texels,
latency и GL errors на Surface/Samsung остаётся отдельным аппаратным gate.
