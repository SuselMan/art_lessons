---
layer: server
summary: точка входа
tags: [fastify, сервер]
---
# server/src — точка входа сервера

Поднятие Fastify и Socket.io: `index.ts` собирает процесс из модулей-подпапок, `instrument.ts`
подключает Sentry до всего остального. Один процесс Node, без Redis — одного процесса пока
хватает. Сервер никогда не рендерит — он пересылает и хранит операции.

## Заметки

- `instrument.ts` лежит здесь, а не в `health/`, потому что его путь (`dist/instrument.js`)
  зашит в `--import` в Dockerfile и в `npm start`: перенос файла сломал бы запуск в проде.
- Подпапки: `rooms` (комнаты и релей по сокету), `roomRoutes` (REST комнат), `auth` (вход и
  личность), `admin`, `health`, `http` (обвязка REST), `db` (клиент Prisma).
