# Readonly audit owned раннего preview

Проверена `728-solvent-init`, module revision35f93715, до завершения installer wiring. Исходники агента не менялись; аппаратные устройства не использовались. `owned-preview-readonly-audit.mjs` загружает точную сохранённую версию runtime через git-show и воспроизводит lifecycle с CPU fake-портами. Не считать этот аудит окончательным вердиктом более нового installer.

Подтверждённый положительный контракт: `SealedPreviewTransport.mjs:7–13` требует все8 source roles, семь distinct reserved destinations и отсутствие alias с source; `SealedPreviewGlPort.mjs:13–15` уменьшает только в reserved P/C/V/coverage. `OwnedPreviewRuntime.mjs:15–16` копирует readonly original в собственный pending и композитит только туда. В этих путях записи в canonical8 не найдены. `OwnedPreviewRuntime.mjs:18–19,30` detach проверяет exactpending identity и выполняется до retire/fence-release. Это static/CPU ownership proof, не hardware all-role parity.

## Приоритетные риски до wiring

1. **Утечка lease при отклонённом constructor.** `OwnedPreviewRuntime.mjs:24`: pool.take и `new SealedPreviewTransport` вне try. При отсутствующей readonly роли actual constructor бросает, но slot остаётся active. CPU reproduction: activeLeases1, затем disposeAfterFence бросает `Preview leases remain active`. Минимальный fix: scope take→constructor; до каких-либо GPU commands при failure вернуть unused lease, затем сообщить исходную ошибку. Testmissingrole/alias constructor must leave active0 and allow disposal without canonical mutations.

2. **Stale epoch не detach.** `OwnedPreviewRuntime.mjs:21`: filter исключает staleowner из eligible, но оставляет его pending в reveal и states; RAF продолжает планироваться. CPU reproduction: source.epoch increment without explicit beforeRebase сохраняет pending. Fix: defensivelyretire/detach всех staleowners до выбора eligible; afterdetach не выпускать physicalslot без fence. TestoldEpoch must not keep visible pending or execute transport; younger matching epoch unaffected.

3. **Context loss только прекращает tick.** Там же return при lostcontext не detach pending и не переводит state в retirement. CPU reproduction: held.pending stillattached, activeLease1. Installer должен гарантированно invoke lifecycle cancellation/detach on loss, даже если ни land, ни rebase больше не придёт. Testloss withsealedpending thencancel/dispose exactdetach/no enginepoolrelease/no GPUreuse; восстановленная новаяgeneration не получаетoldpending. Runtime-local defensive path также возможен, без попыток GL finish на lostcontext.

4. **Частичная ошибка factory после domain.** `OwnedPreviewRuntime.mjs:9–10`: cleanup защищает только createDomain; paperWorldSize/SealedPreviewGlPort/bind после успешного domain внезащищённого scope. Ошибка там может оставить prewarm21fields+shaderprogram. Addfactory try/finally transaction cleanup and testthrowpaper/invalidworld. Это source-inspection риск, отдельно от трёх исполненных CPU reproductions.

## Бounded scope и канал воды

Reserved pool =3*(6*128²*4+1024²*4)=13,762,560bytes, 21 textures. Retired slots сознательно не переиспользуются до общего disposal: максимум **три admission за сессию**, а не три одновременно активных с бесконечным рисованием. Fourth admission must be explicitly bounded QA refusal and must not silently allocate/reuse or leave canonical queue broken. Старый/newer owner cancellation route требуется проверить в actual installer before rebase, morph retirement/land, cancel/undo/rebuild, contextloss и disposal; на момент аудита эти вызовы ещё не wiring-proof.

`PreviewWaterDomain.mjs:4` R/A при A>.002 — support scalar, не толщина и не PaperWetness. `SealedPreviewGlPort.mjs:2,14` actual initialreduction — shipped mode0 **four samples**, не8×8area mean. Поэтому прежний CPUarea-average counterexample остаётся только иллюстрацией quantizationrisk; actual weak/sparse source128 binding/filter sampling должен отдельно проверяться. Threshold.002 пропускает минимальный Q8 A1/255: resultingR/A1 при reservoir dose4/255. Нельзя обозначить это fullphysicalwetness.

У audit payload только metadata: `temp/fast-watercolor-night/owned-preview-readonly-audit-35f.json`. No GPU timings, художественных выводов или runtime/model changes.
