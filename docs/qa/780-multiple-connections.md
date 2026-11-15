# #780: присутствие до последнего соединения

База: `d7df28c1bfb820a7b73a039080ccf7f807b24a7c`.

Один userId остаётся одним участником урока, пока жив хотя бы один его сокет.
Для каждого участника хранятся его действующие socket→board связи. Последнее
вошедшее/сменившее доску соединение задаёт публичную доску; при его уходе
возвращается последнее оставшееся место с peer_board_changed. Роль, цвет,
заморозка и поднятая рука сохраняются до реального последнего ухода.

Между уроками старый board record сохраняется до leaveRoom, чтобы можно было
найти родительский урок; выход из старого урока не удаляет новый boardOfSocket.
Удаление урока (#419) очищает и новый индекс всех соединений. Незавершённые live
хвосты учитываются отдельно по transport (не более128 ID, длина не более256) и
отменяются только у ушедшего/сменившего доску соединения. Работающий соседний
сокет того же пользователя не получает peer_left и не теряет свой live stream.
Протокол/модель операций и формулы кистей не меняются.

## Свежая проверка

- Старый код: **19FAIL / 194** профильных server tests. После узкого исправления
  **194/194 PASS**; затем добавлена регрессия очистки connection index при DELETE.
- Настоящий Socket.io server/clients: обе очередности disconnect, owner gate в
  frozen room, возврат прежней доски, переходы main/child между уроками, sibling
  старше/новее, kick двух соединений с одним logical peer_left, scoped live tail
  cancellation, ограничение128 и освобождение слота END.
- Независимая модель presence, 4 seeds ×240 переходов: публичные participant,
  role/freeze/board и количество сокетов совпадают; финальный уход освобождает
  доски/уроки. Oracle не читает private registry indexes.
- Browser baseline: **1FAIL +1PASS, 134.3s**. Закрытие latest окна оставляло
  старое без роли: owner stroke не дошёл до наблюдателя в frozen room (0 вместо1).
  Обратная очередность уже работала и сохранена как проверка регрессии.
- После: Chromium/SwiftShader, отдельный Postgres/API/frontend offset780,
  два окна с реальным общим auth cookie и отдельный observer context: **2PASS123.7s**.
  Оставшийся owner рисует; observer получает тот же operation ID и реальные
  пиксели. Role owner остаётся в roster, Unfreeze проходит через UI/сервер.
  Физические устройства и межGPU-рендеринг не проверялись, графика не менялась.
- Стартовый thumbnail403 до вступления и штатный throttle429 аннотируются,
  остальные console/JS errors запрещены.

Полный server rooms+roomRoutes: **574/574, 24 файла, 20.32s**, exit0, включая
новую очистку всех connection indexes при DELETE. Полный typecheck
(workspaces/e2e/scripts), lint:fix, map:check/map:rules: exit0, прежние warnings.

Оба набора собственных browser/context и API/frontend закрыты, оба одноразовых
Postgres-контейнера и anonymous volumes удалены. Disposable trace/video удалены
qa-cleanup finish с marker/nonce/проверкой отсутствия процессов. Dependency views,
собственный generated Prisma/shared/dist и ссылка на paper удалены. Временных
работающих ресурсов не осталось. Worktree и компактные логи сохранены в
игнорируемом temp/780-multiple-connections/.
