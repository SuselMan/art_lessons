---
layer: engine-internals
summary: каноническая акварель WebGPU
issues: [728]
tags: [webgpu, акварель, эксперимент]
---
# Каноническая акварель WebGPU: перенос по этапам

Это native WebGPU backend для существующей модели, а не float PoC. CPU передаёт
готовые production vertices/uniforms. Бэкенд не вычисляет альтернативные дозы.

Первый этап: CanonicalWatercolorWebGpu.create(options), fields, baked paper/noise,
appendPreparedRibbon(batch), clear/readSnapshot/restoreSnapshot/whenIdle/destroy.
Перенесены RIBBON_VERT/FRAG и общий WC_NOISE_GLSL, 11-float vertices, coverage
premultiplied over и film ink/depth MAX либо add. После каждого raster pass поля
rgba8unorm. Noise — исходный offline asset251×251. Row0 — верх поля; glFragCoord
Y воспроизводится явно. Paper transform хранит исходные GL origin/texSize/scale.

Подготовка доз, тип наконечника, давление, wet/puddle/strength и ribbon geometry
остаются задачей production CPU preparer. Stamps/caps перенесены отдельным appendPreparedStamp: production DAB_VERT,
markerNibDistPx, inkMode6/7, plateau2, pressure hair, roundedBox/ellipse,
water/puddle/dose/tau и coverage clipping. Composite перенесён по inkMode9, включая tau prior, paperCatch, dry contact,
spread rings, density/transmittance, granulation, tide и premultiplied glaze.
Production profile migrate=0 проверяется; nonzero migrate отвергается.
Полный settle schedule ещё не перенесён. Метод settle() явно бросает ошибку: скрытой подмены
другой моделью нет. presentField(field) показывает сырые поля только для QA. compositeInto(original,out,uniforms)
создаёт настоящий layer result, present(out) показывает его. Canvas viewport
отдельный от field dimensions: options.viewportWidth/viewportHeight и resizeViewport.

Запуск первого этапа:

```
node node_modules/vite/bin/vite.js build --config apps/web/vite.webgpu-native.config.ts apps/web
node docs/qa/harness/728-webgpu-native/check.mjs
```

Диагностическая HTML — webgpu-native-stage.html; это не готовый Room.
На SwiftShader:2964 production vertices, GPU validation errors0,
nonzero bytes coverage25210/P33570/C32593. Actual WebGL RIBBON shader oracle
использует те же vertices/uniforms/lattice. Итог не побитный:
coverage208 отличных bytes(max11), P25(max2), C3(max1) из196608/поле.
Разница rasterization/blend precision ещё не локализована, не объявляется PASS
faithful parity. Smoke gate подтверждает только работоспособность GPU стадий.

Отдельный прежний Q8 brush порт также имеет known Surface difference3–5bytes;
его software exactness не подтверждает аппаратную эквивалентность.

Stamp actual WebGL DAB_FRAG oracle на том же fixture: coverage/P/C0отличных
bytes(max0), software only. Это один входной case, не аппаратное доказательство.

Composite actual unchanged WebGL inkMode9 oracle при тех же P/C/cov input:
0different bytes(max0) software fixture256×192, paper256×256 (POT repeat).
Это stage parity, не гарантия wholeRoom/replay/device equivalence.

## Контакт и команды владельца

brushContact(stepUV,gain,flowRectUV) переносит канонический Q8 P/C из одного
pre-contact состояния в два отдельных выхода и копирует обратно после pulse.
Flow/coverage sampling LINEAR, compact normalized flowRect соответствует GL.
Это отдельный literal port baseline brush shader, не float model.
Smoke: zero contact identity0, active contact158changed bytes, суммы всех восьми
каналов P/C изменились на0. Аппаратная эквивалентность contact пока не проверена.

Для реального CPU command tape использовать отдельные phases:
appendPreparedStamp(stamp,'coverage'|'pigment'|'color') и
appendPreparedRibbon(batch,'coverage'|'pigment'|'color'). Это сохраняет порядок
coverage→all pigment→all color и различия подготовленных аргументов, включая
puddle и pool. Default'all' — только удобство stage QA, не Room batching.
Single-phase и combined stamp в software fixture дают одинаковые bytes.

copyField(src,dst,encoder?) и copyRegion(src,dst,srcOrigin,dstOrigin,size,encoder?)
сохраняют Q8 напрямую, origins — integer world-top pixels.
clearField(field,rect?) очищает только заданный прямоугольник. Для command tape
encodeClearField(encoder,field,rect) возвращает transient buffers, которые caller
освобождает после queue completion. Copy/rectclear smoke byte mismatch0.
Все createField textures учитываются владельцем и удаляются в destroy.

## Реальное устройство

Root проверил предшествующий native stage на Samsung: GPU validation errors0,
но побитного совпадения с WebGL нет. Composite174different bytes(max1),
stamp coverage1164/P30/C7(max1), ribbon coverage47/P46/C5(max1).
Software exactness некоторых fixtures не подтверждает hardware exactness.
Поля water/flow в старом stage были нулевыми; это не тест целого watercolor Room.

## Завершение одного тайла и бумага

`CanonicalSingleTileFinish(backend, scratch, [tile]).encode(encoder, input)`
вызывается после настоящего `job.finish()` общего canonical planner. Input:
`settleComplete:true`, production `profile`, `opacity`, `fieldSeed`, `spreadPx`,
`water`, `bristleRadiusPx`, `settledGesture`, `materialGesture`, мировые `bounds`.
Выбор полей буквально соответствует `_finishRibbonStroke`: `original/coverage`,
`inkDry ?? inkLoad`, `colorDry ?? inkColor`; при более новом running film берутся
`inkLoad/inkColor`. `inkSettled/colorSettled` не подставляются вместо сухого
результата: это самостоятельные записи settle/remobilization. Сглаживание дозы
на finish равно нулю, прямоугольник имеет production floor−1/ceil+1 границы.
Caller отправляет общий encoder и освобождает возвращённые uniforms после GPU
completion; film release остаётся у planner/scratch owner.

`CanonicalDryPaperPresentation(backend).present(tile, {paperColor})` выводит
премультиплицированный слой над бумагой через существующую сухую формулу
`PAPER_COMPOSE_FRAG`: paper tone ±0.035, unpremultiply/clamp и graphite texture.
Stored layer не меняется. Это одна плитка на весь viewport, bilinear.
`wetPresentation`, rotation, sharp resample, desk/camera, многослойная сборка и
морфинг не реализованы; соответствующие опции отвергаются явно. Нельзя называть
этот вывод полной презентацией обычной Room.

Software finish fixture с ненулевым original и намеренно непригодными settled
base records: 4 отличных байта/max1 против настоящего WebGL composite,
вне finish bounds изменений0. Dry presentation против независимой CPU формулы:
max0. GPU validation errors0. Это проверка ресурсов/формулы, не доказательство
полной акварели или аппаратной эквивалентности.
