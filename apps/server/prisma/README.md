---
layer: server-infra
summary: схема Postgres
tags: [prisma, postgres]
---
# server/prisma — схема Postgres

Схема базы (`schema.prisma`) и миграции Postgres. Клиент Prisma, который по ней генерируется,
подключает `server/src/db/prisma.ts`.

## Заметки

- Меняешь схему — типизация зелёная, а сервер отдаёт 500, пока не выполнен prisma generate; он
  же падает с EPERM, если рядом крутится dev-сервер.
