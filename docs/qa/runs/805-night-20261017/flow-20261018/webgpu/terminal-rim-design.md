# Терминальная кромка: CPU design, не новый GPU вариант

`macro12-front-adsorption.ts:10` frontDeposit менял M→D в той же coarse ячейке, когда рядом больше поверхностной воды. Местное M+D в этот момент не менялось: он мог остановить дальнейшее движение, но не собирал пигмент в полосу. Поэтому это не тот механизм, который нужен для заметной конечной кромки.

## Более дешёвый профиль без SDF

Предлагается заменить paper affinity на terminal edge affinity в отдельных fine фазах после transport, при прежнем fixedD/literal/capacity. Это реальное перемещение mobile4channels между соседями, не added-rim/color multiplier.

Из четырёх coarse значений конечного W+S, уже доступных fine reconstruction, вычислить bilinear scalarF и его **аналитический градиент**, без distance-field texture/итераций. Только если fourcorner min<T≤max (ячейка пересекает изолинию), оценить внутреннее расстояние `d≈(F−T)/|gradF|`. Дешёвый norm proxy=max(|gx|,|gy|)+3/8min; plateau/нетcrossing даёт noedge. Внутри wet F≥T поставить ограниченный affinity профиль с пиком около2px и хвостом до8px (диапазон2..10 на проверку). В CPU witness: baseline64/peak256, без бумажного grain.

Это **локальная level-set аппроксимация, не настоящий SDF**. Изолиния bilinearF непрерывна и не повторяет8pxnearestступеньку, но coarse геометрия и стыки производных остаются. В узкой шейке/седле профиль может ошибаться, а граница на краю canvas требует отдельного правила. Fourcornercrossing ограничивает видимую полосу примерно одним coarse переходом; tail10px не обещается повсюду. Главное: T пока не выбран для actual water distribution. Нельзя назначать его по одной красивой картинке или считать initialdry неизменной стеной.

Проходы используют прежний capacity-bounded integer finePair, изменяется только bounded affinity. D не переносится; opaque freeAlpha0 не принимает pigment. W/S в терминальной фазе фиксированы как вход, не меняются. Все4mobile суммы сохраняются попарно; белаябумага безпигмента остаётся пустой. Для GPU потребуются аккуратная integer norm/координаты и actual verification, CPU floatdistance не доказывает crossGPUdet.

## Syntheticdisc witness и отрицательный контроль

`terminal-rim-cpu-design.cjs/.test.cjs`: coarse16→fine128, waterdiscR40, uniformmobilealpha30000,12parityфаз. Внутренняя0..4pxполоса получила **+6.56% mobilealpha**, ровно за счёт соседей; все4суммы exact, outsidewet0, premul/cap guardsPASS. Это умеренное локальное уплотнение, не native whole-wash rim. При добавлении opaque freecapacity0 fixedpixel пигмент не появился, массы сохранились. Constantwetfield не создал внутренних полос; wateronly не создал краску.4CPU tests PASS.

Отрицательный контроль: pigmentdiscR10 в waterR40 за12фаз не доставил ничего к rim. Горизонт12фаз — максимум6pxпо каждой оси, L1≤12px; фактический средний перенос намного меньше предельного. Имеющиеся native-style mode7/14 собирают долю paint из гораздо более широкого interior. Следовательно, fine12 **неразумно рекламировать как универсальную кромку для центральной капли в огромной луже**.

Перед GPU реализацией полезно посчитать долю actual mobileM в ближайших2..10px конечного waterthreshold фронта по уже имеющейся coarse readback матрице. Если её почти нет, этот оператор не даст нужной кромки; увеличениеgain не исправит причинный горизонт. V15mini имел около68.9%mobile/31.1%adsorbed по coarsealpha, но пространственная доступность rim из одной суммы неизвестна. D fixed дополнительно разбавит визуальный эффект.

## Цена и решение

Если заменить существующие finepaper12 теми же12edgepair фазами, число full1024dispatch/буферов не растёт; добавляется локальная арифметика4water samples в init, без нового fullimage/SDF. Если добавить ещё12фаз поверхpaper12, это уже заметный bandwidth cost и вторую цепочку пока не предлагаю. Нужны отдельные noedge/edgeконтроли при одной softpaper настройке, чтобы не спутать бумагу иrim.

Рекомендация: обсуждать этот вариант как ограниченное terminal-local stopping усиление только для loadedwash, где M уже дошёл доwateredge. Для далёкой centraldrop потребуется иной coarse transport/capture механизм; не скрывать отрицательныйCPUконтроль. Macro11/17/18/14 и frozen GPU bundle не менялись, никакой GPU автором не запускался.

## Порог и новая композиция macro27

Порог выбран **T=64 кодов W+S** до просмотра результата. В исходном reducer одна средняя byte-единица воды даёт64.25 u16-кода; T≈1/255, это слабая, но ненулевая граница. На13 реальных исходных картах T64 оставляет ниже контура0.54–7.37% положительных coarse-ячеек; T256 оставляет1.15–33.24%, особенно много на sheet12. Подробности воспроизводимы `terminal-rim-water-stats.cjs` и `terminal-rim-initial-water.json`. Это начальные карты, не прогноз финального распределения W+S.

T управляет только affinity, **не заменяет** существующий nearest wet gate `c.w+c.s>0`. Поэтому старые ограничения воды/сухих соседей/неподвижного D/свободной ёмкости сохранены. Полоса существует только в bilinear coarse-ячеях, пересекающих T; плоская вода не создаёт ложную кромку. Геометрия не является SDF: возможны градиентные стыки8px, нет решения сложных тонких шеек/седловин; pigment далеко от края не подтягивается.

Новый standalone macro27 собирает smooth fine kernels через actual macro11 factory, а coarse через actual macro14 factory с fast initializer. Нет изменений shared macro11/17/18; нет compact transforms первого опыта. Контроль strength0 имеет constant affinity64, доказанно эквивалентную constant1 в прежнем integer pair operator. Проверяются все четыре суммы, не только альфа. Параметры coarse steps256/mobility3/eddy16/curl128; fine12/paperGain0.

### Обнаруженная регрессия V23 и исправление

Первоначальный source-only вывод о всех старых fine-ветках уточнён проверкой истории root/operator: V17–V22 использовали coherentSource безусловно. c2110521 включил поддержку pairSourceOverride, после чего ранее игнорируемый mobility fallback через macro17/18 стал регрессией V23. Macro18 теперь явно выбирает coherentSource, восстанавливая прежнюю физику. Macro27 использует тот же явный выбор. Исторические coherent-утверждения V17–V22 сохраняются; новая кромка сравнивается с восстановленным neutral fine baseline. Полная область и исправление: true-coherent-fine-errata.md.
