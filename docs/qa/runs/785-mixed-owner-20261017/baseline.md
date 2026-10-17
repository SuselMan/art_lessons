# #785: подтверждённый mixed-history вариант

Source engine/controller идентичен integrationd35b5205 на момент проверки.
Публичные appendOperation(remote): layerM/M70stroke, layerL/старый front8-v4stroke.
Первый материал остаётся dirty, второй рисуется по кадрам и создаёт реальную
WatercolorSettleQueue drawing continuation. Для воспроизводимости CPU fixture
ограничивает второй slice до одного yielded draw, как при исчерпанном GPUбюджете.
Никакой _settle вручную не назначается. Jobs0, pointerNULL.

Следующий реальный M70 RAF callback вызывает NativePuddleTarget.resetFromScratch,
который бросает `Native puddle target requires exclusive settle-field ownership`.
Оригинальный положительный test реальноFAIL за224ms; baseline сохранён какit.fails.
Mock заменяет только presentation shaders, NativeTarget guard/controller/source и
legacy drawing continuation действительны. Это не native RGBA доказательство.

Причина: host.drawing проверяет stroke/rebuild jobs, но не legacy_settle. Global
shared field не может передаваться M70 до завершения старого continuation.
Это доказывает допустимый mixed-history сценарий разныхслоёв, не объясняет
автоматически исторический all-M70prefix #785/старыйCP8 и не закрывает его RCA.
Runtime исправление в этом baseline отсутствует.
