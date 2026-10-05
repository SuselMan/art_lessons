# Эксперимент питания внутренней области спирали

05.10.2026, #680. Отдельная рабочая копия `680-spiral-spread`.

**Не рекомендован для интеграции.** Оператор открывает перенос внутри большого
нулевого cost-пятна и сохраняет кляксу, но видимое растекание спирали улучшает
слишком мало. Это причинная абляция, а не законченный фикс.

## Оператор

Отправная точка — подтверждённые 59,5% source texels спирали, не имеющие
outward-соседа по существующему carry расписанию. Переделка viscosity
P.a→P.b из предыдущей пробы исключена; её изменение отдельно отменено
коммитом `cc 9ef 85b`. Этот эксперимент использует прежний density gate.

Между крупными outward carry шагами выполняются дополнительные симметричные
face exchanges нового mobile carrier:

- оба конца и три промежуточных положения должны иметь cost=0;
- хотя бы один конец должен принадлежать blocked interior: его четыре
  соседа на максимальной carry stride также имеют cost=0;
- поток идёт из большей концентрации в меньшую; передавается вся vec 4
  в пропорциях донора, pigment и absorption используют одну pre-step density;
- q округляется симметрично до целого RGBA 8 carrier code;
- чистая вода исключается по pigmentStrength и P.b;
- внешний carry, его capacity, fade и travelling share не меняются.

Проверка промежуточных положений — ограниченная абляция, а не доказательство
непрерывной мокрой связности: узкая сухая щель между пробами может быть пропущена.
Глобального free diffusion или размытия итоговой картинки нет.

Слабый вариант: три pulses, strides 16/32/64, rate 0.08.
Усиленный вариант, сохранённый в коде: шесть pulses, прямые и обратные
strides 16/32/64, rate 0.16. Для всех 256 encoded carrier levels проверены
positivity и отсутствие переполнения alpha при четырёх соседях.

## Причинный GPU A/B

Vega, реальные вода seq 18 и спираль seq 19 из комнаты l 0alezIj, только перенос
координат. Контроль — та же вода и компактная клякса тем же радиусом.
Исходные mobile alpha и cost спирали побайтно одинаковы во всех вариантах.

| Вариант | Carrier за исходным footprint после carry | После крупных diffusion steps |
| --- | ---: | ---: |
| Baseline | 7.92% | 14.09% |
| Три слабых pulses | 8.08% | 14.27% |
| Шесть сильных pulses | 8.36% | 14.61% |

Доли посчитаны относительно новой исходной mobile carrier дозы. После remob
вторая колонка включает carrier предварительной воды; это не измерение доли
нового пигмента. Суммарная доза кляксы и спирали в GPU контроле разная.

У кляксы blocked mask пустая, дополнительные passes не меняют её:
итоговый PNG побайтно совпадает с baseline в обоих вариантах. Пальцы сохранены.

Все три слабых pulses сохранили carrier сумму строго до последнего code.
У усиленного варианта в pulses потерялись 206 из 16,858,511 codes — 0.00122%.
Симметричная формула сама консервативна, однако общая vec 4 capacity fitting
и запись RGBA 8 не гарантируют строгую сохранность всех каналов. Общая потеря
carrier за carry расписание 0.05884% против 0.05502% baseline.

Внешний travelling/balance остаётся ограничением: открытие interior paths
само по себе не заставляет крупное заполненное пятно заметно растекаться.
Дальнейшее усиление внутренних exchanges рискует лишь сгладить тело.

## Проверки

- Vega GL 0, context loss отсутствует во всех пробах.
- Усиленный вариант: load/rebuild спирали и кляксы побайтно совпадают.
- Typecheck, lint,19 unit tests, map:check и map:rules прошли с прежними
  предупреждениями. Новый MockGL тест защищает coupling/aliasing records,
  но не растеризует GLSL.
- Samsung, multi-pigment pixels и live presentation не проверены.
- Perf преимущество не измерено; добавлены до шести passes и shader branch.
  Перед любым использованием нужен salted compile на Adreno.

Артефакты в `temp/spiral/`: `interior-compare.jpg`, `interior-supply/`,
`interior-strong/`, `interior-rebuild/`, `interior_oracle.py`,
`interior-oracle.json`. GPU захват — `render.mjs`, load/rebuild — `rebuild.mjs`.
Собственный Vite 5292 оставлен; Chrome закрыт, GPU свободен. Samsung/5290,
production и remote git не изменялись.

## Следующая абляция: направленный повторный проход

На снятом GPU поле `wcCapillary` восстанавливается точно: `WC_CARRY_RIDGE=1`,
поэтому бумажная высота не меняет ёмкость. Остаётся
`cap=1-0.85*smoothstep(0,band,cost)`. Множитель travelling одинаково умножает
концентрации обеих сторон: он меняет скорость шага, но не знак градиента и не
равновесие. После supply на stride64 ещё существует разрешённый наружный
градиент; следовательно, полное равновесие не объясняет остановку.

CPU oracle actual fields (`temp/spiral/balance_oracle.py`) показал после supply:
8.7% допустимых stride64-рёбер спирали имеют неположительный градиент, против
16.2% до supply. Последние supply на32/16 не получают следующего крупного
наружного прохода в исходном расписании.

Абляция добавила только outward64→32→16 после всего расписания. Shader,
travelling, capacity и taper не менялись. Vega GL0/context intact:

| Показатель | Supply-only | Directed resweep |
|---|---:|---:|
| Spiral outside carrier после carry |8.36%|9.53%|
| Spiral после coarse diffusion |14.61%|15.65%|
| Blob outside после carry |34.56%|41.39%|
| Blob после coarse diffusion / новая исходная доза |276.49%|282.50%|
| Spiral потеря carrier alpha в carry |0.0588%|0.0783%|

Значения blob больше100% после diffusion включают remobilized carrier из
предварительной воды; это не масса нового пигмента. Начальная alpha спирали
между старым и новым run отличается на0.0108%, поэтому сравнение к старому
артефакту не является побайтным контролем. Blob input alpha совпадает точно.

Спираль всё ещё читается плотным диском. Blob сохраняет пальцы, но меняется,
светлая обводка заметна. Общий resweep отклонён; source и runtime возвращены
к59b1f704. Patch/raw/stages сохранены в `temp/spiral/directed-resweep`.

CPU ограничение resweep: разрешать донора только если его zero-cost ячейка
соединена с blocked interior одним supply stride16/32/64 с теми же probes.
На actual spiral этот marker сохраняет97.91% потенциального zero-cost
наружного потока; на blob marker пуст и оператор строго no-op.
`temp/spiral/resweep_mask_oracle.py` и JSON сохраняют доказательство.
Это ещё не реализация: повторное вычисление marker в каждом fragment дорого,
а кеширование требует аудита scratch texture/channel. Quarter probes также
не доказывают непрерывный мокрый путь между пробами. Нового GLSL/текстуры не
добавлено. Load/rebuild именно resweep не проверялся, поскольку общий вариант
отклонён; прежняя проверка59b1f704 остаётся действительной.

## Cached marker prototype: GPU проверка

Marker строится отдельным lazy program двумя prepass: blocked zero-cost interior,
затем donor ячейки, достижимые от blocked одним supply stride. Стоимость вне
zero-cost footprint обрывается сразу. После старого carry/supply выполняются
три направленных resweep64→32→16, и только donor с marker=1 может отдавать.
Receiver получает ту же долю того же donor; цвет читает pre-step pigment.
Оригинальные outward passes используют прежние веса. A/B флаг
`noInteriorResweep` отключает оба marker prepass и дополнительное расписание.

Free semantic channel не найден: pressure.b несёт standing-water seed через
front. Прототип использует два checked-out RGBA8 scratch pool buffer.
При1536² это18MiB пик; blocked возвращается после второго prepass,
приcarry остаётся9MiB live marker. Free textures подчиняются общему64MiB
лимитуpool. finish возвращает marker; aborted prepared plan отслеживается
SettlePlan и освобождается при destroy. Context loss сбрасывает references
без GL delete и pool.forget сбрасывает accounting. Lazy program handle
сбрасывается приinit послеrestore и удаляется приdestroy.

Marker standalone GLSL около1.2KB. Emitted carry и common-high strings
увеличены на181bytes: donor mask predicate; новая активная branch в high
bookkeeping отсутствует. Tablet coldcompile/performance ещё не проверены.
Typecheck/lint/map проходят;22unit tests, включая noalias/coupling,
обычныйrelease, abandoned-before-GPU destroy и partial allocation failure, проходят. GPU pixel proof и blob no-op подтверждены ниже. Load/rebuild этой новой
версии не запускался: визуальная польза не оправдывает дальнейший GPU бюджет.

CPU fetch estimate actual field: spiral13,878,717 logical samples across two
marker prepass; blob5,452,117. Extra blur pixels0. Carry donor marker hoisted
to one own sample and up to four neighbor samples, not20 repeated calls.
This counts logical GLSL execution; not physical texture transactions or FPS.

Четыре Vega on/off кейса завершены с GL0/context intact. Обе пары имеют
побайтно одинаковые pre-front/pre-carry/cost/coverage inputs. GPU marker
полностью совпал с CPU oracle:0 mismatches в blocked и fed обоих кейсов.
Spiral: blocked71856, fed136464; blob оба0.

| Метрика | Marker off (59b1f704) | Marker on |
|---|---:|---:|
| Spiral outside carrier после carry |8.3574%|9.5051%|
| Spiral после coarse diffusion |14.6111%|15.5784%|
| Spiral alpha loss в carry |0.05884%|0.07613%|
| Blob aftercarry |34.5557%|34.5557%|
| Blob coarse / исходная новая доза |276.4920%|276.4920%|

Blob PNG побайтно совпадает с off и со старым baseline:
`e4cc0a697f2b9ff21d282bf446b984bf400116aacdd63da13fbad05e6c20f02d`.
Spiral off SHA `8978762276de5b6e0de8ae87df0452e607ab48ab99e230e7e771acae86cc6f43`,
on SHA `9f5491eb3932864772a95e0f853f438454d0a6dbe038bbe720555ceb6f5ad5b8`.

Вывод: directed resweep после supply причинно усиливает выход, а marker
защищает проверенную компактную кляксу точно. Но основной плотный диск почти
не изменён; немного шире только внешний след. За18MiB peak и8 extra draws
(2prepass +3pairedcarry) польза слишком мала. **Не рекомендую на user stand
или в production.** Это сохранённый изолированный эксперимент, пригодный
для проверки ограничений расписания. Adreno coldcompile, tablet FPS,
широкая клякса с непустым blocked interior и multi-pigment QA не проверены.
Сравнение `temp/spiral/marker-resweep/spiral-compare.jpg`, данные `pairs.json`,
`marker-proof.json`, raw stages и скрипты остаются на диске.
