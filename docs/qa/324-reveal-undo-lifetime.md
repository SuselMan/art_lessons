# #324: reveal при undo последнего штриха

Source fix `b37fbb9f`, основание `3326900f`. Review prototype V включён только dev окружением. Production/push не выполнялись.

Причина: синхронный rebuild пустой истории после undo проходит через `_replayInto`, затем `TiledLayerBuffer.clear()`. Clear удаляет canonical tile texture. Незавершённый progressive reveal продолжал хранить этот tile как ключ и target; следующий `_advanceWashReveal` вызывал bindTexture удалённой texture (INVALID_OPERATION 1282). Sliced rebuild уже удаляет reveals при swap, но undo последнего stroke не требует sliced replay.

Исправление: после завершения settle и сброса carried gesture state, перед очисткой live layer, `_replayInto` удаляет его reveals. Проверка идентичности `_layers.get(layerId) === buf` исключает временные export/replay buffers: их пересоздание не должно обрывать live presentation.

Регрессионный unit проверяет активный reveal до undo и ноль reveals непосредственно при вызове `layer.clear`, затем отсутствие reveals после redo. Unit не доказывает визуальный результат GLSL; реальный WebGL проверяется отдельно.

Локально web typecheck PASS; 3 выбранных lifecycle/reveal теста PASS. Изолированный home runtime5315, исходники5297/5313 не менялись. Бумага взята из готового bake5297; первый запуск без bake закончился manifest fallback и не считается рендеринговым тестом.

Vega native pen input, один мокрый пигментный stroke, активный reveal и команда dry, затем undo/redo/rebuild: `glFaults=[]`, все десять фаз GL0, contextLost=false. Однако native PNG не равен redo/rebuild PNG. Это отдельная native parity проблема: другой агент воспроизвёл её и с legacy flags на исходной морф-ветке; данный lifetime fix не заявляет исправление canonical parity.

Артефакты `temp/policy/native-trace.mjs`, `temp/policy/traced-native-1.json` и PNG; собственный Chrome закрывается finally. Vega четыре stroke (влажная краска; чистая вода; краска поверх воды; сухая краска), native undo/redo/full rebuild: `glFaults=[]`, все 13 фаз GL0, lost=false. Native/redo/rebuild PNG по-прежнему различаются: отдельный незакрытый parity scope.

Parent Samsung native один stroke на5315: GL before/undo/redo/final 0, undo/redo успешны, 26 принудительных cold shader links без ошибок, contextLost=false. Redo PNG и последующий full rebuild PNG совпали точно. Native-before PNG не сохранялся, поэтому из этого нельзя заключить native parity. Артефакты parent: `temp/wc-runs/own-water/native-undo-samsung.json` и `.mjs`. Его QA tab закрыт и forward снят.
