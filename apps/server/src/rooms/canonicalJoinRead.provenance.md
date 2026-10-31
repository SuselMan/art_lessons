# Авторизованное чтение перед посадкой сокета

`prepareAuthorizedJoin` выполняет существующий `checkJoinAccess`, затем выдаёт
одноразовое замыкание на тот же room/lesson, private password/access policy и
текущего владельца socket seat. До `commit` не меняет seat/boardOfSocket и не
пишет успешный RoomParticipant. Существующие побочные эффекты очереди допуска
остаются внутри прежнего checkJoinAccess.

Приватный Symbol содержит validator, который принимает только исходный frozen
объект по identity. Spread/Object.assign с сохранёнными Symbols, изменённые
room/user и вызов методов с чужим receiver не создают полномочий.

`CanonicalRoomTransport.prepareJoinReadDelivery` использует это точное разрешение
для чтения до членства; ordinary reader продолжает проходить mayReadBoardContent.
Оба пути используют один prepareReadContext, текущую board epoch и успешные
существующие durable receipts. Чтение не выдаёт append grant.

В join_room все await (load, access, replay, canonical read preparation) идут до
seat/channel mutation. Перед commit синхронно готовится snapshot tail и его
capability attachment. После commit channel join и room_state emit не разделены
await (#36). Per-socket scalar generation запрещает старому запросу A завершить
посадку после нового B, включая одинаковую цель. Create/disconnect инвалидируют
pending generation; внешняя evacuation/kick меняет захваченную socket.data scope.
Компенсационного leaveRoom нет. Legacy payload не получает новых полей;
straight room получает authoritative read scope даже для пустого tail.

Проверки: реальные Socket.IO same-target A/B, snapshot-read failure без успешного
membership/room_state, прежние board/channel regressions; pure authorization tests
проверяют отсутствие ранних writes, private-policy/visibility/replaced-record
изменения и неподделываемость ticket. Persisted-prefix fixture содержит фактические
индексные поля, требуемые существующим verified-row loader.

Production straight-room admission и client engine guards остаются закрыты.
create_room/global evacuation, cold historical receipts и HTTP history payload
не объявляются завершённой canonical editor delivery.
