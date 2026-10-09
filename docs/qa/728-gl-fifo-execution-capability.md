# Синхронный executing-owner capability FIFO

Constructor opt-in `diagnosticExecutionCapability` по умолчанию false; включается только при `import.meta.env.DEV && requested === true`. Engine/query/runtime не подключены. Общие pending/ready/cancel контракты сохранены. OFF не создаёт capability/WeakMap.

Opaque object существует только внутри синхронного `ctx.advance`/`work.next`, связан private WeakMap с exact FIFO/head/epoch и отзывается finally до changed callback. `isSoleExecutingOwner` требует единственный request и отсутствие blocked. Во второй continuation создаётся новый token. Reentrant advance отвергается до замены witness. Это не разрешение reentrant Engine input: такой guard остаётся отдельным Engine prerequisite.

9/9 targeted tests PASS: 5 capability (valid/forged/foreign/expired, второй queued owner/blocked/cancel epoch, throw/reentrant, OFF, production request ignored без diagnostic allocation) и 4 прежних FIFO. Никаких GPU/материальной публикации/UX выводов. Runtime integration, future wet timestamps и immutable GPU ownership остаются HOLD.
