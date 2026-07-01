# 02 — Заменить ручные helpers на библиотеки и cleanup зависимостей

**Цель:** убрать ручные хелперы и мёртвые зависимости, не раздувая проект.

---

## Код

- [ ] Установить `clsx` и `nanoid` в `apps/web`
- [ ] Переписать `apps/web/src/lib/cn.ts` как ре-экспорт `clsx`
- [ ] Заменить 7 ручных `className={`...`}` в `Room/index.tsx` и `CreateRoom/index.tsx` на `cn(...)`
- [ ] Заменить `uid()` на `nanoid(8)` (или `nanoid(10)`, если нужен запас по энтропии)
- [ ] Удалить `apps/web/src/lib/uid.ts`
- [ ] Удалить `apps/web/src/lib/math.ts`, заменить `clamp` на `lodash-es/clamp` или ручной `Math.max/min` на местах использования
- [ ] Установить `lodash-es` и использовать `clamp` оттуда

---

## Cleanup зависимостей

- [ ] Удалить из `apps/server`: `@prisma/client`, `prisma`, `ioredis`, `socket.io`
- [ ] Проверить, нужен ли `@types/node` в `apps/web`; убрать если нет
- [ ] Обновить `package-lock.json`

---

## Проверка

- [ ] `npm run typecheck`
- [ ] `npm run lint`
