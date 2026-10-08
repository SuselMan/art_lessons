# #728: контракт settled snapshot для нового оператора

Новый перенос — отдельная модель, OFF остаётся эталоном. Ни один вариант ниже не включён. Первые исходные полосы уже существуют без оператора; сохранение этих полос после осадка может отдельно зависеть от нового state bookkeeping.

## Установленный контрактный дефект и граница доказательства

`roomWatercolorExecutor.publishCurrentToGl` после успешного GPU audit копирует текущие P/C в base и очищает stroke. `CanonicalWatercolorSettlePlan` выбирает base как settled вход, когда filmGesture соответствует gesture, и считает mobile из laid−settled. Это меняет разложение даже при нулевых rates. Узкий zero candidate73a2f68a сохраняет всю film/base структуру; аппаратный corrected5359 full-state контроль завершён: все3контакта совпали с OFF по шести pre/post ролям, source P/C и публикации, финальный decoded export SHA совпал. Подробный отчёт — [728-moment-white-stripe-localization.md](728-moment-white-stripe-localization.md).

Активный пример: load[100,0]→[75,25] сохраняет сумму100; историческая settled база[0,0] даёт mobile[75,25]. Rebase даёт mobile[0,0], хотя видимые records и сумма не изменились. Это математический counterexample, не аппаратное доказательство причины финальных полос.

Нельзя объявлять optical base подмножеством load по каждому каналу. Реальный mode1 independently fit: Cbase[255,0,0,255]+Cfilm[0,255,0,255]→Cload[128,128,0,255]; красный base255 превышает load128. Все значения конечны/u8 и RGB≤CA, поэтому такие guards это не исключают. Если красный load переносится из ячейки полностью, неизменная красная база с ограниченным положительным film не представляет этот результат через старый fit. Source fit менять для обхода нельзя. CPU counterexamples сохранены в wetBrushMomentCarrierCounterexample.test.ts.

## Явная граница snapshot

До первого активного переноса текущего gesture сохранить IMMUTABLE settled P/C snapshot, который старый planner действительно выбрал бы на этом участке: (filmGesture===gesture ? base : inkSettled) ?? load, аналогично C. Зафиксировать owner/tile, generation, gesture/materialGesture, GL-bottom rect/world origin и источник каждого snapshot. Это не снимок framebuffer и не snapshot после rebase. Отсутствующий C/film фиксировать как отсутствие, а не изготовленную нулевую текстуру.

После переноса running load может быть rebased для продолжения MAX источника, но этот технический base больше нельзя использовать как исторический settled вход. Planner capture должен получать явные snapshot ресурсы вместе с transported load. Leases принадлежат одному queue owner, не удаляются до фактического capture/последнего использования; retire/cancel освобождает их. Следующий retained dab выполняется строго один раз в том же canonical order. Никакого per-live-chunk транспорта. Записанные source параметры/wet/seed остаются теми же.

## Два reviewable варианта, пока не реализации

1. **Фиксированный исторический snapshot.** Переносить текущий load, planner получает неизменный pretransport settled snapshot. Минимальный integration seam; требует двух bounded texture snapshots (полный1024 P/C =8MiB, можно bounded capture где поддержан точный crop). Однако перемещённая старая краска может давать отрицательную разность laid−settled в исходной ячейке и положительную в соседней. Старый clamp/remobilization меняет трактовку mobile; это нужно измерить, а не объявлять физически корректным.

2. **Совместный перенос load и исторического snapshot.** Общее fractional λ перемещает десять независимых u8 каналов (два вектора PB+CRGBA), ограничивается ёмкостью обоих приёмников. Каждая сумма сохраняется, pointwise base≤load не требуется. Planner получает transported settled snapshot отдельно от continuation base. Дополнительные5channels×4bytes на packed record и snapshot leases; оценка трафика, не hardware timing. Не гарантирует равенство mass/clamped mobile или натуральность: independently fit уже даёт signed differences. Это новая гипотеза модели и нуждается в отдельном OFF контроле.

## Gates до выбора активного варианта

Zero: все cropped P/C/base/film до/после неизменны, отсутствие полей/epochs совпадает; следующий контакт и final export совпадают с той же OFF tape. Active: отдельно суммы каждого raw operator channel, у8/finite, outsideROI; laid/settled/mobile inputs до front/diffuse; current brush contact и previous-water state; fixed author→packed replay. Между вариантами сравниваются реальные картинки и латентность, без ожидания same-model exact. Source-mask decomposition требует фактического prepared-uniform census, не предположенного profile anchor. Nonzero defaults/формулы сейчас не меняются.


## Следующий минимальный proof до активной интеграции

Дополнительные CPU tests (5 всего PASS) показывают: snapshot[20,0], transported load[75,25] дают mobile[55,25]; continuation base[75,25] даёт0. Snapshot должен быть сохранён до первого переноса и пережить partition/live chunks; поздний capture не подходит. При этом даже перенос обоих records общим линейным оператором не доказывает сохранение clamp-mobile: laid[100,0],settled[0,100] имеют positive100; mixed load[50,50] с фиксированным snapshot даёт50, с mixed snapshot[50,50] даёт0, хотя обе raw суммы100 и signed difference sum0 сохранены.

Поэтому следующий read-only gate — actual contact2 planner capture: отдельно bounded historical settled P/C до переноса, technical base после rebase и laid на входе planner. Зафиксировать роль/epochs/absence/SHA и exact operator delta, затем вычислить signed и positive per-channel differences. Без выбора snapshot формулы на основании одних raw sums. Это независимый от first-stamp маски контракт и не исправление физики.
