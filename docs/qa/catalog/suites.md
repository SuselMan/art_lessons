# Наборы запусков

Выбрать SHA, затем ресурсы и [подготовку](execution.md). Команда ниже печатает состав и автоматизированную часть, ничего не запускает. Обязательные ручные/device gates выполняются дополнительно; состояние устройства не выводится из desktop E2E.

```sh
python3 scripts/qa/check_catalog.py --suite smoke
python3 scripts/qa/check_catalog.py --suite full
python3 scripts/qa/check_catalog.py --suite devices
python3 scripts/qa/check_catalog.py --suite long
```

## smoke

Ресурсы: 2 независимых браузера, один backend/БД, M70-кандидат; GPU для аппаратных gates.

Длительность: Не измерена для полного состава; это короткая выборка, не обещание уложиться в N минут.

Состав:

- [QA-001 — Вход и первые штрихи](../scenarios/collaboration.md#qa-001)
- [QA-006 — Авторские Undo/Redo](../scenarios/collaboration.md#qa-006)
- [QA-008 — Отключение и возврат сети](../scenarios/collaboration.md#qa-008)
- [QA-012 — Потеря графического контекста](../scenarios/collaboration.md#qa-012)
- [QA-025 — Живые вода и пигмент до отпускания пера](watercolor.md#qa-025)
- [QA-028 — Послойная сушка и переход через её границу](watercolor.md#qa-028)
- [QA-033 — Отключение после UP при живой соседней вкладке](watercolor.md#qa-033)
- [QA-036 — Пустой и частичный снимок, холодный хвост, Undo головы](watercolor.md#qa-036)
- [QA-101 — Цвет, инструмент и его настройки](interface.md#qa-101)

## full

Ресурсы: 2–3 независимых браузера + сетевые авторы до 18, кандидат M70 и legacy fixtures; для parity AMD/Intel/Apple/Adreno; один backend/БД.

Длительность: Не измерена; разнести браузерную, аппаратную, performance lanes. Непрерывные 30 мин серии вынесены в long.

Состав:

- [QA-001 — Вход и первые штрихи](../scenarios/collaboration.md#qa-001)
- [QA-002 — Одновременное рисование](../scenarios/collaboration.md#qa-002)
- [QA-003 — Материалы и перезаход](../scenarios/collaboration.md#qa-003)
- [QA-004 — Слои и локальный активный слой](../scenarios/collaboration.md#qa-004)
- [QA-005 — Конфликт структуры слоёв](../scenarios/collaboration.md#qa-005)
- [QA-006 — Авторские Undo/Redo](../scenarios/collaboration.md#qa-006)
- [QA-007 — Preview фильтра](../scenarios/collaboration.md#qa-007)
- [QA-008 — Отключение и возврат сети](../scenarios/collaboration.md#qa-008)
- [QA-009 — Фигуры и выделение онлайн](../scenarios/collaboration.md#qa-009)
- [QA-010 — Совместная мокрая акварель](../scenarios/collaboration.md#qa-010)
- [QA-012 — Потеря графического контекста](../scenarios/collaboration.md#qa-012)
- [QA-013 — Несколько источников ввода в одном жесте](../scenarios/collaboration.md#qa-013)
- [QA-014 — Одновременная анимация входящих штрихов](../scenarios/collaboration.md#qa-014)
- [QA-015 — Удаление слоя во время настройки фильтра](../scenarios/collaboration.md#qa-015)
- [QA-016 — Запрет редактирования посреди живого жеста](../scenarios/collaboration.md#qa-016)
- [QA-017 — Разные инструменты на одной области](../scenarios/collaboration.md#qa-017)
- [QA-018 — Финальный кадр акварели на уменьшенном холсте](../scenarios/collaboration.md#qa-018)
- [QA-019 — Cache overflow при повторном построении акварели](../scenarios/collaboration.md#qa-019)
- [QA-021 — Локальный zoom при активной совместной комнате](../scenarios/collaboration.md#qa-021)
- [QA-022 — Одинаковый шум акварели и угля на разных GPU](../scenarios/collaboration.md#qa-022)
- [QA-023 — Сохранение всех буферов заливки без CPU-readback](../scenarios/collaboration.md#qa-023)
- [QA-024 — Маркерная лента у границы субпикселя](../scenarios/collaboration.md#qa-024)
- [QA-025 — Живые вода и пигмент до отпускания пера](watercolor.md#qa-025)
- [QA-026 — Чужой пигмент зависит от воды автора](watercolor.md#qa-026)
- [QA-027 — Один жест из нескольких принятых частей](watercolor.md#qa-027)
- [QA-028 — Послойная сушка и переход через её границу](watercolor.md#qa-028)
- [QA-029 — Ластик над сухой подложкой и мокрой акварелью](watercolor.md#qa-029)
- [QA-030 — Несколько мокрых слоёв и выгрузка](watercolor.md#qa-030)
- [QA-031 — Следующее действие не стирается поздней акварелью](watercolor.md#qa-031)
- [QA-032 — Живой обычный мазок во время Undo и snapshot](watercolor.md#qa-032)
- [QA-033 — Отключение после UP при живой соседней вкладке](watercolor.md#qa-033)
- [QA-034 — Позднее подтверждение после ухода с доски](watercolor.md#qa-034)
- [QA-035 — Устаревшее восстановление снимка](watercolor.md#qa-035)
- [QA-036 — Пустой и частичный снимок, холодный хвост, Undo головы](watercolor.md#qa-036)
- [QA-037 — Защищённая вода переживает обратимую границу](watercolor.md#qa-037)
- [QA-038 — Переход естественного времени через 120 секунд](watercolor.md#qa-038)
- [QA-039 — Потеря GPU-контекста с входящими действиями](watercolor.md#qa-039)
- [QA-040 — Заполненная мокрая комната](watercolor.md#qa-040)
- [QA-041 — Видимая стоимость Undo100](watercolor.md#qa-041)
- [QA-042 — Один M70-журнал на разных GPU](watercolor.md#qa-042)
- [QA-043 — Смена доски и проверка своего replay](watercolor.md#qa-043)
- [QA-044 — Подтверждённый checkpoint обгоняет pending мазки](watercolor.md#qa-044)
- [QA-045 — Восстановление отвергнутого рисунка и несколько пачек](watercolor.md#qa-045)
- [QA-046 — Две модели акварели на разных слоях](watercolor.md#qa-046)
- [QA-049 — Размер страницы и границы тайлов M70](watercolor.md#qa-049)
- [QA-050 — Загрузка по готовому review export без replay](watercolor.md#qa-050)
- [QA-051 — Аппаратное перо, ладонь и жесты](watercolor.md#qa-051)
- [QA-101 — Цвет, инструмент и его настройки](interface.md#qa-101)
- [QA-102 — Плавающая панель и пустые слоты](interface.md#qa-102)
- [QA-103 — Фигуры, заливка и цифровая кисть](interface.md#qa-103)
- [QA-104 — Выделение, Cut и clipboard между комнатами](interface.md#qa-104)
- [QA-105 — Импорт и преобразование без шва](interface.md#qa-105)
- [QA-106 — Пипетка, линейка и растушёвка](interface.md#qa-106)
- [QA-107 — Ластик через несколько слоёв](interface.md#qa-107)
- [QA-108 — Структура и локальное Solo](interface.md#qa-108)
- [QA-109 — Доски, камера и бесконечная комната](interface.md#qa-109)
- [QA-110 — Класс, ограничения урока и копия ученика](interface.md#qa-110)
- [QA-111 — Вход, пароль, бумага и снимки доступа](interface.md#qa-111)
- [QA-112 — Проекты, копии и превью](interface.md#qa-112)
- [QA-113 — Аннотация, ссылка и готовый review](interface.md#qa-113)
- [QA-114 — Заголовок, выход, версия и метрики входа](interface.md#qa-114)

## devices

Ресурсы: Samsung, активный iPad/Safari, Surface, ПК с графическим планшетом; учитель+ученик; для одновременного сравнения не больше 3frontend.

Длительность: Не измерена; QA-052 не менее 30 мин на пару устройств плюс подготовка. Отсутствующее устройство BLOCKED, не пропуск.

Состав:

- [QA-001 — Вход и первые штрихи](../scenarios/collaboration.md#qa-001)
- [QA-003 — Материалы и перезаход](../scenarios/collaboration.md#qa-003)
- [QA-012 — Потеря графического контекста](../scenarios/collaboration.md#qa-012)
- [QA-013 — Несколько источников ввода в одном жесте](../scenarios/collaboration.md#qa-013)
- [QA-018 — Финальный кадр акварели на уменьшенном холсте](../scenarios/collaboration.md#qa-018)
- [QA-021 — Локальный zoom при активной совместной комнате](../scenarios/collaboration.md#qa-021)
- [QA-022 — Одинаковый шум акварели и угля на разных GPU](../scenarios/collaboration.md#qa-022)
- [QA-023 — Сохранение всех буферов заливки без CPU-readback](../scenarios/collaboration.md#qa-023)
- [QA-024 — Маркерная лента у границы субпикселя](../scenarios/collaboration.md#qa-024)
- [QA-025 — Живые вода и пигмент до отпускания пера](watercolor.md#qa-025)
- [QA-028 — Послойная сушка и переход через её границу](watercolor.md#qa-028)
- [QA-032 — Живой обычный мазок во время Undo и snapshot](watercolor.md#qa-032)
- [QA-033 — Отключение после UP при живой соседней вкладке](watercolor.md#qa-033)
- [QA-034 — Позднее подтверждение после ухода с доски](watercolor.md#qa-034)
- [QA-038 — Переход естественного времени через 120 секунд](watercolor.md#qa-038)
- [QA-039 — Потеря GPU-контекста с входящими действиями](watercolor.md#qa-039)
- [QA-040 — Заполненная мокрая комната](watercolor.md#qa-040)
- [QA-041 — Видимая стоимость Undo100](watercolor.md#qa-041)
- [QA-042 — Один M70-журнал на разных GPU](watercolor.md#qa-042)
- [QA-043 — Смена доски и проверка своего replay](watercolor.md#qa-043)
- [QA-049 — Размер страницы и границы тайлов M70](watercolor.md#qa-049)
- [QA-050 — Загрузка по готовому review export без replay](watercolor.md#qa-050)
- [QA-051 — Аппаратное перо, ладонь и жесты](watercolor.md#qa-051)
- [QA-052 — Настоящий урок и длительная touch-серия](watercolor.md#qa-052)

## long

Ресурсы: До 20 независимых identities, реальные GPU; QA-047 один Samsung+10Socket identities; QA-048 два браузера; один backend/БД.

Длительность: QA-047/048/052 каждый минимум 30 мин реального времени + setup/oracle/cleanup; QA-011/020 длительность заранее выбрать и записать. Последовательный полный набор >90 мин.

Состав:

- [QA-011 — Рост числа участников](../scenarios/collaboration.md#qa-011)
- [QA-020 — Один шаг фоновой выгрузки не блокирует кадр](../scenarios/collaboration.md#qa-020)
- [QA-047 — Реальный получасовой онлайн soak](watercolor.md#qa-047)
- [QA-048 — Непрерывная мокрая эпоха без Dry](watercolor.md#qa-048)
- [QA-052 — Настоящий урок и длительная touch-серия](watercolor.md#qa-052)
