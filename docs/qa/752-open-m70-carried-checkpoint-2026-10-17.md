# #752: M70 CP8 попадает в legacy replay cache

Изолированная базаe8e1f005, Infinity GPU budget как у desktopVega/Surface8GB.
Native prefix trace: A50/B50, authorA ordinaryCP8 безcanonicalValid,
best.start8, source epoch92; Bbestnull/sourceepoch100. ActualA!=fullAPIreplay
5233channels/max30; coverage/pending/jobs/queues/unsettled пусты,100opsdone.
Это конкретная CP8-гипотеза, не закрытие редкой #752 closed-Dry parity проблемы.

## Доказанный CPU baseline

Настоящий engine/scratch/material cache (native fluid shader заменён unit stub):
8 local M70 strokes → ninthDOWN → _washBoundaries.size1 вместо0. FAIL.
При Infinity legacy путь разрешает carried wash начиная с8ops; общий washId
`m70:L` и настоящий _wash.scratch попадают в legacy carried state.
Отдельный store baseline: уже созданный carried M70 CP8 выбирается best.start8
и startOf8, хотя должен быть отклонён; FAIL. Даже CP ровно на конце мокрого
prefix нельзя превращать в сухую RGB-подложку: следующему мазку нужна вода.

M70 replay не восстанавливает source из legacy _replayRibbonChunks. Он создаёт
новый controller source поверх RGB8 и повторяет только92оставшихся wet ops.
Вдобавок legacy _seedWashes оставляет старый scratch под `m70:L`; тот может стать
owner drawing continuation _paintOpOverFrames, не совпадая с M70controller source.
Это source-level кандидат для #785 ownership collision, но creator native trace
ещё не пойман: #785 не объявляется исправленным причинно.

## Узкая правка

- _checkpointBeforeWash отказывается переносить open M70 wash через legacy CP;
  _carryWashes содержит дополнительную защиту от M70 snapshot.
- CheckpointStore.best/startOf отвергают unsupported ordinary carried wash,
  если washId соответствует M70 stroke в текущих operations (по model tag,
  а не строковому префиксу имени washId).
- Валидные closed-M70 checkpoints с canonical proof не несут open washIds.
  Они, legacy carry и network snapshot floor остаются допустимыми.
- Обычная pencil prefix checkpoint перед первой M70 водой остаётся допустимой.
- Нет shared/protocol/physics изменения, snapshot floor не удаляется.

Targeted5files30PASS: новая creation-проверка, pencil control, existing unsafe
carry rejection, legacy/proved-closed/network controls, старые checkpointStore,
closedEpochCheckpoint и closedWatercolorCheckpoint. Scoped oxlint exit0;
10 существующих index.ts warnings находятся вне изменённых строк.
Полный typecheck и native B1/B8/full100 проверяются после интеграционного review.
Никаких native parity/ускорение/final #752 closure утверждений по CPU нет.

GPU/browser/services не запускались. Targeted CPU processes завершены.
Рабочая копия и dependency links/generated shared оставлены для review/проверок;
новых полных dependency копий не создавалось.
