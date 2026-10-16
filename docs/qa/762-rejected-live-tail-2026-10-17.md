# #762: окончательный отказ и живой хвост

Настоящие два Socket.io клиента воспроизвели: student live → teacher freeze →
student operation rejected(room_frozen), но peer_stroke_live_end не приходил.
Без durable operation наблюдателю нечем убрать transient film; обычный UP
может прийти раньше отказа и по контракту не удаляет ещё не записанный хвост.

В ветке окончательного permission/target отказа сервер теперь рассылает
`peer_stroke_live_end {userId, strokeId, cancelled:true}`. Identity берётся
из сокета, канал — текущая доска. Уже принятые chunks не удаляются из журнала.
Успешная дедупликация и transient server_error/not_joined проходят прежними
ветками и отмену не получают. Протокол уже поддерживал cancellation, новых
shared полей и типов не понадобилось.

Проверка: исходный socket test падает из-за отсутствия события; после правки
9 тестов socketHandlers проходят, включая обычный UP, true/false/malformed
cancellation marker и принятый chunk без ложной отмены. Server typecheck/lint.
Аппаратный сценарий freeze-mid-gesture дополнительно проверяется после
рестарта общего QA backend. Production не менялся.
