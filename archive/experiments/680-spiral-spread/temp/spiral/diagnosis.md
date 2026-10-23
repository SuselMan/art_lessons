# Спираль в предварительной воде: диагностика 05.10.2026

База 11ee5ab6. Экспорт комнаты l0alezIj, 51 операция. Рабочая копия agents/680-spiral-spread.

## Установлено чтением кода и операций

- Реальные спирали поверх воды seq18→19,22→23,25/26→27. WetProfile соответственно 428f,130f+593e,716e. Влага не потеряна и не равна нулю.
- Вода и пигмент этих пар имеют одинаковый washId. foreignSources excludes same wash, но это не само по себе дефект: RibbonReplayCache переиспользует scratch по washId, coverage остаётся между beginStroke. Нельзя удалять фильтр без проверки поля.
- Размер footprint спирали19 примерно467×371px, max brush diameter115px. Ограничение1536px поля явно не единственная причина для этой компактной спирали (возможны другие более большие предыдущие границы wash).
- Carry разрешает только направления с возрастанием cost; внутри footprint cost0, равные cost дают weight0. Strides привязаны к water budget, cap160. Это известное ограничение, упомянутое уже в комментарии watercolorCarryStrides.
- Puddle diffusion уменьшает обмен по 1/(1+8*density²), где density=2*P.a/coverage.a. Влажность1 не даёт равную подвижность пятнам с разной плотностью pigment/coverage. Простое отключение density ранее дало неприемлемое размытие, потому не предлагается как фикс.

## CPU изоляция carry_geometry.py

Нормализованная суммарная доза10000, water budget160, brush radius55, одинаковый прямоугольный домен воды, travelling share0.35. Actual seq19 dab ellipse union vs single disc. Фронт в oracle имеет Manhattan distance, flat paper; float64 без восьмибитных потерь. Это изоляция геометрии оператора, не полный GPU результат.

- Disc: area9477, mass outside original footprint56.8%, все source texels имеют разрешённого outward-соседа хотя бы на одной stride.
- Spiral: area135935, outside26.0%,18% source texels никогда не имеют outward-соседа даже stride128.
- Mass preserved10000 in both.

Большая спираль при одинаковой суммарной дозе покрывает больше площади и имеет меньше краевого питания carry. Из этого не следует, что production вообще не растекается: mobile/fixed slices, coverage, brush advection and RGBA8 могут изменить результат. Требуется GPU сравнение одинаковой предварительной воды, matched dose и полей по стадиям. Root извещён, GPU слот пока не получен. Код production не менялся.
