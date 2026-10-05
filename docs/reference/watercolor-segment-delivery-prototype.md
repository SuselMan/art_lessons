# #680: исполняемый сегментный прототип

База d69d2a55 (включает be1dc506). Включение только в dev: `?wcSegmentDelivery=1`. В production и без параметра сохраняется прежний painter. Это review-кандидат для исследования общей жидкости, не завершённое исправление четырёх претензий Ильи.

Принцип: один движущийся сегмент сначала доставляет воду в MAX coverage/standing, затем пигмент и optical depth читают ту же уже доступную жидкость. Before-contact recorded wetness остаётся источником finite pickup/waterClock. Кисть не подбирает обратно собственную только что внесённую воду. Геометрия, travel/pigment clocks, immutable film base/MAX envelope и seed сохраняются на общем scratch между сегментами. Новых operation fields нет.

Внутренние diagnostic переключатели позволяют отдельно включать порядок сегментов, пропуск бесцветного ink carrier, чтение общей жидкости и независимый landing reservoir. Старое значение inkLoad RGBA для цветной краски сохранено: .a — нормировочный вес, .r — weighted brush water, .g — available wetness, .b — weighted pigment strength. У чистой воды inkLoad и optical depth теперь нулевые; water coverage остаётся. Заменять .a на strength-weighted нельзя: это разрушает концентрацию .b/.a и water .r/.a.

Доступная жидкость для pigment raster — фактическая coverage.b/coverage.a после water phase, читаемая sampler в nib/band. Скаляры wet-pull/pigmentGate получают max(contactBefore, newlyDeliveredStanding) после расчёта finite load. Contact/bristle geometry и сухая кисть сохранены; transport/composite не используют before-contact как единственную мокроту. Цветовой depth наносится тем же source dose и wetness, что pigment record. MAX-domain пока не водный объём и не conservation solver.

## Что доказано на настоящей Vega

Диагностика в `temp/stream`, изолированный домашний порт 5294. 5290 и be1 на 5293 не изменялись.

- Выключенный прототип: baseline PNG и coverage/deposit/colour RGBA совпали byte-for-byte с be1 для direct/prewater.
- Combined/explicit dispatch: пять пар (100% pigment direct/prewater, 15% direct/prewater, dry-pigment-on-existing-water) имеют одинаковые PNG и все RGBA. Это **construction invariance двух представлений одной segment primitive**, не независимое доказательство natural prewatering.
- Pure water preset `normal:100:0`: ink/depth RGBA суммы [0,0,0,0]. Формат preset — response:water:pigment, `normal:0:100` является сухим пигментом.
- Slicing: canonical append и native painter с теми же подготовленными 41 dab (изменяющийся pressure/size, поворот, одинаковые coalesced timestamps) через whole/1/3/7 dab boundaries, включая реальные паузы, дали byte-identical PNG и coverage/deposit/colour. Проверен prepared painter input, не весь пользовательский pointer lifecycle.
- Small natural 100%: summed source-stamp dose descriptor direct/prewater стал 18.7409936787/18.7409936787; final ink.b 1128193/1128138 codes. Однако это включает **изменение release/dose**: direct +77%, prewater +24% относительно be1. Это не улучшение только транспорта и не физическая интегрированная масса.
- Реальная спираль и клякса GL0, без context loss; спираль визуально почти прежняя, клякса темнее, кольцо остаётся. Не подтверждают решение всех проблем.

Первый actual15 comparison ошибочно сопоставлял 47→48→49 с 48 (два цветных прохода против одного), поэтому не годится для origin-выводов. Его вывод о различии фактуры отозван. Правильная causal пара — 47(water)→48(pigment) против 48, отдельно 49 — repeated-control; она отрендерена отдельно: `temp/stream/actual15-matched-comparison.jpg`. На full обе стороны сохраняют тёмную посадку и мраморность хвоста, различие существенно меньше, чем в be1; желаемая живость этим не доказана. Даже правильная natural пара содержит дополнительную воду: waterClock direct истощается, prior water подпитывает его. Это нужно отличать от происхождения жидкости.

Load/rebuild равны для small direct/prewater, реальной спирали/кляксы и actual15 direct/repeated control, GL0. Web typecheck, lint (исторические warnings), map:check и 77 relevant unit tests прошли. Независимые npm install в обеих копиях; node_modules symlink устранён.

## Ограничения

Dev-only recursion увеличивает число pass/copy на длинном stroke; не включать глобально без profiling и настоящего Samsung cold compile. Source dose descriptor не учитывает интеграл geometry/MAX overlap, RGBA8 codes не являются абсолютной массой. Protocol не решает сам смешение двух цветов, ring/carry и animation. Следующая causal абляция должна фиксировать водное поле и source dose отдельно, а не назвать исчезновение исторической метки полной физической эквивалентностью.
