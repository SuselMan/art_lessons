# Новая модель исходного мазка, ribbon-v1

Эксперимент в едином Mini. Production и комнатный движок не изменены. Выбор «Модель мазка → Новая · направленная щетина»; прежняя модель сохранена. Смена модели очищает локальный лист и выключает растекание/морфинг для сравнения исходного следа. Эти два эффекта можно включить отдельно.

## Что реализовано

- Непрерывная лента от существующих отпечатков, `nibGeometry`, `nibSupport` и эллиптических контуров. У ленты общие поперечные координаты, закругления только на концах; сетки промежуточных цветных отпечатков нет.
- На жест выбирается детерминированный поперечный профиль щетины. Seed выводится из ID жеста. Профиль нормирован по средней отдаче и следует пути с небольшим изменением по длине. Крупная мировая пятнистость старого материала не используется. Фактура бумаги остаётся экранным эффектом.
- Одна каноническая карта воды на GPU, без `PaperWetness`-ячеек, чтения максимума под кистью и впитывания. Совместимые методы CPU-поля возвращают пустые ответы; `anyWet*` лишь сохраняют общий открытый источник слоя. Добавление воды — MAX: мокрота повышается до уровня кисти, повторное перекрытие не накачивает её без конца. Переноса воды кистью нет.
- Логический уровень воды 0–1 хранится в совместимой с прежним решателем кодировке V/4. Дополнительные снимки воды внутри расчёта — входы задачи, не второй учёт её физического состояния.
- Сохранён существующий `prepareDelivery`: расход пигмента по длине, влияние воды самой кисти, начальное касание, задержка, замедление, резкие повороты. Бумага для этих правил всегда считается сухой (`wet=0`): её влажность больше не изменяет отдачу. Вода самой кисти поддерживается, policy=bottomless.
- Пигмент хранится как оптические характеристики RGB + масса в одном RGBA-фильме жеста. MAX внутри жеста предотвращает лишнее нанесение на стыках; между жестами складывается вклад с исходной картой цвета. Совместимая P-карта выводится из массы и единой карты воды.
- Один набор вершин используется для воды, покрытия и цвета. Затем два прохода обновляют P/C. Простой композит показывает цвет без прежних процедур облачности и зернистости исходного следа. Картинка растекания по-прежнему считается старым выбранным решателем.

## Проверки и границы

Модульные проверки: повторяемость seed, нормировка профиля, конечная геометрия точек/изменения размера/разворотов, вода при нулевом пигменте. Браузер VPS с программным WebGL: основной поток и Worker, чистая вода, сухой пигмент по воде (вода не уменьшилась), два цвета, точка, предыдущий решатель; UI 390px без overflow; живой A2 3508×2480 и readback карт, GL0 и CPU wet cells=0.

**Это не аппаратный замер Samsung.** Его чехол закрыт (`mIsCoverClosed=true`, `Dozing`), пробуждение не помогло; контрольная попытка не получила ни одного принятого мазка и отклонена. Запрошено открыть чехол. Ускорение на реальном GPU пока не заявляется.

Первая попытка геометрии с телом в каждом отпечатке давала пересекающиеся полосы; заменена непрерывной лентой. Найдена и исправлена зависимость воды от нулевой дозы пигмента. A2-проверка сначала упиралась в старый запрет QA-команд большого листа; отдельная команда проверки новой кисти разрешена, старый запрет для Mini1024-оракулов сохранён.

Ограничения: при каждом входном пакете геометрия текущего жеста пересобирается, цветной фильм перерисовывается в его области. Рост очень длинного жеста ещё надо измерить. Полноразмерные рабочие карты A2 не заменены физическими страницами памяти. Равенство между GPU, Undo/Redo и совместное рисование этой новой модели не проверены и не интегрированы в продуктовый operation protocol. Параметр `brush=ribbon-v1` существует в QA, старые сохранённые операции не менялись. Художественное качество требует оценки Ильи.

Компактные доказательства и замороженная сборка: `~/.local/share/project-services/gl1-review/ribbon-v1-805-20261019`. Новых сервисов нет; используется существующий статический Mini. Общие старые JS-ассеты старше текущего и предыдущего manifest удаляются при публикации. Исходники, worktrees и документы сохранены.

## Fixed nib revision, 23.10

The first dab fixes the nib angle for the entire gesture. Path support normals
still determine the swept silhouette, but no longer rotate the actual nib or its
transverse profile. Moving strokes have an entry and a release instead of round
endpoint stamps; isolated taps retain their footprint. The release varies by
bristle bundle. Pigment delivery is multiplied by1.65 and hair contrast narrowed.
Within one gesture the later footprint replaces the older hair pattern instead
of taking its maximum. This is repainting, not physical pigment advection, and
previous gestures still contribute through the existing color base.

Water and coverage are rebuilt from immutable pre-gesture GPU snapshots in the
changed rectangle. This removes the initial tap ghost when the brush starts
moving. There remains one canonical live water field; snapshots use existing
pool-owned solventBase/coverageFilm leases. Added copies need fresh device
measurements; the old Vega timing is not a measurement of this revision.

## Soft entry / pen-up-only lift, 23.10 follow-up

Supersedes the moving-tip tooth mask in v2. While pointer is down, tip contact
is solid. `_onEnd` enables the old brush's release-pressure thresholds for the
existing appendWatercolorLift dabs; size is clamped to at least82% of the last
live width. The one-dimensional seeded hair field replaces the old expensive
noise lookup, so this is the same release principle rather than pixel identity.
The entry is a sampled ellipse-like width ramp from zero to full contact, not
a flat cross-section or a full-sized round stamp. Body hair contrast is0.45
instead of0.22, with the same average optical dose. verify-turns captures a held
stroke and asserts release state is false before pen-up and true afterward.
