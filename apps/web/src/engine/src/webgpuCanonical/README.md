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
