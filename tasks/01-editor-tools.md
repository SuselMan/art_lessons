# 01 — Инструменты редактора

Полноценный арт-инструмент до добавления коллаборации.
Всё строится поверх operation log — каждое действие логируется с первого дня.

---

## 1.0 Рефакторинг / качество кода

Обнаруженные проблемы, которые стоит починить до наращивания фич.

**Engine:**
- [x] Убрать `// @ts-nocheck` из всех файлов `engine/` — добавить типы к классам и функциям
- [x] Экспортировать интерфейс `PencilEngineAPI` из `engine/index.ts`

**Room:**
- [x] Убрать все `(engineRef.current as any)?.` — использовать типизированный интерфейс движка
- [x] Вынести viewport/gesture логику в хук `useViewport` (wheel, pinch, middle-click pan, fitCanvas)

**Мелочи:**
- [x] Удалить дубль `Icon` в `Room/index.tsx` — импортировать из `LayerRow.tsx`
- [x] Перенести `computeCompositeOrder` из `LayerPanel/utils.ts` — реэкспорт через UI-компонент неправильный слой
- [x] Дедублицировать `handleMergeSelected` и `handleMergeDown` в `LayerPanel.tsx` — общий хелпер `execMerge`

---

## 1.1 Operation Log (основа для коллаборации)

Каждое действие = сериализуемый объект. Делается до любых инструментов.

```js
{
  id: 'uuid',
  userId: 'local',
  layerId: 'uuid',
  tool: 'pencil' | 'eraser' | 'smudge',
  preset: 'HB',
  dabs: [{ x, y, pressure, tiltX, tiltY, size, angle }, ...]
}
```

**Задачи:**
- [ ] Класс `OperationLog` — append, replay, undo/redo по операциям
- [ ] Метод `PencilEngine.applyOperation(op)` — рендерит чужую операцию (пока не используется, но нужен для сети)
- [ ] Каждый завершённый штрих (`pointerup`) пишется в лог
- [ ] Undo/redo работает через лог (сейчас через readPixels — оставить как fallback)

---

## 1.2 Слои

### Модель данных

Плоский Map + отдельный массив порядка (проще для DnD и сетевых патчей, чем вложенное дерево).

```ts
// packages/shared/src/types.ts
interface RasterLayer {
  kind: 'layer'
  id: string; name: string; opacity: number; visible: boolean
}
interface LayerFolder {
  kind: 'folder'
  id: string; name: string; opacity: number; visible: boolean
  collapsed: boolean
  children: string[]  // ordered ids of child layers
}
type LayerItem = RasterLayer | LayerFolder

interface LayerState {
  items: Record<string, LayerItem>
  rootOrder: string[]    // top→bottom; index 0 = topmost
  activeId: string
  selectedIds: string[]  // multi-select
}
```

Правила:
- `background` — зарезервированный id, `kind: 'layer'`, нельзя удалить, всегда снизу
- Папки содержат только `kind: 'layer'` (одно гнездование, не вложенные папки)
- При создании комнаты: `background` + один пустой `Layer 1` над ним

### Engine — многослойная архитектура

- `Map<layerId, AccumulationBuffer>` вместо одного буфера
- Новый API: `setLayers(state)`, `setActiveLayer(id)`, `mergeLayers(ids[]) → id`
- **Display pass:**
  1. Очистить `_compositeFBO` (RGBA текстура, размер холста)
  2. Для каждого видимого слоя снизу→вверх (папка умножает свою opacity на дочерние):
     — рендерить слой на `_compositeFBO` через compositor shader
     — blend: `ONE, ONE_MINUS_SRC_ALPHA` (тот же что у dab)
     — compositor shader: `gl_FragColor = vec4(0,0,0, texture.a * u_opacity)`
  3. `_compositeFBO.texture` передаётся в display shader как `u_accumulation` (shader не меняется)

### Undo

Каждая запись в стек хранит только **изменённый слой** (не все):
```ts
interface UndoEntry {
  kind: 'stroke'
  layerId: string
  snapshot: WebGLTexture   // копия буфера ДО штриха
  layerState: LayerState   // структура слоёв (для проверки при undo)
}
// | { kind: 'structural', before: LayerState, after: LayerState, snapshots?: Map<id, tex> }
```
Структурные операции (add/delete/merge/move) сохраняют `layerState` до и после + снапшоты затронутых буферов.

### Merge

- **Merge down** (из контекстного меню слоя): сливает слой с ближайшим ниже. Недоступно если слой = `background`.
- **Merge selected**: все выделенные `kind: 'layer'` → один новый слой на позиции самого верхнего. Имя: "Merged". Если в выделении есть папка — кнопка недоступна.
- Merge = одна undo-операция.

### UI — правая панель

Коллапсируемая панель ~240px. Таб-бар из иконок вверху (сейчас только Layers, структура под будущие табы: настройки инструментов, настройки холста). Кнопка скрыть/показать на левом краю (`chevron_right`).

Каждая строка слоя:
```
[⠿] [👁] 🎨 Layer name        70%  [⋯]
     [👁] 📁 Folder name  ▾  100%  [⋯]
         [⠿] [👁] 🎨 Child     50%  [⋯]
```
- **⠿** grip — ручка DnD (скрыт у `background`)
- **👁** — toggle видимости, скрытый слой затемняется
- **название** — двойной клик / long-tap → inline rename
- **%** — клик открывает попап со слайдером opacity
- **⋯** — контекстное меню: Rename / Merge down / Delete

Активный слой: акцентная левая полоска.
Выбранные (multi-select): светлее фон + чекбокс.

При выборе 2+: над списком появляются **Merge selected** и **Delete selected**.

### Multi-select

| Устройство | Действие | Результат |
|---|---|---|
| Mouse/Pen | Click | выбрать один |
| Mouse/Pen | Shift+Click | диапазон |
| Mouse/Pen | Ctrl+Click | toggle |
| Touch | Tap | выбрать один |
| Touch | Long-tap ~500ms | toggle, вход в режим multi-select |

### Drag & Drop

Библиотека: `@dnd-kit/core` + `@dnd-kit/sortable` (pointer-based, работает на touch).

Зоны дропа:
1. Между root-элементами → reorder в `rootOrder`
2. Между дочерними внутри папки → reorder в `folder.children`
3. **На саму папку** → переместить слой в папку (без авто-открытия папки при ховере — интерфейс прыгает)
4. Из папки в root-зону → вытащить из папки

При drag нескольких выделенных слоёв — все перемещаются вместе.

### Задачи

**Engine:**
- [ ] `Map<layerId, AccumulationBuffer>` + `setLayers()`, `setActiveLayer()`
- [ ] `_compositeFBO` + compositor shader + обновлённый display pass
- [ ] `mergeLayers(ids[])` — новый AccumulationBuffer из нескольких
- [ ] Рефакторинг undo: per-layer snapshot

**Types:**
- [ ] `packages/shared/src/types.ts` — `LayerState`, `RasterLayer`, `LayerFolder`, `UndoEntry`

**UI:**
- [ ] Правая панель: shell + коллапс + таб-бар
- [ ] `LayerList`: рендер, visibility toggle, opacity попап, inline rename
- [ ] `@dnd-kit` reorder + drop-into-folder
- [ ] Multi-select (Shift/Ctrl/long-tap) + кнопки Merge/Delete selected
- [ ] Контекстное меню ⋯ (Rename / Merge down / Delete)

---

## 1.3 Ластик

Тот же dab-pipeline, но вычитает из буфера вместо добавления.

**Задачи:**
- [ ] Режим `eraser` в `PencilEngine` — blend mode `gl.DST_ALPHA` или рисуем прозрачностью
- [ ] Настройки: размер, мягкость края
- [ ] В Operation Log: `tool: 'eraser'`
- [ ] UI: кнопка/горячая клавиша переключения

---

## 1.4 Пан / Зум / Поворот холста (жесты)

Разделение стилуса и пальцев.

**Логика:**
- `pointerType === 'pen'` или `'mouse'` → рисование (текущее поведение)
- `pointerType === 'touch'`, 1 палец → пан холста
- `pointerType === 'touch'`, 2 пальца → pinch-zoom + поворот

**Задачи:**
- [ ] `GestureHandler` — отслеживает touch-поинтеры отдельно от pen
- [ ] Пан: CSS `transform: translate()` на обёртке холста
- [ ] Pinch: расстояние между 2 точками → scale
- [ ] Поворот: угол между 2 точками → rotate
- [ ] **Обратная трансформация координат**: при рисовании стилусом применять инверсию текущей матрицы трансформации к координатам (иначе рисование съезжает при повёрнутом холсте)
- [ ] Кнопка "сбросить вид" (Ctrl+0 / двойной тап двумя пальцами)

---

## 1.5 Растушёвка (Smudge)

Сложнейший инструмент — читает пиксели из текущего буфера и размазывает.

**Техническая проблема:** нельзя читать и писать в одну WebGL текстуру одновременно.
**Решение:** ping-pong буферы — два FBO, читаем из A, пишем в B, меняем местами.

**Задачи:**
- [ ] Ping-pong буферы в `AccumulationBuffer`
- [ ] Smudge shader — sample соседних пикселей + weighted blend по направлению
- [ ] В коллаборации smudge = сложно сериализовать. Вариант: отправлять регион пикселей (bitmap diff). Решать отдельно.
- [ ] Настройки: сила растушёвки, размер

---

## 1.6 Экспорт

- [ ] Экспорт PNG (merge всех слоёв через compositor, `canvas.toBlob`)
- [ ] Экспорт с прозрачным фоном (без бумаги)
- [ ] Сохранение сессии локально (JSON с operation log → воспроизвести при открытии)
