# Накопленная FIFO-поправка (default OFF)

База чистого source-rebase:4f01243afe80b4ee61d27a231a3579b89817ddbb; конец4bc1d68a. Patch:temp/async-fifo-cumulative.patch. Он содержит44c extraction, cdd/db ownership, e73 FIFO,9df confirmedpeer/structural,7ace livepeer/fence,bc gap тест. Не переносить ancestry d077/577/849/f109. Документы QA переносить отдельно.

Применять в отдельной существующей ветке rootf877/6f, сначала `git apply --check`; при несовпадениях переносить только этих owners/методов, не копировать весь index.ts. Root `_wcSourceFilmRebase=true`, baked/phase OFF и собственные UI/snapshot/closure изменения сохранить. `_wcAsyncFinish=false` сохранить.

Plan integration: prototype prepare аргументы заканчиваются preview(index10),skipZero(index11),finishMetadata(index12). Profiler owner gate должен быть index13 (14-й), не замещатьfinishMetadata. Из Engine forward ownerLocked только `_wcAsyncFinish && !!finishMetadata && _wcAsyncOwners.has(scratch)` из ownedfinish. Rootпрофильный Plan quantum patch отдельно, обязателен fixed-material oracle.

Перед defaultON остаются fixed material (P/C/V/coverage) на combinedsource, actualpeer/history/structural/loss, Surface quantum/backpressure и ACK-before-loss. Samsung7ace ordinary endpoints проверены сexplicitrebase=true в обеихarms; это не гарантия всех combined моделей.
