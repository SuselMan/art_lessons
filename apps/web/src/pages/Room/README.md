---
layer: editor
summary: экран комнаты
issues: [646, 493]
tags: [редактор, крупный]
---
# pages/Room — экран комнаты

Редактор целиком: экран комнаты и всё, что его собирает, — канвас и движок, сеть комнаты,
инструменты, жесты, выделение и фигуры, оверлеи, панели, баннеры состояния. Единственное место,
где WebGL-движок встречается с React.

## Заметки

- Папка плоская, а смысловые куски — группы карты (`docs/architecture/map.yaml` → `groupings`):
  room-shell, room-overlays, room-status, room-panels, room-viewport, room-net, room-tools,
  room-gestures, room-editing, room-shapes, room-diagnostics, room-participants. В коде этих
  групп нет; когда папку разложат по подпапкам, описание группы переедет в README новой
  подпапки.
