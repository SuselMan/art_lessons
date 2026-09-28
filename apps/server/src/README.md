---
layer: server
summary: Fastify и Socket.io
issues: [649]
tags: [сервер]
---
# server/src — Fastify и Socket.io

Весь сервер: точка входа, комнаты в памяти и релей операций по сокету, REST-ручки комнат,
аккаунты и доступ, админка, здоровье процесса. Один процесс Node, без Redis. Сервер никогда не
рендерит — он пересылает и хранит операции.

## Заметки

- Смысловые куски этой папки — группы карты (`docs/architecture/map.yaml` → `groupings`):
  server-rooms, server-rooms-http, server-auth, server-admin, server-health, server-entry. В
  коде этих групп нет; когда папку разложат по подпапкам, описание группы переедет в README
  новой подпапки.
