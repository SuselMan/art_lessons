# External candidate: conservative M70 input revisions

Не применён к runtime. База `df1b7fe9`; точные исходные и результирующие SHA256 находятся в manifest.json. Patch применяется штатным `git apply`; controller/index hunks нужно совместить с отдельным phase-owner candidate, не заменять файлы целиком.

AccumulationBuffer публикует монотонный contentRevision. Все существующие write paths через _invalidateMips увеличивают его до раннего выхода; public FBO getter увеличивает только proof revision и очищает uniform backing, не меняя mip/filter поведение. Утрата содержимого при idle-discard/forget/destroy также инвалидирует proof. Lossless residency evict/hydrate и чтение revision не меняют. Переполнение становится NaN и отключает оптимизацию.

Paged presentation сравнивает identity/revision шести raw planes, точную геометрию ROI и полную текущую host-render scalar signature. Только при известном неизменном proof повторная input presentation пропускается. Unknown revision, отсутствующий host signature, foreign donors/imports, новая/восстановленная tile state, deferred presentation или изменение глобальных scalar inputs сохраняют полный прежний путь. Нет Painter markers, GL getters/readbacks для fingerprint, shader/math/budget изменений. Canonical completion по-прежнему обрабатывает ВСЕ тайлы; пустой finish сохраняет context/dirty/request lifecycle.

## CPU evidence

- 24 tests PASS, Vitest 4.1.9, 2026-10-17: 10-tile retained gesture → одна изменённая tile; manual second write; water/pigment yield boundary; full fallback; empty finish; actual CPU capture/restore; global scalar signature; все 12 writer entry points с nonresident hydrate и последующим lossless eviction.
- Negative mutation отключает revision updates: manual-second-write test FAIL, сохранён в negative-proof.json. Это проверяет пропуск реального write, а не только совпадение счётчиков.
- Strict TypeScript для двух новых primitive/helper external copies PASS (`ES2022`, bundler, strict, erasableSyntaxOnly). External helper import направлен на external buffer; patch использует штатный import.
- `git apply --check dirty-input-revisions.patch` PASS на исходной рабочей копии.

Это CPU/mock-GL доказательство invalidation/retained-pixel поведения, не native rendering/Undo UI proof. После совместной интеграции обязательны runtime typecheck, существующие engine/undo/replay tests и native long-gesture actual-before-oracle comparison. Foreign fallback умышленно не оптимизирован.

## Production regression patch and lifecycle audit

`production-tests.patch` adds `apps/web/src/engine/src/watercolor/puddle/PagedPuddleRoomController.inputRevision.test.ts` with production imports only. Apply after the implementation patch; it does not reference external copies. Expanded suite: 26 PASS. No runtime source changed during preparation.

`complete()` renders solved material into state.goal and updates presentation targets. It does not replace the six raw scratch planes, state.raw, or input fingerprints. Therefore unchanged same-gesture raw proof remains valid after canonical completion: skipping a duplicate input presentation retains the existing solved target rather than inventing a new material delta. If completion/material code actually writes a raw plane, its contentRevision invalidates that proof. A dedicated regression calls complete→accept unchanged (no input re-render), then performs a same-gesture raw write (one tile re-render and exact changed bytes).

New gesture always changes scratch.gesture, part of the production signature; the regression uses the real signature callback and beginStroke→noteFinish to confirm all ten tiles re-render even with unchanged six-plane bytes. Deferred/resume and recreated tile states retain conservative fallback. The optimization does not replace the solver's complete pass or its global support coverage.
