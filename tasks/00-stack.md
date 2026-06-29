# 00 — Стек и архитектурные решения

## Frontend

| Что | Решение | Почему |
|-----|---------|--------|
| Фреймворк | React + TypeScript | Опыт, экосистема |
| Сборка | Vite | Быстрый HMR, нативные ESM |
| Стили | CSS Modules + CSS Variables | Нет лишних зависимостей, легко переделать, изоляция из коробки |
| UI примитивы | Radix UI (headless) | Только поведение и доступность, никакого CSS — стилизуем сами |
| Рисование | WebGL (текущий движок) | Уже написан, работает |
| Мобильные | Capacitor | 95% кода общий с вебом |

### CSS-подход

```css
/* src/styles/tokens.css — единое место всех токенов */
:root {
  /* Цвета */
  --color-bg:        #1a1a1e;
  --color-surface:   #111113;
  --color-surface-2: #222228;
  --color-border:    #2a2a30;
  --color-accent:    #5555aa;
  --color-text:      #cccccc;
  --color-text-dim:  #666666;

  /* Touch */
  --touch-target: 48px;   /* минимальный tap target на планшете */
  --touch-target-sm: 40px;

  /* Скругления */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;

  /* Анимации */
  --duration-fast: 100ms;
  --duration-normal: 200ms;
}
```

```css
/* Пример: Toolbar.module.css */
.toolbar {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  height: var(--touch-target);
}
```

### Два layout'а редактора

Определяется один раз при старте, не переключается в рантайме:

```ts
// src/hooks/useEditorLayout.ts
const isTablet = navigator.maxTouchPoints > 0
              && window.matchMedia('(pointer: coarse)').matches

// DesktopEditor  — панели слева/справа, хоткеи, тултипы, правый клик
// TabletEditor   — крупные тач-таргеты, нет hover, всё без клавиатуры
```

---

## Backend

| Что | Решение | Почему |
|-----|---------|--------|
| Runtime | Node.js + TypeScript | Единый язык с фронтом |
| HTTP фреймворк | Fastify | Быстрее Express, хорошая TS-поддержка |
| Real-time | Socket.io | Проверен, автоматический fallback |
| ORM | Prisma | Автогенерация типов, простые миграции, PostgreSQL новичку понятен |
| БД | PostgreSQL | Надёжный, реляционный, для пользователей/комнат/истории |
| Cache / rooms | Redis | Активные комнаты и WebSocket-состояние в памяти |
| Деплой | VPS + Docker Compose | Полный контроль, дёшево |

---

## Структура репозитория (монорепо)

```
art_lessons/
├── apps/
│   ├── web/          # React приложение
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── CreateRoom/
│   │   │   │   ├── Room/        # редактор
│   │   │   │   └── Dashboard/
│   │   │   ├── components/
│   │   │   │   ├── editor/
│   │   │   │   │   ├── DesktopEditor/
│   │   │   │   │   └── TabletEditor/
│   │   │   │   └── ui/          # кнопки, слайдеры, модалки
│   │   │   ├── styles/
│   │   │   │   └── tokens.css
│   │   │   └── engine/          # текущий pencil-engine (портируем)
│   │   └── vite.config.ts
│   │
│   └── server/       # Node.js бэкенд
│       ├── src/
│       │   ├── routes/
│       │   ├── socket/
│       │   ├── services/
│       │   └── prisma/
│       └── prisma/
│           └── schema.prisma
│
├── packages/
│   └── shared/       # общие типы (Operation, Room, User и т.п.)
│       └── src/
│           └── types.ts
│
├── tasks/            # документация задач
├── docker-compose.yml
└── package.json      # workspaces
```

Монорепо через **npm workspaces** (без lerna/turborepo — лишнее для старта).

---

## База данных — схема (Prisma)

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  role      UserRole @default(FREE_TEACHER)
  rooms     Room[]
  createdAt DateTime @default(now())
}

model Room {
  id           String   @id @default(uuid())
  name         String
  paper        String   // 'rough' | 'smooth' | 'bristol'
  canvasWidth  Int
  canvasHeight Int
  passwordHash String?
  ownerId      String
  owner        User     @relation(fields: [ownerId], references: [id])
  operations   Operation[]
  createdAt    DateTime @default(now())
}

model Operation {
  id        String   @id @default(uuid())
  roomId    String
  room      Room     @relation(fields: [roomId], references: [id])
  userId    String
  layerId   String
  tool      String
  data      Json     // дэбы и параметры
  createdAt DateTime @default(now())
}

enum UserRole {
  FREE_TEACHER
  PRO_TEACHER
  ADMIN
}
```

---

## Хоткеи (Desktop)

Хранятся в user settings, настраиваемые.

```ts
// packages/shared/src/hotkeys.ts
export const DEFAULT_HOTKEYS = {
  brush:          'b',
  eraser:         'e',
  smudge:         'r',
  undo:           'ctrl+z',
  redo:           'ctrl+shift+z',
  zoomIn:         '=',
  zoomOut:        '-',
  resetView:      '0',
  layerNext:      ']',
  layerPrev:      '[',
  sizeIncrease:   'shift+]',
  sizeDecrease:   'shift+[',
  hardnessUp:     'shift+.',
  hardnessDown:   'shift+,',
}
```

---

## Docker Compose (VPS)

```yaml
services:
  web:
    build: ./apps/web
    ports: ["3000:3000"]

  server:
    build: ./apps/server
    ports: ["4000:4000"]
    environment:
      DATABASE_URL: postgres://...
      REDIS_URL: redis://redis:6379
    depends_on: [postgres, redis]

  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine

volumes:
  pgdata:
```

Nginx как reverse proxy перед ними (SSL termination, роутинг).
