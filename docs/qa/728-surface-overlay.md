# #728: Surface, большая кисть

Проверка 2026-10-06 около 21:19 UTC. Source 67c5f6e8: main 8aa + CPU wet-overlay, без grouping/ring. Настоящий Chrome/Intel Iris Xe D3D11. Собственный HTTP endpoint5319, fixture-only crypto UUID shim для метаданных join; обычный HTTPS join не проверен. Вода и пигмент рисуются через PointerInput с coalesced pen events, pressure0.8. Native payload различен; это наблюдение, не строгое A/B.

| Лист / жест | Активные кадры | max / >33 / >100 мс | max после отрыва | GL / ACK |
|---|---:|---|---:|---|
| 640×480, вода400 4с |242|17 /0 /0|50|0 / да|
| 640×480, пигмент400 4с |241|18 /0 /0|67|0 / да|
| A4 Fine1754×2480, вода400 4с |241|17 /0 /0|100|0 / да|
| A4, пигмент400 4с |241|17 /0 /0|67|0 / да|
| A4, плотный зигзаг400 6с |299|233 /11 /5|150|0 / все9 seq|

Последний жест — один pointerdown/up, семь stroke operations соответствуют нарезке живого штриха. Он выполнялся поверх предыдущих водяного и пигментного мазков; это стресс мокрого наложения. Прямые линии не подтверждают плавность плотной штриховки. Установлены CPU обёртки для следующего воспроизведения: inclusive timings не суммировать; GPU time ими не измеряется.

Артефакты: temp/night-728/surface-overlay-*-result.json и исходники fixture; оригиналы также на HOME в680-combined-stability/temp. Временные CA install попытки не установили Root сертификат; собственный scheduled task остановлен, cleanup остаётся.

Повторный dense400 поверх предыдущего: active max233мс, 14>33/5>100; tail483мс; все8новых chunk operations ACK/GL0. CPU inclusive _paintStrokeDabs max54.5мс, _display22.2мс, _onEnd41.2мс; _completeSettle не превышал10мс. Это не объясняет все длинные RAF и не является GPU timer. Следующая абляция — early отказ от Plan.present при активном stroke, поскольку существующий callback уже отвергает показ, но после дорогих копий.

Early active+drain preview guard ON на Surface: dense native active max217мс, 12>33/5>100, tail150мс, GL0/ACK. Начальное состояние отличалось (предыдущая комната высушена/восстановлена), поэтому 233→217 НЕ причинный A/B и НЕ исправление.

Matched oracle: native18-op baseline (17 stroke chunks + ordered UI Dry) сохранён с decodedRGBA в собственной IndexedDB; fresh room replay ON и fresh room replay OFF тех же18операций, одинаковый source/бумага/шаг250мс. OFF vs ON whole1754×2480 RGBA EXACT0/max0, GL0/idle. Однако исходный native vs replay ON744130px/max64 — самостоятельная незакрытая parity проблема либо harness/lifecycle фактор, не влияние preview guards. Требуется дальнейшее воспроизведение на исходном source без snapshot и с полной фиксацией финального состояния.

Корневой source156b5106: guards default OFF, 26 целевых tests PASS. Mirror67+isolated guard patch сохраняет исходный overlay-only source, остальные совместные правки rect/tone туда не подмешивались.
