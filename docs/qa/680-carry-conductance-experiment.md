# #680 — абсолютная проводимость carry

Статус: **отвергнут как исправление кольца**, dev-only проба, не перенесён на
пользовательский стенд и не опубликован. База `11ee5ab6`, код `1ac8e865`.

Гипотеза: flat source cost запрещает обмен внутри footprint, а нормировка только
активных наружных связей `w/sum(w)` увеличивает скорость экспорта края. Проба
меняет оба парных знаменателя на `max(sum(w), 4*4^pow)` по флагу
`carryConductance`. В глубине исходного footprint обмена по-прежнему нет;
не добавлены blur, textures или проходы. Default flag=false сохраняет старый путь.

В synthetic float64 donor oracle масса сохраняется с ошибкой порядка 3e-14.
Исходный радиальный профиль имеет провал на границе: r23=.274 против r25=.286;
при абсолютной проводимости r23=.475, r24=.373, r25=.170. Это демонстрирует
эффект нормировки, но не доказывает механизм реального светлого кольца.

Настоящая Vega, операции 316–318 комнаты `1oHTHv2x`. В корректной паре флаг
включается только перед цветным целевым seq318; предыдущая чистая вода проходит
baseline. P-before всех четырёх каналов имеет одинаковые суммы, его amount
channel совпадает SHA256 `a4f52fce169401d104a9e4cd06d1bf25d40a06b14e47f7e9c5af5c9dd4aba2a9`.
14 carry steps, GL0/lostfalse, ни одного saturated amount pixel. C-проходов нет:
это одно пигментное семейство, не проверка mixed-colour conservation.

Суммы P [r,g,b,a]: before [115679,421792,1134203,115679], baseline after
[114735,420466,1131509,114735], candidate after
[116759,421266,1132868,116759]. RGBA8 не сохраняет mass побайтно: amount
baseline -0.82%, candidate +0.93%; pigment-strength .b baseline -0.24%,
candidate -0.12%. Насыщение не объясняет эти изменения, округление не изолировано.

Кандидат делает ядро темнее, но **тонкая светлая линия остаётся**. Площадь
цвета при R-G>20 уменьшается 19781→13388 px (-32%); bounding box сужается
[236,208,403,377]→[247,220,389,356]. То есть существенная часть улучшения
профиля куплена уменьшением общего выноса. Mean R-G в фиксированном ROI ядра
[295..354,275..339] растёт 113.61→130.84; mean horizontal G-gradient
4.75→3.90. Это метрики картинки, не доказательство сохранения бумажной фактуры.

Первый общий AB менял carry также у предыдущей воды и получил разные P-before;
он не используется для причинного вывода. После завершения spiral baseline
прогон остановлен, остальные дорогие global/spiral/blob candidates не считаются
проверенными. Target-only puddle достаточно показал, что этот оператор не решает
кольцо, поэтому расширение прогона остановлено.

Проверки: web typecheck и 7 WatercolorSettlePlan tests проходят. Полный monorepo
typecheck новой рабочей копии не прошёл из-за отсутствующих generated Prisma
типов server; изменения находятся в web engine. Samsung не проверен.

Артефакты `temp/carry-normalization/{gpu,target-gpu,metrics.json}`, cropped PNG,
`target-qa.mjs`, `cases.json`; CPU oracle в соседней рабочей копии
`324-live-spread-morph/temp/outline-independent/{oracle.mjs,report.json}`.
Своя Vite5314 остаётся отдельным diagnostic runtime; Chrome QA закрыт.

## Где возникает несогласованность и светлая линия

Следующий stage-only baseline прогон operator не меняет. `split-total` перед
mode0 имеет b<=a во всех пикселях; fixed.b=0. После mode0
`mobile=max(total-fixed,0)` b>a в 10484 пикселях (max125 codes), g>a в10469
(max62). Prefront и precarry имеют те же суммы/числа нарушений. Total a суммарно
5041455, fixed a4925776, mobile a115679, но весь новый b1134203 остаётся mobile.
10488 total amount pixels насыщены. Поканальная разность ограниченных векторов
не сохраняет b<=a; это точный этап появления нарушения, не доказанная причина
всех других дефектов. Исходный raster до объединения total здесь не дампился.

Final canonical tile снова b<=a везде; final C.rgb<=C.a. Поэтому рассматривать
composite strength clamp по mobile sums было преждевременно: display читает
восстановленный total, а не этот mobile. Shader composite не изменён.

На точной видимой линии y290..294, x261 (среднее по5 пикселям) P.b доcarry42.8,
после15.6, final P.b22.4 и C.a22.4, C.g6.4, luminance209.4. Снаружи x260:
final P.b/C.a39.6, luma190.9; внутри x262:35.8,194.9. C.g/C.a около.28
везде, coverage.a255. Светлая линия соответствует настоящему провалу пигмента
и optical depth, а не только ratio/coverage composite.

Mobile carrier на линии P.a10.8, а в центре x300 всего5.4; pigment P.b,
наоборот,42.8 против102.4. Это исходная несогласованность carrier и pigment
после вычитания насыщенного total-fixed. Независимая новая V-модель может
устранить её, но этот вывод нужно подтвердить тем же frozen profile на V,
а не переносить результат baseline на другой оператор автоматически.

Артефакты `temp/carry-normalization/frozen-stage`: report с global sums и
числами нарушений, малые RGBA ROI каждого этапа, `line-profile.json`,
`profile-console.txt`; воспроизведение `frozen-stage-qa.mjs` и
`profile-frozen.mjs`. GL0/lostfalse, собственная вкладка закрыта.
