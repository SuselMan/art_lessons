# ADR 018: единый движок Grafetto и описания кистей

## Статус

Решение принято Ильёй 05.11.2026; реализация в #809. Уточняет ADR 013 и ADR 017.

## Граница

BrushDefinition — версионируемые данные: идентичность, модель формул и её
параметры. Пресет Krita переводится в эти данные при импорте. Наши материалы
используют ту же оболочку, сохраняя свои формулы. Совместимость формата импорта
не означает обязательного экспорта всех моделей обратно в Krita.

Ввод пера, планирование работы, тайлы, слои, композит изображения, операции,
Undo/Redo, snapshots и онлайн принадлежат Grafetto. Модель кисти не выбирает
формат комнаты, отдельную доску, собственную историю или транспорт. Все
инструменты могут работать последовательно и одновременно на одном слое.

Исполнители отличаются там, где отличаются алгоритмы: материал графита,
покрытие отпечатками, накопление штриха, перенос цвета. Общий движок не означает
одну формулу для всех материалов. Конфигурации не содержат исполняемого кода.

## Перенос

Основа новой ветки — актуальный main. Из agents/brush-import переносится
импорт и реализация поведения, использовавшая обычный конвейер операций.
Исходная ветка остаётся сохранённой для переноса остальных полезных механизмов.
Контур straight-rgba8 с отдельными допусками всей доски и собственной индексной
историей в новую систему не переносится. Его наличие в старой QA-базе не даёт
права менять или удалять старые данные.

Существующие tool/preset-пары остаются читаемыми входами истории. Их разрешение
переводит выбор в BrushDefinition; это граница совместимости записей, а не второй
рендерер. Идентификатор модели и её версия определяют формулы. Определения и
ресурсы импортированных кистей сохраняют собственные неизменяемые идентичности.

Акварель пока не предлагается для нового рисования. Типы и replay старых
акварельных штрихов сохраняются. Экспериментальная разработка живёт в отдельной
ветке и должна вернуться через тот же контракт модели.

## Приёмка

Одна обычная комната со всеми доступными инструментами и импортированными
кистями. На одном слое проверить смену материалов, очистку, добавление и
удаление слоя, Undo/Redo, повторный вход и второго участника с живым штрихом.
Сохранение поведения собственных материалов проверяется отдельно от качества
импорта Krita. MockGL и короткий штрих на пустом холсте не доказывают плавность.

После функциональной приёмки начинается отдельный этап производительности
Krita, с обычным карандашом как ориентиром. Документ не утверждает, что эта
приёмка или оптимизация уже завершены.

### Tool choice by purpose

The UI offers flat drawing, eraser and smudge catalogs. Preset purpose derives
from its execution semantics: explicit erase wins, then mixer, otherwise paint.
The source filename is never used to infer purpose. Each category retains its
native Grafetto tool and offers matching Krita presets beside it. Imported and
built-in digital presets keep their original descriptor and version.

`eraser.brush` and `smudge.brush` select the preset; `native` retains the calibrated
native formula. The existing tool-sync boundary compiles a selected digital
preset to the same `digitalBrush` operation/preset token already used online.
UI selection and hotkey return behavior remain eraser/smudge. This adds no wire
format, replay or tile renderer. Native erase-through-layers remains native-only.
The cursor uses the compiled render tool, matching the selected preset geometry.
Size and strength are remembered per selected preset during the room session.
Stored imported IDs survive metadata loading; unavailable resources block drawing
through the existing preparation gate rather than falling back to another brush.

The floating panel opens the same image picker for the three brush catalogs;
shape selection and other tools keep their existing behavior. Original KPP
artwork is preserved separately from generated photographs of physical tools.
