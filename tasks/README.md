# Задачи проекта

## Стек

→ [00-stack.md](./00-stack.md) — полное описание стека и архитектуры

**Кратко:** React + TypeScript + Vite / CSS Modules + Radix UI / Fastify + Socket.io / PostgreSQL + Prisma + Redis / Capacitor / VPS + Docker

## Фазы

| Файл | Фаза | Статус | Оценка |
|------|------|--------|--------|
| [00-stack.md](./00-stack.md) | Стек и архитектура | ✅ Решено | — |
| [01-editor-tools.md](./01-editor-tools.md) | Инструменты редактора | 🔄 В работе | 4–5 нед |
| [02-room-creation.md](./02-room-creation.md) | UI создания комнаты | ⬜ Не начато | 1 нед |
| [03-collaboration.md](./03-collaboration.md) | Коллаборация real-time | ⬜ Не начато | 3–4 нед |
| [04-auth-monetization.md](./04-auth-monetization.md) | Аккаунты и монетизация | ⬜ Не начато | 2 нед |
| [05-mobile.md](./05-mobile.md) | iOS / Android | ⬜ Не начато | 2 нед |

**Итого MVP (фазы 1–3):** ~8–10 недель

## Ключевые архитектурные решения

- **Operation Log с первого дня** — каждое действие сериализуется. Без этого коллаборацию не добавить без переписывания.
- **Слои с UUID** — нужны для адресации в сетевых операциях.
- **Рендеринг на клиенте** — сервер только ретранслирует операции, не рендерит ничего.
- **Два layout'а редактора** — DesktopEditor (хоткеи, панели) и TabletEditor (тач-таргеты, жесты).
- **Smudge** — исключение: не сериализуется чисто, отправляется как bitmap diff региона.

## Что уже готово

- ✅ WebGL карандаш (pressure, tilt, paper texture interaction)
- ✅ Три типа бумаги (Rough, Smooth, Bristol) с GPU-генерацией текстуры
- ✅ Catmull-Rom сплайн (плавные кривые при быстром движении)
- ✅ Accumulation buffer + Undo
- ✅ DPR-aware рендеринг
- ✅ Пресеты карандашей H/HB/2B/4B/6B
