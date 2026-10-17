# Последние известные результаты и пробелы

На ветке 793 продуктовые сценарии **не запускались**. Для текущего выбранного кандидата
все 66 кейсов первоначально NOT RUN; результаты нельзя переносить с runtime ночного отчёта
на origin/main или другой SHA. Проверка каталога/Playwright --list — проверка инструкции,
не PASS продукта.

Проверка общего каталога: [второй проход793](../runs/793-project-library-2026-10-17.md).

Первый проход библиотеки: [run793](../runs/793-catalog-2026-10-17.md).

## Как читать последнее прохождение

Ключ lane: case + вариант/модель/размер + frontend/backend SHA + устройство/ОС/browser/GPU +
режим (native/SwiftShader/MockGL, hardware pen/synthetic) + flags. Последний run выбирается
по дате в **этой** lane, а последний PASS хранится отдельно: новый FAIL не стирается ссылкой
на прежний PASS. Для нового SHA результат NOT RUN до повторения.
Ниже только надёжно атрибутируемые избранные исторические lanes. Остальные остаются
неиндексированными: детали в источниках, вывод о новом кандидате делать нельзя.

| Case / дата | Версия, окружение и участники | Статус / фактический результат | Доказательство и последнее известное прохождение |
|---|---|---|---|
| QA-038 /17.10 | frontend82313a4c, Samsung Adreno650,512²/300MiB, cache/hidden OFF; trusted pen, один renderer | PASS: DOWN643 мс до expiry, UP2248 мс после; crossing/новый мазок/Undo/Redo/rejoin exact0; новая hold-семантика не проверялась | [clock postfix](../sources/night-2026-10-17/runs/753-samsung-clock-postfix-2026-10-17/summary.md); это последний индексированный PASS этой lane |
| QA-039 /17.10 | frontend e5d08c61, Samsung Adreno650/DPR2.125,512²/300MiB OFF; один native renderer, два Socket автора,3 слоя | PASS:5ACK-операций при context lost;6 стадий×3 слоя exact0/GL0; новый trusted жест, Undo/Redo/rejoin | [context loss](../sources/night-2026-10-17/runs/745-samsung-contextlost-ops-2026-10-17/summary.md); последний индексированный PASS этой lane |
| QA-040 correctness /17.10 | frontend6cd49722; Samsung,10Socket авторов, один native renderer;100/300/1000, normal/review | PASS только 6 перечисленных загрузок; exact0, полного cross-device/performance PASS нет | [вторая волна](../sources/night-2026-10-17/745-night-second-wave-2026-10-17.md); исходный `docs/qa/runs/745-samsung-longwet-2026-10-17/summary.md` доступен через NIGHT |
| QA-040 performance /17.10 | профиль d32f8e66/frontend6cd; Samsung Adreno,1000, normal, shared QA | INCONCLUSIVE для приёмочного бюджета (не задан);11.974 с RoomOpen ready,11.277 с replay; отдельные 1000 normal/review≈13.6 с, не смешивать trials | [профиль](../sources/night-2026-10-17/runs/787-samsung-profile-2026-10-17/summary.md); performance PASS нет,787 открыт |
| QA-041 /17.10 | Surface/Intel, исходный 100-stroke сценарий, флаги OFF; runtime у конкретных trials в NIGHT | INCONCLUSIVE для численного SLA (не задан); видимый Undo≈1.3–2 с, ускорение CPU не доказывает ускорения экрана | [технический итог 744](../sources/night-2026-10-17/745-night-second-wave-2026-10-17.md); подтверждённого общего performance PASS нет |
| QA-042 /17.10 | один 5-op вход, native Vega↔Adreno; source capture каждого в NIGHT, без snapshot | FAIL:7993 канала/3949 пикселей/max16, wet и recordedDry. Own replay exact не закрывает crossGPU | [shared Samsung](../sources/night-2026-10-17/runs/748-samsung-shared-2026-10-17/summary.md), [сводка 748](../sources/night-2026-10-17/745-night-second-wave-2026-10-17.md); crossGPU PASS нет |
| QA-046 CPU /17.10 | frontend43f87295, настоящий controller с MockGL/NativeTarget guard, не GPU | PASS только unit-регрессии mixed-history; hardware NOT RUN; историческое all-M70 исключение не закрыто | [итог 785](../sources/night-2026-10-17/745-night-second-wave-2026-10-17.md); hardware PASS нет |
| QA-047 /17.10 | frontend43f87295/backendac892525, native Samsung Adreno650/DPR2.125/300MiB OFF;10Socket identities,1renderer | PASS:1808497 мс wallclock,540 штрихов/548ops, midpoint/final/cold exact0/GL0. Dry на 15 мин; не QA-048, не latency benchmark | [soak](../sources/night-2026-10-17/runs/745-samsung-wallclock-soak-2026-10-17/findings.md), [принятый вход gzip](../sources/night-2026-10-17/runs/745-samsung-wallclock-soak-2026-10-17/accepted-input.json.gz); последний индексированный PASS этой lane |
| QA-033 full-background /17.10 | backendac892525, native Samsung;2socket одной identity,1 наблюдатель | INCONCLUSIVE exact UI background: цветная плёнка 1444→0, canonical exact, но 3285 серых каналов бумаги различны. Узкие live-retirement gates PASS | [итог 792](../sources/night-2026-10-17/745-night-second-wave-2026-10-17.md); не overall pixel PASS |
| QA-034 hardware ACK race /17.10 | AMD/Intel аппаратный gate не попал в нужный ACK момент | INCONCLUSIVE; server/CPU подтверждение не заменяет hardware | [сводка 783](../sources/night-2026-10-17/745-night-second-wave-2026-10-17.md); аппаратного PASS этой гонки нет |
| QA-043 /17.10 | same-GPU после board turn,3-op input, runtime в NIGHT | INCONCLUSIVE:956 отличающихся каналов, исходный actual не сохранён до assert; повтор не воспроизвёл причину | [наблюдение 791](../sources/night-2026-10-17/745-night-second-wave-2026-10-17.md); закрывающего PASS нет |
| QA-045 /17.10 | Room suite f6a27f98, CPU/network recovery | FAIL:4expected FAIL по 777/778; прототипы не включены и не закрывают этот gate | [итог](../sources/night-2026-10-17/745-night-second-wave-2026-10-17.md); полного recovery PASS нет |
| QA-049 A4/infinite /17.10 | M70-кандидат, multi-tile1240×1754/infinite | BLOCKED реализацией 747; страницы до 1024 по каждой стороне не доказывают A4 | [границы](../sources/night-2026-10-17/745-watercolor-night-readable-2026-10-17.md); PASS нет |
| QA-048 /17.10 | непрерывная 30 мин мокрая эпоха без Dry | NOT RUN; soak с Dry не эквивалентен | [ограничения](../sources/night-2026-10-17/745-watercolor-night-readable-2026-10-17.md); PASS нет |
| QA-050 /17.10 | export-only вход | BLOCKED: у проверенных комнат не было нужного сохранённого экспорта | [ограничения](../sources/night-2026-10-17/745-watercolor-night-readable-2026-10-17.md); PASS нет |
| QA-052 Surface /17.10 | native Surface, touch endurance22/24; runtime в NIGHT | INCONCLUSIVE: Windows update прервал до итоговой сверки; не установлен GPU crash | [ограничения](../sources/night-2026-10-17/745-watercolor-night-readable-2026-10-17.md); полного PASS нет |

В тех строках, где runtime точного trial не нормализован, не присваивать сводный final SHA.
Указание «runtime в NIGHT» означает пробел индексирования, а не достаточный паспорт нового run.
Backend версии старых hardware trials не везде записан отдельно; это также ограничение истории.

## Дополнительный исторический результат вне ночной кампании

- QA-557 (компилятор Adreno): источник [issue685](https://github.com/SuselMan/art_lessons/issues/685)
  сообщает проверку и production version `2026.10.01-057f434` / commit `057f434b8f781a5912dd799901995dbf2b481963`:
  3351unit,10browser e2e,84A/B pixel случая наAMD и 3 холодные компиляции наSM-T970/Adreno650.
  Это историческое свидетельство с указанной версией, а не новая проверка этого кандидата.
  Source-only/MockGL результаты остальных контрактов не перенесены в аппаратный PASS.

## Матрица устройств

| Device lane | Последний индексированный PASS | Известный FAIL/пробел | Новая версия |
|---|---|---|---|
| Samsung Adreno | QA-038/039/047 и correctness040 на указанных выше SHA | QA-042FAIL,033background INCONCLUSIVE,040performance не принят | NOT RUN |
| Surface Intel | В источниках есть отдельные post-fix PASS; полной нормализованной lane пока нет | Undo100 медленный, crossGPU FAIL, touch22/24 INCONCLUSIVE | NOT RUN |
| Vega AMD | В источниках есть отдельные post-fix PASS; полной нормализованной lane пока нет | crossGPU FAIL, sameGPU791 INCONCLUSIVE | NOT RUN |
| iPad Apple/Safari M70 | Нет ночных аппаратных PASS | BLOCKED: активная Safari была недоступна | NOT RUN/BLOCKED до доступа |
| ПК + физический графический планшет | Нет нормализованного hardware-pen результата QA-051 | CDP/bridge не эквивалентны физическому перу | NOT RUN |
| Старые AMD/Intel/Apple legacy fixtures | [02.10](../runs/2026-10-02.md), включая продолжение в историческом отчёте | Не относятся к M70 byte-exact gate | NOT RUN на новом SHA |

Для каждого из остальных 66ID без строки выше: последний **индексированный** PASS отсутствует;
необходимое историческое свидетельство искать в [исходном collaboration](../sources/collaboration-before-793.md)
и [ночных источниках](sources.md). Это видимый долг нормализации, а не утверждение,
что проверки никогда не выполнялись. Новые результаты добавлять отдельными run-файлами.
