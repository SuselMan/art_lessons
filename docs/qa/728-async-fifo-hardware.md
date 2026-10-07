# #728 — opt-in canonical FIFO: первые аппаратные проверки

Прототип e73a463e (последующие CPU-тестовые commits не меняют runtime), default OFF.
HOME runtime: `/home/suselman/projects/pencil-agents/680-water-wet-tone-qa`, порт5316.
Паспорт: index beb859d1315f56811cebe331260ff6d84e6a63d2944c6b65f35906a4177b409a;
Painter c9c876fb847b2d046f6eb622e588f30571801ba750dbee949a78f59b397ebc1f;
Scratch24210ad3fb76a8e25c76a6d6d25f6c2a4142d0c98df3889d504ba36750c14d54;
Plan3ae486debba23244d9adc204371f51e24cf8bc786e510aa549009c44fb996b68;
FIFO4b8970ec0f771093811e763b3ff269eb7c68b1908caf8d2baba99029bc46e9ee.

## Материал и канонический endpoint

На настоящей HOME Vega private-engine fixture640×480/brush400 принял три chunk.
Native и собственный checkpoint-free packed rebuild: wholeRGBA0/max0.
Три native prepare и три rebuild prepare имеют одинаковые full-channel hashes
и суммы P/C/V/coverage/stroke/base/dry полей. Ограниченные ROI сохранены байтами;
полные массивы используются для digest, но целиком на диск не записаны.
Всего9 непустых prepare stages (включая Redo),485 команд,GL0/lostfalse,
ошибок браузера нет. Synthetic input handler max9.9мс не является обычным Room
benchmark и не доказывает плавность.

Raw: `temp/history-parity/async-fifo-candidate/{report.json,material-comparison.json,summary.json,native.png,rebuild.png}`.
Немедленный контроль отдельно: `temp/history-parity/async-fifo-immediate/`.
Оба собственных Chrome закрыты finally.

## Обычный Room, PointerInput, UI история

Собственный custom board **3200×1000**, viewport1280×800, brush400,6 секунд,
coalesced2/rAF. Записаны8 естественных chunk одного strokeId.
UI Dry → Undo → Redo → новый engine того же участника:

- NativeDry/Redo/fresh PNG SHA c0ce193ff4daaa12a5a621f866e0ca657ed62ec6e6b07cbd785c7a1db4cd4a67.
- Непустых пикселей2358368; Undo полностью пустой.
- Журнал и identity exact; на всех этапахGL0/lostfalse.
- Active rAF max22мс,0 кадров>33мс; первые1.5с после pen-up max45мс,
  один кадр>33мс,0>100мс. Это одиночный ON прогон, не matched OFF/ON сравнение.

## Потеря контекста с очередью

Событие actual WEBGL_lose_context вызвано при19 pending requests,одном owner и
одном подтверждённом server ACK. Restore и fresh engine: PNG SHA
b9f84acf664ed4a161857a85561da522eed5a401563365264616e793c770af5d,
614482 непустых пикселя, journal/identity exact,GL0/lostfalse.
Подтверждённый префикс сохранён; незаписанный tail не объявляется сохранённым.

Raw обеих Room проверок:
`temp/history-parity/room-async-fifo/{report.json,summary.json,source-*.png,loss-*.png}`.
Все пути raw относятся к указанной HOME worktree. Chrome закрыт finally;
Vega передана следующей snapshot/reconnect проверке.

## Открытые гейты

Перед default ON нужны корректные peer presentation и принятие queued structural
операций до GPU выполнения, matched water400/pigment400→new-touch/rAF,
multi-peer/Dry/layer/history/snapshot ordering и ресурсные ограничения.
Peer-preview bypass исходного e73 — известный блокер, исправляется отдельно.
Текущий прототип не включён в production и не обещает гладкость на Samsung/Surface.

## Samsung: WC-scoped peer/structural revision 9df7dffe

The ordinary Room test used a physical 3200×1000 Fine board, an Adreno 650, eight natural loaded-400 chunks, then a new short gesture during the tail. Native Dry, Redo, and a separate fresh reader exported identical complete RGBA PNGs (0 changed pixels, max 0). Undo removed only the final short gesture; this test does not assert that the original long stroke disappeared. The fresh reader had a separate guest identity. GL remained 0; both owned targets 1309/1310 closed. Shader source did not change, and this run does not claim salted compilation.

Active rAF maximum was 50ms with 16 intervals over 33ms and none over 100ms; the tail maximum was 67ms. New input was accepted 83.6ms after lift and its handler took 18.1ms. These are measured responsiveness limits, not a smoothness PASS and not a matched OFF/ON pair.

Raw HOME artifacts: `/home/suselman/projects/pencil-agents/680-water-wet-tone-qa/temp/device-runs/samsung-async-room-fifo_1791331320800/` (`report.json`, `pigment-nativeDry.png`, `pigment-redo.png`, `pigment-fresh.png`). Index SHA was `dbcd4dafbb94acf61142294292c10f09912de102089374bc306e444bee785728` (see the raw passport for the authoritative SHA).

## Subsequent CPU-only peer/GPU-budget candidate

Foreign non-watercolor live packets receive a separate bounded presentation buffer while canonical execution is pending. Their original material application remains FIFO-owned and advances the painted watermark only when it actually executes. End, sequence gaps, resize, reset, and context loss detach presentation ownership. The shared 64MiB transient budget includes own and peer buffers. OFF behavior is unchanged.

The engine FIFO runner now fences each continuation with `gl.finish()` before measuring its existing slice budget. It stops immediately if a continuation starts a solver, the context is lost, or its epoch is cancelled. This bounds submission backlog but cannot subdivide an indivisible continuation that itself exceeds the budget. Hardware responsiveness and canonical parity for this subsequent candidate remain unverified; the Samsung result above belongs to 9df.

## 7ace fenced FIFO: Samsung corrected baseline

The first 7ace four-arm run inherited `_wcSourceFilmRebase=false` from this isolated prototype branch. Its pigment OFF native/Redo/fresh mismatch is the previously diagnosed source-film chronology defect, not a current-root regression. Preserve these original artifacts separately: `temp/device-runs/samsung-async-room-fifo_1791332033670/`. The original water comparisons are transparent after Dry and cannot prove solvent/material invariants. Do not use its timings as the comparison against the current rebase-enabled baseline.

The corrected run explicitly enabled sourceFilmRebase in BOTH native arms and recorded engine/queue flags: `temp/device-runs/samsung-async-room-fifo_1791332553950/` on VPS and HOME mirror. For each of pigment OFF and ON, native Dry versus Redo and versus fresh reader compared exactly in complete RGBA (0 changed pixels/max0, alpha0). This covers ordinary Room history endpoints; it does not assert checkpoint-free full material replay. All recorded phase GL checks were0, owned targets closed, and Adreno650 was confirmed.

| Native input case | Active rAF max | Next-touch handler | Next-touch after lift |
| --- | ---: | ---: | ---: |
| rebaseON, FIFO OFF |1070ms|842.3ms|1069.9ms|
| rebaseON, FIFO ON |50ms|21.9ms|100.3ms|

The realtime pointer generator uses rAF, so sampling counts and resulting chunk counts differ with responsiveness. This is an interactive script comparison, NOT a fixed packed-journal benchmark or a proof that all long-stroke workloads are smooth. A continuation that itself costs73ms remains indivisible despite a12ms fenced budget. Fixed-material and multi-peer tests remain required before enabling the prototype.

CPU follow-up:136 engine files/1498 tests passed;37 focused FIFO/peer/loss tests passed; an additional unknown/gapped-stream test passed with the14 async tests. The latter proves that fallback remains CPU-only during a pending solver and that reset admits a new gesture. Source passport: index `c6ea439968ebf0e6c1e5b0f00cbcbb356df80751cf8f9cfd35f61fbac9d52fe7`, FIFO `8ea5218dace6668c1eac49b871b91bfee66410e59a5badeb2c24939af927efc8`. Shader source was unchanged; no salted compilation is claimed in these runs.

## Surface: настоящий ввод после отрыва, 2026-10-07

Замороженный 7ace0530 на собственном HTTP5324, Intel Surface, Fine A4
1754×2480; standalone engine callbacks/rAF, не Room FPS. В обеих arms
sourceFilmRebase=true, phase/fibres=false; меняется только asyncFinish.
Гест: кисть400, плотный зигзаг6s с пересечением пространственного chunk,
20ms после отрыва, новый жест кистью100/500ms. Все4 arms записали3 stroke
operations, GL0/lost=false; собственные engines уничтожены finally.

| Прогон | Самый длинный active кадр | Самый длинный кадр нового жеста | Кадров нового жеста |
| --- | ---: | ---: | ---: |
| Вода OFF | 167.14ms | 699.9ms | 1 |
| Вода ON | 216.7ms | 17ms | 31 |
| Пигмент OFF | 166.2ms | 800.1ms | 1 |
| Пигмент ON | 216.6ms | 17ms | 31 |

FIFO устраняет блокировку следующего касания в этом сценарии, однако не
обеспечивает плавность всей работы: activeON содержит кадры>100ms,
pigmentON tail max166.6ms. Plan.prepare достигает77.4ms CPU. Дабы генерируются
по реальным rAF, поэтому OFF/ON имеют разные временные выборки: это сравнение
интерактивного сценария, не benchmark одинакового записанного журнала.

Первый fixture остановился по30s watchdog без сохранённых последних полей —
результат inconclusive, не доказательство deadlock. Исправленный120s idle
с5s progress capture завершил все4 arms. Контроллер напрямую вызывает Dry
без paper_dry operation; этот прогон не является доказательством replay parity.

Артефакты HOME: `680-water-wet-tone-qa/temp/surface-fifo/report-retry.json`,
`run-retry.log`, `phase-function.js`, `run.mjs`; копия report на VPS в
`680-device-qa-guards/temp/surface-fifo/report-retry.json`.
