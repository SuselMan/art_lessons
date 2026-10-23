# UI-полировка Grafetto, 07.10.2026

Задачи #729–#736, релиз-трек #314 §5/§13. Все изменения в agents/ui-polish-integration от origin/main 8aa7e9f0.

Проверки:
- typecheck: exit 0.
- lint:fix: exit 0, семь существующих предупреждений.
- map:check: exit 0, бюджет Room 1817 строк сохранён.
- map:rules: exit 0, существующие предупреждения.
- Vitest: 102 теста в toolSchemas, joinFlow, forkRoutes, maxWorkers=2, exit 0.
- Общий Playwright: 12 сценариев прошли; после исправления reconnect актуальный прогон: 9 сценариев, exit 0 (2.8m). Итого 13 уникальных браузерных сценариев с desktop-аннотациями.
- Chromium с мобильным touch viewport 390×844, сетка дополнительно 320px; SwiftShader на headless VPS. Физические устройства не проверялись.
- Удаление: сообщение только в модалке, Cancel получает фокус, Escape отменяет без DELETE; подтверждение удаляет карточку.
- Копирование: задержанный запрос показывает disabled карточку, scroll, spinner/Preparing room; результат заменяет карточку; ошибка убирает её и разрешает повтор; поиск и список проверены.
- Copy and open: непрерывный loader, настоящий POST fork комнаты со штрихом, autojoin и восстановление stroke; ошибка fork закрывает loader; при отсутствии socket соединения показывается offline, восстановление входит автоматически.
- Аннотации: compact и preview начинают с Hand; выбранные Note/Pen сохраняются при обновлении toolset; у текста нет слайдера Size, у пера есть.
- Minimal UI: default true, сохранённый false переживает reload.

Логи и скриншоты рядом в qa/ и qa-ui-annotations/.

Merge/push: main, 0ed9cf2178d5c6f858c158e9a0c30f801dfdf7ef. Deploy run: https://github.com/SuselMan/art_lessons/actions/runs/37536802373.

Deploy success. Production version: 2026.10.06-0ed9cf2. Health endpoint HTTP 200. Production browser smoke: 390px grid / plus / copy-and-open menu / delete modal, JS page errors=0, API mocked, no writes to production projects.
