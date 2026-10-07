# #728: не декодировать отброшенные источники воды

База800fdf6c. Принцип cross-device-determinism: канонический журнал и порядок
физических команд сохраняются; устраняется только CPU создание данных, которые
прежний collector позже целиком отбрасывал. Не вводятся cache/clock/flags/GPU passes.

Раньше foreignSources последовательно декодировал каждую подходящую операцию,
создавал footprint/chunk, а при done paper_dry или clear своего слоя очищал массив.
foreignWaterSourceStart находит последний такой reset ДО первого chunk текущего
жеста. Прежний collector продолжает с этого индекса, с теми же фильтрами,
арифметикой, grouping/order и исходными dabs. Undone/gone reset не используется,
другой слой не очищается; first current chunk остаётся барьером даже если undone.
Никакой истории не удаляется, вызовы переоценивают актуальные states послеUndoRedo.

Проверки:8 helper/stencil tests, включая6561 комбинацию состояний×9 gesture/layer
вариантов. Финальный набор93 tests/3 files PASS, EXIT0. Новый actualEngine
_ribbonDabsWork source test отдельно подтверждает0 обращений к discarded dabs,
одно чтение codec (два getter reads) retained dabs и точные returned footprints.
MockGL не подтверждает физические пиксели; GPU не использовался.

Retained исходный47 journal: после обязательного recorded wetPeak>016 source
histories. Real packed decoder117→85 вызовов,19147→13486 decoded dabs. Returned
chunks (id/preset/color/wet/dabs/seed), footprint doubles и порядок exact. Для
сохранённых normal presets sizeMultiplier1 соответствует WATERCOLOR_PRESET.
Раньше сообщённое67/227 было потенциальным count без current wet gate, не actual.

CPU collector oracle с чередованием12порядков arms: median12.82→9.48ms за все16
histories наVPS. Это небольшой~3ms allocation/CPU выигрыш; не причина52s загрузки,
не nativeFPS/GPU shader performance claim. Достоверный главный load выигрыш остаётся
обычным bitmap bootstrap (ordinary c092 snapshotless52.315s→stored5.017s).

Wholeweb TypeScript PASS; map1000files PASS; rules0errors/5existingwarnings;
oxlint0errors/9existingwarnings. В предыдущем fixture целый набор reporter93PASS
закончился EXIT143; после явного окончания тестового native gesture финальный
процесс EXIT0. Ошибочный getter observer до OperationLog copy исправлен; все
предыдущие logs сохранены. Это тестовый cleanup, не изменение production lifecycle.

Приватные raw/oracle/scripts вtemp/foreign-prefix иtemp/qa. В production ничего
не публиковалось, пользовательские стенды не изменялись.
