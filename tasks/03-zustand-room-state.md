# 03 — Внедрить Zustand для room state

**Цель:** внедрить `zustand` для общего room-состояния, убрать props drilling и подготовиться к сетевой синхронизации.

---

## Почему именно Zustand

- Маленький (~1 KB), без бойлерплейта
- Хорошо работает с React 19
- Позволяет разделить локальный UI state и shared room state
- Проще интегрировать с Socket.io позже, чем прокидывать props

---

## Границы состояния

### В Zustand store (`stores/roomStore.ts`)

- `layerState` — слои, папки, порядок, выделение
- `viewport` — `{ cx, cy, zoom, angle }`
- `tool` — текущий инструмент, пресет кисти, цвет
- `room` — id комнаты, имя, участники, локальный `userId`

### Остаётся в локальном `useState`

- Состояние UI панелей (открыта/закрыта правая панель, активный таб)
- Фокус/hover отдельных контролов
- Временные формы (input при rename и т.п.)

### Остаётся в refs / engine

- WebGL контекст, буферы, текстуры
- Pointer state для рисования
- Operation log (пока внутри движка; позже — bridge в store)

---

## Задачи

- [ ] Установить `zustand` в `apps/web`
- [ ] Создать `apps/web/src/stores/roomStore.ts` с начальной структурой
- [ ] Перенести `layerState` и обработчики из `Room/index.tsx` и `LayerPanel` в store
- [ ] Перенести `viewport` из `useViewport` в store (или оставить хук, но читать/писать в store)
- [ ] Перенести `tool` / `pencil` / `color` состояние в store
- [ ] Обновить `Room/index.tsx`, `LayerPanel`, `CreateRoom` на чтение/запись в store
- [ ] Убедиться, что engine не хранится в store и не вызывает лишних ререндеров
- [ ] `npm run typecheck`
- [ ] `npm run lint`

---

## Не в рамках этой задачи

- Сетевая синхронизация (отдельная задача)
- Undo/redo через store (пока остаётся в engine/operation log)
