# CPU replay влажности через настоящие обработчики Engine

Конструкторный DEV `diagnosticWetReplay` требует `diagnosticPointerAdmission`; Room/query его не включает. Допускается только изолированный fresh normal20/100, один source operation без chunk flush, без открытого wash, peer/rebuild/FIFO и внешних callbacks. Каждый dispatch повторно проверяет владельца и изоляцию до изменения материала.

Engine-local getter направляет только input sampling/deposit/drain/drop/commit в независимый PaperWetness fork. Typed cursor использует записанные DOWN/join/checkpoint/per-batch/UP времена; глобальные часы и readonly live PaperWetness не заменяются. Display/drying остаются live. Foreign wet operation и chunk flush внутри scope явно запрещены.

Actual PointerInput с coalesced samples → исходные watercolor handlers записывает baseline. После изменения live paper/tool/layer replay тех же handlers с captured opts/IDs и cursor даёт целиком тот же Operation, включая packed geometry, pressure, wet и timestamp. Live paper сохраняет объект, record count и Float32 wet/pool rasters. MockGL означает CPU contract, а не GPU/pixel/UX proof.

Негативные проверки: неверный clock stage без fallback, чужой/уничтоженный владелец, throw handler, reentrant observer, callback установлен после capture перед DOWN/MOVE/UP. Последний rejected до handler/callback и изменения live модели. Ошибка инвалидирует packet и блокирует fresh Engine; finally восстанавливает контекст, **не откатывает scratch/log/GL**. Такой Engine следует уничтожить.

12 тестов wet replay/transcript/pointer admission PASS; app + service-worker TypeScript PASS. Runtime activation, foreign wash, GPU readset retention, fork→live merge и задержанный реальный input остаются HOLD.
