---
layer: editor
summary: вьюпорт
adr: [007-desktop-controls]
tags: [камера, локальное]
---
# pages/Room/viewport — вьюпорт

Локальная камера пользователя `{cx, cy, zoom, angle}`: математика камеры, пинч, перевод
координат указателя в холст. У каждого участника своя — по сети не ездит. Позиция плавающей
панели — в `components/FloatingToolPanel/panelPosition.ts` (#650).
