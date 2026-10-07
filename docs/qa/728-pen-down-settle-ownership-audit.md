# #728: как убрать ожидание старого settle на DOWN

CPU source audit root8c852af4; устройства/source/runtime не менялись. Operation
Log остаётся каноническим, физические P/C/V и временный presentation различены.

## Почему DOWN сейчас ждёт

`_onStart`5879 проверяет paper/repair/layer, затем5914 берёт oldJob и immutable
`_wcJoinedTouchInputs`. При отказе admission5935 вызывает `_completeSettle` →
Queue.complete синхронно выполняет оставшиеся operators. До `_dabs.startStroke`
и `_display` новый пигмент ещё не отправлен. Второй guard6013 повторно сохраняет
это требование перед сменой wash/scratch. Причина физическая: старый solver
читает один shared `_diffuseField`, а finish copy-back пишет target и scratch;
новые P/C поверх него можно потерять или взять из другого временного состояния.
Это не намеренное ожидание rAF и не доказанное время конкретного shader.

Независимо от DOWN, `_finishRibbonStroke`8592, `_diffuseFieldFor`8073 и Queue.start
снова сериализуют создание следующего solver. Простое удаление DOWN complete
переносит ожидание в UP или разрешает позднюю запись поверх нового материала.
Уже submitted GPU commands также остаются впереди нового draw: короткий handler
не доказывает мгновенный первый физический пиксель.

## Существующий узкий безопасный шов

Joined admission5920–5934: один live oldJob/openWash scratch, та же layer, wet
или recent, WASH_JOIN_MS, sourceFilmRebaseON, async/material/splitOFF, leaseNULL,
immutable old metadata gesture matches. Exact preset/RGB по умолчанию. Новый
DOWN пишет настоящий фильм в тот же scratch, сохраняя старый immutable solver
capture. Старый finish с runningFilm выбирает новый entry.inkLoad/inkColor;
sourceFilmRebase и runningSourceCommands восстанавливают накопление из settled
base + новый фильм. Это реальный материал, не синтетическая картинка.

`_wcJoinedFinishDeferred`8475 удерживает один новый immutable finish, когда
старый lease/job ещё жив. `_resumeJoinedDeferred`7850 запускает его после старого
job, с epoch/target/scratch/layer checks. Это не arbitrary FIFO: третий admission
при lease или ещё pending finish должен оставаться barrier. Cancel/loss/repair
не могут опубликовать промежуточный snapshot/export. Morph/reveal сохраняется.

## Следующий ОДИН эксперимент

От уже проверенного narrow joined+deferred baseline переключить только existing
`_wcJoinedTouchMixed` до первого stroke/job, оставив остальные flags одинаковыми.
Этот branch5926 требует immutable predecessor finish/gesture; позволяет другой
preset/RGB в той же физической wet wash. Wash signature фактически всегда`wc`
(presets1662), так что это не новый произвольный wash. Например water100:0 →
pigment100:100 на том же слое/лужe. Pure physics formulas/operators не менять.
Идентичные source seeds и packed material inputs важнее сравнения adaptive FPS.

CPU proposals: actual old finish RGB/preset/paints/gesture неизменны после UI
mutation; old ops continue only with old captured inputs; full lifecycle cancel,
loss, natural finish, Dry cutoff, second/third admission, repaired/removed layer,
unknown snapshot, peer same scratch, new wash/different layer/expiry отказ.
Hardware proposals после отдельного grant: actual same fixed tape old/new color
+water profile, meaningful P/C/V/cov/whole dry exact0; emitted wet/dabs/preset/RGB
identity; admission lease===oldJob и no DOWN complete, deferred finish once.
First pigment5×5 AFTER DOWN без синхронного baseline read прямо перед DOWN;
старую reference взять в idle раньше. Настоящий pigment/solvent в кадре до solver
completion, непрерывные motion/morph без финального replacement. UIDry UndoRedo
Fresh с ACK и persisted room-specific IDs обязательны, не dry export alone.

Ограничение: отказ narrow predicates всё ещё drains; third touch/backlog и GPU
already-submitted queue не устранены. Mixed source tests уже существуют в
index.joinedTouch.test.ts157+, но не заменяют hardware/full material oracle.

## Два более широких пути, пока НЕ кандидат

1. Новый WC stroke на ДРУГОМ layer: live deposition можно теоретически выполнить
в независимый scratch/target, удерживая old scratch до solver completion. Новое
UP solver отложить. Нужны отдельный held finish owner, per-layer paperWet/foreign
source proof и отсутствие sample/merge/eraser/cross-layer dependencies. Нынешний
`_retireAsyncScratch` уничтожает неheld старый scratch; пропустить guard без
owner нельзя. Это новый lifecycle-шов, не просто ослабление joined predicate.

2. Новая wash на том же layer, даже визуально в другом месте: одной дистанции
или исходного stroke bbox недостаточно. Нужны непересекающиеся actual old write
compositeDomain + new read/sample/reach domains на всём движении, включая halo,
coverage, imported solvent, snapshots и copy-back. Tile-local fields могут иметь
более широкий physical domain. На первом пересечении потребуется безопасный
barrier; иначе dry replay расходится. Пока conservatively не разрешать.

Полный async FIFO текущего кода7293 действительно убирает input-stack wait,
но deferMaterial отправляет реальную deposition в очередь, `_showAsyncPresentation`
рисует отдельный временный слой. Прежние80s canonical lag и final swap показывают,
что input responsiveness не делает этот вариант качественным live watercolor.
Без incremental real physical material visibility и строгого ownership он не
является рекомендованным обходом ожидания. Широкой миграции/новых flags нет.
