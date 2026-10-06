# Водяной тон: узкий кандидат и аппаратная проверка

Основа main f5397918, ветка agents/680-water-wet-tone, код b40614a5. Production KJc0OoVo выгружена read-only: 47 операций. Исходные операции сохранены в `temp/wet-tone/KJc0OoVo-ops.json`; пользовательскую комнату не меняли.

PAPER_COMPOSE_FRAG затемнял влажную бумагу последовательными damp/fresh/pool коэффициентами; поверх пигмента дополнительно повышал степень цвета. Кандидат вводит WC_WET_PAPER_TONE_SHARE=0.35 и WC_WET_PAINT_TONE_SHARE=0.12. Их смешивает существующая маска onPaint. Изменены только презентационные тоновые члены, P/C/V, solver, мокрая геометрия, бумажный микроконтраст и gloss сохранены.

Аппаратный тест на домашней Vega: ANGLE AMD Radeon Graphics, WebGL1, GL0, context lost=false. Отдельная копия `680-water-wet-tone-qa`, порт 5316. Один настоящий native рисунок: сухой пигмент, вода на бумаге и поверх пигмента. После settle заморожены фактическая wet texture/peak; три программы PAPER_COMPOSE сменяются над одними P/C/V. Это причинный тест отображения, без изменения модели или случайных strokeId между вариантами. Baseline — полный исходный shader f5397918; mild=0.5/0.2; candidate=0.35/0.12. Wet peak 0.9139.

Средние RGB в фиксированных участках:

| Вариант | Вода на бумаге | Вода поверх пигмента |
|---|---|---|
| Baseline | 227.43 / 227.43 / 227.43 | 170.12 / 156.33 / 199.37 |
| Mild | 236.81 / 236.81 / 236.81 | 184.02 / 169.60 / 211.73 |
| Candidate | 239.65 / 239.65 / 239.65 | 186.46 / 172.02 / 213.94 |

Все три canonical export PNG совпадают точно: 0 изменённых пикселей. Candidate после Dry совпадает с полным rebuild точно: 0 пикселей. Exporter отключает wetRect, поэтому тоновые параметры не участвуют в сухом результате. Визуально вода остаётся различимой, но серое затемнение значительно слабее; насыщенность сухой краски сохранена.

Undo/Redo выполнены, однако redo PNG против pre-undo rebuild отличается на 28 пикселей: raw максимум 255, alpha и premultiplied максимум 4, bbox x440..540/y156..198. Это отдельный незавершённый критерий parity, не скрытый допуск и не заявленный PASS. Причина пока не доказана; смена wet-tone программы не меняет canonical export уже существующего слоя. Samsung/cold Adreno compile этим прогоном не проверены.

Артефакты на HOME и копия в этой рабочей ветке: `temp/wet-tone/hardware/report.json`, PNG всех вариантов, `compare.jpg`. Controller `temp/wet-tone/hardware-ab.mjs`, HTML `temp/wet-tone/review.html`. CPU JS скомпилирован, diff-check чистый. Собственный Chrome закрыт finally; пользовательские вкладки и frozen5314 сохранены. Push/deploy не выполнялись.

## Объединённый релиз с локальным цветом тонкого края

Ветка agents/680-wet-tone-release объединяет этот тон с 0c49d9ab: thin-color prior читается из локального depth, а не из цвета последней кисти. Материальный оператор не менялся. Галерейный d5e27bc1 добавляет доску сухих образцов листа 12 и её комнату; файл комментариев не изменён.

Combined Vega и Samsung используют один настоящий native рисунок и смену только PAPER_COMPOSE над фиксированными P/C/V/wet texture. На обеих GPU baseline/candidate canonical PNG совпадают точно; Dry и полный rebuild совпадают точно. Actual Vega ANGLE Radeon, Samsung ANGLE Adreno650. Samsung: 31 salted cold program links, 0 failures, GL0/lostfalse; собственная вкладка закрыта finally.

Классификация остаточного native/history расхождения: первый Undo/Redo относительно native/Dry/full-rebuild capture отличается на 26 пикселей в combined обоих GPU (Vega alpha/premult максимум4, Samsung5; raw RGB максимум255 в почти прозрачных пикселях). Повторный полный rebuild→Undo/Redo совпадает точно. Исходный PAPER_COMPOSE baseline и candidate дают одинаковые history endpoints: baselineRedo==candidateRedo, 0 пикселей. До local-color правки отдельный b406 прогон уже давал 28 пикселей/premult4. Поэтому это остаточная разница первого native/history прохода, не водяного tone shader; полная native parity не заявляется. Причина материальной разницы остаётся отдельной задачей, допуск в тесты не внесён.

Raw HOME `680-water-wet-tone-qa/temp/wet-tone/combined` и `temp/wet-tone/samsung`; VPS копия `680-device-qa-guards/temp/device-runs/combined` и `samsung-wet-release.json`/PNG. Проверки релиза: actual web typecheck и lint, 106 relevant watercolor/shader tests, map-check и map-rules (0 ошибок/4 существующих предупреждения), production build. Samsung первая попытка при Dozing не открыла QA URL; после штатного wake повтор успешен, без перезапуска Chrome/смены сопряжения.
