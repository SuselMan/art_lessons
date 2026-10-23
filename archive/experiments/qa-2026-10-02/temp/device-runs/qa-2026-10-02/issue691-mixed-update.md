Новый отдельный минимальный случай в QA: одна и та же AMD GPU/Chrome151,2 independent contexts. Seed pencil, simultaneous watercolor vs eraser across seed, server order pencil→eraser→watercolor. HBBg7iS2. Native CDP mouse, no HMR.

До45сек reference WC author имеет open wash + unsettledLayer; затем после100сек wash закрывается и resettle1 завершён. После120сек still pixel maxDiff17/255 (0.0667), test threshold0.03. Journals byte-for-byte equal (3ops), both wash=null, unsettled/rebuild/live empty, contexts healthy. Другой участник resettle0. Это не меняем на PASS увеличением tolerance.

`collaborationMatrix.spec.ts` новый mixed-tool case с runtime diagnostics. Saved artifact run label mixed-wc-eraser: screenshot1/2, trace.zip; decoded full journals + state in temp/device-runs/qa-2026-10-02/mixed-wc-eraser-diagnostics.json. Пять разных tools earlier max0.698 at45sec, но в том случае ещё не подтверждено состояние после wash expiry; дополнительный прогон ограничен RAM.

Исследую, имеет ли этот воспроизводимый same-GPU случай тот же корень, что первоначальный3-device #691. Новый defect number пока не создаю без разделения причин. Live20-person mixed legacy stroke нагрузка на AMD+Intel meanwhile raster grid max1/no>24; это другой путь получения WC и не опровергает проблему own stroke/re-settle.
