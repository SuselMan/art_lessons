# Straight presentation в фактическом engine compositor

Constructor/reader guards по-прежнему закрывают straight admission и canonical
pixel writers. Этот prerequisite подключает существующий display bridge;
активации room/editor, нового renderer/pool/cache или QA option нет.

LayerCompositor уже проводит owned straight tiles через
ctx.straightPresentation.withTile и затем обычный PM draw. Actual index теперь
передаёт getter текущего bridge. После успешного _initGL bridge использует тот
же _ribbonScratchPool и именно текущий _passes; при loss/destroy/init-start
доступ сбрасывается. Unpublished init rollback убирает только свой candidate.
Bridge сам не выделяет и не владеет GL storage: synchronous withTile сохраняет
существующие pool acquisition/release и state guards. Context restore создаёт
новые passes и новый bridge, не замыкает старые handles.

Публичные type-only exports CanonicalRecordedLifetime/Delivery/Input позволяют
net import из существующей engine boundary без private-path нарушения. Они не
добавляют runtime authority factory или payload API.

Tests-first actual createTestEngine:4 FAIL /1 PM PASS до wiring. Новый набор8
проверяет реальный _drawCompositeItem→actualcompositor→SAMEpool/currentpasses→PM
texture route, transform/display first exact errors + released acquisition,
неизменённый PM direct draw, actual loss/restore с новыми passes, отказ до pool
borrow при loss/failed restore и отсутствие bridge после destroy. Private
harness вставляет straight tile без открытия product admission; локально
дополняет отсутствующие state-observation методы shared MockGL. Это lifecycle
proof, не проверка GLSL пикселей.38tests/5files PASS с engine lifecycle,
tile-rebuild и presentation/sampling regressions. Lint0errors (исторические
index warnings), diff PASS. Final joint app+SW56868 PASS после исправления трёх test-only private
accesses на существующий bracket convention.

Устройство/сервисы/runtime/dependencies не запускались; временных ресурсов нет.
