# CPU-прототип ownership для будущего source (#728)

`node --test docs/qa/harness/728-future-source/transaction.test.mjs`

Не подключён к Engine. По умолчанию disabled. Семь CPU contract tests: immutable scalar record, старый composite до base/import/source, отдельный слой, stale callback/epoch, уничтоженный sampler, cancellation/loss, failed publication barrier и bounded admission. Используется небольшой resource/state oracle; это НЕ actual shader/Plan canonical P/C/V oracle. Нельзя считать его доказательством byte parity или улучшения задержки.

`resources` должны быть отдельно удержанными импортными базами/источниками. `immutable:true` — обязательство вызывающего capture, а не автоматическая проверка immutable texture content. В production adapter потребуется реальный retain/forget contract и snapshot imported base до уничтожения donor. `restoreImportedBase` воспроизводит base state перед dab; canonical rebase не должен превращаться в повторный deposit.

Budget overflow означает отказ следующего admission до input, а не потерю уже отправленного мазка. Не подключать к paint path без pre-admission budget и честного fallback. Следующая обязательная стадия — adapter на реальные scratch/Plan и oracle на тех же операторах с sequential и overlapping schedules; затем GPU fixed tape. Сейчас такой adapter отсутствует.
