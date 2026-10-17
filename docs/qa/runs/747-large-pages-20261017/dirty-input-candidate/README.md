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
