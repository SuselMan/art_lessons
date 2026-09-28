---
layer: server-infra
summary: клиент Prisma
tags: [prisma, postgres]
---
# server/src/db — клиент Prisma

Единственный экземпляр клиента Prisma, через который сервер ходит в Postgres. Схема и миграции,
по которым он сгенерирован, — `apps/server/prisma`.

## Заметки

- Локально серверу нужен `docker start art_lessons_pg` до `npm run dev`.
