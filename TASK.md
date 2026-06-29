# Pencil Engine — Техническое задание

## Контекст

Проект для совместных занятий академическим рисунком онлайн (учитель + ученик).
Перед полной реализацией нужно проверить гипотезу: **можно ли сделать карандаш в браузере
достаточно хорошего качества**, сравнимого с Clip Studio Paint.

Этот модуль — отдельный `PencilEngine`, который потом переиспользуется в основном проекте.

---

## Гипотеза

Реалистичный карандаш в браузере возможен через WebGL шейдеры с симуляцией:
- взаимодействия карандаша с рельефом бумаги
- накопления графита
- влияния наклона и давления пера

---

## Что делает карандаш реалистичным

| Параметр | Описание | Источник в браузере |
|---|---|---|
| Давление | Ширина и насыщенность штриха | `PointerEvent.pressure` (0–1) |
| Наклон пера | Форма мазка, какая сторона бумаги задействована | `PointerEvent.tiltX/tiltY` |
| Скорость | Быстрый штрих светлее, медленный плотнее | Дельта между pointermove событиями |
| Текстура бумаги | Карандаш цепляется за выступы рельефа | Height map PNG + шейдер |
| Накопление графита | Повторные штрихи темнеют, есть предел | Accumulation buffer |
| Тип карандаша | HB, 2B, 4B — твёрдость и зернистость | Параметр PencilEngine |

---

## Архитектура

### Два рендер-буфера

```
accumulationBuffer  — накопленный графит (постоянный, только добавляется)
displayBuffer       — финальный рендер: графит × paper texture + цвет бумаги
```

### Система мазков (Dab System)

Штрих = серия мазков (dab) вдоль пути курсора. Каждый dab — WebGL quad с fragment shader.

Расстояние между mab'ами зависит от размера кисти (обычно 20–30% диаметра),
чтобы штрих выглядел непрерывным.

### Fragment Shader — ключевая логика

```glsl
// paper_height_map — grayscale PNG рельефа бумаги
float paperHeight = texture2D(paperHeightMap, uv).r;

// Нормаль бумаги из height map (через конечные разности)
vec2 paperNormal = vec2(
  texture2D(paperHeightMap, uv + vec2(dx, 0.0)).r - paperHeight,
  texture2D(paperHeightMap, uv + vec2(0.0, dy)).r - paperHeight
);

// Наклон пера определяет с какой стороны карандаш бьёт о рельеф
float tiltHit = dot(normalize(vec2(tiltX, tiltY)), normalize(paperNormal));

// Графит оседает на выступах, которые "смотрят" в сторону наклона
// + базовое покрытие даже при вертикальном пере
float graphiteDeposit = pressure * (0.3 + 0.7 * max(0.0, tiltHit) * paperHeight);

// Мазок карандаша — мягкое пятно с Gaussian falloff
float dabShape = exp(-dot(localUV, localUV) * sharpness);

float alpha = graphiteDeposit * dabShape;
```

### Параметры накопления графита

Accumulation buffer хранит значение 0–1 для каждого пикселя.
Новый мазок добавляет графит, но с убывающей отдачей (чем темнее — тем меньше добавляется):

```js
newValue = current + deposit * (1.0 - current) * saturationFactor
```

`saturationFactor` зависит от типа карандаша: мягкий 2B насыщается быстро и темнее,
твёрдый H — медленнее и остаётся светлым.

---

## Структура модуля

```
pencil-engine/
  index.js                  — PencilEngine(canvas, options) — публичный API
  src/
    PointerInput.js         — обработка pressure, tilt, скорости
    DabSystem.js            — разбивка пути на мазки
    AccumulationBuffer.js   — WebGL framebuffer накопления
    PaperTexture.js         — загрузка и привязка height map
  shaders/
    dab.vert.glsl           — vertex shader (позиция quad'а)
    dab.frag.glsl           — fragment shader (вся физика)
  textures/
    paper-rough.png         — грубая бумага (акварельная)
    paper-smooth.png        — гладкая бумага (офсетная)
    paper-bristol.png       — бристоль (для академического рисунка)
```

### Публичный API

```js
const engine = new PencilEngine(canvasElement, {
  paper: 'rough',           // 'rough' | 'smooth' | 'bristol'
  pencilType: 'HB',         // 'H' | 'HB' | '2B' | '4B' | '6B'
  color: '#1a1a2e',         // цвет графита
})

engine.on('strokeStart', handler)
engine.on('strokeEnd', handler)

engine.clear()
engine.undo()              // убрать последний штрих
engine.exportPNG()         // → Promise<Blob>
engine.destroy()
```

---

## Стек

- **Vanilla JS + raw WebGL** — никаких зависимостей, модуль переиспользуем
- **Pointer Events API** — pressure, tiltX, tiltY, width, height контакта
- Работает в Chrome/Edge/Firefox с графическим планшетом (Wacom, XP-Pen и др.)
- Мышь поддерживается с фиксированным pressure = 0.5 (без наклона)

---

## Критерий успеха гипотезы

Нарисованный штрих карандашом на планшете должен:
1. Показывать зернистость бумаги сквозь графит
2. Реагировать на давление — заметное различие между лёгким и сильным нажатием
3. Реагировать на наклон — широкий мазок боковой поверхностью карандаша
4. При повторном штрихе поверх — заметное потемнение с насыщением

---

## Следующие шаги после гипотезы

Если карандаш работает хорошо — добавить в основной проект:
- Инструмент стёрки (eraser) — аналогично, но вычитает из accumulation buffer
- Слои с параметрами (opacity, blending mode, offset)
- Совместное рисование через WebSocket (CRDT или operational transform для мазков)
- Интерфейс выбора бумаги и типа карандаша
