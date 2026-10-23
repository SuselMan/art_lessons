## Воспроизведение

На поддерживаемой странице M70 выбрать слой и ничего не рисовать. `setActiveLayer` через 50 мс создаёт пустой `prewarm` source. До таймера `_snapshotQuiet(layer)` был true; после становится false и остаётся таким, хотя у source нет ни context, ни tile, ни капли записанной воды.

Исполняемый regression добавлен в `index.puddlePrewarm.test.ts`: реальный engine/controller, ожидаемый true после 51 мс, фактический false. Остальные четыре prewarm tests PASS.

## Причина и влияние

`_snapshotQuiet` и `_takeCheckpoint` считают любое `_puddle.has(target)` мокрым материалом. Пустой GPU prewarm является ресурсом, а не водой, и не должен запрещать публикацию снимка или сухой checkpoint. Это влияет на загрузку комнат: возможность компактного снимка зависит от порядка idle-prewarm и последних действий.

## Исправление

Разделить ownership `has` и наличие реального материала `hasMaterial`. Запрет snapshot/checkpoint снимается только для доказанно пустого prewarm. Настоящий мокрый source, включая parked CPU source, продолжает запрещать снимок. Само высыхание по wall clock этим исправлением не переопределяется.
