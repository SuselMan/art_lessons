---
layer: server
summary: здоровье процесса
tags: [эксплуатация]
---
# server/src/health — здоровье процесса

Всё, чем процесс отчитывается о себе: health-ручки, диск, память, задержка event loop,
отставание снапшотов, описание клиента, настройки Sentry, корректное завершение.

`roomOpenMetrics.ts` сохраняет каждый клиентский замер входа (#686) на 90 дней.
Пара `(userId, attemptId)` делает доставку идемпотентной: `stalled` может стать
`ready`, но поздний сигнал не заменяет итог. `ready` — завершённые входы для
среднего и перцентилей; `stalled` — входы без доставленного итога, а не время
завершения. `wasHidden` отделяет замеры с фоновой вкладкой. UA описывает платформу
приблизительно, `deviceType` сохраняет выбранный пользователем режим устройства.

Общее время — от нажатия «войти» до готовности холста. Входы без итога
нельзя подставлять в среднее как «10 секунд». Пример запроса за неделю:

```sql
SELECT count(*) AS attempts,
       count(*) FILTER (WHERE outcome = 'ready') AS completed,
       avg("totalMs") FILTER (WHERE outcome = 'ready') / 1000 AS mean_seconds,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY "totalMs")
         FILTER (WHERE outcome = 'ready') / 1000 AS median_seconds,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY "totalMs")
         FILTER (WHERE outcome = 'ready') / 1000 AS p95_seconds
FROM "RoomOpenMeasurement"
WHERE "createdAt" >= now() - interval '7 days' AND NOT "wasHidden";
```

Здесь `attempts` — полученные замеры: уход раньше первого сигнала и потеря
всех доставок не записываются. Доставка имеет три повтора, не бесконечную
очередь; при долгом офлайне или принудительном закрытии возможны пропуски.
