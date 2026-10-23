Прогресс исследований 08.10, 11:35 Vilnius (#728 — ночная проверка акварели).

- Surface GL2/MRT/front: весь фиксированный сценарий кистью400 ускорен на7–11.4%, среднее9.2%; ordinary Room вода→пигмент, Dry/Undo/Redo/новый reader прошли exact gate. Это не гарантированный FPS и не закрытая матрица участников/устройств.
- Dead colour snapshot:6 аппаратных arms,26fields/material/export exact. Экономия9MiB storage/18MiB traffic, удалённая копия0.598msGPU. Точные средние OFF2984.0/ON2988.5ms: общего выигрыша нет, кандидат OFF.
- SMT:105 деревьев, исходный max уже оптимален в исследованной грамматике; найденный общий выигрыш0. GL static paper cache отклонён из-за28bytes/max1 canonical diffuse расхождения.
- Native Room a83: INIT PASS, runtime519.8ms, RAM2218→1819MiB. Реальный pen40 FAIL с Room-owned backend has no standalone material fields, GL0/context alive/no memoryAbort. Локализовано в finishTile live composite, ошибочный spread standalone fields. Исправление explicit owner coverage/P/C и регрессионная проверка в работе. Native quality/performance пока не доказаны; прежний Samsung GPU loss не объясняется этим отчётом.
- GPU carry15/16: offline MRT primitive exact с сохранением per-stepQ8, defaults OFF; начинается аппаратное измерение реальной стоимости/потенциала. Проценты до измерения не заявляются.

Все коммиты локальные. Push/main/production deploy сегодня не выполнялись.
