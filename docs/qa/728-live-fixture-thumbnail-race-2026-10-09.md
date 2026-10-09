# Thumbnail403: слишком ранняя navigation тестового creator

Read-only данные обычной Room batch2 ON отделяют этот отказ от рендера. Actor клиента/engine совпал до и после перехода. В DB он одновременно owner и persisted participant; lessonId/boardOwnerId null, block отсутствует. Последующие четыре thumbnail POST этой комнаты получили200.

Первый thumbnail POST пришёл в1791507630167, ответ403 — в1791507630172. Сервер записал `socket created room` для этого же actor/room лишь в1791507630215: отказ на43мс раньше подтверждённого создания. Запись создаёт `createRoom` перед отправкой room_state и create ACK (`apps/server/src/rooms/socketHandlers.ts:354`, `:374`). Client engine/paper для creator и его room config могут существовать до этого ответа (`apps/web/src/pages/Room/net/joinFlow.ts:143`); ожидание только paperLoaded/activeLayer потому недостаточно.

Точный request.userId отклонённого HTTP сервер не логировал; считать cookie attribution окончательно доказанной нельзя. Но chronology исключает утверждение «акварель/history сломались» и делает premature fixture navigation конкретной проверяемой причиной. Никаких изменений endpoint, cookies или whitelist не внесено.

Следующий observer ждёт настоящего отражения room_state: собственный participant присутствует в store, actor соответствует engine, бумага загружена, editor unlocked. Этот список приходит из server room_state (`apps/web/src/pages/Room/net/roomStateHandler.ts:81`); тест показывает, что optimistic engine и пустые/чужие participants не удовлетворяют условию. Это QA guard, не новый production gate. Значение `/api/me` читается по настоящему полю `userId`; прежний observer ошибочно пытался `id`, поэтому записывал null.

DB provenance и HTTP chronology сохранены вне Git рядом с raw `physical-batch-live-corrected-on-surface-20261009`. Пользовательский стенд5376 оставлен неизменным. Повтор аппаратного cohort без отдельного выделения слота не выполнялся.
