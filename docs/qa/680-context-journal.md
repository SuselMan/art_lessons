# #680: операции, пришедшие при потерянном WebGL

Источник исправления `7e07e8d2`, поверх wet-overlay fix `74bc090c`.
Изолированный домашний стенд5307: `index.ts` SHA256
`93257e688b0bcbf201b684ba8793df33448320810e098a6ef409ecee4a626430`.
Модель, шейдеры и формат операций не изменены. Все девять production-настроек
принятой модели подтверждены в аппаратном passport.

## Воспроизведение

На старом74bc A потерял настоящий контекст в settle. В течение deliberate
3.5s lost interval B нарисовал новый native штрих. Он получил server ACK seq2
и уже был в журнале A, когда `gl.isContextLost()` всё ещё возвращал true.
Журнал сохранился, но после первого restore A получил133664 окрашенных
пикселя против48116 у B. Trace зарегистрировал bindTexture1282 и
bindFramebuffer1281 в WatercolorSettlePlan/WatercolorPasses/copyRegionInto.
Второй restore с Undo/Redo восстановил48116 пикселей. Старый run остановлен;
его нельзя считать успешным soak.

Причина: новый confirmed stroke и live preview продолжали запускать GL-путь
во lost interval. Очистка на событии loss уже прошла; промежуточные jobs и
ресурсы затем могли дожить до restore.

## Исправление

- При flag или фактическом GL loss append сохраняет ordered journal,
  undo/redo/revoke bookkeeping и local callback; paint/settle не запускается.
- Loss flag устанавливается до flush ранее отложенных операций.
- Confirmed preview не отбрасывается: callbacks коммитят его без проигрывания.
  Уже ожидающие preview timers/maps отцепляются до callbacks, включая
  reentrant commit. Ephemeral live packets во lost interval игнорируются.
- History/settle/display и начало нового собственного штриха не обращаются
  к недоступному GPU. Restore повторно забывает auxiliary и settle-plan
  handles и строит изображение из актуального журнала.

## Аппаратная проверка

Настоящая Vega: ANGLE AMD Radeon Graphics, radeonsi renoir ACO.
Один свой Chrome, два независимых auth contexts, новые комнаты. Реальный
WEBGL_lose_context, потеря подтверждена событием и actual GL state;
3.5s окно использовано только для явной проверки прихода нового ACKed stroke.
Никаких monkeypatch input/model/restore handler.

| Случай | Что подтверждено во lost interval | Результат |
| --- | --- | --- |
| Settle + arrival +5циклов restore/Undo/Redo | Новый seq2 уже в журнале A, pending=false, actual lost=true | 47983 пикселя, exact все5циклов и оба fresh server reader |
| Foreign import + arrival | Loss на yield auxiliary source при recipient0tiles; исходные seq1/2 ACKed; новый seq3 в A while lost | 50556 пикселей, exact restored и оба fresh reader |

После **всех** циклов собран полный bounded GL trace:0 faults; GL0 на каждом
контрольном этапе, контекст восстановлен. Полные операции клонировались через
JSON внутри страницы; перед final rejoin и после него journal одинаков.
Canonical1754×2480, alpha ненулевая до сравнения:

- strict soak SHA256 `f377b599edc0db89706fe4b5f8db77e38d39ff5e411634f67431673002b19160`;
- foreign SHA256 `c468f7d1908de1727c45db49f8bfc5bff981892048bb2dbf8a6d336e2172bb6c`.

Предварительный исправленный soak также прошёл, но его сохранённый trace
заканчивался до циклов. Для итогового oracle выполнен отдельный повтор,
собирающий finalFaults после всех5циклов; он прошёл. Проверка не опирается
только на getError, который tracing wrappers могли уже прочитать.

## Ресурсы и CPU

Strict soak: scratch live125829120 bytes до/после. Free59768832→63963136
после первого warmup; все5циклов оставались63963136. Field cache1,
replay chunks2, reveals0, peer previews0 до/после. Heap82.3→118.7MB без
принудительного GC, с инструментированием: это не доказательство отсутствия
JS leak и не основание объявить его наличие.

CPU:84 watercolor +3 journal tests PASS; после финального immediate preview
flush изменения focused3 PASS. Регрессии проверяют структуру/историю без
GL allocations/draws, confirmed preview commit, flag-before-queued-flush.
MockGL получил только стандартный isContextLost=false, который тест может
переключить. Actual app typecheck PASS; map:check942files PASS;
map:rules0errors/4известных warnings.

## Ограничения и артефакты

Это single-GPU проверка; Adreno cold compile и loss во время ещё
не записанного собственного пера не проверены. Остаточный native/packed
multichunk drift не подменяет fresh server journal oracle. PaperWet peak
после/fresh отличается по возрасту; в этих сценах не было Dry, поэтому это
не проверка корректности Dry/clear при loss. Эта ephemeral-water задача
исследуется отдельно и не включена в исправление.

Raw home: `680-context-journal/temp/context-loss/final-trace-soak/report.json`,
`fixed-arrival-foreign/report.json`, controller и logs. Предварительный run:
`fixed-arrival-settle-soak/report.json`. Старый failing source74bc:
`680-context-restore/temp/context-loss/arrival-settle-soak/report.json`.
Локальные копии: `680-context-restore/temp/context-loss/*-result.json`.
Все аппаратные runs завершили собственный Chrome в finally.
