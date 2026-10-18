# Почему новые wash мягче native: read-only механизм и два кандидата

Ничего не реализовано, GPU не запускался. Речь о исследовательском front8-detail-flow-v4 endpoint и новых bounded carriers; их единицы/композиторы и модель не эквивалентны.

## Наблюдения, а не предположение о нехватке grain

Сохранённый mini на общей fixedROI: native endpoint HF carrierRMSr2=.02476, new fine0=.00365, fine12gain3=.13680. Papercorr уgain3−.91185, уnative−.00695. То есть новый wash сначала слишком гладкий, потом fine affinity накладывает очень сильное paper-linked перераспределение. Дополнительное grain само по себе не восстанавливает характерный stopping edge. Root V15/16 визуально: grid/rings сняты, появилась бумага, но airbrush остаётся; coherent улучшил форму и смешение. Floor initial tiny0.0017%alpha уmini не объясняет мягкость/белизну.

## Конкретные source причины

1. **Повторное симметричное смешение.** `macro9-integer-smooth.ts:7` exchange переносит packets в обе стороны; kдо64/256. `macro10-wetness.ts:6` масштабирует его абсолютной водой, `macro13-mobility-calibration.ts:7` gain часто возвращает насыщенный режим. `macro14-coherent-advection.ts:9` запускает256парных фаз. На достаточно мокрых однородных участках это повторяющееся выравнивание в дополнение к coherent upwind flow. Advection сохраняет packets, но численно donor-cell тоже рассеивает. Нет отдельного контроля общего mixing budget.
2. **Coarse averaging и реконструкция.** `macro8-integer-dynamic.ts:41`/`macro20-fast-initial.ts:7` сворачивают64fine texels в одну ячейку128. `macro17-smooth-fine-paper.ts:9` заново интерполирует M/D. Это убирает grid, но не сохраняет исходную геометрию волосков/тонкого края. Native detail branch `WatercolorSettlePlan.ts:302` сохраняет inputInk/inputColor; `:317` восстанавливает base+up(new−old), pigment/color через materialReconstruction с исходным high field. Прямое заимствование residual нельзя объявить безопасным для наших u16premul/capacity: отрицательные/переполненные значения требуют нового доказательства.
3. **Нет механизма конечной кромки.** `macro8-integer-dynamic.ts:9` adsorb связывает местное M→D с поглощением W; macro9 меняет коэффициенты на1/128 и20%, одинаково во всём поле, без edge/drying-front условия. `macro14-coherent-source.ts:15` переносит воду суммой pressureQ иcurlQ, но terminal rim pass отсутствует. Отсутствие испарения/контактной линии — выбранное упрощение, не полноценное объяснение всей физики.
4. **Native явно делает именно кромку.** `WatercolorSettlePlan.ts:530` ширина world-band2..10px, `:603` inward distance, `:617` mode6profile; shader `shaders.ts:3644` sharp peak+слабыйvalleytail и `:3691` stood/merge/backrun gates. Затем `WatercolorSettlePlan.ts:626` переносит долю paint на нормированныйband. В group dry `:1373`/`:1436` строится одна outer contour всейwash, `:1460` tide переносит долю всех paint через mode7/14. `watercolorPresets.ts:1193` WC_TIDE_RIM=.4, `:1207` band10px. Это не просто blur и не всякое grain: есть целенаправленная остановка/накопление на границе. Native own fine-only diffusion schedule в `wetDiffusion.ts:103` специально убрал coarse blur, который делал всюлужу бледным haze.

## Кандидат1 — меньше symmetric mixing при прежнем coherent пути

Оставить256pressure/curl фаз, но exchange разрешать лишь в64сбалансированных фазах, например первые16полных циклов4parities; остальные192 выполняют тот же water/advection/adsorb без exchange. Это новая schedule/model настройка, не exact-output optimization. Первое сравнение:256/256 exchange vs256/64, одинаковый вход/поле/реконструкция/softpaper.

Механизм: меньше изотропного выравнивания, coherent движение сохраняет направленную форму, внутри остаётся более плотное тело. Это не добавляет кромку автоматически и не возвращает потерянныеfine волоски. Проверка: при одинаковом W/S ledger и field смотреть ширину/контраст body-to-edge, mixing двух красок и RMS travel, all4pigment ledger/premul/cap. Предсказываем более узкий хвост без умножения цвета/подрисовки зерна; это проверяемая гипотеза, не гарантия.

Стоимость:256dispatch остаются; исчезают192вызова exchange на пару, каждый содержит два packet color-ratio расчёта и до7capacity retries. Физический shader всё ещё делает advection/adsorb, поэтому нельзя обещать4×GPU. Важно **не переключать существующий mixing-bit2 целиком**: в macro9 этот bit также выбирает absorption1/128vs1/32 иadsorption20vs70. Нужен отдельный exchange-onlygate, чтобы не спутать эффекты. Сбалансированные4phase циклы обязательны: просто every4thphase выбрал бы одну ось/паритет.

Безопасность: disabled exchange есть identity; enabled exchange и advection прежние capacity-bounded4channel packets. Поэтому mass/premul/cap доказательства наследуются по композиции, но нужны CPU fullmatrix и actualGPU проверки нового schedule. Нет нового поля/полного1024буфера.

## Кандидат2 — короткий transport + терминальная conservative stopping band

Сначала128coherent фаз вместо256, затем4–8дешёвых coarse pair фаз, которые переносят ограниченный packet мобильного пигмента из соседнего interior к внешней **итоговой динамической** wet-support границе и фиксируют его в recipientD. Не переносить по initial contour и не умножать финальный цвет. Destination capacity включает existingM/D+literal; непоместившийся packet остаётся donor, безclamp. Профиль простая1coarsecell stop band (8px), без нового grain/noise.

Это феноменологическая terminal rim relocation, **не симуляция испарения** и не копия native mode6/14. Native образец мотивирует направленное накопление, но его нормированные floatgather не доказывают нашу консервацию. В парной integer формулировке один и тот же4channel packet вычитается/добавляется, donor outgoing/recipientD premul+cap проверяются CPU. W/S не меняются; никакого автоматического создания darkrim из цветового множителя.

Проверяемый контроль:128/no-rim против128/rim и существующего256, всёпрочее одинаково. Измерить изменение edge/interior density натомжефинальномdomain, all4M+D exact, maxcap/premul, наличие непрерывной линии вместо точек, отсутствие лишних внутренних колец на two-strokes. Band о wet-support требует явного threshold и proof на dry/wateronly/opaque inputs. Нельзя объявлять его immutable wall или скрывать, что128шагов могут ухудшить reach/mixing.

Стоимость: вместо4.19Mcoarse cell-phase invocations для256 —2.10M для128 плюс~0.13M на8rim фаз и один edge-score проход16k. Можно использовать existing pingpong state; scalar edge score потребует около64KiB. Fine12остаются прежними и могут доминировать, поэтому общий выигрыш не равен2×. Если дляrim потребуется широкая distance/gather цепочка какnative, смысл дешёвого кандидата теряется — отказаться до большого порта.

## Что не предлагается сейчас

Не увеличивать grain; не вводить ещё один CFD backend; не лечить edge постконтрастом; не возвращать hard raw-core fraction без переноса; не делать Q8 только по worst-case bound. Оба предложения требуют одобрения/аппаратных фактов прежде кода. Сейчас в Git только эта краткая source note.
