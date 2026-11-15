# #348: скрипты web входят в обязательный typecheck

База: `49551dbac11e7a55cb8336aa13367f463f92c256`.

`apps/web` проверял только app и service worker. Корневой
`typecheck:scripts` охватывает корневой `scripts/`, поэтому не компенсировал
пропущенный `apps/web/scripts/`.

К обязательной web-команде добавлен `tsc --noEmit -p tsconfig.node.json`.
Конфиг уже включает vite.config.ts и web/scripts; теперь включён `strict`.
Изменений runtime и разрешений публикации нет.

## Контрфактическая проверка гейта

Временный `apps/web/scripts/__typecheck348Probe.ts` содержал:

```ts
export const typecheck348Probe: number = 'must fail the gate'
export const strict348Probe: number = undefined
```

До изменения web typecheck прошёл с несовместимым string (exit0). После
изменения **корневая `npm run typecheck`** — та же команда, что в CI/Deploy
job test — завершилась exit2, явно указав TS2322 на обеих строках. Проверены
и включение каталога, и strictNullChecks. Файл удалён в finally; намеренная
ошибка не коммитилась и не отправлялась в production.

На остальных настоящих скриптах strict не обнаружил ошибок. Чистые полный typecheck (все workspaces/e2e/scripts), lint:fix, map:check и
map:rules прошли с exit0. Тест precompress: 7/7, 377ms, exit0.
Браузер не запускался: меняются только команды статической проверки.
Компактные логи находятся в игнорируемом `temp/348-script-typecheck/`.

Проверочный source-файл и собственные dependency views/generated shared/dist
удалены. Процессов, браузеров, стендов, контейнеров и disposable-каталогов для этой
задачи не создавалось; временных работающих ресурсов не осталось.
