# #745: слои, восстановление и границы поддержки М70

Настоящий Vega AMD GPU, CDP19333, два независимых автора; источники менялись
только между END и новым общим freeze. Сравнивались **фактические pixels** до
full-replay oracle, а не два повторных oracle. Материализация текущего canonical
puddle target выполняется явно перед чтением: это проверка конечного материала,
не текущего декоративного кадра анимации. Результат относится к одному rasterizer.

| Сценарий | Runtime | Результат |
|---|---|---|
| wet/dry duplicate, historical copy после undo source dry и cold rejoin |8680f05f | PASS |
| clear/delete/move undo: actual restore, redo |0c83ca99 | PASS4/3/4 |
| обычный wet merge + actual undo обоих source |0c83ca99 | PASS5 |
| forced unsettled fallback merge с двумя live wet source + actual undo |2f52616d | PASS5 после #754 |
| background lifecycle frozen → peer dry → immediate new DOWN → resume |1e521993 | PASS: DOWN видел drying=true и принят; target/boundary exact обоим |
| actual socket disconnect + offline own / online foreign strokes → recorded dry |1e521993 | PASS, journals и сухие actual targets совпали |
|100×8 M70, normal entry |0c83ca99 | функционально PASS,107ops |
| та же100×8fixture, настоящий annotations/compact вход |1e521993 | PASS2 с restored snapshot coverage; исходный #756 timeout был ложным raw-ID gate |
| третий wetlayer /1536² recovery |1e521993 | материал и pencil recovery сохранны; поддержка воды отсутствует |
|512×768 / infinite recovery |1e521993 | FAIL:24unhandled guards обоим, хотя соседний материал и pencil сохранны |

У fixed #754 goalcomputations параллельного replay теряли scratch до accept;
#755 silent DOWN refusal во время визуального drying устранён материализацией
только closing targets. Их старые disposable rooms/auth удалены после hardware
подтверждения. Нет заявления о настоящем OS sleep: профиль оставлял hidden/RAF
активными, поэтому backgroundcase явно использует CDP lifecycle frozen.

#752 source-order остаток: сразу после offline reconnect predry B goal отличался
на66bytes max2 (Aexact), хотя journals совпали. После записанной paper_dry target
совпадает обоим. Это не доказательство natural-dry convergence; исходный predry
отчёт сохранён отдельно. Анимационное расхождение не используется как оправдание
расхождения canonical target.

Loading: seed728745,100strokes×8dabs,dryEvery20,inputSHA
3a49cc12ee2f1e4acf0080d9573045756af7cf4a63f5cd7c45e3ed1eecbe48e5.
Normal navigation→ready11.69s / firstvisible11.75s / rawhistory22.75s.
Annotations→ready13.26s / firstvisible13.05s / coverage-ready13.92s;
compact10.33s /10.15s /10.68s. Это единичные dev-stand измерения, включая навигацию,
CDP/network/bootstrap; не performance benchmark. Официальный inner room-open
измеряет более узкую фазу и не подменяет navigation wall clock. Оба annotations
режима показали54283nontransparentpixels, mode=true при engineReady/firstDraw,
GL0.5старых strokes отсутствуют в bounded100-op backfill, но позитивно покрыты
restored ledger107 **и snapshot checkpoint**. Full-replay неполного лога не oracle;
cached ReviewImage путь не проверен.

Подробные evidence: temp/device-runs/745-final2-*,745-final3-*,745-final4-*,745-final5-*.
Сводка машинно: temp/device-runs/745-layer-correctness-summary.json.
Все собственные contexts и coordinators закрыты. Новый сервис не запускался;
Vega browser/profile/tunnel сохранены и переданы qa_cases для следующей проверки.
Оставлены только необходимые для открытых findings private fixtures:
reconnect predry qa-undo-v1-36300914-e435-40b4-ae86-559d803ab815;
non-square qa-undo-v1-e8e00615-420d-4406-b3b5-28973c7ec242;
infinite qa-undo-v1-7f5188bf-924d-401b-9460-b0e762e5ec8c.
Их auth в приватных QA directories, не в Git; остальные наши завершённые комнаты
удалены exact owner API, auth удалён. Координатор может удалить оставшиеся после
решения открытых findings, compact evidence сохранять.

## Финальное уточнение после #757/#758

Runtime2c2f6115, ещё ровно4boundedcase, без performanceclaims: oversize1536²,
512×768, infinite, thirdwet atomicreject PASS4. Ordinarypencil/setActive+timers
ошибок не дают. После отвергнутого DOWN→20MOVE→UP journalIDs, failedtarget
pixels/residency и соседниеcanonicaltargets обоих участников unchanged,
strokeId+strokeLayernull, queue0/GL0, pencilrecovery работает. Тоесть #757
неожиданный прогрев и #758 незаписанный локальный пигмент исправлены.
Сами watergeometry/capacity ограничения #747 остаются unsupported.

**Уборка завершена:** все37 наших recordedfixtures имеют exactownerAPI deletion
receipt, private host-state/auth файлов осталось0. Включая прежние3retained и
baselineghost: они удалены по явнойкоманде координатора, compactproof сохранён.
Ни owncontext, ни coordinator процесса не осталось. Vega browser/profile/tunnel
не трогались и переданы qa_cases на финальную уборку.
Итог4case: temp/device-runs/745-final758-summary.json;
cleanup receipts: temp/device-runs/745-final-owned-fixture-cleanup.json.
Предыдущее перечисление retainedfixtures выше описывает промежуточный этап,
сейчас оставшихся rooms/auth нет.
