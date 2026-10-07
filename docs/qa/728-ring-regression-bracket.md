# #728: воспроизводимая регрессия светлой каёмки

На одном неизменном curated42 журнале, A2 landscape3508×2480,
Medium paper, одинаковых baked assets и обычных настройках:

- 0a78ab53: внутренней замкнутой светлой линии нет.
- c1997fee: отчётливая замкнутая светлая линия по исходному пятну есть.

Оба результата — полный пересчёт без snapshot, original ordered Dry,
непустые P/C target61 захвачены до Dry, GL0, собственные engine закрыты.
Root просмотрел atlas: temp/regression/slot2-first-two-atlas.png в
worktree728-ring-expanded-gates. Диапазон установлен; первый плохой
коммит и причинный diff пока не найдены. Экспериментальные REVIEW flags
не необходимы для появления кольца. Третий REVIEW arm ещё выполняется.

Архивные JPEG служили только подсказкой: разные прежние flags не
использованы как доказательство commit-regression. Следующий midpoint
11ee5ab6 проверяется тем же полным журналом и бумажной текстурой.
Raw HOME:680-water-wet-tone-qa/temp/ring-regression-cea/temp/
static-material-retry1/report.json. Первые RAM abort и неверный capture
после Dry сохранены отдельно и не считаются физическими failures.
