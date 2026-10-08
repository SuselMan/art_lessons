# #728: первое звено WebGPU внутри существующего Room renderer

Принцип после understanding.yaml: CPU журнал и семантика Room остаются одними; GPU исполнитель меняется только на границе настоящего layer tile. Смена ресурсов не меняет математическую модель. Это patch primitive bridge, **не готовый WebGPU Room** и не включение модели автоматически.

## Reviewable code

- AccumulationBuffer.restoreCanvasPixels принимает dedicated raw canvas в настоящий texture слоя Room, сохраняет pixelStore/binding и инвалидирует mipmap. Размеры/storage равны; никакой бумаги или wet composite.
- CanonicalRoomTileBridge.copyByReadback: native field read→один rowflip(topnative→bottomGL)→существующий restorePixels. Все Q8 коды сохраняются в CPU преобразовании, включая RGB при alpha0.
- copyByCanvas: textureLoad raw native tile→rgba8unorm premultiplied WebGPU canvas→GLtexSubImage2D(canvas). DOMsource переворачивается один раз; premultiply=true и colorspaceNONE. Это candidate cross-API transfer, **не zero-copy claim**. Browser может unpremultiply/requantize или потерять hiddenRGBalpha0; аппаратный exact gate решает допустимость, fallback НЕ выбирается молча.
- Public DEV runCanonicalRoomTileBridgeDiagnostic(1024) создаёт native field и настоящий AccumulationBuffer; alternating readback/canvas/canvas/readback/readback/canvas, каждый transfer сравнивается с одинаковым bottomupRGBA. Размер4MiB, валидный premultiplied pattern, alpha0/lowalpha/255 и независимые XYchannels. Ориентация/alpha/maxdiff/GLerrors и wall transfer inclwait записаны. Синтетический тест не измеряет actualsource/progressive/final watercolor stage или real Room.

Root может собрать небольшой standalone entry, который вызывает public engine.runCanonicalRoomTileBridgeDiagnostic; первый hardware1024 gate должен сохранить все6comparisons и warm/coldwall samples. Источник fixture фиксирован; ownSurface толькопослегранта. ПокаactualGPU gate не запускался. TypedappPASS, rowcontract2testsPASS, oxlintPASS. Это не подтверждение canvas byteexact.

## Почему нельзя просто подставить boundedSceneFactory

Existing Room/index создаёт PencilEngine синхронно и сохраняет обычные настройки/camera/input/socket. PencilEngineAPI содержит layer tree/order/solo/eraserthrough, authoritative ACK, snapshots/checkpoints/historyrepair, undo/revoke/rebuild, peerpreview/pending/exports. Bounded runner имеет отдельный PaperWetness, fixed1024origin0target, serial busy admission и только watercolor replay. Он не исполняет pencil/erase/layerclear/transform/redo и не владеет currentRoomlogs. Подмена потребовала бы выдуманных no-op API и двух конкурирующих журналов.

## Минимальная честная вертикаль в обычном Room

1. Зафиксировать bridge1024 actual hardware byte/time. Если canvas не exact, измерить readbackupload; объявить выбранный transfer явно. Сравнение стоимости должно включатьfirstsource, actual150ms progressive andfinal boundaries. Если gain поглощён передачами — не advertise fastRoom.
2. Выделить native watercolor owner для **одного настоящего GLtile**; originalRGBA seed и каждый finish/preview возвращаются в тот жеGLlayer. Existing PencilEngine CPU PointerInput/DabSystem/delivery/scalars/oplog остаются владельцами. Перед следующей GLоперацией той жеплитки native drain обязателен; перед native берётся актуальный originalGLtile. Все промежуточные P/C/water/coverage остаютсяnative, не пересоздаются из finalRGBA междуwater→pigment.
3. Подключить DEV-only constructor watercolor renderer selection в PencilEngine, не новый canvas поверх Room. Перехватить три пути: live stroke chunks+finish, appendOperation historical/peer и _applyPixelOp rebuild. Checkpoint/restores/contextlost/clearlayer должны инвалидировать nativeowner generation; отмена asyncjob не создаёт pen-up/op. Любой неподдержанный путь явно прекращает эксперимент, а не рисует другим backend без предупреждения.
4. Первый допустимый scope: один layer/tile, оригинальныеpackedops, water→pigment/dry, затемpencilдо/послеnative, undo/redo всейцепочки, snapshot+reentry. Не объявлятьmultiuser/multitile/transform пока нет gates. Если input заjobблокируется, этоизвестноеUXограничение и измеряется отдельно.

Это несколько сопряжённых owner/lifecycle точек, а не несколько строк UI. CPU/source/model частично общие ужеесть; fieldownership/GLbridge/context-generation/rebuild glue ещёнужно реализовать. Complexities: pixeltransfer O(tilepixels) и~4MiB/1024boundary; nativefields O(roles×tilepixels); watercolor canonical schedule остаётсяпрежним. Multi-tile native delivery нельзяпродвигатьповторно (oneCPUdelivery acrossalltiles), paintercopies/snapshotcoverage должныпереноситьсябезпотери.

На этом patch runtime Room не переключается, production не меняется. Renderer selection допустим толькопослеstage gates; отсутствиеготовогоRoom не скрываетсязауспешнымprimitive bridge.
