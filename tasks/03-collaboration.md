# 03 — Коллаборация в реальном времени

Ключевая фича. Архитектурно готовится с фазы 01 (Operation Log).

---

## Архитектура синхронизации

Сервер — тупой ретранслятор. Вся логика рендеринга на клиенте.

```
Client A                    Server                    Client B
   │                           │                           │
   │──stroke_op(dabs)─────────>│──stroke_op(dabs)─────────>│
   │                           │                           │ applyOperation()
   │<─────────stroke_op(dabs)──│<──────────stroke_op(dabs)─│
applyOperation()               │                           │
```

Операции маленькие (~1–5 KB на штрих), WebSocket справляется легко.

---

## Серверная часть

**Стек:** Node.js + Socket.io (или ws напрямую) + Redis для хранения активных комнат.

### API комнат
```
POST /api/rooms          — создать комнату
GET  /api/rooms/:id      — получить состояние комнаты
POST /api/rooms/:id/join — присоединиться (с паролем если нужно)
```

### Socket события
```
// Клиент → Сервер
'stroke_start'  { roomId, op }
'stroke_dabs'   { roomId, opId, dabs }   ← стримим по мере рисования
'stroke_end'    { roomId, opId }
'layer_op'      { roomId, op }           ← добавить/удалить/переупорядочить слой

// Сервер → Клиент
'peer_stroke_start'  { userId, op }
'peer_stroke_dabs'   { userId, opId, dabs }
'peer_stroke_end'    { userId, opId }
'peer_layer_op'      { userId, op }
'room_state'         { operations[], layers[] }  ← при подключении нового участника
'peer_cursor'        { userId, x, y }
```

---

## Состояние комнаты на сервере

При подключении нового участника — отдаём полный лог операций.
Клиент воспроизводит их через `applyOperation()` и получает текущее состояние холста.

```js
// Redis (или in-memory для начала)
room = {
  id, name, paper, canvasWidth, canvasHeight,
  operations: [...],   // полный лог
  participants: [{ userId, role }]
}
```

**Лимит лога:** при большом количестве операций — периодически делать snapshot (readPixels → сохранить PNG в S3/локально), обрезать лог до точки snapshot.

---

## Роли

- **Teacher** — может рисовать всегда, видит курсор ученика
- **Student** — рисует по умолчанию, учитель может "заморозить" его холст
- Первый вошедший = Teacher, остальные = Student

---

## Курсоры

- Позиция курсора каждого участника транслируется по WebSocket (throttle 30fps)
- На холсте показываем метку с именем пользователя
- Цвет метки уникален для каждого участника

---

## Технические задачи

- [ ] Node.js сервер с Socket.io
- [ ] Хранилище комнат (in-memory для MVP, Redis позже)
- [ ] События stroke_start/dabs/end на клиенте и сервере
- [ ] `applyOperation()` на клиенте — рендерит входящие операции от других
- [ ] Room state snapshot при подключении нового участника
- [ ] Курсоры других участников на холсте
- [ ] Индикатор "кто сейчас рисует" в тулбаре
- [ ] Система ролей Teacher/Student
- [ ] Страница ожидания ("Ждём учителя...")
