---
layer: server-infra
summary: клиент Prisma
tags: [prisma, postgres]
---
# server/src/db — клиент Prisma

Основной экземпляр Prisma обслуживает операции, права и обычные запросы.
`canonicalIndexedReader.ts` лениво создаёт отдельный клиент с одним соединением
только для ограниченной indexed-history validation: свежая проверка прав и запись
не ждут удерживаемую read-транзакцию основного пула. При выключенном режиме
клиент не создаётся; shutdown ожидает освобождение обоих клиентов. Схема и миграции,
по которым он сгенерирован, — `apps/server/prisma`.

## Заметки

- Локально серверу нужен `docker start art_lessons_pg` до `npm run dev`.
