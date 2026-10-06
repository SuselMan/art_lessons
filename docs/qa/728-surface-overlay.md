# #728: Surface, большая кисть

Проверка 2026-10-06 около 21:19 UTC. Source 67c5f6e8: main 8aa + CPU wet-overlay, без grouping/ring. Настоящий Chrome/Intel Iris Xe D3D11. Собственный HTTP endpoint5319, fixture-only crypto UUID shim для метаданных join; обычный HTTPS join не проверен. Вода и пигмент рисуются через PointerInput с coalesced pen events, pressure0.8. Native payload различен; это наблюдение, не строгое A/B.

| Лист / жест | Активные кадры | max / >33 / >100 мс | max после отрыва | GL / ACK |
|---|---:|---|---:|---|
| 640×480, сухой пигмент400 4с |242|17 /0 /0|50|0 / да|
| 640×480, пигмент400 4с |241|18 /0 /0|67|0 / да|
| A4 Fine1754×2480, сухой пигмент400 4с |241|17 /0 /0|100|0 / да|
| A4, пигмент400 4с |241|17 /0 /0|67|0 / да|
| A4, плотный зигзаг400 6с |299|233 /11 /5|150|0 / все9 seq|

Последний жест — один pointerdown/up, семь stroke operations соответствуют нарезке живого штриха. Он выполнялся поверх предыдущих сухого и мокрого пигментных мазков; это стресс мокрого наложения. Прямые линии не подтверждают плавность плотной штриховки. Установлены CPU обёртки для следующего воспроизведения: inclusive timings не суммировать; GPU time ими не измеряется.

Артефакты: temp/night-728/surface-overlay-*-result.json и исходники fixture; оригиналы также на HOME в680-combined-stability/temp. Временные CA install попытки не установили Root сертификат; собственный scheduled task остановлен, cleanup остаётся.

Повторный dense400 поверх предыдущего: active max233мс, 14>33/5>100; tail483мс; все8новых chunk operations ACK/GL0. CPU inclusive _paintStrokeDabs max54.5мс, _display22.2мс, _onEnd41.2мс; _completeSettle не превышал10мс. Это не объясняет все длинные RAF и не является GPU timer. Следующая абляция — early отказ от Plan.present при активном stroke, поскольку существующий callback уже отвергает показ, но после дорогих копий.

Early active+drain preview guard ON на Surface: dense native active max217мс, 12>33/5>100, tail150мс, GL0/ACK. Начальное состояние отличалось (предыдущая комната высушена/восстановлена), поэтому 233→217 НЕ причинный A/B и НЕ исправление.

Matched oracle: native18-op baseline (17 stroke chunks + ordered UI Dry) сохранён с decodedRGBA в собственной IndexedDB; fresh room replay ON и fresh room replay OFF тех же18операций, одинаковый source/бумага/шаг250мс. OFF vs ON whole1754×2480 RGBA EXACT0/max0, GL0/idle. Однако исходный native vs replay ON744130px/max64 — самостоятельная незакрытая parity проблема либо harness/lifecycle фактор, не влияние preview guards. Требуется дальнейшее воспроизведение на исходном source без snapshot и с полной фиксацией финального состояния.

Корневой source156b5106: guards default OFF, 26 целевых tests PASS. Mirror67+isolated guard patch сохраняет исходный overlay-only source, остальные совместные правки rect/tone туда не подмешивались.

Дополнительный контроль: checkpoint-free _rebuildLayer на OFF replay слоя, временный best()=>null восстановлен finally после idle. Whole decodedRGBA относительно ON remote replay EXACT0/max0, все18ops, GL0. Разница относится к native endpoint относительно обеих путей истории; её причина ещё не доказана. Ordered fixture29060bytes: temp/night-728/surface-dense-native-ops.json (и HOME680-combined-stability/temp), чтобы следующий анализ не зависел от текущей страницы.

Коррекция 21:33 UTC: parser normal:WATER:PIGMENT. Первые прогоны с normal:0:100 ошибочно были подписаны water400; на самом деле это dry pigment400. Исправлены таблица и условия. Чистая вода требует normal:100:0 и отдельной повторной проверки. Ошибочные имена raw-файлов сохранены как исторический evidence, не использовать подпись как доказательство воды.

Корректная чистая вода normal:100:0: прямойA4/400, active241/max17мс/0>33, tail100мс; dense OFF7chunks active310/max217мс/13>33/5>100, tail150мс. После isolated zero-source patch native ON на новой пустой комнате:8chunks, все8prepare skip=true/known=true; active337/max150мс/7>33/2>100, tail400мс, GL0/8ACK. Native payload/time/начальное состояние различаются, поэтому это не строгий paired speed A/B; полная плавность НЕ подтверждена. Доказано, что gate действует во всех живых порциях, а не только в первой. В конце actual recorded preset проверен normal:100:0.

Offline native/history analysis: все alpha255/exact; из744130 изменённых RGB пикселей только242 имеют delta>8. Суммарный signedRGB drift [+2189,+1992,+3525], bbox[2,583,1753,1848]. Геометрия и большая часть тона визуально сохраняются; это распределение мелких различий с редкими большими. Не потеря слоя, но строгий паритет ещё не достигнут. Lossless PNG native/replay сохранены на HOME и VPS.


## Combined engine18018025, 23:09 UTC

Actual visible Surface Intel Iris Xe on ownHTTP5319, A4 Fine1754×2480, prior UI/backend4537. All diagnostic switches OFF. Native purewater400 zigzag6seconds:7 ACK chunks seq9–15, active max534ms/18frames>33/6>100, tail300ms, GL0 and stable timeOrigin. Existing own water room; accumulated state differs from earlier measurements, so this is not causal A/B. It does contradict the target of smooth dense brush400. Scratch219MB/field90MB/reveal48MB.

Explicit engine Dry (old UI still pencil; no UI Dry claim), then wholeRGBA saved into indexedDB qa-728-surface/fixtures combined180-baseline. No-checkpoint forced rebuild from seven resident water entries: whole1754×2480 exact0/max0/GL0. This is limited pure-water parity, not pigmented full-history restore. Raw JSON/scripts under temp/night-728/surface-combined180*.
